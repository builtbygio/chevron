'use strict';

/**
 * What each package costs *after* it has activated.
 *
 * `timecop` reports `loadTime` and `activateTime` — what boot cost. Neither
 * says anything about a package that activates in 4ms and then runs a handler
 * on every keystroke, which is the cost that actually makes an editor feel
 * slow. This measures the second kind.
 *
 * Two rules shape the design:
 *
 *   1. **Off by default, and free when off.** The hot path is one boolean
 *      check. Nothing is timed, nothing is allocated, no work is attributed.
 *   2. **Attribute once, measure many.** Working out which package owns a
 *      callback means reading a stack, which is far too expensive per call.
 *      It happens once, when the callback is registered, and the result is
 *      carried on the listener.
 *
 * docs/process/next-tracks-plan.md, track 1.
 */

const path = require('path');

/** Kinds of work a package can do on the user's time. */
export type ProfileKind =
  | 'command'
  | 'event'
  | 'decoration'
  | 'ipc'
  | 'save'
  | 'config'
  | 'lsp';

/**
 * Kinds measured as time spent waiting, not time on the main thread. They are
 * reported, but kept out of an owner's total: a 300ms language server reply
 * is latency, not jank, and would otherwise outrank every real hot path.
 */
export const WAIT_KINDS: ReadonlySet<string> = new Set(['lsp']);

export interface KindStats {
  /** How many times it ran. */
  count: number;
  /** Total milliseconds, across every call. */
  total: number;
  p50: number | null;
  p95: number | null;
  max: number;
}

export interface OwnerReport {
  owner: string;
  total: number;
  byKind: { [kind: string]: KindStats };
}

/** Timings kept per owner+kind. Enough for a stable p95, bounded per key. */
const MAX_SAMPLES = 200;

interface Bucket {
  count: number;
  total: number;
  max: number;
  samples: number[];
  /** Where the next sample overwrites, once the reservoir is full. */
  cursor: number;
}

function percentile(sorted: number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return round(sorted[index]);
}

function round(ms: number): number {
  return Math.round(ms * 1000) / 1000;
}

class PackageProfiler {
  enabled: boolean;
  private buckets: Map<string, Bucket>;
  private ownerByCallSite: Map<string, string>;
  private packageDirs: string[];
  private startedAt: number | null;
  /**
   * Whose callback is running right now. Work that cannot see its own caller
   * — a blocking IPC round trip, say — is attributed to this rather than
   * paying for a stack on every call.
   */
  private current: string | null;
  private isPackage: ((name: string) => boolean) | null;
  private stateListeners: Set<() => void>;

  constructor() {
    this.enabled = false;
    this.buckets = new Map();
    this.ownerByCallSite = new Map();
    this.packageDirs = [];
    this.startedAt = null;
    this.current = null;
    this.isPackage = null;
    this.stateListeners = new Set();
  }

  /**
   * Directories that hold packages, from PackageManager. A callback whose
   * registration site lives under one of these belongs to the package named
   * by the next path segment.
   */
  setPackageDirPaths(dirs: string[]): void {
    this.packageDirs = (dirs || []).map(dir => path.resolve(dir) + path.sep);
    // Attribution is memoized against these, so it has to go.
    this.ownerByCallSite.clear();
  }

  /**
   * Which names under node_modules are packages, from PackageManager. Without
   * it, every library on the stack (event-kit, text-buffer) looks like one.
   */
  setPackageLookup(isPackage: ((name: string) => boolean) | null): void {
    this.isPackage = isPackage;
    this.ownerByCallSite.clear();
  }

  start(): void {
    this.enabled = true;
    this.startedAt = Date.now();
    this.buckets.clear();
    this.emitStateChange();
  }

  stop(): void {
    this.enabled = false;
    this.emitStateChange();
  }

  /** Drop what has been recorded; a running profiler keeps running. */
  reset(): void {
    this.buckets.clear();
    if (this.enabled) this.startedAt = Date.now();
    this.emitStateChange();
  }

  isRunning(): boolean {
    return this.enabled;
  }

  /** Called on start, stop and reset — not per record, which is hot. */
  onDidChangeState(callback: () => void): { dispose(): void } {
    this.stateListeners.add(callback);
    return { dispose: () => this.stateListeners.delete(callback) };
  }

  private emitStateChange(): void {
    for (const listener of [...this.stateListeners]) {
      try {
        listener();
      } catch (error) {
        console.error(error);
      }
    }
  }

