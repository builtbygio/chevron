'use strict';

/**
 * textDocument/signatureHelp
 */

const { pointToLsp, pointToLspWithEncoding } = require('../position');
const { pathToUri } = require('../path-uri');
const { normalizeMarkup } = require('../markup');

/**
 * @param {unknown} result
 * @returns {{ signatures: Array<{label:string, documentation?:string, parameters?:Array}>, activeSignature: number, activeParameter: number }|null}
 */
function normalizeSignatureHelp(result) {
  if (!result || !Array.isArray(result.signatures) || result.signatures.length === 0) {
    return null;
  }
  const signatures = result.signatures.map(sig => {
    const doc = sig.documentation
      ? normalizeMarkup(sig.documentation).value
      : undefined;
    return {
      label: sig.label || '',
      documentation: doc,
      parameters: Array.isArray(sig.parameters)
        ? sig.parameters.map(p => ({
            label: p.label,
            documentation: p.documentation
              ? normalizeMarkup(p.documentation).value
              : undefined
          }))
        : []
    };
  });
  return {
    signatures,
    activeSignature: result.activeSignature || 0,
    activeParameter: result.activeParameter || 0
  };
}

/**
 * Format a one-line display string for the active signature.
 */
function formatSignatureHelp(help) {
  if (!help || !help.signatures.length) return '';
  const idx = Math.min(help.activeSignature, help.signatures.length - 1);
  const sig = help.signatures[idx];
  let label = sig.label || '';
  // Highlight active parameter by wrapping with « » when label offsets available
  const param = sig.parameters && sig.parameters[help.activeParameter];
  if (param && Array.isArray(param.label) && param.label.length === 2) {
    const [start, end] = param.label;
    label =
      label.slice(0, start) + '«' + label.slice(start, end) + '»' + label.slice(end);
  } else if (param && typeof param.label === 'string' && label.includes(param.label)) {
    label = label.replace(param.label, '«' + param.label + '»');
  }
  const parts = [label];
  if (sig.documentation) parts.push(sig.documentation);
  return parts.join('\n\n');
}

/**
 * @param {{ request: Function, getServerIdForEditor: Function, getPositionEncoding?: Function }} client
 * @param {object} editor
 * @param {{row:number, column:number}|null} [point]
 */
async function signatureHelpAt(client, editor, point) {
  const serverId = client.getServerIdForEditor(editor);
  if (!serverId) return null;

  const filePath = editor.getPath && editor.getPath();
  if (!filePath) return null;
  const uri = pathToUri(filePath);
  if (!uri) return null;

  const pos = point || (editor.getCursorBufferPosition && editor.getCursorBufferPosition());
  if (!pos) return null;

  const encoding =
    (client.getPositionEncoding && client.getPositionEncoding(serverId)) || 'utf-16';
  let lspPos;
  if (encoding === 'utf-8' && editor.lineTextForBufferRow) {
    const line = editor.lineTextForBufferRow(pos.row) || '';
    lspPos = pointToLspWithEncoding(line, pos, 'utf-8');
  } else {
    lspPos = pointToLsp(pos);
  }

  const { result, error } = await client.request(
    serverId,
    'textDocument/signatureHelp',
    {
      textDocument: { uri },
      position: lspPos
    },
    8000
  );

  if (error || !result) return null;
  return normalizeSignatureHelp(result);
}

module.exports = {
  signatureHelpAt,
  normalizeSignatureHelp,
  formatSignatureHelp
};
