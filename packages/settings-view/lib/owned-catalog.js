'use strict';

// The owned catalog: packages Chevron publishes but does not bundle.
//
// Everything here exists in packages/ and is deliberately absent from the
// app's packageDependencies, so it has to be installed rather than shipped.
// script/ci/install-panel.test.js checks that claim against the tree, so an
// entry cannot drift into describing a package that ships or does not exist.
//
// `scopes` is what each package registers with the LSP client. It is what lets
// the "no language server for <scope>" notice point at a specific package
// rather than a generic install flow.
module.exports = [
  {
    name: 'chevron-lsp-typescript',
    version: '0.1.0',
    title: 'TypeScript language server',
    description:
      'TypeScript and JavaScript support: completions, diagnostics, ' +
      'go-to-definition, rename.',
    scopes: [
      'source.ts',
      'source.tsx',
      'source.js',
      'source.js.jsx',
      'source.jsx',
      'source.flow'
    ]
  },
  {
    name: 'chevron-lsp-python',
    version: '0.1.0',
    title: 'Python language server',
    description: 'Python support through Pyright.',
    scopes: ['source.python']
  },
  {
    name: 'chevron-lsp-c',
    version: '0.1.0',
    title: 'C / C++ language server',
    description:
      'C, C++ and Objective-C through clangd. Uses one already on your ' +
      'machine; downloads it only if there is none.',
    scopes: ['source.c', 'source.cpp', 'source.objc', 'source.objcpp']
  },
  {
    name: 'chevron-lsp-json',
    version: '0.1.0',
    title: 'JSON language server',
    description:
      'JSON support through vscode-json-languageserver: schema validation, ' +
      'completions and hovers.',
    scopes: ['source.json']
  },
  {
    name: 'chevron-lsp-markdown',
    version: '0.1.0',
    title: 'Prose language server',
    description:
      'Grammar, spelling and style for Markdown and plain text, offline, ' +
      'through harper-ls.',
    scopes: ['source.gfm', 'text.plain']
  },
  {
    name: 'chevron-lsp-rust',
    version: '0.1.0',
    title: 'Rust language server',
    description: 'Rust support through rust-analyzer.',
    scopes: ['source.rust']
  }
];
