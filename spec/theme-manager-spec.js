const path = require('path');
const fs = require('fs-plus');
const temp = require('temp').track();
const { conditionPromise } = require('./async-spec-helpers');

describe('atom.themes', function() {
  beforeEach(async function() {
    spyOn(chevron, 'inSpecMode').andReturn(false);
    spyOn(console, 'warn');
  });

  afterEach(async function() {
    await chevron.themes.deactivateThemes();
    try {
      temp.cleanupSync();
    } catch (error) {}
  });

  describe('theme getters and setters', function() {
    beforeEach(async function() {
      jasmine.snapshotDeprecations();
      chevron.packages.loadPackages();
    });

    afterEach(() => jasmine.restoreDeprecationsSnapshot());

    describe('getLoadedThemes', () =>
      it('gets all the loaded themes', function() {
        const themes = chevron.themes.getLoadedThemes();
        expect(themes.length).toBeGreaterThan(2);
      }));

    describe('getActiveThemes', () =>
      it('gets all the active themes', async function() {
        await chevron.themes.activateThemes();
        const names = chevron.config.get('core.themes');
        expect(names.length).toBeGreaterThan(0);
        const themes = chevron.themes.getActiveThemes();
        expect(themes).toHaveLength(names.length);
      }));
  });

  describe('when the core.themes config value contains invalid entry', () =>
    it('ignores theme', function() {
      chevron.config.set('core.themes', [
        'chevron-light-ui',
        null,
        undefined,
        '',
        false,
        4,
        {},
        [],
        'chevron-dark-ui'
      ]);

      expect(chevron.themes.getEnabledThemeNames()).toEqual([
        'chevron-dark-ui',
        'chevron-light-ui'
      ]);
    }));


  describe('legacy atom-* theme names', () =>
    it('maps atom-dark-ui / atom-light-ui to chevron-* packages', function() {
      chevron.config.set('core.themes', ['atom-light-ui', 'atom-dark-ui']);
      expect(chevron.themes.getEnabledThemeNames()).toEqual([
        'chevron-dark-ui',
        'chevron-light-ui'
      ]);
    }));

  describe('core.followSystemTheme', function() {
    beforeEach(() => chevron.config.set('core.themes', ['one-dark-ui', 'one-dark-syntax']));

    it('leaves the configured themes alone while off', function() {
      chevron.config.set('core.followSystemTheme', false);
      spyOn(chevron.applicationDelegate, 'shouldUseDarkColors').andReturn(false);
      expect(chevron.themes.getEnabledThemeNames()).toEqual([
        'one-dark-syntax',
        'one-dark-ui'
      ]);
    });

    it('activates the light counterparts on a light desktop', function() {
      chevron.config.set('core.followSystemTheme', true);
      spyOn(chevron.applicationDelegate, 'shouldUseDarkColors').andReturn(false);
      expect(chevron.themes.getEnabledThemeNames()).toEqual([
        'one-light-syntax',
        'one-light-ui'
      ]);
    });

    it('keeps the dark themes on a dark desktop', function() {
      chevron.config.set('core.followSystemTheme', true);
      spyOn(chevron.applicationDelegate, 'shouldUseDarkColors').andReturn(true);
      expect(chevron.themes.getEnabledThemeNames()).toEqual([
        'one-dark-syntax',
        'one-dark-ui'
      ]);
    });

    it('reloads the themes when the OS appearance changes', async function() {
      jasmine.useRealClock();
      let nativeThemeListener;
      spyOn(chevron.applicationDelegate, 'onDidChangeNativeTheme').andCallFake(callback => {
        nativeThemeListener = callback;
        return { dispose() {} };
      });
      const dark = spyOn(chevron.applicationDelegate, 'shouldUseDarkColors').andReturn(true);
      spyOn(chevron.styles, 'getUserStyleSheetPath').andCallFake(() => null);
      chevron.config.set('core.followSystemTheme', true);

      await chevron.themes.activateThemes();

      let didChangeActiveThemesHandler;
      expect(chevron.themes.getActiveThemes().map(t => t.name).sort()).toEqual([
        'one-dark-syntax',
        'one-dark-ui'
      ]);
      chevron.themes.onDidChangeActiveThemes(
        (didChangeActiveThemesHandler = jasmine.createSpy())
      );
      dark.andReturn(false);
      nativeThemeListener({ shouldUseDarkColors: false });

      await conditionPromise(() => didChangeActiveThemesHandler.callCount === 1);
      expect(chevron.themes.getActiveThemes().map(t => t.name).sort()).toEqual([
        'one-light-syntax',
        'one-light-ui'
      ]);
    });
  });

  describe('::getImportPaths()', function() {
    it('returns the theme directories before the themes are loaded', function() {
      chevron.config.set('core.themes', [
        'theme-with-index-less',
        'chevron-dark-ui',
        'chevron-light-ui'
      ]);

      const paths = chevron.themes.getImportPaths();

      // syntax theme is not a dir at this time, so only two.
      expect(paths.length).toBe(2);
      expect(paths[0]).toContain('chevron-light-ui');
      expect(paths[1]).toContain('chevron-dark-ui');
    });

    it('ignores themes that cannot be resolved to a directory', function() {
      chevron.config.set('core.themes', ['definitely-not-a-theme']);
      expect(() => chevron.themes.getImportPaths()).not.toThrow();
    });
  });

  describe('when the core.themes config value changes', function() {
    it('add/removes stylesheets to reflect the new config value', async function() {
      jasmine.useRealClock();
      let didChangeActiveThemesHandler;
      chevron.themes.onDidChangeActiveThemes(
        (didChangeActiveThemesHandler = jasmine.createSpy())
      );
      spyOn(chevron.styles, 'getUserStyleSheetPath').andCallFake(() => null);

      await chevron.themes.activateThemes();
      didChangeActiveThemesHandler.reset();
      chevron.config.set('core.themes', []);

      await conditionPromise(
        () => didChangeActiveThemesHandler.callCount === 1,
        'a'
      );
      didChangeActiveThemesHandler.reset();
      expect(document.querySelectorAll('style.theme')).toHaveLength(0);
      chevron.config.set('core.themes', ['chevron-dark-ui']);

      await conditionPromise(
        () => didChangeActiveThemesHandler.callCount === 1,
        'b'
      );
      didChangeActiveThemesHandler.reset();
      expect(document.querySelectorAll('style[priority="1"]')).toHaveLength(2);
      expect(
        document
          .querySelector('style[priority="1"]')
          .getAttribute('source-path')
      ).toMatch(/chevron-dark-ui/);
      chevron.config.set('core.themes', ['chevron-light-ui', 'chevron-dark-ui']);

      await conditionPromise(
        () => didChangeActiveThemesHandler.callCount === 1,
        'c'
      );
      didChangeActiveThemesHandler.reset();
      expect(document.querySelectorAll('style[priority="1"]')).toHaveLength(2);
      expect(
        document
          .querySelectorAll('style[priority="1"]')[0]
          .getAttribute('source-path')
      ).toMatch(/chevron-dark-ui/);
      expect(
        document
          .querySelectorAll('style[priority="1"]')[1]
          .getAttribute('source-path')
      ).toMatch(/chevron-light-ui/);
      chevron.config.set('core.themes', []);

      await conditionPromise(() => didChangeActiveThemesHandler.callCount === 1);
      didChangeActiveThemesHandler.reset();
      expect(document.querySelectorAll('style[priority="1"]')).toHaveLength(2);
      // chevron-dark-ui has a directory path, the syntax one doesn't
      chevron.config.set('core.themes', [
        'theme-with-index-less',
        'chevron-dark-ui'
      ]);

      await conditionPromise(() => didChangeActiveThemesHandler.callCount === 1);
      expect(document.querySelectorAll('style[priority="1"]')).toHaveLength(2);
      const importPaths = chevron.themes.getImportPaths();
      expect(importPaths.length).toBe(1);
      expect(importPaths[0]).toContain('chevron-dark-ui');
    });

    it('adds theme-* classes to the workspace for each active theme', async function() {
      jasmine.useRealClock();
      chevron.config.set('core.themes', ['chevron-dark-ui', 'chevron-dark-syntax']);

      let didChangeActiveThemesHandler;
      chevron.themes.onDidChangeActiveThemes(
        (didChangeActiveThemesHandler = jasmine.createSpy())
      );
      await chevron.themes.activateThemes();

      const workspaceElement = chevron.workspace.getElement();
      expect(workspaceElement).toHaveClass('theme-chevron-dark-ui');

      chevron.themes.onDidChangeActiveThemes(
        (didChangeActiveThemesHandler = jasmine.createSpy())
      );
      chevron.config.set('core.themes', [
        'theme-with-ui-variables',
        'theme-with-syntax-variables'
      ]);

      await conditionPromise(() => didChangeActiveThemesHandler.callCount > 0);
      // `theme-` twice as it prefixes the name with `theme-`
      expect(workspaceElement).toHaveClass('theme-theme-with-ui-variables');
      expect(workspaceElement).toHaveClass(
        'theme-theme-with-syntax-variables'
      );
      expect(workspaceElement).not.toHaveClass('theme-chevron-dark-ui');
      expect(workspaceElement).not.toHaveClass('theme-chevron-dark-syntax');
    });
  });

  describe('when a theme fails to load', () =>
    it('logs a warning', function() {
      console.warn.reset();
      chevron.packages
        .activatePackage('a-theme-that-will-not-be-found')
        .then(function() {}, function() {});
      expect(console.warn.callCount).toBe(1);
      expect(console.warn.argsForCall[0][0]).toContain(
        "Could not resolve 'a-theme-that-will-not-be-found'"
      );
    }));

  describe('::requireStylesheet(path)', function() {
    beforeEach(() => jasmine.snapshotDeprecations());

    afterEach(() => jasmine.restoreDeprecationsSnapshot());

    it('synchronously loads css at the given path and installs a style tag for it in the head', function() {
      let styleElementAddedHandler;
      chevron.styles.onDidAddStyleElement(
        (styleElementAddedHandler = jasmine.createSpy(
          'styleElementAddedHandler'
        ))
      );

      const cssPath = getAbsolutePath(
        chevron.project.getDirectories()[0],
        'css.css'
      );
      const lengthBefore = document.querySelectorAll('head style').length;

      chevron.themes.requireStylesheet(cssPath);
      expect(document.querySelectorAll('head style').length).toBe(
        lengthBefore + 1
      );

      expect(styleElementAddedHandler).toHaveBeenCalled();

      const element = document.querySelector(
        'head style[source-path*="css.css"]'
      );
      expect(element.getAttribute('source-path')).toEqualPath(cssPath);
      expect(element.textContent).toBe(fs.readFileSync(cssPath, 'utf8'));

      // doesn't append twice
      styleElementAddedHandler.reset();
      chevron.themes.requireStylesheet(cssPath);
      expect(document.querySelectorAll('head style').length).toBe(
        lengthBefore + 1
      );
      expect(styleElementAddedHandler).not.toHaveBeenCalled();

      document
        .querySelectorAll('head style[id*="css.css"]')
        .forEach(styleElement => {
          styleElement.remove();
        });
    });

    it('synchronously loads and parses less files at the given path and installs a style tag for it in the head', function() {
      const lessPath = getAbsolutePath(
        chevron.project.getDirectories()[0],
        'sample.less'
      );
      const lengthBefore = document.querySelectorAll('head style').length;
      chevron.themes.requireStylesheet(lessPath);
      expect(document.querySelectorAll('head style').length).toBe(
        lengthBefore + 1
      );

      const element = document.querySelector(
        'head style[source-path*="sample.less"]'
      );
      expect(element.getAttribute('source-path')).toEqualPath(lessPath);
      expect(element.textContent.toLowerCase()).toBe(`\
#header {
  color: #4d926f;
}
h2 {
  color: #4d926f;
}
\
`);

      // doesn't append twice
      chevron.themes.requireStylesheet(lessPath);
      expect(document.querySelectorAll('head style').length).toBe(
        lengthBefore + 1
      );
      document
        .querySelectorAll('head style[id*="sample.less"]')
        .forEach(styleElement => {
          styleElement.remove();
        });
    });

    it('supports requiring css and less stylesheets without an explicit extension', function() {
      chevron.themes.requireStylesheet(path.join(__dirname, 'fixtures', 'css'));
      expect(
        document
          .querySelector('head style[source-path*="css.css"]')
          .getAttribute('source-path')
      ).toEqualPath(
        getAbsolutePath(chevron.project.getDirectories()[0], 'css.css')
      );
      chevron.themes.requireStylesheet(path.join(__dirname, 'fixtures', 'sample'));
      expect(
        document
          .querySelector('head style[source-path*="sample.less"]')
          .getAttribute('source-path')
      ).toEqualPath(
        getAbsolutePath(chevron.project.getDirectories()[0], 'sample.less')
      );

      document.querySelector('head style[source-path*="css.css"]').remove();
      document.querySelector('head style[source-path*="sample.less"]').remove();
    });

    it('returns a disposable allowing styles applied by the given path to be removed', function() {
      const cssPath = require.resolve('./fixtures/css.css');

      expect(getComputedStyle(document.body).fontWeight).not.toBe('700');
      const disposable = chevron.themes.requireStylesheet(cssPath);
      expect(getComputedStyle(document.body).fontWeight).toBe('700');

      let styleElementRemovedHandler;
      chevron.styles.onDidRemoveStyleElement(
        (styleElementRemovedHandler = jasmine.createSpy(
          'styleElementRemovedHandler'
        ))
      );

      disposable.dispose();

      expect(getComputedStyle(document.body).fontWeight).not.toBe('bold');

      expect(styleElementRemovedHandler).toHaveBeenCalled();
    });
  });

  describe('base style sheet loading', function() {
    beforeEach(async function() {
      const workspaceElement = chevron.workspace.getElement();
      jasmine.attachToDOM(chevron.workspace.getElement());
      workspaceElement.appendChild(document.createElement('chevron-text-editor'));

      await chevron.themes.activateThemes();
    });

    it("loads the correct values from the theme's ui-variables file", async function() {
      jasmine.useRealClock();
      let didChangeActiveThemesHandler;
      chevron.themes.onDidChangeActiveThemes(
        (didChangeActiveThemesHandler = jasmine.createSpy())
      );
      chevron.config.set('core.themes', [
        'theme-with-ui-variables',
        'theme-with-syntax-variables'
      ]);

      await conditionPromise(() => didChangeActiveThemesHandler.callCount > 0);

      // Base CSS reads custom properties that bundled themes publish at build
      // time, so only the theme's own stylesheets see these fixture variables.
      expect(
        getComputedStyle(document.querySelector('chevron-text-editor')).paddingTop
      ).toBe('150px');
      expect(
        getComputedStyle(document.querySelector('chevron-text-editor'))
          .paddingRight
      ).toBe('150px');
      expect(
        getComputedStyle(document.querySelector('chevron-text-editor'))
          .paddingBottom
      ).toBe('150px');
    });

    describe('when there is a theme with incomplete variables', () =>
      it('loads the correct values from the fallback ui-variables', async function() {
        jasmine.useRealClock();
        let didChangeActiveThemesHandler;
        chevron.themes.onDidChangeActiveThemes(
          (didChangeActiveThemesHandler = jasmine.createSpy())
        );
        chevron.config.set('core.themes', [
          'theme-with-incomplete-ui-variables',
          'theme-with-syntax-variables'
        ]);

        await conditionPromise(() => didChangeActiveThemesHandler.callCount > 0);
        expect(
          getComputedStyle(document.querySelector('chevron-text-editor'))
            .backgroundColor
        ).toBe('rgb(0, 152, 255)');
      }));
  });

  describe('user stylesheet', function() {
    let userStylesheetPath;
    beforeEach(async function() {
      userStylesheetPath = path.join(temp.mkdirSync('atom'), 'styles.less');
      fs.writeFileSync(
        userStylesheetPath,
        'body {border-style: dotted !important;}'
      );
      spyOn(chevron.styles, 'getUserStyleSheetPath').andReturn(userStylesheetPath);
    });

    describe('when the user stylesheet changes', function() {
      beforeEach(() => jasmine.snapshotDeprecations());

      afterEach(() => jasmine.restoreDeprecationsSnapshot());

      it('reloads it', async function() {
        jasmine.useRealClock();
        let styleElementAddedHandler, styleElementRemovedHandler;

        await chevron.themes.activateThemes();

        chevron.styles.onDidRemoveStyleElement(
          (styleElementRemovedHandler = jasmine.createSpy(
            'styleElementRemovedHandler'
          ))
        );
        chevron.styles.onDidAddStyleElement(
          (styleElementAddedHandler = jasmine.createSpy(
            'styleElementAddedHandler'
          ))
        );

        spyOn(chevron.themes, 'loadUserStylesheet').andCallThrough();

        expect(getComputedStyle(document.body).borderStyle).toBe('dotted');
        fs.writeFileSync(userStylesheetPath, 'body {border-style: dashed}');

        await conditionPromise(
          () => chevron.themes.loadUserStylesheet.callCount === 1
        );
        expect(getComputedStyle(document.body).borderStyle).toBe('dashed');

        expect(styleElementRemovedHandler).toHaveBeenCalled();
        expect(
          styleElementRemovedHandler.argsForCall[0][0].textContent
        ).toContain('dotted');

        expect(styleElementAddedHandler).toHaveBeenCalled();
        expect(styleElementAddedHandler.argsForCall[0][0].textContent).toContain(
          'dashed'
        );

        styleElementRemovedHandler.reset();
        fs.removeSync(userStylesheetPath);

        await conditionPromise(
          () => chevron.themes.loadUserStylesheet.callCount === 2
        );
        expect(styleElementRemovedHandler).toHaveBeenCalled();
        expect(
          styleElementRemovedHandler.argsForCall[0][0].textContent
        ).toContain('dashed');
        expect(getComputedStyle(document.body).borderStyle).toBe('none');
      });
    });

    describe('when there is an error reading the stylesheet', function() {
      let addErrorHandler = null;
      beforeEach(async function() {
        chevron.themes.loadUserStylesheet();
        spyOn(chevron.themes.lessCache, 'cssForFile').andCallFake(function() {
          throw new Error('EACCES permission denied "styles.less"');
        });
        chevron.notifications.onDidAddNotification(
          (addErrorHandler = jasmine.createSpy())
        );
      });

      it('creates an error notification and does not add the stylesheet', function() {
        chevron.themes.loadUserStylesheet();
        expect(addErrorHandler).toHaveBeenCalled();
        const note = addErrorHandler.mostRecentCall.args[0];
        expect(note.getType()).toBe('error');
        expect(note.getMessage()).toContain('Error loading');
        expect(
          chevron.styles.styleElementsBySourcePath[
            chevron.styles.getUserStyleSheetPath()
          ]
        ).toBeUndefined();
      });
    });

    describe('when there is an error watching the user stylesheet', function() {
      let addErrorHandler = null;
      beforeEach(async function() {
        const { File } = require('pathwatcher');
        spyOn(File.prototype, 'on').andCallFake(function(event) {
          if (event.indexOf('contents-changed') > -1) {
            throw new Error('Unable to watch path');
          }
        });
        spyOn(chevron.themes, 'loadStylesheet').andReturn('');
        chevron.notifications.onDidAddNotification(
          (addErrorHandler = jasmine.createSpy())
        );
      });

      it('creates an error notification', function() {
        chevron.themes.loadUserStylesheet();
        expect(addErrorHandler).toHaveBeenCalled();
        const note = addErrorHandler.mostRecentCall.args[0];
        expect(note.getType()).toBe('error');
        expect(note.getMessage()).toContain('Unable to watch path');
      });
    });

    it("adds a notification when a theme's stylesheet is invalid", function() {
      const addErrorHandler = jasmine.createSpy();
      chevron.notifications.onDidAddNotification(addErrorHandler);
      expect(() =>
        chevron.packages
          .activatePackage('theme-with-invalid-styles')
          .then(function() {}, function() {})
      ).not.toThrow();
      expect(addErrorHandler.callCount).toBe(2);
      expect(addErrorHandler.argsForCall[1][0].message).toContain(
        'Failed to activate the theme-with-invalid-styles theme'
      );
    });
  });

  describe('when a non-existent theme is present in the config', function() {
    beforeEach(async function() {
      console.warn.reset();
      chevron.config.set('core.themes', [
        'non-existent-dark-ui',
        'non-existent-dark-syntax'
      ]);

      await chevron.themes.activateThemes();
    });

    it('uses the default one-dark UI and syntax themes and logs a warning', function() {
      const activeThemeNames = chevron.themes.getActiveThemeNames();
      expect(console.warn.callCount).toBe(2);
      expect(activeThemeNames.length).toBe(2);
      expect(activeThemeNames).toContain('one-dark-ui');
      expect(activeThemeNames).toContain('one-dark-syntax');
    });
  });

  describe('when in safe mode', function() {
    describe('when the enabled UI and syntax themes are bundled with Chevron', function() {
      beforeEach(async function() {
        chevron.config.set('core.themes', ['chevron-light-ui', 'chevron-dark-syntax']);

        await chevron.themes.activateThemes();
      });

      it('uses the enabled themes', function() {
        const activeThemeNames = chevron.themes.getActiveThemeNames();
        expect(activeThemeNames.length).toBe(2);
        expect(activeThemeNames).toContain('chevron-light-ui');
        expect(activeThemeNames).toContain('chevron-dark-syntax');
      });
    });

    describe('when the enabled UI and syntax themes are not bundled with Chevron', function() {
      beforeEach(async function() {
        chevron.config.set('core.themes', [
          'installed-dark-ui',
          'installed-dark-syntax'
        ]);

        await chevron.themes.activateThemes();
      });

      it('uses the default dark UI and syntax themes', function() {
        const activeThemeNames = chevron.themes.getActiveThemeNames();
        expect(activeThemeNames.length).toBe(2);
        expect(activeThemeNames).toContain('one-dark-ui');
        expect(activeThemeNames).toContain('one-dark-syntax');
      });
    });

    describe('when the enabled UI theme is not bundled with Chevron', function() {
      beforeEach(async function() {
        chevron.config.set('core.themes', [
          'installed-dark-ui',
          'chevron-light-syntax'
        ]);

        await chevron.themes.activateThemes();
      });

      it('uses the default one-dark UI theme', function() {
        const activeThemeNames = chevron.themes.getActiveThemeNames();
        expect(activeThemeNames.length).toBe(2);
        expect(activeThemeNames).toContain('one-dark-ui');
        expect(activeThemeNames).toContain('chevron-light-syntax');
      });
    });

    describe('when the enabled syntax theme is not bundled with Chevron', function() {
      beforeEach(async function() {
        chevron.config.set('core.themes', [
          'chevron-light-ui',
          'installed-dark-syntax'
        ]);

        await chevron.themes.activateThemes();
      });

      it('uses the default one-dark syntax theme', function() {
        const activeThemeNames = chevron.themes.getActiveThemeNames();
        expect(activeThemeNames.length).toBe(2);
        expect(activeThemeNames).toContain('chevron-light-ui');
        expect(activeThemeNames).toContain('one-dark-syntax');
      });
    });
  });
});

function getAbsolutePath(directory, relativePath) {
  if (directory) {
    return directory.resolve(relativePath);
  }
}
