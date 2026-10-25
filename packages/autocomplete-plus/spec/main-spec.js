/* eslint-env jasmine */

const { conditionPromise, waitForAutocomplete } = require('./spec-helper')

describe('Autocomplete', () => {
  let editorView
  let editor
  let autocompleteManager
  let mainModule

  beforeEach(async () => {
    jasmine.useRealClock()

    // Set to live completion
    chevron.config.set('autocomplete-plus.enableAutoActivation', true)
    chevron.config.set('autocomplete-plus.fileBlacklist', ['.*', '*.md'])

    let workspaceElement = chevron.views.getView(chevron.workspace)
    jasmine.attachToDOM(workspaceElement)

    editor = await chevron.workspace.open('sample.js')
    await chevron.packages.activatePackage('language-javascript')

    // Activate the package
    mainModule = (await chevron.packages.activatePackage('autocomplete-plus')).mainModule

    await conditionPromise(() =>
      mainModule.autocompleteManager && mainModule.autocompleteManager.ready
    )

    autocompleteManager = mainModule.autocompleteManager
    editorView = chevron.views.getView(editor)
  })

  describe('@activate()', () =>
    it('activates autocomplete and initializes AutocompleteManager', () => {
      expect(autocompleteManager).toBeDefined()
      expect(editorView.querySelector('.autocomplete-plus')).not.toExist()
    })
  )

  describe('@deactivate()', () => {
    it('removes all autocomplete views', async () => {
      // Trigger an autocompletion
      editor.moveToBottom()
      editor.insertText('A')

      await waitForAutocomplete(editor)

      expect(editorView.querySelector('.autocomplete-plus')).toExist()

      // Deactivate the package
      await chevron.packages.deactivatePackage('autocomplete-plus')
      expect(editorView.querySelector('.autocomplete-plus')).not.toExist()
    })
  })
})
