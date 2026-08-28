const {CompositeDisposable} = require('chevron')

let TimecopView = null
const ViewURI = 'chevron://timecop'

module.exports = {
  activate () {
    this.subscriptions = new CompositeDisposable()
    this.subscriptions.add(chevron.workspace.addOpener(filePath => {
      if (filePath === ViewURI) return this.createTimecopView({uri: ViewURI})
    }))

    this.subscriptions.add(chevron.commands.add('atom-workspace', 'timecop:view', () => chevron.workspace.open(ViewURI)))
  },

  deactivate () {
    this.subscriptions.dispose()
  },

  createTimecopView (state) {
    if (TimecopView == null) TimecopView = require('./timecop-view')
    return new TimecopView(state)
  }
}
