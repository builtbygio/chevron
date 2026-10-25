const { Emitter, CompositeDisposable } = require('chevron');
const { Terminal } = require('@xterm/xterm');
const { appendTranscript } = require('./transcript');

// A terminal pane item: an xterm view on one end, a pty session on the other.
//
// Nothing here spawns anything. `chevron.pty` is a data channel to the pty
// host, which is the only place that starts processes — see
// src/main-process/register-pty-ipc.js for why that boundary exists.

const CHARACTER_MEASURE = 'W';

class TerminalView {
  constructor({ cwd, shell, args, title, task, priorTranscript } = {}) {
    this.emitter = new Emitter();
    this.subscriptions = new CompositeDisposable();
    this.cwd = cwd;
    this.shell = shell;
    // A task runs one command rather than an interactive shell, and wants to
    // say which in the tab.
    this.args = args;
    this.title = title;
    // Identity of the task that opened this pane. Restored across reload so
    // the tab still says which task it was. Never used to run the command
    // again: a reload starts a fresh shell.
    this.task = task || null;
    this.transcript = '';
    this.session = null;
    this.exited = false;
    this.pendingInput = [];

    this.element = document.createElement('div');
    this.element.classList.add('chevron-terminal');
    this.element.tabIndex = -1;

    this.terminal = new Terminal({
      fontSize: chevron.config.get('terminal.fontSize') || 13,
      fontFamily: chevron.config.get('editor.fontFamily') || 'monospace',
      scrollback: chevron.config.get('terminal.scrollback') || 2000,
      cursorBlink: true,
      allowProposedApi: true
    });
    this.terminal.open(this.element);

    // The previous run's tail, then a fresh shell under it. The command is
    // not run again: the text is what survived, and the shell is a new one.
    if (priorTranscript) {
      const banner =
        '\r\n— reloaded; the previous run is above, this is a new shell —\r\n';
      this.remember(priorTranscript);
      this.remember(banner);
      this.terminal.write(priorTranscript);
      this.terminal.write(banner);
    }

    // Keystrokes reach the shell, not the editor's keymap.
    this.terminal.onData(data => this.write(data));

    this.subscriptions.add(
      chevron.config.onDidChange('terminal.fontSize', ({ newValue }) => {
        this.terminal.options.fontSize = newValue;
        this.fit();
      })
    );

    // The element has no size until it is in the DOM, and a terminal sized
    // 0x0 tells the shell its window is 0x0. Re-fit whenever the box changes.
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => this.fit());
      this.resizeObserver.observe(this.element);
    }

    this.start();
  }

  async start() {
    if (!chevron.pty || typeof chevron.pty.spawn !== 'function') {
      this.writeNotice('Terminals are unavailable: chevron.pty is not published.');
      return;
    }
    const size = this.measure();
    try {
      this.session = await chevron.pty.spawn({
        shell: this.shell || chevron.config.get('terminal.shell') || undefined,
        args: this.args,
        cwd: this.cwd,
        cols: size.cols,
        rows: size.rows
      });
    } catch (error) {
      // Main refuses a shell it cannot find, or a cwd outside every project
      // root. Saying which beats an empty black rectangle.
      this.writeNotice(`Could not start a terminal: ${error.message}`);
      this.emitter.emit('did-exit', { exitCode: null, signal: 'spawn-failed' });
      return;
    }

    this.session.onData(data => {
      this.remember(data);
      this.terminal.write(data);
    });
    this.session.onExit(({ exitCode, signal }) => {
      this.exited = true;
      this.writeNotice(
        signal
          ? `\r\n[process ended: ${signal}]`
          : `\r\n[process exited with ${exitCode}]`
      );
      this.emitter.emit('did-exit', { exitCode, signal });
    });

    for (const data of this.pendingInput) this.session.write(data);
    this.pendingInput = [];
    this.emitter.emit('did-start', this.session);
    this.fit();
  }

  write(data) {
    if (this.exited) return;
    // Typing before the shell has started is normal on a slow spawn; keep it
    // rather than dropping it on the floor.
    if (!this.session) {
      this.pendingInput.push(data);
      return;
    }
    this.session.write(data);
  }

  remember(chunk) {
    if (!this.task) return;
    this.transcript = appendTranscript(this.transcript, chunk);
  }

  writeNotice(text) {
    const line = text.endsWith('\n') ? text : `${text}\r\n`;
    this.remember(line);
    this.terminal.write(line);
  }

  // Columns and rows that fit the element, worked out from one character.
  measure() {
    const fontSize = this.terminal.options.fontSize || 13;
    const probe = document.createElement('span');
    probe.style.cssText =
      `position:absolute;visibility:hidden;font-size:${fontSize}px;` +
      `font-family:${this.terminal.options.fontFamily || 'monospace'};`;
    probe.textContent = CHARACTER_MEASURE;
    this.element.appendChild(probe);
    const charWidth = probe.getBoundingClientRect().width || fontSize * 0.6;
    const charHeight = probe.getBoundingClientRect().height || fontSize * 1.2;
    probe.remove();

    const rect = this.element.getBoundingClientRect();
    const cols = Math.max(2, Math.floor((rect.width || 640) / charWidth));
    const rows = Math.max(2, Math.floor((rect.height || 320) / charHeight));
    return { cols, rows };
  }

  fit() {
    const { cols, rows } = this.measure();
    if (cols === this.lastCols && rows === this.lastRows) return;
    this.lastCols = cols;
    this.lastRows = rows;
    try {
      this.terminal.resize(cols, rows);
    } catch (error) {
      return;
    }
    if (this.session) this.session.resize(cols, rows);
  }

  focus() {
    this.terminal.focus();
  }

  onDidStart(callback) {
    return this.emitter.on('did-start', callback);
  }

  onDidExit(callback) {
    return this.emitter.on('did-exit', callback);
  }

  // Pane item contract.
  getTitle() {
    return this.title || 'Terminal';
  }

  getIconName() {
    return 'terminal';
  }

  getDefaultLocation() {
    return 'bottom';
  }

  getAllowedLocations() {
    return ['bottom', 'center', 'left', 'right'];
  }

  getURI() {
    return 'chevron://terminal';
  }

  getElement() {
    return this.element;
  }

  serialize() {
    // Deliberately not serialising the session: a pty does not survive a
    // reload, and a restored pane pretending it did would be a lie. A task
    // pane keeps its name and the tail of what it already printed, and
    // comes back as a fresh shell in the same directory. The command is
    // not stored as something to run.
    const state = {
      deserializer: 'TerminalView',
      cwd: this.cwd,
      title: this.title
    };
    if (this.task) {
      state.task = this.task;
      state.transcript = this.transcript || '';
    }
    return state;
  }

  destroy() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.subscriptions.dispose();
    if (this.session) this.session.kill();
    this.terminal.dispose();
    this.element.remove();
    this.emitter.emit('did-destroy');
  }

  onDidDestroy(callback) {
    return this.emitter.on('did-destroy', callback);
  }
}

module.exports = TerminalView;
