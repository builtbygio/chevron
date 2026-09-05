'use strict';

/**
 * Tasks a project declares: the commands you actually run in it.
 *
 * `<root>/.chevron/tasks.json`, beside the per-root config, and read the same
 * way — a file people commit, that the editor never writes.
 *
 * ```json
 * { "tasks": [ { "name": "test", "command": "npm test" },
 *              { "name": "build", "command": "make", "cwd": "packages/core" } ] }
 * ```
 *
 * A task is a command line, run through the user's shell, so `npm test` means
 * what it means in a terminal — PATH, aliases and shell syntax included.
 *
 * **Running one requires the project to be trusted.** Cloning a repository
 * and opening it must not be enough to execute what it says to; that is the
 * same reasoning the trust prompt already applies to language servers, which
 * load a project's toolchain. Discovery is safe and always allowed; running
 * is not.
 *
 * docs/reference/tasks.md
 */

const path = require('path');

export interface Task {
  name: string;
  /** A command line, run through the shell. */
  command: string;
  /** Absolute, and always inside the root. */
  cwd: string;
  root: string;
}

export interface ParseResult {
  tasks: Task[];
  /** Why an entry was dropped. Reported rather than silently ignored. */
  problems: string[];
}

/** A usable string: present, not empty, and free of NUL. */
function usable(value: any, maxLength: number = 4096): boolean {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maxLength &&
    !value.includes('\u0000')
  );
}

/** A name is a label, so it is held to a tighter shape than a command. */
function usableName(value: any): boolean {
  return usable(value, 100) && !value.includes('\n');
}

/**
 * Read a tasks file into tasks, saying what it could not use.
 *
 * Nothing here throws: a half-written tasks.json is a normal state for a file
 * somebody is editing, and it must not take the command palette down with it.
 */
export function parseTasks(source: any, root: string): ParseResult {
  const problems: string[] = [];
  const tasks: Task[] = [];

  let parsed = source;
  if (typeof source === 'string') {
    try {
      parsed = JSON.parse(source);
    } catch (error) {
      return { tasks: [], problems: [`tasks.json is not valid JSON: ${error.message}`] };
    }
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tasks)) {
    return { tasks: [], problems: ['tasks.json needs a "tasks" array'] };
  }

  const seen = new Set<string>();
  for (const [index, entry] of parsed.tasks.entries()) {
    if (!entry || typeof entry !== 'object') {
      problems.push(`task ${index} is not an object`);
      continue;
    }
    if (!usableName(entry.name)) {
      problems.push(`task ${index} has no name`);
      continue;
    }
    if (!usable(entry.command)) {
      problems.push(`task "${entry.name}" has no command`);
      continue;
    }
    if (seen.has(entry.name)) {
      problems.push(`task "${entry.name}" is defined more than once`);
      continue;
    }

    let cwd = root;
    if (entry.cwd != null) {
      if (!usable(entry.cwd, 1024)) {
        problems.push(`task "${entry.name}" has an unusable cwd`);
        continue;
      }
      // Relative to the root, and staying inside it: a task that runs
      // somewhere else is a task that walks around the trust decision made
      // about this folder.
      const resolved = path.resolve(root, entry.cwd);
      if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        problems.push(`task "${entry.name}" has a cwd outside the project`);
        continue;
      }
      cwd = resolved;
    }

    seen.add(entry.name);
    tasks.push({ name: entry.name, command: entry.command, cwd, root });
  }

  return { tasks, problems };
}

/**
 * The argv that runs a command line through a shell.
 *
 * Not the command split into words: a task is a command line, and `npm test
 * && npm run lint` has to mean what it says. The shell is an absolute path,
 * which is what the pty host requires.
 */
export function shellInvocation(
  command: string,
  shell: string,
  platform: string = process.platform
): { shell: string; args: string[] } {
  if (platform === 'win32') {
    return { shell, args: ['/d', '/s', '/c', command] };
  }
  return { shell, args: ['-lc', command] };
}

module.exports = { parseTasks, shellInvocation };
