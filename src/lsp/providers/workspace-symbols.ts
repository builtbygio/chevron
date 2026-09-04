'use strict';

/**
 * `workspace/symbol` — symbols across a project, not a file.
 *
 * Every other provider here starts from an editor: it asks the one server
 * that owns the file in front of you. This one has no editor. It asks every
 * server started for a project root and merges what comes back, which is what
 * makes it the first piece of project-shaped context in the tree.
 *
 * docs/process/next-tracks-plan.md, track 3.
 */

const { lspToPoint } = require('../position');
const { createConverter, collectRefs } = require('../inbound-position');
const { uriToPath } = require('../path-uri');
const { SYMBOL_KIND } = require('./document-symbols');

/** How many symbols a query returns, however many servers answered. */
const DEFAULT_LIMIT = 500;

/** A server that has not answered in this long is not going to. */
const REQUEST_TIMEOUT_MS = 15000;

/**
 * How much of one server's answer is kept before merging. This is a bound on
 * work, not a result limit: the caller's `limit` is applied after ranking,
 * because trimming a server's answer before it has been ranked throws away
 * the matches the user was most likely asking for.
 */
const MAX_PER_SERVER = 1000;

export interface WorkspaceSymbolPoint {
  row: number;
  column: number;
}

export interface WorkspaceSymbolResult {
  name: string;
  kind: number;
  kindName: string;
  containerName: string | null;
  /** Absolute path, or null when the URI is not a file (a jar:, say). */
  path: string | null;
  uri: string;
  /**
   * Null when the server sent an LSP 3.17 `WorkspaceSymbol` carrying only a
   * URI. Those are resolved on demand via `workspaceSymbol/resolve`; until
   * then the symbol names a file but not a line, and a caller opening it
   * should land at the top rather than pretend to know better.
   */
  range: { start: WorkspaceSymbolPoint; end: WorkspaceSymbolPoint } | null;
  serverId: string;
  projectRoot: string | null;
}

interface SessionLike {
  serverId: string;
  projectRoot?: string | null;
  capabilities?: { workspaceSymbolProvider?: unknown } | null;
}

/** Whether a server said it answers workspace/symbol. */
export function servesWorkspaceSymbols(session: SessionLike | null): boolean {
  if (!session || !session.capabilities) return false;
  const provider = session.capabilities.workspaceSymbolProvider;
  // The capability is `boolean | WorkspaceSymbolOptions`, and an options
  // object is just as much a yes as `true` is.
  return provider === true || (typeof provider === 'object' && provider !== null);
}

/**
 * One server's answer, flattened. Handles both shapes the protocol allows:
 * `SymbolInformation`, which carries a full range, and 3.17's
 * `WorkspaceSymbol`, whose location may be nothing but a URI.
 */
export function normalizeWorkspaceSymbols(
  result: any,
  session: SessionLike,
  convert: Function = lspToPoint
): WorkspaceSymbolResult[] {
  if (!Array.isArray(result)) return [];
  const out: WorkspaceSymbolResult[] = [];

  for (const symbol of result) {
    if (!symbol || !symbol.name || !symbol.location) continue;
    const uri = symbol.location.uri;
    if (!uri) continue;

    const lspRange = symbol.location.range;
    out.push({
      name: symbol.name,
      kind: symbol.kind,
      kindName: SYMBOL_KIND[symbol.kind] || 'Symbol',
      containerName: symbol.containerName || null,
      path: uriToPath(uri),
      uri,
      range: lspRange
        ? {
            start: convert(lspRange.start, uri),
            end: convert(lspRange.end, uri)
          }
        : null,
      serverId: session.serverId,
      projectRoot: session.projectRoot || null
    });
  }

  return out;
}

/**
 * Rank for a query. Servers do their own matching and are not required to
 * agree with each other, so merged results need an order of their own or the
 * list reads as whichever server was fastest.
 */
function score(symbol: WorkspaceSymbolResult, query: string): number {
  const name = symbol.name.toLowerCase();
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  // The server matched it somehow -- fuzzily, or on the container -- and its
  // judgement is worth keeping, just below anything that matches by name.
  return 3;
}

function dedupeKey(symbol: WorkspaceSymbolResult): string {
  const row = symbol.range ? symbol.range.start.row : -1;
  return [symbol.uri, symbol.name, symbol.kind, row].join('\u0000');
}

/** The lines a utf-8 converter has to read before it can convert columns. */
function refsForRawSymbols(result: any): any[] {
  if (!Array.isArray(result)) return [];
  const entries = [];
  for (const symbol of result) {
    const location = symbol && symbol.location;
    if (!location || !location.uri || !location.range) continue;
    entries.push({ uri: location.uri, ranges: [location.range] });
  }
  return collectRefs(entries);
}

interface ClientLike {
  request: Function;
  listSessions: () => SessionLike[];
  getPositionEncoding?: (serverId: string) => string;
}

export interface WorkspaceSymbolOptions {
  /** Only ask servers started for this root. Every server when omitted. */
  root?: string | null;
  limit?: number;
}

/**
 * Ask every capable server and merge. One slow or broken server must not
 * cost the others their answer, so failures are dropped rather than thrown:
 * a symbol list that is missing one language is still useful, and an
 * exception here would take the whole palette down.
 */
export async function workspaceSymbols(
  client: ClientLike,
  query: string,
  options: WorkspaceSymbolOptions = {}
): Promise<WorkspaceSymbolResult[]> {
  const sessions = (client.listSessions ? client.listSessions() : []).filter(
    session => {
      if (!servesWorkspaceSymbols(session)) return false;
      if (options.root && session.projectRoot !== options.root) return false;
      return true;
    }
  );
  if (sessions.length === 0) return [];

  const limit = options.limit == null ? DEFAULT_LIMIT : options.limit;

  const answers = await Promise.all(
    sessions.map(async session => {
      let response;
      try {
        response = await client.request(
          session.serverId,
          'workspace/symbol',
          { query: query || '' },
          REQUEST_TIMEOUT_MS
        );
      } catch (error) {
        return [];
      }
      if (!response || response.error || !Array.isArray(response.result)) {
        return [];
      }

      // A broad query can match thousands, and for a utf-8 server converting
      // each column means reading that line -- from an open buffer if it is
      // open, from disk if it is not. Bound that, generously enough that the
      // ranking below still has everything a server actually found.
      const raw = response.result.slice(0, MAX_PER_SERVER);
      const encoding =
        (client.getPositionEncoding &&
          client.getPositionEncoding(session.serverId)) ||
        'utf-16';
      const convert =
        encoding === 'utf-8'
          ? await createConverter('utf-8', refsForRawSymbols(raw))
          : lspToPoint;
      return normalizeWorkspaceSymbols(raw, session, convert);
    })
  );

  const seen = new Set<string>();
  const merged: WorkspaceSymbolResult[] = [];
  for (const answer of answers) {
    for (const symbol of answer) {
      const key = dedupeKey(symbol);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(symbol);
    }
  }

  const needle = (query || '').toLowerCase();
  merged.sort((a, b) => {
    const byScore = score(a, needle) - score(b, needle);
    if (byScore !== 0) return byScore;
    if (a.name.length !== b.name.length) return a.name.length - b.name.length;
    return a.name.localeCompare(b.name);
  });

  return limit >= 0 ? merged.slice(0, limit) : merged;
}

module.exports = {
  workspaceSymbols,
  normalizeWorkspaceSymbols,
  servesWorkspaceSymbols,
  DEFAULT_LIMIT
};
