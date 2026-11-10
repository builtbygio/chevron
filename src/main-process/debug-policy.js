'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SOURCE = /\.(?:js|mjs|cjs)$/;

function refuse(reason) {
  return { ok: false, reason };
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (_) {
    return false;
  }
}

/**
 * A program the node debug adapter may launch. It has to be a JavaScript
 * file inside a project root or the user's home, so the renderer cannot
 * point the debugger at an arbitrary binary.
 */
function validateProgram(program, roots, exists = isFile) {
  if (typeof program !== 'string' || !program || program.includes('\0')) {
    return refuse('program must be a path');
  }
  if (!path.isAbsolute(program)) return refuse('program must be absolute');
  if (!SOURCE.test(program)) return refuse('program must be a JavaScript file');
  const resolved = path.resolve(program);
  const allowed = [...(roots || []), os.homedir()].filter(Boolean).map(r => path.resolve(r));
  const inside = allowed.some(
    root => resolved === root || resolved.startsWith(root + path.sep)
  );
  if (!inside) return refuse('program is outside every project root');
  if (!exists(resolved)) return refuse('program does not exist');
  return { ok: true, program: resolved };
}

function validateBreakpoints(breakpoints, roots, exists = isFile) {
  if (breakpoints == null) return { ok: true, breakpoints: [] };
  if (!Array.isArray(breakpoints)) return refuse('breakpoints must be a list');
  const out = [];
  for (const bp of breakpoints) {
    if (!bp || typeof bp !== 'object') return refuse('breakpoint must be an object');
    const file = validateProgram(bp.path, roots, exists);
    if (!file.ok) return file;
    if (!Number.isInteger(bp.line) || bp.line < 1 || bp.line > 1000000) {
      return refuse('breakpoint line is out of range');
    }
    out.push({ path: file.program, line: bp.line });
  }
  return { ok: true, breakpoints: out };
}

module.exports = { validateProgram, validateBreakpoints };
