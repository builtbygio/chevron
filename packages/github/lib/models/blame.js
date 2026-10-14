"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.parseBlamePorcelain = parseBlamePorcelain;
exports.formatInlineBlame = formatInlineBlame;
exports.UNCOMMITTED_SHA = void 0;

var _moment = _interopRequireDefault(require("moment"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// The sha `git blame` gives lines that are in the file but in no commit.
const UNCOMMITTED_SHA = '0000000000000000000000000000000000000000';
exports.UNCOMMITTED_SHA = UNCOMMITTED_SHA;
const HEADER = /^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/;

// `git blame --porcelain` output to `{lines}`, where `lines[row]` is the
// commit that last changed buffer row `row` (0-based). Each commit is one
// object, shared by all of its lines: porcelain describes a commit once, at its
// first line, and later lines carry only the header.
function parseBlamePorcelain(output) {
  const commits = new Map();
  const lines = [];
  let current = null;

  for (const line of output.split('\n')) {
    if (line.startsWith('\t')) {
      if (current) lines[current.row] = current.commit;
      current = null;
      continue;
    }

    const header = HEADER.exec(line);

    if (header) {
      const sha = header[1];
      let commit = commits.get(sha);

      if (!commit) {
        commit = {
          sha,
          uncommitted: sha === UNCOMMITTED_SHA,
          author: '',
          authorMail: '',
          authorTime: 0,
          summary: ''
        };
        commits.set(sha, commit);
      }

      current = {
        commit,
        row: parseInt(header[2], 10) - 1
      };
      continue;
    }

    if (!current) continue;
    const space = line.indexOf(' ');
    const key = space === -1 ? line : line.slice(0, space);
    const value = space === -1 ? '' : line.slice(space + 1);

    switch (key) {
      case 'author':
        current.commit.author = value;
        break;

      case 'author-mail':
        current.commit.authorMail = value.replace(/^<|>$/g, '');
        break;

      case 'author-time':
        current.commit.authorTime = parseInt(value, 10) || 0;
        break;

      case 'summary':
        current.commit.summary = value;
        break;
    }
  }

  return {
    lines
  };
}

// `Gio, 3 weeks ago · Fix soft wrap at EOL`
function formatInlineBlame(commit, now = Date.now()) {
  if (commit.uncommitted) return 'Not committed yet';
  const when = (0, _moment.default)(commit.authorTime * 1000).from(now);
  return `${commit.author}, ${when} · ${commit.summary}`;
}