  /**
   * Note where a callback was registered, without paying to format it.
   * `Error.captureStackTrace` stores structured frames; the string is only
   * built if `.stack` is read, which happens on the first profiled call and
   * never at all when profiling stays off.
   */
  captureSite(below?: Function): { stack?: string } {
    const site: { stack?: string } = {};
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(site, below as any);
    }
    return site;
  }

  /** The owner for a captured site, computed once and cached on the site. */
  ownerForSite(site: { stack?: string; owner?: string } | null): string {
    if (!site) return 'unknown';
    if (site.owner) return site.owner;
    site.owner = this.attribute(site.stack);
    return site.owner;
  }

  /**
   * Which package registered a callback, from the stack at registration.
   *
   * The nearest *package* frame wins. Most subscriptions go through a core
   * method (`TextEditor#onDidChange`, `Config#observe`), so the first frame
   * is nearly always core; stopping there would bill every package's
   * handlers to Chevron. Core — and the libraries core uses — is the answer
   * only when no package is on the stack. 'unknown' means the stack said
   * nothing useful: a bundled esbuild output, mostly.
   */
  attribute(stack?: string): string {
    const raw = stack || new Error().stack || '';
    const cached = this.ownerByCallSite.get(raw);
    if (cached) return cached;

    let owner: string | null = null;
    let sawCore = false;
    for (const line of raw.split('\n').slice(1)) {
      const match = /\(?([^()\s]+\.(?:js|ts|jsx|tsx)):\d+:\d+\)?/.exec(line);
      if (!match) continue;
      const file = match[1];
      if (/package-profiler|command-registry/.test(file)) continue;

      const found = this.ownerForPath(file);
      if (!found) continue;
      if (this.isPackageOwner(found, file)) {
        owner = found;
        break;
      }
      sawCore = true;
    }

    const result = owner || (sawCore ? 'core' : 'unknown');
    this.ownerByCallSite.set(raw, result);
    return result;
  }

  private isPackageOwner(name: string, file: string): boolean {
    if (name === 'core') return false;
    const resolved = path.resolve(file);
    if (this.packageDirs.some(dir => resolved.startsWith(dir))) return true;
    return this.isPackage ? this.isPackage(name) : true;
  }

  /**
   * The owner of whoever is calling right now, for async work that outlives
   * any attribution window — an LSP request, say. Reads a stack, so only
   * call it while enabled. Falls back to the open window, then core.
   */
  ownerOfCaller(): string {
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 30;
    const stack = new Error().stack;
    Error.stackTraceLimit = limit;
    const owner = this.attribute(stack);
    if (owner !== 'core' && owner !== 'unknown') return owner;
    return this.current || 'core';
  }

  /** The package owning a file path, or null when it is not under one. */
  ownerForPath(file: string): string | null {
    const resolved = path.resolve(file);
    for (const dir of this.packageDirs) {
      if (!resolved.startsWith(dir)) continue;
      const rest = resolved.slice(dir.length);
      const name = rest.split(path.sep)[0];
      if (name) return name;
    }
    // Bundled packages live in node_modules/<name> once packaged.
    const marker = `${path.sep}node_modules${path.sep}`;
    const nodeModules = resolved.lastIndexOf(marker);
    if (nodeModules !== -1) {
      const rest = resolved.slice(nodeModules + marker.length);
      const segments = rest.split(path.sep);
      const name = segments[0].startsWith('@')
        ? segments.slice(0, 2).join('/')
        : segments[0];
      if (name) return name;
    }
    if (/[\\/]src[\\/]/.test(resolved) || /[\\/]exports[\\/]/.test(resolved)) {
      return 'core';
    }
    return null;
  }

  /**
   * Record one call. Costs a map lookup and a few numbers; the caller is
   * expected to check `enabled` before timing anything.
   */
  record(kind: ProfileKind, owner: string, ms: number): void {
    if (!this.enabled) return;
    const key = `${owner}\u0000${kind}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { count: 0, total: 0, max: 0, samples: [], cursor: 0 };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    bucket.total += ms;
    if (ms > bucket.max) bucket.max = ms;
    if (bucket.samples.length < MAX_SAMPLES) {
      bucket.samples.push(ms);
    } else {
      // Ring rather than reservoir: recent behaviour is what a user is
      // complaining about, and it keeps `record` allocation-free.
      bucket.samples[bucket.cursor] = ms;
      bucket.cursor = (bucket.cursor + 1) % MAX_SAMPLES;
    }
  }

  /**
   * Wrap a subscriber so each call is timed and attributed to whoever
   * subscribed. The site is captured now — once — and formatted only if
   * profiling is ever turned on. When it is off the wrapper is a boolean
   * check and a call through.
   */
  wrap<T extends Function>(kind: ProfileKind, callback: T, below?: Function): T {
    if (typeof callback !== 'function') return callback;
    const site = this.captureSite(below);
    const self = this;
    const wrapped = function(this: any, ...args: any[]) {
      if (!self.enabled) return callback.apply(this, args);
      const owner = self.ownerForSite(site);
      const previous = self.enter(owner);
      const started = performance.now();
      try {
        return callback.apply(this, args);
      } finally {
        self.record(kind, owner, performance.now() - started);
        self.leave(previous);
      }
    };
    return (wrapped as unknown) as T;
  }

  /**
   * Like `wrap`, but a callback that returns a promise is timed until it
   * settles. For hooks the caller awaits — `will-save` holds the save until
   * every handler resolves, so that wait is the cost the user sees.
   */
  wrapUntilSettled<T extends Function>(kind: ProfileKind, callback: T, below?: Function): T {
    if (typeof callback !== 'function') return callback;
    const site = this.captureSite(below);
    const self = this;
    const wrapped = function(this: any, ...args: any[]) {
      if (!self.enabled) return callback.apply(this, args);
      const owner = self.ownerForSite(site);
      const previous = self.enter(owner);
      const started = performance.now();
      let pending = false;
      try {
        const result = callback.apply(this, args);
        if (result && typeof result.then === 'function') {
          pending = true;
          const done = () => self.record(kind, owner, performance.now() - started);
          result.then(done, done);
        }
        return result;
      } finally {
        if (!pending) self.record(kind, owner, performance.now() - started);
        self.leave(previous);
      }
    };
    return (wrapped as unknown) as T;
  }

  /**
   * Time every `TextBuffer` save hook, whoever subscribes — packages reach
   * the buffer directly (`whitespace`, `lsp.formatOnSave`), so wrapping the
   * `TextEditor` forwarders would miss most of them. Patches the prototype
   * once; when profiling is off a hook costs the usual boolean check.
   */
  instrumentBufferSaves(TextBuffer: any): void {
    const proto = TextBuffer && TextBuffer.prototype;
    if (!proto || proto.__chevronProfiledSaves) return;
    Object.defineProperty(proto, '__chevronProfiledSaves', { value: true });
    const self = this;
    const onWillSave = proto.onWillSave;
    if (typeof onWillSave === 'function') {
      proto.onWillSave = function profiledOnWillSave(callback: Function) {
        return onWillSave.call(
          this,
          self.wrapUntilSettled('save', callback, profiledOnWillSave)
        );
      };
    }
    const onDidSave = proto.onDidSave;
    if (typeof onDidSave === 'function') {
      proto.onDidSave = function profiledOnDidSave(callback: Function) {
        return onDidSave.call(this, self.wrap('save', callback, profiledOnDidSave));
      };
    }
  }

  /** Open an attribution window; returns the previous owner to restore. */
  enter(owner: string): string | null {
    const previous = this.current;
    this.current = owner;
    return previous;
  }

  leave(previous: string | null): void {
    this.current = previous;
  }

  /**
   * Record work whose caller is not knowable at the call site — a blocking
   * IPC round trip inside somebody's handler. Attributed to whichever
   * callback is running, or to core when none is.
   */
  recordCurrent(kind: ProfileKind, ms: number): void {
    if (!this.enabled) return;
    this.record(kind, this.current || 'core', ms);
  }

  /** Time `fn` and attribute it, or just call it when profiling is off. */
  measure<T>(kind: ProfileKind, owner: string, fn: () => T): T {
    if (!this.enabled) return fn();
    const start = performance.now();
    try {
      return fn();
    } finally {
      this.record(kind, owner, performance.now() - start);
    }
  }

  /** Per-owner totals, heaviest first. */
  report(): OwnerReport[] {
    const byOwner = new Map<string, OwnerReport>();
    for (const [key, bucket] of this.buckets) {
      const [owner, kind] = key.split('\u0000');
      let entry = byOwner.get(owner);
      if (!entry) {
        entry = { owner, total: 0, byKind: {} };
        byOwner.set(owner, entry);
      }
      const sorted = bucket.samples.slice().sort((a, b) => a - b);
      entry.byKind[kind] = {
        count: bucket.count,
        total: round(bucket.total),
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        max: round(bucket.max)
      };
      if (!WAIT_KINDS.has(kind)) entry.total = round(entry.total + bucket.total);
    }
    return [...byOwner.values()].sort((a, b) => b.total - a.total);
  }

  /** Seconds profiling has been running, or null when it is not. */
  runningFor(): number | null {
    if (!this.enabled || this.startedAt == null) return null;
    return Math.round((Date.now() - this.startedAt) / 1000);
  }
}

const profiler = new PackageProfiler();

module.exports = { profiler, PackageProfiler, WAIT_KINDS };
