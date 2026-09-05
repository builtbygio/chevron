'use strict';

/**
 * The renderer half of a terminal: a data channel, and nothing that spawns.
 *
 * Everything privileged happens in the pty host (see
 * src/main-process/register-pty-ipc.js). This side asks for a session, writes
 * bytes to it, and hears bytes back — so a package building a terminal view
 * needs no privileged require of its own.
 *
 * docs/process/next-tracks-plan.md, track 3.
 */

const { Emitter, Disposable } = require('event-kit');
const { ipcRenderer } = require('electron');

export interface PtySpawnOptions {
  shell?: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
  env?: { [key: string]: string };
}

interface SessionHandlers {
  data: Array<(data: string) => void>;
  exit: Array<(event: { exitCode: number | null; signal: string | null }) => void>;
}

const handlers = new Map<string, SessionHandlers>();
const emitter = new Emitter();
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  ipcRenderer.on('chevron:pty-event', (_event, message) => {
    if (!message || typeof message !== 'object') return;
    const session = handlers.get(message.id);
    if (!session) return;
    if (message.type === 'data') {
      for (const callback of session.data) callback(message.data);
    } else if (message.type === 'exit') {
      for (const callback of session.exit) {
        callback({ exitCode: message.exitCode, signal: message.signal });
      }
      handlers.delete(message.id);
    } else if (message.type === 'error') {
      // An error before any data means the shell never started; report it as
      // an exit so a view has one way to end rather than two.
      for (const callback of session.exit) {
        callback({ exitCode: null, signal: message.message });
      }
      handlers.delete(message.id);
    }
    emitter.emit('did-receive', message);
  });
}

/** The shell to run when nobody asked for a particular one. */
export function defaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

export class PtySession {
  readonly id: string;
  private alive: boolean;

  constructor(id: string) {
    this.id = id;
    this.alive = true;
    handlers.set(id, { data: [], exit: [] });
  }

  onData(callback: (data: string) => void) {
    const session = handlers.get(this.id);
    if (session) session.data.push(callback);
    return new Disposable(() => {
      const current = handlers.get(this.id);
      if (!current) return;
      current.data = current.data.filter(cb => cb !== callback);
    });
  }

  onExit(
    callback: (event: { exitCode: number | null; signal: string | null }) => void
  ) {
    const session = handlers.get(this.id);
    if (session) session.exit.push(callback);
    return new Disposable(() => {
      const current = handlers.get(this.id);
      if (!current) return;
      current.exit = current.exit.filter(cb => cb !== callback);
    });
  }

  write(data: string): Promise<boolean> {
    if (!this.alive) return Promise.resolve(false);
    return ipcRenderer.invoke('chevron:pty-write', { id: this.id, data });
  }

  resize(cols: number, rows: number): Promise<boolean> {
    if (!this.alive) return Promise.resolve(false);
    return ipcRenderer.invoke('chevron:pty-resize', {
      id: this.id,
      cols: Math.max(1, Math.floor(cols)),
      rows: Math.max(1, Math.floor(rows))
    });
  }

  kill(): Promise<boolean> {
    if (!this.alive) return Promise.resolve(false);
    this.alive = false;
    handlers.delete(this.id);
    return ipcRenderer.invoke('chevron:pty-kill', { id: this.id });
  }

  isAlive(): boolean {
    return this.alive;
  }
}

/**
 * Start a shell. Rejects when main refuses — an unknown shell, a cwd outside
 * every project root — and the message says which, because a terminal that
 * silently does not open is the worst of both.
 */
export async function spawn(options: PtySpawnOptions = {}): Promise<PtySession> {
  listen();
  const result = await ipcRenderer.invoke('chevron:pty-spawn', {
    shell: options.shell || defaultShell(),
    args: options.args || [],
    cwd: options.cwd,
    cols: options.cols == null ? 80 : Math.floor(options.cols),
    rows: options.rows == null ? 24 : Math.floor(options.rows),
    env: options.env || {}
  });
  if (!result || !result.id) {
    throw new Error('pty spawn returned no session');
  }
  return new PtySession(result.id);
}

export function onDidReceive(callback: (message: any) => void) {
  return emitter.on('did-receive', callback);
}

module.exports = { spawn, defaultShell, PtySession, onDidReceive };
