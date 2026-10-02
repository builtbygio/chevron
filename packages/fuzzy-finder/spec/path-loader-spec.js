const fs = require('fs')
const os = require('os')
const path = require('path')
const PathLoader = require('../lib/path-loader')

describe('PathLoader', () => {
  let base, rootA, rootB

  beforeEach(async () => {
    jasmine.useRealClock()
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'path-loader-')))
    rootA = path.join(base, 'a')
    rootB = path.join(base, 'b')
    fs.mkdirSync(rootA)
    fs.mkdirSync(rootB)
    fs.writeFileSync(path.join(rootA, 'one.txt'), '1')
    fs.writeFileSync(path.join(rootB, 'two.txt'), '2')
    atom.project.setPaths([rootA, rootB])
    atom.config.set('fuzzy-finder.useRipGrep', false)
  })

  afterEach(() => fs.rmSync(base, {recursive: true, force: true}))

  const crawl = () => new Promise(resolve => PathLoader.startTask(resolve))
  const names = paths => paths.map(p => path.relative(base, p)).sort()

  it('finds every file again on a second crawl in the same window', async () => {
    expect(names(await crawl())).toEqual(['a/one.txt', 'b/two.txt'])
    expect(names(await crawl())).toEqual(['a/one.txt', 'b/two.txt'])
  })

  it('keeps overlapping crawls apart', async () => {
    const [first, second] = await Promise.all([crawl(), crawl()])
    expect(names(first)).toEqual(['a/one.txt', 'b/two.txt'])
    expect(names(second)).toEqual(['a/one.txt', 'b/two.txt'])
  })

  it('throws ENOENT for a project root that no longer exists', () => {
    fs.rmSync(rootB, {recursive: true})
    let error
    try { PathLoader.startTask(() => {}) } catch (e) { error = e }
    expect(error && error.code).toBe('ENOENT')
  })
})
