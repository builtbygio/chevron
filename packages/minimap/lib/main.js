'use strict';

const { CompositeDisposable } = require('chevron');
const { rowForY, viewportBox, minimapScale, scopeColor } = require('./layout');

const WIDTH = 72;

module.exports = {
  activate() {
    this.disposables = new CompositeDisposable();
    this.disposables.add(
      chevron.commands.add('chevron-workspace', 'minimap:toggle', () => {
        const enabled = !chevron.config.get('minimap.enabled');
        chevron.config.set('minimap.enabled', enabled);
      })
    );
    this.disposables.add(
      chevron.workspace.observeTextEditors(editor => this.watch(editor))
    );
    this.disposables.add(
      chevron.config.onDidChange('minimap.enabled', () => {
        const open = chevron.config.get('minimap.enabled') !== false;
        chevron.workspace.getTextEditors().forEach(editor => this.setOpen(editor, open));
      })
    );
  },

  syncEditorWidth(editor) {
    const component = editor.element && editor.element.getComponent && editor.element.getComponent();
    if (!component || !component.measureClientContainerWidth) return;
    // The gutter class changes the client container's used width without
    // resizing the editor element, so the component will not notice on its own.
    const measure = () => {
      if (component.measureClientContainerWidth()) component.scheduleUpdate();
    };
    requestAnimationFrame(() => {
      measure();
      requestAnimationFrame(measure);
    });
  },

  setOpen(editor, open) {
    if (!editor.element) return;
    editor.element.classList.toggle('minimap-open', open);
    const map = editor.element.querySelector(':scope > .minimap');
    if (map) map.style.display = open ? '' : 'none';
    this.syncEditorWidth(editor);
  },

  watch(editor) {
    if (editor.isMini && editor.isMini()) return;
    if (!editor.element || editor.element.querySelector(':scope > .minimap')) return;
    const host = document.createElement('div');
    host.className = 'minimap';
    const canvas = document.createElement('canvas');
    const viewport = document.createElement('div');
    viewport.className = 'minimap-viewport';
    host.appendChild(canvas);
    host.appendChild(viewport);
    const view = editor.element;
    view.appendChild(host);
    if (getComputedStyle(view).position === 'static') {
      view.style.position = 'relative';
    }
    const open = chevron.config.get('minimap.enabled') !== false;
    if (!open) host.style.display = 'none';
    view.classList.toggle('minimap-open', open);
    this.syncEditorWidth(editor);

    const paint = () => {
      if (chevron.config.get('minimap.enabled') === false) return;
      const height = host.clientHeight || 0;
      if (!height) return;
      const count = Math.max(editor.getLineCount(), 1);
      const scale = minimapScale(count, height);
      const width = WIDTH;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const markHeight = Math.max(scale.lineHeight - 0.6, 1);
      for (let row = 0; row < count; row++) {
        const y = row * scale.lineHeight;
        if (y >= height) break;
        let tokens = null;
        try {
          tokens = editor.tokensForScreenRow(row);
        } catch (error) {
          tokens = null;
        }
        let x = 1;
        if (tokens && tokens.length) {
          for (const token of tokens) {
            const text = token.text || '';
            const advance = text.length * scale.charWidth;
            if (x < width && /\S/.test(text)) {
              ctx.globalAlpha = 0.95;
              ctx.fillStyle = scopeColor(token.scopes);
              ctx.fillRect(x, y, Math.min(advance, width - x), markHeight);
            }
            x += advance;
            if (x >= width) break;
          }
        } else {
          const line = editor.lineTextForBufferRow(row) || '';
          const indent = line.length - line.trimStart().length;
          const body = line.trim().length;
          if (body) {
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = scopeColor('');
            ctx.fillRect(1 + indent * scale.charWidth, y, Math.min(body * scale.charWidth, width - 2), markHeight);
          }
        }
      }
      const linePx = editor.getLineHeightInPixels() || scale.lineHeight;
      const box = viewportBox({
        scrollTop: (view.getScrollTop() / linePx) * scale.lineHeight,
        viewHeight: ((view.getHeight() || height) / linePx) * scale.lineHeight,
        contentHeight: scale.contentHeight,
        minimapHeight: scale.contentHeight
      });
      viewport.style.top = box.top + 'px';
      viewport.style.height = Math.min(box.height, height) + 'px';
    };
    const scrollTo = y => {
      const count = Math.max(editor.getLineCount(), 1);
      const scale = minimapScale(count, host.clientHeight || 1);
      const row = rowForY(y, scale.contentHeight, count);
      const linePx = editor.getLineHeightInPixels() || 1;
      const viewHeight = view.getHeight() || host.clientHeight || linePx;
      const top = row * linePx - (viewHeight - linePx) / 2;
      // Scroll only. Moving the caret here makes it chase the minimap.
      view.setScrollTop(Math.max(0, top));
    };

    requestAnimationFrame(paint);
    const subs = new CompositeDisposable();
    const resizeObserver = new ResizeObserver(() => paint());
    resizeObserver.observe(view);
    subs.add(editor.onDidChange(() => paint()));
    subs.add(editor.onDidTokenize(() => paint()));
    subs.add(view.onDidChangeScrollTop(() => paint()));
    subs.add({ dispose: () => resizeObserver.disconnect() });
    let dragging = false;
    const onMove = event => {
      if (!dragging) return;
      const rect = host.getBoundingClientRect();
      scrollTo(event.clientY - rect.top);
    };
    const onUp = () => {
      dragging = false;
    };
    host.addEventListener('mousedown', event => {
      dragging = true;
      scrollTo(event.offsetY);
      event.preventDefault();
      event.stopPropagation();
    });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    subs.add(editor.onDidDestroy(() => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      host.remove();
      subs.dispose();
    }));
    this.disposables.add(subs);
  },

  deactivate() {
    this.disposables.dispose();
    document.querySelectorAll('chevron-text-editor > .minimap').forEach(node => node.remove());
  }
};
