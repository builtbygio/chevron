const {Disposable} = require('chevron')

module.exports =
class EncodingStatusView {
  constructor (statusBar, encodings) {
    this.statusBar = statusBar
    this.encodings = encodings
    this.element = document.createElement('encoding-selector-status')
    this.element.classList.add('encoding-status', 'inline-block')
    this.encodingLink = document.createElement('a')
    this.encodingLink.classList.add('inline-block')
    this.element.appendChild(this.encodingLink)

    this.activeItemSubscription = chevron.workspace.observeActiveTextEditor(this.subscribeToActiveTextEditor.bind(this))
    const clickHandler = (event) => {
      event.preventDefault()
      chevron.commands.dispatch(chevron.workspace.getActiveTextEditor().element, 'encoding-selector:show')
    }
    this.element.addEventListener('click', clickHandler)
    this.clickSubscription = new Disposable(() => this.element.removeEventListener('click', clickHandler))
  }

  destroy () {
    if (this.activeItemSubscription) {
      this.activeItemSubscription.dispose()
    }

    if (this.encodingSubscription) {
      this.encodingSubscription.dispose()
    }

    if (this.clickSubscription) {
      this.clickSubscription.dispose()
    }

    if (this.tile) {
      this.tile.destroy()
    }

    if (this.tooltip) {
      this.tooltip.dispose()
    }
  }

  attach () {
    this.tile = this.statusBar.addRightTile({priority: 11, item: this.element})
  }

  subscribeToActiveTextEditor () {
    if (this.encodingSubscription) {
      this.encodingSubscription.dispose()
    }

    const editor = chevron.workspace.getActiveTextEditor()
    if (editor) {
      this.encodingSubscription = editor.onDidChangeEncoding(this.updateEncodingText.bind(this))
    }
    this.updateEncodingText()
  }

  updateEncodingText () {
    chevron.views.updateDocument(() => {
      const editor = chevron.workspace.getActiveTextEditor()
      if (editor && editor.getEncoding()) {
        const editorEncoding = editor.getEncoding().toLowerCase().replace(/[^0-9a-z]|:\d{4}$/g, '')
        const encodingLabel = this.encodings[editorEncoding] || {status: editorEncoding}
        this.encodingLink.textContent = encodingLabel.status
        this.encodingLink.dataset.encoding = editorEncoding
        this.element.style.display = ''

        if (this.tooltip) {
          this.tooltip.dispose()
        }
        this.tooltip = chevron.tooltips.add(this.encodingLink, {title: `This file uses ${encodingLabel.list} encoding`})
      } else {
        this.element.style.display = 'none'
      }
    })
  }
}
