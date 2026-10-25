const fs = require('fs')
const os = require('os')
const path = require('path')

describe('editorconfig', () => {
  let dir

  function write (name, text) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), {recursive: true})
    fs.writeFileSync(path.join(dir, name), text)
  }

  function open (name) {
    let editor
    waitsForPromise(() => chevron.workspace.open(path.join(dir, name)).then(e => { editor = e }))
    return () => editor
  }

  beforeEach(() => {
    jasmine.useRealClock()
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'editorconfig-spec-')))
    write('.editorconfig', [
      'root = true',
      '[*]',
      'indent_style = tab',
      'tab_width = 3',
      'end_of_line = crlf',
      'max_line_length = 90',
      'trim_trailing_whitespace = false',
      'insert_final_newline = true'
    ].join('\n'))
    chevron.project.setPaths([dir])
    chevron.config.set('editor.tabLength', 2)
    chevron.config.set('editor.tabType', 'soft')
    chevron.config.set('whitespace.removeTrailingWhitespace', true)
    chevron.config.set('whitespace.ensureSingleTrailingNewline', false)

    waitsForPromise(() => chevron.packages.activatePackage('status-bar'))
    waitsForPromise(() => chevron.packages.activatePackage('whitespace'))
    waitsForPromise(() => chevron.packages.activatePackage('editorconfig'))
  })

  it('applies indentation, line length and line endings to the editor', () => {
    const editor = open('a.txt')
    waitsFor('the .editorconfig tab width', () => editor().getTabLength() === 3)
    runs(() => {
      expect(editor().getSoftTabs()).toBe(false)
      expect(editor().getPreferredLineLength()).toBe(90)
      expect(editor().getBuffer().getPreferredLineEnding()).toBe('\r\n')
    })
  })

  it('reads a file in its charset', () => {
    write('latin/.editorconfig', '[*]\ncharset = latin1\n')
    fs.writeFileSync(path.join(dir, 'latin', 'b.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9]))
    const editor = open('latin/b.txt')
    waitsFor('the latin1 text', () => editor().getText() === 'café')
    runs(() => expect(editor().getEncoding()).toBe('iso88591'))
  })

  it("loses to the project root's .chevron/config.json", () => {
    write('.chevron/config.json', JSON.stringify({editor: {tabLength: 5}}))
    chevron.project.setPaths([])
    chevron.project.setPaths([dir])
    const editor = open('a.txt')
    waitsFor('the root config tab length', () => editor().getTabLength() === 5)
    runs(() => expect(editor().getSoftTabs()).toBe(false))
  })

  it('decides trailing whitespace, the final newline and new line endings on save', () => {
    const editor = open('a.txt')
    runs(() => {
      editor().insertText('keep  ')
      editor().insertNewline()
      editor().insertText('last')
    })
    waitsForPromise(() => editor().save())
    runs(() => {
      expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('keep  \r\nlast\r\n')
    })
  })

  it('follows an .editorconfig saved in Chevron', () => {
    const editor = open('a.txt')
    const config = open('.editorconfig')
    waitsFor(() => editor().getTabLength() === 3)
    runs(() => config().setText('root = true\n[*]\nindent_style = space\nindent_size = 6\n'))
    waitsForPromise(() => config().save())
    waitsFor('the new indent size', () => editor().getTabLength() === 6)
    runs(() => {
      expect(editor().getSoftTabs()).toBe(true)
      expect(editor().getBuffer().getPreferredLineEnding()).toBe(null)
    })
  })

  it('stands down when disabled', () => {
    const editor = open('a.txt')
    waitsFor(() => editor().getTabLength() === 3)
    runs(() => chevron.config.set('editorconfig.enabled', false))
    waitsFor('the user tab length', () => editor().getTabLength() === 2)
    runs(() => expect(editor().getSoftTabs()).toBe(true))
  })

  it('shows a status tile while the active file has properties', () => {
    let tile
    runs(() => {
      tile = document.querySelector('.editorconfig-status') ||
        chevron.workspace.getFooterPanels()[0].getItem().getRightTiles()
          .map(t => t.getItem())
          .find(item => item.classList && item.classList.contains('editorconfig-status'))
      expect(tile).toBeTruthy()
      expect(tile.style.display).toBe('none')
    })
    open('a.txt')
    waitsFor('the tile to show', () => tile.style.display === '')
    runs(() => expect(tile.textContent).toBe('EditorConfig'))
  })
})
