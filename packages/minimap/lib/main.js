'use strict';

const { CompositeDisposable } = require('chevron');
const { rowForY, viewportBox, sampleStep } = require('./layout');

const WIDTH = 72;
const MAX_MARKS = 4000;

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
        chevron.workspace.getTextEditors().forEach(editor => {
          const map = editor.element && editor.element.querySelector(':scope > .minimap');
          if (map) map.style.display = chevron.config.get('minimap.enabled') ? '' : 'none';
        });
      })
    );
  },

  watch(editor) {
    if (!editor.element || editor.element.querySelector(':scope > .minimap')) return;
    const host = document.createElement('div');
    host.className = 'minimap';
    const canvas = document.createElement('canvas');
    const viewport = document.createElement('div');
    viewport.className = 'minimap-viewport';
    host.appendChild(canvas);
    host.appendChild(viewport);
    editor.element.appendChild(host);
    if (getComputedStyle(editor.element).position === 'static') {
      editor.element.style.position = 'relative';
    }

    let lengths = [];
    const measure = () => {
      const count = editor.getLineCount();
      const step = sampleStep(count, MAX_MARKS);
      lengths = [];
      for (let row = 0; row < count; row += step) {
        lengths.push((editor.lineTextForBufferRow(row) || '').length);
      }
    };
    const paint = () => {
      if (!chevron.config.get('minimap.enabled')) return;
      const height = editor.element.clientHeight || editor.getHeight() || 0;
      const width = WIDTH;
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const color = getComputedStyle(editor.element).color || '#ddd';
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.45;
      const count = Math.max(editor.getLineCount(), 1);
      const step = sampleStep(count, MAX_MARKS);
      const bar = Math.max(height / count, 1);
      lengths.forEach((length, index) => {
        if (!length) return;
        const w = Math.max(1, Math.min(width - 4, (length / 80) * (width - 4)));
        ctx.fillRect(2, (index * step / count) * height, w, Math.max(bar - 0.5, 0.5));
      });
      const box = viewportBox({
        scrollTop: editor.getScrollTop(),
        viewHeight: editor.getHeight() || height,
        contentHeight: editor.getLineCount() * (editor.getLineHeightInPixels() || bar),
        minimapHeight: height
      });
      viewport.style.top = box.top + 'px';
      viewport.style.height = box.height + 'px';
    };
    const scrollTo = y => {
      const row = rowForY(y, host.clientHeight, editor.getLineCount());
      editor.setCursorBufferPosition([row, 0]);
      editor.scrollToBufferPosition([row, 0], { center: true });
    };

    measure();
    paint();
    const subs = new CompositeDisposable();
    subs.add(editor.onDidChange(() => {
      measure();
      paint();
    }));
    subs.add(editor.onDidChangeScrollTop(() => paint()));
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
