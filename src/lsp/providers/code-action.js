'use strict';

/**
 * textDocument/codeAction + codeAction/resolve
 */

const { pointToLsp, pointToLspWithEncoding } = require('../position');
const { pathToUri } = require('../path-uri');
const { normalizeMarkup } = require('../markup');

function positionFor(client, editor, serverId, pos) {
  const encoding =
    (client.getPositionEncoding && client.getPositionEncoding(serverId)) ||
    'utf-16';
  if (encoding === 'utf-8' && editor.lineTextForBufferRow) {
    const line = editor.lineTextForBufferRow(pos.row) || '';
    return pointToLspWithEncoding(line, pos, 'utf-8');
  }
  return pointToLsp(pos);
}

/**
 * Normalize CodeAction | Command list.
 * @returns {Array<{ title: string, kind?: string, isCommand: boolean, edit?: object, command?: object, raw: object }>}
 */
function normalizeCodeActions(result) {
  if (!Array.isArray(result)) return [];
  const out = [];
  for (const item of result) {
    if (!item) continue;
    if (typeof item === 'string') continue;
    // Command
    if (item.command && !item.title && typeof item.command === 'string') {
      out.push({
        title: item.title || item.command,
        isCommand: true,
        command: item,
        disabled: item.disabled || null,
        raw: item
      });
      continue;
    }
    // CodeAction
    if (item.title) {
      out.push({
        title: item.title,
        kind: item.kind,
        isCommand: !item.edit && Boolean(item.command),
        edit: item.edit || null,
        command: item.command || null,
        disabled: item.disabled || null,
        diagnostics: item.diagnostics,
        raw: item
      });
    }
  }
  return out;
}

function pointAtOrBefore(a, b) {
  if (!a || !b) return false;
  if (a.row !== b.row) return a.row < b.row;
  return (a.column || 0) <= (b.column || 0);
}

// Touching counts. A caret sitting on the first character of a diagnostic
// still belongs to that diagnostic.
function bufferRangesOverlap(a, b) {
  if (!a || !b || !a.start || !a.end || !b.start || !b.end) return false;
  return pointAtOrBefore(a.start, b.end) && pointAtOrBefore(b.start, a.end);
}

function isWorkspaceEdit(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Array.isArray(value.documentChanges)) return true;
  return Boolean(
    value.changes &&
      typeof value.changes === 'object' &&
      !Array.isArray(value.changes)
  );
}

// typescript-language-server quick fixes have no `edit`. The WorkspaceEdit
// rides in command.arguments of `_typescript.applyWorkspaceEdit`, and the
// server's only response to that command is to ask the client to apply it.
const TYPESCRIPT_APPLY_EDIT = '_typescript.applyWorkspaceEdit';

function workspaceEditFromCommand(command) {
  if (!command || typeof command !== 'object') return null;
  if (command.command !== TYPESCRIPT_APPLY_EDIT) return null;
  const args = Array.isArray(command.arguments) ? command.arguments : [];
  for (const arg of args) {
    if (isWorkspaceEdit(arg)) return arg;
    if (arg && isWorkspaceEdit(arg.edit)) return arg.edit;
  }
  return null;
}

/**
 * How to run one code action. `edit` is applied locally. A command is sent
 * with workspace/executeCommand only when the edit does not already contain
 * the change (refactors, organize imports).
 * @returns {{ kind: 'edit'|'command'|'disabled'|'empty', edit?: object, command?: object, reason?: string }}
 */
function planCodeActionApply(action) {
  if (!action) return { kind: 'empty' };
  if (action.disabled && action.disabled.reason) {
    return { kind: 'disabled', reason: String(action.disabled.reason) };
  }
  const embedded = workspaceEditFromCommand(action.command);
  if (action.edit) {
    return {
      kind: 'edit',
      edit: action.edit,
      command: embedded ? null : action.command || null
    };
  }
  if (embedded) return { kind: 'edit', edit: embedded, command: null };
  if (action.command) return { kind: 'command', command: action.command };
  return { kind: 'empty' };
}

/**
 * Context diagnostics must be LSP Diagnostics (`range.start.line`). Chevron
 * stores a normalized copy (`row`/`column`) plus the server's original on
 * `raw`. A caret that does not touch a diagnostic is not that diagnostic's
 * context: the TypeScript server uses these codes together with the request
 * range, and a column-0 caret makes getCodeFixes miss the error.
 */
