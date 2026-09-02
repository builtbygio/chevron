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

const SCOPES = ['source.c', 'source.cpp', 'source.objc', 'source.objcpp'];

const INSTALL_HINT = {
  darwin: 'brew install llvm, or install Xcode command line tools',
  linux:
    'apt install clangd, dnf install clang-tools-extra, or pacman -S clang',
  win32: 'winget install LLVM.LLVM, or scoop install llvm'
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
    try {
      registration = lsp.registerServer({
        id: 'clangd',
        scopes: SCOPES,
        command: 'clangd',
        args: ['--background-index']
      });
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[chevron-lsp-c]', err && err.message);
      }
      return;
    }

    // Say so once, rather than leaving the user with a package that appears
    // installed and does nothing.
    const env = global.chevron || global.atom;
    const resolved =
      lsp.resolveRegistration && lsp.resolveRegistration('source.c');
    if (!resolved && env && env.notifications) {
      const hint = INSTALL_HINT[process.platform] || 'install clangd';
      env.notifications.addInfo(
        'chevron-lsp-c is installed, but clangd is not on your PATH.',
        { detail: `${hint}\n\nNo binary is downloaded: the official clangd build is 228 MB.`, dismissable: true }
      );
    }
  }
};
