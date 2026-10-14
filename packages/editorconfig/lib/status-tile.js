const path = require('path')

function escapeHTML (text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function displayPath (filePath) {
  const [root, relative] = chevron.project.relativizePath(filePath)
  return root ? path.join(path.basename(root), relative) : filePath
}

// "EditorConfig" in the status bar while the active file has properties from
// an `.editorconfig`. The tooltip lists them; a click opens the nearest file.
module.exports = class StatusTile {
  constructor () {
    this.result = null
    this.element = document.createElement('a')
    this.element.classList.add('editorconfig-status', 'inline-block')
    this.element.textContent = 'EditorConfig'
    this.element.style.display = 'none'
    this.element.addEventListener('click', () => this.openNearest())
    this.tooltip = chevron.tooltips.add(this.element, {
      title: () => this.tooltipHTML()
    })
  }

  update (result) {
    this.result = result && result.files.length > 0 ? result : null
    this.element.style.display = this.result ? '' : 'none'
  }

  tooltipHTML () {
    if (!this.result) return ''
    const properties = Object.keys(this.result.properties)
      .sort()
      .map(name => `${name} = ${this.result.properties[name]}`)
    const files = this.result.files.map(displayPath)
    return [
      ...properties.map(escapeHTML),
      `<small>${files.map(escapeHTML).join('<br>')}</small>`
    ].join('<br>')
  }

  openNearest () {
    if (!this.result) return
    const {files} = this.result
    return chevron.workspace.open(files[files.length - 1])
  }

  destroy () {
    this.tooltip.dispose()
    this.element.remove()
  }
}
