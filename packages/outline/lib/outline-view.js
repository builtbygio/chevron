const { CompositeDisposable, Emitter } = require('chevron');
const {
  fromSymbols,
  fromFolds,
  pathAt,
  visibleRows,
  keyAction,
  KEYS,
  statusMessage,
  CollapsedState
} = require('./outline-tree');

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
// The tree is one tab stop: the focusable row moves with the arrow keys
// (a roving tabIndex), as the WAI-ARIA tree pattern describes. "Selected" is
// the entry holding the editor's cursor; focus is where the keyboard is.
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
    this.list.setAttribute('aria-label', 'Outline');
    this.element.append(this.status, this.list);

    this.cache = new chevron.enclosingScopes.FoldableRangeCache();
    this.collapsed = new CollapsedState();
    this.rows = new Map();
    this.tree = [];
    this.source = null;
    this.selectedKey = null;
    this.tabStopKey = null;
    this.focusRequested = false;
    this.editor = null;
    this.generation = 0;
    this.visible = false;
    this.stale = true;
    this.refreshTimer = null;
    this.selectionFrame = null;
    this.destroyed = false;

    this.list.addEventListener('click', event => this.didClick(event));
    this.list.addEventListener('keydown', event => this.didKeyDown(event));
    // A pane focusing its item lands on the panel; pass it to the tab stop.
    this.element.addEventListener('focus', () => this.focus());
    this.element.addEventListener('focusout', event => {
      if (!this.element.contains(event.relatedTarget)) {
        this.focusRequested = false;
      }
    });

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

    // A server that starts after the file opened: the folds on screen were
    // the fallback, and symbols can replace them now.
    const lsp = chevron.lsp;
    if (lsp && typeof lsp.onDidStartServer === 'function') {
      this.subscriptions.add(
        lsp.onDidStartServer(({ serverId }) => {
          if (!this.editor) return;
          if (lsp.getServerIdForEditor(this.editor) !== serverId) return;
          this.scheduleRefresh();
        })
      );
    }
  }

  get file() {
    return (this.editor && this.editor.getPath()) || '';
  }

  isCollapsed(key) {
    return this.collapsed.has(this.file, key);
  }

  watch(editor) {
    editor = editor || null;
    if (editor === this.editor) return this.scheduleRefresh();
    if (this.editorSubscriptions) this.editorSubscriptions.dispose();
    this.editorSubscriptions = new CompositeDisposable();
    this.editor = editor;
    this.collapsed.touch(this.file);

    // Another file's tree must not stay on screen while this one's is asked
    // for; a server can take seconds on first contact.
    this.generation++;
    this.tabStopKey = null;
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

    // The fold cache answers nothing above its line limit, so an empty tree
    // there means "not asked", not "nothing to show".
    const tooLarge = editor.getLineCount() > chevron.enclosingScopes.MAX_LINES;
    this.show(
      fromFolds(
        this.cache.get(editor),
        row => editor.lineTextForBufferRow(row),
        chevron.enclosingScopes.labelForLine
      ),
      'folds',
      { tooLarge }
    );
  }

  show(tree, source, { pending = false, tooLarge = false } = {}) {
    const hadFocus = this.element.contains(document.activeElement);
    this.tree = tree;
    this.source = source;
    this.rows.clear();
    this.selectedKey = null;

    let groups = 0;
    const build = (nodes, depth) => {
      const fragment = document.createDocumentFragment();
      nodes.forEach((node, index) => {
        const hasChildren = node.children.length > 0;
        const collapsed = hasChildren && this.isCollapsed(node.key);

        const item = document.createElement('li');
        item.classList.add('outline-node');
        item.setAttribute('role', 'none');
        if (collapsed) item.classList.add('collapsed');

        // The row is the treeitem, since it is what takes focus. Its group
        // is a sibling in the DOM, so aria-owns says whose it is.
        const row = document.createElement('div');
        row.classList.add('outline-row', 'list-item');
        row.style.paddingLeft = `${depth * 12 + 4}px`;
        row.dataset.key = node.key;
        row.tabIndex = -1;
        row.setAttribute('role', 'treeitem');
        row.setAttribute('aria-level', String(depth + 1));
        row.setAttribute('aria-setsize', String(nodes.length));
        row.setAttribute('aria-posinset', String(index + 1));
        row.setAttribute('aria-selected', 'false');
        if (hasChildren) row.setAttribute('aria-expanded', String(!collapsed));

        const twisty = document.createElement('span');
        twisty.classList.add('outline-twisty');
        if (hasChildren) twisty.classList.add('has-children');
        row.appendChild(twisty);

        if (node.kind) {
          const kind = document.createElement('span');
          kind.classList.add('outline-kind');
          kind.dataset.kind = node.kind;
          kind.textContent = node.kind.charAt(0);
          kind.title = node.kind;
          kind.setAttribute('aria-hidden', 'true');
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
        if (hasChildren) {
          const children = document.createElement('ul');
          children.classList.add('list-tree');
          children.setAttribute('role', 'group');
          children.id = `outline-group-${++groups}`;
          row.setAttribute('aria-owns', children.id);
          children.appendChild(build(node.children, depth + 1));
          item.appendChild(children);
        }
        this.rows.set(node.key, { node, item, row });
        fragment.appendChild(item);
      });
      return fragment;
    };
    this.list.replaceChildren(build(tree, 0));

    const message = statusMessage({
      hasEditor: Boolean(this.editor),
      pending,
      empty: tree.length === 0,
      tooLarge
    });
    this.status.textContent = message;
    this.status.hidden = message === '';

    this.updateSelection();
    // Rebuilding the rows drops focus on the floor; put it back where it was.
    this.setTabStop(this.tabStopKey, {
      focus: hadFocus || this.focusRequested
    });
  }

  isShowing(key) {
    return visibleRows(this.tree, k => this.isCollapsed(k)).some(
      r => r.node.key === key
    );
  }

  // Exactly one row is tabbable: the given one if it is showing, else the
  // cursor's entry, else the first.
  setTabStop(key, { focus = false } = {}) {
    let target = this.rows.has(key) && this.isShowing(key) ? key : null;
    if (!target && this.rows.has(this.selectedKey)) target = this.selectedKey;
    if (!target && this.tree.length > 0) target = this.tree[0].key;

    const previous = this.rows.get(this.tabStopKey);
    if (previous) previous.row.tabIndex = -1;
    this.tabStopKey = target;
    const current = this.rows.get(target);
    if (!current) return;
    current.row.tabIndex = 0;
    if (focus) {
      this.focusRequested = false;
      current.row.focus();
      current.row.scrollIntoView({ block: 'nearest' });
    }
  }

  // outline:focus, and a pane focusing the panel. Before the first render
  // there is no row yet, so the request waits for one.
  focus() {
    if (this.rows.has(this.tabStopKey)) {
      this.setTabStop(this.tabStopKey, { focus: true });
    } else {
      this.focusRequested = true;
      if (document.activeElement !== this.element) this.element.focus();
    }
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
    let selected = null;
    for (const node of pathAt(this.tree, row)) {
      selected = node;
      if (this.isCollapsed(node.key)) break;
    }
    const key = selected ? selected.key : null;
    if (key === this.selectedKey) return;

    const previous = this.rows.get(this.selectedKey);
    if (previous) {
      previous.row.classList.remove('selected');
      previous.row.setAttribute('aria-selected', 'false');
    }
    this.selectedKey = key;
    const current = this.rows.get(key);
    if (current) {
      current.row.classList.add('selected');
      current.row.setAttribute('aria-selected', 'true');
      current.row.scrollIntoView({ block: 'nearest' });
    }
  }

  didClick(event) {
    const row = event.target.closest('.outline-row');
    if (!row) return;
    const entry = this.rows.get(row.dataset.key);
    if (!entry) return;
    this.setTabStop(entry.node.key);
    if (event.target.closest('.outline-twisty.has-children')) {
      this.setCollapsed(entry.node.key, !this.isCollapsed(entry.node.key));
    } else {
      this.reveal(entry.node);
    }
  }

  didKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (!KEYS.has(event.key)) return;
    const row = event.target.closest && event.target.closest('.outline-row');
    if (!row) return;
    // Handled here, not by the keymap: arrows and Enter mean something else
    // to the workspace, and the panel would scroll natively as well.
    event.preventDefault();
    event.stopPropagation();

    const action = keyAction(event.key, row.dataset.key, this.tree, key =>
      this.isCollapsed(key)
    );
    if (!action) return;
    if (action.focus) this.setTabStop(action.focus, { focus: true });
    else if (action.expand) this.setCollapsed(action.expand, false);
    else if (action.collapse) this.setCollapsed(action.collapse, true);
    else if (action.reveal) this.reveal(this.rows.get(action.reveal).node);
  }

  setCollapsed(key, collapsed) {
    const entry = this.rows.get(key);
    if (!entry || entry.node.children.length === 0) return;
    this.collapsed.set(this.file, key, collapsed);
    entry.item.classList.toggle('collapsed', collapsed);
    entry.row.setAttribute('aria-expanded', String(!collapsed));
    // Collapsing can hide the focused row; focus moves to the entry hiding it.
    if (!this.isShowing(this.tabStopKey)) {
      this.setTabStop(key, {
        focus: this.element.contains(document.activeElement)
      });
    }
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
    if (this.destroyed) return;
    this.destroyed = true;
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
        collapsed: this.isCollapsed(node.key),
        children: describe(node.children)
      }));
    const label = key => {
      const entry = this.rows.get(key);
      return entry ? entry.node.label : null;
    };
    const focused = document.activeElement;
    return {
      visible: this.visible,
      source: this.source,
      tree: describe(this.tree),
      selected: label(this.selectedKey),
      tabStop: label(this.tabStopKey),
      tabStops: this.list.querySelectorAll('.outline-row[tabindex="0"]').length,
      focused:
        focused && focused.classList.contains('outline-row')
          ? label(focused.dataset.key)
          : null,
      status: this.status.hidden ? null : this.status.textContent
    };
  }
}

OutlineView.URI = OUTLINE_URI;
module.exports = OutlineView;
