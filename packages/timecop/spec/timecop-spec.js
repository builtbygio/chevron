const path = require('path')
const CompileCache = require(path.join(atom.getLoadSettings().resourcePath, 'src', 'compile-cache'))

const {it, fit, ffit, beforeEach, afterEach} = require('./async-spec-helpers') // eslint-disable-line no-unused-vars

describe('Timecop', () => {
  beforeEach(async () => {
    spyOn(CompileCache, 'getCacheStats').andReturn({
      '.ts': {hits: 5, misses: 6},
      '.tsx': {hits: 1, misses: 2}
    })

    atom.themes.lessCache.cache.stats.misses = 12

    await atom.packages.activatePackage('timecop')
  })

  describe('the Timecop view', () => {
    let timecopView = null

    beforeEach(async () => {
      const packages = [
        new FakePackage({
          name: 'slow-activating-package-1',
          activateTime: 500,
          loadTime: 5
        }),
        new FakePackage({
          name: 'slow-activating-package-2',
          activateTime: 500,
          loadTime: 5
        }),
        new FakePackage({
          name: 'slow-loading-package',
          activateTime: 5,
          loadTime: 500
        }),
        new FakePackage({
          name: 'fast-package',
          activateTime: 2,
          loadTime: 3
        })
      ]

      spyOn(atom.packages, 'getLoadedPackages').andReturn(packages)
      spyOn(atom.packages, 'getActivePackages').andReturn(packages)
      spyOn(atom.packages, 'hasLoadedInitialPackages').andReturn(true)
      spyOn(atom.packages, 'hasActivatedInitialPackages').andReturn(true)

      timecopView = await atom.workspace.open('chevron://timecop')
    })

    afterEach(() => jasmine.unspy(atom.packages, 'getLoadedPackages'))

    it('shows the packages that loaded slowly', () => {
      const loadingPanel = timecopView.refs.packageLoadingPanel
      expect(loadingPanel.element.textContent).toMatch(/1 package took longer than 5ms to load/)
      expect(loadingPanel.element.textContent).toMatch(/slow-loading-package/)

      expect(loadingPanel.element.textContent).not.toMatch(/slow-activating-package/)
      expect(loadingPanel.element.textContent).not.toMatch(/fast-package/)
    })

    it('shows the packages that activated slowly', () => {
      const activationPanel = timecopView.refs.packageActivationPanel
      expect(activationPanel.element.textContent).toMatch(/2 packages took longer than 5ms to activate/)
      expect(activationPanel.element.textContent).toMatch(/slow-activating-package-1/)
      expect(activationPanel.element.textContent).toMatch(/slow-activating-package-2/)

      expect(activationPanel.element.textContent).not.toMatch(/slow-loading-package/)
      expect(activationPanel.element.textContent).not.toMatch(/fast-package/)
    })

    describe('the session panel', () => {
      let profiler, panel

      beforeEach(() => {
        profiler = atom.packageProfiler
        profiler.stop()
        profiler.reset()
        panel = timecopView.refs.sessionPanel
      })

      afterEach(() => {
        profiler.stop()
        profiler.reset()
      })

      it('says profiling is off until something starts it', () => {
        expect(panel.refs.summary.textContent).toMatch(/Profiling is off/)
        expect(panel.refs.toggleButton.textContent).toBe('Start')
        expect(panel.element.querySelector('table')).toBeNull()
      })

      it('starts, shows a row per package and kind, resets and stops', async () => {
        panel.refs.toggleButton.click()
        expect(profiler.isRunning()).toBe(true)
        await panel.refresh()
        expect(panel.refs.toggleButton.textContent).toBe('Stop')

        for (const ms of [1, 2, 40]) profiler.record('command', 'tree-view', ms)
        profiler.record('save', 'whitespace', 3)
        profiler.record('lsp', 'symbols-view', 300)
        await panel.refresh()

        const rows = [...panel.element.querySelectorAll('tr.session-row')].map(row => [
          row.dataset.owner,
          row.dataset.kind,
          [...row.querySelectorAll('td')].slice(2).map(td => td.textContent)
        ])
        expect(rows).toContain(['tree-view', 'command', ['3', '43', '2.00', '40', '40']])
        expect(rows).toContain(['whitespace', 'save', ['1', '3.00', '3.00', '3.00', '3.00']])
        expect(rows.map(([owner]) => owner)).toContain('symbols-view')
        expect(panel.element.querySelector('a.package[data-package="tree-view"]')).not.toBeNull()

        panel.refs.resetButton.click()
        await panel.refresh()
        expect(profiler.report()).toEqual([])
        expect(profiler.isRunning()).toBe(true)
        expect(panel.element.querySelector('tr.session-row')).toBeNull()

        panel.refs.toggleButton.click()
        await panel.refresh()
        expect(profiler.isRunning()).toBe(false)
        expect(panel.refs.toggleButton.textContent).toBe('Start')
      })

      it('polls only while profiling runs', async () => {
        expect(panel.timer).toBeNull()
        profiler.start()
        expect(panel.timer).not.toBeNull()
        profiler.stop()
        expect(panel.timer).toBeNull()
      })

      it('stops polling and listening when the view goes away', async () => {
        profiler.start()
        expect(panel.timer).not.toBeNull()
        timecopView.destroy()
        expect(panel.timer).toBeNull()
        spyOn(panel, 'refresh')
        profiler.stop()
        expect(panel.refresh).not.toHaveBeenCalled()
      })
    })

    it('shows how many files were transpiled from each language', () => {
      const cachePanel = timecopView.refs.cacheLoadingPanel

      expect(cachePanel.element.textContent).toMatch(/TypeScript files compiled\s*8/)
      expect(cachePanel.element.textContent).toMatch(/Less files compiled\s*12/)
      expect(cachePanel.element.textContent).not.toMatch(/CoffeeScript|Babel|CSON/)
    })
  })
})

class FakePackage {
  constructor ({name, activateTime, loadTime}) {
    this.name = name
    this.activateTime = activateTime
    this.loadTime = loadTime
  }
  getType () { return 'package' }
  isTheme () { return false }
}
