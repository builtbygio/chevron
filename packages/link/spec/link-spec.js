const { shell } = require('electron');

describe('link package', () => {
  beforeEach(async () => {
    await atom.packages.activatePackage('language-gfm');

    const activationPromise = atom.packages.activatePackage('link');
    atom.commands.dispatch(atom.views.getView(atom.workspace), 'link:open');
    await activationPromise;
  });

  describe('when the cursor is on a link', () => {
    it("opens the link using the 'open' command", async () => {
      await atom.workspace.open('sample.md');

      const editor = atom.workspace.getActiveTextEditor();
      editor.setText('// "http://github.com"');

      spyOn(shell, 'openExternal');
      atom.commands.dispatch(atom.views.getView(editor), 'link:open');
      expect(shell.openExternal).not.toHaveBeenCalled();

      editor.setCursorBufferPosition([0, 4]);
      atom.commands.dispatch(atom.views.getView(editor), 'link:open');

      expect(shell.openExternal).toHaveBeenCalled();
      expect(shell.openExternal.argsForCall[0][0]).toBe('http://github.com');

      shell.openExternal.reset();
      editor.setCursorBufferPosition([0, 8]);
      atom.commands.dispatch(atom.views.getView(editor), 'link:open');

      expect(shell.openExternal).toHaveBeenCalled();
      expect(shell.openExternal.argsForCall[0][0]).toBe('http://github.com');

      shell.openExternal.reset();
      editor.setCursorBufferPosition([0, 21]);
      atom.commands.dispatch(atom.views.getView(editor), 'link:open');

      expect(shell.openExternal).toHaveBeenCalled();
      expect(shell.openExternal.argsForCall[0][0]).toBe('http://github.com');
    });

    it("opens a 'chevron:' link", async () => {
      await atom.workspace.open('sample.md');

      const editor = atom.workspace.getActiveTextEditor();
      editor.setText(
        '// "chevron://core/open/file?filename=sample.js&line=1&column=2"'
      );

      spyOn(shell, 'openExternal');
      atom.commands.dispatch(atom.views.getView(editor), 'link:open');
      expect(shell.openExternal).not.toHaveBeenCalled();

      editor.setCursorBufferPosition([0, 4]);
      atom.commands.dispatch(atom.views.getView(editor), 'link:open');

      expect(shell.openExternal).toHaveBeenCalled();
      expect(shell.openExternal.argsForCall[0][0]).toBe(
        'chevron://core/open/file?filename=sample.js&line=1&column=2'
      );

      shell.openExternal.reset();
      editor.setCursorBufferPosition([0, 8]);
      atom.commands.dispatch(atom.views.getView(editor), 'link:open');

      expect(shell.openExternal).toHaveBeenCalled();
      expect(shell.openExternal.argsForCall[0][0]).toBe(
        'chevron://core/open/file?filename=sample.js&line=1&column=2'
      );

      shell.openExternal.reset();
      editor.setCursorBufferPosition([0, 60]);
      atom.commands.dispatch(atom.views.getView(editor), 'link:open');

      expect(shell.openExternal).toHaveBeenCalled();
      expect(shell.openExternal.argsForCall[0][0]).toBe(
        'chevron://core/open/file?filename=sample.js&line=1&column=2'
      );
    });

    it('opens a bare URL in a file with no link scopes', async () => {
      const editor = await atom.workspace.open('notes.txt');
      editor.setText('see https://github.com/builtbygio/chevron. thanks');

      spyOn(shell, 'openExternal');
      editor.setCursorBufferPosition([0, 1]);
      atom.commands.dispatch(atom.views.getView(editor), 'link:open');
      expect(shell.openExternal).not.toHaveBeenCalled();

      editor.setCursorBufferPosition([0, 10]);
      atom.commands.dispatch(atom.views.getView(editor), 'link:open');
      expect(shell.openExternal.argsForCall[0][0]).toBe(
        'https://github.com/builtbygio/chevron'
      );
    });

    describe('when the cursor is on a [name][url-name] style markdown link', () =>
      it('opens the named url', async () => {
        await atom.workspace.open('README.md');

        const editor = atom.workspace.getActiveTextEditor();
        editor.setText(`\
you should [click][here]
you should not [click][her]

[here]: http://github.com\
`);

        spyOn(shell, 'openExternal');
        editor.setCursorBufferPosition([0, 0]);
        atom.commands.dispatch(atom.views.getView(editor), 'link:open');
        expect(shell.openExternal).not.toHaveBeenCalled();

        editor.setCursorBufferPosition([0, 20]);
        atom.commands.dispatch(atom.views.getView(editor), 'link:open');

        expect(shell.openExternal).toHaveBeenCalled();
        expect(shell.openExternal.argsForCall[0][0]).toBe('http://github.com');

        shell.openExternal.reset();
        editor.setCursorBufferPosition([1, 24]);
        atom.commands.dispatch(atom.views.getView(editor), 'link:open');

        expect(shell.openExternal).not.toHaveBeenCalled();
      }));

    it('does not open non http/https/atom links', async () => {
      await atom.workspace.open('sample.md');

      const editor = atom.workspace.getActiveTextEditor();
      editor.setText('// ftp://github.com\n');

      spyOn(shell, 'openExternal');
      atom.commands.dispatch(atom.views.getView(editor), 'link:open');
      expect(shell.openExternal).not.toHaveBeenCalled();

      editor.setCursorBufferPosition([0, 5]);
      atom.commands.dispatch(atom.views.getView(editor), 'link:open');

      expect(shell.openExternal).not.toHaveBeenCalled();
    });
  });
});
