'use strict';

/**
 * Fix tree-view crash on modern Node/Electron when opening a project folder.
 *
 * modern fs.Stats only own-enumerates *Ms fields (atimeMs, …). Date accessors
 * (atime, mtime, …) live on the prototype. tree-view did:
 *   stats = _.pick(stats, _.keys(stats))
 *   stats.mtime = stats.mtime.getTime()  // throws: undefined.getTime
 *
 * directory.js already guarded with `&&` but still lost times after pick.
 * Idempotent. Run from bootstrap-modern after apm install.
 *
 * Usage: node script/lib/patch-tree-view-stats.js [repoRoot]
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));

function patchFile(rel, transform) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) {
    console.log(`skip missing: ${rel}`);
    return false;
  }
  const before = fs.readFileSync(abs, 'utf8');
  const after = transform(before);
  if (after === before) {
    console.log(`ok (already or no match): ${rel}`);
    return false;
  }
  fs.writeFileSync(abs, after);
  console.log(`patched: ${rel}`);
  return true;
}

const COFFEE_BROKEN = `        stats = _.pick stats, _.keys(stats)...
        for key in ["atime", "birthtime", "ctime", "mtime"]
          stats[key] = stats[key].getTime()`;

const COFFEE_FIXED = `        # Flatten Stats for Directory: modern Node only own-enumerates *Ms
        # fields; Date getters live on the prototype and are lost after _.pick.
        rawStats = stats
        stats = _.pick rawStats, _.keys(rawStats)...
        for key in ["atime", "birthtime", "ctime", "mtime"]
          if rawStats[key]?.getTime?
            stats[key] = rawStats[key].getTime()
          else if rawStats["#{key}Ms"]?
            stats[key] = rawStats["#{key}Ms"]`;

const COFFEE_FIXED_MARKER = 'rawStats = stats';

const JS_BROKEN = `      const statFlat = _.pick(stat, _.keys(stat))
      for (let key of ['atime', 'birthtime', 'ctime', 'mtime']) {
        statFlat[key] = statFlat[key] && statFlat[key].getTime()
      }`;

const JS_FIXED = `      // Prefer prototype Date getters / *Ms before _.pick drops them (Node 18+).
      const statFlat = _.pick(stat, _.keys(stat))
      for (let key of ['atime', 'birthtime', 'ctime', 'mtime']) {
        if (stat[key] && typeof stat[key].getTime === 'function') {
          statFlat[key] = stat[key].getTime()
        } else if (typeof stat[\`\${key}Ms\`] === 'number') {
          statFlat[key] = stat[\`\${key}Ms\`]
        }
      }`;

const JS_FIXED_MARKER = 'typeof stat[key].getTime === \'function\'';

// Compiled CoffeeScript form produced by Atom's build (tree-view.js)
const COMPILED_BROKEN = `            stats = _.pick.apply(_, [stats].concat(slice.call(_.keys(stats))));
            ref3 = ["atime", "birthtime", "ctime", "mtime"];
            for (l = 0, len2 = ref3.length; l < len2; l++) {
              key = ref3[l];
              stats[key] = stats[key].getTime();
            }`;

const COMPILED_FIXED = `            rawStats = stats;
            stats = _.pick.apply(_, [rawStats].concat(slice.call(_.keys(rawStats))));
            ref3 = ["atime", "birthtime", "ctime", "mtime"];
            for (l = 0, len2 = ref3.length; l < len2; l++) {
              key = ref3[l];
              if ((rawDate = rawStats[key]) != null ? rawDate.getTime : void 0) {
                stats[key] = rawStats[key].getTime();
              } else if (rawStats[key + "Ms"] != null) {
                stats[key] = rawStats[key + "Ms"];
              }
            }`;

const COMPILED_FIXED_MARKER = 'rawStats = stats;';

const candidates = [
  'node_modules/tree-view/lib/tree-view.coffee',
  'out/app/node_modules/tree-view/lib/tree-view.coffee',
  'node_modules/tree-view/lib/directory.js',
  'out/app/node_modules/tree-view/lib/directory.js',
  'out/app/node_modules/tree-view/lib/tree-view.js'
];

let changed = 0;

for (const rel of candidates) {
  if (rel.endsWith('tree-view.coffee')) {
    if (
      patchFile(rel, t => {
        if (t.includes(COFFEE_FIXED_MARKER)) return t;
        if (!t.includes(COFFEE_BROKEN)) return t;
        return t.replace(COFFEE_BROKEN, COFFEE_FIXED);
      })
    ) {
      changed++;
    }
  } else if (rel.endsWith('directory.js')) {
    if (
      patchFile(rel, t => {
        if (t.includes(JS_FIXED_MARKER)) return t;
        if (!t.includes(JS_BROKEN)) return t;
        return t.replace(JS_BROKEN, JS_FIXED);
      })
    ) {
      changed++;
    }
  } else if (rel.endsWith('tree-view.js')) {
    if (
      patchFile(rel, t => {
        if (t.includes(COMPILED_FIXED_MARKER) && t.includes('rawStats[key + "Ms"]')) {
          return t;
        }
        if (!t.includes('stats[key] = stats[key].getTime()')) return t;
        if (t.includes(COMPILED_BROKEN)) {
          return t.replace(COMPILED_BROKEN, COMPILED_FIXED);
        }
        // Looser match for slightly different coffee output
        return t.replace(
          /stats = _\.pick\.apply\(_, \[stats\]\.concat\(slice\.call\(_\.keys\(stats\)\)\)\);\s*ref3 = \["atime", "birthtime", "ctime", "mtime"\];\s*for \(l = 0, len2 = ref3\.length; l < len2; l\+\+\) \{\s*key = ref3\[l\];\s*stats\[key\] = stats\[key\]\.getTime\(\);\s*\}/,
          COMPILED_FIXED.trim()
        );
      })
    ) {
      changed++;
    }
  }
}

console.log(`tree-view stats patches finished (${changed} file(s) changed)`);
