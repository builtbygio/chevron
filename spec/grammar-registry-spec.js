const dedent = require('dedent');
const path = require('path');
const fs = require('fs-plus');
const temp = require('temp').track();
const TextBuffer = require('text-buffer');
const GrammarRegistry = require('../src/grammar-registry');
const TreeSitterGrammar = require('../src/tree-sitter-grammar');

const NULL_SCOPE = 'text.plain.null-grammar';

function grammarPath(packageName, grammarName) {
  return require.resolve(`${packageName}/grammars/${grammarName}.json`);
}

const JS = grammarPath('language-javascript', 'tree-sitter-javascript');
const CSS = grammarPath('language-css', 'tree-sitter-css');
const C = grammarPath('language-c', 'tree-sitter-c');
const CPP = grammarPath('language-c', 'tree-sitter-cpp');
const HTML = grammarPath('language-html', 'tree-sitter-html');
const PYTHON = grammarPath('language-python', 'tree-sitter-python');
const BASH = grammarPath('language-shellscript', 'tree-sitter-bash');
const FLOW = grammarPath('language-typescript', 'tree-sitter-flow');

// A tree-sitter grammar file of our own, on a real parser.
function writeGrammar(params) {
  const filePath = temp.path({ suffix: '.json' });
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      type: 'tree-sitter',
      parser: path.dirname(require.resolve('tree-sitter-c/package.json')),
      ...params
    })
  );
  return filePath;
}

