'use strict';

/**
 * Debug Adapter Protocol for a Node program.
 *
 * The editor speaks DAP. This process launches the program under
 * `--inspect-brk` and translates the Chrome DevTools protocol. It is forked
 * by the main process (or by a test) and never chosen by the renderer.
 */

const { spawn } = require('child_process');
const { pathToFileURL, fileURLToPath } = require('url');

const THREAD = 1;

let cdp = null;
let child = null;
let callFrames = [];
let varRefs = new Map();
let nextRef = 1;
let breakpointIds = new Map();
let launched = false;
let stopOnEntry = false;
let skipEntryPause = true;

function post(message) {
  if (process.parentPort && typeof process.parentPort.postMessage === 'function') {
    process.parentPort.postMessage(message);
  } else if (typeof process.send === 'function') {
    process.send(message);
  }
}

function respond(request, body, success = true, message) {
  post({
    type: 'response',
    request_seq: request.seq,
    success,
    command: request.command,
    message,
    body: body || {}
  });
}

function emit(name, body) {
  post({ type: 'event', event: name, body: body || {} });
}

function escapeRegExp(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function resetPause() {
  callFrames = [];
  varRefs = new Map();
  nextRef = 1;
}

function alloc(objectId) {
  if (!objectId) return 0;
  const id = nextRef++;
  varRefs.set(id, objectId);
  return id;
}

function waitForInspectorUrl(stream) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => {
      reject(new Error('inspector did not start\n' + buf));
    }, 8000);
    const onData = chunk => {
      buf += chunk.toString();
      const match = buf.match(/ws:\/\/127\.0\.0\.1:\d+\/[0-9a-f-]+/i);
      if (!match) return;
      clearTimeout(timer);
      stream.off('data', onData);
      resolve({ url: match[0], rest: buf });
    };
    stream.on('data', onData);
  });
}

function messageText(data) {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data && typeof data.text === 'function') return data.text();
  return String(data);
}

function connectInspector(wsUrl) {
  return new Promise((resolve, reject) => {
    const WS = global.WebSocket;
    if (typeof WS !== 'function') {
      reject(new Error('this Node has no WebSocket'));
      return;
    }
    const ws = new WS(wsUrl);
    let nextId = 0;
    const pending = new Map();
    const listeners = [];
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('inspector connection timed out'));
    }, 8000);

    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve({
        send(method, params) {
          const id = ++nextId;
          return new Promise((res, rej) => {
            pending.set(id, { res, rej });
            ws.send(JSON.stringify({ id, method, params: params || {} }));
          });
        },
        on(fn) {
          listeners.push(fn);
        },
        close() {
          try {
            ws.close();
          } catch (_) {}
        }
      });
    });

    ws.addEventListener('message', async event => {
      let text;
      try {
        text = await messageText(event.data);
        const msg = JSON.parse(text);
        if (msg.id && pending.has(msg.id)) {
          const waiter = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) waiter.rej(new Error(msg.error.message || 'inspector error'));
          else waiter.res(msg.result || {});
        } else if (msg.method) {
          for (const fn of listeners) fn(msg);
        }
      } catch (error) {
        emit('output', { category: 'stderr', output: String(error.message || error) + '\n' });
      }
    });

    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('inspector connection failed'));
    });
  });
}

function framePath(frame) {
  const scriptUrl = frame && frame.location && frame._url;
  if (!scriptUrl) return '';
  try {
    return fileURLToPath(scriptUrl);
  } catch (_) {
    return '';
  }
}

function onPaused(params) {
  const reason = params.reason || '';
  if (skipEntryPause && !stopOnEntry && (reason === 'Break on start' || reason === 'entry')) {
    skipEntryPause = false;
    cdp.send('Debugger.resume').catch(error => {
      emit('output', { category: 'stderr', output: String(error.message || error) + '\n' });
    });
    return;
  }
  skipEntryPause = false;
  callFrames = (params.callFrames || []).map(frame => {
    const copy = Object.assign({}, frame);
    copy._url = cdp.scripts.get(frame.location && frame.location.scriptId) || '';
    return copy;
  });
  varRefs = new Map();
  nextRef = 1;
  emit('stopped', {
    reason: params.reason === 'other' ? 'breakpoint' : params.reason || 'breakpoint',
    threadId: THREAD
  });
}

async function replaceBreakpoints(file, lines) {
  const previous = breakpointIds.get(file) || [];
  for (const id of previous) {
    try {
      await cdp.send('Debugger.removeBreakpoint', { breakpointId: id });
    } catch (_) {}
  }
  const ids = [];
  const verified = [];
  const url = pathToFileURL(file).href;
  for (const line of lines) {
    try {
      const result = await cdp.send('Debugger.setBreakpointByUrl', {
        urlRegex: '^' + escapeRegExp(url) + '$',
        lineNumber: line - 1,
        columnNumber: 0
      });
      if (result.breakpointId) ids.push(result.breakpointId);
      verified.push({ verified: true, line });
    } catch (_) {
      verified.push({ verified: false, line });
    }
  }
  breakpointIds.set(file, ids);
  return verified;
}

