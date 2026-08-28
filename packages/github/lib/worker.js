"use strict";

const qs = require('querystring');

const {
  ipcRenderer: ipc
} = require('electron');

const {
  GitProcess
} = require('dugite');

class AverageTracker {
  constructor({
    limit
  } = {
    limit: 10
  }) {
    // for now this serves a dual purpose - # of values tracked AND # discarded prior to starting avg calculation
    this.limit = limit;
    this.sum = 0;
    this.values = [];
  }

  addValue(value) {
    if (this.values.length >= this.limit) {
      const discardedValue = this.values.shift();
      this.sum -= discardedValue;
    }

    this.values.push(value);
    this.sum += value;
  }

  getAverage() {
    if (this.enoughData()) {
      return this.sum / this.limit;
    } else {
      return null;
    }
  }

  getLimit() {
    return this.limit;
  }

  enoughData() {
    return this.values.length === this.limit;
  }

}

const query = qs.parse(window.location.search.substr(1));
const sourceWebContentsId = ipc.sendSync('atom-get-web-contents-id-sync');
const operationCountLimit = parseInt(query.operationCountLimit, 10);
const averageTracker = new AverageTracker({
  limit: operationCountLimit
});
const childPidsById = new Map(); // Manager lifecycle is handled in main (register-renderer-ipc): if the
// manager renderer dies, worker windows are destroyed automatically.

const managerWebContentsId = parseInt(query.managerWebContentsId, 10);

const destroyRenderer = () => {
  try {
    ipc.sendSync('atom-destroy-own-window-sync');
  } catch (e) {
    /* ignore */
  }
};

window.onbeforeunload = () => {// no-op: main owns parent/child lifecycle
};

const channelName = query.channelName;
ipc.on(channelName, (event, {
  type,
  data
}) => {
  if (type === 'git-exec') {
    const {
      args,
      workingDir,
      options,
      id
    } = data;

    if (args) {
      document.getElementById('command').textContent = `git ${args.join(' ')}`;
    }

    options.processCallback = child => {
      childPidsById.set(id, child.pid);
      child.on('error', err => {
        ipc.send('atom-wc-send', managerWebContentsId, channelName, {
          sourceWebContentsId,
          type: 'git-spawn-error',
          data: {
            id,
            err
          }
        });
      });
      child.stdin.on('error', err => {
        ipc.send('atom-wc-send', managerWebContentsId, channelName, {
          sourceWebContentsId,
          type: 'git-stdin-error',
          data: {
            id,
            stdin: options.stdin,
            err
          }
        });
      });
    };

    const spawnStart = performance.now();
    GitProcess.exec(args, workingDir, options).then(({
      stdout,
      stderr,
      exitCode
    }) => {
      const timing = {
        spawnTime: spawnEnd - spawnStart,
        execTime: performance.now() - spawnEnd
      };
      childPidsById.delete(id);
      ipc.send('atom-wc-send', managerWebContentsId, channelName, {
        sourceWebContentsId,
        type: 'git-data',
        data: {
          id,
          average: averageTracker.getAverage(),
          results: {
            stdout,
            stderr,
            exitCode,
            timing
          }
        }
      });
    }, err => {
      const timing = {
        spawnTime: spawnEnd - spawnStart,
        execTime: performance.now() - spawnEnd
      };
      childPidsById.delete(id);
      ipc.send('atom-wc-send', managerWebContentsId, channelName, {
        sourceWebContentsId,
        type: 'git-data',
        data: {
          id,
          average: averageTracker.getAverage(),
          results: {
            stdout: err.stdout,
            stderr: err.stderr,
            exitCode: err.code,
            signal: err.signal,
            timing
          }
        }
      });
    });
    const spawnEnd = performance.now();
    averageTracker.addValue(spawnEnd - spawnStart); // TODO: consider using this to avoid duplicate write operations upon crashing.
    // For now we won't do this to avoid clogging up ipc channel
    // ipc.send('atom-wc-send', managerWebContentsId, channelName, {sourceWebContentsId, type: 'exec-started', data: {id}});

    if (averageTracker.enoughData() && averageTracker.getAverage() > 20) {
      ipc.send('atom-wc-send', managerWebContentsId, channelName, {
        type: 'slow-spawns'
      });
    }
  } else if (type === 'git-cancel') {
    const {
      id
    } = data;
    const childPid = childPidsById.get(id);

    if (childPid !== undefined) {
      require('tree-kill')(childPid, 'SIGINT', () => {
        ipc.send('atom-wc-send', managerWebContentsId, channelName, {
          sourceWebContentsId,
          type: 'git-cancelled',
          data: {
            id,
            childPid
          }
        });
      });

      childPidsById.delete(id);
    }
  } else {
    throw new Error(`Could not identify type ${type}`);
  }
});
ipc.send('atom-wc-send', managerWebContentsId, channelName, {
  sourceWebContentsId,
  type: 'renderer-ready',
  data: {
    pid: process.pid
  }
});