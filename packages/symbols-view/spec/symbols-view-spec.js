/* eslint-env jasmine */

const path = require('path');
const etch = require('etch');
const fs = require('fs-plus');
const temp = require('temp');
const SymbolsView = require('../lib/symbols-view');
const TagGenerator = require('../lib/tag-generator');

const {it, fit, ffit, fffit, beforeEach, afterEach, conditionPromise} = require('./async-spec-helpers');

describe('SymbolsView', () => {
  let [symbolsView, activationPromise, editor, directory] = [];

  const getWorkspaceView = () => chevron.views.getView(chevron.workspace);
  const getEditorView = () => chevron.views.getView(chevron.workspace.getActiveTextEditor());

  beforeEach(async () => {
    jasmine.unspy(global, 'setTimeout');

    chevron.project.setPaths([
      temp.mkdirSync('other-dir-'),
      temp.mkdirSync('atom-symbols-view-'),
    ]);

    directory = chevron.project.getDirectories()[1];
    fs.copySync(path.join(__dirname, 'fixtures', 'js'), chevron.project.getPaths()[1]);

    activationPromise = chevron.packages.activatePackage('symbols-view');
    jasmine.attachToDOM(getWorkspaceView());
  });

  describe('when tags can be generated for a file', () => {
    beforeEach(async () => {
      await chevron.workspace.open(directory.resolve('sample.js'));
    });

    it('initially displays all JavaScript functions with line numbers', async () => {
      chevron.commands.dispatch(getEditorView(), 'symbols-view:toggle-file-symbols');
      await activationPromise;
      symbolsView = chevron.workspace.getModalPanels()[0].item;
      await conditionPromise(() => symbolsView.element.querySelectorAll('li').length > 0);
      expect(symbolsView.selectListView.refs.loadingMessage).toBeUndefined();
      expect(document.body.contains(symbolsView.element)).toBe(true);
      expect(symbolsView.element.querySelectorAll('li').length).toBe(2);
      expect(symbolsView.element.querySelector('li:first-child .primary-line')).toHaveText('quicksort');
      expect(symbolsView.element.querySelector('li:first-child .secondary-line')).toHaveText('Line 1');
      expect(symbolsView.element.querySelector('li:last-child .primary-line')).toHaveText('quicksort.sort');
      expect(symbolsView.element.querySelector('li:last-child .secondary-line')).toHaveText('Line 2');
      expect(symbolsView.selectListView.refs.errorMessage).toBeUndefined();
    });

    it('caches tags until the editor changes', async () => {
      editor = chevron.workspace.getActiveTextEditor();
      chevron.commands.dispatch(getEditorView(), 'symbols-view:toggle-file-symbols');
      await activationPromise;
      symbolsView = chevron.workspace.getModalPanels()[0].item;
      await conditionPromise(() => symbolsView.element.querySelectorAll('li').length > 0);
      await symbolsView.cancel();

      spyOn(symbolsView, 'generateTags').andCallThrough();
      chevron.commands.dispatch(getEditorView(), 'symbols-view:toggle-file-symbols');
      await conditionPromise(() => symbolsView.element.querySelectorAll('li').length > 0);
      expect(symbolsView.selectListView.refs.loadingMessage).toBeUndefined();
      expect(symbolsView.element.querySelectorAll('li').length).toBe(2);
      expect(symbolsView.generateTags).not.toHaveBeenCalled();
      await symbolsView.cancel();

      await editor.save();
      chevron.commands.dispatch(getEditorView(), 'symbols-view:toggle-file-symbols');
      await conditionPromise(() => symbolsView.element.querySelectorAll('li').length > 0);
      expect(symbolsView.selectListView.refs.loadingMessage).toBeUndefined();
      expect(symbolsView.element.querySelectorAll('li').length).toBe(2);
      expect(symbolsView.generateTags).toHaveBeenCalled();
      editor.destroy();
      expect(symbolsView.cachedTags).toEqual({});
    });

    it('displays an error when no tags match text in mini-editor', async () => {
      chevron.commands.dispatch(getEditorView(), 'symbols-view:toggle-file-symbols');
      await activationPromise;
      symbolsView = chevron.workspace.getModalPanels()[0].item;
      await conditionPromise(() => symbolsView.element.querySelectorAll('li').length > 0);

      symbolsView.selectListView.refs.queryEditor.setText('nothing will match this');
      await conditionPromise(() => symbolsView.selectListView.refs.emptyMessage);
      expect(document.body.contains(symbolsView.element)).toBe(true);
      expect(symbolsView.element.querySelectorAll('li').length).toBe(0);
      expect(symbolsView.selectListView.refs.emptyMessage.textContent.length).toBeGreaterThan(0);

      // Should remove error
      symbolsView.selectListView.refs.queryEditor.setText('');
      await conditionPromise(() => symbolsView.element.querySelectorAll('li').length > 0);
      expect(symbolsView.element.querySelectorAll('li').length).toBe(2);
      expect(symbolsView.selectListView.refs.emptyMessage).toBeUndefined();
    });

    it('moves the cursor to the selected function', async () => {
      expect(chevron.workspace.getActiveTextEditor().getCursorBufferPosition()).toEqual([0, 0]);
      chevron.commands.dispatch(getEditorView(), 'symbols-view:toggle-file-symbols');
      await activationPromise;
      symbolsView = chevron.workspace.getModalPanels()[0].item;
      await conditionPromise(() => symbolsView.element.querySelectorAll('li').length > 0);

      symbolsView.element.querySelectorAll('li')[1].click();
      expect(chevron.workspace.getActiveTextEditor().getCursorBufferPosition()).toEqual([1, 2]);
    });
  });

  describe("when tags can't be generated for a file", () => {
    beforeEach(async () => {
      await chevron.workspace.open('sample.txt');
    });

    it('shows an error message when no matching tags are found', async () => {
      chevron.commands.dispatch(getEditorView(), 'symbols-view:toggle-file-symbols');
      await activationPromise;
      symbolsView = chevron.workspace.getModalPanels()[0].item;

      await conditionPromise(() => symbolsView.selectListView.refs.emptyMessage);
      expect(document.body.contains(symbolsView.element));
      expect(symbolsView.element.querySelectorAll('li').length).toBe(0);
      expect(symbolsView.selectListView.refs.emptyMessage).toBeVisible();
      expect(symbolsView.selectListView.refs.emptyMessage.textContent.length).toBeGreaterThan(0);
      expect(symbolsView.selectListView.refs.loadingMessage).not.toBeVisible();
    });
  });

  describe('TagGenerator', () => {
    it('generates tags for all JavaScript functions', async () => {
      let tags = [];
      const sampleJsPath = directory.resolve('sample.js');
      await new TagGenerator(sampleJsPath).generate().then(o => tags = o);
      expect(tags.length).toBe(2);
      expect(tags[0].name).toBe('quicksort');
      expect(tags[0].position.row).toBe(0);
      expect(tags[1].name).toBe('quicksort.sort');
      expect(tags[1].position.row).toBe(1);
    });

    it('generates no tags for text file', async () => {
      let tags = [];
      const sampleJsPath = directory.resolve('sample.txt');
      await new TagGenerator(sampleJsPath).generate().then(o => tags = o);
      expect(tags.length).toBe(0);
    });
  });

  describe('go to declaration', () => {
    it("doesn't move the cursor when no declaration is found", async () => {
      await chevron.workspace.open(directory.resolve('tagged.js'));
      editor = chevron.workspace.getActiveTextEditor();
      editor.setCursorBufferPosition([0, 2]);
      chevron.commands.dispatch(getEditorView(), 'symbols-view:go-to-declaration');

      await activationPromise;

      expect(editor.getCursorBufferPosition()).toEqual([0, 2]);
    });

    it('moves the cursor to the declaration when there is a single matching declaration', async () => {
      await chevron.workspace.open(directory.resolve('tagged.js'));
      editor = chevron.workspace.getActiveTextEditor();
      editor.setCursorBufferPosition([6, 24]);
      spyOn(SymbolsView.prototype, 'moveToPosition').andCallThrough();
      chevron.commands.dispatch(getEditorView(), 'symbols-view:go-to-declaration');

      await conditionPromise(() => SymbolsView.prototype.moveToPosition.callCount === 1);
      expect(editor.getCursorBufferPosition()).toEqual([2, 0]);
    });

    it('correctly moves the cursor to the declaration of a C preprocessor macro', async () => {
      chevron.project.setPaths([temp.mkdirSync('atom-symbols-view-c-')]);
      fs.copySync(path.join(__dirname, 'fixtures', 'c'), chevron.project.getPaths()[0]);

      await chevron.packages.activatePackage('language-c');
      await chevron.workspace.open('sample.c');

      editor = chevron.workspace.getActiveTextEditor();
      editor.setCursorBufferPosition([4, 4]);
      spyOn(SymbolsView.prototype, 'moveToPosition').andCallThrough();
      chevron.commands.dispatch(getEditorView(), 'symbols-view:go-to-declaration');

      await conditionPromise(() => SymbolsView.prototype.moveToPosition.callCount === 1);
      expect(editor.getCursorBufferPosition()).toEqual([0, 0]);
    });

    it('displays matches when more than one exists and opens the selected match', async () => {
      await chevron.workspace.open(directory.resolve('tagged.js'));
      editor = chevron.workspace.getActiveTextEditor();
      editor.setCursorBufferPosition([8, 14]);
      chevron.commands.dispatch(getEditorView(), 'symbols-view:go-to-declaration');
      symbolsView = chevron.workspace.getModalPanels()[0].item;

      await conditionPromise(() => symbolsView.element.querySelectorAll('li').length > 0);
      expect(symbolsView.element.querySelectorAll('li').length).toBe(2);
      expect(symbolsView.element).toBeVisible();
      spyOn(SymbolsView.prototype, 'moveToPosition').andCallThrough();
      symbolsView.selectListView.confirmSelection();

      await conditionPromise(() => SymbolsView.prototype.moveToPosition.callCount === 1);
      expect(chevron.workspace.getActiveTextEditor().getPath()).toBe(directory.resolve('tagged-duplicate.js'));
      expect(chevron.workspace.getActiveTextEditor().getCursorBufferPosition()).toEqual([0, 4]);
    });

    it('includes ? and ! characters in ruby symbols', async () => {
      chevron.project.setPaths([temp.mkdirSync('atom-symbols-view-ruby-')]);
      fs.copySync(path.join(__dirname, 'fixtures', 'ruby'), chevron.project.getPaths()[0]);

      await chevron.packages.activatePackage('language-ruby');
      await chevron.workspace.open('file1.rb');

      spyOn(SymbolsView.prototype, 'moveToPosition').andCallThrough();
      chevron.workspace.getActiveTextEditor().setCursorBufferPosition([18, 4]);
      chevron.commands.dispatch(getEditorView(), 'symbols-view:go-to-declaration');

      await activationPromise;
      await conditionPromise(() => SymbolsView.prototype.moveToPosition.callCount === 1);
      expect(chevron.workspace.getActiveTextEditor().getCursorBufferPosition()).toEqual([7, 2]);
      SymbolsView.prototype.moveToPosition.reset();
      chevron.workspace.getActiveTextEditor().setCursorBufferPosition([19, 2]);
      chevron.commands.dispatch(getEditorView(), 'symbols-view:go-to-declaration');

      await conditionPromise(() => SymbolsView.prototype.moveToPosition.callCount === 1);
      expect(chevron.workspace.getActiveTextEditor().getCursorBufferPosition()).toEqual([11, 2]);
      SymbolsView.prototype.moveToPosition.reset();
      chevron.workspace.getActiveTextEditor().setCursorBufferPosition([20, 5]);
      chevron.commands.dispatch(getEditorView(), 'symbols-view:go-to-declaration');

      await conditionPromise(() => SymbolsView.prototype.moveToPosition.callCount === 1);
      expect(chevron.workspace.getActiveTextEditor().getCursorBufferPosition()).toEqual([3, 2]);
      SymbolsView.prototype.moveToPosition.reset();
      chevron.workspace.getActiveTextEditor().setCursorBufferPosition([21, 7]);
      chevron.commands.dispatch(getEditorView(), 'symbols-view:go-to-declaration');

      await conditionPromise(() => SymbolsView.prototype.moveToPosition.callCount === 1);
      expect(chevron.workspace.getActiveTextEditor().getCursorBufferPosition()).toEqual([3, 2]);
    });

    it('handles jumping to assignment ruby method definitions', async () => {
      chevron.project.setPaths([temp.mkdirSync('atom-symbols-view-ruby-')]);
      fs.copySync(path.join(__dirname, 'fixtures', 'ruby'), chevron.project.getPaths()[0]);

      await chevron.packages.activatePackage('language-ruby');
      await chevron.workspace.open('file1.rb');
      spyOn(SymbolsView.prototype, 'moveToPosition').andCallThrough();
      chevron.workspace.getActiveTextEditor().setCursorBufferPosition([22, 5]);
      chevron.commands.dispatch(getEditorView(), 'symbols-view:go-to-declaration');

      await conditionPromise(() => SymbolsView.prototype.moveToPosition.callCount === 1);
      expect(chevron.workspace.getActiveTextEditor().getCursorBufferPosition()).toEqual([14, 2]);
      SymbolsView.prototype.moveToPosition.reset();
      chevron.workspace.getActiveTextEditor().setCursorBufferPosition([23, 5]);
      chevron.commands.dispatch(getEditorView(), 'symbols-view:go-to-declaration');

      await conditionPromise(() => SymbolsView.prototype.moveToPosition.callCount === 1);
      expect(chevron.workspace.getActiveTextEditor().getCursorBufferPosition()).toEqual([14, 2]);
      SymbolsView.prototype.moveToPosition.reset();
      chevron.workspace.getActiveTextEditor().setCursorBufferPosition([24, 5]);
      chevron.commands.dispatch(getEditorView(), 'symbols-view:go-to-declaration');

      await conditionPromise(() => SymbolsView.prototype.moveToPosition.callCount === 1);
      expect(chevron.workspace.getActiveTextEditor().getCursorBufferPosition()).toEqual([0, 0]);
      SymbolsView.prototype.moveToPosition.reset();
      chevron.workspace.getActiveTextEditor().setCursorBufferPosition([25, 5]);
      chevron.commands.dispatch(getEditorView(), 'symbols-view:go-to-declaration');

      await conditionPromise(() => SymbolsView.prototype.moveToPosition.callCount === 1);
      expect(chevron.workspace.getActiveTextEditor().getCursorBufferPosition()).toEqual([11, 2]);
    });

    it('handles jumping to fully qualified ruby constant definitions', async () => {
      chevron.project.setPaths([temp.mkdirSync('atom-symbols-view-ruby-')]);
      fs.copySync(path.join(__dirname, 'fixtures', 'ruby'), chevron.project.getPaths()[0]);
      await chevron.packages.activatePackage('language-ruby');
      await chevron.workspace.open('file1.rb');
      spyOn(SymbolsView.prototype, 'moveToPosition').andCallThrough();
      chevron.workspace.getActiveTextEditor().setCursorBufferPosition([26, 10]);
      chevron.commands.dispatch(getEditorView(), 'symbols-view:go-to-declaration');

      await conditionPromise(() => SymbolsView.prototype.moveToPosition.callCount === 1);
      expect(chevron.workspace.getActiveTextEditor().getCursorBufferPosition()).toEqual([1, 2]);
      SymbolsView.prototype.moveToPosition.reset();
      chevron.workspace.getActiveTextEditor().setCursorBufferPosition([27, 5]);
      chevron.commands.dispatch(getEditorView(), 'symbols-view:go-to-declaration');

      await conditionPromise(() => SymbolsView.prototype.moveToPosition.callCount === 1);
      expect(chevron.workspace.getActiveTextEditor().getCursorBufferPosition()).toEqual([0, 0]);
      SymbolsView.prototype.moveToPosition.reset();
      chevron.workspace.getActiveTextEditor().setCursorBufferPosition([28, 5]);
      chevron.commands.dispatch(getEditorView(), 'symbols-view:go-to-declaration');

      await conditionPromise(() => SymbolsView.prototype.moveToPosition.callCount === 1);
      expect(chevron.workspace.getActiveTextEditor().getCursorBufferPosition()).toEqual([31, 0]);
    });

    describe('return from declaration', () => {
      it("doesn't do anything when no go-to have been triggered", async () => {
        await chevron.workspace.open(directory.resolve('tagged.js'));
        editor = chevron.workspace.getActiveTextEditor();
        editor.setCursorBufferPosition([6, 0]);
        chevron.commands.dispatch(getEditorView(), 'symbols-view:return-from-declaration');

        await activationPromise;
        expect(editor.getCursorBufferPosition()).toEqual([6, 0]);
      });

      it('returns to previous row and column', async () => {
        await chevron.workspace.open(directory.resolve('tagged.js'));
        editor = chevron.workspace.getActiveTextEditor();
        editor.setCursorBufferPosition([6, 24]);
        spyOn(SymbolsView.prototype, 'moveToPosition').andCallThrough();
        chevron.commands.dispatch(getEditorView(), 'symbols-view:go-to-declaration');

        await activationPromise;
        await conditionPromise(() => SymbolsView.prototype.moveToPosition.callCount === 1);
        expect(editor.getCursorBufferPosition()).toEqual([2, 0]);
        chevron.commands.dispatch(getEditorView(), 'symbols-view:return-from-declaration');

        await conditionPromise(() => SymbolsView.prototype.moveToPosition.callCount === 2);
        expect(editor.getCursorBufferPosition()).toEqual([6, 24]);
      });
    });

    describe("when the tag is in a file that doesn't exist", () => {
      it("doesn't display the tag", async () => {
        fs.removeSync(directory.resolve('tagged-duplicate.js'));
        await chevron.workspace.open(directory.resolve('tagged.js'));

        editor = chevron.workspace.getActiveTextEditor();
        editor.setCursorBufferPosition([8, 14]);
        spyOn(SymbolsView.prototype, 'moveToPosition').andCallThrough();
        chevron.commands.dispatch(getEditorView(), 'symbols-view:go-to-declaration');

        await conditionPromise(() => SymbolsView.prototype.moveToPosition.callCount === 1);
        expect(editor.getCursorBufferPosition()).toEqual([8, 0]);
      });
    });
  });

  describe('project symbols', () => {
    it('displays all tags', async () => {
      await chevron.workspace.open(directory.resolve('tagged.js'));
      expect(getWorkspaceView().querySelector('.symbols-view')).toBeNull();
      chevron.commands.dispatch(getWorkspaceView(), 'symbols-view:toggle-project-symbols');

      await activationPromise;
      symbolsView = chevron.workspace.getModalPanels()[0].item;

      await conditionPromise(() => symbolsView.element.querySelectorAll('li').length > 0);
      const directoryBasename = path.basename(directory.getPath());
      const taggedFile = path.join(directoryBasename, 'tagged.js');
      expect(symbolsView.selectListView.refs.loadingMessage).toBeUndefined();
      expect(document.body.contains(symbolsView.element)).toBe(true);
      expect(symbolsView.element.querySelectorAll('li').length).toBe(4);
      expect(symbolsView.element.querySelector('li:first-child .primary-line')).toHaveText('callMeMaybe');
      expect(symbolsView.element.querySelector('li:first-child .secondary-line')).toHaveText(taggedFile);
      expect(symbolsView.element.querySelector('li:last-child .primary-line')).toHaveText('thisIsCrazy');
      expect(symbolsView.element.querySelector('li:last-child .secondary-line')).toHaveText(taggedFile);
      chevron.commands.dispatch(getWorkspaceView(), 'symbols-view:toggle-project-symbols');
      fs.removeSync(directory.resolve('tags'));

      await conditionPromise(() => symbolsView.reloadTags);
      chevron.commands.dispatch(getWorkspaceView(), 'symbols-view:toggle-project-symbols');

      await conditionPromise(() => symbolsView.selectListView.refs.loadingMessage);
      await conditionPromise(() => symbolsView.element.querySelectorAll('li').length === 0);
    });

    describe('when there is only one project', () => {
      beforeEach(async () => chevron.project.setPaths([directory.getPath()]));

      it("does not include the root directory's name when displaying the tag's filename", async () => {
        await chevron.workspace.open(directory.resolve('tagged.js'));
        expect(getWorkspaceView().querySelector('.symbols-view')).toBeNull();
        chevron.commands.dispatch(getWorkspaceView(), 'symbols-view:toggle-project-symbols');

        await activationPromise;
        symbolsView = chevron.workspace.getModalPanels()[0].item;
        await conditionPromise(() => symbolsView.element.querySelectorAll('li').length > 0);
        expect(symbolsView.element.querySelector('li:first-child .primary-line')).toHaveText('callMeMaybe');
        expect(symbolsView.element.querySelector('li:first-child .secondary-line')).toHaveText('tagged.js');
      });
    });

    describe('when selecting a tag', () => {
      describe("when the file doesn't exist", () => {
        beforeEach(async () => fs.removeSync(directory.resolve('tagged.js')));

        it("doesn't open the editor", async () => {
          chevron.commands.dispatch(getWorkspaceView(), 'symbols-view:toggle-project-symbols');

          await activationPromise;

          symbolsView = chevron.workspace.getModalPanels()[0].item;

          await conditionPromise(() => symbolsView.element.querySelectorAll('li').length > 0);
          spyOn(chevron.workspace, 'open').andCallThrough();
          symbolsView.element.querySelector('li:first-child').click();
          await conditionPromise(() => symbolsView.selectListView.refs.errorMessage);
          expect(chevron.workspace.open).not.toHaveBeenCalled();
          expect(symbolsView.selectListView.refs.errorMessage.textContent.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('when useEditorGrammarAsCtagsLanguage is set to true', () => {
    it("uses the language associated with the editor's grammar", async () => {
      chevron.config.set('symbols-view.useEditorGrammarAsCtagsLanguage', true);

      await chevron.packages.activatePackage('language-javascript');
      await chevron.workspace.open('sample.javascript');
      chevron.workspace.getActiveTextEditor().setText('var test = function() {}');
      await chevron.workspace.getActiveTextEditor().save();
      chevron.commands.dispatch(getEditorView(), 'symbols-view:toggle-file-symbols');
      await activationPromise;

      symbolsView = chevron.workspace.getModalPanels()[0].item;
      await conditionPromise(() => symbolsView.selectListView.refs.emptyMessage);
      chevron.commands.dispatch(getEditorView(), 'symbols-view:toggle-file-symbols');

      chevron.workspace.getActiveTextEditor().setGrammar(chevron.grammars.grammarForScopeName('source.js'));
      chevron.commands.dispatch(getEditorView(), 'symbols-view:toggle-file-symbols');
      await conditionPromise(() => symbolsView.element.querySelectorAll('li').length === 1);
      expect(document.body.contains(symbolsView.element)).toBe(true);
      expect(symbolsView.element.querySelector('li:first-child .primary-line')).toHaveText('test');
      expect(symbolsView.element.querySelector('li:first-child .secondary-line')).toHaveText('Line 1');
    });
  });

  describe('match highlighting', () => {
    beforeEach(async () => {
      await chevron.workspace.open(directory.resolve('sample.js'));
    });

    it('highlights an exact match', async () => {
      chevron.commands.dispatch(getEditorView(), 'symbols-view:toggle-file-symbols');

      await activationPromise;
      symbolsView = chevron.workspace.getModalPanels()[0].item;
      await conditionPromise(() => symbolsView.element.querySelectorAll('li').length > 0);
      symbolsView.selectListView.refs.queryEditor.setText('quicksort');
      await getOrScheduleUpdatePromise();
      const resultView = symbolsView.element.querySelector('.selected');
      const matches = resultView.querySelectorAll('.character-match');
      expect(matches.length).toBe(1);
      expect(matches[0].textContent).toBe('quicksort');
    });

    it('highlights a partial match', async () => {
      chevron.commands.dispatch(getEditorView(), 'symbols-view:toggle-file-symbols');
      await activationPromise;
      symbolsView = chevron.workspace.getModalPanels()[0].item;
      await conditionPromise(() => symbolsView.element.querySelectorAll('li').length > 0);
      symbolsView.selectListView.refs.queryEditor.setText('quick');
      await getOrScheduleUpdatePromise();
      const resultView = symbolsView.element.querySelector('.selected');
      const matches = resultView.querySelectorAll('.character-match');
      expect(matches.length).toBe(1);
      expect(matches[0].textContent).toBe('quick');
    });

    it('highlights multiple matches in the symbol name', async () => {
      chevron.commands.dispatch(getEditorView(), 'symbols-view:toggle-file-symbols');
      await activationPromise;
      symbolsView = chevron.workspace.getModalPanels()[0].item;
      await conditionPromise(() => symbolsView.element.querySelectorAll('li').length > 0);
      symbolsView.selectListView.refs.queryEditor.setText('quicort');
      await getOrScheduleUpdatePromise();
      const resultView = symbolsView.element.querySelector('.selected');
      const matches = resultView.querySelectorAll('.character-match');
      expect(matches.length).toBe(2);
      expect(matches[0].textContent).toBe('quic');
      expect(matches[1].textContent).toBe('ort');
    });
  });

  describe('quickjump to symbol', () => {
    beforeEach(async () => {
      await chevron.workspace.open(directory.resolve('sample.js'));
    });

    it('jumps to the selected function', async () => {
      expect(chevron.workspace.getActiveTextEditor().getCursorBufferPosition()).toEqual([0, 0]);
      chevron.commands.dispatch(getEditorView(), 'symbols-view:toggle-file-symbols');
      await activationPromise;
      symbolsView = chevron.workspace.getModalPanels()[0].item;
      await conditionPromise(() => symbolsView.element.querySelectorAll('li').length > 0);
      symbolsView.selectListView.selectNext();
      expect(chevron.workspace.getActiveTextEditor().getCursorBufferPosition()).toEqual([1, 2]);
    });

    it('restores previous editor state on cancel', async () => {
      const bufferRanges = [{start: {row: 0, column: 0}, end: {row: 0, column: 3}}];
      chevron.workspace.getActiveTextEditor().setSelectedBufferRanges(bufferRanges);
      chevron.commands.dispatch(getEditorView(), 'symbols-view:toggle-file-symbols');

      await activationPromise;
      symbolsView = chevron.workspace.getModalPanels()[0].item;
      await conditionPromise(() => symbolsView.element.querySelectorAll('li').length > 0);

      symbolsView.selectListView.selectNext();
      expect(chevron.workspace.getActiveTextEditor().getCursorBufferPosition()).toEqual([1, 2]);
      await symbolsView.cancel();
      expect(chevron.workspace.getActiveTextEditor().getSelectedBufferRanges()).toEqual(bufferRanges);
    });
  });

  describe('when quickJumpToSymbol is set to false', async () => {
    beforeEach(async () => {
      chevron.config.set('symbols-view.quickJumpToFileSymbol', false);
      await chevron.workspace.open(directory.resolve('sample.js'));
    });

    it("won't jumps to the selected function", async () => {
      expect(chevron.workspace.getActiveTextEditor().getCursorBufferPosition()).toEqual([0, 0]);
      chevron.commands.dispatch(getEditorView(), 'symbols-view:toggle-file-symbols');

      await activationPromise;
      symbolsView = chevron.workspace.getModalPanels()[0].item;
      await conditionPromise(() => symbolsView.element.querySelectorAll('li').length > 0);
      symbolsView.selectListView.selectNext();
      expect(chevron.workspace.getActiveTextEditor().getCursorBufferPosition()).toEqual([0, 0]);
    });
  });
});

function getOrScheduleUpdatePromise () {
  return new Promise((resolve) => etch.getScheduler().updateDocument(resolve))
}
