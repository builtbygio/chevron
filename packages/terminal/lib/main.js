const { CompositeDisposable } = require('chevron');
const TerminalView = require('./terminal-view');

const TERMINAL_URI = 'chevron://terminal';

// Panes, commands and lifecycle -- the layer the plan says to write rather
// than adopt (docs/process/next-tracks-plan.md, track 3). Emulation is
// xterm.js and the pty is node-pty; neither is reimplemented here.

module.exports = {
  activate() {
    this.subscriptions = new CompositeDisposable();
    this.terminals = new Set();

    this.subscriptions.add(
      chevron.workspace.addOpener(uri => {
        if (uri !== TERMINAL_URI) return undefined;
        return this.createTerminal();
      })
    );

    this.subscriptions.add(
      chevron.commands.add('atom-workspace', {
        'terminal:open': () => this.open(),
        'terminal:toggle': () => this.toggle()
      })
    );

    this.subscriptions.add(
      chevron.commands.add('.chevron-terminal', {
        'terminal:close': event => {
          const view = this.viewForElement(event.target);
          if (view) chevron.workspace.paneForItem(view).destroyItem(view);
        }
      })
    );
  },

  deactivate() {
    for (const view of [...this.terminals]) view.destroy();
    this.terminals.clear();
    this.subscriptions.dispose();
  },

  // A terminal opens where the work is: the project root containing the
  // active file, or the first root. Somewhere the pty host will accept.
  cwdForActiveEditor() {
    const editor = chevron.workspace.getActiveTextEditor();
    const filePath = editor && editor.getPath();
    const roots = chevron.project.getPaths();
    if (filePath) {
      const owning = roots
        .filter(root => filePath === root || filePath.startsWith(root + require('path').sep))
        .sort((a, b) => b.length - a.length)[0];
      if (owning) return owning;
    }
    return roots[0] || require('os').homedir();
  },

  createTerminal() {
    const view = new TerminalView({ cwd: this.cwdForActiveEditor() });
    this.terminals.add(view);
    view.onDidDestroy(() => this.terminals.delete(view));
    return view;
  },

  viewForElement(element) {
    for (const view of this.terminals) {
      if (view.element.contains(element) || view.element === element) return view;
    }
    return null;
  },

  async open() {
    const view = await chevron.workspace.open(TERMINAL_URI, {
      searchAllPanes: false
    });
    if (view && view.focus) view.focus();
    return view;
  },

  async toggle() {
    const existing = chevron.workspace
      .getPaneItems()
      .filter(item => item instanceof TerminalView);
    if (existing.length > 0) {
      const pane = chevron.workspace.paneForItem(existing[0]);
      pane.destroyItem(existing[0]);
      return null;
    }
    return this.open();
  },

  deserializeTerminalView(state = {}) {
    // A pty does not survive a reload; this restores a fresh shell in the
    // directory the old one was in.
    const view = new TerminalView({ cwd: state.cwd });
    this.terminals.add(view);
    view.onDidDestroy(() => this.terminals.delete(view));
    return view;
  }
};
