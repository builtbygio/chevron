'use strict';

/**
 * Stylesheets are compiled once at build time and shipped as CSS.
 *
 * With theme variables gone from the catalog, a stylesheet compiles to the
 * same bytes under every theme, so nothing needs a per-theme-pair cache and no
 * Less should reach a user machine. Build-tree assertions run everywhere; the
 * packaged-app ones only when out/app exists.
 *
 * Run: node --test script/ci/compiled-styles.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'out', 'app');

describe('stylesheets are compiled at build time', () => {
  it('the build no longer warms a per-theme less cache', () => {
    const build = fs.readFileSync(path.join(ROOT, 'script', 'build'), 'utf8');
    assert.ok(
      !/prebuild-less-cache|prebuildLessCache/.test(build),
      'the 16x theme matrix is gone; the build must not call it'
    );
    assert.ok(
      /compilePackageStyles\(\)/.test(build),
      'the build must compile stylesheets to CSS instead'
    );
    assert.ok(
      !fs.existsSync(path.join(ROOT, 'script', 'lib', 'prebuild-less-cache.js')),
      'prebuild-less-cache.js should be deleted, not merely unreferenced'
    );
  });

  it('compiles styles before metadata, so cached paths point at the CSS', () => {
    // generate-metadata records styleSheetPaths by listing the styles
    // directory. If it ran first it would record .less paths that no longer
    // exist by the time the app boots.
    const build = fs.readFileSync(path.join(ROOT, 'script', 'build'), 'utf8');
    const styles = build.indexOf('compilePackageStyles()');
    const metadata = build.indexOf('generateMetadata()');
    assert.ok(styles !== -1 && metadata !== -1, 'both steps must be present');
    assert.ok(
      styles < metadata,
      'compilePackageStyles() must run before generateMetadata()'
    );
  });

  describe('path handling across platforms', () => {
    // glob returns forward slashes even on Windows, where path.join produces
    // backslashes. The two spellings of one file compared unequal, so a
    // theme's index.less went into the discard list as well as the compiled
    // list and the build died unlinking it twice:
    //
    //   ENOENT: no such file or directory, unlink
    //     'D:\a\chevron\chevron\out\app\node_modules\one-dark-ui\index.less'
    //
    // Invisible on Linux, where both spellings are identical. Comparing on one
    // normalised spelling is checkable from any platform.
    const { normalize, samePath } = require('../lib/compile-package-styles');

    it('treats the two spellings of one path as the same file', () => {
      assert.ok(
        samePath(
          'D:\\a\\out\\app\\node_modules\\one-dark-ui\\index.less',
          'D:/a/out/app/node_modules/one-dark-ui/index.less'
        ),
        'a glob result and a path.join result must compare equal'
      );
    });

    it('still tells different files apart', () => {
      assert.ok(!samePath('D:/a/index.less', 'D:/a/styles/atom.less'));
      assert.ok(!samePath('/a/index.less', '/a/index2.less'));
    });

    it('normalises to one separator', () => {
      assert.equal(normalize('a\\b\\c.less'), 'a/b/c.less');
      assert.equal(normalize('a/b/c.less'), 'a/b/c.less');
    });
  });

  const describeApp = fs.existsSync(APP) ? describe : describe.skip;

  describeApp('the packaged app', () => {
    // Nested dependencies ship their own Less that this pipeline never
    // compiled (github's react-select uses mixins it does not provide), and
    // dot-chevron/styles.less is the user stylesheet template, compiled at
    // runtime by design.
    function catalogLessFiles() {
      const found = [];
      const walk = (dir, depth) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            // node_modules/<pkg>/node_modules/** is a nested dependency
            if (entry.name === 'node_modules' && depth > 0) continue;
            walk(full, depth + 1);
            continue;
          }
          if (entry.name.endsWith('.less')) found.push(full);
        }
      };
      // Bundled Chevron packages only. Third-party dependencies hoisted to the
      // app's top-level node_modules (react-select, react-tabs) ship their own
      // Less that this pipeline has never compiled and nothing loads as a
      // stylesheet.
      const modules = path.join(APP, 'node_modules');
      const manifest = path.join(APP, 'package.json');
      if (fs.existsSync(modules) && fs.existsSync(manifest)) {
        const bundled = Object.keys(
          JSON.parse(fs.readFileSync(manifest, 'utf8')).packageDependencies || {}
        );
        for (const entry of bundled) {
          const pkg = path.join(modules, entry);
          if (fs.existsSync(pkg) && fs.statSync(pkg).isDirectory()) walk(pkg, 0);
        }
      }
      // static/variables is definitions, not stylesheets. It has to stay Less:
      // theme-manager prepends `@import "variables/ui-variables"` to the user
      // stylesheet and to package stylesheets compiled at run time, so without
      // it those cannot compile in a packaged build.
      if (fs.existsSync(path.join(APP, 'static'))) {
        for (const entry of fs.readdirSync(path.join(APP, 'static'), {
          withFileTypes: true
        })) {
          if (entry.name === 'variables') continue;
          const full = path.join(APP, 'static', entry.name);
          if (entry.isDirectory()) walk(full, 2);
          else if (entry.name.endsWith('.less')) found.push(full);
        }
      }
      return found.map(f => path.relative(APP, f));
    }

    it('ships no Less for any bundled package or static stylesheet', () => {
      assert.deepEqual(
        catalogLessFiles(),
        [],
        'these would be compiled on the user machine at runtime:\n  ' +
          catalogLessFiles().join('\n  ')
      );
    });

    it('ships no per-theme-pair compile cache', () => {
      const cacheDir = path.join(APP, 'less-compile-cache');
      const buckets = fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir) : [];
      assert.deepEqual(
        buckets,
        [],
        `expected no warmed buckets, found ${buckets.length}; each one is a ` +
          'full compile of the catalog for one theme pair'
      );
    });

    it('every theme ships a single compiled index.css', () => {
      const modules = path.join(APP, 'node_modules');
      const missing = [];
      for (const entry of fs.readdirSync(modules)) {
        const manifest = path.join(modules, entry, 'package.json');
        if (!fs.existsSync(manifest)) continue;
        let theme;
        try {
          ({ theme } = JSON.parse(fs.readFileSync(manifest, 'utf8')));
        } catch (error) {
          continue;
        }
        if (theme !== 'ui' && theme !== 'syntax') continue;
        if (!fs.existsSync(path.join(modules, entry, 'index.css'))) {
          missing.push(entry);
        }
      }
      assert.deepEqual(missing, [], 'themes without a compiled index.css');
    });

    it('a UI theme publishes its variables as custom properties', () => {
      const css = path.join(APP, 'node_modules', 'one-dark-ui', 'index.css');
      if (!fs.existsSync(css)) return; // covered by the assertion above
      const source = fs.readFileSync(css, 'utf8');
      assert.ok(
        /--text-color:/.test(source),
        'the compiled theme must set the custom properties the catalog reads'
      );
      assert.ok(
        /--contrast-shift-sign:\s*1\b/.test(source),
        'One Dark is a dark theme, so its contrast sign is +1'
      );
    });
  });
});

/**
 * The user stylesheet compiles in a packaged build.
 *
 * theme-manager prepends the two base variable imports to the user stylesheet
 * and to any package stylesheet compiled at run time. The build used to
 * compile static/variables/*.less to 0-byte .css files -- definitions emit no
 * CSS -- and delete the originals with the rest, so those imports resolved to
 * nothing and every user stylesheet failed on launch with "Line number: 0" and
 * an undefined message.
 *
 * Run: node --test script/ci/compiled-styles.test.js
 */
describe('runtime Less compilation still has its variables', () => {
  const APP_ = path.join(ROOT, 'out', 'app');
  const describeApp = fs.existsSync(APP_) ? describe : describe.skip;

  describeApp('in the built app', () => {
    it('ships the base variable definitions as Less', () => {
      const dir = path.join(APP_, 'static', 'variables');
      for (const name of ['ui-variables.less', 'syntax-variables.less']) {
        assert.ok(
          fs.existsSync(path.join(dir, name)),
          `static/variables/${name} must ship; theme-manager imports it into ` +
            'every stylesheet compiled at run time'
        );
      }
    });

    it('does not ship the empty compiled forms', () => {
      const dir = path.join(APP_, 'static', 'variables');
      if (!fs.existsSync(dir)) return;
      const empty = fs
        .readdirSync(dir)
        .filter(f => f.endsWith('.css'))
        .filter(f => fs.statSync(path.join(dir, f)).size === 0);
      assert.deepEqual(
        empty,
        [],
        'compiling a definitions file emits nothing; these are artefacts:\n  ' +
          empty.join('\n  ')
      );
    });
  });
});
