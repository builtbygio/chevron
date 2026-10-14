const path = require('path')

const ENCODING_BY_CHARSET = {
  'utf-8': 'utf8',
  latin1: 'iso88591',
  'utf-16be': 'utf16be',
  'utf-16le': 'utf16le'
}

const LINE_ENDING_BY_END_OF_LINE = {
  lf: '\n',
  crlf: '\r\n',
  cr: '\r'
}

const EMPTY = Object.freeze({
  properties: Object.freeze({}),
  files: Object.freeze([])
})

// Resolving a path reads every `.editorconfig` from its directory up to the
// first `root = true`. The parsed files are cached, as are the answers per
// path, until `clear` -- the editor asks on every tokenize.
const MAX_CACHED_PATHS = 2000

class Resolver {
  constructor ({ parseSync } = {}) {
    this.parseSync = parseSync || require('editorconfig-core').parseSync
    this.clear()
  }

  clear () {
    this.configCache = new Map()
    this.resultsByPath = new Map()
  }

  // Returns an {Object} with `properties`, the combined EditorConfig
  // properties for the file, and `files`, the `.editorconfig` paths that had
  // a matching section, nearest last.
  resolve (filePath) {
    if (!filePath || !path.isAbsolute(filePath)) return EMPTY
    let result = this.resultsByPath.get(filePath)
    if (result) return result

    const matches = []
    let properties = {}
    try {
      properties = this.parseSync(filePath, {
        cache: this.configCache,
        files: matches,
        unset: true
      })
    } catch (error) {
      console.warn(`editorconfig: could not resolve ${filePath}`, error)
    }
    const files = []
    for (const {fileName} of matches) {
      const index = files.indexOf(fileName)
      if (index !== -1) files.splice(index, 1)
      files.push(fileName)
    }
    result = Object.freeze({
      properties: Object.freeze(Object.assign({}, properties)),
      files: Object.freeze(files)
    })
    if (this.resultsByPath.size >= MAX_CACHED_PATHS) this.resultsByPath.clear()
    this.resultsByPath.set(filePath, result)
    return result
  }
}

function isCount (value) {
  return Number.isInteger(value) && value > 0
}

// The editor settings, by TextEditor param name, that EditorConfig
// properties ask for. An editor has one tab length that is also its indent
// width, so `tab_width` wins for tab indentation and `indent_size` for spaces.
function editorSettingsFor (properties) {
  const settings = {}
  if (properties.indent_style === 'space') settings.softTabs = true
  if (properties.indent_style === 'tab') settings.softTabs = false

  const widths = properties.indent_style === 'tab'
    ? [properties.tab_width, properties.indent_size]
    : [properties.indent_size, properties.tab_width]
  const tabLength = widths.find(isCount)
  if (tabLength !== undefined) settings.tabLength = tabLength

  const encoding = ENCODING_BY_CHARSET[properties.charset]
  if (encoding) settings.encoding = encoding

  if (isCount(properties.max_line_length)) {
    settings.preferredLineLength = properties.max_line_length
  }
  return settings
}

function lineEndingFor (properties) {
  return LINE_ENDING_BY_END_OF_LINE[properties.end_of_line] || null
}

module.exports = {Resolver, editorSettingsFor, lineEndingFor, EMPTY}
