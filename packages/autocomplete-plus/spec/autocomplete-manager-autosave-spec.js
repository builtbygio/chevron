/* eslint-env jasmine */

let temp = require('temp').track()
const path = require('path')
const fs = require('fs-plus')
const { conditionPromise } = require('./spec-helper')

describe('Autocomplete Manager', () => {
  let directory
  let filePath
  let editorView
  let editor
  let mainModule
  let autocompleteManager
  let createSuggestionsPromise

  beforeEach(async () => {
    jasmine.useRealClock()

    directory = temp.mkdirSync()
    let sample = `var quicksort = function () {
var sort = function(items) {
  if (items.length <= 1) return items;
  var pivot = items.shift(), current, left = [], right = [];
  while(items.length > 0) {
    current = items.shift();
    current < pivot ? left.push(current) : right.push(current);
  }
  return sort(left).concat(pivot).concat(sort(right));
};

return sort(Array.apply(this, arguments));
};
`
    filePath = path.join(directory, 'sample.js')
    fs.writeFileSync(filePath, sample)

    // Enable autosave
    chevron.config.set('autosave.enabled', true)

    // Set to live completion
    chevron.config.set('autocomplete-plus.enableAutoActivation', true)
    chevron.config.set('editor.fontSize', '16')

    let workspaceElement = chevron.views.getView(chevron.workspace)
    jasmine.attachToDOM(workspaceElement)

    await chevron.packages.activatePackage('autosave')

    editor = await chevron.workspace.open(filePath)
    editorView = chevron.views.getView(editor)

    await chevron.packages.activatePackage('language-javascript')

    // Activate the package
    mainModule = (await chevron.packages.activatePackage('autocomplete-plus')).mainModule

    await conditionPromise(() =>
      mainModule && mainModule.autocompleteManager && mainModule.autocompleteManager.ready
    )

    autocompleteManager = mainModule.autocompleteManager
    let { displaySuggestions } = autocompleteManager

    const suggestionsPromises = new Set()

    createSuggestionsPromise = function () {
      return new Promise(resolve => {
        suggestionsPromises.add(resolve)
      })
    }

    spyOn(autocompleteManager, 'displaySuggestions').andCallFake((suggestions, options) => {
      displaySuggestions(suggestions, options)
      for (const resolve of suggestionsPromises) {
        resolve()
      }
      suggestionsPromises.clear()
    })
  })

  describe('autosave compatibility', () =>
    it('keeps the suggestion list open while saving', async () => {
      expect(editorView.querySelector('.autocomplete-plus')).not.toExist()
      // Trigger an autocompletion
      const firstEventPromise = createSuggestionsPromise()

      editor.moveToBottom()
      editor.moveToBeginningOfLine()
      editor.insertText('f')
      await firstEventPromise

      const secondEventPromise = createSuggestionsPromise()
      editor.save()
      expect(editorView.querySelector('.autocomplete-plus')).toExist()
      editor.insertText('u')
      await secondEventPromise

      editor.save()
      expect(editorView.querySelector('.autocomplete-plus')).toExist()
      // Accept suggestion
      let suggestionListView = autocompleteManager.suggestionList.suggestionListElement
      chevron.commands.dispatch(suggestionListView.element, 'autocomplete-plus:confirm')
      expect(editor.getBuffer().getLastLine()).toEqual('function')
    })
  )
})
