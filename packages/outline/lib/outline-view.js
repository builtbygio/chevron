const { CompositeDisposable, Emitter } = require('chevron');
const { fromSymbols, fromFolds, pathAt } = require('./outline-tree');

const OUTLINE_URI = 'chevron://outline';

// The active file's structure, as a dock item.
//
// One view for the active editor, as with breadcrumbs: the outline answers
// "what is in the file I am looking at". Symbols come from the language
// server when one owns the file, and from the grammar's folds otherwise, so a
// file with no server running still has an outline.
//
// Nothing is computed while the panel is hidden. Changes only mark it stale,
// and it catches up when it is shown again.
//
// docs/reference/code-context.md
class OutlineView {
  constructor() {
    this.emitter = new Emitter();
    this.element = document.createElement('div');
    this.element.classList.add('outline-panel');
    this.element.tabIndex = -1;

    this.status = document.createElement('div');
    this.status.classList.add('outline-status');
    this.list = document.createElement('ul');
    this.list.classList.add('outline-tree', 'list-tree');
    this.list.setAttribute('role', 'tree');
    this.element.append(this.status, this.list);

    this.cache = new chevron.enclosingScopes.FoldableRangeCache();
    this.collapsedByFile = new Map();
    this.rows = new Map();
    this.tree = [];
    this.source = null;
    this.selectedKey = null;
    this.editor = null;
    this.generation = 0;
    this.visible = false;
    this.stale = true;
    this.refreshTimer = null;
    this.selectionFrame = null;

    this.list.addEventListener('click', event => this.didClick(event));

    // Hidden covers a closed dock, another item's tab in front, and a dock
    // collapsed to nothing. All three are "not intersecting".
    this.visibilityObserver = new IntersectionObserver(entries => {
      const visible = entries[entries.length - 1].isIntersecting;
      if (visible === this.visible) return;
      this.visible = visible;
      if (!visible) return;
      if (this.stale) this.scheduleRefresh();
      else this.updateSelection();
    });
    this.visibilityObserver.observe(this.element);

    this.subscriptions = new CompositeDisposable(
      chevron.workspace.observeActiveTextEditor(editor => this.watch(editor))
    );
  }

  watch(editor) {
    editor = editor || null;
    if (editor === this.editor) return this.scheduleRefresh();
    if (this.editorSubscriptions) this.editorSubscriptions.dispose();
    this.editorSubscriptions = new CompositeDisposable();
    this.editor = editor;

    // Another file's tree must not stay on screen while this one's is asked
    // for; a server can take seconds on first contact.
    this.generation++;
    this.show([], null, { pending: Boolean(editor) });

    if (editor) {
      const changed = () => {
        this.cache.invalidate(editor);
        this.scheduleRefresh();
      };
      this.editorSubscriptions.add(
        editor.onDidStopChanging(changed),
        editor.onDidChangeGrammar(changed),
        editor.onDidChangePath(changed),
        editor.onDidChangeCursorPosition(() => this.scheduleSelection())
      );
    }
    this.scheduleRefresh();
  }

