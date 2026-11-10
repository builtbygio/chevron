# Agent session

The editor's half of an agent tool call: ask, then remember.

There is no agent client in the app yet. `chevron.agent` is the gate a client
calls. The prompt and the record live in core, next to project trust, because
a package can see Node and must not be the thing that decides.

## A tool call is denied unless you allow it

`chevron.agent.requestTool({ kind, summary, detail })` opens a modal in the
same shape as the workspace-trust prompt.

| | |
|--|--|
| Title | Allow this tool call? |
| Safe button | **Don't allow**, and it holds focus |
| Enter | Acts on the focused button, so the default is deny |
| Cancel | Deny |
| Memory | This session only. Nothing is written to disk |

`kind` is a short name (`read`, `write`, `run`). `summary` is the sentence
the person sees. `detail` is the path or command, shown in the box under it.

With no workspace to attach the modal to, the call is denied.

## What was read, and why

A granted call whose `kind` is `read` and whose `detail` is a path is recorded
on the session: the path, and the summary as the reason. A denial is recorded
as a decision and does not count as a read.

`chevron.agent.recordRead({ path, why })` logs a read that was already
allowed. Both fields are required.

**Agent: Show Context** (`agent:show-context`) opens the list in an editor
tab. The list holds the latest 200 reads and the latest 200 decisions. It is
not restored after a reload: a new window is a new session.

## Code

| | |
|--|--|
| Session | `src/agent-session.js` |
| Modal | `src/agent-permission-view.js` |
| Published on | `chevron.agent` in `src/initialize-application-window.js` |
