'use strict';

/**
 * Every flag the editor passes to cpm is one cpm accepts.
 *
 * An apm-era --no-color made commander reject every `cpm list` call, so the
 * Packages panel listed nothing -- a rejected flag rather than a crash, so the
 * panel still opened and simply stayed empty. Cross-checks both sides so a
 * flag added to one without the other fails here.
 *
 * Run: node --test script/ci/cpm-caller-flags.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CLI = path.join(ROOT, 'cpm', 'lib', 'cli.js');

// Commands cpm defines, the options each declares, and whether it tolerates
// unknown ones.
function cpmCommands() {
  const src = fs.readFileSync(CLI, 'utf8');
  const commands = {};
  // Split on .command( so each chunk carries that command's own options.
  const chunks = src.split(/\.command\(/).slice(1);
  for (const chunk of chunks) {
    const nameMatch = chunk.match(/^\s*['"]([a-z-]+)/);
    if (!nameMatch) continue;
    const names = [nameMatch[1]];
    const alias = chunk.match(/\.alias\(\s*['"]([a-z-]+)['"]/);
    if (alias) names.push(alias[1]);
    // Stop at the next command's boundary: .action( ends the definition.
    const body = chunk.split(/\.action\(/)[0];
    const options = [...body.matchAll(/\.option\(\s*['"]([^'"]+)['"]/g)].map(
      m => m[1].split(/[\s,]+/)[0]
    );
    const permissive = /allowUnknownOption\(\s*true\s*\)/.test(body);
    for (const name of names) commands[name] = { options, permissive };
  }
  return commands;
}

// Flags the editor passes, by the cpm command they are passed to.
function callerFlags() {
  const calls = [];

  const settingsView = fs.readFileSync(
    path.join(ROOT, 'packages', 'settings-view', 'lib', 'package-manager.ts'),
    'utf8'
  );
  // Anything runCommand appends to every invocation applies to all of them.
  const universal = [
    ...settingsView.matchAll(/args\.push\(\s*['"](--[a-z-]+)['"]\s*\)/g)
  ].map(m => m[1]);
  for (const m of settingsView.matchAll(
    /const args = \[([^\]]*)\]/g
  )) {
    const parts = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
    if (!parts.length) continue;
    calls.push({
      where: 'settings-view/lib/package-manager.ts',
      command: parts[0],
      flags: parts.slice(1).filter(p => p.startsWith('--')).concat(universal)
    });
  }

  const corePackage = fs.readFileSync(path.join(ROOT, 'src', 'package.js'), 'utf8');
  for (const m of corePackage.matchAll(/args:\s*\[([^\]]*)\]/g)) {
    const parts = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
    if (!parts.length || parts[0].startsWith('--')) continue;
    calls.push({
      where: 'src/package.js',
      command: parts[0],
      flags: parts.slice(1).filter(p => p.startsWith('--'))
    });
  }

  return calls;
}

describe('cpm caller flags', () => {
  it('parses cpm command definitions', () => {
    const commands = cpmCommands();
    assert.ok(commands.list, 'expected a list command');
    assert.ok(commands.ls, 'expected ls as an alias of list');
    assert.ok(commands.rebuild, 'expected a rebuild command');
    assert.ok(
      commands.list.options.includes('--json'),
      'list must still accept --json; settings-view depends on it'
    );
  });

  it('finds the editor call sites', () => {
    const calls = callerFlags();
    assert.ok(
      calls.some(c => c.command === 'ls' || c.command === 'list'),
      'expected settings-view to list packages'
    );
    assert.ok(
      calls.some(c => c.command === 'rebuild'),
      'expected core to rebuild packages'
    );
  });

  it('passes no flag the target command would reject', () => {
    const commands = cpmCommands();
    const offenders = [];
    for (const call of callerFlags()) {
      const defined = commands[call.command];
      if (!defined) {
        offenders.push(`${call.where}: cpm has no command '${call.command}'`);
        continue;
      }
      if (defined.permissive) continue;
      for (const flag of call.flags) {
        if (!defined.options.includes(flag)) {
          offenders.push(
            `${call.where}: 'cpm ${call.command}' does not accept ${flag}; ` +
              'commander exits before running anything'
          );
        }
      }
    }
    assert.deepEqual(offenders, [], offenders.join('\n  '));
  });
});
