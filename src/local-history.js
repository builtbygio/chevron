'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEEP = 30;

function historyDir(home, filePath) {
  const key = crypto.createHash('sha1').update(path.resolve(filePath)).digest('hex');
  return path.join(home, 'local-history', key);
}

function snapshot(home, filePath, contents) {
  const dir = historyDir(home, filePath);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = `${Date.now()}-${process.hrtime.bigint()}`;
  const dest = path.join(dir, stamp);
  fs.writeFileSync(dest, contents == null ? '' : String(contents));
  fs.writeFileSync(path.join(dir, 'path.txt'), filePath);
  const names = fs.readdirSync(dir).filter(name => name !== 'path.txt').sort();
  while (names.length > KEEP) {
    fs.unlinkSync(path.join(dir, names.shift()));
  }
  return dest;
}

function listSnapshots(home, filePath) {
  const dir = historyDir(home, filePath);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(name => name !== 'path.txt')
    .sort()
    .reverse()
    .map(name => path.join(dir, name));
}

function readSnapshot(file) {
  return fs.readFileSync(file, 'utf8');
}

module.exports = { snapshot, listSnapshots, readSnapshot, historyDir };
