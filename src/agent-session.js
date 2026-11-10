'use strict';

/**
 * One agent session: which tool calls were allowed, and what was read.
 *
 * The prompt is injected. With no prompter, every call is denied, and the
 * denial is still recorded. A granted read is logged with the reason the
 * caller gave, so the session can show what was read and why.
 *
 * docs/reference/agent-session.md
 */

const MAX_ENTRIES = 200;

function requiredText(value, label) {
  const text = value == null ? '' : String(value).trim();
  if (!text) throw new Error(`A tool record needs a ${label}`);
  return text;
}

function trim(list) {
  while (list.length > MAX_ENTRIES) list.shift();
}

function createSession() {
  const reads = [];
  const decisions = [];
  let nextId = 1;

  return {
    recordRead(entry) {
      const row = {
        path: requiredText(entry && entry.path, 'path'),
        why: requiredText(entry && entry.why, 'reason'),
        at: Date.now()
      };
      reads.push(row);
      trim(reads);
      return row;
    },

    reads() {
      return reads.slice();
    },

    decisions() {
      return decisions.slice();
    },

    async requestTool(call, prompt) {
      const request = {
        id: nextId++,
        kind: requiredText(call && call.kind, 'kind'),
        summary: requiredText(call && call.summary, 'summary'),
        detail: call && call.detail != null ? String(call.detail) : ''
      };
      let allowed = false;
      if (typeof prompt === 'function') {
        allowed = Boolean(await prompt(request));
      }
      const decision = Object.assign({ allowed, at: Date.now() }, request);
      decisions.push(decision);
      trim(decisions);
      if (allowed && decision.kind === 'read' && decision.detail.trim()) {
        reads.push({
          path: decision.detail,
          why: decision.summary,
          at: decision.at
        });
        trim(reads);
      }
      return decision;
    }
  };
}

let current = null;

function session() {
  if (!current) current = createSession();
  return current;
}

function resetSession() {
  current = createSession();
  return current;
}

function formatSession(target) {
  const lines = ['# Agent session', ''];
  const readRows = target.reads();
  lines.push('## Read', '');
  if (readRows.length === 0) {
    lines.push('Nothing has been read in this session.');
  } else {
    for (const read of readRows) {
      lines.push(`- \`${read.path}\` — ${read.why}`);
    }
  }
  lines.push('', '## Tool calls', '');
  const calls = target.decisions();
  if (calls.length === 0) {
    lines.push('No tool call has been asked.');
  } else {
    for (const call of calls) {
      const verb = call.allowed ? 'Allowed' : 'Denied';
      lines.push(`- ${verb} ${call.kind}: ${call.summary}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

module.exports = {
  createSession,
  session,
  resetSession,
  formatSession,
  MAX_ENTRIES
};
