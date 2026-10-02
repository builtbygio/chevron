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

// The realpath IPC answers null rather than throwing. A root that is gone
// (an unmounted drive) must still throw ENOENT: ProjectView turns that into
// the "Project path not found!" notification.
function realProjectPath (projectPath) {
  const real = chevron.applicationDelegate.realpathSync(projectPath)
  if (real) return real
  if (!chevron.applicationDelegate.statSyncNoException(projectPath)) {
    const error = new Error(`ENOENT: no such file or directory, realpath '${projectPath}'`)
    error.code = 'ENOENT'
    throw error
  }
  return projectPath
}

module.exports = {
  startTask (callback, metricsReporter) {
    const results = []
    const followSymlinks = chevron.config.get('core.followSymlinks')
    let ignoredNames = chevron.config.get('fuzzy-finder.ignoredNames') || []
    ignoredNames = ignoredNames.concat(chevron.config.get('core.ignoredNames') || [])
    const ignoreVcsIgnores = chevron.config.get('core.excludeVcsIgnoredPaths')
    const projectPaths = chevron.project.getPaths().map(realProjectPath)
    const useRipGrep = chevron.config.get('fuzzy-finder.useRipGrep')

    const startTime = performance.now()
    const handle = createHandle()

    handle.on('load-paths:paths-found', (paths) => {
      results.push(...(paths || []))
    })

    loadPaths(
      projectPaths,
      followSymlinks,
      ignoreVcsIgnores,
      ignoredNames,
      useRipGrep,
      (event, data) => handle.emit(event, data),
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
