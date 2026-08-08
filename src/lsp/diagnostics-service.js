'use strict';

/**
 * lsp.diagnostics 1.0.0 — replaceable diagnostics subscription API.
 * Core owns the map; UI packages consume this service (via lsp-ui provide).
 */

const { createSyncConverter } = require('./inbound-position');

/**
 * Normalize one LSP Diagnostic to a stable Chevron shape.
 *
 * `convert` honours the session's positionEncoding (goal G7). Diagnostics are
 * a hot path and almost always concern an open buffer, so the sync converter
 * is used: it reads line text from open editors and degrades to passthrough
 * for closed files rather than doing disk I/O per publish.
 *
 * @param {object} d
 * @param {string} uri
 * @param {(pos: object, uri?: string) => object} [convert]
 */
function normalizeDiagnostic(d, uri, convert) {
  if (!d || !d.range) return null;
  const toPoint =
    convert ||
    ((pos) => ({
      row: (pos && pos.line) || 0,
      column: (pos && pos.character) || 0
    }));
  const start = toPoint(d.range.start, uri);
  const end = toPoint(d.range.end, uri);
  return {
    uri,
    severity: d.severity != null ? d.severity : 1, // 1=Error 2=Warning 3=Info 4=Hint
    message: String(d.message || ''),
    source: d.source || null,
    code: d.code != null ? d.code : null,
    range: { start, end },
    raw: d
  };
}

/**
 * @param {Map<string, object[]>} diagnosticsByUri map of uri -> raw LSP diagnostics
 * @param {import('event-kit').Emitter} emitter
 * @param {(uri: string) => ('utf-16'|'utf-8')} [getEncodingForUri] session
 *   position encoding for the server owning that uri (goal G7)
 */
function createDiagnosticsService(diagnosticsByUri, emitter, getEncodingForUri) {
  const converterFor = uri =>
    createSyncConverter(
      (getEncodingForUri && getEncodingForUri(uri)) || 'utf-16'
    );

  return {
    /**
     * @param {string} [uri]
     * @returns {object[]}
     */
    getDiagnostics(uri) {
      if (uri) {
        const raw = diagnosticsByUri.get(uri) || [];
        const convert = converterFor(uri);
        return raw
          .map(d => normalizeDiagnostic(d, uri, convert))
          .filter(Boolean);
      }
      const all = [];
      for (const [u, list] of diagnosticsByUri) {
        const convert = converterFor(u);
        for (const d of list) {
          const n = normalizeDiagnostic(d, u, convert);
          if (n) all.push(n);
        }
      }
      return all;
    },

    getAllDiagnostics() {
      return this.getDiagnostics();
    },

    /**
     * @param {(event: { uri: string, diagnostics: object[] }) => void} cb
     * @returns {{ dispose: Function }}
     */
    onDidUpdateDiagnostics(cb) {
      return emitter.on('did-publish-diagnostics', event => {
        const uri = event.uri;
        const convert = converterFor(uri);
        const diagnostics = (event.diagnostics || [])
          .map(d => normalizeDiagnostic(d, uri, convert))
          .filter(Boolean);
        cb({ uri, diagnostics });
      });
    },

    /**
     * Total count across all URIs (for status tiles).
     */
    getTotalCount() {
      let n = 0;
      for (const list of diagnosticsByUri.values()) n += list.length;
      return n;
    }
  };
}

module.exports = {
  normalizeDiagnostic,
  createDiagnosticsService
};
