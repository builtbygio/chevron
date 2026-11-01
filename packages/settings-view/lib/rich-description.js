const marked = require('marked')
const createDOMPurify = require('dompurify')

const renderer = new marked.Renderer()
renderer.code = () => ''
renderer.blockquote = () => ''
renderer.heading = () => ''
renderer.html = (src) => {
  // marked 9+ passes a token; 4 passed the raw HTML string.
  const text = typeof src === 'string' ? src : (src && src.text) || ''
  if (/<br\s*\/?>/.test(text)) {
    return `<br/>`
  }
  return ''
}
renderer.image = () => ''
renderer.list = () => ''

const markdown = text => createDOMPurify().sanitize(
  marked.parse(text, {renderer, breaks: true})
).replace(/<p>(.*)<\/p>/, '$1').trim()

module.exports = {
  getSettingDescription (keyPath) {
    const schema = chevron.config.getSchema(keyPath)
    let description = ''
    if (schema && schema.description) {
      description = schema.description
    }
    return markdown(description)
  }
}
