// Maintainer helper for update.js. Not loaded at editor runtime.

const path = require('path')
const fs = require('fs')

const mdnHTMLURL = 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element'
const mdnJSONAPI = 'https://developer.mozilla.org/en-US/search.json?topic=html&highlight=false'
const TagsURL = 'https://raw.githubusercontent.com/adobe/brackets/master/src/extensions/default/HTMLCodeHints/HtmlTags.json'

async function getJson (url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`)
  return res.json()
}

function filterExcerpt (tagName, excerpt) {
  const beginningPattern = /^the html [a-z-]+ element (\([^)]+\) )?(is )?(\w+)/i
  excerpt = excerpt.replace(beginningPattern, (match) => {
    const matches = beginningPattern.exec(match)
    const firstWord = matches && matches[3]
    return firstWord ? firstWord[0].toUpperCase() + firstWord.slice(1) : match
  })
  const periodIndex = excerpt.indexOf('.')
  if (periodIndex > -1) excerpt = excerpt.slice(0, periodIndex + 1)
  return excerpt
}

async function fetchDocs () {
  let tags
  try {
    tags = await getJson(TagsURL)
  } catch (error) {
    console.error(error && error.message)
    return null
  }

  const MAX = 10
  const queue = Object.keys(tags)
  const docs = {}

  async function run (tagName) {
    const url = `${mdnJSONAPI}&q=${tagName}`
    try {
      const searchResults = await getJson(url)
      if (searchResults.documents) {
        for (const doc of searchResults.documents) {
          if ((doc.url === `${mdnHTMLURL}/${tagName}`) || (/^h\d$/.test(tagName) && (doc.url === `${mdnHTMLURL}/Heading_Elements`))) {
            if (doc.tags && doc.tags.includes('Obsolete')) {
              docs[tagName] = `The ${tagName} element is obsolete. Avoid using it and update existing code if possible.`
            } else if (doc.tags && doc.tags.includes('Deprecated')) {
              docs[tagName] = `The ${tagName} element is deprecated. Avoid using it and update existing code if possible.`
            } else {
              docs[tagName] = filterExcerpt(tagName, doc.excerpt)
            }
            return
          }
        }
      }
      console.log(`Could not find documentation for ${tagName}`)
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
      fs.writeFileSync(path.join(__dirname, 'tag-docs.json'), `${JSON.stringify(docs, null, '  ')}\n`)
    } else {
      console.error('No docs')
    }
  })
}

module.exports = fetchDocs
