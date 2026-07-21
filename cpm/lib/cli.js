'use strict';

const { Command } = require('commander');
const { listPackages } = require('./commands/list');
const { doctor } = require('./commands/doctor');
const { rebuildPackages } = require('./commands/rebuild');
const { installPackage } = require('./commands/install');
const { uninstallPackage } = require('./commands/uninstall');
const { linkPackage, unlinkPackage } = require('./commands/link');

async function main(argv = process.argv) {
  const program = new Command();
  program
    .name('cpm')
    .description(
      'Chevron Package Manager — install Atom-compatible packages (Electron-as-Node)'
    )
    .version(require('../package.json').version);

  program
    .command('list')
    .option('--json', 'JSON output')
    .action(opts => {
      process.exitCode = listPackages(opts);
    });

  program.command('ls').action(() => {
    process.exitCode = listPackages({});
  });

  program.command('doctor').action(() => {
    process.exitCode = doctor();
  });

  program
    .command('rebuild [names...]')
    .allowUnknownOption(true) // --no-color from Package.runRebuildProcess
    .option('--no-color', 'Accepted for Package.runRebuildProcess compatibility')
    .action(async (names, opts) => {
      process.exitCode = await rebuildPackages(names || [], {
        noColor: true
      });
    });

  // Bare `cpm rebuild --no-color` used by editor: commander may parse as global.
  // Also register rebuild when first arg is rebuild via fallback below.

  program
    .command('install [spec]')
    .option('--allow-scripts', 'Run package lifecycle scripts (off by default)')
    .option(
      '--strict',
      'Fail when engines.atom / engines.chevron are not satisfied'
    )
    .action(async (spec, opts) => {
      if (!spec) {
        process.stderr.write('cpm install: package name, URL, or path required\n');
        process.exitCode = 1;
        return;
      }
      process.exitCode = await installPackage(spec, {
        allowScripts: opts.allowScripts,
        strict: opts.strict
      });
    });

  program.command('uninstall <name>').action(async name => {
    process.exitCode = await uninstallPackage(name);
  });

  program.command('remove <name>').action(async name => {
    process.exitCode = await uninstallPackage(name);
  });

  program.command('link [path]').action(async p => {
    process.exitCode = await linkPackage(p);
  });

  program.command('unlink [name]').action(async name => {
    process.exitCode = await unlinkPackage(name);
  });

  // Editor contract: argv often `… rebuild --no-color` with no package name.
  // Commander 12 handles this via rebuild [names...].

  await program.parseAsync(argv);
}

module.exports = { main };

if (require.main === module) {
  main().catch(err => {
    process.stderr.write(String(err && err.stack ? err.stack : err) + '\n');
    process.exit(1);
  });
}
