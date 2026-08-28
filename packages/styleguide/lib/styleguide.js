const {CompositeDisposable} = require('chevron')
let StyleguideView = null

const STYLEGUIDE_URI = 'chevron://styleguide'

module.exports = {
  activate () {
    this.subscriptions = new CompositeDisposable()
    this.subscriptions.add(chevron.workspace.addOpener(filePath => {
      if (filePath === STYLEGUIDE_URI) return this.createStyleguideView({uri: STYLEGUIDE_URI})
    }))
    this.subscriptions.add(chevron.commands.add('atom-workspace', 'styleguide:show', () => chevron.workspace.open(STYLEGUIDE_URI))
    )
  },

  deactivate () {
    this.subscriptions.dispose()
  },

  createStyleguideView (state) {
    if (StyleguideView == null) StyleguideView = require('./styleguide-view')
    return new StyleguideView(state)
  }
}
