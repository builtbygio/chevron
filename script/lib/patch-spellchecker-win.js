'use strict';

/**
 * Patch spellchecker for modern MSVC (VS 2019+).
 *
 * spellchecker_win.cc binds a temporary std::wstring to a non-const reference:
 *   std::wstring& wword = ToWString(word);  // C2440 on VS 2022
 * ToWString returns by value; bind by value instead.
 *
 * Idempotent. Wired from bootstrap-modern.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
const winCc = path.join(
  repoRoot,
  'node_modules',
  'spellchecker',
  'src',
  'spellchecker_win.cc'
);

if (!fs.existsSync(winCc)) {
  console.log('skip missing: node_modules/spellchecker/src/spellchecker_win.cc');
  process.exit(0);
}

let text = fs.readFileSync(winCc, 'utf8');
const bad = 'std::wstring& wword = ToWString(word);';
const good = 'std::wstring wword = ToWString(word);';

if (!text.includes(bad)) {
  if (text.includes(good)) {
    console.log('ok (already): spellchecker_win.cc MSVC wstring fix');
    process.exit(0);
  }
  console.log('spellchecker_win.cc: expected ToWString pattern not found');
  process.exit(0);
}

text = text.split(bad).join(good);
fs.writeFileSync(winCc, text);
console.log('patched: node_modules/spellchecker/src/spellchecker_win.cc (MSVC wstring)');