function lspDiagnosticForContext(d) {
  if (!d || typeof d !== 'object') return null;
  const raw = d.raw;
  if (raw && raw.range && raw.range.start && raw.range.start.line != null) {
    return raw;
  }
  if (
    d.range &&
    d.range.start &&
    d.range.start.line != null &&
    d.range.start.row == null
  ) {
    return d;
  }
  if (d.range && d.range.start && d.range.start.row != null) {
    const code =
      d.code && typeof d.code === 'object' && d.code.value != null
        ? d.code.value
        : d.code;
    const end = d.range.end || d.range.start;
    return {
      range: {
        start: { line: d.range.start.row, character: d.range.start.column || 0 },
        end: { line: end.row, character: end.column || 0 }
      },
      severity: d.severity,
      code: code != null ? code : undefined,
      source: d.source || undefined,
      message: d.message || ''
    };
  }
  return null;
}

function diagnosticsForCodeActionContext(diagnostics, range) {
  const list = Array.isArray(diagnostics) ? diagnostics : [];
  const out = [];
  const filter =
    range && range.start && range.end && range.start.row != null;
  for (const d of list) {
    if (!d) continue;
    const bufferRange =
      d.range && d.range.start && d.range.start.row != null ? d.range : null;
    if (filter && bufferRange && !bufferRangesOverlap(bufferRange, range)) {
      continue;
    }
    const lsp = lspDiagnosticForContext(d);
    if (lsp) out.push(lsp);
  }
  return out;
}

/**
 * @param {{ request, getServerIdForEditor, getPositionEncoding }} client
 * @param {object} editor
 * @param {object} [range]
 * @param {Array} [diagnostics] LSP diagnostics for context
 */
async function codeActionsAt(client, editor, range, diagnostics) {
  const serverId = client.getServerIdForEditor(editor);
  if (!serverId) return [];
  const filePath = editor.getPath && editor.getPath();
  if (!filePath) return [];
  const uri = pathToUri(filePath);
  if (!uri) return [];

  const r =
    range ||
    (editor.getSelectedBufferRange && editor.getSelectedBufferRange()) ||
    null;
  if (!r) return [];

  const { result, error } = await client.request(
    serverId,
    'textDocument/codeAction',
    {
      textDocument: { uri },
      range: {
        start: positionFor(client, editor, serverId, r.start),
        end: positionFor(client, editor, serverId, r.end)
      },
      context: {
        diagnostics: diagnosticsForCodeActionContext(diagnostics, r),
        only: undefined,
        triggerKind: 1 // Invoked
      }
    },
    15000
  );

  if (error || !result) return [];
  return normalizeCodeActions(result);
}

/**
 * Resolve a CodeAction if the server supports it.
 */
async function resolveCodeAction(client, editor, action) {
  if (!action || !action.raw) return action;
  if (action.edit) return action;
  const serverId = client.getServerIdForEditor(editor);
  if (!serverId) return action;

  const { result, error } = await client.request(
    serverId,
    'codeAction/resolve',
    action.raw,
    10000
  );
  if (error || !result) return action;
  const [normalized] = normalizeCodeActions([result]);
  return normalized || action;
}

/**
 * Execute a workspace/executeCommand if present (best-effort).
 */
async function executeCommand(client, editor, command) {
  if (!command) return { ok: false };
  const serverId = client.getServerIdForEditor(editor);
  if (!serverId) return { ok: false };
  const cmd = typeof command === 'string' ? command : command.command;
  const args =
    typeof command === 'object' && Array.isArray(command.arguments)
      ? command.arguments
      : [];
  if (!cmd) return { ok: false };

  const { result, error } = await client.request(
    serverId,
    'workspace/executeCommand',
    { command: cmd, arguments: args },
    30000
  );
  if (error) return { ok: false, error: error.message || String(error) };
  return { ok: true, result };
}

function describeAction(action) {
  if (!action) return '';
  let t = action.title || '';
  if (action.kind) t += ` (${action.kind})`;
  return t;
}

module.exports = {
  codeActionsAt,
  resolveCodeAction,
  executeCommand,
  normalizeCodeActions,
  describeAction,
  normalizeMarkup,
  diagnosticsForCodeActionContext,
  planCodeActionApply,
  workspaceEditFromCommand
};
