'use strict';

/**
 * User config / keymap / snippets file format (architecture H1 PR 5).
 * Default writer is JSON. Dual-read CSON. Never delete .cson.
 * Never overwrite an existing config.json. Escape: CHEVRON_CONFIG_CSON=1.
 *
 * Do not require('season') at load — the unit-and-cpm CI job has no app
 * node_modules. JSON-shaped CSON is parsed with JSON.parse; real CSON
 * lazy-loads season (present in the packaged app).
 */

const fs = require('fs');
const path = require('path');

const STEMS = ['config', 'keymap', 'snippets'];

function preferCson(env = process.env) {
  return Boolean(env && env.CHEVRON_CONFIG_CSON === '1');
}

function pathsFor(homeDir, stem) {
  return {
    json: path.join(homeDir, `${stem}.json`),
    cson: path.join(homeDir, `${stem}.cson`)
  };
}

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (_) {
    return false;
  }
}

function resolveUserDataFile(homeDir, stem, env = process.env) {
  const { json, cson } = pathsFor(homeDir, stem);
  const jsonExists = exists(json);
  const csonExists = exists(cson);

  if (preferCson(env)) {
    if (csonExists) return { filePath: cson, format: 'cson' };
    if (jsonExists) return { filePath: json, format: 'json' };
    return { filePath: cson, format: 'cson' };
  }

  if (jsonExists) return { filePath: json, format: 'json' };
  if (csonExists) {
    return { filePath: cson, format: 'cson', shouldMigrate: true };
  }
  return { filePath: json, format: 'json' };
}

function readObjectFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (jsonError) {
    if (path.extname(filePath) === '.json') throw jsonError;
    return require('season').readFileSync(filePath);
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data || {}, null, 2) + '\n');
}

function migrateStemToJson(homeDir, stem, env = process.env) {
  if (preferCson(env)) return { migrated: false };
  const { json, cson } = pathsFor(homeDir, stem);
  if (exists(json) || !exists(cson)) return { migrated: false };
  let data;
  try {
    data = readObjectFile(cson);
  } catch (error) {
    return { migrated: false, error };
  }
  try {
    writeJsonFile(json, data);
  } catch (error) {
    return { migrated: false, error };
  }
  return { migrated: true, from: cson, to: json };
}

function migrateUserDataFiles(homeDir, env = process.env) {
  const result = {};
  for (const stem of STEMS) {
    result[stem] = migrateStemToJson(homeDir, stem, env);
  }
  return result;
}

module.exports = {
  preferCson,
  resolveUserDataFile,
  migrateStemToJson,
  migrateUserDataFiles,
  readObjectFile,
  writeJsonFile
};
