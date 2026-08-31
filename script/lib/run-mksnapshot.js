'use strict';

/**
 * Run electron-mksnapshot's binaries against a custom startup script.
 *
 * electron-mksnapshot 43's mksnapshot.js runs v8_context_snapshot_generator
 * with cwd=stock bin, so it serializes the *stock* isolate blob. We copy the
 * toolkit to a temp dir, run both tools there (custom snapshot_blob.bin in
 * cwd), and copy the pair out.
 */

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeTempDir } = require('./temp-dir');

const STOCK_CONTEXT_MAX_BYTES = 2 * 1024 * 1024;

function contextFileName(platform = process.platform, arch = process.arch) {
  if (platform === 'darwin') {
    return arch === 'arm64'
      ? 'v8_context_snapshot.arm64.bin'
      : 'v8_context_snapshot.x86_64.bin';
  }
  return 'v8_context_snapshot.bin';
}

function runCustomMksnapshot({
  scriptPath,
  outputDir,
  mksnapshotBinDir,
  stdio = 'inherit'
}) {
  fs.mkdirSync(outputDir, { recursive: true });
  const workDir = makeTempDir('chevron-mksnap-');
  fs.cpSync(mksnapshotBinDir, workDir, { recursive: true });

  const absScript = path.resolve(scriptPath);
  const argsFile = path.join(mksnapshotBinDir, 'mksnapshot_args');
  const fileArgs = fs
    .readFileSync(argsFile, 'utf8')
    .split(/\r?\n/)
    .filter(
      arg =>
        arg &&
        arg !== './mksnapshot' &&
        !/turbo-profiling/.test(arg) &&
        !/builtins-pgo/.test(arg)
    );

  const mksnapshotBin =
    process.platform === 'win32'
      ? path.join(workDir, 'mksnapshot.exe')
      : path.join(workDir, 'mksnapshot');
  const generatorBin =
    process.platform === 'win32'
      ? path.join(workDir, 'v8_context_snapshot_generator.exe')
      : path.join(workDir, 'v8_context_snapshot_generator');

  const mk = childProcess.spawnSync(mksnapshotBin, [absScript, ...fileArgs], {
    cwd: workDir,
    stdio
  });
  if (mk.status !== 0) {
    return {
      ok: false,
      stage: 'mksnapshot',
      status: mk.status,
      signal: mk.signal
    };
  }

  const customBlob = path.join(workDir, 'snapshot_blob.bin');
  if (!fs.existsSync(customBlob)) {
    return { ok: false, stage: 'mksnapshot', error: 'missing snapshot_blob.bin' };
  }

  const destContextName = contextFileName();
  const destContext = path.join(outputDir, destContextName);
  const gen = childProcess.spawnSync(
    generatorBin,
    [`--output_file=${destContext}`],
    { cwd: workDir, stdio }
  );
  if (gen.status !== 0) {
    return {
      ok: false,
      stage: 'generator',
      status: gen.status,
      signal: gen.signal
    };
  }

  const destBlob = path.join(outputDir, 'snapshot_blob.bin');
  fs.copyFileSync(customBlob, destBlob);

  if (!fs.existsSync(destContext)) {
    return { ok: false, stage: 'generator', error: 'missing context snapshot' };
  }
  const contextSize = fs.statSync(destContext).size;
  if (contextSize <= STOCK_CONTEXT_MAX_BYTES) {
    return {
      ok: false,
      stage: 'generator',
      error: `context snapshot ${contextSize} bytes looks like Electron stock (expected > ${STOCK_CONTEXT_MAX_BYTES})`
    };
  }

  return {
    ok: true,
    blobPath: destBlob,
    contextPath: destContext,
    blobSize: fs.statSync(destBlob).size,
    contextSize
  };
}

module.exports = {
  STOCK_CONTEXT_MAX_BYTES,
  contextFileName,
  runCustomMksnapshot
};
