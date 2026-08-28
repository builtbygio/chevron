// Maintainer helper for update.js. Not loaded at editor runtime.

const path = require('path')
const fs = require('fs')

const mdnHTMLURL = 'https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes'
const mdnJSONAPI = 'https://developer.mozilla.org/en-US/search.json?topic=html&highlight=false'
const AttributesURL = 'https://raw.githubusercontent.com/adobe/brackets/master/src/extensions/default/HTMLCodeHints/HtmlAttributes.json'

async function getJson (url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`)
  return res.json()
}

function filterExcerpt (attributeName, excerpt) {
  const beginningPattern = /^the [a-z-]+ global attribute (is )?(\w+)/i
  excerpt = excerpt.replace(beginningPattern, (match) => {
    const matches = beginningPattern.exec(match)
    const firstWord = matches && matches[2]
    return firstWord ? firstWord[0].toUpperCase() + firstWord.slice(1) : match
  })
  const periodIndex = excerpt.indexOf('.')
  if (periodIndex > -1) excerpt = excerpt.slice(0, periodIndex + 1)
  return excerpt
}

async function fetchDocs () {
  let attributes
  try {
    attributes = await getJson(AttributesURL)
  } catch (error) {
    console.error(error && error.message)
    return null
  }

  const MAX = 10
  const queue = []
  for (const attribute of Object.keys(attributes)) {
    const options = attributes[attribute]
    if (options.global && !attribute.startsWith('aria') && !attribute.startsWith('on') && (attribute !== 'role')) {
      queue.push(attribute)
    }
  }
  const docs = {}

  async function run (attributeName) {
    const url = `${mdnJSONAPI}&q=${attributeName}`
    try {
      const searchResults = await getJson(url)
      if (searchResults.documents) {
        for (const doc of searchResults.documents) {
          if (doc.url === `${mdnHTMLURL}/${attributeName}`) {
            docs[attributeName] = filterExcerpt(attributeName, doc.excerpt)
            return
          }
        }
      }
      console.log(`Could not find documentation for ${attributeName}`)
    } catch (error) {
      console.error(`Req failed ${url}; ${error && error.message}`)
    }
  }

  const workers = []
  for (let i = 0; i < MAX; i++) {
    workers.push((async () => {
      while (queue.length) {
        const name = queue.pop()
        if (name) await run(name)
      }
    })())
  }
  await Promise.all(workers)
  return docs
}

if (require.main === module) {
  fetchDocs().then((docs) => {
    if (docs) {
      fs.writeFileSync(path.join(__dirname, 'global-attribute-docs.json'), `${JSON.stringify(docs, null, '  ')}\n`)
    } else {
      console.error('No docs')
    }
  })
}

module.exports = fetchDocs
