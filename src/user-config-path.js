'use strict';

/**
 * User config / keymap / snippets file format (architecture H1 PR 5).
 * Default writer is JSON. Dual-read CSON. Never delete .cson.
 * Never overwrite an existing config.json. Escape: CHEVRON_CONFIG_CSON=1.
 */

const fs = require('fs');
const path = require('path');
const CSON = require('season');

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

function migrateStemToJson(homeDir, stem, env = process.env) {
  if (preferCson(env)) return { migrated: false };
  const { json, cson } = pathsFor(homeDir, stem);
  if (exists(json) || !exists(cson)) return { migrated: false };
  let data;
  try {
    data = CSON.readFileSync(cson);
  } catch (error) {
    return { migrated: false, error };
  }
  try {
    CSON.writeFileSync(json, data || {});
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
  migrateUserDataFiles
};
