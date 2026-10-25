'use strict';

// The tail of a task's output that is worth keeping across a reload.
//
// A pty is a process, so the pane cannot come back as the same run. What can
// come back is the text that run already produced, capped so a task that
// prints forever does not write a workspace state file of unbounded size.
//
// docs/reference/tasks.md

const MAX_TRANSCRIPT_CHARS = 16 * 1024;

function appendTranscript(existing, chunk) {
  const next = `${existing || ''}${chunk == null ? '' : String(chunk)}`;
  if (next.length <= MAX_TRANSCRIPT_CHARS) return next;
  return next.slice(next.length - MAX_TRANSCRIPT_CHARS);
}

module.exports = { MAX_TRANSCRIPT_CHARS, appendTranscript };
