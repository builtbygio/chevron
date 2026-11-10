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

export const MAX_ENTRIES = 200;

export interface AgentRead {
  path: string;
  why: string;
  at: number;
}

export interface ToolCall {
  kind?: string;
  summary?: string;
  detail?: string;
}

export interface ToolRequest {
  id: number;
  kind: string;
  summary: string;
  detail: string;
}

export interface ToolDecision extends ToolRequest {
  allowed: boolean;
  at: number;
}

export type ToolPrompt = (
  request: ToolRequest
) => boolean | Promise<boolean>;

export interface AgentSession {
  recordRead(entry: { path?: string; why?: string }): AgentRead;
  reads(): AgentRead[];
  decisions(): ToolDecision[];
  requestTool(call: ToolCall, prompt?: ToolPrompt): Promise<ToolDecision>;
}

function requiredText(value: unknown, label: string): string {
  const text = value == null ? '' : String(value).trim();
  if (!text) throw new Error(`A tool record needs a ${label}`);
  return text;
}

function trim<T>(list: T[]): void {
  while (list.length > MAX_ENTRIES) list.shift();
}

export function createSession(): AgentSession {
  const reads: AgentRead[] = [];
  const decisions: ToolDecision[] = [];
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
      const request: ToolRequest = {
        id: nextId++,
        kind: requiredText(call && call.kind, 'kind'),
        summary: requiredText(call && call.summary, 'summary'),
        detail: call && call.detail != null ? String(call.detail) : ''
      };
      let allowed = false;
      if (typeof prompt === 'function') {
        allowed = Boolean(await prompt(request));
      }
      const decision: ToolDecision = Object.assign(
        { allowed, at: Date.now() },
        request
      );
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

let current: AgentSession | null = null;

export function session(): AgentSession {
  if (!current) current = createSession();
  return current;
}

export function resetSession(): AgentSession {
  current = createSession();
  return current;
}

export function formatSession(target: AgentSession): string {
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
