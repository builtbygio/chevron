describe('PlainTextLanguageMode', () => {
  let editor;

  beforeEach(async () => {
    atom.config.set('editor.autoIndent', true);
    editor = await atom.workspace.open('plain.txt');
    expect(editor.getBuffer().getLanguageMode().constructor.name).toBe(
      'PlainTextLanguageMode'
    );
  });

  it('keeps the indentation of the line above on Enter', () => {
    editor.setText('    indented');
    editor.setCursorBufferPosition([0, Infinity]);
    editor.insertNewline();
    expect(editor.lineTextForBufferRow(1)).toBe('    ');
  });

  it('looks past blank lines for the indentation', () => {
    editor.setText('  a\n\n');
    expect(editor.suggestedIndentForBufferRow(2)).toBe(1);
    expect(
      editor.suggestedIndentForBufferRow(2, { skipBlankLines: false })
    ).toBe(0);
  });

  it('applies config scoped to the null grammar', () => {
    expect(editor.getRootScopeDescriptor().getScopesArray()).toEqual([
      'text.plain.null-grammar'
    ]);
    atom.config.set('editor.softWrap', true, {
      scopeSelector: '.text.plain.null-grammar'
    });
    expect(editor.isSoftWrapped()).toBe(true);
  });

  it('answers tokenForBufferPosition with the line', () => {
    editor.setText('one\ntwo words');
    const token = editor.tokenForBufferPosition([1, 4]);
    expect(token.value).toBe('two words');
    expect(token.scopes).toEqual(['text.plain.null-grammar']);
  });

  it('suggests no indentation on the first row', () => {
    editor.setText('  a');
    expect(editor.suggestedIndentForBufferRow(0)).toBe(0);
  });
});
