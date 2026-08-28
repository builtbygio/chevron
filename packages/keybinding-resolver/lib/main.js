const {CompositeDisposable} = require('chevron')

const KeyBindingResolverView = require('./keybinding-resolver-view')

const KEYBINDING_RESOLVER_URI = 'chevron://keybinding-resolver'

module.exports = {
  activate () {
    this.subscriptions = new CompositeDisposable()

    this.subscriptions.add(chevron.workspace.addOpener(uri => {
      if (uri === KEYBINDING_RESOLVER_URI) {
        return new KeyBindingResolverView()
      }
    }))

    this.subscriptions.add(chevron.commands.add('atom-workspace', {
      'key-binding-resolver:toggle': () => this.toggle()
    }))
  },

  deactivate () {
    this.subscriptions.dispose()
  },

  toggle () {
    chevron.workspace.toggle(KEYBINDING_RESOLVER_URI)
  },

  deserializeKeyBindingResolverView (serialized) {
    return new KeyBindingResolverView()
  }
}