describe('GrammarRegistry', () => {
  let grammarRegistry;

  beforeEach(() => {
    grammarRegistry = new GrammarRegistry({ config: atom.config });
    expect(subscriptionCount(grammarRegistry)).toBe(0);
  });

  describe('.assignLanguageMode(buffer, languageId)', () => {
    it('assigns to the buffer a language mode with the given language id', () => {
      grammarRegistry.loadGrammarSync(JS);
      grammarRegistry.loadGrammarSync(CSS);

      const buffer = new TextBuffer();
      expect(grammarRegistry.assignLanguageMode(buffer, 'source.js')).toBe(
        true
      );
      expect(buffer.getLanguageMode().getLanguageId()).toBe('source.js');
      expect(grammarRegistry.getAssignedLanguageId(buffer)).toBe('source.js');

      // Returns true if we found the grammar, even if it didn't change
      expect(grammarRegistry.assignLanguageMode(buffer, 'source.js')).toBe(
        true
      );

      expect(grammarRegistry.assignLanguageMode(buffer, 'source.css')).toBe(
        true
      );
      expect(buffer.getLanguageMode().getLanguageId()).toBe('source.css');

      // Returns false if no language is found
      expect(grammarRegistry.assignLanguageMode(buffer, 'blub')).toBe(false);
      expect(buffer.getLanguageMode().getLanguageId()).toBe('source.css');
    });

    describe('when no languageId is passed', () => {
      it('makes the buffer use the null grammar', () => {
        grammarRegistry.loadGrammarSync(CSS);

        const buffer = new TextBuffer();
        expect(grammarRegistry.assignLanguageMode(buffer, 'source.css')).toBe(
          true
        );
        expect(buffer.getLanguageMode().getLanguageId()).toBe('source.css');

        expect(grammarRegistry.assignLanguageMode(buffer, null)).toBe(true);
        expect(buffer.getLanguageMode().getLanguageId()).toBe(NULL_SCOPE);
        expect(grammarRegistry.getAssignedLanguageId(buffer)).toBe(null);
      });
    });
  });

  describe('.assignGrammar(buffer, grammar)', () => {
    it('assigns the grammar directly', () => {
      const grammar = grammarRegistry.loadGrammarSync(JS);

      const buffer = new TextBuffer();
      expect(grammarRegistry.assignGrammar(buffer, grammar)).toBe(true);
      expect(buffer.getLanguageMode().getGrammar()).toBe(grammar);
      expect(grammarRegistry.getAssignedLanguageId(buffer)).toBe('source.js');
    });
  });

  describe('.grammarForId(languageId)', () => {
    it('returns the loaded grammar for the scope, until it is removed', () => {
      grammarRegistry.loadGrammarSync(JS);

      const grammar = grammarRegistry.grammarForId('source.js');
      expect(grammar instanceof TreeSitterGrammar).toBe(true);
      expect(grammar.scopeName).toBe('source.js');

      grammarRegistry.removeGrammar(grammar);
      expect(grammarRegistry.grammarForId('source.js')).toBe(null);
    });
  });

  describe('.autoAssignLanguageMode(buffer)', () => {
    it('assigns to the buffer a language mode based on the best available grammar', () => {
      grammarRegistry.loadGrammarSync(JS);
      grammarRegistry.loadGrammarSync(CSS);

      const buffer = new TextBuffer();
      buffer.setPath('foo.js');
      expect(grammarRegistry.assignLanguageMode(buffer, 'source.css')).toBe(
        true
      );
      expect(buffer.getLanguageMode().getLanguageId()).toBe('source.css');

      grammarRegistry.autoAssignLanguageMode(buffer);
      expect(buffer.getLanguageMode().getLanguageId()).toBe('source.js');
    });
  });

  describe('.maintainLanguageMode(buffer)', () => {
    it('assigns a grammar to the buffer based on its path', () => {
      const buffer = new TextBuffer();
      grammarRegistry.loadGrammarSync(JS);
      grammarRegistry.loadGrammarSync(C);

      buffer.setPath('test.js');
      grammarRegistry.maintainLanguageMode(buffer);
      expect(buffer.getLanguageMode().getLanguageId()).toBe('source.js');

      buffer.setPath('test.c');
      expect(buffer.getLanguageMode().getLanguageId()).toBe('source.c');
    });

    it("updates the buffer's grammar when a better grammar is added for its path, and only then", () => {
      const buffer = new TextBuffer();
      expect(buffer.getLanguageMode().getLanguageId()).toBe(null);

      buffer.setPath('test.js');
      grammarRegistry.maintainLanguageMode(buffer);
      expect(buffer.getLanguageMode().getLanguageId()).toBe(NULL_SCOPE);

      const jsGrammar = grammarRegistry.loadGrammarSync(JS);
      expect(buffer.getLanguageMode().grammar).toBe(jsGrammar);

      // Flow also claims .js, but its content regex does not match.
      grammarRegistry.loadGrammarSync(FLOW);
      expect(buffer.getLanguageMode().grammar).toBe(jsGrammar);
    });

    it('can be overridden by calling .assignLanguageMode', () => {
      const buffer = new TextBuffer();

      buffer.setPath('test.js');
      grammarRegistry.maintainLanguageMode(buffer);

      grammarRegistry.loadGrammarSync(CSS);
      expect(grammarRegistry.assignLanguageMode(buffer, 'source.css')).toBe(
        true
      );
      expect(buffer.getLanguageMode().getLanguageId()).toBe('source.css');

      grammarRegistry.loadGrammarSync(JS);
      expect(buffer.getLanguageMode().getLanguageId()).toBe('source.css');
    });

    it('returns a disposable that can be used to stop the registry from updating the buffer', () => {
      const buffer = new TextBuffer();
      grammarRegistry.loadGrammarSync(JS);

      const previousSubscriptionCount = buffer.emitter.getTotalListenerCount();
      const disposable = grammarRegistry.maintainLanguageMode(buffer);
      expect(buffer.emitter.getTotalListenerCount()).toBeGreaterThan(
        previousSubscriptionCount
      );
      expect(retainedBufferCount(grammarRegistry)).toBe(1);

      buffer.setPath('test.js');
      expect(buffer.getLanguageMode().getLanguageId()).toBe('source.js');

      buffer.setPath('test.txt');
      expect(buffer.getLanguageMode().getLanguageId()).toBe(NULL_SCOPE);

      disposable.dispose();
      expect(buffer.emitter.getTotalListenerCount()).toBe(
        previousSubscriptionCount
      );
      expect(retainedBufferCount(grammarRegistry)).toBe(0);

      buffer.setPath('test.js');
      expect(buffer.getLanguageMode().getLanguageId()).toBe(NULL_SCOPE);
      expect(retainedBufferCount(grammarRegistry)).toBe(0);
    });

    it("doesn't do anything when called a second time with the same buffer", () => {
      const buffer = new TextBuffer();
      grammarRegistry.loadGrammarSync(JS);
      const disposable1 = grammarRegistry.maintainLanguageMode(buffer);
      const disposable2 = grammarRegistry.maintainLanguageMode(buffer);

      buffer.setPath('test.js');
      expect(buffer.getLanguageMode().getLanguageId()).toBe('source.js');

      disposable2.dispose();
      buffer.setPath('test.txt');
      expect(buffer.getLanguageMode().getLanguageId()).toBe(NULL_SCOPE);

      disposable1.dispose();
      buffer.setPath('test.js');
      expect(buffer.getLanguageMode().getLanguageId()).toBe(NULL_SCOPE);
    });

    it('does not retain the buffer after the buffer is destroyed', () => {
      const buffer = new TextBuffer();
      grammarRegistry.loadGrammarSync(JS);

      const disposable = grammarRegistry.maintainLanguageMode(buffer);
      expect(retainedBufferCount(grammarRegistry)).toBe(1);
      expect(subscriptionCount(grammarRegistry)).toBe(2);

      buffer.destroy();
      expect(retainedBufferCount(grammarRegistry)).toBe(0);
      expect(subscriptionCount(grammarRegistry)).toBe(0);
      expect(buffer.emitter.getTotalListenerCount()).toBe(0);

      disposable.dispose();
      expect(retainedBufferCount(grammarRegistry)).toBe(0);
      expect(subscriptionCount(grammarRegistry)).toBe(0);
    });

    it('does not retain the buffer when the grammar registry is destroyed', () => {
      const buffer = new TextBuffer();
      grammarRegistry.loadGrammarSync(JS);

      grammarRegistry.maintainLanguageMode(buffer);
      expect(retainedBufferCount(grammarRegistry)).toBe(1);
      expect(subscriptionCount(grammarRegistry)).toBe(2);

      grammarRegistry.clear();

      expect(retainedBufferCount(grammarRegistry)).toBe(0);
      expect(subscriptionCount(grammarRegistry)).toBe(0);
      expect(buffer.emitter.getTotalListenerCount()).toBe(0);
    });
  });

  describe('.selectGrammar(filePath)', () => {
    it('always returns a grammar', () => {
      const registry = new GrammarRegistry({ config: atom.config });
      expect(registry.selectGrammar().scopeName).toBe(NULL_SCOPE);
    });

    it('selects a grammar based on the file path case insensitively', async () => {
      await atom.packages.activatePackage('language-python');
      expect(atom.grammars.selectGrammar('/tmp/source.py').scopeName).toBe(
        'source.python'
      );
      expect(atom.grammars.selectGrammar('/tmp/source.PY').scopeName).toBe(
        'source.python'
      );
    });

    describe('on Windows', () => {
      let originalPlatform;

      beforeEach(() => {
        originalPlatform = process.platform;
        Object.defineProperty(process, 'platform', { value: 'win32' });
      });

      afterEach(() => {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      });

      it('normalizes back slashes to forward slashes when matching the fileTypes', async () => {
        await atom.packages.activatePackage('language-ruby');
        atom.config.set('core.customFileTypes', {
          'source.ruby': ['config/rules']
        });
        expect(
          atom.grammars.selectGrammar('project\\config\\rules').scopeName
        ).toBe('source.ruby');
      });
    });

    it("can use the filePath to load the correct grammar based on the grammar's filetype", async () => {
      await atom.packages.activatePackage('language-html');
      await atom.packages.activatePackage('language-javascript');
      await atom.packages.activatePackage('language-ruby');

      expect(atom.grammars.selectGrammar('file.js').name).toBe('JavaScript'); // based on extension (.js)
      expect(atom.grammars.selectGrammar('view.html.erb').name).toBe('ERB'); // based on the longest suffix (.html.erb)
      expect(atom.grammars.selectGrammar('Rakefile').name).toBe('Ruby'); // based on the file's basename (Rakefile)
      expect(atom.grammars.selectGrammar('curb').name).toBe('Null Grammar');
      expect(atom.grammars.selectGrammar('test.txt').name).toBe('Null Grammar');
    });

    it("uses the filePath's shebang line if the grammar cannot be determined by the extension or basename", async () => {
      await atom.packages.activatePackage('language-javascript');
      await atom.packages.activatePackage('language-ruby');

      const filePath = require.resolve('./fixtures/shebang');
      expect(atom.grammars.selectGrammar(filePath).name).toBe('Ruby');
      expect(
        atom.grammars.selectGrammar('script', '#!/usr/bin/env jruby\nputs 1')
          .name
      ).toBe('Ruby');
    });

    it('uses the number of newlines in the first line regex to determine the number of lines to test against', async () => {
      await atom.packages.activatePackage('language-property-list');
      await atom.packages.activatePackage('language-python');

      let fileContent = 'first-line\n<html>';
      expect(atom.grammars.selectGrammar('dummy.py', fileContent).name).toBe(
        'Python'
      );

      fileContent = '<?xml version="1.0" encoding="UTF-8"?>';
      expect(
        atom.grammars.selectGrammar('grammar.tmLanguage', fileContent).name
      ).toBe('Null Grammar');

      fileContent +=
        '\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">';
      expect(
        atom.grammars.selectGrammar('grammar.tmLanguage', fileContent).name
      ).toBe('Property List (XML)');
    });

    it("doesn't read the file when the file contents are specified", async () => {
      await atom.packages.activatePackage('language-ruby');

      const filePath = require.resolve('./fixtures/shebang');
      const filePathContents = fs.readFileSync(filePath, 'utf8');
      spyOn(fs, 'read').andCallThrough();
      expect(atom.grammars.selectGrammar(filePath, filePathContents).name).toBe(
        'Ruby'
      );
      expect(fs.read).not.toHaveBeenCalled();
    });

    describe('when multiple grammars have matching fileTypes', () => {
      it('selects the grammar with the longest fileType match', () => {
        const grammar1 = grammarRegistry.loadGrammarSync(
          writeGrammar({ name: 'test1', scopeName: 'source1', fileTypes: ['test'] })
        );
        expect(grammarRegistry.selectGrammar('more.test', '')).toBe(grammar1);

        const grammar2 = grammarRegistry.loadGrammarSync(
          writeGrammar({
            name: 'test2',
            scopeName: 'source2',
            fileTypes: ['test', 'more.test']
          })
        );
        expect(grammarRegistry.selectGrammar('more.test', '')).toBe(grammar2);
      });
    });

    it('favors non-bundled packages when breaking scoring ties', async () => {
      await atom.packages.activatePackage('language-ruby');
      await atom.packages.activatePackage(
        path.join(__dirname, 'fixtures', 'packages', 'package-with-rb-filetype')
      );

      atom.grammars.grammarForScopeName('source.ruby').bundledPackage = true;
      atom.grammars.grammarForScopeName('test.rb').bundledPackage = false;

      expect(
        atom.grammars.selectGrammar('test.rb', '#!/usr/bin/env ruby\n').scopeName
      ).toBe('source.ruby');
      expect(
        atom.grammars.selectGrammar('test.rb', '#!/usr/bin/env testruby')
          .scopeName
      ).toBe('test.rb');
      expect(atom.grammars.selectGrammar('test.rb').scopeName).toBe('test.rb');
    });

    describe('when there is no file path', () => {
      it('does not throw an exception (regression)', () => {
        expect(() =>
          atom.grammars.selectGrammar(null, '#!/usr/bin/ruby')
        ).not.toThrow();
        expect(() => atom.grammars.selectGrammar(null, '')).not.toThrow();
        expect(() => atom.grammars.selectGrammar(null, null)).not.toThrow();
      });
    });

    describe('when the user has custom grammar file types', () => {
      it('considers the custom file types as well as those defined in the grammar', async () => {
        await atom.packages.activatePackage('language-ruby');
        atom.config.set('core.customFileTypes', {
          'source.ruby': ['Cheffile']
        });
        expect(
          atom.grammars.selectGrammar('build/Cheffile', 'cookbook "postgres"')
            .scopeName
        ).toBe('source.ruby');
      });

      it('favors user-defined file types over built-in ones of equal length', async () => {
        await atom.packages.activatePackage('language-ruby');
        await atom.packages.activatePackage('language-python');

        atom.config.set('core.customFileTypes', {
          'source.python': ['Rakefile'],
          'source.ruby': ['SConstruct']
        });
        expect(atom.grammars.selectGrammar('Rakefile', '').scopeName).toBe(
          'source.python'
        );
        expect(atom.grammars.selectGrammar('SConstruct', '').scopeName).toBe(
          'source.ruby'
        );
      });

      it('favors user-defined file types over grammars with matching first-line-regexps', async () => {
        await atom.packages.activatePackage('language-ruby');
        await atom.packages.activatePackage('language-javascript');

        atom.config.set('core.customFileTypes', {
          'source.ruby': ['bootstrap']
        });
        expect(
          atom.grammars.selectGrammar('bootstrap', '#!/usr/bin/env node')
            .scopeName
        ).toBe('source.ruby');
      });
    });

    it('favors a grammar with a matching file type over one with a matching first line pattern', async () => {
      await atom.packages.activatePackage('language-ruby');
      await atom.packages.activatePackage('language-javascript');
      expect(
        atom.grammars.selectGrammar('foo.rb', '#!/usr/bin/env node').scopeName
      ).toBe('source.ruby');
    });

    it('only selects a grammar that actually matches in some way (regression)', () => {
      grammarRegistry.loadGrammarSync(JS);
      expect(grammarRegistry.selectGrammar('test', '').name).toBe(
        'Null Grammar'
      );
    });

    describe('grammars with content regexes', () => {
      it('recognizes C++ header files', () => {
        grammarRegistry.loadGrammarSync(C);
        grammarRegistry.loadGrammarSync(CPP);
        grammarRegistry.loadGrammarSync(PYTHON);

        let grammar = grammarRegistry.selectGrammar(
          'test.h',
          dedent`
          #include <string.h>

          typedef struct {
            void verb();
          } Noun;
        `
        );
        expect(grammar.name).toBe('C');

        grammar = grammarRegistry.selectGrammar(
          'test.h',
          dedent`
          #include <string>

          class Noun {
           public:
            void verb();
          };
        `
        );
        expect(grammar.name).toBe('C++');

        // The word `class` only indicates C++ in `.h` files, not in all files.
        grammar = grammarRegistry.selectGrammar(
          'test.py',
          dedent`
          class Noun:
            def verb(self):
              return True
        `
        );
        expect(grammar.name).toBe('Python');
      });

      it('recognizes C++ files that do not match the content regex (regression)', () => {
        grammarRegistry.loadGrammarSync(C);
        grammarRegistry.loadGrammarSync(CPP);

        const grammar = grammarRegistry.selectGrammar('test.cc', 'int a();');
        expect(grammar.name).toBe('C++');
      });

      it('does not apply content regexes from grammars without filetype or first line matches', () => {
        grammarRegistry.loadGrammarSync(CPP);

        const grammar = grammarRegistry.selectGrammar(
          '',
          dedent`
          class Foo
            # this is ruby, not C++
          end
        `
        );
        expect(grammar.name).toBe('Null Grammar');
      });

      it('recognizes shell scripts by shebang and by modeline', () => {
        grammarRegistry.loadGrammarSync(BASH);

        let grammar = grammarRegistry.selectGrammar(
          'test.h',
          dedent`
          #!/bin/bash

          echo "hi"
        `
        );
        expect(grammar.name).toBe('Shell Script');

        grammar = grammarRegistry.selectGrammar(
          'test.h',
          dedent`
          # vim: set ft=bash

          echo "hi"
        `
        );
        expect(grammar.name).toBe('Shell Script');
      });

      it('recognizes JavaScript files that use Flow', () => {
        grammarRegistry.loadGrammarSync(JS);
        grammarRegistry.loadGrammarSync(FLOW);

        let grammar = grammarRegistry.selectGrammar(
          'test.js',
          dedent`
          // Copyright something
          // @flow

          module.exports = function () { return 1 + 1 }
        `
        );
        expect(grammar.name).toBe('Flow JavaScript');

        grammar = grammarRegistry.selectGrammar(
          'test.js',
          'module.exports = function () { return 1 + 1 }'
        );
        expect(grammar.name).toBe('JavaScript');
      });

      it('favors grammars that match the content regex', () => {
        grammarRegistry.loadGrammarSync(
          writeGrammar({ name: 'foo', scopeName: 'source.foo', fileTypes: ['foo'] })
        );
        const grammar2 = grammarRegistry.loadGrammarSync(
          writeGrammar({
            name: 'foo++',
            scopeName: 'source.foopp',
            contentRegex: '.*bar',
            fileTypes: ['foo']
          })
        );

        const grammar = grammarRegistry.selectGrammar(
          'test.foo',
          `${'\n'.repeat(50)}bar${'\n'.repeat(50)}`
        );
        expect(grammar).toBe(grammar2);
      });
    });
  });

  describe('.removeGrammar(grammar)', () => {
    it("removes the grammar, so it won't be returned by selectGrammar", async () => {
      await atom.packages.activatePackage('language-css');
      const grammar = atom.grammars.selectGrammar('foo.css');
      atom.grammars.removeGrammar(grammar);
      expect(atom.grammars.selectGrammar('foo.css').name).not.toBe(
        grammar.name
      );
    });
  });

  describe('.addInjectionPoint(languageId, {type, language, content})', () => {
    const injectionPoint = {
      type: 'some_node_type',
      language() {
        return 'some_language_name';
      },
      content(node) {
        return node;
      }
    };

    const pointsOf = grammar =>
      grammar.injectionPointsByType[injectionPoint.type] || [];

    it('adds an injection point to the grammar with the given id', () => {
      const grammar = grammarRegistry.loadGrammarSync(JS);
      const disposable = grammarRegistry.addInjectionPoint(
        'source.js',
        injectionPoint
      );
      expect(pointsOf(grammar)).toContain(injectionPoint);

      disposable.dispose();
      expect(pointsOf(grammar)).not.toContain(injectionPoint);
    });

    describe('when called before a grammar with the given id is loaded', () => {
      it('adds the injection point once the grammar is loaded', () => {
        grammarRegistry.addInjectionPoint('source.js', injectionPoint);
        expect(grammarRegistry.grammarForId('source.js')).toBe(null);
        expect(grammarRegistry.assignLanguageMode(new TextBuffer(), 'source.js')).toBe(false);

        const grammar = grammarRegistry.loadGrammarSync(JS);
        expect(grammarRegistry.grammarForId('source.js')).toBe(grammar);
        expect(pointsOf(grammar)).toContain(injectionPoint);
      });

      it('can be disposed before the grammar is loaded', () => {
        const disposable = grammarRegistry.addInjectionPoint(
          'source.js',
          injectionPoint
        );
        expect(() => disposable.dispose()).not.toThrow();

        const grammar = grammarRegistry.loadGrammarSync(JS);
        expect(pointsOf(grammar)).not.toContain(injectionPoint);
      });
    });
  });

  describe('serialization', () => {
    it("persists editors' grammar overrides", async () => {
      const buffer1 = new TextBuffer();
      const buffer2 = new TextBuffer();

      grammarRegistry.loadGrammarSync(C);
      grammarRegistry.loadGrammarSync(HTML);
      grammarRegistry.loadGrammarSync(JS);

      grammarRegistry.maintainLanguageMode(buffer1);
      grammarRegistry.maintainLanguageMode(buffer2);
      grammarRegistry.assignLanguageMode(buffer1, 'source.c');
      grammarRegistry.assignLanguageMode(buffer2, 'source.js');

      const buffer1Copy = await TextBuffer.deserialize(buffer1.serialize());
      const buffer2Copy = await TextBuffer.deserialize(buffer2.serialize());

      const grammarRegistryCopy = new GrammarRegistry({ config: atom.config });
      grammarRegistryCopy.deserialize(
        JSON.parse(JSON.stringify(grammarRegistry.serialize()))
      );

      grammarRegistryCopy.loadGrammarSync(C);
      grammarRegistryCopy.loadGrammarSync(HTML);

      expect(buffer1Copy.getLanguageMode().getLanguageId()).toBe(null);
      expect(buffer2Copy.getLanguageMode().getLanguageId()).toBe(null);

      grammarRegistryCopy.maintainLanguageMode(buffer1Copy);
      grammarRegistryCopy.maintainLanguageMode(buffer2Copy);
      expect(buffer1Copy.getLanguageMode().getLanguageId()).toBe('source.c');
      expect(buffer2Copy.getLanguageMode().getLanguageId()).toBe(null);

      grammarRegistryCopy.loadGrammarSync(JS);
      expect(buffer1Copy.getLanguageMode().getLanguageId()).toBe('source.c');
      expect(buffer2Copy.getLanguageMode().getLanguageId()).toBe('source.js');
    });
  });

  describe('.getGrammars() and .forEachGrammar()', () => {
    it('lists the null grammar first, then every loaded grammar', () => {
      const js = grammarRegistry.loadGrammarSync(JS);
      const css = grammarRegistry.loadGrammarSync(CSS);
      expect(grammarRegistry.getGrammars()).toEqual([
        grammarRegistry.nullGrammar,
        js,
        css
      ]);

      const visited = [];
      grammarRegistry.forEachGrammar(grammar => visited.push(grammar));
      expect(visited).toEqual(grammarRegistry.getGrammars());
    });
  });
});

function retainedBufferCount(grammarRegistry) {
  return grammarRegistry.grammarScoresByBuffer.size;
}

function subscriptionCount(grammarRegistry) {
  return grammarRegistry.subscriptions.disposables.size;
}
