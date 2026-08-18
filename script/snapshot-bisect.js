#!/usr/bin/env node
'use strict';

/**
 * Fast snapshot loop: electron-link + mksnapshot + v8_context_snapshot_generator.
 * Skips transpile, packaging, and minify. Exit 0 if the generator succeeds.
 *
 *   node script/snapshot-bisect.js --mode=core
 *   node script/snapshot-bisect.js --mode=first-paint
 *   node script/snapshot-bisect.js --mode=full
 *   node script/snapshot-bisect.js --mode=no-execute --skip-link
 *   node script/snapshot-bisect.js --mode=core --exclude=text-editor-component
 *
 * Requires an existing intermediate app at out/app (script/build --no-bootstrap).
 */

const fs = require('fs');
const path = require('path');
const electronLink = require('electron-link');
const terser = require('terser');
const CONFIG = require('./config');
const { shouldExcludeModule } = require('./lib/snapshot-exclude');
const { runCustomMksnapshot } = require('./lib/run-mksnapshot');
const {
  SNAPSHOT_STARTUP_PACKAGES
} = require('../src/deferred-startup-packages');

const args = parseArgs(process.argv.slice(2));
const mode = args.mode || 'eval-only';
const extraSubstrings = args.exclude || [];
const snapshotDir = path.join(CONFIG.buildOutputPath, 'snapshot-bisect', mode);
const snapshotScriptPath = path.join(snapshotDir, 'startup.js');
const initPath = path.join(
  CONFIG.intermediateAppPath,
  'src',
  'initialize-application-window.js'
);

main().catch(err => {
  console.error(err);
  process.exit(1);
});

async function main() {
  if (!fs.existsSync(initPath)) {
    throw new Error(
      `Missing ${initPath}. Run script/build --no-bootstrap first.`
    );
  }

  fs.mkdirSync(snapshotDir, { recursive: true });

  if (mode === 'trivial') {
    fs.writeFileSync(
      snapshotScriptPath,
      'var snapshotResult = { customRequire: function () {}, setGlobals: function () {} };\n'
    );
    return runMksnapshot(snapshotScriptPath, snapshotDir);
  }

  if (!args.skipLink) {
    await linkSnapshot();
  } else if (!fs.existsSync(snapshotScriptPath)) {
    throw new Error(`--skip-link but missing ${snapshotScriptPath}`);
  }

  if (mode === 'no-execute') {
    const script = fs.readFileSync(snapshotScriptPath, 'utf8');
    const stripped = script.replace(
      /var snapshotResult = generateSnapshot\.call\(\{\}\)/,
      'var snapshotResult = { customRequire: function () {}, setGlobals: function () {} }'
    );
    if (stripped === script) {
      throw new Error('Could not find generateSnapshot.call({}) to strip');
    }
    fs.writeFileSync(snapshotScriptPath, stripped);
    console.log('Stripped generateSnapshot.call({}) (definitions only)');
  }

  if (!args.skipMinify) {
    minifySnapshot(snapshotScriptPath);
  }

  return runMksnapshot(snapshotScriptPath, snapshotDir);
}

function minifySnapshot(scriptPath) {
  const src = fs.readFileSync(scriptPath, 'utf8');
  console.log(`Minifying ${Math.round(src.length / 1024)} KB`);
  const started = Date.now();
  const result = terser.minify(src, {
    keep_fnames: true,
    keep_classnames: true,
    compress: { keep_fargs: true, keep_infinity: true }
  });
  if (result.error) throw result.error;
  fs.writeFileSync(scriptPath, result.code);
  console.log(
    `Minified to ${Math.round(result.code.length / 1024)} KB in ${Date.now() -
      started} ms`
  );
}

async function linkSnapshot() {
  const original = fs.readFileSync(initPath, 'utf8');
  const patched = patchInitForMode(original, mode);
  const didPatch = patched !== original;
  if (didPatch) {
    fs.writeFileSync(initPath, patched);
    console.log(`Patched initialize-application-window.js for mode=${mode}`);
  }

  const baseDirPath = path.join(CONFIG.intermediateAppPath, 'static');
  const cachePath = path.join(
    CONFIG.atomHomeDirPath,
    `snapshot-cache-bisect-${mode}`
  );
  let processedFiles = 0;
  const started = Date.now();

  try {
    const { snapshotScript } = await electronLink({
      baseDirPath,
      mainPath: path.resolve(
        baseDirPath,
        '..',
        'src',
        'initialize-application-window.js'
      ),
      cachePath,
      auxiliaryData: CONFIG.snapshotAuxiliaryData,
      shouldExcludeModule: ({ requiringModulePath, requiredModulePath }) => {
        processedFiles += 1;
        if (processedFiles % 50 === 0) {
          process.stdout.write(
            `\rLinking ${processedFiles} modules (${mode})`
          );
        }
        return shouldExcludeModule({
          baseDirPath,
          requiringModulePath,
          requiredModulePath,
          extraSubstrings
        });
      }
    });
    process.stdout.write(
      `\nLinked ${processedFiles} modules in ${Date.now() - started} ms\n`
    );
    fs.writeFileSync(snapshotScriptPath, snapshotScript);
    console.log(
      `Wrote ${snapshotScriptPath} (${Math.round(
        Buffer.byteLength(snapshotScript) / 1024
      )} KB)`
    );
  } finally {
    if (didPatch) {
      fs.writeFileSync(initPath, original);
    }
  }
}

