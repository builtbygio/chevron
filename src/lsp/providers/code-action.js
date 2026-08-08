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
        diagnostics: item.diagnostics,
        raw: item
      });
    }
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
        diagnostics: diagnostics || [],
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
  normalizeMarkup
};
