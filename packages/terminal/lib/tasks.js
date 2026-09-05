const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// Running what a project says to run.
//
// Discovery is free; running is not. A tasks.json arrives with the repository,
// so executing it on the strength of having opened the folder would turn
// cloning into running. The trust prompt already governs exactly this for
// language servers, which load a project's toolchain — tasks use the same
// decision.
//
// docs/reference/tasks.md

const TASKS_FILE = path.join('.chevron', 'tasks.json');

function readTasksFor(root) {
  const file = path.join(root, TASKS_FILE);
  let source;
  try {
    if (!fs.existsSync(file)) return { tasks: [], problems: [] };
    source = fs.readFileSync(file, 'utf8');
  } catch (error) {
    return { tasks: [], problems: [`could not read ${file}: ${error.message}`] };
  }
  return chevron.tasks.parseTasks(source, root);
}

/** Every task the open project roots declare. */
function listTasks() {
  const tasks = [];
  const problems = [];
  for (const root of chevron.project.getPaths()) {
    const result = readTasksFor(root);
    tasks.push(...result.tasks);
    problems.push(...result.problems);
  }
  return { tasks, problems };
}

async function isTrusted(root) {
  try {
    // The channel is named for the feature that introduced it; the store it
    // reads is the project trust store, not something LSP-specific.
    return await ipcRenderer.invoke('lsp:is-trusted', { projectRoot: root });
  } catch (error) {
    return false;
  }
}

/**
 * Run a task in a terminal pane. Returns the view, or null when it did not
 * run — an untrusted project, or a task that does not exist.
 */
async function runTask(task, { TerminalView, register }) {
  if (!task) return null;

  const trusted = await isTrusted(task.root);
  if (!trusted) {
    chevron.notifications.addWarning(
      `Not running "${task.name}": this folder is not trusted`,
      {
        detail:
          `${task.root}\n\n` +
          'A task runs whatever the project says to run. Trust the folder ' +
          'first (Chevron Lsp: Trust Project), the same decision that lets a ' +
          'language server load its toolchain.',
        dismissable: true
      }
    );
    return null;
  }

  const shell =
    chevron.config.get('terminal.shell') || chevron.pty.defaultShell();
  const invocation = chevron.tasks.shellInvocation(task.command, shell);

  const view = new TerminalView({
    cwd: task.cwd,
    shell: invocation.shell,
    args: invocation.args,
    title: `${task.name}`
  });
  register(view);

  const pane = chevron.workspace.getActivePane();
  pane.addItem(view);
  pane.activateItem(view);
  return view;
}

module.exports = { listTasks, readTasksFor, runTask, isTrusted, TASKS_FILE };
