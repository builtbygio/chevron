const MatchManager = require('./match-manager')
const BracketMatcherView = require('./bracket-matcher-view')
const BracketMatcher = require('./bracket-matcher')

module.exports = {
  activate () {
    const watchedEditors = new WeakSet()

    // Matching scans the buffer on every cursor move; a file in large-file
    // mode gets none of it until it leaves the mode.
    chevron.workspace.observeTextEditors(editor => editor.whenFullFeatures(() => {
      if (watchedEditors.has(editor)) return

      const editorElement = chevron.views.getView(editor)
      const matchManager = new MatchManager(editor, editorElement)
      new BracketMatcherView(editor, editorElement, matchManager)
      new BracketMatcher(editor, editorElement, matchManager)
      watchedEditors.add(editor)
      editor.onDidDestroy(() => watchedEditors.delete(editor))
    }))
  }
}
