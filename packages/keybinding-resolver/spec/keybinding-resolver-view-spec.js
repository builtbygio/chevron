const {it, fit, ffit, beforeEach} = require('./async-spec-helpers') // eslint-disable-line no-unused-vars
const etch = require('etch')

describe('KeyBindingResolverView', () => {
  let workspaceElement, bottomDockElement

  beforeEach(async () => {
    workspaceElement = chevron.views.getView(chevron.workspace)
    bottomDockElement = chevron.views.getView(chevron.workspace.getBottomDock())
    await chevron.packages.activatePackage('keybinding-resolver')
    jasmine.attachToDOM(workspaceElement);
  })

  describe('when the key-binding-resolver:toggle event is triggered', () => {
    it('toggles the view', async () => {
      expect(chevron.workspace.getBottomDock().isVisible()).toBe(false)
      expect(bottomDockElement.querySelector('.key-binding-resolver')).not.toExist()

      await chevron.commands.dispatch(workspaceElement, 'key-binding-resolver:toggle')
      expect(chevron.workspace.getBottomDock().isVisible()).toBe(true)
      expect(bottomDockElement.querySelector('.key-binding-resolver')).toExist()

      await chevron.commands.dispatch(workspaceElement, 'key-binding-resolver:toggle')
      expect(chevron.workspace.getBottomDock().isVisible()).toBe(false)
      expect(bottomDockElement.querySelector('.key-binding-resolver')).toExist()

      await chevron.commands.dispatch(workspaceElement, 'key-binding-resolver:toggle')
      expect(chevron.workspace.getBottomDock().isVisible()).toBe(true)
      expect(bottomDockElement.querySelector('.key-binding-resolver')).toExist()
    })

    it('focuses the view if it is not visible instead of destroying it', async () => {
      expect(chevron.workspace.getBottomDock().isVisible()).toBe(false)
      expect(bottomDockElement.querySelector('.key-binding-resolver')).not.toExist()

      await chevron.commands.dispatch(workspaceElement, 'key-binding-resolver:toggle')
      expect(chevron.workspace.getBottomDock().isVisible()).toBe(true)
      expect(bottomDockElement.querySelector('.key-binding-resolver')).toExist()

      chevron.workspace.getBottomDock().hide()
      await chevron.commands.dispatch(workspaceElement, 'key-binding-resolver:toggle')

      expect(chevron.workspace.getBottomDock().isVisible()).toBe(true)
      expect(bottomDockElement.querySelector('.key-binding-resolver')).toExist()
    })
  })

  describe('capturing keybinding events', () => {
    it('captures events when the keybinding resolver is visible', async () => {
      await chevron.commands.dispatch(workspaceElement, 'key-binding-resolver:toggle')
      const keybindingResolverView = chevron.workspace.getBottomDock().getActivePaneItem()
      expect(keybindingResolverView.keybindingDisposables).not.toBe(null)

      document.dispatchEvent(chevron.keymaps.constructor.buildKeydownEvent('x', {target: bottomDockElement}))
      await etch.getScheduler().getNextUpdatePromise()
      expect(bottomDockElement.querySelector('.key-binding-resolver .keystroke').textContent).toBe('x')
    })

    it('does not capture events when the keybinding resolver is not the active pane item', async () => {
      await chevron.commands.dispatch(workspaceElement, 'key-binding-resolver:toggle')
      const keybindingResolverView = chevron.workspace.getBottomDock().getActivePaneItem()
      expect(keybindingResolverView.keybindingDisposables).not.toBe(null)

      chevron.workspace.getBottomDock().getActivePane().splitRight()
      expect(keybindingResolverView.keybindingDisposables).toBe(null)

      chevron.workspace.getBottomDock().getActivePane().destroy()
      document.dispatchEvent(chevron.keymaps.constructor.buildKeydownEvent('x', {target: bottomDockElement}))
      await etch.getScheduler().getNextUpdatePromise()
      expect(bottomDockElement.querySelector('.key-binding-resolver .keystroke').textContent).toBe('x')
    })

    it('does not capture events when the dock the keybinding resolver is in is not visible', async () => {
      await chevron.commands.dispatch(workspaceElement, 'key-binding-resolver:toggle')
      const keybindingResolverView = chevron.workspace.getBottomDock().getActivePaneItem()
      expect(keybindingResolverView.keybindingDisposables).not.toBe(null)

      chevron.workspace.getBottomDock().hide()
      expect(keybindingResolverView.keybindingDisposables).toBe(null)

      chevron.workspace.getBottomDock().show()
      document.dispatchEvent(chevron.keymaps.constructor.buildKeydownEvent('x', {target: bottomDockElement}))
      await etch.getScheduler().getNextUpdatePromise()
      expect(bottomDockElement.querySelector('.key-binding-resolver .keystroke').textContent).toBe('x')
    })
  })

  describe('when a keydown event occurs', () => {
    it('displays all commands for the keydown event but does not clear for the keyup when there is no keyup binding', async () => {
      chevron.keymaps.add('name', {
        '.workspace': {
          'x': 'match-1'
        }
      })
      chevron.keymaps.add('name', {
        '.workspace': {
          'x': 'match-2'
        }
      })
      chevron.keymaps.add('name', {
        '.never-again': {
          'x': 'unmatch-2'
        }
      })

      await chevron.commands.dispatch(workspaceElement, 'key-binding-resolver:toggle')

      document.dispatchEvent(chevron.keymaps.constructor.buildKeydownEvent('x', {target: bottomDockElement}))
      await etch.getScheduler().getNextUpdatePromise()
      expect(bottomDockElement.querySelector('.key-binding-resolver .keystroke').textContent).toBe('x')
      expect(bottomDockElement.querySelectorAll('.key-binding-resolver .used')).toHaveLength(1)
      expect(bottomDockElement.querySelectorAll('.key-binding-resolver .unused')).toHaveLength(1)
      expect(bottomDockElement.querySelectorAll('.key-binding-resolver .unmatched')).toHaveLength(1)

      // It should not render the keyup event data because there is no match
      spyOn(etch.getScheduler(), 'updateDocument').andCallThrough()
      document.dispatchEvent(chevron.keymaps.constructor.buildKeyupEvent('x', {target: bottomDockElement}))
      expect(etch.getScheduler().updateDocument).not.toHaveBeenCalled()
      expect(bottomDockElement.querySelector('.key-binding-resolver .keystroke').textContent).toBe('x')
      expect(bottomDockElement.querySelectorAll('.key-binding-resolver .used')).toHaveLength(1)
      expect(bottomDockElement.querySelectorAll('.key-binding-resolver .unused')).toHaveLength(1)
      expect(bottomDockElement.querySelectorAll('.key-binding-resolver .unmatched')).toHaveLength(1)
    })

    it('displays all commands for the keydown event but does not clear for the keyup when there is no keyup binding', async () => {
      chevron.keymaps.add('name', {
        '.workspace': {
          'x': 'match-1'
        }
      })
      chevron.keymaps.add('name', {
        '.workspace': {
          'x ^x': 'match-2'
        }
      })
      chevron.keymaps.add('name', {
        '.workspace': {
          'a ^a': 'match-3'
        }
      })
      chevron.keymaps.add('name', {
        '.never-again': {
          'x': 'unmatch-2'
        }
      })

      await chevron.commands.dispatch(workspaceElement, 'key-binding-resolver:toggle')

      // Not partial because it dispatches the command for `x` immediately due to only having keyup events in remainder of partial match
      document.dispatchEvent(chevron.keymaps.constructor.buildKeydownEvent('x', {target: bottomDockElement}))
      await etch.getScheduler().getNextUpdatePromise()
      expect(bottomDockElement.querySelector('.key-binding-resolver .keystroke').textContent).toBe('x')
      expect(bottomDockElement.querySelectorAll('.key-binding-resolver .used')).toHaveLength(1)
      expect(bottomDockElement.querySelectorAll('.key-binding-resolver .unused')).toHaveLength(0)
      expect(bottomDockElement.querySelectorAll('.key-binding-resolver .unmatched')).toHaveLength(1)

      // It should not render the keyup event data because there is no match
      document.dispatchEvent(chevron.keymaps.constructor.buildKeyupEvent('x', {target: bottomDockElement}))
      await etch.getScheduler().getNextUpdatePromise()
      expect(bottomDockElement.querySelector('.key-binding-resolver .keystroke').textContent).toBe('x ^x')
      expect(bottomDockElement.querySelectorAll('.key-binding-resolver .used')).toHaveLength(1)
      expect(bottomDockElement.querySelectorAll('.key-binding-resolver .unused')).toHaveLength(0)
      expect(bottomDockElement.querySelectorAll('.key-binding-resolver .unmatched')).toHaveLength(0)

      document.dispatchEvent(chevron.keymaps.constructor.buildKeydownEvent('a', {target: bottomDockElement}))
      await etch.getScheduler().getNextUpdatePromise()
      expect(bottomDockElement.querySelector('.key-binding-resolver .keystroke').textContent).toBe('a (partial)')
      expect(bottomDockElement.querySelectorAll('.key-binding-resolver .used')).toHaveLength(0)
      expect(bottomDockElement.querySelectorAll('.key-binding-resolver .unused')).toHaveLength(1)
      expect(bottomDockElement.querySelectorAll('.key-binding-resolver .unmatched')).toHaveLength(0)

      document.dispatchEvent(chevron.keymaps.constructor.buildKeyupEvent('a', {target: bottomDockElement}))
      await etch.getScheduler().getNextUpdatePromise()
      expect(bottomDockElement.querySelector('.key-binding-resolver .keystroke').textContent).toBe('a ^a')
      expect(bottomDockElement.querySelectorAll('.key-binding-resolver .used')).toHaveLength(1)
      expect(bottomDockElement.querySelectorAll('.key-binding-resolver .unused')).toHaveLength(0)
      expect(bottomDockElement.querySelectorAll('.key-binding-resolver .unmatched')).toHaveLength(0)
    })
  })
})
