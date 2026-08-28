// Maintainer script: refresh completions.json. Not loaded at editor runtime.

const path = require('path')
const fs = require('fs')
const fetchTagDescriptions = require('./fetch-tag-docs')
const fetchGlobalAttributeDescriptions = require('./fetch-global-attribute-docs')

const TagsURL = 'https://raw.githubusercontent.com/adobe/brackets/master/src/extensions/default/HTMLCodeHints/HtmlTags.json'
const AttributesURL = 'https://raw.githubusercontent.com/adobe/brackets/master/src/extensions/default/HTMLCodeHints/HtmlAttributes.json'

async function getJson (url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`)
  return res.json()
}

async function main () {
  const [tags, tagDescriptions, attributes, attributeDescriptions] = await Promise.all([
    getJson(TagsURL),
    fetchTagDescriptions(),
    getJson(AttributesURL),
    fetchGlobalAttributeDescriptions()
  ])

  for (const tag of Object.keys(tags)) {
    const options = tags[tag]
    if (options.attributes && options.attributes.length === 0) delete options.attributes
    tags[tag].description = tagDescriptions && tagDescriptions[tag]
  }

  for (const attribute of Object.keys(attributes)) {
    const options = attributes[attribute]
    if (options.attribOption && options.attribOption.length === 0) delete options.attribOption
    if (options.global) attributes[attribute].description = attributeDescriptions && attributeDescriptions[attribute]
  }

  const completions = {tags, attributes}
  fs.writeFileSync(path.join(__dirname, 'completions.json'), `${JSON.stringify(completions, null, '  ')}\n`)
}

main().catch(err => {
  console.error(err && err.message ? err.message : err)
  process.exit(1)
})
