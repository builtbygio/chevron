/**
 * The three season members snippets used, backed by JSON.
 *
 * Local rather than shared with core: a bundled package has to be
 * self-contained (docs/reference/package-artifact-format.md), so it cannot
 * reach into src/.
 *
 * A user's snippets.cson is no longer read. That is the same decision already
 * taken for user config, where strandedCsonFiles() reports files left behind.
 */

const fs = require('fs')
const path = require('path')

function isObjectPath (objectPath: string | null | undefined): boolean {
  return objectPath ? path.extname(objectPath) === '.json' : false
}

function isFile (candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile()
  } catch (error) {
    return false
  }
}

function resolve (objectPath: string | null | undefined): string | null {
  if (!objectPath) return null
  if (isObjectPath(objectPath) && isFile(objectPath)) return objectPath
  const jsonPath = `${objectPath}.json`
  return isFile(jsonPath) ? jsonPath : null
}

// season returned null for an empty file rather than throwing.
function readFile (objectPath: string, options: any, callback?: any): void {
  if (arguments.length < 3) {
    callback = options
    options = {}
  }
  const {allowDuplicateKeys, ...fsOptions} = options
  fs.readFile(objectPath, {encoding: 'utf8', ...fsOptions}, (error: any, contents: string) => {
    if (error) return callback(error)
    let object
    try {
      object = contents.trim().length === 0 ? null : JSON.parse(contents)
    } catch (parseError) {
      return callback(parseError)
    }
    callback(null, object)
  })
}

module.exports = {isObjectPath, resolve, readFile}
