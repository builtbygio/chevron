'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEEP = 30;

export function historyDir(home: string, filePath: string): string {
  const key = crypto
    .createHash('sha1')
    .update(path.resolve(filePath))
    .digest('hex');
  return path.join(home, 'local-history', key);
}

export function snapshot(
  home: string,
  filePath: string,
  contents: string
): string {
  const dir = historyDir(home, filePath);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = `${Date.now()}-${process.hrtime.bigint()}`;
  const dest = path.join(dir, stamp);
  fs.writeFileSync(dest, contents == null ? '' : String(contents));
  fs.writeFileSync(path.join(dir, 'path.txt'), filePath);
  const names = fs.readdirSync(dir).filter((name: string) => name !== 'path.txt').sort();
  while (names.length > KEEP) {
    fs.unlinkSync(path.join(dir, names.shift()));
  }
  return dest;
}

export function listSnapshots(home: string, filePath: string): string[] {
  const dir = historyDir(home, filePath);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name: string) => name !== 'path.txt')
    .sort()
    .reverse()
    .map((name: string) => path.join(dir, name));
}

export function readSnapshot(file: string): string {
  return fs.readFileSync(file, 'utf8');
}
