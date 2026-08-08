'use strict';

/**
 * lsp.diagnostics 1.0.0 — replaceable diagnostics subscription API.
 * Core owns the map; UI packages consume this service (via lsp-ui provide).
 */

/**
 * Normalize one LSP Diagnostic to a stable Chevron shape.
 * @param {object} d
 * @param {string} uri
 */
function normalizeDiagnostic(d, uri) {
  if (!d || !d.range) return null;
  return {
    uri,
    severity: d.severity != null ? d.severity : 1, // 1=Error 2=Warning 3=Info 4=Hint
    message: String(d.message || ''),
    source: d.source || null,
    code: d.code != null ? d.code : null,
    range: {
      start: {
        row: (d.range.start && d.range.start.line) || 0,
        column: (d.range.start && d.range.start.character) || 0
      },
      end: {
        row: (d.range.end && d.range.end.line) || 0,
        column: (d.range.end && d.range.end.character) || 0
      }
    },
    raw: d
  };
}

/**
 * @param {Map<string, object[]>} diagnosticsByUri map of uri -> raw LSP diagnostics
 * @param {import('event-kit').Emitter} emitter
 */
function createDiagnosticsService(diagnosticsByUri, emitter) {
  return {
    /**
     * @param {string} [uri]
     * @returns {object[]}
     */
    getDiagnostics(uri) {
      if (uri) {
        const raw = diagnosticsByUri.get(uri) || [];
        return raw
          .map(d => normalizeDiagnostic(d, uri))
          .filter(Boolean);
      }
      const all = [];
      for (const [u, list] of diagnosticsByUri) {
        for (const d of list) {
          const n = normalizeDiagnostic(d, u);
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
        const diagnostics = (event.diagnostics || [])
          .map(d => normalizeDiagnostic(d, uri))
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
