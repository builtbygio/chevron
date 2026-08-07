'use strict';

/**
 * utilityProcess entry for github package git workers (Phase S3 / #61).
 *
 * Pure Node (no DOM). Speaks the same logical protocol as lib/worker.js:
 *   inbound:  { type: 'init'|'git-exec'|'git-cancel'|'shutdown', ... }
 *   outbound: { type: 'renderer-ready'|'git-data'|... , data?, sourceWebContentsId? }
 *
 * Main process owns process lifecycle and bridges messages to the manager renderer.
 */

const path = require('path');

let GitProcess = null;
let treeKill = null;
let initConfig = null;
let operationCountLimit = 10;
const childPidsById = new Map();

class AverageTracker {
  constructor({ limit } = { limit: 10 }) {
    this.limit = limit;
    this.sum = 0;
    this.values = [];
  }

  addValue(value) {
    if (this.values.length >= this.limit) {
      const discardedValue = this.values.shift();
      this.sum -= discardedValue;
    }
    this.values.push(value);
    this.sum += value;
  }

  getAverage() {
    if (this.values.length === this.limit) return this.sum / this.limit;
    return null;
  }

  enoughData() {
    return this.values.length === this.limit;
  }
}

let averageTracker = new AverageTracker({ limit: 10 });

function post(msg) {
  if (process.parentPort && typeof process.parentPort.postMessage === 'function') {
    process.parentPort.postMessage(msg);
  } else if (typeof process.send === 'function') {
    // Fallback for node:child_process fork in tests
    process.send(msg);
  }
}

function resolveFromApp(moduleId) {
  const appPath = process.env.CHEVRON_APP_PATH || '';
  const searchPaths = [
    path.join(appPath, 'node_modules', 'github', 'node_modules'),
    path.join(appPath, 'node_modules'),
    ...module.paths
  ].filter(Boolean);
  return require.resolve(moduleId, { paths: searchPaths });
}

function ensureDeps() {
  if (!GitProcess) {
    const dugitePath = resolveFromApp('dugite');
    ({ GitProcess } = require(dugitePath));
  }
  if (!treeKill) {
    try {
      treeKill = require(resolveFromApp('tree-kill'));
    } catch (error) {
      // Cancel becomes best-effort without tree-kill
      treeKill = null;
    }
  }
}

function handleInit(msg) {
  initConfig = {
    managerWebContentsId: msg.managerWebContentsId,
    channelName: msg.channelName || 'github:renderer-ipc',
    syntheticWebContentsId: msg.syntheticWebContentsId
  };
  operationCountLimit = parseInt(msg.operationCountLimit, 10) || 10;
  averageTracker = new AverageTracker({ limit: operationCountLimit });
  ensureDeps();
  post({
    type: 'renderer-ready',
    sourceWebContentsId: initConfig.syntheticWebContentsId,
    data: { pid: process.pid }
  });
}

function handleGitExec(data) {
  ensureDeps();
  const { args, workingDir, options = {}, id } = data || {};
  const spawnStart = Date.now();
  let spawnEnd = spawnStart;

  const execOptions = Object.assign({}, options);
  execOptions.processCallback = child => {
    if (child && child.pid != null) {
      childPidsById.set(id, child.pid);
    }
    if (child && typeof child.on === 'function') {
      child.on('error', err => {
        post({
          type: 'git-spawn-error',
          sourceWebContentsId: initConfig.syntheticWebContentsId,
          data: {
            id,
            err: serializeError(err)
          }
        });
      });
    }
  };

  spawnEnd = Date.now();
  averageTracker.addValue(spawnEnd - spawnStart);

  GitProcess.exec(args, workingDir, execOptions)
    .then(({ stdout, stderr, exitCode }) => {
      childPidsById.delete(id);
      post({
        type: 'git-data',
        sourceWebContentsId: initConfig.syntheticWebContentsId,
        data: {
          id,
          average: averageTracker.getAverage(),
          results: {
            stdout,
            stderr,
            exitCode,
            timing: {
              spawnTime: spawnEnd - spawnStart,
              execTime: Date.now() - spawnEnd
            }
          }
        }
      });
    })
    .catch(err => {
      childPidsById.delete(id);
      post({
        type: 'git-data',
        sourceWebContentsId: initConfig.syntheticWebContentsId,
        data: {
          id,
          average: averageTracker.getAverage(),
          results: {
            stdout: err.stdout,
            stderr: err.stderr,
            exitCode: err.code,
            signal: err.signal,
            timing: {
              spawnTime: spawnEnd - spawnStart,
              execTime: Date.now() - spawnEnd
            }
          }
        }
      });
    });

  if (averageTracker.enoughData() && averageTracker.getAverage() > 20) {
    post({
      type: 'slow-spawns',
      sourceWebContentsId: initConfig.syntheticWebContentsId
    });
  }
}

function serializeError(err) {
  if (!err) return { message: 'unknown error' };
  return {
    message: err.message,
    stack: err.stack,
    fileName: err.fileName,
    lineNumber: err.lineNumber
  };
}

function handleGitCancel(data) {
  const id = data && data.id;
  const childPid = childPidsById.get(id);
  if (childPid === undefined) return;

  const done = () => {
    childPidsById.delete(id);
    post({
      type: 'git-cancelled',
      sourceWebContentsId: initConfig.syntheticWebContentsId,
      data: { id, childPid }
    });
  };

  if (treeKill) {
    treeKill(childPid, 'SIGINT', () => done());
  } else {
    try {
      process.kill(childPid, 'SIGINT');
    } catch (error) {
      /* ignore */
    }
    done();
  }
}

function onMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  switch (msg.type) {
    case 'init':
      handleInit(msg);
      break;
    case 'git-exec':
      handleGitExec(msg.data);
      break;
    case 'git-cancel':
      handleGitCancel(msg.data);
      break;
    case 'shutdown':
      process.exit(0);
      break;
    default:
      post({
        type: 'host-error',
        data: { message: `Unknown message type: ${msg.type}` }
      });
  }
}

function attach() {
  if (process.parentPort && typeof process.parentPort.on === 'function') {
    process.parentPort.on('message', event => {
      onMessage(event && event.data !== undefined ? event.data : event);
    });
  } else if (typeof process.on === 'function') {
    process.on('message', onMessage);
  }
  // Ready for parent to send init (not the same as renderer-ready).
  post({ type: 'host-booted', data: { pid: process.pid } });
}

attach();

// Export for unit tests
module.exports = {
  onMessage,
  handleInit,
  handleGitExec,
  handleGitCancel,
  AverageTracker
};
