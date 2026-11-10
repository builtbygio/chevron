'use strict';

const { CompositeDisposable } = require('chevron');
const { ipcRenderer } = require('electron');
const path = require('path');

const breakpoints = new Map();

function editorPath(editor) {
  const file = editor && editor.getPath && editor.getPath();
  return file || null;
}

function toggleBreakpoint() {
  const editor = chevron.workspace.getActiveTextEditor();
  const file = editorPath(editor);
  if (!editor || !file) return;
  const line = editor.getCursorBufferPosition().row + 1;
  const marks = breakpoints.get(file) || new Map();
  const existing = marks.get(line);
  if (existing) {
    existing.marker.destroy();
    marks.delete(line);
  } else {
    const marker = editor.markBufferPosition([line - 1, 0], { invalidate: 'never' });
    editor.decorateMarker(marker, { type: 'line-number', class: 'debug-breakpoint' });
    marks.set(line, { marker });
  }
  if (marks.size) breakpoints.set(file, marks);
  else breakpoints.delete(file);
}

function breakpointList() {
  const list = [];
  for (const [file, marks] of breakpoints) {
    for (const line of marks.keys()) list.push({ path: file, line });
  }
  return list;
}

module.exports = {
  activate() {
    this.disposables = new CompositeDisposable();
    this.session = null;
    this.panel = null;
    this.output = null;

    const commands = {
      'debug:toggle-breakpoint': () => toggleBreakpoint(),
      'debug:continue': () => this.resume(),
      'debug:step-over': () => this.command('next'),
      'debug:step-in': () => this.command('stepIn'),
      'debug:step-out': () => this.command('stepOut'),
      'debug:stop': () => this.stop()
    };
    this.disposables.add(chevron.commands.add('chevron-workspace', commands));
    this.disposables.add(chevron.commands.add('chevron-text-editor', {
      'debug:toggle-breakpoint': () => toggleBreakpoint()
    }));
    this.onDebugEvent = (_event, message) => this.onEvent(message);
    ipcRenderer.on('chevron:debug-event', this.onDebugEvent);
  },

  ensurePanel() {
    if (this.panel) return;
    const element = document.createElement('div');
    element.className = 'debug-panel';
    const bar = document.createElement('div');
    bar.className = 'debug-toolbar';
    for (const [label, command] of [
      ['Continue', 'debug:continue'],
      ['Step over', 'debug:step-over'],
      ['Step in', 'debug:step-in'],
      ['Step out', 'debug:step-out'],
      ['Stop', 'debug:stop']
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-sm';
      button.textContent = label;
      button.addEventListener('click', () => chevron.commands.dispatch(element, command));
      bar.appendChild(button);
    }
    this.output = document.createElement('pre');
    this.output.className = 'debug-output';
    element.appendChild(bar);
    element.appendChild(this.output);
    this.panel = chevron.workspace.addBottomPanel({ item: { element }, visible: false });
  },

  write(text) {
    this.ensurePanel();
    this.panel.show();
    this.output.textContent += text;
    this.output.scrollTop = this.output.scrollHeight;
  },

  async resume() {
    if (!this.session) return this.start();
    return this.command('continue');
  },

  async start() {
    const editor = chevron.workspace.getActiveTextEditor();
    const program = editorPath(editor);
    if (!program) {
      chevron.notifications.addWarning('Save the file before debugging it.');
      return;
    }
    if (!/\.(?:js|mjs|cjs)$/.test(program)) {
      chevron.notifications.addWarning('The debugger runs JavaScript files.');
      return;
    }
    this.ensurePanel();
    this.output.textContent = '';
    this.write(`Starting ${path.basename(program)}\n`);
    try {
      await ipcRenderer.invoke('chevron:debug-start', {
        program,
        breakpoints: breakpointList()
      });
      this.session = true;
    } catch (error) {
      this.session = null;
      this.write(String(error && error.message ? error.message : error) + '\n');
    }
  },

  async command(name, args) {
    if (!this.session) return;
    try {
      const body = await ipcRenderer.invoke('chevron:debug-request', {
        command: name,
        arguments: args || { threadId: 1 }
      });
      if (name === 'stackTrace' || name === 'variables' || name === 'scopes') return body;
      return body;
    } catch (error) {
      this.write(String(error && error.message ? error.message : error) + '\n');
    }
  },

  async onEvent(message) {
    if (!message || message.type !== 'event') return;
    this.ensurePanel();
    if (message.event === 'output' && message.body) {
      this.write(message.body.output || '');
      return;
    }
    if (message.event === 'stopped') {
      this.panel.show();
      const stack = await this.command('stackTrace', { threadId: 1 });
      const frame = stack && stack.stackFrames && stack.stackFrames[0];
      const lines = [`Stopped (${message.body && message.body.reason})\n`];
      if (stack && stack.stackFrames) {
        for (const item of stack.stackFrames) {
          if (!item.source || !item.source.path) continue;
          lines.push(`  ${item.name} ${item.source.path}:${item.line}\n`);
        }
      }
      if (frame) {
        const scopes = await this.command('scopes', { frameId: frame.id });
        const scope = scopes && scopes.scopes && scopes.scopes[0];
        if (scope && scope.variablesReference) {
          const vars = await this.command('variables', {
            variablesReference: scope.variablesReference
          });
          for (const variable of (vars && vars.variables) || []) {
            lines.push(`  ${variable.name} = ${variable.value}\n`);
          }
        }
        if (frame.source && frame.source.path) {
          await chevron.workspace.open(frame.source.path, {
            initialLine: Math.max(frame.line - 1, 0),
            initialColumn: Math.max((frame.column || 1) - 1, 0)
          });
        }
      }
      this.write(lines.join(''));
      return;
    }
    if (message.event === 'terminated' || message.event === 'exited') {
      this.session = null;
      this.write('Debug session ended.\n');
    }
  },

  async stop() {
    this.session = null;
    try {
      await ipcRenderer.invoke('chevron:debug-stop');
    } catch (_) {}
  },

  deactivate() {
    this.stop();
    if (this.onDebugEvent) {
      ipcRenderer.removeListener('chevron:debug-event', this.onDebugEvent);
    }
    if (this.panel) this.panel.destroy();
    this.disposables.dispose();
  }
};
