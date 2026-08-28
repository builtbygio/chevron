declare const atom: any

const fs = require('fs-plus')
const { CompositeDisposable } = require('chevron')

let MarkdownPreviewView = null
let renderer = null

const isMarkdownPreviewView = function (object) {
  if (MarkdownPreviewView == null) {
    MarkdownPreviewView = require('./markdown-preview-view')
  }
  return object instanceof MarkdownPreviewView
}

module.exports = {
  activate () {
    this.disposables = new CompositeDisposable()
    this.commandSubscriptions = new CompositeDisposable()

    this.disposables.add(
      chevron.config.observe('markdown-preview.grammars', grammars => {
        this.commandSubscriptions.dispose()
        this.commandSubscriptions = new CompositeDisposable()

        if (grammars == null) {
          grammars = []
        }

        for (const grammar of grammars.map(grammar =>
          grammar.replace(/\./g, ' ')
        )) {
          this.commandSubscriptions.add(
            chevron.commands.add(`atom-text-editor[data-grammar='${grammar}']`, {
              'markdown-preview:toggle': () => this.toggle(),
              'markdown-preview:copy-html': {
                displayName: 'Markdown Preview: Copy HTML',
                didDispatch: () => this.copyHTML()
              },
              'markdown-preview:save-as-html': {
                displayName: 'Markdown Preview: Save as HTML',
                didDispatch: () => this.saveAsHTML()
              },
              'markdown-preview:toggle-break-on-single-newline': () => {
                const keyPath = 'markdown-preview.breakOnSingleNewline'
                chevron.config.set(keyPath, !chevron.config.get(keyPath))
              },
              'markdown-preview:toggle-github-style': () => {
                const keyPath = 'markdown-preview.useGitHubStyle'
                chevron.config.set(keyPath, !chevron.config.get(keyPath))
              }
            })
          )
        }
      })
    )

    const previewFile = this.previewFile.bind(this)
    for (const extension of [
      'markdown',
      'md',
      'mdown',
      'mkd',
      'mkdown',
      'ron',
      'txt'
    ]) {
      this.disposables.add(
        chevron.commands.add(
          `.tree-view .file .name[data-name$=\\.${extension}]`,
          'markdown-preview:preview-file',
          previewFile
        )
      )
    }

    this.disposables.add(
      chevron.workspace.addOpener(uriToOpen => {
        let [protocol, path] = uriToOpen.split('://')
        if (protocol !== 'markdown-preview') {
          return
        }

        try {
          path = decodeURI(path)
        } catch (error) {
          return
        }

        if (path.startsWith('editor/')) {
          return this.createMarkdownPreviewView({ editorId: path.substring(7) })
        } else {
          return this.createMarkdownPreviewView({ filePath: path })
        }
      })
    )
  },

  deactivate () {
    this.disposables.dispose()
    this.commandSubscriptions.dispose()
  },

  createMarkdownPreviewView (state) {
    if (state.editorId || fs.isFileSync(state.filePath)) {
      if (MarkdownPreviewView == null) {
        MarkdownPreviewView = require('./markdown-preview-view')
      }
      return new MarkdownPreviewView(state)
    }
  },

  toggle () {
    if (isMarkdownPreviewView(chevron.workspace.getActivePaneItem())) {
      chevron.workspace.destroyActivePaneItem()
      return
    }

    const editor = chevron.workspace.getActiveTextEditor()
    if (editor == null) {
      return
    }

    const grammars = chevron.config.get('markdown-preview.grammars') || []
    if (!grammars.includes(editor.getGrammar().scopeName)) {
      return
    }

    if (!this.removePreviewForEditor(editor)) {
      return this.addPreviewForEditor(editor)
    }
  },

  uriForEditor (editor) {
    return `markdown-preview://editor/${editor.id}`
  },

  removePreviewForEditor (editor) {
    const uri = this.uriForEditor(editor)
    const previewPane = chevron.workspace.paneForURI(uri)
    if (previewPane != null) {
      previewPane.destroyItem(previewPane.itemForURI(uri))
      return true
    } else {
      return false
    }
  },

  addPreviewForEditor (editor) {
    const uri = this.uriForEditor(editor)
    const previousActivePane = chevron.workspace.getActivePane()
    const options = { searchAllPanes: true }
    if (chevron.config.get('markdown-preview.openPreviewInSplitPane')) {
      options.split = 'right'
    }

    return chevron.workspace
      .open(uri, options)
      .then(function (markdownPreviewView) {
        if (isMarkdownPreviewView(markdownPreviewView)) {
          previousActivePane.activate()
        }
      })
  },

  previewFile ({ target }) {
    const filePath = target.dataset.path
    if (!filePath) {
      return
    }

    for (const editor of chevron.workspace.getTextEditors()) {
      if (editor.getPath() === filePath) {
        return this.addPreviewForEditor(editor)
      }
    }

    chevron.workspace.open(`markdown-preview://${encodeURI(filePath)}`, {
      searchAllPanes: true
    })
  },

  async copyHTML () {
    const editor = chevron.workspace.getActiveTextEditor()
    if (editor == null) {
      return
    }

    if (renderer == null) {
      renderer = require('./renderer')
    }
    const text = editor.getSelectedText() || editor.getText()
    const html = await renderer.toHTML(
      text,
      editor.getPath(),
      editor.getGrammar()
    )

    chevron.clipboard.write(html)
  },

  saveAsHTML () {
    const activePaneItem = chevron.workspace.getActivePaneItem()
    if (isMarkdownPreviewView(activePaneItem)) {
      chevron.workspace.getActivePane().saveItemAs(activePaneItem)
      return
    }

    const editor = chevron.workspace.getActiveTextEditor()
    if (editor == null) {
      return
    }

    const grammars = chevron.config.get('markdown-preview.grammars') || []
    if (!grammars.includes(editor.getGrammar().scopeName)) {
      return
    }

    const uri = this.uriForEditor(editor)
    const markdownPreviewPane = chevron.workspace.paneForURI(uri)
    const markdownPreviewPaneItem =
      markdownPreviewPane != null
        ? markdownPreviewPane.itemForURI(uri)
        : undefined

    if (isMarkdownPreviewView(markdownPreviewPaneItem)) {
      return markdownPreviewPane.saveItemAs(markdownPreviewPaneItem)
    }
  }
}
