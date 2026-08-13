const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const electronLink = require('electron-link');
const terser = require('terser');
const CONFIG = require('../config');
const { hostCanRunMksnapshot } = require('./mksnapshot-host-support');
const {
  shouldSkipCustomSnapshot,
  stockSnapshotNote
} = require('./packaging-policy');
const { shouldExcludeModule } = require('./snapshot-exclude');
const { runCustomMksnapshot } = require('./run-mksnapshot');

function writeStockSnapshotMarker(reason) {
  try {
    const dest = path.join(CONFIG.buildOutputPath, 'STOCK_V8_SNAPSHOT.txt');
    fs.mkdirSync(CONFIG.buildOutputPath, { recursive: true });
    fs.writeFileSync(
      dest,
      `reason=${reason}\nelectron=${CONFIG.appMetadata.electronVersion}\n` +
        `platform=${process.platform}\narch=${process.arch}\n` +
        'See docs/packaging.md and docs/startup-snapshot-plan.md.\n'
    );
  } catch (_) {
    /* non-fatal */
  }
}

module.exports = function(packagedAppPath) {
  // linux-arm* / win-arm*: electron-mksnapshot is x64-only (cross tools run on
  // x64 hosts). Skip custom Atom startup blob; keep Electron stock snapshots.
  if (!hostCanRunMksnapshot()) {
    console.log(
      `\nNOTE: skipping custom startup snapshot on ${process.platform}-${process.arch} — ` +
        'electron-mksnapshot does not run on this host. The packaged app will use ' +
        "Electron's stock V8 snapshots (normal boot, no snapshotResult optimisation).\n"
    );
    writeStockSnapshotMarker('host-unsupported');
    return Promise.resolve();
  }

  const mksnapshotSkippedMarker = path.join(
    CONFIG.scriptRootPath,
    'node_modules',
    'electron-mksnapshot',
    '.skipped-unsupported-host'
  );
  if (fs.existsSync(mksnapshotSkippedMarker)) {
    console.log(
      '\nNOTE: electron-mksnapshot was skipped at install time; ' +
        'using stock Electron V8 snapshots.\n'
    );
    writeStockSnapshotMarker('mksnapshot-install-skipped');
    return Promise.resolve();
  }

  const decision = shouldSkipCustomSnapshot(
    CONFIG.appMetadata.electronVersion,
    {
      force: process.env.CHEVRON_FORCE_MKSNAPSHOT === '1',
      skip: process.env.CHEVRON_SKIP_MKSNAPSHOT === '1'
    }
  );
  if (decision.skip) {
    console.log(`\nNOTE: ${stockSnapshotNote(CONFIG.appMetadata.electronVersion)}\n`);
    writeStockSnapshotMarker(decision.reason);
    return Promise.resolve();
  }

  const snapshotScriptPath = path.join(CONFIG.buildOutputPath, 'startup.js');
  const baseDirPath = path.join(CONFIG.intermediateAppPath, 'static');
  let processedFiles = 0;

  return electronLink({
    baseDirPath,
    mainPath: path.resolve(
      baseDirPath,
      '..',
      'src',
      'initialize-application-window.js'
    ),
    cachePath: path.join(CONFIG.atomHomeDirPath, 'snapshot-cache'),
    auxiliaryData: CONFIG.snapshotAuxiliaryData,
    shouldExcludeModule: ({ requiringModulePath, requiredModulePath }) => {
      if (processedFiles > 0) {
        process.stdout.write('\r');
      }
      process.stdout.write(
        `Generating snapshot script at "${snapshotScriptPath}" (${++processedFiles})`
      );

      return shouldExcludeModule({
        baseDirPath,
        requiringModulePath,
        requiredModulePath
      });
    }
  }).then(({ snapshotScript }) => {
    process.stdout.write('\n');

    process.stdout.write('Minifying startup script');
    const minification = terser.minify(snapshotScript, {
      keep_fnames: true,
      keep_classnames: true,
      compress: { keep_fargs: true, keep_infinity: true }
    });
    if (minification.error) throw minification.error;
    process.stdout.write('\n');
    fs.writeFileSync(snapshotScriptPath, minification.code);

    console.log('Verifying if snapshot can be executed via `mksnapshot`');
    const verifySnapshotScriptPath = path.join(
      CONFIG.repositoryRootPath,
      'script',
      'verify-snapshot-script'
    );
    let nodeBundledInElectronPath;
    if (process.platform === 'darwin') {
      nodeBundledInElectronPath = path.join(
        packagedAppPath,
        'Contents',
        'MacOS',
        CONFIG.executableName
      );
    } else {
      nodeBundledInElectronPath = path.join(
        packagedAppPath,
        CONFIG.executableName
      );
    }
    childProcess.execFileSync(
      nodeBundledInElectronPath,
      [verifySnapshotScriptPath, snapshotScriptPath],
      { env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: 1 }) }
    );

    console.log('Generating startup blob with mksnapshot');
    const mksnapshotBinDir = path.join(
      CONFIG.repositoryRootPath,
      'script',
      'node_modules',
      'electron-mksnapshot',
      'bin'
    );
    const mksnapshotResult = runCustomMksnapshot({
      scriptPath: snapshotScriptPath,
      outputDir: CONFIG.buildOutputPath,
      mksnapshotBinDir
    });
    if (!mksnapshotResult.ok) {
      console.log(
        `\nNOTE: custom snapshot ${mksnapshotResult.stage} failed` +
          (mksnapshotResult.signal
            ? ` (${mksnapshotResult.signal})`
            : mksnapshotResult.status != null
              ? ` (status ${mksnapshotResult.status})`
              : '') +
          (mksnapshotResult.error ? `: ${mksnapshotResult.error}` : '') +
          '. Checking for binaries…\n'
      );
    } else {
      console.log(
        `Custom snapshot ready: blob=${Math.round(
          mksnapshotResult.blobSize / 1024
        )} KB context=${Math.round(mksnapshotResult.contextSize / 1024)} KB`
      );
    }

    let startupBlobDestinationPath;
    if (process.platform === 'darwin') {
      startupBlobDestinationPath = `${packagedAppPath}/Contents/Frameworks/Electron Framework.framework/Resources`;
    } else {
      startupBlobDestinationPath = packagedAppPath;
    }

    // Electron 11 mksnapshot wrote v8_context_snapshot.bin; Electron 14+ writes
    // an arch-suffixed name on macOS (v8_context_snapshot.x86_64.bin / .arm64.bin).
    const snapshotBinaries = [
      {
        candidates: [
          process.arch === 'arm64'
            ? 'v8_context_snapshot.arm64.bin'
            : 'v8_context_snapshot.x86_64.bin',
          'v8_context_snapshot.bin'
        ],
        destination:
          process.platform === 'darwin'
            ? process.arch === 'arm64'
              ? 'v8_context_snapshot.arm64.bin'
              : 'v8_context_snapshot.x86_64.bin'
            : 'v8_context_snapshot.bin'
      },
      {
        candidates: ['snapshot_blob.bin'],
        destination: 'snapshot_blob.bin'
      }
    ];

    const resolvedBinaries = snapshotBinaries.map(snapshotBinary => ({
      ...snapshotBinary,
      sourcePath: snapshotBinary.candidates
        .map(name => path.join(CONFIG.buildOutputPath, name))
        .find(candidate => fs.existsSync(candidate))
    }));

    // Never install a partial pair — a custom snapshot_blob with a stock
    // context snapshot is inconsistent. Fall back to Electron's stock
    // snapshots (plain require path, same as --dev).
    const missing = resolvedBinaries.filter(binary => !binary.sourcePath);
    if (missing.length > 0 || !mksnapshotResult.ok) {
      console.log(
        '\nNOTE: startup snapshot generation failed — the packaged app ' +
          'will use Electron\'s stock V8 snapshots (slower startup, no ' +
          'snapshotResult). Missing: ' +
          (missing.length
            ? missing.map(binary => binary.candidates.join('|')).join(', ')
            : mksnapshotResult.stage || 'custom-pair') +
          '\n'
      );
      writeStockSnapshotMarker(
        mksnapshotResult.ok ? 'missing-binaries' : mksnapshotResult.stage
      );
      return;
    }

    const stockMarker = path.join(
      CONFIG.buildOutputPath,
      'STOCK_V8_SNAPSHOT.txt'
    );
    try {
      fs.unlinkSync(stockMarker);
    } catch (_) {
      /* no stale marker */
    }

    for (let snapshotBinary of resolvedBinaries) {
      const destinationPath = path.join(
        startupBlobDestinationPath,
        snapshotBinary.destination
      );
      console.log(`Moving generated startup blob into "${destinationPath}"`);
      try {
        fs.unlinkSync(destinationPath);
      } catch (err) {
        // Doesn't matter if the file doesn't exist already
        if (!err.code || err.code !== 'ENOENT') {
          throw err;
        }
      }
      fs.renameSync(snapshotBinary.sourcePath, destinationPath);
    }
  });
};
