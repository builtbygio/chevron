'use strict';

/**
 * C, C++ and Objective-C support through clangd — resolved from PATH.
 *
 * No binary is shipped, and none is downloaded. The official clangd release is
 * 228 MB unpacked (a 138 MB statically linked binary plus 80 MB of clang
 * resource headers it needs at run time), which is not a reasonable size for
 * an optional package. A clangd from a package manager is 2-30 MB because it
 * links the system LLVM, and most people writing C already have one.
 *
 * `command` is the bare name, so registry.resolveCommand() finds it with
 * which(). When it is absent the registration resolves to nothing, no server
 * is registered, and the editor's existing "no language server" notice
 * explains the situation -- which is the documented "or put the server on
 * PATH" path in docs/reference/lsp-server-distribution.md.
 *
 * Binary distributor only. Do not require('event-kit') or 'fs' -- this is a
 * T2 user package.
 */

const { findClangd } = require('./find-clangd');

const SCOPES = ['source.c', 'source.cpp', 'source.objc', 'source.objcpp'];

const INSTALL_HINT = {
  darwin:
    'xcode-select --install, or brew install llvm (Homebrew keeps llvm ' +
    'keg-only, so clangd will not be on PATH -- this package looks in the ' +
    'usual Homebrew and Xcode locations anyway)',
  linux:
    'apt install clangd, dnf install clang-tools-extra, or pacman -S clang',
  win32:
    'winget install LLVM.LLVM, or scoop install llvm (the installer does not ' +
    'always add it to PATH -- this package looks in Program Files as well)'
};

let registration = null;

module.exports = {
  activate() {},

  deactivate() {
    if (registration && typeof registration.dispose === 'function') {
      registration.dispose();
    }
    registration = null;
  },

  consumeLsp(lsp) {
    if (!lsp || typeof lsp.registerServer !== 'function') return;
    // Resolve here rather than leaving it to the registry's which(): that
    // only searches PATH, which finds clangd on most Linux installs and
    // misses the Xcode, Homebrew and LLVM-installer locations that hold it on
    // macOS and Windows.
    const found = findClangd();
    const env = global.chevron || global.atom;

    if (!found) {
      if (env && env.notifications) {
        const hint = INSTALL_HINT[process.platform] || 'install clangd';
        env.notifications.addInfo(
          'chevron-lsp-c is installed, but no clangd was found.',
          {
            detail:
              `${hint}\n\ncpm downloads clangd when the machine has none, ` +
              'so reaching this means the download did not complete. ' +
              'Installing clangd yourself is smaller anyway: about 13 MB ' +
              'from a package manager, against 218 MB for the official build.',
            dismissable: true
          }
        );
      }
      return;
    }

    try {
      registration = lsp.registerServer({
        id: 'clangd',
        scopes: SCOPES,
        command: found.command,
        args: ['--background-index']
      });
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[chevron-lsp-c]', err && err.message);
      }
    }
  }
};
