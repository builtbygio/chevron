'use strict';

/**
 * Renders a package profiler run as text, for the report command.
 *
 * Separate from the profiler so it can be unit-tested without a window, and
 * so the measurement side never grows a formatting dependency.
 */

import type { OwnerReport } from './package-profiler';

const KINDS = ['command', 'event', 'decoration', 'ipc'];

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function padLeft(text: string, width: number): string {
  return text.length >= width ? text : ' '.repeat(width - text.length) + text;
}

function ms(value: number | null): string {
  if (value == null) return '-';
  return value < 10 ? value.toFixed(2) : String(Math.round(value));
}

export function formatProfilerReport(
  report: OwnerReport[],
  seconds: number | null
): string {
  const lines: string[] = [];
  lines.push('# Package profiler');
  lines.push('');
  lines.push(
    seconds == null
      ? 'Profiling is stopped. Totals are for the last run.'
      : `Profiling has been running for ${seconds}s.`
  );
  lines.push('');
  lines.push(
    'Time a package spent on your behalf **after activation** — command'
  );
  lines.push(
    'handlers so far. `timecop` covers load and activate; this covers the rest.'
  );
  lines.push('');
  lines.push(
    'A package spending 3ms four hundred times is the interesting case, so'
  );
  lines.push('read `count` and `p95` before `total`.');
  lines.push('');

  const widths = { owner: 24, kind: 11, count: 7, total: 9, p50: 8, p95: 8, max: 8 };
  lines.push(
    pad('package', widths.owner) +
      pad('kind', widths.kind) +
      padLeft('count', widths.count) +
      padLeft('total ms', widths.total) +
      padLeft('p50', widths.p50) +
      padLeft('p95', widths.p95) +
      padLeft('max', widths.max)
  );
  lines.push('-'.repeat(75));

  for (const entry of report) {
    let first = true;
    for (const kind of KINDS) {
      const stats = entry.byKind[kind];
      if (!stats) continue;
      lines.push(
        pad(first ? entry.owner : '', widths.owner) +
          pad(kind, widths.kind) +
          padLeft(String(stats.count), widths.count) +
          padLeft(ms(stats.total), widths.total) +
          padLeft(ms(stats.p50), widths.p50) +
          padLeft(ms(stats.p95), widths.p95) +
          padLeft(ms(stats.max), widths.max)
      );
      first = false;
    }
  }

  lines.push('');
  const grand = report.reduce((sum, entry) => sum + entry.total, 0);
  lines.push(`Total attributed: ${ms(grand)}ms across ${report.length} packages.`);
  lines.push('');
  lines.push(
    'An owner of `core` is Chevron itself; `unknown` means the registration'
  );
  lines.push(
    'site was a bundle with no readable path — expected for some packages.'
  );

  return lines.join('\n') + '\n';
}

module.exports = { formatProfilerReport };
