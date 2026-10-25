/* eslint-env jasmine */

const { conditionPromise, waitForAutocomplete } = require('./spec-helper')

describe('Autocomplete Manager', () => {
  let editorView
  let editor
  let mainModule

  beforeEach(() => {
    // Set to live completion
    chevron.config.set('autocomplete-plus.enableAutoActivation', true)
    chevron.config.set('editor.fontSize', '16')

    let workspaceElement = chevron.views.getView(chevron.workspace)
    jasmine.attachToDOM(workspaceElement)
  })

  describe('Undo a completion', () => {
    beforeEach(async () => {
      jasmine.useRealClock()
      chevron.config.set('autocomplete-plus.enableAutoActivation', true)

      editor = await chevron.workspace.open('sample.js')

      await chevron.packages.activatePackage('language-javascript')

      // Activate the package
      mainModule = (await chevron.packages.activatePackage('autocomplete-plus')).mainModule

      await conditionPromise(() =>
        mainModule.autocompleteManager && mainModule.autocompleteManager.ready
      )
    })

    it('restores the previous state', async () => {
      // Trigger an autocompletion
      editor.moveToBottom()
      editor.moveToBeginningOfLine()
      editor.insertText('f')

      await waitForAutocomplete(editor)

      // Accept suggestion
      editorView = chevron.views.getView(editor)
      chevron.commands.dispatch(editorView, 'autocomplete-plus:confirm')

      expect(editor.getBuffer().getLastLine()).toEqual('function')

      editor.undo()

      expect(editor.getBuffer().getLastLine()).toEqual('f')
    })
  })
})
