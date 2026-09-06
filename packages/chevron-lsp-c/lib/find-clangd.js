'use strict';

/**
 * Ask the editor where clangd is.
 *
 * This used to search PATH, the Xcode toolchain, Homebrew and the LLVM
 * installer directories itself, with `fs`. Once cpm installs this package it
 * is community code, privileged requires are blocked, and that threw at load —
 * taking the whole package with it (docs/reference/package-node-policy.md).
 *
 * The search moved to src/lsp/builtin-servers.js, which is core and may look
 * at /usr/bin. It also knows about the copy cpm downloads into this package.
 * All that is left here is asking.
 */

const CLANGD_SCOPE = 'source.c';

function findClangd(lsp) {
  if (!lsp || typeof lsp.resolveRegistration !== 'function') return null;
  let registration;
  try {
    registration = lsp.resolveRegistration(CLANGD_SCOPE);
  } catch (error) {
    return null;
  }
  if (!registration || !registration.command) return null;
  return {
    command: registration.command,
    args: Array.isArray(registration.args) ? registration.args.slice() : [],
    source: registration.source || 'editor'
  };
}

module.exports = { findClangd, CLANGD_SCOPE };
