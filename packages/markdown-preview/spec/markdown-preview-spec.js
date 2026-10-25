const path = require('path')
const fs = require('fs-plus')
const temp = require('temp').track()
const MarkdownPreviewView = require('../lib/markdown-preview-view')
const { TextEditor } = require('chevron')

describe('Markdown Preview', function () {
  let preview = null

  beforeEach(function () {
    const fixturesPath = path.join(__dirname, 'fixtures')
    const tempPath = temp.mkdirSync('atom')
    fs.copySync(fixturesPath, tempPath)
    chevron.project.setPaths([tempPath])

    jasmine.useRealClock()
    jasmine.attachToDOM(chevron.views.getView(chevron.workspace))

    waitsForPromise(() => chevron.packages.activatePackage('markdown-preview'))

    waitsForPromise(() => chevron.packages.activatePackage('language-gfm'))

    runs(() =>
      spyOn(chevron.packages, 'hasActivatedInitialPackages').andReturn(true)
    )
  })

  const expectPreviewInSplitPane = function () {
    waitsFor(() => chevron.workspace.getCenter().getPanes().length === 2)

    waitsFor(
      'markdown preview to be created',
      () =>
        (preview = chevron.workspace
          .getCenter()
          .getPanes()[1]
          .getActiveItem())
    )

    runs(() => {
      expect(preview).toBeInstanceOf(MarkdownPreviewView)
      expect(preview.getPath()).toBe(
        chevron.workspace.getActivePaneItem().getPath()
      )
    })
  }

  describe('when a preview has not been created for the file', function () {
    it('displays a markdown preview in a split pane', function () {
      waitsForPromise(() => chevron.workspace.open('subdir/file.markdown'))
      runs(() =>
        chevron.commands.dispatch(
          chevron.workspace.getActiveTextEditor().getElement(),
          'markdown-preview:toggle'
        )
      )
      expectPreviewInSplitPane()

      runs(() => {
        const [editorPane] = chevron.workspace.getCenter().getPanes()
        expect(editorPane.getItems()).toHaveLength(1)
        expect(editorPane.isActive()).toBe(true)
      })
    })

    describe("when the editor's path does not exist", function () {
      it('splits the current pane to the right with a markdown preview for the file', function () {
        waitsForPromise(() => chevron.workspace.open('new.markdown'))
        runs(() =>
          chevron.commands.dispatch(
            chevron.workspace.getActiveTextEditor().getElement(),
            'markdown-preview:toggle'
          )
        )
        expectPreviewInSplitPane()
      })
    })

    describe('when the editor does not have a path', function () {
      it('splits the current pane to the right with a markdown preview for the file', function () {
        waitsForPromise(() => chevron.workspace.open(''))
        runs(() =>
          chevron.commands.dispatch(
            chevron.workspace.getActiveTextEditor().getElement(),
            'markdown-preview:toggle'
          )
        )
        expectPreviewInSplitPane()
      })
    })

    describe('when the path contains a space', function () {
      it('renders the preview', function () {
        waitsForPromise(() => chevron.workspace.open('subdir/file with space.md'))
        runs(() =>
          chevron.commands.dispatch(
            chevron.workspace.getActiveTextEditor().getElement(),
            'markdown-preview:toggle'
          )
        )
        expectPreviewInSplitPane()
      })
    })

    describe('when the path contains accented characters', function () {
      it('renders the preview', function () {
        waitsForPromise(() => chevron.workspace.open('subdir/áccéntéd.md'))
        runs(() =>
          chevron.commands.dispatch(
            chevron.workspace.getActiveTextEditor().getElement(),
            'markdown-preview:toggle'
          )
        )
        expectPreviewInSplitPane()
      })
    })
  })

  describe('when a preview has been created for the file', function () {
    beforeEach(function () {
      waitsForPromise(() => chevron.workspace.open('subdir/file.markdown'))
      runs(() =>
        chevron.commands.dispatch(
          chevron.workspace.getActiveTextEditor().getElement(),
          'markdown-preview:toggle'
        )
      )
      expectPreviewInSplitPane()
    })

    it('closes the existing preview when toggle is triggered a second time on the editor', function () {
      chevron.commands.dispatch(
        chevron.workspace.getActiveTextEditor().getElement(),
        'markdown-preview:toggle'
      )

      const [editorPane, previewPane] = chevron.workspace.getCenter().getPanes()
      expect(editorPane.isActive()).toBe(true)
      expect(previewPane.getActiveItem()).toBeUndefined()
    })

    it('closes the existing preview when toggle is triggered on it and it has focus', function () {
      const [editorPane, previewPane] = chevron.workspace.getCenter().getPanes()
      previewPane.activate()

      chevron.commands.dispatch(
        editorPane.getActiveItem().getElement(),
        'markdown-preview:toggle'
      )
      expect(previewPane.getActiveItem()).toBeUndefined()
    })

    describe('when the editor is modified', function () {
      it('re-renders the preview', function () {
        spyOn(preview, 'showLoading')

        const markdownEditor = chevron.workspace.getActiveTextEditor()
        markdownEditor.setText('Hey!')

        waitsFor(() => preview.element.textContent.includes('Hey!'))

        runs(() => expect(preview.showLoading).not.toHaveBeenCalled())
      })

      it('invokes ::onDidChangeMarkdown listeners', function () {
        let listener
        const markdownEditor = chevron.workspace.getActiveTextEditor()
        preview.onDidChangeMarkdown(
          (listener = jasmine.createSpy('didChangeMarkdownListener'))
        )

        runs(() => markdownEditor.setText('Hey!'))

        waitsFor(
          '::onDidChangeMarkdown handler to be called',
          () => listener.callCount > 0
        )
      })

      describe('when the preview is in the active pane but is not the active item', function () {
        it('re-renders the preview but does not make it active', function () {
          const markdownEditor = chevron.workspace.getActiveTextEditor()
          const previewPane = chevron.workspace.getCenter().getPanes()[1]
          previewPane.activate()

          waitsForPromise(() => chevron.workspace.open())

          runs(() => markdownEditor.setText('Hey!'))

          waitsFor(() => preview.element.textContent.includes('Hey!'))

          runs(() => {
            expect(previewPane.isActive()).toBe(true)
            expect(previewPane.getActiveItem()).not.toBe(preview)
          })
        })
      })

      describe('when the preview is not the active item and not in the active pane', function () {
        it('re-renders the preview and makes it active', function () {
          const markdownEditor = chevron.workspace.getActiveTextEditor()
          const [
            editorPane,
            previewPane
          ] = chevron.workspace.getCenter().getPanes()
          previewPane.splitRight({ copyActiveItem: true })
          previewPane.activate()

          waitsForPromise(() => chevron.workspace.open())

          runs(() => {
            editorPane.activate()
            markdownEditor.setText('Hey!')
          })

          waitsFor(() => preview.element.textContent.includes('Hey!'))

          runs(() => {
            expect(editorPane.isActive()).toBe(true)
            expect(previewPane.getActiveItem()).toBe(preview)
          })
        })
      })

      describe('when the liveUpdate config is set to false', function () {
        it('only re-renders the markdown when the editor is saved, not when the contents are modified', function () {
          chevron.config.set('markdown-preview.liveUpdate', false)

          const didStopChangingHandler = jasmine.createSpy(
            'didStopChangingHandler'
          )
          chevron.workspace
            .getActiveTextEditor()
            .getBuffer()
            .onDidStopChanging(didStopChangingHandler)
          chevron.workspace.getActiveTextEditor().setText('ch ch changes')

          waitsFor(() => didStopChangingHandler.callCount > 0)

          runs(() => {
            expect(preview.element.textContent).not.toMatch('ch ch changes')
            chevron.workspace.getActiveTextEditor().save()
          })

          waitsFor(() => preview.element.textContent.includes('ch ch changes'))
        })
      })
    })

    describe('when the original preview is split', function () {
      it('renders another preview in the new split pane', function () {
        chevron.workspace
          .getCenter()
          .getPanes()[1]
          .splitRight({ copyActiveItem: true })

        expect(chevron.workspace.getCenter().getPanes()).toHaveLength(3)

        waitsFor(
          'split markdown preview to be created',
          () =>
            (preview = chevron.workspace
              .getCenter()
              .getPanes()[2]
              .getActiveItem())
        )

        runs(() => {
          expect(preview).toBeInstanceOf(MarkdownPreviewView)
          expect(preview.getPath()).toBe(
            chevron.workspace.getActivePaneItem().getPath()
          )
        })
      })
    })

    describe('when the editor is destroyed', function () {
      beforeEach(() =>
        chevron.workspace
          .getCenter()
          .getPanes()[0]
          .destroyActiveItem()
      )

      it('falls back to using the file path', function () {
        chevron.workspace
          .getCenter()
          .getPanes()[1]
          .activate()
        expect(preview.file.getPath()).toBe(
          chevron.workspace.getActivePaneItem().getPath()
        )
      })

      it('continues to update the preview if the file is changed on #win32 and #darwin', function () {
        let listener
        const titleChangedCallback = jasmine.createSpy('titleChangedCallback')

        runs(() => {
          expect(preview.getTitle()).toBe('file.markdown Preview')
          preview.onDidChangeTitle(titleChangedCallback)
          fs.renameSync(
            preview.getPath(),
            path.join(path.dirname(preview.getPath()), 'file2.md')
          )
        })

        waitsFor(
          'title to update',
          () => preview.getTitle() === 'file2.md Preview'
        )

        runs(() => expect(titleChangedCallback).toHaveBeenCalled())

        spyOn(preview, 'showLoading')

        runs(() => fs.writeFileSync(preview.getPath(), 'Hey!'))

        waitsFor('contents to update', () =>
          preview.element.textContent.includes('Hey!')
        )

        runs(() => expect(preview.showLoading).not.toHaveBeenCalled())

        preview.onDidChangeMarkdown(
          (listener = jasmine.createSpy('didChangeMarkdownListener'))
        )

        runs(() => fs.writeFileSync(preview.getPath(), 'Hey!'))

        waitsFor(
          '::onDidChangeMarkdown handler to be called',
          () => listener.callCount > 0
        )
      })

      it('allows a new split pane of the preview to be created', function () {
        chevron.workspace
          .getCenter()
          .getPanes()[1]
          .splitRight({ copyActiveItem: true })

        expect(chevron.workspace.getCenter().getPanes()).toHaveLength(3)

        waitsFor(
          'split markdown preview to be created',
          () =>
            (preview = chevron.workspace
              .getCenter()
              .getPanes()[2]
              .getActiveItem())
        )

        runs(() => {
          expect(preview).toBeInstanceOf(MarkdownPreviewView)
          expect(preview.getPath()).toBe(
            chevron.workspace.getActivePaneItem().getPath()
          )
        })
      })
    })
  })

  describe('when the markdown preview view is requested by file URI', function () {
    it('opens a preview editor and watches the file for changes', function () {
      waitsForPromise('atom.workspace.open promise to be resolved', () =>
        chevron.workspace.open(
          `markdown-preview://${chevron.project
            .getDirectories()[0]
            .resolve('subdir/file.markdown')}`
        )
      )

      runs(() => {
        preview = chevron.workspace.getActivePaneItem()
        expect(preview).toBeInstanceOf(MarkdownPreviewView)

        spyOn(preview, 'renderMarkdownText')
        preview.file.emitter.emit('did-change')
      })

      waitsFor(
        'markdown to be re-rendered after file changed',
        () => preview.renderMarkdownText.callCount > 0
      )
    })
  })

  describe("when the editor's grammar it not enabled for preview", function () {
    it('does not open the markdown preview', function () {
      chevron.config.set('markdown-preview.grammars', [])

      waitsForPromise(() => chevron.workspace.open('subdir/file.markdown'))

      runs(() => {
        spyOn(chevron.workspace, 'open').andCallThrough()
        chevron.commands.dispatch(
          chevron.workspace.getActiveTextEditor().getElement(),
          'markdown-preview:toggle'
        )
        expect(chevron.workspace.open).not.toHaveBeenCalled()
      })
    })
  })

  describe("when the editor's path changes on #win32 and #darwin", function () {
    it("updates the preview's title", function () {
      const titleChangedCallback = jasmine.createSpy('titleChangedCallback')

      waitsForPromise(() => chevron.workspace.open('subdir/file.markdown'))
      runs(() =>
        chevron.commands.dispatch(
          chevron.workspace.getActiveTextEditor().getElement(),
          'markdown-preview:toggle'
        )
      )

      expectPreviewInSplitPane()

      runs(() => {
        expect(preview.getTitle()).toBe('file.markdown Preview')
        preview.onDidChangeTitle(titleChangedCallback)
        fs.renameSync(
          chevron.workspace.getActiveTextEditor().getPath(),
          path.join(
            path.dirname(chevron.workspace.getActiveTextEditor().getPath()),
            'file2.md'
          )
        )
      })

      waitsFor(() => preview.getTitle() === 'file2.md Preview')

      runs(() => expect(titleChangedCallback).toHaveBeenCalled())
    })
  })

  describe('when the URI opened does not have a markdown-preview protocol', function () {
    it('does not throw an error trying to decode the URI (regression)', function () {
      waitsForPromise(() => chevron.workspace.open('%'))

      runs(() => expect(chevron.workspace.getActiveTextEditor()).toBeTruthy())
    })
  })

  describe('markdown-preview:toggle', function () {
    beforeEach(() =>
      waitsForPromise(() => chevron.workspace.open('code-block.md'))
    )

    it('does not exist for text editors that are not set to a grammar defined in `markdown-preview.grammars`', function () {
      chevron.config.set('markdown-preview.grammars', ['source.weird-md'])
      const editorElement = chevron.workspace.getActiveTextEditor().getElement()
      const commands = chevron.commands
        .findCommands({ target: editorElement })
        .map(command => command.name)
      expect(commands).not.toContain('markdown-preview:toggle')
    })

    it('exists for text editors that are set to a grammar defined in `markdown-preview.grammars`', function () {
      chevron.config.set('markdown-preview.grammars', ['source.gfm'])
      const editorElement = chevron.workspace.getActiveTextEditor().getElement()
      const commands = chevron.commands
        .findCommands({ target: editorElement })
        .map(command => command.name)
      expect(commands).toContain('markdown-preview:toggle')
    })

    it('updates whenever the list of grammars changes', function () {
      // Last two tests combined
      chevron.config.set('markdown-preview.grammars', ['source.gfm', 'text.plain'])
      const editorElement = chevron.workspace.getActiveTextEditor().getElement()
      let commands = chevron.commands
        .findCommands({ target: editorElement })
        .map(command => command.name)
      expect(commands).toContain('markdown-preview:toggle')

      chevron.config.set('markdown-preview.grammars', [
        'source.weird-md',
        'text.plain'
      ])
      commands = chevron.commands
        .findCommands({ target: editorElement })
        .map(command => command.name)
      expect(commands).not.toContain('markdown-preview:toggle')
    })
  })

  describe('when markdown-preview:copy-html is triggered', function () {
    it('copies the HTML to the clipboard', function () {
      waitsForPromise(() => chevron.workspace.open('subdir/simple.md'))

      waitsForPromise(() =>
        chevron.commands.dispatch(
          chevron.workspace.getActiveTextEditor().getElement(),
          'markdown-preview:copy-html'
        )
      )

      runs(() => {
        expect(chevron.clipboard.read()).toBe(`\
<p><em>italic</em></p>
<p><strong>bold</strong></p>
<p>encoding \u2192 issue</p>\
`)

        chevron.workspace
          .getActiveTextEditor()
          .setSelectedBufferRange([[0, 0], [1, 0]])
      })

      waitsForPromise(() =>
        chevron.commands.dispatch(
          chevron.workspace.getActiveTextEditor().getElement(),
          'markdown-preview:copy-html'
        )
      )

      runs(() =>
        expect(chevron.clipboard.read()).toBe(`\
<p><em>italic</em></p>\
`)
      )
    })

    describe('code block tokenization', function () {
      beforeEach(function () {
        waitsForPromise(() => chevron.packages.activatePackage('language-ruby'))

        waitsForPromise(() => chevron.packages.activatePackage('markdown-preview'))

        waitsForPromise(() => chevron.workspace.open('subdir/file.markdown'))

        waitsForPromise(() =>
          chevron.commands.dispatch(
            chevron.workspace.getActiveTextEditor().getElement(),
            'markdown-preview:copy-html'
          )
        )

        runs(() => {
          preview = document.createElement('div')
          preview.innerHTML = chevron.clipboard.read()
        })
      })

      describe("when the code block's fence name has a matching grammar", function () {
        it('tokenizes the code block with the grammar', function () {
          expect(
            preview.querySelector('pre span.entity.name.function.ruby')
          ).toBeDefined()
        })
      })

      describe("when the code block's fence name doesn't have a matching grammar", function () {
        it('does not tokenize the code block', function () {
          // Plain text renders its lines without any scope spans.
          expect(
            preview.querySelectorAll('pre.lang-kombucha .line').length
          ).toBe(2)
          expect(
            preview.querySelector('pre.lang-kombucha [class*="syntax--"]')
          ).toBeNull()
        })
      })

      describe('when the code block contains empty lines', function () {
        it("doesn't remove the empty lines", function () {
          expect(preview.querySelector('pre.lang-python').children.length).toBe(
            6
          )
          expect(
            preview
              .querySelector('pre.lang-python div:nth-child(2)')
              .textContent.trim()
          ).toBe('')
          expect(
            preview
              .querySelector('pre.lang-python div:nth-child(4)')
              .textContent.trim()
          ).toBe('')
          expect(
            preview
              .querySelector('pre.lang-python div:nth-child(5)')
              .textContent.trim()
          ).toBe('')
        })
      })

      describe('when the code block is nested in a list', function () {
        it('detects and styles the block', function () {
          expect(preview.querySelector('pre.lang-javascript')).toHaveClass(
            'editor-colors'
          )
        })
      })
    })
  })

  describe('sanitization', function () {
    it('removes script tags and attributes that commonly contain inline scripts', function () {
      waitsForPromise(() => chevron.workspace.open('subdir/evil.md'))
      runs(() =>
        chevron.commands.dispatch(
          chevron.workspace.getActiveTextEditor().getElement(),
          'markdown-preview:toggle'
        )
      )
      expectPreviewInSplitPane()

      runs(() =>
        expect(preview.element.innerHTML).toBe(`\
<p>hello</p>


<img>
world\
`)
      )
    })

    it('remove any <!doctype> tag on markdown files', function () {
      waitsForPromise(() => chevron.workspace.open('subdir/doctype-tag.md'))
      runs(() =>
        chevron.commands.dispatch(
          chevron.workspace.getActiveTextEditor().getElement(),
          'markdown-preview:toggle'
        )
      )
      expectPreviewInSplitPane()

      runs(() =>
        expect(preview.element.innerHTML).toBe(`\
<p>content
</p>\
`)
      )
    })
  })

  describe('when the markdown contains an <html> tag', function () {
    it('does not throw an exception', function () {
      waitsForPromise(() => chevron.workspace.open('subdir/html-tag.md'))
      runs(() =>
        chevron.commands.dispatch(
          chevron.workspace.getActiveTextEditor().getElement(),
          'markdown-preview:toggle'
        )
      )
      expectPreviewInSplitPane()

      runs(() => expect(preview.element.innerHTML).toBe('content'))
    })
  })

  describe('when the markdown contains a <pre> tag', function () {
    it('does not throw an exception', function () {
      waitsForPromise(() => chevron.workspace.open('subdir/pre-tag.md'))
      runs(() =>
        chevron.commands.dispatch(
          chevron.workspace.getActiveTextEditor().getElement(),
          'markdown-preview:toggle'
        )
      )
      expectPreviewInSplitPane()

      runs(() =>
        expect(preview.element.querySelector('chevron-text-editor')).toBeDefined()
      )
    })
  })

  describe('when there is an image with a relative path and no directory', function () {
    it('does not alter the image src', function () {
      for (let projectPath of chevron.project.getPaths()) {
        chevron.project.removePath(projectPath)
      }

      const filePath = path.join(temp.mkdirSync('atom'), 'bar.md')
      fs.writeFileSync(filePath, '![rel path](/foo.png)')

      waitsForPromise(() => chevron.workspace.open(filePath))

      runs(() =>
        chevron.commands.dispatch(
          chevron.workspace.getActiveTextEditor().getElement(),
          'markdown-preview:toggle'
        )
      )
      expectPreviewInSplitPane()

      runs(() => {
        // Attributes, not innerHTML: the renderer's attribute order changed.
        const img = preview.element.querySelector('p > img')
        expect(img.getAttribute('src')).toBe('/foo.png')
        expect(img.getAttribute('alt')).toBe('rel path')
      })
    })
  })

  describe('GitHub style markdown preview', function () {
    beforeEach(() => chevron.config.set('markdown-preview.useGitHubStyle', false))

    it('renders markdown using the default style when GitHub styling is disabled', function () {
      waitsForPromise(() => chevron.workspace.open('subdir/simple.md'))
      runs(() =>
        chevron.commands.dispatch(
          chevron.workspace.getActiveTextEditor().getElement(),
          'markdown-preview:toggle'
        )
      )
      expectPreviewInSplitPane()

      runs(() =>
        expect(preview.element.getAttribute('data-use-github-style')).toBeNull()
      )
    })

    it('renders markdown using the GitHub styling when enabled', function () {
      chevron.config.set('markdown-preview.useGitHubStyle', true)

      waitsForPromise(() => chevron.workspace.open('subdir/simple.md'))
      runs(() =>
        chevron.commands.dispatch(
          chevron.workspace.getActiveTextEditor().getElement(),
          'markdown-preview:toggle'
        )
      )
      expectPreviewInSplitPane()

      runs(() =>
        expect(preview.element.getAttribute('data-use-github-style')).toBe('')
      )
    })

    it('updates the rendering style immediately when the configuration is changed', function () {
      waitsForPromise(() => chevron.workspace.open('subdir/simple.md'))
      runs(() =>
        chevron.commands.dispatch(
          chevron.workspace.getActiveTextEditor().getElement(),
          'markdown-preview:toggle'
        )
      )
      expectPreviewInSplitPane()

      runs(() => {
        expect(preview.element.getAttribute('data-use-github-style')).toBeNull()

        chevron.config.set('markdown-preview.useGitHubStyle', true)
        expect(
          preview.element.getAttribute('data-use-github-style')
        ).not.toBeNull()

        chevron.config.set('markdown-preview.useGitHubStyle', false)
        expect(preview.element.getAttribute('data-use-github-style')).toBeNull()
      })
    })
  })

  describe('when markdown-preview:save-as-html is triggered', function () {
    beforeEach(function () {
      waitsForPromise(() => chevron.workspace.open('subdir/simple.markdown'))
      runs(() =>
        chevron.commands.dispatch(
          chevron.workspace.getActiveTextEditor().getElement(),
          'markdown-preview:toggle'
        )
      )
      expectPreviewInSplitPane()
    })

    it('saves the HTML when it is triggered and the editor has focus', function () {
      const [editorPane] = chevron.workspace.getCenter().getPanes()
      editorPane.activate()

      const outputPath = temp.path({ suffix: '.html' })
      expect(fs.existsSync(outputPath)).toBe(false)

      runs(() => {
        spyOn(preview, 'getSaveDialogOptions').andReturn({
          defaultPath: outputPath
        })
        spyOn(chevron.applicationDelegate, 'showSaveDialog').andCallFake(function (
          options,
          callback
        ) {
          if (typeof callback === 'function') {
            callback(options.defaultPath)
          }
          // TODO: When https://github.com/atom/atom/pull/16245 lands remove the return
          // and the existence check on the callback
          return options.defaultPath
        })
        return chevron.commands.dispatch(
          chevron.workspace.getActiveTextEditor().getElement(),
          'markdown-preview:save-as-html'
        )
      })

      waitsFor(() => fs.existsSync(outputPath))

      runs(() => expect(fs.existsSync(outputPath)).toBe(true))
    })

    it('saves the HTML when it is triggered and the preview pane has focus', function () {
      const [editorPane, previewPane] = chevron.workspace.getCenter().getPanes()
      previewPane.activate()

      const outputPath = temp.path({ suffix: '.html' })
      expect(fs.existsSync(outputPath)).toBe(false)

      runs(() => {
        spyOn(preview, 'getSaveDialogOptions').andReturn({
          defaultPath: outputPath
        })
        spyOn(chevron.applicationDelegate, 'showSaveDialog').andCallFake(function (
          options,
          callback
        ) {
          if (typeof callback === 'function') {
            callback(options.defaultPath)
          }
          // TODO: When https://github.com/atom/atom/pull/16245 lands remove the return
          // and the existence check on the callback
          return options.defaultPath
        })
        return chevron.commands.dispatch(
          editorPane.getActiveItem().getElement(),
          'markdown-preview:save-as-html'
        )
      })

      waitsFor(() => fs.existsSync(outputPath))

      runs(() => expect(fs.existsSync(outputPath)).toBe(true))
    })
  })
})
