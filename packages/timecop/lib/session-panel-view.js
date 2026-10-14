'use strict';

const { CompositeDisposable, Disposable } = require('chevron');
const etch = require('etch');

// Matches src/package-profiler-report.ts; a kind this does not know is still
// shown, after these.
const KIND_ORDER = ['command', 'event', 'save', 'config', 'decoration', 'ipc', 'lsp'];
const REFRESH_MS = 1000;

function formatMs(value) {
  if (value == null) return '-';
  return value < 10 ? value.toFixed(2) : String(Math.round(value));
}

function orderedKinds(byKind) {
  const known = KIND_ORDER.filter(kind => byKind[kind]);
  const rest = Object.keys(byKind)
    .filter(kind => !KIND_ORDER.includes(kind))
    .sort();
  return known.concat(rest);
}

// What each package costs after activation, from chevron.packageProfiler. The
// loading and activation panels answer "why was boot slow"; this answers "why
// is typing slow".
class SessionPanelView {
  constructor({ profiler } = {}) {
    this.profiler =
      profiler !== undefined ? profiler : chevron.packageProfiler || null;
    this.timer = null;
    this.subscriptions = new CompositeDisposable();
    etch.initialize(this);

    if (this.profiler) {
      this.subscriptions.add(this.profiler.onDidChangeState(() => this.refresh()));
    }
    const clickHandler = event => {
      const target = event.target.closest('a.package');
      if (target) {
        chevron.workspace.open(`chevron://config/packages/${target.dataset.package}`);
      }
    };
    this.element.addEventListener('click', clickHandler);
    this.subscriptions.add(
      new Disposable(() => this.element.removeEventListener('click', clickHandler))
    );
    this.syncTimer();
  }

  update() {
    return etch.update(this);
  }

  refresh() {
    this.syncTimer();
    return etch.update(this);
  }

  // Poll only while running: a stopped profiler's numbers cannot move.
  syncTimer() {
    const running = Boolean(this.profiler && this.profiler.isRunning());
    if (running && !this.timer) {
      this.timer = setInterval(() => etch.update(this), REFRESH_MS);
    } else if (!running && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  destroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.subscriptions.dispose();
    return etch.destroy(this);
  }

  toggle() {
    if (!this.profiler) return;
    if (this.profiler.isRunning()) {
      this.profiler.stop();
    } else {
      this.profiler.start();
    }
  }

  reset() {
    if (this.profiler) this.profiler.reset();
  }

  summary(report) {
    if (!this.profiler) {
      return 'This build of Chevron has no package profiler.';
    }
    const seconds = this.profiler.runningFor();
    if (seconds == null) {
      return report.length === 0
        ? 'Profiling is off. Start it, use the editor as usual, and each package\'s cost shows up here.'
        : 'Profiling is stopped. These are the totals from the last run.';
    }
    return `Profiling for ${seconds}s. Read count and p95 before total: 3ms four hundred times is the interesting case.`;
  }

  renderRows(report) {
    const rows = [];
    for (const entry of report) {
      orderedKinds(entry.byKind).forEach((kind, index) => {
        const stats = entry.byKind[kind];
        const owner =
          index > 0
            ? ''
            : entry.owner === 'core' || entry.owner === 'unknown'
            ? etch.dom('span', { className: 'text-subtle' }, entry.owner)
            : etch.dom(
                'a',
                { className: 'package', dataset: { package: entry.owner } },
                entry.owner
              );
        rows.push(
          etch.dom(
            'tr',
            { className: 'session-row', dataset: { owner: entry.owner, kind } },
            etch.dom('td', { className: 'session-owner' }, owner),
            etch.dom('td', { className: 'session-kind' }, kind),
            etch.dom('td', { className: 'session-number' }, String(stats.count)),
            etch.dom('td', { className: 'session-number' }, formatMs(stats.total)),
            etch.dom('td', { className: 'session-number' }, formatMs(stats.p50)),
            etch.dom('td', { className: 'session-number' }, formatMs(stats.p95)),
            etch.dom('td', { className: 'session-number' }, formatMs(stats.max))
          )
        );
      });
    }
    return rows;
  }

  render() {
    const report = this.profiler ? this.profiler.report() : [];
    const running = Boolean(this.profiler && this.profiler.isRunning());
    const header = ['package', 'kind', 'count', 'total ms', 'p50', 'p95', 'max'];

    return etch.dom(
      'div',
      { className: 'tool-panel padded package-panel session-panel' },
      etch.dom(
        'div',
        { className: 'inset-panel' },
        etch.dom('div', { className: 'panel-heading' }, 'Session'),
        etch.dom(
          'div',
          { className: 'panel-body padded' },
          etch.dom(
            'div',
            { className: 'session-controls btn-group' },
            etch.dom(
              'button',
              {
                ref: 'toggleButton',
                className: 'btn' + (running ? '' : ' btn-primary'),
                disabled: !this.profiler,
                on: { click: () => this.toggle() }
              },
              running ? 'Stop' : 'Start'
            ),
            etch.dom(
              'button',
              {
                ref: 'resetButton',
                className: 'btn',
                disabled: !this.profiler,
                on: { click: () => this.reset() }
              },
              'Reset'
            )
          ),
          etch.dom('div', { className: 'text-info', ref: 'summary' }, this.summary(report)),
          report.length === 0
            ? etch.dom('div', { ref: 'table' })
            : etch.dom(
                'table',
                { className: 'session-table', ref: 'table' },
                etch.dom(
                  'thead',
                  {},
                  etch.dom('tr', {}, ...header.map(label => etch.dom('th', {}, label)))
                ),
                etch.dom('tbody', {}, ...this.renderRows(report))
              ),
          etch.dom(
            'div',
            { className: 'text-subtle session-note' },
            'lsp is time waiting on a language server, billed to the package that asked; it is not counted in the totals.'
          )
        )
      )
    );
  }
}

module.exports = SessionPanelView;