function patchInitForMode(source, snapshotMode) {
  const blockRe = /if \(global\.isGeneratingSnapshot\) \{[\s\S]*?\n\}/;
  const constructRe = /const clipboard = new Clipboard\(\);[\s\S]*?global\.chevron\.preloadPackages\(\);/;
  if (snapshotMode === 'no-execute') {
    return source;
  }
  if (snapshotMode === 'ctor') {
    const requires = SNAPSHOT_STARTUP_PACKAGES.map(
      name => `  require('${name}');`
    ).join('\n');
    return source
      .replace(
        blockRe,
        `if (global.isGeneratingSnapshot) {\n${requires}\n}`
      )
      .replace(
        'if (!global.isGeneratingSnapshot) {\n  installEnvironment();\n}',
        'installEnvironment(); // ctor probe: construct during snapshot'
      );
  }
  if (snapshotMode === 'full') {
    return source.replace(
      constructRe,
      `function installEnvironment() {
  if (global.chevron) return global.chevron;
  const clipboard = new Clipboard();
  TextEditor.setClipboard(clipboard);
  TextEditor.viewForItem = item => atom.views.getView(item);
  const atomEnvironment = new AtomEnvironment({
    clipboard,
    applicationDelegate: new ApplicationDelegate(),
    enablePersistence: true
  });
  global.chevron = atomEnvironment;
  global.chevron = atomEnvironment;
  TextEditor.setScheduler(global.chevron.views);
  global.chevron.preloadPackages();
  return atomEnvironment;
}
if (!global.isGeneratingSnapshot) {
  installEnvironment();
}`
    );
  }

  let next = source;
  if (snapshotMode === 'core' || snapshotMode === 'eval-only') {
    next = next.replace(
      blockRe,
      'if (global.isGeneratingSnapshot) {\n  // no bundled package mains\n}'
    );
  } else if (snapshotMode === 'first-paint') {
    const requires = SNAPSHOT_STARTUP_PACKAGES.map(
      name => `  require('${name}');`
    ).join('\n');
    next = next.replace(
      blockRe,
      `if (global.isGeneratingSnapshot) {\n${requires}\n}`
    );
  }

  // Evaluate modules into the snapshot cache but do not construct AtomEnvironment
  // (constructor heap is what v8_context_snapshot_generator SIGTRAPs on).
  if (
    snapshotMode === 'core' ||
    snapshotMode === 'eval-only' ||
    snapshotMode === 'first-paint'
  ) {
    next = next.replace(
      constructRe,
      `function installEnvironment() {
  if (global.chevron) return global.chevron;
  const clipboard = new Clipboard();
  TextEditor.setClipboard(clipboard);
  TextEditor.viewForItem = item => atom.views.getView(item);
  const atomEnvironment = new AtomEnvironment({
    clipboard,
    applicationDelegate: new ApplicationDelegate(),
    enablePersistence: true
  });
  global.chevron = atomEnvironment;
  global.chevron = atomEnvironment;
  TextEditor.setScheduler(global.chevron.views);
  global.chevron.preloadPackages();
  return atomEnvironment;
}
if (!global.isGeneratingSnapshot) {
  installEnvironment();
}`
    );
  }
  return next;
}

function runMksnapshot(scriptPath, outputDir) {
  console.log(`Running mksnapshot + generator (${mode})`);
  const result = runCustomMksnapshot({
    scriptPath,
    outputDir,
    mksnapshotBinDir: path.join(
      CONFIG.repositoryRootPath,
      'script',
      'node_modules',
      'electron-mksnapshot',
      'bin'
    )
  });
  console.log(
    result.ok
      ? `PASS mode=${mode} extras=${extraSubstrings.join(',') || '(none)'} context=${Math.round(result.contextSize / 1024)} KB`
      : `FAIL ${result.stage} mode=${mode} status=${result.status} signal=${result.signal} ${result.error || ''} extras=${extraSubstrings.join(',') || '(none)'}`
  );
  process.exit(result.ok ? 0 : 1);
}

function parseArgs(argv) {
  const out = { exclude: [] };
  for (const arg of argv) {
    if (arg === '--skip-link') {
      out.skipLink = true;
    } else if (arg.startsWith('--mode=')) {
      out.mode = arg.slice('--mode='.length);
    } else if (arg.startsWith('--exclude=')) {
      out.exclude = arg
        .slice('--exclude='.length)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    } else if (arg === '--skip-minify') {
      out.skipMinify = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node script/snapshot-bisect.js --mode=core|first-paint|full|no-execute|trivial [--exclude=a,b] [--skip-link]'
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}
