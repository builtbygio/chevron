const path = require('path')
const {CompositeDisposable, Disposable, Emitter} = require('chevron')
const {Resolver, editorSettingsFor, lineEndingFor, EMPTY} = require('./resolver')
const StatusTile = require('./status-tile')

const CONFIG_FILE_NAME = '.editorconfig'

function isConfigFile (filePath) {
  return Boolean(filePath) && path.basename(filePath) === CONFIG_FILE_NAME
}

module.exports = {
  activate () {
    this.enabled = false
    this.provider = null
    this.resolver = new Resolver()
    this.emitter = new Emitter()
    this.lineEndingsByBuffer = new WeakMap()
    this.subscriptions = new CompositeDisposable()
    this.subscriptions.add(
      chevron.config.observe('editorconfig.enabled', enabled => {
        this.setEnabled(enabled)
      }),
      chevron.project.onDidChangeFiles(events => {
        if (events.some(event => isConfigFile(event.path) || isConfigFile(event.oldPath))) {
          this.refresh()
        }
      }),
      chevron.workspace.observeTextEditors(editor => this.watchEditor(editor))
    )
  },

  deactivate () {
    this.subscriptions.dispose()
    this.setEnabled(false)
    this.emitter.dispose()
  },

  setEnabled (enabled) {
    enabled = Boolean(enabled)
    if (enabled === this.enabled) return
    this.enabled = enabled
    this.resolver.clear()
    if (enabled) {
      this.provider = chevron.textEditors.addSettingsProvider({
        settingsForPath: filePath => editorSettingsFor(this.resultForPath(filePath).properties)
      })
    } else if (this.provider) {
      const provider = this.provider
      this.provider = null
      provider.dispose()
    }
    this.didChange()
  },

  // `.editorconfig` files changed: forget what they said and apply them again.
  refresh () {
    this.resolver.clear()
    chevron.textEditors.refreshSettings()
    this.didChange()
  },

  didChange () {
    for (const editor of chevron.workspace.getTextEditors()) {
      this.applyLineEnding(editor)
    }
    this.emitter.emit('did-change-properties')
  },

  resultForPath (filePath) {
    return this.enabled ? this.resolver.resolve(filePath) : EMPTY
  },

  watchEditor (editor) {
    this.applyLineEnding(editor)
    const editorSubscriptions = new CompositeDisposable(
      editor.onDidChangePath(() => {
        chevron.textEditors.refreshSettings()
        this.applyLineEnding(editor)
        this.emitter.emit('did-change-properties')
      }),
      editor.onDidSave(({path: savedPath}) => {
        if (isConfigFile(savedPath)) this.refresh()
      })
    )
    const destroyed = editor.onDidDestroy(() => {
      editorSubscriptions.dispose()
      destroyed.dispose()
      this.subscriptions.remove(editorSubscriptions)
      this.subscriptions.remove(destroyed)
    })
    this.subscriptions.add(editorSubscriptions, destroyed)
  },

  // `end_of_line` sets the line ending new lines get. Lines already in the
  // file keep theirs; line-ending-selector converts them on request.
  applyLineEnding (editor) {
    const buffer = editor.getBuffer()
    const lineEnding = lineEndingFor(this.resultForPath(editor.getPath()).properties)
    const applied = this.lineEndingsByBuffer.get(buffer)
    if (lineEnding) {
      buffer.setPreferredLineEnding(lineEnding)
      this.lineEndingsByBuffer.set(buffer, lineEnding)
    } else if (applied) {
      if (buffer.getPreferredLineEnding() === applied) buffer.setPreferredLineEnding(null)
      this.lineEndingsByBuffer.delete(buffer)
    }
  },

  provideEditorConfig () {
    return {
      propertiesForPath: filePath => this.resultForPath(filePath).properties,
      onDidChangeProperties: callback => this.emitter.on('did-change-properties', callback)
    }
  },

  consumeStatusBar (statusBar) {
    const statusTile = new StatusTile()
    const update = () => {
      const editor = chevron.workspace.getActiveTextEditor()
      statusTile.update(editor ? this.resultForPath(editor.getPath()) : null)
    }
    const tile = statusBar.addRightTile({item: statusTile.element, priority: 205})
    const subscriptions = new CompositeDisposable(
      chevron.workspace.observeActiveTextEditor(update),
      this.emitter.on('did-change-properties', update),
      new Disposable(() => {
        tile.destroy()
        statusTile.destroy()
      })
    )
    this.subscriptions.add(subscriptions)
    return new Disposable(() => {
      this.subscriptions.remove(subscriptions)
      subscriptions.dispose()
    })
  }
}
