'use strict';

/**
 * Host-eligibility classification for package host v2 (Epic 21, slice 21.4).
 *
 * This implements the design doc's **(B) Hybrid** first slice: pure-logic
 * packages run in the host; packages that touch the DOM stay in the editor
 * preload under the v1 require policy. Which packages need DOM is a fact about
 * their code, so it is detected rather than assumed.
 *
 * Runs editor-side (it is `PackageManager`'s routing input), so it lives in
 * `src/` rather than under `main-process/workers/`.
 *
 * See docs/security-phase-s-package-host.md "Activation flow (v2)".
 */

const fs = require('fs');
const path = require('path');

const { classifyCallerPath, classifyRequireId } = require('./package-require-audit');

interface ClassifyOptions {
  packagePath: string;
  metadata?: any;
  readSources?: (root: string) => string[];
}

interface Classification {
  eligible: boolean;
  reason: string;
  tier: string;
  signals: string[];
  explicit: boolean;
}

interface RoutingDecision {
  inHost: boolean;
  reason: string;
  classification: Classification | null;
}

/**
 * Source patterns that mean "this package needs a DOM or an editor-side
 * object". Each is a disqualifying signal.
 *
 * Detection is deliberately conservative: a false "needs DOM" costs nothing
 * (the package keeps working exactly as it does today, in-process), while a
 * false "host-eligible" blanks a UI at activation time.
 */
const DOM_SIGNALS = [
  { id: 'document', re: /\bdocument\s*\./ },
  { id: 'window', re: /\bwindow\s*\./ },
  { id: 'createElement', re: /\bcreateElement\s*\(/ },
  { id: 'customElements', re: /\bcustomElements\b/ },
  { id: 'etch', re: /require\(\s*['"]etch['"]\s*\)/ },
  { id: 'react', re: /require\(\s*['"]react(-dom)?['"]\s*\)/i },
  { id: 'space-pen', re: /atom-space-pen-views/ },
  {
    id: 'workspace-panel',
    re: /\badd(Modal|Top|Bottom|Left|Right|Header|Footer)Panel\s*\(/
  },
  { id: 'view-registry', re: /\bviews\s*\.\s*(addViewProvider|getView)\s*\(/ }
];

/** Bare `require('x')` ids, for the privileged check. */
const REQUIRE_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;

const SKIP_DIRS = new Set(['node_modules', '.git', 'spec', 'test', 'benchmarks']);

/** Collect the package's own JS/TS sources (not its dependencies). */
function collectSources(root: string, limit = 200): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    if (files.length >= limit) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      if (files.length >= limit) return;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
        files.push(path.join(dir, entry.name));
      }
    }
  };
  walk(root);
  return files;
}

function readSafe(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (_) {
    return '';
  }
}

function readMetadata(packagePath: string): any {
  try {
    return JSON.parse(readSafe(path.join(packagePath, 'package.json')) || '{}');
  } catch (_) {
    return {};
  }
}

/**
 * Classify a package for host activation.
 *
 * @param {object} options
 * @param {string} options.packagePath  package root on disk
 * @param {object} [options.metadata]   parsed package.json
 * @param {(root: string) => string[]} [options.readSources]  test seam
 * @returns {{eligible: boolean, reason: string, tier: string, signals: string[], explicit: boolean}}
 */
function classifyPackage({ packagePath, metadata, readSources }: ClassifyOptions): Classification {
  // Callers that already parsed package.json pass it; otherwise read it, since
  // an author's explicit opt-in/opt-out must be honoured either way.
  const meta = metadata || readMetadata(packagePath);
  const tier = classifyCallerPath(path.join(packagePath, 'package.json'));

  // Explicit author intent wins over every heuristic, in both directions.
  const declared = meta.chevronPackageHost;
  if (declared === 'editor') {
    return {
      eligible: false,
      reason: 'package.json opts out (chevronPackageHost: "editor")',
      tier,
      signals: [],
      explicit: true
    };
  }

  // Only community (T2) code is what the host exists to isolate. Core and
  // bundled packages are trusted and stay in-process (design doc: "T1 bundled
  // packages stay in editor preload until individually migrated").
  if (tier !== 'community' && declared !== 'eligible') {
    return {
      eligible: false,
      reason: `not a community package (tier: ${tier})`,
      tier,
      signals: [],
      explicit: false
    };
  }

  const files =
    typeof readSources === 'function'
      ? readSources(packagePath)
      : collectSources(packagePath);

  const signals = new Set<string>();
  let privileged: { id: string; kind: string } | null = null;

  for (const file of files) {
    const source = readSafe(file);
    if (!source) continue;
    for (const signal of DOM_SIGNALS) {
      if (signal.re.test(source)) signals.add(signal.id);
    }
    let match;
    REQUIRE_RE.lastIndex = 0;
    while ((match = REQUIRE_RE.exec(source)) !== null) {
      const id = match[1];
      if (id === 'chevron' || id === 'atom') continue;
      const kind = classifyRequireId(id);
      if (kind && !privileged) privileged = { id, kind };
    }
  }

  if (declared === 'eligible') {
    return {
      eligible: true,
      reason: 'package.json opts in (chevronPackageHost: "eligible")',
      tier,
      signals: [...signals],
      explicit: true
    };
  }

  if (signals.size > 0) {
    return {
      eligible: false,
      reason: `needs the editor DOM (${[...signals].join(', ')})`,
      tier,
      signals: [...signals],
      explicit: false
    };
  }

  if (privileged) {
    // The host would refuse this require, so routing it there converts a
    // policy error into an activation failure. Keep it in-process, where the
    // v1 policy reports it the way package authors already expect.
    return {
      eligible: false,
      reason: `requires privileged module "${privileged.id}" (${privileged.kind})`,
      tier,
      signals: [],
      explicit: false
    };
  }

  return {
    eligible: true,
    reason: 'logic-only',
    tier,
    signals: [],
    explicit: false
  };
}

/**
 * Routing decision for PackageManager.
 *
 * @param {object} options
 * @param {boolean} options.hostEnabled  core.packageHostV2 / CHEVRON_PACKAGE_HOST_V2
 */
function shouldActivateInHost(options: ClassifyOptions & { hostEnabled: boolean }): RoutingDecision {
  if (!options.hostEnabled) {
    return { inHost: false, reason: 'package host v2 disabled', classification: null };
  }
  const classification = classifyPackage(options);
  return {
    inHost: classification.eligible,
    reason: classification.reason,
    classification
  };
}

/** Is host v2 turned on? Env wins, then config, then the schema default (off). */
function isHostEnabled(config?: { get?: (k: string) => unknown } | null): boolean {
  const env = process.env.CHEVRON_PACKAGE_HOST_V2;
  if (env === '1' || env === 'true') return true;
  if (env === '0' || env === 'false') return false;
  if (config && typeof config.get === 'function') {
    return Boolean(config.get('core.packageHostV2'));
  }
  return false;
}

module.exports = {
  classifyPackage,
  shouldActivateInHost,
  isHostEnabled,
  DOM_SIGNALS: DOM_SIGNALS.map(s => s.id)
};
