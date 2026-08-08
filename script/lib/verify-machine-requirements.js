'use strict';

/**
 * Host toolchain gate for bootstrap-modern / CI.
 * Matches script/lib/modern-env.sh contract:
 *   Node 20–24 (prefer 24 via .nvmrc), Python 3.11–3.13 (+ setuptools on 3.12+).
 */

const childProcess = require('child_process');
const path = require('path');
const fs = require('fs');

const NODE_MIN_MAJOR = 20;
const NODE_MAX_MAJOR = 24;
const PYTHON_MIN = [3, 11];
const PYTHON_MAX_MINOR_FOR_3 = 13; // 3.11–3.13 inclusive

module.exports = function verifyMachineRequirements(ci) {
  verifyNode(ci);
  verifyPython(ci);
};

function verifyNode(ci) {
  const fullVersion = process.versions.node;
  const major = Number(fullVersion.split('.')[0]);
  if (major >= NODE_MIN_MAJOR && major <= NODE_MAX_MAJOR) {
    console.log(`Node:\tv${fullVersion} (host; range ${NODE_MIN_MAJOR}–${NODE_MAX_MAJOR})`);
    return;
  }
  throw new Error(
    `Chevron bootstrap requires Node ${NODE_MIN_MAJOR}–${NODE_MAX_MAJOR} ` +
      `(prefer 24 via \`nvm use\` / .nvmrc). Found v${fullVersion}.\n` +
      'See docs/toolchain-node-python-upgrade-plan.md and script/bootstrap-modern.'
  );
}

function parsePythonVersion(stdout) {
  if (!stdout) return null;
  let s = stdout.toString().trim();
  s = s.replace(/\+/g, '').replace(/rc.*$/i, '').replace(/a\d+$/i, '').replace(/b\d+$/i, '');
  const parts = s.split('.').map(n => Number(n));
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  return { major: parts[0], minor: parts[1], full: s };
}

function isAcceptablePython(ver) {
  if (!ver) return false;
  if (ver.major !== 3) return false;
  if (ver.minor < PYTHON_MIN[1]) return false;
  if (ver.minor > PYTHON_MAX_MINOR_FOR_3) return false;
  return true;
}

function tryPythonBinary(binary, args = []) {
  if (!binary) return null;
  try {
    const stdout = childProcess.execFileSync(
      binary,
      args.concat(['-c', 'import platform; print(platform.python_version())']),
      { env: process.env, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return parsePythonVersion(stdout);
  } catch (_) {
    return null;
  }
}

function verifySetuptools(binary) {
  try {
    childProcess.execFileSync(
      binary,
      ['-c', 'import setuptools; print(setuptools.__version__)'],
      { env: process.env, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return true;
  } catch (_) {
    return false;
  }
}

function verifyPython(ci) {
  const candidates = [];
  const push = (bin, args) => {
    if (bin) candidates.push({ bin, args: args || [] });
  };

  push(process.env.NODE_GYP_FORCE_PYTHON);
  push(process.env.PYTHON);
  push(process.env.npm_config_python);
  // Prefer explicit 3.12/3.11 (modern-env), then python3, then python
  for (const name of ['python3.12', 'python3.13', 'python3.11', 'python3', 'python']) {
    push(name);
  }
  if (process.platform === 'win32') {
    push('py.exe', ['-3.12']);
    push('py.exe', ['-3.11']);
    push('py.exe', ['-3']);
  }

  let found = null;
  let foundBin = null;
  const tried = [];

  for (const { bin, args } of candidates) {
    const ver = tryPythonBinary(bin, args);
    const label = args.length ? `${bin} ${args.join(' ')}` : bin;
    tried.push(`${label} → ${ver ? ver.full : 'n/a'}`);
    if (ver && isAcceptablePython(ver)) {
      found = ver;
      foundBin = bin;
      break;
    }
  }

  if (!found) {
    throw new Error(
      'Python 3.11–3.13 is required to build Chevron natives (prefer 3.12 + setuptools).\n' +
        'Tried:\n  ' +
        tried.join('\n  ') +
        '\nSet PYTHON or NODE_GYP_FORCE_PYTHON, or: brew install python@3.12 && python3.12 -m pip install setuptools\n' +
        'See docs/toolchain-node-python-upgrade-plan.md'
    );
  }

  // 3.12+ need setuptools (distutils removed)
  if (found.minor >= 12 && foundBin) {
    if (!verifySetuptools(foundBin)) {
      throw new Error(
        `Python ${found.full} found but setuptools is missing (required for node-gyp on 3.12+).\n` +
          `Install: ${foundBin} -m pip install setuptools`
      );
    }
  }

  console.log(`Python:\tv${found.full}`);
}

// test exports
module.exports._test = {
  parsePythonVersion,
  isAcceptablePython,
  NODE_MIN_MAJOR,
  NODE_MAX_MAJOR
};
