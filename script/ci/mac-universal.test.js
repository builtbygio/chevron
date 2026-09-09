'use strict';

/**
 * The parts of the macOS universal merge that do not need a Mac: which
 * unpacked files get copied across, which Mach-O files the result is checked
 * for, and that the globs handed to @electron/universal match the paths it
 * will compare them with.
 *
 * Run: node --test script/ci/mac-universal.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const { makeTempDir } = require(path.join(ROOT, 'script', 'lib', 'temp-dir'));
const universal = require(path.join(
  ROOT,
  'script',
  'lib',
  'make-mac-universal'
));

function write(root, file, content = '') {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

// A minimal bundle: one binary, one framework, one helper, natives.
// A thin Mach-O for `arch`: the magic, then the arch as a payload so the two
// builds' bytes differ.
const machO = arch =>
  Buffer.concat([Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.from(arch)]);
// A Windows DLL, as fswin ships for every platform.
const PE = Buffer.from('MZ\x90\x00 not a mach-o');

function fakeApp(root, arch) {
  const app = path.join(root, arch, 'Chevron.app');
  write(app, 'Contents/MacOS/Chevron', arch);
  write(
    app,
    'Contents/Frameworks/Electron Framework.framework/Electron Framework',
    arch
  );
  write(
    app,
    'Contents/Frameworks/Chevron Helper.app/Contents/MacOS/Chevron Helper',
    arch
  );
  const unpacked = path.join(app, universal.UNPACKED);
  fs.writeFileSync(
    write(unpacked, 'node_modules/superstring/build/Release/superstring.node'),
    machO(arch)
  );
  fs.writeFileSync(write(unpacked, 'node_modules/fswin/arm64/fswin.node'), PE);
  fs.chmodSync(
    write(
      unpacked,
      `node_modules/tree-sitter/prebuilds/darwin-${arch}/tree-sitter.node`,
      arch
    ),
    0o755
  );
  write(unpacked, 'packages/symbols-view/vendor/ctags-darwin', 'x86_64');
  return app;
}

describe('parseLipoArchs / isUniversal', () => {
  it('reads lipo -archs output', () => {
    assert.deepEqual(universal.parseLipoArchs('x86_64 arm64\n'), [
      'arm64',
      'x86_64'
    ]);
    assert.deepEqual(universal.parseLipoArchs('arm64\n'), ['arm64']);
    assert.deepEqual(universal.parseLipoArchs(''), []);
  });

  it('calls a build universal only with both slices', () => {
    assert.equal(universal.isUniversal(['arm64', 'x86_64']), true);
    assert.equal(universal.isUniversal(['x86_64']), false);
    assert.equal(universal.isUniversal(['arm64', 'arm64e']), false);
  });
});

describe('unpackedDifferences', () => {
  it('names what each build has that the other lacks', () => {
    const diff = universal.unpackedDifferences(
      ['a.node', 'prebuilds/darwin-x64/t.node', 'shared'],
      ['a.node', 'prebuilds/darwin-arm64/t.node', 'shared']
    );
    assert.deepEqual(diff, {
      onlyX64: ['prebuilds/darwin-x64/t.node'],
      onlyArm64: ['prebuilds/darwin-arm64/t.node']
    });
  });
});

describe('equaliseUnpacked', () => {
  it('copies the per-arch prebuilds across so both bundles list the same files', () => {
    const root = makeTempDir('chevron-universal-test-');
    const x64 = fakeApp(root, 'x64');
    const arm64 = fakeApp(root, 'arm64');
    const link = path.join(
      arm64,
      universal.UNPACKED,
      'node_modules/dugite/git/bin/git-alias'
    );
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync('git', link);

    const diff = universal.equaliseUnpacked(x64, arm64);

    assert.deepEqual(diff.onlyX64, [
      'node_modules/tree-sitter/prebuilds/darwin-x64/tree-sitter.node'
    ]);
    assert.deepEqual(diff.onlyArm64, [
      'node_modules/dugite/git/bin/git-alias',
      'node_modules/tree-sitter/prebuilds/darwin-arm64/tree-sitter.node'
    ]);
    assert.deepEqual(
      universal.listFiles(path.join(x64, universal.UNPACKED)),
      universal.listFiles(path.join(arm64, universal.UNPACKED))
    );
    // Copied, not merged: each side keeps its own bytes where both had a file.
    assert.deepEqual(
      fs.readFileSync(
        path.join(
          x64,
          universal.UNPACKED,
          'node_modules/superstring/build/Release/superstring.node'
        )
      ),
      machO('x64')
    );
    assert.equal(
      fs.readFileSync(
        path.join(
          x64,
          universal.UNPACKED,
          'node_modules/tree-sitter/prebuilds/darwin-arm64/tree-sitter.node'
        ),
        'utf8'
      ),
      'arm64'
    );
    const copiedLink = path.join(
      x64,
      universal.UNPACKED,
      'node_modules/dugite/git/bin/git-alias'
    );
    assert.ok(
      fs.lstatSync(copiedLink).isSymbolicLink(),
      'a symlink stays a symlink'
    );
    assert.equal(fs.readlinkSync(copiedLink), 'git');
    const copiedNative = path.join(
      x64,
      universal.UNPACKED,
      'node_modules/tree-sitter/prebuilds/darwin-arm64/tree-sitter.node'
    );
    assert.equal(
      fs.statSync(copiedNative).mode & 0o777,
      0o755,
      'the mode travels with the file'
    );
  });
});

describe('nonMachODifferences', () => {
  it('recognises Mach-O by its magic, in either byte order, thin or fat', () => {
    assert.equal(universal.isMachO(machO('x64')), true);
    assert.equal(
      universal.isMachO(Buffer.from([0xfe, 0xed, 0xfa, 0xcf, 0])),
      true
    );
    assert.equal(
      universal.isMachO(Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0])),
      true
    );
    assert.equal(
      universal.isMachO(Buffer.from('!<arch>\nhunspell.a')),
      false,
      'a static archive'
    );
    assert.equal(universal.isMachO(Buffer.from('')), false);
  });

  it('lists every common file that differs without being Mach-O, and nothing else', () => {
    const root = makeTempDir('chevron-universal-test-');
    const x64 = path.join(root, 'x64');
    const arm64 = path.join(root, 'arm64');
    for (const [dir, arch] of [[x64, 'x64'], [arm64, 'arm64']]) {
      fs.writeFileSync(
        write(dir, 'node_modules/superstring/build/Release/superstring.node'),
        machO(arch)
      );
      write(
        dir,
        'node_modules/spellchecker/build/Release/hunspell.a',
        `!<arch>\n${arch}`
      );
      write(
        dir,
        'node_modules/spellchecker/package.json',
        '{"name":"spellchecker"}'
      );
      write(dir, `node_modules/only-${arch}.txt`, arch);
      write(
        dir,
        'node_modules/git-utils/build/Release/git2.a',
        `!<arch>\n${arch}`
      );
    }
    assert.deepEqual(universal.nonMachODifferences(x64, arm64), [
      'node_modules/git-utils/build/Release/git2.a',
      'node_modules/spellchecker/build/Release/hunspell.a'
    ]);
  });

  it('finds the same inside two asars', async t => {
    let asar;
    try {
      asar = require(require.resolve('@electron/asar', {
        paths: [path.join(ROOT, 'script')]
      }));
    } catch (error) {
      return t.skip('script dependencies are not installed');
    }
    const root = makeTempDir('chevron-universal-test-');
    const archives = {};
    for (const arch of ['x64', 'arm64']) {
      const src = path.join(root, arch, 'app');
      fs.writeFileSync(write(src, 'lib/native.node'), machO(arch));
      write(src, 'lib/pcre.a', `!<arch>\n${arch}`);
      write(src, 'lib/same.js', 'module.exports = 1;');
      archives[arch] = path.join(root, arch, 'app.asar');
      await asar.createPackage(src, archives[arch]);
    }
    assert.deepEqual(
      universal.asarNonMachODifferences(archives.x64, archives.arm64),
      ['lib/pcre.a']
    );
  });
});

describe('describeDifference', () => {
  const buf = value =>
    Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));

  it('names the JSON path that differs, including array length and order', () => {
    const lines = universal.describeDifference(
      buf({
        _atomModuleCache: { extensions: { '.node': ['a.node', 'b.node'] } },
        v: 1
      }),
      buf({
        _atomModuleCache: {
          extensions: { '.node': ['b.node', 'a.node', 'c.node'] }
        },
        v: 1
      })
    );
    assert.deepEqual(lines, [
      '$._atomModuleCache.extensions..node: 2 vs 3 entries',
      '$._atomModuleCache.extensions..node[0]: "a.node" vs "b.node"',
      '$._atomModuleCache.extensions..node[1]: "b.node" vs "a.node"'
    ]);
  });

  it('reports keys present on one side only', () => {
    assert.deepEqual(
      universal.describeDifference(buf({ a: 1 }), buf({ b: 1 })),
      ['$.a: only in x64', '$.b: only in arm64']
    );
  });

  it('diffs text by line and gives up on binary', () => {
    assert.deepEqual(
      universal.describeDifference(buf('one\ntwo\n'), buf('one\ndeux\n')),
      ['x64 only: two', 'arm64 only: deux']
    );
    assert.deepEqual(
      universal.describeDifference(Buffer.from([0, 1, 2]), Buffer.from([0, 1])),
      ['binary: 3 vs 2 bytes']
    );
  });
});

describe('overwritingSymlink', () => {
  it('replaces an existing symlink, keeps a file, and otherwise behaves like symlink', async () => {
    const root = makeTempDir('chevron-universal-test-');
    const symlink = universal.overwritingSymlink(fs.promises.symlink);
    fs.writeFileSync(path.join(root, 'git'), 'binary');
    fs.symlinkSync('old-target', path.join(root, 'git-add'));
    fs.writeFileSync(path.join(root, 'plain'), 'a regular file');

    await symlink('git', path.join(root, 'git-add'));
    assert.equal(
      fs.readlinkSync(path.join(root, 'git-add')),
      'git',
      'an existing symlink is replaced'
    );

    await symlink('git', path.join(root, 'git-commit'));
    assert.equal(
      fs.readlinkSync(path.join(root, 'git-commit')),
      'git',
      'a new one is created'
    );

    await assert.rejects(symlink('git', path.join(root, 'plain')), {
      code: 'EEXIST'
    });
    assert.equal(
      fs.readFileSync(path.join(root, 'plain'), 'utf8'),
      'a regular file',
      'a file is never removed'
    );

    await assert.rejects(
      symlink('git', path.join(root, 'no', 'such', 'dir', 'x')),
      { code: 'ENOENT' }
    );
  });
});

describe('machOToVerify', () => {
  it('lists the binaries the merge must have made fat, and not the ones that stay thin or belong to another platform', () => {
    const root = makeTempDir('chevron-universal-test-');
    const app = fakeApp(root, 'x64');
    const relative = universal
      .machOToVerify(app)
      .map(f => path.relative(app, f))
      .sort();
    assert.deepEqual(relative, [
      'Contents/Frameworks/Chevron Helper.app/Contents/MacOS/Chevron Helper',
      'Contents/Frameworks/Electron Framework.framework/Electron Framework',
      'Contents/MacOS/Chevron',
      'Contents/Resources/app.asar.unpacked/node_modules/superstring/build/Release/superstring.node'
    ]);
  });
});

describe('the globs handed to @electron/universal', () => {
  // Resolved from @electron/universal's own tree: the version it matches with.
  let minimatch = null;
  try {
    const base = path.dirname(
      require.resolve('@electron/universal/package.json', {
        paths: [path.join(ROOT, 'script')]
      })
    );
    const mod = require(require.resolve('minimatch', { paths: [base] }));
    minimatch = mod.minimatch || mod;
  } catch (error) {
    minimatch = null;
  }
  const match = (file, pattern) =>
    minimatch(file, pattern, { matchBase: true });

  it('allow the per-arch prebuild folders, and their files, to exist in one asar only', t => {
    if (!minimatch) return t.skip('script dependencies are not installed');
    const g = universal.ARCH_SPECIFIC_LISTINGS;
    assert.equal(
      match('node_modules/tree-sitter/prebuilds/darwin-arm64', g),
      true,
      'the folder entry'
    );
    assert.equal(
      match(
        'node_modules/tree-sitter/prebuilds/darwin-x64/tree-sitter.node',
        g
      ),
      true
    );
    assert.equal(
      match('node_modules/tree-sitter/prebuilds', g),
      false,
      'the parent is in both'
    );
    assert.equal(
      match('node_modules/node-pty/build/Release/pty.node', g),
      false,
      'a built native is in both'
    );
    assert.equal(match('package.json', g), false);
  });

  it('accept an identical Mach-O only where one is expected', t => {
    if (!minimatch) return t.skip('script dependencies are not installed');
    const g = universal.IDENTICAL_MACHO;
    const unpacked = 'Contents/Resources/app.asar.unpacked';
    assert.equal(
      match(`${unpacked}/packages/symbols-view/vendor/ctags-darwin`, g),
      true
    );
    assert.equal(
      match(
        `${unpacked}/node_modules/tree-sitter/prebuilds/darwin-x64/tree-sitter.node`,
        g
      ),
      true
    );
    assert.equal(
      match(
        `${unpacked}/node_modules/superstring/build/Release/superstring.node`,
        g
      ),
      false,
      'a native identical in both builds would mean one host built the wrong arch'
    );
    assert.equal(match('Contents/MacOS/Chevron', g), false);
  });
});

describe('makeMacUniversal', () => {
  it('refuses to run anywhere but macOS', async t => {
    if (process.platform === 'darwin')
      return t.skip('needs a non-Mac to observe the refusal');
    await assert.rejects(
      universal.makeMacUniversal({
        x64AppPath: '/a.app',
        arm64AppPath: '/b.app',
        outAppPath: '/c.app'
      }),
      /run this on a Mac/
    );
  });
});
