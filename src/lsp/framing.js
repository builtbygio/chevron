'use strict';

/**
 * LSP / JSON-RPC stdio framing (Content-Length).
 *
 * Phase 0 hand-rolled codec for learning + tests. Production Phase 1+ may use
 * vscode-jsonrpc; keep this module for tests and as a documented reference.
 *
 * Spec: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#headerPart
 */

const HEADER_SEP = Buffer.from('\r\n\r\n');

/**
 * Encode a JSON-RPC body as an LSP framed message.
 * @param {object|string|Buffer} body
 * @returns {Buffer}
 */
function encodeMessage(body) {
  const payload =
    Buffer.isBuffer(body)
      ? body
      : Buffer.from(
          typeof body === 'string' ? body : JSON.stringify(body),
          'utf8'
        );
  const header = Buffer.from(
    `Content-Length: ${payload.length}\r\n\r\n`,
    'utf8'
  );
  return Buffer.concat([header, payload]);
}

/**
 * Incremental decoder: push Buffer chunks, pull complete message bodies
 * (Buffers of exact Content-Length).
 */
class LspFrameDecoder {
  constructor(options = {}) {
    this.maxHeaderBytes = options.maxHeaderBytes || 64 * 1024;
    this.maxBodyBytes = options.maxBodyBytes || 32 * 1024 * 1024;
    this._buf = Buffer.alloc(0);
    this._contentLength = null;
  }

  /**
   * @param {Buffer|string} chunk
   * @returns {Buffer[]} complete message bodies (utf8 JSON payloads)
   */
  push(chunk) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
    this._buf = Buffer.concat([this._buf, piece]);
    const out = [];

    // Safety: header must appear within maxHeaderBytes
    while (true) {
      if (this._contentLength == null) {
        const sep = this._buf.indexOf(HEADER_SEP);
        if (sep === -1) {
          if (this._buf.length > this.maxHeaderBytes) {
            throw new Error(
              `LSP frame: header exceeds ${this.maxHeaderBytes} bytes without \\r\\n\\r\\n`
            );
          }
          break;
        }
        const headerText = this._buf.slice(0, sep).toString('utf8');
        const len = parseContentLength(headerText);
        if (len == null) {
          throw new Error(
            `LSP frame: missing or invalid Content-Length in header: ${JSON.stringify(
              headerText
            )}`
          );
        }
        if (len < 0 || len > this.maxBodyBytes) {
          throw new Error(`LSP frame: Content-Length ${len} out of bounds`);
        }
        this._contentLength = len;
        this._buf = this._buf.slice(sep + HEADER_SEP.length);
      }

      if (this._buf.length < this._contentLength) {
        break;
      }
      const body = this._buf.slice(0, this._contentLength);
      this._buf = this._buf.slice(this._contentLength);
      this._contentLength = null;
      out.push(body);
    }

    return out;
  }

  /** Bytes buffered but not yet a complete message. */
  get pendingBytes() {
    return this._buf.length;
  }

  reset() {
    this._buf = Buffer.alloc(0);
    this._contentLength = null;
  }
}

/**
 * @param {string} headerText
 * @returns {number|null}
 */
function parseContentLength(headerText) {
  // Headers are case-insensitive; allow optional Content-Type and either \n or \r\n lines
  const lines = headerText.split(/\r?\n/);
  for (const line of lines) {
    const m = /^Content-Length:\s*(\d+)\s*$/i.exec(line);
    if (m) return Number(m[1]);
  }
  return null;
}

/**
 * Parse a body Buffer as JSON.
 * @param {Buffer} body
 * @returns {object}
 */
function parseBody(body) {
  return JSON.parse(body.toString('utf8'));
}

module.exports = {
  encodeMessage,
  LspFrameDecoder,
  parseContentLength,
  parseBody,
  HEADER_SEP
};
