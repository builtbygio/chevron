const { shell } = require('electron');

describe('link package', () => {
  beforeEach(async () => {
    await chevron.packages.activatePackage('language-gfm');

    const activationPromise = chevron.packages.activatePackage('link');
    chevron.commands.dispatch(chevron.views.getView(chevron.workspace), 'link:open');
    await activationPromise;
  });

  describe('when the cursor is on a link', () => {
    it("opens the link using the 'open' command", async () => {
      await chevron.workspace.open('sample.md');

      const editor = chevron.workspace.getActiveTextEditor();
      editor.setText('// "http://github.com"');

      spyOn(shell, 'openExternal');
      chevron.commands.dispatch(chevron.views.getView(editor), 'link:open');
      expect(shell.openExternal).not.toHaveBeenCalled();

      editor.setCursorBufferPosition([0, 4]);
      chevron.commands.dispatch(chevron.views.getView(editor), 'link:open');

      expect(shell.openExternal).toHaveBeenCalled();
      expect(shell.openExternal.argsForCall[0][0]).toBe('http://github.com');

      shell.openExternal.reset();
      editor.setCursorBufferPosition([0, 8]);
      chevron.commands.dispatch(chevron.views.getView(editor), 'link:open');

      expect(shell.openExternal).toHaveBeenCalled();
      expect(shell.openExternal.argsForCall[0][0]).toBe('http://github.com');

      shell.openExternal.reset();
      editor.setCursorBufferPosition([0, 21]);
      chevron.commands.dispatch(chevron.views.getView(editor), 'link:open');

      expect(shell.openExternal).toHaveBeenCalled();
      expect(shell.openExternal.argsForCall[0][0]).toBe('http://github.com');
    });

    it("opens a 'chevron:' link", async () => {
      await chevron.workspace.open('sample.md');

      const editor = chevron.workspace.getActiveTextEditor();
      editor.setText(
        '// "chevron://core/open/file?filename=sample.js&line=1&column=2"'
      );

      spyOn(shell, 'openExternal');
      chevron.commands.dispatch(chevron.views.getView(editor), 'link:open');
      expect(shell.openExternal).not.toHaveBeenCalled();

      editor.setCursorBufferPosition([0, 4]);
      chevron.commands.dispatch(chevron.views.getView(editor), 'link:open');

      expect(shell.openExternal).toHaveBeenCalled();
      expect(shell.openExternal.argsForCall[0][0]).toBe(
        'chevron://core/open/file?filename=sample.js&line=1&column=2'
      );

      shell.openExternal.reset();
      editor.setCursorBufferPosition([0, 8]);
      chevron.commands.dispatch(chevron.views.getView(editor), 'link:open');

      expect(shell.openExternal).toHaveBeenCalled();
      expect(shell.openExternal.argsForCall[0][0]).toBe(
        'chevron://core/open/file?filename=sample.js&line=1&column=2'
      );

      shell.openExternal.reset();
      editor.setCursorBufferPosition([0, 60]);
      chevron.commands.dispatch(chevron.views.getView(editor), 'link:open');

      expect(shell.openExternal).toHaveBeenCalled();
      expect(shell.openExternal.argsForCall[0][0]).toBe(
        'chevron://core/open/file?filename=sample.js&line=1&column=2'
      );
    });

    it('opens a bare URL in a file with no link scopes', async () => {
      const editor = await chevron.workspace.open('notes.txt');
      editor.setText('see https://github.com/builtbygio/chevron. thanks');

      spyOn(shell, 'openExternal');
      editor.setCursorBufferPosition([0, 1]);
      chevron.commands.dispatch(chevron.views.getView(editor), 'link:open');
      expect(shell.openExternal).not.toHaveBeenCalled();

      editor.setCursorBufferPosition([0, 10]);
      chevron.commands.dispatch(chevron.views.getView(editor), 'link:open');
      expect(shell.openExternal.argsForCall[0][0]).toBe(
        'https://github.com/builtbygio/chevron'
      );
    });

    describe('when the cursor is on a [name][url-name] style markdown link', () =>
      it('opens the named url', async () => {
        await chevron.workspace.open('README.md');

        const editor = chevron.workspace.getActiveTextEditor();
        editor.setText(`\
you should [click][here]
you should not [click][her]

[here]: http://github.com\
`);

        spyOn(shell, 'openExternal');
        editor.setCursorBufferPosition([0, 0]);
        chevron.commands.dispatch(chevron.views.getView(editor), 'link:open');
        expect(shell.openExternal).not.toHaveBeenCalled();

        editor.setCursorBufferPosition([0, 20]);
        chevron.commands.dispatch(chevron.views.getView(editor), 'link:open');

        expect(shell.openExternal).toHaveBeenCalled();
        expect(shell.openExternal.argsForCall[0][0]).toBe('http://github.com');

        shell.openExternal.reset();
        editor.setCursorBufferPosition([1, 24]);
        chevron.commands.dispatch(chevron.views.getView(editor), 'link:open');

        expect(shell.openExternal).not.toHaveBeenCalled();
      }));

    it('does not open non http/https/atom links', async () => {
      await chevron.workspace.open('sample.md');

      const editor = chevron.workspace.getActiveTextEditor();
      editor.setText('// ftp://github.com\n');

      spyOn(shell, 'openExternal');
      chevron.commands.dispatch(chevron.views.getView(editor), 'link:open');
      expect(shell.openExternal).not.toHaveBeenCalled();

      editor.setCursorBufferPosition([0, 5]);
      chevron.commands.dispatch(chevron.views.getView(editor), 'link:open');

      expect(shell.openExternal).not.toHaveBeenCalled();
    });
  });
});
