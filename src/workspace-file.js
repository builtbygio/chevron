'use strict';

// A saved workspace is a JSON file of folders, reopened later as one project.

function serializeWorkspace(folders) {
  const list = Array.isArray(folders) ? folders.filter(Boolean) : [];
  return JSON.stringify({ folders: list }, null, 2) + '\n';
}

function parseWorkspace(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.folders)) {
    throw new Error('A workspace file needs a folders array');
  }
  const folders = data.folders.filter(folder => typeof folder === 'string' && folder);
  if (!folders.length) throw new Error('A workspace file has no folders');
  return { folders };
}

module.exports = { serializeWorkspace, parseWorkspace };