  scheduleRefresh() {
    this.stale = true;
    if (!this.visible) return;
    // A tick late, so the document sync's own stop-changing handler has sent
    // the server the edit before the server is asked about it.
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refresh(), 0);
  }

  async refresh() {
    this.stale = false;
    const editor = this.editor;
    const generation = ++this.generation;
    if (!editor) return this.show([], null);

    const lsp = chevron.lsp;
    if (
      lsp &&
      typeof lsp.documentSymbolTreeAt === 'function' &&
      typeof lsp.getServerIdForEditor === 'function' &&
      lsp.getServerIdForEditor(editor)
    ) {
      let symbols = [];
      try {
        symbols = await lsp.documentSymbolTreeAt(editor);
      } catch (error) {
        symbols = [];
      }
      if (generation !== this.generation) return;
      if (symbols.length > 0) return this.show(fromSymbols(symbols), 'symbols');
    }

    this.show(
      fromFolds(
        this.cache.get(editor),
        row => editor.lineTextForBufferRow(row),
        chevron.enclosingScopes.labelForLine
      ),
      'folds'
    );
  }

  collapsedSet() {
    const key = (this.editor && this.editor.getPath()) || '';
    let set = this.collapsedByFile.get(key);
    if (!set) {
      set = new Set();
      this.collapsedByFile.set(key, set);
    }
    return set;
  }

  show(tree, source, { pending = false } = {}) {
    this.tree = tree;
    this.source = source;
    this.rows.clear();
    this.selectedKey = null;

    const collapsed = this.collapsedSet();
    const build = (nodes, depth) => {
      const fragment = document.createDocumentFragment();
      for (const node of nodes) {
        const item = document.createElement('li');
        item.classList.add('outline-node');
        item.setAttribute('role', 'treeitem');
        if (node.children.length > 0 && collapsed.has(node.key)) {
          item.classList.add('collapsed');
        }

        const row = document.createElement('div');
        row.classList.add('outline-row', 'list-item');
        row.style.paddingLeft = `${depth * 12 + 4}px`;
        row.dataset.key = node.key;

        const twisty = document.createElement('span');
        twisty.classList.add('outline-twisty');
        if (node.children.length > 0) twisty.classList.add('has-children');
        row.appendChild(twisty);

        if (node.kind) {
          const kind = document.createElement('span');
          kind.classList.add('outline-kind');
          kind.dataset.kind = node.kind;
          kind.textContent = node.kind.charAt(0);
          kind.title = node.kind;
          row.appendChild(kind);
        }

        const label = document.createElement('span');
        label.classList.add('outline-label');
        label.textContent = node.label;
        row.appendChild(label);

        if (node.detail) {
          const detail = document.createElement('span');
          detail.classList.add('outline-detail');
          detail.textContent = node.detail;
          row.appendChild(detail);
        }

        item.appendChild(row);
        if (node.children.length > 0) {
          const children = document.createElement('ul');
          children.classList.add('list-tree');
          children.setAttribute('role', 'group');
          children.appendChild(build(node.children, depth + 1));
          item.appendChild(children);
        }
        this.rows.set(node.key, { node, item, row });
        fragment.appendChild(item);
      }
      return fragment;
    };
    this.list.replaceChildren(build(tree, 0));

    let message = '';
    if (!this.editor) message = 'Open a file to see its outline.';
    else if (pending) message = '';
    else if (tree.length === 0) message = 'Nothing to outline in this file.';
    this.status.textContent = message;
    this.status.hidden = message === '';

    this.updateSelection();
  }

  scheduleSelection() {
    if (!this.visible || this.selectionFrame) return;
    this.selectionFrame = requestAnimationFrame(() => {
      this.selectionFrame = null;
      this.updateSelection();
    });
  }

  // The innermost entry containing the cursor, or the nearest one above it
  // that is showing: a collapsed entry stays collapsed, and stands in for
  // what is inside it.
  updateSelection() {
    if (!this.editor) return;
    const row = this.editor.getCursorBufferPosition().row;
    const collapsed = this.collapsedSet();
    let selected = null;
    for (const node of pathAt(this.tree, row)) {
      selected = node;
      if (collapsed.has(node.key)) break;
    }
    const key = selected ? selected.key : null;
    if (key === this.selectedKey) return;

    const previous = this.rows.get(this.selectedKey);
    if (previous) previous.row.classList.remove('selected');
    this.selectedKey = key;
    const current = this.rows.get(key);
    if (current) {
      current.row.classList.add('selected');
      current.row.scrollIntoView({ block: 'nearest' });
    }
  }

  didClick(event) {
    const row = event.target.closest('.outline-row');
    if (!row) return;
    const entry = this.rows.get(row.dataset.key);
    if (!entry) return;
    if (event.target.closest('.outline-twisty.has-children')) {
      this.toggle(entry);
    } else {
      this.reveal(entry.node);
    }
  }

  toggle({ node, item }) {
    const collapsed = this.collapsedSet();
    if (collapsed.has(node.key)) collapsed.delete(node.key);
    else collapsed.add(node.key);
    item.classList.toggle('collapsed', collapsed.has(node.key));
    this.updateSelection();
  }

  reveal(node) {
    const editor = this.editor;
    if (!editor) return;
    const position = [node.target.row, node.target.column];
    editor.setCursorBufferPosition(position);
    editor.scrollToBufferPosition(position, { center: true });
    const pane = chevron.workspace.paneForItem(editor);
    if (pane) pane.activate();
    chevron.views.getView(editor).focus();
  }

  // Pane item contract.
  getTitle() {
    return 'Outline';
  }

  getIconName() {
    return 'list-unordered';
  }

  getDefaultLocation() {
    return 'right';
  }

  getAllowedLocations() {
    return ['left', 'right'];
  }

  getPreferredWidth() {
    return 260;
  }

  getURI() {
    return OUTLINE_URI;
  }

  getElement() {
    return this.element;
  }

  serialize() {
    return { deserializer: 'outline/OutlineView' };
  }

  destroy() {
    clearTimeout(this.refreshTimer);
    if (this.selectionFrame) cancelAnimationFrame(this.selectionFrame);
    this.visibilityObserver.disconnect();
    if (this.editorSubscriptions) this.editorSubscriptions.dispose();
    this.subscriptions.dispose();
    this.element.remove();
    this.emitter.emit('did-destroy');
    this.emitter.dispose();
  }

  onDidDestroy(callback) {
    return this.emitter.on('did-destroy', callback);
  }

  // For the smoke test: the tree as labels, without scraping the DOM.
  snapshotForTests() {
    const describe = nodes =>
      nodes.map(node => ({
        label: node.label,
        collapsed: this.collapsedSet().has(node.key),
        children: describe(node.children)
      }));
    const selected = this.rows.get(this.selectedKey);
    return {
      visible: this.visible,
      source: this.source,
      tree: describe(this.tree),
      selected: selected ? selected.node.label : null,
      status: this.status.hidden ? null : this.status.textContent
    };
  }
}

OutlineView.URI = OUTLINE_URI;
module.exports = OutlineView;
