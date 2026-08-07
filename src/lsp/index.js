'use strict';

/**
 * Renderer-side LSP client activation (Phase 1).
 * Diagnostics, document sync, TypeScript built-in server when project trusted.
 */

const { CompositeDisposable, Emitter } = require('event-kit');
const { ipcRenderer } = require('electron');
const { DocumentSync } = require('./document-sync');
const { isTypescriptScope, languageIdForScope } = require('./language-id');
const { pathToUri } = require('./path-uri');
const { resolveBuiltinServer } = require('./builtin-servers');
const { lspToPoint } = require('./position');

let activated = false;
let disposables = null;
let emitter = null;
let documentSync = null;
/** uri -> Diagnostic[] */
const diagnosticsByUri = new Map();
/** projectRoot -> serverId started */
const startedRoots = new Map();

function getResourcePath() {
  try {
    const { resourcePath } = require('../get-window-load-settings')();
    return resourcePath;
  } catch (_) {
    return null;
  }
}

function projectRootForEditor(editor) {
  const filePath = editor.getPath && editor.getPath();
  if (!filePath || !global.chevron || !global.chevron.project) return null;
  const dirs = global.chevron.project.getDirectories
    ? global.chevron.project.getDirectories()
    : [];
  for (const dir of dirs) {
    const dirPath = dir.getPath && dir.getPath();
    if (dirPath && filePath.startsWith(dirPath)) return dirPath;
  }
  // single file: use dirname
  const path = require('path');
  return path.dirname(filePath);
}

async function ensureServerForEditor(editor) {
  const grammar = editor.getGrammar && editor.getGrammar();
  const scope = grammar && grammar.scopeName;
  if (!isTypescriptScope(scope)) return null;

  const projectRoot = projectRootForEditor(editor);
  if (!projectRoot) return null;

  const trusted = await ipcRenderer.invoke('lsp:is-trusted', { projectRoot });
  if (!trusted) {
    emitter.emit('did-change-trust-needed', { projectRoot });
    return null;
  }

  if (startedRoots.has(projectRoot)) {
    return startedRoots.get(projectRoot);
  }

  const builtin = resolveBuiltinServer(scope, {
    resourcePath: getResourcePath()
  });
  if (!builtin) {
    emitter.emit('did-fail-start', {
      projectRoot,
      message:
        'typescript-language-server not found on PATH. Install it or set PATH.'
    });
    return null;
  }

  try {
    await ipcRenderer.invoke('lsp:start-server', {
      serverId: `${builtin.serverId}:${projectRoot}`,
      projectRoot,
      command: builtin.command,
      args: builtin.args,
      rootUri: pathToUri(projectRoot),
      cwd: projectRoot,
      initializationOptions: builtin.initializationOptions
    });
    const serverId = `${builtin.serverId}:${projectRoot}`;
    startedRoots.set(projectRoot, serverId);
    emitter.emit('did-start-server', { serverId, projectRoot });
    return serverId;
  } catch (err) {
    emitter.emit('did-fail-start', {
      projectRoot,
      message: err.message,
      code: err.code
    });
    return null;
  }
}

function handleLspEvent(_event, msg) {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'notification' && msg.method === 'textDocument/publishDiagnostics') {
    const uri = msg.params && msg.params.uri;
    const diagnostics = (msg.params && msg.params.diagnostics) || [];
    if (uri) {
      diagnosticsByUri.set(uri, diagnostics);
      emitter.emit('did-publish-diagnostics', { uri, diagnostics });
    }
    return;
  }

  if (msg.type === 'server-exit') {
    for (const [root, id] of [...startedRoots]) {
      if (id === msg.serverId) startedRoots.delete(root);
    }
    emitter.emit('did-server-exit', msg);
  }
}

function activate() {
  if (activated) return exports;
  activated = true;
  disposables = new CompositeDisposable();
  emitter = new Emitter();

  ipcRenderer.invoke('lsp:subscribe').catch(() => {});
  ipcRenderer.on('lsp:event', handleLspEvent);

  documentSync = new DocumentSync({
    notify: (serverId, method, params) => {
      ipcRenderer.invoke('lsp:notify', { serverId, method, params }).catch(() => {});
    },
    getServerIdForEditor: editor => {
      const root = projectRootForEditor(editor);
      return root ? startedRoots.get(root) : null;
    }
  });

  const env = global.chevron || global.atom;
  if (env && env.workspace) {
    disposables.add(
      env.workspace.observeTextEditors(async editor => {
        const serverId = await ensureServerForEditor(editor);
        if (serverId) documentSync.observeEditor(editor);
      })
    );
  }

  if (env && env.commands) {
    disposables.add(
      env.commands.add('atom-workspace', {
        'chevron-lsp:trust-project': async () => {
          const root =
            env.project &&
            env.project.getPaths &&
            env.project.getPaths()[0];
          if (!root) {
            env.notifications &&
              env.notifications.addWarning('No project folder open');
            return;
          }
          await ipcRenderer.invoke('lsp:set-trust', {
            projectRoot: root,
            trusted: true
          });
          env.notifications &&
            env.notifications.addSuccess(`Trusted project for language servers:\n${root}`);
          // Re-scan open editors
          for (const editor of env.workspace.getTextEditors()) {
            const serverId = await ensureServerForEditor(editor);
            if (serverId) documentSync.observeEditor(editor);
          }
        },
        'chevron-lsp:untrust-project': async () => {
          const root =
            env.project &&
            env.project.getPaths &&
            env.project.getPaths()[0];
          if (!root) return;
          await ipcRenderer.invoke('lsp:set-trust', {
            projectRoot: root,
            trusted: false
          });
          env.notifications &&
            env.notifications.addInfo('Project untrusted; language servers stopped for new files');
        },
        'chevron-lsp:status': async () => {
          const servers = await ipcRenderer.invoke('lsp:list-servers');
          const trusted = await ipcRenderer.invoke('lsp:list-trusted');
          const lines = [
            `Trusted roots: ${trusted.length}`,
            ...trusted.map(r => `  • ${r}`),
            `Servers: ${servers.length}`,
            ...servers.map(
              s => `  • ${s.serverId} state=${s.state} pid=${s.pid || '?'}`
            )
          ];
          env.notifications &&
            env.notifications.addInfo(lines.join('\n'), { dismissable: true });
        }
      })
    );
  }

  return exports;
}

function deactivate() {
  if (!activated) return;
  activated = false;
  ipcRenderer.removeListener('lsp:event', handleLspEvent);
  ipcRenderer.invoke('lsp:unsubscribe').catch(() => {});
  if (disposables) disposables.dispose();
  disposables = null;
  diagnosticsByUri.clear();
  startedRoots.clear();
}

function getDiagnostics(uri) {
  return diagnosticsByUri.get(uri) || [];
}

function onDidPublishDiagnostics(cb) {
  return emitter.on('did-publish-diagnostics', cb);
}

function onDidChangeTrustNeeded(cb) {
  return emitter.on('did-change-trust-needed', cb);
}

function onDidFailStart(cb) {
  return emitter.on('did-fail-start', cb);
}

module.exports = {
  activate,
  deactivate,
  getDiagnostics,
  onDidPublishDiagnostics,
  onDidChangeTrustNeeded,
  onDidFailStart,
  // test hooks
  _internals: {
    projectRootForEditor,
    diagnosticsByUri,
    startedRoots
  }
};
