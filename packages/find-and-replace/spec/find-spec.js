const BufferSearch = require('../lib/buffer-search')
const EmbeddedEditorItem = require('./item/embedded-editor-item')
const DeferredEditorItem = require('./item/deferred-editor-item');
const UnrecognizedItem = require('./item/unrecognized-item');

describe('Find', () => {
  describe('updating the find model', () => {
    beforeEach(async () => {
      chevron.workspace.addOpener(EmbeddedEditorItem.opener)
      chevron.workspace.addOpener(UnrecognizedItem.opener)
      chevron.workspace.addOpener(DeferredEditorItem.opener)

      const activationPromise = chevron.packages.activatePackage('find-and-replace')
      chevron.commands.dispatch(chevron.views.getView(chevron.workspace), 'find-and-replace:show')
      await activationPromise

      spyOn(BufferSearch.prototype, 'setEditor')
    })

    it("sets the find model's editor whenever an editor is focused", async () => {
      let editor = await chevron.workspace.open()
      expect(BufferSearch.prototype.setEditor).toHaveBeenCalledWith(editor)

      editor = await chevron.workspace.open('sample.js')
      expect(BufferSearch.prototype.setEditor).toHaveBeenCalledWith(editor)
    })

    it("sets the find model's editor to an embedded text editor", async () => {
      const embedded = await chevron.workspace.open(EmbeddedEditorItem.uri)
      expect(BufferSearch.prototype.setEditor).toHaveBeenCalledWith(embedded.refs.theEditor)
    })

    it("sets the find model's editor to an embedded text editor after activation", async () => {
      const deferred = await chevron.workspace.open(DeferredEditorItem.uri)
      expect(BufferSearch.prototype.setEditor).not.toHaveBeenCalled()

      await deferred.showEditor()
      expect(BufferSearch.prototype.setEditor).toHaveBeenCalledWith(deferred.refs.theEditor)

      await deferred.hideEditor()
      expect(BufferSearch.prototype.setEditor).toHaveBeenCalledWith(null)
    })

    it("sets the find model's editor to null if a non-editor is focused", async () => {
      await chevron.workspace.open(UnrecognizedItem.uri)
      expect(BufferSearch.prototype.setEditor).toHaveBeenCalledWith(null)
    })
  })
})
