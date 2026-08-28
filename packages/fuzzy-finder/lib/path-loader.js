const loadPaths = require('./load-paths-handler')

function createHandle () {
  const listeners = new Map()
  return {
    _dead: false,
    on (event, fn) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(fn)
      return { dispose () {
        const list = listeners.get(event) || []
        const i = list.indexOf(fn)
        if (i >= 0) list.splice(i, 1)
      } }
    },
    emit (event, data) {
      if (this._dead) return
      for (const fn of listeners.get(event) || []) fn(data)
    },
    terminate () {
      this._dead = true
    }
  }
}

module.exports = {
  startTask (callback, metricsReporter) {
    const results = []
    const followSymlinks = chevron.config.get('core.followSymlinks')
    let ignoredNames = chevron.config.get('fuzzy-finder.ignoredNames') || []
    ignoredNames = ignoredNames.concat(chevron.config.get('core.ignoredNames') || [])
    const ignoreVcsIgnores = chevron.config.get('core.excludeVcsIgnoredPaths')
    const projectPaths = chevron.project.getPaths().map((p) => chevron.applicationDelegate.realpathSync(p) || p)
    const useRipGrep = chevron.config.get('fuzzy-finder.useRipGrep')

    const startTime = performance.now()
    const handle = createHandle()

    handle.on('load-paths:paths-found', (paths) => {
      results.push(...(paths || []))
    })

    loadPaths.setEmitFound((event, data) => handle.emit(event, data))

    loadPaths(
      projectPaths,
      followSymlinks,
      ignoreVcsIgnores,
      ignoredNames,
      useRipGrep,
      () => {
        if (handle._dead) return
        callback(results)
        if (metricsReporter) {
          const duration = Math.round(performance.now() - startTime)
          const crawlerType = useRipGrep ? 'ripgrep' : 'fs'
          metricsReporter.sendCrawlEvent(duration, results.length, crawlerType)
        }
        handle.emit('task:completed')
      }
    )

    return handle
  }
}