async function launch(program, args) {
  if (launched) throw new Error('already launched');
  launched = true;
  stopOnEntry = !!(args && args.stopOnEntry);
  child = spawn(
    process.execPath,
    ['--inspect-brk=127.0.0.1:0', program],
    {
      cwd: require('path').dirname(program),
      env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' }),
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  child.stdout.on('data', chunk => {
    emit('output', { category: 'stdout', output: chunk.toString() });
  });
  let inspectorReady = false;
  child.stderr.on('data', chunk => {
    if (inspectorReady) {
      emit('output', { category: 'stderr', output: chunk.toString() });
    }
  });
  child.on('exit', code => {
    emit('terminated', {});
    emit('exited', { exitCode: code == null ? 1 : code });
  });

  const found = await waitForInspectorUrl(child.stderr);
  inspectorReady = true;
  cdp = await connectInspector(found.url);
  cdp.scripts = new Map();
  cdp.on(message => {
    if (message.method === 'Debugger.scriptParsed') {
      cdp.scripts.set(message.params.scriptId, message.params.url || '');
    } else if (message.method === 'Debugger.paused') {
      onPaused(message.params);
    } else if (message.method === 'Debugger.resumed') {
      emit('continued', { threadId: THREAD });
    }
  });
  await cdp.send('Debugger.enable');
  await cdp.send('Runtime.enable');
}

async function dispatch(request) {
  const args = request.arguments || {};
  switch (request.command) {
    case 'initialize':
      respond(request, {
        supportsConfigurationDoneRequest: true
      });
      return;
    case 'launch':
      await launch(args.program, args);
      respond(request, {});
      emit('initialized', {});
      return;
    case 'setBreakpoints': {
      const file = args.source && args.source.path;
      const lines = (args.breakpoints || []).map(bp => bp.line).filter(line => line > 0);
      if (!cdp) throw new Error('debugger is not connected');
      const breakpoints = await replaceBreakpoints(file, lines);
      respond(request, { breakpoints });
      return;
    }
    case 'configurationDone':
      await cdp.send('Runtime.runIfWaitingForDebugger');
      respond(request, {});
      return;
    case 'threads':
      respond(request, { threads: [{ id: THREAD, name: 'main' }] });
      return;
    case 'stackTrace':
      respond(request, {
        stackFrames: callFrames.map((frame, index) => ({
          id: index,
          name: frame.functionName || '(anonymous)',
          line: (frame.location.lineNumber || 0) + 1,
          column: (frame.location.columnNumber || 0) + 1,
          source: { path: framePath(frame) }
        }))
      });
      return;
    case 'scopes': {
      const frame = callFrames[args.frameId] || callFrames[0];
      const scopes = ((frame && frame.scopeChain) || []).map(scope => ({
        name: scope.type || 'scope',
        variablesReference: alloc(scope.object && scope.object.objectId),
        expensive: false
      }));
      respond(request, { scopes });
      return;
    }
    case 'variables': {
      const objectId = varRefs.get(args.variablesReference);
      if (!objectId) {
        respond(request, { variables: [] });
        return;
      }
      const props = await cdp.send('Runtime.getProperties', {
        objectId,
        ownProperties: true
      });
      const variables = (props.result || [])
        .filter(prop => prop.name !== '__proto__')
        .slice(0, 100)
        .map(prop => ({
          name: prop.name,
          value: prop.value ? prop.value.description || String(prop.value.value) : '',
          variablesReference: prop.value && prop.value.objectId ? alloc(prop.value.objectId) : 0
        }));
      respond(request, { variables });
      return;
    }
    case 'continue':
      resetPause();
      await cdp.send('Debugger.resume');
      respond(request, { allThreadsContinued: true });
      return;
    case 'next':
      resetPause();
      await cdp.send('Debugger.stepOver');
      respond(request, {});
      return;
    case 'stepIn':
      resetPause();
      await cdp.send('Debugger.stepInto');
      respond(request, {});
      return;
    case 'stepOut':
      resetPause();
      await cdp.send('Debugger.stepOut');
      respond(request, {});
      return;
    case 'pause':
      await cdp.send('Debugger.pause');
      respond(request, {});
      return;
    case 'disconnect':
      try {
        if (cdp) await cdp.send('Debugger.disable');
      } catch (_) {}
      if (child) child.kill('SIGKILL');
      if (cdp) cdp.close();
      respond(request, {});
      return;
    default:
      respond(request, {}, false, `unknown command ${request.command}`);
  }
}

function onMessage(message) {
  if (!message || message.type !== 'request') return;
  Promise.resolve(dispatch(message)).catch(error => {
    respond(message, {}, false, error && error.message ? error.message : String(error));
  });
}

function start() {
  if (process.parentPort && typeof process.parentPort.on === 'function') {
    process.parentPort.on('message', event => {
      onMessage(event && event.data !== undefined ? event.data : event);
    });
  } else {
    process.on('message', onMessage);
  }
}

if (require.main === module) start();

module.exports = { start, escapeRegExp };
