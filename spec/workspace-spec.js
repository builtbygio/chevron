const path = require('path');
const temp = require('temp').track();
const dedent = require('dedent');
const TextBuffer = require('text-buffer');
const TextEditor = require('../src/text-editor');
const Workspace = require('../src/workspace');
const Project = require('../src/project');
const platform = require('./spec-helper-platform');
const _ = require('underscore-plus');
const fs = require('fs-plus');
const ChevronEnvironment = require('../src/chevron-environment');
const { conditionPromise } = require('./async-spec-helpers');

function useRealClockOnce() {
  try {
    jasmine.useRealClock();
  } catch (error) {
    if (error.message !== 'Not a spy') throw error;
  }
}

describe('Workspace', () => {
  let workspace;
  let setDocumentEdited;

  beforeEach(async () => {
    workspace = chevron.workspace;
    workspace.resetFontSize();
    spyOn(chevron.applicationDelegate, 'confirm');
    setDocumentEdited = spyOn(
      chevron.applicationDelegate,
      'setWindowDocumentEdited'
    );
    chevron.project.setPaths([chevron.project.getDirectories()[0].resolve('dir')]);
    // Service consumers register on a timer. Stay on the spec clock: several
    // examples advance it, and turning the real clock on here breaks them.
    await new Promise(resolve => {
      window.setTimeout(resolve, 1);
      window.advanceClock(1);
    });
    await chevron.workspace.itemLocationStore.clear();
  });

  afterEach(() => {
    try {
      temp.cleanupSync();
    } catch (e) {
      // Do nothing
    }
  });

  async function simulateReload() {
    await (async () => {
      const workspaceState = workspace.serialize();
      const projectState = chevron.project.serialize({ isUnloading: true });
      workspace.destroy();
      chevron.project.destroy();
      chevron.project = new Project({
        notificationManager: chevron.notifications,
        packageManager: chevron.packages,
        confirm: chevron.confirm.bind(chevron),
        applicationDelegate: chevron.applicationDelegate,
        grammarRegistry: chevron.grammars
      });
      return chevron.project.deserialize(projectState).then(() => {
        workspace = chevron.workspace = new Workspace({
          config: chevron.config,
          project: chevron.project,
          packageManager: chevron.packages,
          grammarRegistry: chevron.grammars,
          styleManager: chevron.styles,
          deserializerManager: chevron.deserializers,
          notificationManager: chevron.notifications,
          applicationDelegate: chevron.applicationDelegate,
          viewRegistry: chevron.views,
          assert: chevron.assert.bind(chevron),
          textEditorRegistry: chevron.textEditors
        });
        workspace.deserialize(workspaceState, chevron.deserializers);
      });
    })();
  }

  describe('serialization', () => {
    describe('when the workspace contains text editors', () => {
      it('constructs the view with the same panes', async () => {
        const pane1 = chevron.workspace.getActivePane();
        const pane2 = pane1.splitRight({ copyActiveItem: true });
        const pane3 = pane2.splitRight({ copyActiveItem: true });
        let pane4 = null;
        await chevron.workspace
            .open(null)
            .then(editor => editor.setText('An untitled editor.'));
        await chevron.workspace
            .open('b')
            .then(editor => pane2.activateItem(editor.copy()));
        await chevron.workspace
            .open('../sample.js')
            .then(editor => pane3.activateItem(editor));
        pane3.activeItem.setCursorScreenPosition([2, 4]);
        pane4 = pane2.splitDown();
        await chevron.workspace
            .open('../sample.txt')
            .then(editor => pane4.activateItem(editor));
        pane4.getActiveItem().setCursorScreenPosition([0, 2]);
        pane2.activate();
        await simulateReload();
        expect(chevron.workspace.getTextEditors().length).toBe(5);
        const [
          editor1,
          editor2,
          untitledEditor,
          editor3,
          editor4
        ] = chevron.workspace.getTextEditors();
        const firstDirectory = chevron.project.getDirectories()[0];
        expect(firstDirectory).toBeDefined();
        expect(editor1.getPath()).toBe(firstDirectory.resolve('b'));
        expect(editor2.getPath()).toBe(
          firstDirectory.resolve('../sample.txt')
        );
        expect(editor2.getCursorScreenPosition()).toEqual([0, 2]);
        expect(editor3.getPath()).toBe(firstDirectory.resolve('b'));
        expect(editor4.getPath()).toBe(
          firstDirectory.resolve('../sample.js')
        );
        expect(editor4.getCursorScreenPosition()).toEqual([2, 4]);
        expect(untitledEditor.getPath()).toBeUndefined();
        expect(untitledEditor.getText()).toBe('An untitled editor.');
        expect(chevron.workspace.getActiveTextEditor().getPath()).toBe(
          editor3.getPath()
        );
        const pathEscaped = fs.tildify(
          escapeStringRegex(chevron.project.getPaths()[0])
        );
        expect(document.title).toMatch(
          new RegExp(
            `^${path.basename(editor3.getLongTitle())} \\u2014 ${pathEscaped}`
          )
        );
      });
    });

    describe('where there are no open panes or editors', () => {
      it('constructs the view with no open editors', async () => {
        chevron.workspace.getActivePane().destroy();
        expect(chevron.workspace.getTextEditors().length).toBe(0);
        await simulateReload();
        expect(chevron.workspace.getTextEditors().length).toBe(0);
      });
    });
  });

  describe('::open(itemOrURI, options)', () => {
    let openEvents = null;

    beforeEach(() => {
      openEvents = [];
      workspace.onDidOpen(event => openEvents.push(event));
      spyOn(workspace.getActivePane(), 'activate').andCallThrough();
    });

    describe("when the 'searchAllPanes' option is false (default)", () => {
      describe('when called without a uri or item', () => {
        it('adds and activates an empty editor on the active pane', async () => {
          let editor1;
          let editor2;
          await workspace.open().then(editor => {
              editor1 = editor;
            });
          expect(editor1.getPath()).toBeUndefined();
          expect(workspace.getActivePane().items).toEqual([editor1]);
          expect(workspace.getActivePaneItem()).toBe(editor1);
          expect(workspace.getActivePane().activate).toHaveBeenCalled();
          expect(openEvents).toEqual([
            {
              uri: undefined,
              pane: workspace.getActivePane(),
              item: editor1,
              index: 0
            }
          ]);
          openEvents = [];
          await workspace.open().then(editor => {
              editor2 = editor;
            });
          expect(editor2.getPath()).toBeUndefined();
          expect(workspace.getActivePane().items).toEqual([editor1, editor2]);
          expect(workspace.getActivePaneItem()).toBe(editor2);
          expect(workspace.getActivePane().activate).toHaveBeenCalled();
          expect(openEvents).toEqual([
            {
              uri: undefined,
              pane: workspace.getActivePane(),
              item: editor2,
              index: 1
            }
          ]);
        });
      });

      describe('when called with a uri', () => {
        describe('when the active pane already has an editor for the given uri', () => {
          it('activates the existing editor on the active pane', async () => {
            let editor = null;
            let editor1 = null;
            let editor2 = null;
            await workspace.open('a').then(o => {
                editor1 = o;
                return workspace.open('b').then(o => {
                  editor2 = o;
                  return workspace.open('a').then(o => {
                    editor = o;
                  });
                });
              });
            expect(editor).toBe(editor1);
            expect(workspace.getActivePaneItem()).toBe(editor);
            expect(workspace.getActivePane().activate).toHaveBeenCalled();
            const firstDirectory = chevron.project.getDirectories()[0];
            expect(firstDirectory).toBeDefined();
            expect(openEvents).toEqual([
              {
                uri: firstDirectory.resolve('a'),
                item: editor1,
                pane: chevron.workspace.getActivePane(),
                index: 0
              },
              {
                uri: firstDirectory.resolve('b'),
                item: editor2,
                pane: chevron.workspace.getActivePane(),
                index: 1
              },
              {
                uri: firstDirectory.resolve('a'),
                item: editor1,
                pane: chevron.workspace.getActivePane(),
                index: 0
              }
            ]);
          });

          it('finds items in docks', async () => {
            const dock = chevron.workspace.getRightDock();
            const ITEM_URI = 'chevron://test';
            const item = {
              getURI: () => ITEM_URI,
              getDefaultLocation: () => 'left',
              getElement: () => document.createElement('div')
            };
            dock.getActivePane().addItem(item);
            expect(dock.getPaneItems()).toHaveLength(1);
            await chevron.workspace.open(ITEM_URI, { searchAllPanes: true });
            expect(chevron.workspace.getPaneItems()).toHaveLength(1);
            expect(dock.getPaneItems()).toHaveLength(1);
            expect(dock.getPaneItems()[0]).toBe(item);
          });
        });

        describe("when the 'activateItem' option is false", () => {
          it('adds the item to the workspace', async () => {
            let editor;
            await workspace.open('a');
            await workspace.open('b', { activateItem: false }).then(o => {
                editor = o;
              });
            expect(workspace.getPaneItems()).toContain(editor);
            expect(workspace.getActivePaneItem()).not.toBe(editor);
          });
        });

        describe('when the active pane does not have an editor for the given uri', () => {
          beforeEach(() => {
            chevron.workspace.enablePersistence = true;
          });

          afterEach(async () => {
            await chevron.workspace.itemLocationStore.clear();
            chevron.workspace.enablePersistence = false;
          });

          it('adds and activates a new editor for the given path on the active pane', async () => {
            let editor = null;
            await workspace.open('a').then(o => {
                editor = o;
              });
            const firstDirectory = chevron.project.getDirectories()[0];
            expect(firstDirectory).toBeDefined();
            expect(editor.getURI()).toBe(firstDirectory.resolve('a'));
            expect(workspace.getActivePaneItem()).toBe(editor);
            expect(workspace.getActivePane().items).toEqual([editor]);
            expect(workspace.getActivePane().activate).toHaveBeenCalled();
          });

          it('discovers existing editors that are still opening', async () => {
            let editor0 = null;
            let editor1 = null;
            await Promise.all([
                workspace.open('spartacus.txt').then(o0 => {
                  editor0 = o0;
                }),
                workspace.open('spartacus.txt').then(o1 => {
                  editor1 = o1;
                })
              ]);
            expect(editor0).toEqual(editor1);
            expect(workspace.getActivePane().items).toEqual([editor0]);
          });

          it("uses the location specified by the model's `getDefaultLocation()` method", async () => {
            const item = {
              getDefaultLocation: jasmine.createSpy().andReturn('right'),
              getElement: () => document.createElement('div')
            };
            const opener = jasmine.createSpy().andReturn(item);
            const dock = chevron.workspace.getRightDock();
            spyOn(chevron.workspace.itemLocationStore, 'load').andReturn(
              Promise.resolve()
            );
            spyOn(chevron.workspace, 'getOpeners').andReturn([opener]);
            expect(dock.getPaneItems()).toHaveLength(0);
            await chevron.workspace.open('a');
            expect(dock.getPaneItems()).toHaveLength(1);
            expect(opener).toHaveBeenCalled();
            expect(item.getDefaultLocation).toHaveBeenCalled();
          });

          it('prefers the last location the user used for that item', async () => {
            const ITEM_URI = 'chevron://test';
            const item = {
              getURI: () => ITEM_URI,
              getDefaultLocation: () => 'left',
              getElement: () => document.createElement('div')
            };
            const opener = uri => (uri === ITEM_URI ? item : null);
            const dock = chevron.workspace.getRightDock();
            spyOn(chevron.workspace.itemLocationStore, 'load').andCallFake(uri =>
              uri === 'chevron://test'
                ? Promise.resolve('right')
                : Promise.resolve()
            );
            spyOn(chevron.workspace, 'getOpeners').andReturn([opener]);
            expect(dock.getPaneItems()).toHaveLength(0);
            await chevron.workspace.open(ITEM_URI);
            expect(dock.getPaneItems()).toHaveLength(1);
            expect(dock.getPaneItems()[0]).toBe(item);
          });
        });
      });

      describe('when an item with the given uri exists in an inactive pane container', () => {
        it("activates that item if it is in that container's active pane", async () => {
          const item = await chevron.workspace.open('a');
          chevron.workspace.getLeftDock().activate();
          expect(
            await chevron.workspace.open('a', { searchAllPanes: false })
          ).toBe(item);
          expect(chevron.workspace.getActivePaneContainer().getLocation()).toBe(
            'center'
          );
          expect(chevron.workspace.getPaneItems()).toEqual([item]);

          chevron.workspace.getActivePane().splitRight();
          chevron.workspace.getLeftDock().activate();
          const item2 = await chevron.workspace.open('a', {
            searchAllPanes: false
          });
          expect(item2).not.toBe(item);
          expect(chevron.workspace.getActivePaneContainer().getLocation()).toBe(
            'center'
          );
          expect(chevron.workspace.getPaneItems()).toEqual([item, item2]);
        });
      });
    });

    describe("when the 'searchAllPanes' option is true", () => {
      describe('when an editor for the given uri is already open on an inactive pane', () => {
        it('activates the existing editor on the inactive pane, then activates that pane', async () => {
          let editor1 = null;
          let editor2 = null;
          const pane1 = workspace.getActivePane();
          const pane2 = workspace.getActivePane().splitRight();
          await (async () => {
            pane1.activate();
            return workspace.open('a').then(o => {
              editor1 = o;
            });
          })();
          await (async () => {
            pane2.activate();
            return workspace.open('b').then(o => {
              editor2 = o;
            });
          })();
          expect(workspace.getActivePaneItem()).toBe(editor2);
          await workspace.open('a', { searchAllPanes: true });
          expect(workspace.getActivePane()).toBe(pane1);
          expect(workspace.getActivePaneItem()).toBe(editor1);
        });

        it('discovers existing editors that are still opening in an inactive pane', async () => {
          let editor0 = null;
          let editor1 = null;
          const pane0 = workspace.getActivePane();
          const pane1 = workspace.getActivePane().splitRight();
          pane0.activate();
          const promise0 = workspace
            .open('spartacus.txt', { searchAllPanes: true })
            .then(o0 => {
              editor0 = o0;
            });
          pane1.activate();
          const promise1 = workspace
            .open('spartacus.txt', { searchAllPanes: true })
            .then(o1 => {
              editor1 = o1;
            });
          await Promise.all([promise0, promise1]);
          expect(editor0).toBeDefined();
          expect(editor1).toBeDefined();
          expect(editor0).toEqual(editor1);
          expect(workspace.getActivePane().items).toEqual([editor0]);
        });

        it('activates the pane in the dock with the matching item', async () => {
          const dock = chevron.workspace.getRightDock();
          const ITEM_URI = 'chevron://test';
          const item = {
            getURI: () => ITEM_URI,
            getDefaultLocation: jasmine.createSpy().andReturn('left'),
            getElement: () => document.createElement('div')
          };
          dock.getActivePane().addItem(item);
          spyOn(dock.paneForItem(item), 'activate');
          await chevron.workspace.open(ITEM_URI, { searchAllPanes: true });
          expect(dock.paneForItem(item).activate).toHaveBeenCalled();
        });
      });

      describe('when no editor for the given uri is open in any pane', () => {
        it('opens an editor for the given uri in the active pane', async () => {
          let editor = null;
          await workspace.open('a', { searchAllPanes: true }).then(o => {
              editor = o;
            });
          expect(workspace.getActivePaneItem()).toBe(editor);
        });
      });
    });

    describe('when attempting to open an editor in a dock', () => {
      it('opens the editor in the workspace center', async () => {
        await chevron.workspace.open('sample.txt', { location: 'right' });
        expect(
          chevron.workspace
            .getCenter()
            .getActivePaneItem()
            .getFileName()
        ).toEqual('sample.txt');
      });
    });

    describe('when called with an item rather than a URI', () => {
      it('adds the item itself to the workspace', async () => {
        const item = document.createElement('div');
        await chevron.workspace.open(item);
        expect(chevron.workspace.getActivePaneItem()).toBe(item);
      });

      describe('when the active pane already contains the item', () => {
        it('activates the item', async () => {
          const item = document.createElement('div');

          await chevron.workspace.open(item);
          await chevron.workspace.open();
          expect(chevron.workspace.getActivePaneItem()).not.toBe(item);
          expect(chevron.workspace.getActivePane().getItems().length).toBe(2);

          await chevron.workspace.open(item);
          expect(chevron.workspace.getActivePaneItem()).toBe(item);
          expect(chevron.workspace.getActivePane().getItems().length).toBe(2);
        });
      });

      describe('when the item already exists in another pane', () => {
        it('rejects the promise', async () => {
          const item = document.createElement('div');

          await chevron.workspace.open(item);
          await chevron.workspace.open(null, { split: 'right' });
          expect(chevron.workspace.getActivePaneItem()).not.toBe(item);
          expect(chevron.workspace.getActivePane().getItems().length).toBe(1);

          let rejection;
          try {
            await chevron.workspace.open(item);
          } catch (error) {
            rejection = error;
          }

          expect(rejection.message).toMatch(
            /The workspace can only contain one instance of item/
          );
        });
      });
    });

    describe("when the 'split' option is set", () => {
      describe("when the 'split' option is 'left'", () => {
        it('opens the editor in the leftmost pane of the current pane axis', async () => {
          const pane1 = workspace.getActivePane();
          const pane2 = pane1.splitRight();
          expect(workspace.getActivePane()).toBe(pane2);
          let editor = null;
          await workspace.open('a', { split: 'left' }).then(o => {
              editor = o;
            });
          expect(workspace.getActivePane()).toBe(pane1);
          expect(pane1.items).toEqual([editor]);
          expect(pane2.items).toEqual([]);
          await (async () => {
            pane2.focus();
            return workspace.open('a', { split: 'left' }).then(o => {
              editor = o;
            });
          })();
          expect(workspace.getActivePane()).toBe(pane1);
          expect(pane1.items).toEqual([editor]);
          expect(pane2.items).toEqual([]);
        });
      });

      describe('when a pane axis is the leftmost sibling of the current pane', () => {
        it('opens the new item in the current pane', async () => {
          let editor = null;
          const pane1 = workspace.getActivePane();
          const pane2 = pane1.splitLeft();
          pane2.splitDown();
          pane1.activate();
          expect(workspace.getActivePane()).toBe(pane1);
          await workspace.open('a', { split: 'left' }).then(o => {
              editor = o;
            });
          expect(workspace.getActivePane()).toBe(pane1);
          expect(pane1.items).toEqual([editor]);
        });
      });

      describe("when the 'split' option is 'right'", () => {
        it('opens the editor in the rightmost pane of the current pane axis', async () => {
          let editor = null;
          const pane1 = workspace.getActivePane();
          let pane2 = null;
          await workspace.open('a', { split: 'right' }).then(o => {
              editor = o;
            });
          pane2 = workspace.getPanes().filter(p => p !== pane1)[0];
          expect(workspace.getActivePane()).toBe(pane2);
          expect(pane1.items).toEqual([]);
          expect(pane2.items).toEqual([editor]);
          await (async () => {
            pane1.focus();
            return workspace.open('a', { split: 'right' }).then(o => {
              editor = o;
            });
          })();
          expect(workspace.getActivePane()).toBe(pane2);
          expect(pane1.items).toEqual([]);
          expect(pane2.items).toEqual([editor]);
        });

        describe('when a pane axis is the rightmost sibling of the current pane', () => {
          it('opens the new item in a new pane split to the right of the current pane', async () => {
            let editor = null;
            const pane1 = workspace.getActivePane();
            const pane2 = pane1.splitRight();
            pane2.splitDown();
            pane1.activate();
            expect(workspace.getActivePane()).toBe(pane1);
            let pane4 = null;
            await workspace.open('a', { split: 'right' }).then(o => {
                editor = o;
              });
            pane4 = workspace.getPanes().filter(p => p !== pane1)[0];
            expect(workspace.getActivePane()).toBe(pane4);
            expect(pane4.items).toEqual([editor]);
            expect(workspace.getCenter().paneContainer.root.children[0]).toBe(
              pane1
            );
            expect(workspace.getCenter().paneContainer.root.children[1]).toBe(
              pane4
            );
          });
        });
      });

      describe("when the 'split' option is 'up'", () => {
        it('opens the editor in the topmost pane of the current pane axis', async () => {
          const pane1 = workspace.getActivePane();
          const pane2 = pane1.splitDown();
          expect(workspace.getActivePane()).toBe(pane2);
          let editor = null;
          await workspace.open('a', { split: 'up' }).then(o => {
              editor = o;
            });
          expect(workspace.getActivePane()).toBe(pane1);
          expect(pane1.items).toEqual([editor]);
          expect(pane2.items).toEqual([]);
          await (async () => {
            pane2.focus();
            return workspace.open('a', { split: 'up' }).then(o => {
              editor = o;
            });
          })();
          expect(workspace.getActivePane()).toBe(pane1);
          expect(pane1.items).toEqual([editor]);
          expect(pane2.items).toEqual([]);
        });
      });

      describe('when a pane axis is the topmost sibling of the current pane', () => {
        it('opens the new item in the current pane', async () => {
          let editor = null;
          const pane1 = workspace.getActivePane();
          const pane2 = pane1.splitUp();
          pane2.splitRight();
          pane1.activate();
          expect(workspace.getActivePane()).toBe(pane1);
          await workspace.open('a', { split: 'up' }).then(o => {
              editor = o;
            });
          expect(workspace.getActivePane()).toBe(pane1);
          expect(pane1.items).toEqual([editor]);
        });
      });

      describe("when the 'split' option is 'down'", () => {
        it('opens the editor in the bottommost pane of the current pane axis', async () => {
          let editor = null;
          const pane1 = workspace.getActivePane();
          let pane2 = null;
          await workspace.open('a', { split: 'down' }).then(o => {
              editor = o;
            });
          pane2 = workspace.getPanes().filter(p => p !== pane1)[0];
          expect(workspace.getActivePane()).toBe(pane2);
          expect(pane1.items).toEqual([]);
          expect(pane2.items).toEqual([editor]);
          await (async () => {
            pane1.focus();
            return workspace.open('a', { split: 'down' }).then(o => {
              editor = o;
            });
          })();
          expect(workspace.getActivePane()).toBe(pane2);
          expect(pane1.items).toEqual([]);
          expect(pane2.items).toEqual([editor]);
        });

        describe('when a pane axis is the bottommost sibling of the current pane', () => {
          it('opens the new item in a new pane split to the bottom of the current pane', async () => {
            let editor = null;
            const pane1 = workspace.getActivePane();
            const pane2 = pane1.splitDown();
            pane1.activate();
            expect(workspace.getActivePane()).toBe(pane1);
            let pane4 = null;
            await workspace.open('a', { split: 'down' }).then(o => {
                editor = o;
              });
            pane4 = workspace.getPanes().filter(p => p !== pane1)[0];
            expect(workspace.getActivePane()).toBe(pane4);
            expect(pane4.items).toEqual([editor]);
            expect(workspace.getCenter().paneContainer.root.children[0]).toBe(
              pane1
            );
            expect(workspace.getCenter().paneContainer.root.children[1]).toBe(
              pane2
            );
          });
        });
      });
    });

    describe('when an initialLine and initialColumn are specified', () => {
      it('moves the cursor to the indicated location', async () => {
        await workspace.open('a', { initialLine: 1, initialColumn: 5 });
        expect(
                    workspace.getActiveTextEditor().getCursorBufferPosition()
                  ).toEqual([1, 5]);
        await workspace.open('a', { initialLine: 2, initialColumn: 4 });
        expect(
                    workspace.getActiveTextEditor().getCursorBufferPosition()
                  ).toEqual([2, 4]);
        await workspace.open('a', { initialLine: 0, initialColumn: 0 });
        expect(
                    workspace.getActiveTextEditor().getCursorBufferPosition()
                  ).toEqual([0, 0]);
        await workspace.open('a', { initialLine: NaN, initialColumn: 4 });
        expect(
                    workspace.getActiveTextEditor().getCursorBufferPosition()
                  ).toEqual([0, 4]);
        await workspace.open('a', { initialLine: 2, initialColumn: NaN });
        expect(
                    workspace.getActiveTextEditor().getCursorBufferPosition()
                  ).toEqual([2, 0]);
        await workspace.open('a', {
            initialLine: Infinity,
            initialColumn: Infinity
          });
        expect(
                    workspace.getActiveTextEditor().getCursorBufferPosition()
                  ).toEqual([2, 11]);
      });

      it('unfolds the fold containing the line', async () => {
        let editor;

        await workspace.open('../sample-with-many-folds.js');
        editor = workspace.getActiveTextEditor();
        editor.foldBufferRow(2);
        expect(editor.isFoldedAtBufferRow(2)).toBe(true);
        expect(editor.isFoldedAtBufferRow(3)).toBe(true);

        await workspace.open('../sample-with-many-folds.js', {
          initialLine: 2
        });
        expect(editor.isFoldedAtBufferRow(2)).toBe(false);
        expect(editor.isFoldedAtBufferRow(3)).toBe(false);
      });
    });

    describe('when the file size is over the limit defined in `core.warnOnLargeFileLimit`', () => {
      const shouldPromptForFileOfSize = async (size, shouldPrompt) => {
        spyOn(fs, 'getSizeSync').andReturn(size * 1048577);

        let selectedButtonIndex = 1; // cancel
        chevron.applicationDelegate.confirm.andCallFake((options, callback) =>
          callback(selectedButtonIndex)
        );

        let editor = await workspace.open('sample.js');
        if (shouldPrompt) {
          expect(editor).toBeUndefined();
          expect(chevron.applicationDelegate.confirm).toHaveBeenCalled();

          chevron.applicationDelegate.confirm.reset();
          selectedButtonIndex = 0; // open the file

          editor = await workspace.open('sample.js');

          expect(chevron.applicationDelegate.confirm).toHaveBeenCalled();
        } else {
          expect(editor).not.toBeUndefined();
        }
      };

      it('prompts before opening the file', async () => {
        chevron.config.set('core.warnOnLargeFileLimit', 20);
        await shouldPromptForFileOfSize(20, true);
        const [options] = chevron.applicationDelegate.confirm.mostRecentCall.args;
        expect(options.message).toBe(
          'Chevron may become unresponsive while loading very large files.'
        );
        expect(options.buttons).toEqual(['Proceed', 'Cancel']);
      });

      it("doesn't prompt on files below the limit", async () => {
        chevron.config.set('core.warnOnLargeFileLimit', 30);
        await shouldPromptForFileOfSize(20, false);
      });

      it('prompts for smaller files with a lower limit', async () => {
        chevron.config.set('core.warnOnLargeFileLimit', 5);
        await shouldPromptForFileOfSize(10, true);
      });
    });

    describe('when the file size is at or over `core.largeFileModeThreshold`', () => {
      const openOfSize = megabytes => {
        spyOn(fs, 'getSizeSync').andReturn(megabytes * 1048576);
        return workspace.open('../sample.js');
      };

      beforeEach(async () => {
        await chevron.packages.activatePackage('language-javascript');
        chevron.config.set('core.largeFileModeThreshold', 5);
      });

      it('opens it as plain text with no folds, in large-file mode', async () => {
        const editor = await openOfSize(5);
        expect(editor.isLargeFileMode()).toBe(true);
        expect(editor.getGrammar().scopeName).toBe('text.plain.null-grammar');
        expect(editor.isFoldableAtBufferRow(0)).toBe(false);
      });

      it('opens smaller files normally', async () => {
        const editor = await openOfSize(4);
        expect(editor.isLargeFileMode()).toBe(false);
        expect(editor.getGrammar().scopeName).toBe('source.js');
      });

      it('is off when the threshold is 0', async () => {
        chevron.config.set('core.largeFileModeThreshold', 0);
        const editor = await openOfSize(30);
        expect(editor.isLargeFileMode()).toBe(false);
      });

      it('switches the features back on with editor:enable-full-features', async () => {
        useRealClockOnce();
        const editor = await openOfSize(5);
        const changes = [];
        editor.onDidChangeLargeFileMode(enabled => changes.push(enabled));

        chevron.commands.dispatch(
          chevron.views.getView(editor),
          'editor:enable-full-features'
        );

        expect(changes).toEqual([false]);
        expect(editor.isLargeFileMode()).toBe(false);
        expect(editor.getGrammar().scopeName).toBe('source.js');
        await editor.getBuffer().getLanguageMode().parseCompletePromise();
        expect(editor.isFoldableAtBufferRow(0)).toBe(true);
      });

      it('runs whenFullFeatures callbacks once the editor leaves the mode', async () => {
        const editor = await openOfSize(5);
        let calls = 0;
        editor.whenFullFeatures(() => calls++);
        expect(calls).toBe(0);

        chevron.project.setLargeFileMode(editor.getBuffer(), false);
        expect(calls).toBe(1);

        editor.whenFullFeatures(() => calls++);
        expect(calls).toBe(2);
      });

      it('leaves the mode when a grammar is chosen for the file', async () => {
        const editor = await openOfSize(5);
        chevron.grammars.assignLanguageMode(editor.getBuffer(), 'source.js');
        expect(editor.isLargeFileMode()).toBe(false);
      });

      it('flags every editor of the buffer', async () => {
        const editor = await openOfSize(5);
        const copy = editor.copy();
        expect(copy.isLargeFileMode()).toBe(true);
        chevron.project.setLargeFileMode(editor.getBuffer(), false);
        expect(copy.isLargeFileMode()).toBe(false);
        copy.destroy();
      });
    });

    describe('when passed a path that matches a custom opener', () => {
      it('returns the resource returned by the custom opener', async () => {
        const fooOpener = (pathToOpen, options) => {
          if (pathToOpen != null ? pathToOpen.match(/\.foo/) : undefined) {
            return { foo: pathToOpen, options };
          }
        };
        const barOpener = pathToOpen => {
          if (pathToOpen != null ? pathToOpen.match(/^bar:\/\//) : undefined) {
            return { bar: pathToOpen };
          }
        };
        workspace.addOpener(fooOpener);
        workspace.addOpener(barOpener);
        await (async () => {
          const pathToOpen = chevron.project.getDirectories()[0].resolve('a.foo');
          return workspace.open(pathToOpen, { hey: 'there' }).then(item =>
            expect(item).toEqual({
              foo: pathToOpen,
              options: { hey: 'there' }
            })
          );
        })();
        await workspace
            .open('bar://baz')
            .then(item => expect(item).toEqual({ bar: 'bar://baz' }));
      });
    });

    it("adds the file to the application's recent documents list", async () => {
      if (process.platform !== 'darwin') {
        return;
      }
      spyOn(chevron.applicationDelegate, 'addRecentDocument');
      await workspace.open();
      expect(
                chevron.applicationDelegate.addRecentDocument
              ).not.toHaveBeenCalled();
      await workspace.open('something://a/url');
      expect(
                chevron.applicationDelegate.addRecentDocument
              ).not.toHaveBeenCalled();
      await workspace.open(__filename);
      expect(chevron.applicationDelegate.addRecentDocument).toHaveBeenCalledWith(
                __filename
              );
    });

    it('notifies ::onDidAddTextEditor observers', async () => {
      const absolutePath = require.resolve('./fixtures/dir/a');
      const newEditorHandler = jasmine.createSpy('newEditorHandler');
      workspace.onDidAddTextEditor(newEditorHandler);
      let editor = null;
      await workspace.open(absolutePath).then(e => {
          editor = e;
        });
      expect(newEditorHandler.argsForCall[0][0].textEditor).toBe(editor);
    });

    describe('when there is an error opening the file', () => {
      let notificationSpy = null;
      beforeEach(() =>
        chevron.notifications.onDidAddNotification(
          (notificationSpy = jasmine.createSpy())
        )
      );

      describe('when a file does not exist', () => {
        it('creates an empty buffer for the specified path', async () => {
          await workspace.open('not-a-file.md');
          const editor = workspace.getActiveTextEditor();
          expect(notificationSpy).not.toHaveBeenCalled();
          expect(editor.getPath()).toContain('not-a-file.md');
        });
      });

      describe('when the user does not have access to the file', () => {
        beforeEach(() =>
          spyOn(fs, 'openSync').andCallFake(path => {
            const error = new Error(`EACCES, permission denied '${path}'`);
            error.path = path;
            error.code = 'EACCES';
            throw error;
          })
        );

        it('creates a notification', async () => {
          await workspace.open('file1');
          expect(notificationSpy).toHaveBeenCalled();
          const notification = notificationSpy.mostRecentCall.args[0];
          expect(notification.getType()).toBe('warning');
          expect(notification.getMessage()).toContain('Permission denied');
          expect(notification.getMessage()).toContain('file1');
        });
      });

      describe('when the the operation is not permitted', () => {
        beforeEach(() =>
          spyOn(fs, 'openSync').andCallFake(path => {
            const error = new Error(`EPERM, operation not permitted '${path}'`);
            error.path = path;
            error.code = 'EPERM';
            throw error;
          })
        );

        it('creates a notification', async () => {
          await workspace.open('file1');
          expect(notificationSpy).toHaveBeenCalled();
          const notification = notificationSpy.mostRecentCall.args[0];
          expect(notification.getType()).toBe('warning');
          expect(notification.getMessage()).toContain('Unable to open');
          expect(notification.getMessage()).toContain('file1');
        });
      });

      describe('when the the file is already open in windows', () => {
        beforeEach(() =>
          spyOn(fs, 'openSync').andCallFake(path => {
            const error = new Error(`EBUSY, resource busy or locked '${path}'`);
            error.path = path;
            error.code = 'EBUSY';
            throw error;
          })
        );

        it('creates a notification', async () => {
          await workspace.open('file1');
          expect(notificationSpy).toHaveBeenCalled();
          const notification = notificationSpy.mostRecentCall.args[0];
          expect(notification.getType()).toBe('warning');
          expect(notification.getMessage()).toContain('Unable to open');
          expect(notification.getMessage()).toContain('file1');
        });
      });

      describe('when there is an unhandled error', () => {
        beforeEach(() =>
          spyOn(fs, 'openSync').andCallFake(path => {
            throw new Error('I dont even know what is happening right now!!');
          })
        );

        it('rejects the promise', async () => {
          await new Promise(done => {
            workspace.open('file1').catch(error => {
              expect(error.message).toBe(
                'I dont even know what is happening right now!!'
              );
              done();
            });
          });
        });
      });
    });

    describe('when the file is already open in pending state', () => {
      it('should terminate the pending state', async () => {
        let editor = null;
        let pane = null;
        await chevron.workspace.open('sample.js', { pending: true }).then(o => {
            editor = o;
            pane = chevron.workspace.getActivePane();
          });
        expect(pane.getPendingItem()).toEqual(editor);
        await chevron.workspace.open('sample.js');
        expect(pane.getPendingItem()).toBeNull();
      });
    });

    describe('when opening will switch from a pending tab to a permanent tab', () => {
      it('keeps the pending tab open', async () => {
        let editor1 = null;
        let editor2 = null;
        await chevron.workspace.open('sample.txt').then(o => {
            editor1 = o;
          });
        await chevron.workspace.open('sample2.txt', { pending: true }).then(o => {
            editor2 = o;
          });
        const pane = chevron.workspace.getActivePane();
        pane.activateItem(editor1);
        expect(pane.getItems().length).toBe(2);
        expect(pane.getItems()).toEqual([editor1, editor2]);
      });
    });

    describe('when replacing a pending item which is the last item in a second pane', () => {
      it('does not destroy the pane even if core.destroyEmptyPanes is on', async () => {
        chevron.config.set('core.destroyEmptyPanes', true);
        let editor1 = null;
        let editor2 = null;
        const leftPane = chevron.workspace.getActivePane();
        let rightPane = null;
        await chevron.workspace
            .open('sample.js', { pending: true, split: 'right' })
            .then(o => {
              editor1 = o;
              rightPane = chevron.workspace.getActivePane();
              spyOn(rightPane, 'destroy').andCallThrough();
            });
        expect(leftPane).not.toBe(rightPane);
        expect(chevron.workspace.getActivePane()).toBe(rightPane);
        expect(chevron.workspace.getActivePane().getItems().length).toBe(1);
        expect(rightPane.getPendingItem()).toBe(editor1);
        await chevron.workspace.open('sample.txt', { pending: true }).then(o => {
            editor2 = o;
          });
        expect(rightPane.getPendingItem()).toBe(editor2);
        expect(rightPane.destroy.callCount).toBe(0);
      });
    });

    describe("when opening an editor with a buffer that isn't part of the project", () => {
      it('adds the buffer to the project', async () => {
        const buffer = new TextBuffer();
        const editor = new TextEditor({ buffer });

        await chevron.workspace.open(editor);

        expect(chevron.project.getBuffers().map(buffer => buffer.id)).toContain(
          buffer.id
        );
        expect(buffer.getLanguageMode().getLanguageId()).toBe(
          'text.plain.null-grammar'
        );
      });
    });
  });

  describe('finding items in the workspace', () => {
    it('can identify the pane and pane container for a given item or URI', () => {
      const uri = 'chevron://test-pane-for-item';
      const item = {
        element: document.createElement('div'),
        getURI() {
          return uri;
        }
      };

      chevron.workspace.getActivePane().activateItem(item);
      expect(chevron.workspace.paneForItem(item)).toBe(
        chevron.workspace.getCenter().getActivePane()
      );
      expect(chevron.workspace.paneContainerForItem(item)).toBe(
        chevron.workspace.getCenter()
      );
      expect(chevron.workspace.paneForURI(uri)).toBe(
        chevron.workspace.getCenter().getActivePane()
      );
      expect(chevron.workspace.paneContainerForURI(uri)).toBe(
        chevron.workspace.getCenter()
      );

      chevron.workspace.getActivePane().destroyActiveItem();
      chevron.workspace
        .getLeftDock()
        .getActivePane()
        .activateItem(item);
      expect(chevron.workspace.paneForItem(item)).toBe(
        chevron.workspace.getLeftDock().getActivePane()
      );
      expect(chevron.workspace.paneContainerForItem(item)).toBe(
        chevron.workspace.getLeftDock()
      );
      expect(chevron.workspace.paneForURI(uri)).toBe(
        chevron.workspace.getLeftDock().getActivePane()
      );
      expect(chevron.workspace.paneContainerForURI(uri)).toBe(
        chevron.workspace.getLeftDock()
      );
    });
  });

  describe('::hide(uri)', () => {
    let item;
    const URI = 'chevron://hide-test';

    beforeEach(() => {
      const el = document.createElement('div');
      item = {
        getTitle: () => 'Item',
        getElement: () => el,
        getURI: () => URI
      };
    });

    describe('when called with a URI', () => {
      it('if the item for the given URI is in the center, removes it', () => {
        const pane = chevron.workspace.getActivePane();
        pane.addItem(item);
        chevron.workspace.hide(URI);
        expect(pane.getItems().length).toBe(0);
      });

      it('if the item for the given URI is in a dock, hides the dock', () => {
        const dock = chevron.workspace.getLeftDock();
        const pane = dock.getActivePane();
        pane.addItem(item);
        dock.activate();
        expect(dock.isVisible()).toBe(true);
        const itemFound = chevron.workspace.hide(URI);
        expect(itemFound).toBe(true);
        expect(dock.isVisible()).toBe(false);
      });
    });

    describe('when called with an item', () => {
      it('if the item is in the center, removes it', () => {
        const pane = chevron.workspace.getActivePane();
        pane.addItem(item);
        chevron.workspace.hide(item);
        expect(pane.getItems().length).toBe(0);
      });

      it('if the item is in a dock, hides the dock', () => {
        const dock = chevron.workspace.getLeftDock();
        const pane = dock.getActivePane();
        pane.addItem(item);
        dock.activate();
        expect(dock.isVisible()).toBe(true);
        const itemFound = chevron.workspace.hide(item);
        expect(itemFound).toBe(true);
        expect(dock.isVisible()).toBe(false);
      });
    });
  });

  describe('::toggle(itemOrUri)', () => {
    describe('when the location resolves to a dock', () => {
      it('adds or shows the item and its dock if it is not currently visible, and otherwise hides the containing dock', async () => {
        const item1 = {
          getDefaultLocation() {
            return 'left';
          },
          getElement() {
            return (this.element = document.createElement('div'));
          }
        };

        const item2 = {
          getDefaultLocation() {
            return 'left';
          },
          getElement() {
            return (this.element = document.createElement('div'));
          }
        };

        const dock = workspace.getLeftDock();
        expect(dock.isVisible()).toBe(false);

        await workspace.toggle(item1);
        expect(dock.isVisible()).toBe(true);
        expect(dock.getActivePaneItem()).toBe(item1);

        await workspace.toggle(item2);
        expect(dock.isVisible()).toBe(true);
        expect(dock.getActivePaneItem()).toBe(item2);

        await workspace.toggle(item1);
        expect(dock.isVisible()).toBe(true);
        expect(dock.getActivePaneItem()).toBe(item1);

        await workspace.toggle(item1);
        expect(dock.isVisible()).toBe(false);
        expect(dock.getActivePaneItem()).toBe(item1);

        await workspace.toggle(item2);
        expect(dock.isVisible()).toBe(true);
        expect(dock.getActivePaneItem()).toBe(item2);
      });
    });

    describe('when the location resolves to the center', () => {
      it('adds or shows the item if it is not currently the active pane item, and otherwise removes the item', async () => {
        const item1 = {
          getDefaultLocation() {
            return 'center';
          },
          getElement() {
            return (this.element = document.createElement('div'));
          }
        };

        const item2 = {
          getDefaultLocation() {
            return 'center';
          },
          getElement() {
            return (this.element = document.createElement('div'));
          }
        };

        expect(workspace.getActivePaneItem()).toBeUndefined();
        await workspace.toggle(item1);
        expect(workspace.getActivePaneItem()).toBe(item1);
        await workspace.toggle(item2);
        expect(workspace.getActivePaneItem()).toBe(item2);
        await workspace.toggle(item1);
        expect(workspace.getActivePaneItem()).toBe(item1);
        await workspace.toggle(item1);
        expect(workspace.paneForItem(item1)).toBeUndefined();
        expect(workspace.getActivePaneItem()).toBe(item2);
      });
    });
  });

  describe('active pane containers', () => {
    it('maintains the active pane and item globally across active pane containers', () => {
      const leftDock = workspace.getLeftDock();
      const leftItem1 = { element: document.createElement('div') };
      const leftItem2 = { element: document.createElement('div') };
      const leftItem3 = { element: document.createElement('div') };
      const leftPane1 = leftDock.getActivePane();
      leftPane1.addItems([leftItem1, leftItem2]);
      const leftPane2 = leftPane1.splitDown({ items: [leftItem3] });

      const rightDock = workspace.getRightDock();
      const rightItem1 = { element: document.createElement('div') };
      const rightItem2 = { element: document.createElement('div') };
      const rightItem3 = { element: document.createElement('div') };
      const rightPane1 = rightDock.getActivePane();
      rightPane1.addItems([rightItem1, rightItem2]);
      const rightPane2 = rightPane1.splitDown({ items: [rightItem3] });

      const bottomDock = workspace.getBottomDock();
      const bottomItem1 = { element: document.createElement('div') };
      const bottomItem2 = { element: document.createElement('div') };
      const bottomItem3 = { element: document.createElement('div') };
      const bottomPane1 = bottomDock.getActivePane();
      bottomPane1.addItems([bottomItem1, bottomItem2]);
      const bottomPane2 = bottomPane1.splitDown({ items: [bottomItem3] });

      const center = workspace.getCenter();
      const centerItem1 = { element: document.createElement('div') };
      const centerItem2 = { element: document.createElement('div') };
      const centerItem3 = { element: document.createElement('div') };
      const centerPane1 = center.getActivePane();
      centerPane1.addItems([centerItem1, centerItem2]);
      const centerPane2 = centerPane1.splitDown({ items: [centerItem3] });

      const activePaneContainers = [];
      const activePanes = [];
      const activeItems = [];
      workspace.onDidChangeActivePaneContainer(container =>
        activePaneContainers.push(container)
      );
      workspace.onDidChangeActivePane(pane => activePanes.push(pane));
      workspace.onDidChangeActivePaneItem(item => activeItems.push(item));
      function clearEvents() {
        activePaneContainers.length = 0;
        activePanes.length = 0;
        activeItems.length = 0;
      }

      expect(workspace.getActivePaneContainer()).toBe(center);
      expect(workspace.getActivePane()).toBe(centerPane2);
      expect(workspace.getActivePaneItem()).toBe(centerItem3);

      leftDock.activate();
      expect(workspace.getActivePaneContainer()).toBe(leftDock);
      expect(workspace.getActivePane()).toBe(leftPane2);
      expect(workspace.getActivePaneItem()).toBe(leftItem3);
      expect(activePaneContainers).toEqual([leftDock]);
      expect(activePanes).toEqual([leftPane2]);
      expect(activeItems).toEqual([leftItem3]);

      clearEvents();
      leftPane1.activate();
      leftPane1.activate();
      expect(workspace.getActivePaneContainer()).toBe(leftDock);
      expect(workspace.getActivePane()).toBe(leftPane1);
      expect(workspace.getActivePaneItem()).toBe(leftItem1);
      expect(activePaneContainers).toEqual([]);
      expect(activePanes).toEqual([leftPane1]);
      expect(activeItems).toEqual([leftItem1]);

      clearEvents();
      leftPane1.activateItem(leftItem2);
      leftPane1.activateItem(leftItem2);
      expect(workspace.getActivePaneContainer()).toBe(leftDock);
      expect(workspace.getActivePane()).toBe(leftPane1);
      expect(workspace.getActivePaneItem()).toBe(leftItem2);
      expect(activePaneContainers).toEqual([]);
      expect(activePanes).toEqual([]);
      expect(activeItems).toEqual([leftItem2]);

      clearEvents();
      expect(rightDock.getActivePane()).toBe(rightPane2);
      rightPane1.activate();
      rightPane1.activate();
      expect(workspace.getActivePaneContainer()).toBe(rightDock);
      expect(workspace.getActivePane()).toBe(rightPane1);
      expect(workspace.getActivePaneItem()).toBe(rightItem1);
      expect(activePaneContainers).toEqual([rightDock]);
      expect(activePanes).toEqual([rightPane1]);
      expect(activeItems).toEqual([rightItem1]);

      clearEvents();
      rightPane1.activateItem(rightItem2);
      expect(workspace.getActivePaneContainer()).toBe(rightDock);
      expect(workspace.getActivePane()).toBe(rightPane1);
      expect(workspace.getActivePaneItem()).toBe(rightItem2);
      expect(activePaneContainers).toEqual([]);
      expect(activePanes).toEqual([]);
      expect(activeItems).toEqual([rightItem2]);

      clearEvents();
      expect(bottomDock.getActivePane()).toBe(bottomPane2);
      bottomPane2.activate();
      bottomPane2.activate();
      expect(workspace.getActivePaneContainer()).toBe(bottomDock);
      expect(workspace.getActivePane()).toBe(bottomPane2);
      expect(workspace.getActivePaneItem()).toBe(bottomItem3);
      expect(activePaneContainers).toEqual([bottomDock]);
      expect(activePanes).toEqual([bottomPane2]);
      expect(activeItems).toEqual([bottomItem3]);

      clearEvents();
      center.activate();
      center.activate();
      expect(workspace.getActivePaneContainer()).toBe(center);
      expect(workspace.getActivePane()).toBe(centerPane2);
      expect(workspace.getActivePaneItem()).toBe(centerItem3);
      expect(activePaneContainers).toEqual([center]);
      expect(activePanes).toEqual([centerPane2]);
      expect(activeItems).toEqual([centerItem3]);

      clearEvents();
      centerPane1.activate();
      centerPane1.activate();
      expect(workspace.getActivePaneContainer()).toBe(center);
      expect(workspace.getActivePane()).toBe(centerPane1);
      expect(workspace.getActivePaneItem()).toBe(centerItem1);
      expect(activePaneContainers).toEqual([]);
      expect(activePanes).toEqual([centerPane1]);
      expect(activeItems).toEqual([centerItem1]);
    });
  });

  describe('::onDidStopChangingActivePaneItem()', () => {
    it('invokes observers when the active item of the active pane stops changing', () => {
      const pane1 = chevron.workspace.getCenter().getActivePane();
      const pane2 = pane1.splitRight({
        items: [document.createElement('div'), document.createElement('div')]
      });
      chevron.workspace
        .getLeftDock()
        .getActivePane()
        .addItem(document.createElement('div'));

      const emittedItems = [];
      chevron.workspace.onDidStopChangingActivePaneItem(item =>
        emittedItems.push(item)
      );

      pane2.activateNextItem();
      pane2.activateNextItem();
      pane1.activate();
      chevron.workspace.getLeftDock().activate();

      advanceClock(100);
      expect(emittedItems).toEqual([
        chevron.workspace.getLeftDock().getActivePaneItem()
      ]);
    });
  });

  describe('the grammar-used hook', () => {
    it('fires when opening a file or changing the grammar of an open file', async () => {
      await chevron.packages.activatePackage('language-javascript');
      await chevron.packages.activatePackage('language-json');

      const observeTextEditorsSpy = jasmine.createSpy('observeTextEditors');
      const javascriptGrammarUsed = jasmine.createSpy('javascript');
      const jsonGrammarUsed = jasmine.createSpy('json');

      chevron.packages.triggerDeferredActivationHooks();
      chevron.packages.onDidTriggerActivationHook(
        'language-javascript:grammar-used',
        () => {
          chevron.workspace.observeTextEditors(observeTextEditorsSpy);
          javascriptGrammarUsed();
        }
      );
      chevron.packages.onDidTriggerActivationHook(
        'language-json:grammar-used',
        jsonGrammarUsed
      );

      expect(javascriptGrammarUsed).not.toHaveBeenCalled();
      expect(observeTextEditorsSpy).not.toHaveBeenCalled();
      const editor = await chevron.workspace.open('sample.js', {
        autoIndent: false
      });
      expect(javascriptGrammarUsed).toHaveBeenCalled();
      expect(observeTextEditorsSpy.callCount).toBe(1);

      expect(jsonGrammarUsed).not.toHaveBeenCalled();
      chevron.grammars.assignLanguageMode(editor, 'source.json');
      expect(jsonGrammarUsed).toHaveBeenCalled();
    });
  });

  describe('the root-scope-used hook', () => {
    it('fires when opening a file or changing the grammar of an open file', async () => {
      await chevron.packages.activatePackage('language-javascript');
      await chevron.packages.activatePackage('language-json');

      const observeTextEditorsSpy = jasmine.createSpy('observeTextEditors');
      const javascriptGrammarUsed = jasmine.createSpy('javascript');
      const jsonGrammarUsed = jasmine.createSpy('json');

      chevron.packages.triggerDeferredActivationHooks();
      chevron.packages.onDidTriggerActivationHook(
        'source.js:root-scope-used',
        () => {
          chevron.workspace.observeTextEditors(observeTextEditorsSpy);
          javascriptGrammarUsed();
        }
      );
      chevron.packages.onDidTriggerActivationHook(
        'source.json:root-scope-used',
        jsonGrammarUsed
      );

      expect(javascriptGrammarUsed).not.toHaveBeenCalled();
      expect(observeTextEditorsSpy).not.toHaveBeenCalled();
      const editor = await chevron.workspace.open('sample.js', {
        autoIndent: false
      });
      expect(javascriptGrammarUsed).toHaveBeenCalled();
      expect(observeTextEditorsSpy.callCount).toBe(1);

      expect(jsonGrammarUsed).not.toHaveBeenCalled();
      chevron.grammars.assignLanguageMode(editor, 'source.json');
      expect(jsonGrammarUsed).toHaveBeenCalled();
    });
  });

  describe('::reopenItem()', () => {
    it("opens the uri associated with the last closed pane that isn't currently open", async () => {
      const pane = workspace.getActivePane();
      await workspace
          .open('a')
          .then(() =>
            workspace
              .open('b')
              .then(() => workspace.open('file1').then(() => workspace.open()))
          );
      expect(workspace.getActivePaneItem().getURI()).toBeUndefined();
      pane.destroyActiveItem();
      await workspace.reopenItem();
      const firstDirectory = chevron.project.getDirectories()[0];
      expect(firstDirectory).toBeDefined();
      expect(workspace.getActivePaneItem().getURI()).not.toBeUndefined();
      expect(workspace.getActivePaneItem().getURI()).toBe(
        firstDirectory.resolve('file1')
      );
      pane.destroyActiveItem();
      expect(workspace.getActivePaneItem().getURI()).toBe(
        firstDirectory.resolve('b')
      );
      pane.destroyActiveItem();
      expect(workspace.getActivePaneItem().getURI()).toBe(
        firstDirectory.resolve('a')
      );
      pane.destroyActiveItem();
      expect(workspace.getActivePaneItem()).toBeUndefined();
      await workspace.reopenItem();
      expect(workspace.getActivePaneItem().getURI()).toBe(
                firstDirectory.resolve('a')
              );
      await workspace.open('b');
      expect(workspace.getActivePaneItem().getURI()).toBe(
                firstDirectory.resolve('b')
              );
      await workspace.reopenItem();
      expect(workspace.getActivePaneItem().getURI()).toBe(
                firstDirectory.resolve('file1')
              );
    });
  });

  describe('::increase/decreaseFontSize()', () => {
    it('increases/decreases the font size without going below 1', () => {
      chevron.config.set('editor.fontSize', 1);
      workspace.increaseFontSize();
      expect(chevron.config.get('editor.fontSize')).toBe(2);
      workspace.increaseFontSize();
      expect(chevron.config.get('editor.fontSize')).toBe(3);
      workspace.decreaseFontSize();
      expect(chevron.config.get('editor.fontSize')).toBe(2);
      workspace.decreaseFontSize();
      expect(chevron.config.get('editor.fontSize')).toBe(1);
      workspace.decreaseFontSize();
      expect(chevron.config.get('editor.fontSize')).toBe(1);
    });
  });

  describe('::resetFontSize()', () => {
    it("resets the font size to the window's default font size", () => {
      const defaultFontSize = chevron.config.get('editor.defaultFontSize');

      workspace.increaseFontSize();
      expect(chevron.config.get('editor.fontSize')).toBe(defaultFontSize + 1);
      workspace.resetFontSize();
      expect(chevron.config.get('editor.fontSize')).toBe(defaultFontSize);
      workspace.decreaseFontSize();
      expect(chevron.config.get('editor.fontSize')).toBe(defaultFontSize - 1);
      workspace.resetFontSize();
      expect(chevron.config.get('editor.fontSize')).toBe(defaultFontSize);
    });

    it('resets the font size the default font size when it is changed', () => {
      const defaultFontSize = chevron.config.get('editor.defaultFontSize');
      workspace.increaseFontSize();
      expect(chevron.config.get('editor.fontSize')).toBe(defaultFontSize + 1);
      chevron.config.set('editor.defaultFontSize', 14);
      workspace.resetFontSize();
      expect(chevron.config.get('editor.fontSize')).toBe(14);
    });

    it('does nothing if the font size has not been changed', () => {
      const originalFontSize = chevron.config.get('editor.fontSize');

      workspace.resetFontSize();
      expect(chevron.config.get('editor.fontSize')).toBe(originalFontSize);
    });

    it("resets the font size when the editor's font size changes", () => {
      const originalFontSize = chevron.config.get('editor.fontSize');

      chevron.config.set('editor.fontSize', originalFontSize + 1);
      workspace.resetFontSize();
      expect(chevron.config.get('editor.fontSize')).toBe(originalFontSize);
      chevron.config.set('editor.fontSize', originalFontSize - 1);
      workspace.resetFontSize();
      expect(chevron.config.get('editor.fontSize')).toBe(originalFontSize);
    });
  });

  describe('::openLicense()', () => {
    it('opens the license as plain-text in a buffer', async () => {
      await workspace.openLicense();
      expect(workspace.getActivePaneItem().getText()).toMatch(/Copyright/);
    });
  });

  describe('::isTextEditor(obj)', () => {
    it('returns true when the passed object is an instance of `TextEditor`', () => {
      expect(workspace.isTextEditor(new TextEditor())).toBe(true);
      expect(workspace.isTextEditor({ getText: () => null })).toBe(false);
      expect(workspace.isTextEditor(null)).toBe(false);
      expect(workspace.isTextEditor(undefined)).toBe(false);
    });
  });

  describe('::getActiveTextEditor()', () => {
    describe("when the workspace center's active pane item is a text editor", () => {
      describe('when the workspace center has focus', () => {
        it('returns the text editor', () => {
          const workspaceCenter = workspace.getCenter();
          const editor = new TextEditor();
          workspaceCenter.getActivePane().activateItem(editor);
          workspaceCenter.activate();

          expect(workspace.getActiveTextEditor()).toBe(editor);
        });
      });

      describe('when a dock has focus', () => {
        it('returns the text editor', () => {
          const workspaceCenter = workspace.getCenter();
          const editor = new TextEditor();
          workspaceCenter.getActivePane().activateItem(editor);
          workspace.getLeftDock().activate();

          expect(workspace.getActiveTextEditor()).toBe(editor);
        });
      });
    });

    describe("when the workspace center's active pane item is not a text editor", () => {
      it('returns undefined', () => {
        const workspaceCenter = workspace.getCenter();
        const nonEditorItem = document.createElement('div');
        workspaceCenter.getActivePane().activateItem(nonEditorItem);

        expect(workspace.getActiveTextEditor()).toBeUndefined();
      });
    });
  });

  describe('::observeTextEditors()', () => {
    it('invokes the observer with current and future text editors', async () => {
      const observed = [];
      await workspace.open();
      await workspace.open();
      await workspace.openLicense();
      workspace.observeTextEditors(editor => observed.push(editor));
      await workspace.open();
      expect(observed).toEqual(workspace.getTextEditors());
    });
  });

  describe('::observeActiveTextEditor()', () => {
    it('invokes the observer with current active text editor and each time a different text editor becomes active', () => {
      const pane = workspace.getCenter().getActivePane();
      const observed = [];

      const inactiveEditorBeforeRegisteringObserver = new TextEditor();
      const activeEditorBeforeRegisteringObserver = new TextEditor();
      pane.activateItem(inactiveEditorBeforeRegisteringObserver);
      pane.activateItem(activeEditorBeforeRegisteringObserver);

      workspace.observeActiveTextEditor(editor => observed.push(editor));

      const editorAddedAfterRegisteringObserver = new TextEditor();
      pane.activateItem(editorAddedAfterRegisteringObserver);

      expect(observed).toEqual([
        activeEditorBeforeRegisteringObserver,
        editorAddedAfterRegisteringObserver
      ]);
    });
  });

  describe('::onDidChangeActiveTextEditor()', () => {
    let center, pane, observed;

    beforeEach(() => {
      center = workspace.getCenter();
      pane = center.getActivePane();
      observed = [];
    });

    it("invokes the observer when a text editor becomes the workspace center's active pane item while a dock has focus", () => {
      workspace.onDidChangeActiveTextEditor(editor => observed.push(editor));

      const dock = workspace.getLeftDock();
      dock.activate();
      expect(chevron.workspace.getActivePaneContainer()).toBe(dock);

      const editor = new TextEditor();
      center.getActivePane().activateItem(editor);
      expect(chevron.workspace.getActivePaneContainer()).toBe(dock);

      expect(observed).toEqual([editor]);
    });

    it('invokes the observer when the last text editor is closed', () => {
      const editor = new TextEditor();
      pane.activateItem(editor);

      workspace.onDidChangeActiveTextEditor(editor => observed.push(editor));
      pane.destroyItem(editor);
      expect(observed).toEqual([undefined]);
    });

    it("invokes the observer when the workspace center's active pane item changes from an editor item to a non-editor item", () => {
      const editor = new TextEditor();
      const nonEditorItem = document.createElement('div');
      pane.activateItem(editor);

      workspace.onDidChangeActiveTextEditor(editor => observed.push(editor));
      pane.activateItem(nonEditorItem);
      expect(observed).toEqual([undefined]);
    });

    it("does not invoke the observer when the workspace center's active pane item changes from a non-editor item to another non-editor item", () => {
      workspace.onDidChangeActiveTextEditor(editor => observed.push(editor));

      const nonEditorItem1 = document.createElement('div');
      const nonEditorItem2 = document.createElement('div');
      pane.activateItem(nonEditorItem1);
      pane.activateItem(nonEditorItem2);

      expect(observed).toEqual([]);
    });

    it('invokes the observer when closing the one and only text editor after deserialization', async () => {
      pane.activateItem(new TextEditor());
      await simulateReload();
      workspace.onDidChangeActiveTextEditor(editor => observed.push(editor));
      workspace.closeActivePaneItemOrEmptyPaneOrWindow();
      expect(observed).toEqual([undefined]);
    });
  });

  describe('when an editor is destroyed', () => {
    it('removes the editor', async () => {
      const editor = await workspace.open('a');
      expect(workspace.getTextEditors()).toHaveLength(1);
      editor.destroy();
      expect(workspace.getTextEditors()).toHaveLength(0);
    });
  });

  describe('when an editor is copied because its pane is split', () => {
    it('sets up the new editor to be configured by the text editor registry', async () => {
      await chevron.packages.activatePackage('language-javascript');

      const editor = await workspace.open('a');

      chevron.grammars.assignLanguageMode(editor, 'source.js');
      expect(editor.getGrammar().name).toBe('JavaScript');

      workspace.getActivePane().splitRight({ copyActiveItem: true });
      const newEditor = workspace.getActiveTextEditor();
      expect(newEditor).not.toBe(editor);
      expect(newEditor.getGrammar().name).toBe('JavaScript');
    });
  });

  it('stores the active grammars used by all the open editors', async () => {
    await chevron.packages.activatePackage('language-javascript');
    await chevron.packages.activatePackage('language-json');
    await chevron.workspace.open('sample.js');

    const atom2 = new ChevronEnvironment({
      applicationDelegate: chevron.applicationDelegate
    });
    atom2.initialize({
      window: document.createElement('div'),
      document: Object.assign(document.createElement('div'), {
        body: document.createElement('div'),
        head: document.createElement('div')
      })
    });

    atom2.packages.loadPackage('language-javascript');
    atom2.packages.loadPackage('language-json');
    atom2.project.deserialize(chevron.project.serialize());
    atom2.workspace.deserialize(chevron.workspace.serialize(), atom2.deserializers);

    const scopeNames = atom2.grammars
      .getGrammars()
      .map(grammar => grammar.scopeName);
    expect(scopeNames).toContain('source.js');
    expect(scopeNames).not.toContain('source.json');

    atom2.destroy();
  });

  describe('document.title', () => {
    describe('when there is no item open', () => {
      it('sets the title to the project path', () =>
        expect(document.title).toMatch(
          escapeStringRegex(fs.tildify(chevron.project.getPaths()[0]))
        ));

      it("sets the title to 'untitled' if there is no project path", () => {
        chevron.project.setPaths([]);
        expect(document.title).toMatch(/^untitled/);
      });
    });

    describe("when the active pane item's path is not inside a project path", () => {
      beforeEach(async () =>
        {
  await chevron.workspace.open('b').then(() => chevron.project.setPaths([]));
}
      );

      it("sets the title to the pane item's title plus the item's path", () => {
        const item = chevron.workspace.getActivePaneItem();
        const pathEscaped = fs.tildify(
          escapeStringRegex(path.dirname(item.getPath()))
        );
        expect(document.title).toMatch(
          new RegExp(`^${item.getTitle()} \\u2014 ${pathEscaped}`)
        );
      });

      describe('when the title of the active pane item changes', () => {
        it("updates the window title based on the item's new title", () => {
          const editor = chevron.workspace.getActivePaneItem();
          editor.buffer.setPath(path.join(temp.dir, 'hi'));
          const pathEscaped = fs.tildify(
            escapeStringRegex(path.dirname(editor.getPath()))
          );
          expect(document.title).toMatch(
            new RegExp(`^${editor.getTitle()} \\u2014 ${pathEscaped}`)
          );
        });
      });

      describe("when the active pane's item changes", () => {
        it("updates the title to the new item's title plus the project path", () => {
          chevron.workspace.getActivePane().activateNextItem();
          const item = chevron.workspace.getActivePaneItem();
          const pathEscaped = fs.tildify(
            escapeStringRegex(path.dirname(item.getPath()))
          );
          expect(document.title).toMatch(
            new RegExp(`^${item.getTitle()} \\u2014 ${pathEscaped}`)
          );
        });
      });

      describe("when an inactive pane's item changes", () => {
        it('does not update the title', () => {
          const pane = chevron.workspace.getActivePane();
          pane.splitRight();
          const initialTitle = document.title;
          pane.activateNextItem();
          expect(document.title).toBe(initialTitle);
        });
      });
    });

    describe('when the active pane item is inside a project path', () => {
      beforeEach(async () => {
  await chevron.workspace.open('b');
});

      describe('when there is an active pane item', () => {
        it("sets the title to the pane item's title plus the project path", () => {
          const item = chevron.workspace.getActivePaneItem();
          const pathEscaped = fs.tildify(
            escapeStringRegex(chevron.project.getPaths()[0])
          );
          expect(document.title).toMatch(
            new RegExp(`^${item.getTitle()} \\u2014 ${pathEscaped}`)
          );
        });
      });

      describe('when the title of the active pane item changes', () => {
        it("updates the window title based on the item's new title", () => {
          const editor = chevron.workspace.getActivePaneItem();
          editor.buffer.setPath(path.join(chevron.project.getPaths()[0], 'hi'));
          const pathEscaped = fs.tildify(
            escapeStringRegex(chevron.project.getPaths()[0])
          );
          expect(document.title).toMatch(
            new RegExp(`^${editor.getTitle()} \\u2014 ${pathEscaped}`)
          );
        });
      });

      describe("when the active pane's item changes", () => {
        it("updates the title to the new item's title plus the project path", () => {
          chevron.workspace.getActivePane().activateNextItem();
          const item = chevron.workspace.getActivePaneItem();
          const pathEscaped = fs.tildify(
            escapeStringRegex(chevron.project.getPaths()[0])
          );
          expect(document.title).toMatch(
            new RegExp(`^${item.getTitle()} \\u2014 ${pathEscaped}`)
          );
        });
      });

      describe('when the last pane item is removed', () => {
        it("updates the title to the project's first path", () => {
          chevron.workspace.getActivePane().destroy();
          expect(chevron.workspace.getActivePaneItem()).toBeUndefined();
          expect(document.title).toMatch(
            escapeStringRegex(fs.tildify(chevron.project.getPaths()[0]))
          );
        });
      });

      describe("when an inactive pane's item changes", () => {
        it('does not update the title', () => {
          const pane = chevron.workspace.getActivePane();
          pane.splitRight();
          const initialTitle = document.title;
          pane.activateNextItem();
          expect(document.title).toBe(initialTitle);
        });
      });
    });

    describe('when the workspace is deserialized', () => {
      beforeEach(async () => {
  await chevron.workspace.open('a');
});

      it("updates the title to contain the project's path", async () => {
        document.title = null;
        const atom2 = new ChevronEnvironment({
          applicationDelegate: chevron.applicationDelegate
        });
        atom2.initialize({
          window: document.createElement('div'),
          document: Object.assign(document.createElement('div'), {
            body: document.createElement('div'),
            head: document.createElement('div')
          })
        });
        await atom2.project.deserialize(chevron.project.serialize());
        atom2.workspace.deserialize(
          chevron.workspace.serialize(),
          atom2.deserializers
        );
        const item = atom2.workspace.getActivePaneItem();
        const pathEscaped = fs.tildify(
          escapeStringRegex(chevron.project.getPaths()[0])
        );
        expect(document.title).toMatch(
          new RegExp(`^${item.getLongTitle()} \\u2014 ${pathEscaped}`)
        );
        atom2.destroy();
      });
    });
  });

  describe('document edited status', () => {
    let item1;
    let item2;

    beforeEach(async () => {
      await chevron.workspace.open('a');
      await chevron.workspace.open('b');
      [item1, item2] = chevron.workspace.getPaneItems();
    });

    it('calls setDocumentEdited when the active item changes', () => {
      expect(chevron.workspace.getActivePaneItem()).toBe(item2);
      item1.insertText('a');
      expect(item1.isModified()).toBe(true);
      chevron.workspace.getActivePane().activateNextItem();

      expect(setDocumentEdited).toHaveBeenCalledWith(true);
    });

    it("calls atom.setDocumentEdited when the active item's modified status changes", () => {
      expect(chevron.workspace.getActivePaneItem()).toBe(item2);
      item2.insertText('a');
      advanceClock(item2.getBuffer().getStoppedChangingDelay());

      expect(item2.isModified()).toBe(true);
      expect(setDocumentEdited).toHaveBeenCalledWith(true);

      item2.undo();
      advanceClock(item2.getBuffer().getStoppedChangingDelay());

      expect(item2.isModified()).toBe(false);
      expect(setDocumentEdited).toHaveBeenCalledWith(false);
    });
  });

  describe('adding panels', () => {
    class TestItem {}

    // Don't use ES6 classes because then we'll have to call `super()` which we can't do with
    // HTMLElement
    function TestItemElement() {
      this.constructor = TestItemElement;
    }
    function Ctor() {
      this.constructor = TestItemElement;
    }
    Ctor.prototype = HTMLElement.prototype;
    TestItemElement.prototype = new Ctor();
    TestItemElement.__super__ = HTMLElement.prototype;
    TestItemElement.prototype.initialize = function(model) {
      this.model = model;
      return this;
    };
    TestItemElement.prototype.getModel = function() {
      return this.model;
    };

    beforeEach(() =>
      chevron.views.addViewProvider(TestItem, model =>
        new TestItemElement().initialize(model)
      )
    );

    describe('::addLeftPanel(model)', () => {
      it('adds a panel to the correct panel container', () => {
        let addPanelSpy;
        expect(chevron.workspace.getLeftPanels().length).toBe(0);
        chevron.workspace.panelContainers.left.onDidAddPanel(
          (addPanelSpy = jasmine.createSpy())
        );

        const model = new TestItem();
        const panel = chevron.workspace.addLeftPanel({ item: model });

        expect(panel).toBeDefined();
        expect(addPanelSpy).toHaveBeenCalledWith({ panel, index: 0 });

        const itemView = chevron.views.getView(
          chevron.workspace.getLeftPanels()[0].getItem()
        );
        expect(itemView instanceof TestItemElement).toBe(true);
        expect(itemView.getModel()).toBe(model);
      });
    });

    describe('::addRightPanel(model)', () => {
      it('adds a panel to the correct panel container', () => {
        let addPanelSpy;
        expect(chevron.workspace.getRightPanels().length).toBe(0);
        chevron.workspace.panelContainers.right.onDidAddPanel(
          (addPanelSpy = jasmine.createSpy())
        );

        const model = new TestItem();
        const panel = chevron.workspace.addRightPanel({ item: model });

        expect(panel).toBeDefined();
        expect(addPanelSpy).toHaveBeenCalledWith({ panel, index: 0 });

        const itemView = chevron.views.getView(
          chevron.workspace.getRightPanels()[0].getItem()
        );
        expect(itemView instanceof TestItemElement).toBe(true);
        expect(itemView.getModel()).toBe(model);
      });
    });

    describe('::addTopPanel(model)', () => {
      it('adds a panel to the correct panel container', () => {
        let addPanelSpy;
        expect(chevron.workspace.getTopPanels().length).toBe(0);
        chevron.workspace.panelContainers.top.onDidAddPanel(
          (addPanelSpy = jasmine.createSpy())
        );

        const model = new TestItem();
        const panel = chevron.workspace.addTopPanel({ item: model });

        expect(panel).toBeDefined();
        expect(addPanelSpy).toHaveBeenCalledWith({ panel, index: 0 });

        const itemView = chevron.views.getView(
          chevron.workspace.getTopPanels()[0].getItem()
        );
        expect(itemView instanceof TestItemElement).toBe(true);
        expect(itemView.getModel()).toBe(model);
      });
    });

    describe('::addBottomPanel(model)', () => {
      it('adds a panel to the correct panel container', () => {
        let addPanelSpy;
        expect(chevron.workspace.getBottomPanels().length).toBe(0);
        chevron.workspace.panelContainers.bottom.onDidAddPanel(
          (addPanelSpy = jasmine.createSpy())
        );

        const model = new TestItem();
        const panel = chevron.workspace.addBottomPanel({ item: model });

        expect(panel).toBeDefined();
        expect(addPanelSpy).toHaveBeenCalledWith({ panel, index: 0 });

        const itemView = chevron.views.getView(
          chevron.workspace.getBottomPanels()[0].getItem()
        );
        expect(itemView instanceof TestItemElement).toBe(true);
        expect(itemView.getModel()).toBe(model);
      });
    });

    describe('::addHeaderPanel(model)', () => {
      it('adds a panel to the correct panel container', () => {
        let addPanelSpy;
        expect(chevron.workspace.getHeaderPanels().length).toBe(0);
        chevron.workspace.panelContainers.header.onDidAddPanel(
          (addPanelSpy = jasmine.createSpy())
        );

        const model = new TestItem();
        const panel = chevron.workspace.addHeaderPanel({ item: model });

        expect(panel).toBeDefined();
        expect(addPanelSpy).toHaveBeenCalledWith({ panel, index: 0 });

        const itemView = chevron.views.getView(
          chevron.workspace.getHeaderPanels()[0].getItem()
        );
        expect(itemView instanceof TestItemElement).toBe(true);
        expect(itemView.getModel()).toBe(model);
      });
    });

    describe('::addFooterPanel(model)', () => {
      it('adds a panel to the correct panel container', () => {
        let addPanelSpy;
        expect(chevron.workspace.getFooterPanels().length).toBe(0);
        chevron.workspace.panelContainers.footer.onDidAddPanel(
          (addPanelSpy = jasmine.createSpy())
        );

        const model = new TestItem();
        const panel = chevron.workspace.addFooterPanel({ item: model });

        expect(panel).toBeDefined();
        expect(addPanelSpy).toHaveBeenCalledWith({ panel, index: 0 });

        const itemView = chevron.views.getView(
          chevron.workspace.getFooterPanels()[0].getItem()
        );
        expect(itemView instanceof TestItemElement).toBe(true);
        expect(itemView.getModel()).toBe(model);
      });
    });

    describe('::addModalPanel(model)', () => {
      it('adds a panel to the correct panel container', () => {
        let addPanelSpy;
        expect(chevron.workspace.getModalPanels().length).toBe(0);
        chevron.workspace.panelContainers.modal.onDidAddPanel(
          (addPanelSpy = jasmine.createSpy())
        );

        const model = new TestItem();
        const panel = chevron.workspace.addModalPanel({ item: model });

        expect(panel).toBeDefined();
        expect(addPanelSpy).toHaveBeenCalledWith({ panel, index: 0 });

        const itemView = chevron.views.getView(
          chevron.workspace.getModalPanels()[0].getItem()
        );
        expect(itemView instanceof TestItemElement).toBe(true);
        expect(itemView.getModel()).toBe(model);
      });
    });

    describe('::panelForItem(item)', () => {
      it('returns the panel associated with the item', () => {
        const item = new TestItem();
        const panel = chevron.workspace.addLeftPanel({ item });

        const itemWithNoPanel = new TestItem();

        expect(chevron.workspace.panelForItem(item)).toBe(panel);
        expect(chevron.workspace.panelForItem(itemWithNoPanel)).toBe(null);
      });
    });
  });

  for (const ripgrep of [true, false]) {
    describe(`::scan(regex, options, callback) { ripgrep: ${ripgrep} }`, () => {
      function scan(regex, options, iterator) {
        return chevron.workspace.scan(regex, { ...options, ripgrep }, iterator);
      }

      describe('when called with a regex', () => {
        it('calls the callback with all regex results in all files in the project', async () => {
          const results = [];
          await scan(
            /(a)+/,
            { leadingContextLineCount: 1, trailingContextLineCount: 1 },
            result => results.push(result)
          );

          results.sort((a, b) => a.filePath.localeCompare(b.filePath));

          expect(results.length).toBeGreaterThan(0);
          expect(results[0].filePath).toBe(
            chevron.project.getDirectories()[0].resolve('a')
          );
          expect(results[0].matches).toHaveLength(3);
          expect(results[0].matches[0]).toEqual({
            matchText: 'aaa',
            lineText: 'aaa bbb',
            lineTextOffset: 0,
            range: [[0, 0], [0, 3]],
            leadingContextLines: [],
            trailingContextLines: ['cc aa cc']
          });
        });

        it('works with with escaped literals (like $ and ^)', async () => {
          const results = [];
          await scan(
            /\$\w+/,
            { leadingContextLineCount: 1, trailingContextLineCount: 1 },
            result => results.push(result)
          );

          expect(results.length).toBe(1);
          const { filePath, matches } = results[0];
          expect(filePath).toBe(chevron.project.getDirectories()[0].resolve('a'));
          expect(matches).toHaveLength(1);
          expect(matches[0]).toEqual({
            matchText: '$bill',
            lineText: 'dollar$bill',
            lineTextOffset: 0,
            range: [[2, 6], [2, 11]],
            leadingContextLines: ['cc aa cc'],
            trailingContextLines: []
          });
        });

        it('works on evil filenames', async () => {
          chevron.config.set('core.excludeVcsIgnoredPaths', false);
          platform.generateEvilFiles();
          chevron.project.setPaths([
            path.join(__dirname, 'fixtures', 'evil-files')
          ]);
          const paths = [];
          let matches = [];

          await scan(/evil/, {}, result => {
            paths.push(result.filePath);
            matches = matches.concat(result.matches);
          });

          // Sort the paths to make the test deterministic.
          paths.sort();

          _.each(matches, m => expect(m.matchText).toEqual('evil'));

          if (platform.isWindows()) {
            expect(paths.length).toBe(3);
            expect(paths[0]).toMatch(/a_file_with_utf8.txt$/);
            expect(paths[1]).toMatch(/file with spaces.txt$/);
            expect(path.basename(paths[2])).toBe('utfa\u0306.md');
          } else {
            expect(paths.length).toBe(5);
            expect(paths[0]).toMatch(/a_file_with_utf8.txt$/);
            expect(paths[1]).toMatch(/file with spaces.txt$/);
            expect(paths[2]).toMatch(/goddam\nnewlines$/m);
            expect(paths[3]).toMatch(/quote".txt$/m);
            expect(path.basename(paths[4])).toBe('utfa\u0306.md');
          }
        });

        it('ignores case if the regex includes the `i` flag', async () => {
          const results = [];
          await scan(/DOLLAR/i, {}, result => results.push(result));

          expect(results).toHaveLength(1);
        });

        if (ripgrep) {
          it('returns empty text matches', async () => {
            const results = [];
            await scan(
              /^\s{0}/,
              {
                paths: [`oh-git`]
              },
              result => results.push(result)
            );

            expect(results.length).toBe(1);
            const { filePath, matches } = results[0];
            expect(filePath).toBe(
              chevron.project
                .getDirectories()[0]
                .resolve(path.join('a-dir', 'oh-git'))
            );
            expect(matches).toHaveLength(1);
            expect(matches[0]).toEqual({
              matchText: '',
              lineText: 'bbb aaaa',
              lineTextOffset: 0,
              range: [[0, 0], [0, 0]],
              leadingContextLines: [],
              trailingContextLines: []
            });
          });

          describe('newlines on regexps', async () => {
            it('returns multiline results from regexps', async () => {
              const results = [];

              await scan(/first\nsecond/, {}, result => results.push(result));

              expect(results.length).toBe(1);
              const { filePath, matches } = results[0];
              expect(filePath).toBe(
                chevron.project
                  .getDirectories()[0]
                  .resolve('file-with-newline-literal')
              );
              expect(matches).toHaveLength(1);
              expect(matches[0]).toEqual({
                matchText: 'first\nsecond',
                lineText: 'first\nsecond\\nthird',
                lineTextOffset: 0,
                range: [[3, 0], [4, 6]],
                leadingContextLines: [],
                trailingContextLines: []
              });
            });

            it('returns correctly the context lines', async () => {
              const results = [];

              await scan(
                /first\nsecond/,
                {
                  leadingContextLineCount: 2,
                  trailingContextLineCount: 2
                },
                result => results.push(result)
              );

              expect(results.length).toBe(1);
              const { filePath, matches } = results[0];
              expect(filePath).toBe(
                chevron.project
                  .getDirectories()[0]
                  .resolve('file-with-newline-literal')
              );
              expect(matches).toHaveLength(1);
              expect(matches[0]).toEqual({
                matchText: 'first\nsecond',
                lineText: 'first\nsecond\\nthird',
                lineTextOffset: 0,
                range: [[3, 0], [4, 6]],
                leadingContextLines: ['newline2', 'newline3'],
                trailingContextLines: ['newline4', 'newline5']
              });
            });

            it('returns multiple results from the same line', async () => {
              const results = [];

              await scan(/line\d\nne/, {}, result => results.push(result));

              results.sort((a, b) => a.filePath.localeCompare(b.filePath));

              expect(results.length).toBe(1);

              const { filePath, matches } = results[0];
              expect(filePath).toBe(
                chevron.project
                  .getDirectories()[0]
                  .resolve('file-with-newline-literal')
              );
              expect(matches).toHaveLength(3);
              expect(matches[0]).toEqual({
                matchText: 'line1\nne',
                lineText: 'newline1\nnewline2',
                lineTextOffset: 0,
                range: [[0, 3], [1, 2]],
                leadingContextLines: [],
                trailingContextLines: []
              });
              expect(matches[1]).toEqual({
                matchText: 'line2\nne',
                lineText: 'newline2\nnewline3',
                lineTextOffset: 0,
                range: [[1, 3], [2, 2]],
                leadingContextLines: [],
                trailingContextLines: []
              });
              expect(matches[2]).toEqual({
                matchText: 'line4\nne',
                lineText: 'newline4\nnewline5',
                lineTextOffset: 0,
                range: [[5, 3], [6, 2]],
                leadingContextLines: [],
                trailingContextLines: []
              });
            });

            it('works with escaped newlines', async () => {
              const results = [];

              await scan(/second\\nthird/, {}, result => results.push(result));
              expect(results.length).toBe(1);
              const { filePath, matches } = results[0];
              expect(filePath).toBe(
                chevron.project
                  .getDirectories()[0]
                  .resolve('file-with-newline-literal')
              );
              expect(matches).toHaveLength(1);
              expect(matches[0]).toEqual({
                matchText: 'second\\nthird',
                lineText: 'second\\nthird',
                lineTextOffset: 0,
                range: [[4, 0], [4, 13]],
                leadingContextLines: [],
                trailingContextLines: []
              });
            });

            it('matches a regexp ending with a newline', async () => {
              const results = [];

              await scan(/newline3\n/, {}, result => results.push(result));
              expect(results.length).toBe(1);
              const { filePath, matches } = results[0];
              expect(filePath).toBe(
                chevron.project
                  .getDirectories()[0]
                  .resolve('file-with-newline-literal')
              );
              expect(matches).toHaveLength(1);
              expect(matches[0]).toEqual({
                matchText: 'newline3\n',
                lineText: 'newline3',
                lineTextOffset: 0,
                range: [[2, 0], [3, 0]],
                leadingContextLines: [],
                trailingContextLines: []
              });
            });
          });
          describe('pcre2 enabled', async () => {
            it('supports lookbehind searches', async () => {
              const results = [];

              await scan(/(?<!a)aa\b/, { PCRE2: true }, result =>
                results.push(result)
              );

              expect(results.length).toBe(1);
              const { filePath, matches } = results[0];
              expect(filePath).toBe(
                chevron.project.getDirectories()[0].resolve('a')
              );
              expect(matches).toHaveLength(1);
              expect(matches[0]).toEqual({
                matchText: 'aa',
                lineText: 'cc aa cc',
                lineTextOffset: 0,
                range: [[1, 3], [1, 5]],
                leadingContextLines: [],
                trailingContextLines: []
              });
            });
          });
        }

        it('returns results on lines with unicode strings', async () => {
          const results = [];

          await scan(/line with unico/, {}, result => results.push(result));
          expect(results.length).toBe(1);
          const { filePath, matches } = results[0];
          expect(filePath).toBe(
            chevron.project.getDirectories()[0].resolve('file-with-unicode')
          );
          expect(matches).toHaveLength(1);
          expect(matches[0]).toEqual({
            matchText: 'line with unico',
            lineText: 'ДДДДДДДДДДДДДДДДДД line with unicode',
            lineTextOffset: 0,
            range: [[0, 19], [0, 34]],
            leadingContextLines: [],
            trailingContextLines: []
          });
        });

        it('returns results on files detected as binary', async () => {
          const results = [];

          await scan(
            /asciiProperty=Foo/,
            {
              trailingContextLineCount: 2
            },
            result => results.push(result)
          );
          expect(results.length).toBe(1);
          const { filePath, matches } = results[0];
          expect(filePath).toBe(
            chevron.project.getDirectories()[0].resolve('file-detected-as-binary')
          );
          expect(matches).toHaveLength(1);
          expect(matches[0]).toEqual({
            matchText: 'asciiProperty=Foo',
            lineText: 'asciiProperty=Foo',
            lineTextOffset: 0,
            range: [[0, 0], [0, 17]],
            leadingContextLines: [],
            trailingContextLines: ['utf8Property=Fòò', 'latin1Property=F��']
          });
        });

        describe('when the core.excludeVcsIgnoredPaths config is used', () => {
          let projectPath;
          let ignoredPath;

          beforeEach(() => {
            const sourceProjectPath = path.join(
              __dirname,
              'fixtures',
              'git',
              'working-dir'
            );
            projectPath = path.join(temp.mkdirSync('atom'));
            fs.copySync(sourceProjectPath, projectPath);

            fs.renameSync(
              path.join(projectPath, 'git.git'),
              path.join(projectPath, '.git')
            );
            ignoredPath = path.join(projectPath, 'ignored.txt');
            fs.writeFileSync(ignoredPath, 'this match should not be included');
          });

          afterEach(() => {
            if (fs.existsSync(projectPath)) {
              fs.removeSync(projectPath);
            }
          });

          it('excludes ignored files when core.excludeVcsIgnoredPaths is true', async () => {
            chevron.project.setPaths([projectPath]);
            chevron.config.set('core.excludeVcsIgnoredPaths', true);
            const resultHandler = jasmine.createSpy('result found');

            await scan(/match/, {}, ({ filePath }) => resultHandler(filePath));

            expect(resultHandler).not.toHaveBeenCalled();
          });

          it('does not exclude ignored files when core.excludeVcsIgnoredPaths is false', async () => {
            chevron.project.setPaths([projectPath]);
            chevron.config.set('core.excludeVcsIgnoredPaths', false);
            const resultHandler = jasmine.createSpy('result found');

            await scan(/match/, {}, ({ filePath }) => resultHandler(filePath));

            expect(resultHandler).toHaveBeenCalledWith(
              path.join(projectPath, 'ignored.txt')
            );
          });

          it('does not exclude files when searching on an ignored folder even when core.excludeVcsIgnoredPaths is true', async () => {
            fs.mkdirSync(path.join(projectPath, 'poop'));
            ignoredPath = path.join(
              path.join(projectPath, 'poop', 'whatever.txt')
            );
            fs.writeFileSync(ignoredPath, 'this match should be included');

            chevron.project.setPaths([projectPath]);
            chevron.config.set('core.excludeVcsIgnoredPaths', true);
            const resultHandler = jasmine.createSpy('result found');

            await scan(/match/, { paths: ['poop'] }, ({ filePath }) =>
              resultHandler(filePath)
            );

            expect(resultHandler).toHaveBeenCalledWith(ignoredPath);
          });
        });

        describe('when the core.followSymlinks config is used', () => {
          let projectPath;

          beforeEach(() => {
            const sourceProjectPath = path.join(
              __dirname,
              'fixtures',
              'dir',
              'a-dir'
            );
            projectPath = path.join(temp.mkdirSync('atom'));
            fs.copySync(sourceProjectPath, projectPath);

            fs.symlinkSync(
              path.join(__dirname, 'fixtures', 'dir', 'b'),
              path.join(projectPath, 'symlink')
            );
          });

          afterEach(() => {
            if (fs.existsSync(projectPath)) {
              fs.removeSync(projectPath);
            }
          });

          it('follows symlinks when core.followSymlinks is true', async () => {
            chevron.project.setPaths([projectPath]);
            chevron.config.set('core.followSymlinks', true);
            const resultHandler = jasmine.createSpy('result found');

            await scan(/ccc/, {}, ({ filePath }) => resultHandler(filePath));

            expect(resultHandler).toHaveBeenCalledWith(
              path.join(projectPath, 'symlink')
            );
          });

          it('does not follow symlinks when core.followSymlinks is false', async () => {
            chevron.project.setPaths([projectPath]);
            chevron.config.set('core.followSymlinks', false);
            const resultHandler = jasmine.createSpy('result found');

            await scan(/ccc/, {}, ({ filePath }) => resultHandler(filePath));

            expect(resultHandler).not.toHaveBeenCalled();
          });
        });

        describe('when there are hidden files', () => {
          let projectPath;

          beforeEach(() => {
            const sourceProjectPath = path.join(
              __dirname,
              'fixtures',
              'dir',
              'a-dir'
            );
            projectPath = path.join(temp.mkdirSync('atom'));
            fs.copySync(sourceProjectPath, projectPath);

            // Note: This won't create a hidden file on Windows, in order to more
            // accurately test this behaviour there, we should either use a package
            // like `fswin` or manually spawn an `ATTRIB` command.
            fs.writeFileSync(path.join(projectPath, '.hidden'), 'ccc');
          });

          afterEach(() => {
            if (fs.existsSync(projectPath)) {
              fs.removeSync(projectPath);
            }
          });

          it('searches on hidden files', async () => {
            chevron.project.setPaths([projectPath]);
            const resultHandler = jasmine.createSpy('result found');

            await scan(/ccc/, {}, ({ filePath }) => resultHandler(filePath));

            expect(resultHandler).toHaveBeenCalledWith(
              path.join(projectPath, '.hidden')
            );
          });
        });

        it('includes only files when a directory filter is specified', async () => {
          const projectPath = path.join(
            path.join(__dirname, 'fixtures', 'dir')
          );
          chevron.project.setPaths([projectPath]);

          const filePath = path.join(projectPath, 'a-dir', 'oh-git');

          const paths = [];
          let matches = [];

          await scan(/aaa/, { paths: [`a-dir${path.sep}`] }, result => {
            paths.push(result.filePath);
            matches = matches.concat(result.matches);
          });

          expect(paths.length).toBe(1);
          expect(paths[0]).toBe(filePath);
          expect(matches.length).toBe(1);
        });

        it("includes files and folders that begin with a '.'", async () => {
          const projectPath = temp.mkdirSync('atom-spec-workspace');
          const filePath = path.join(projectPath, '.text');
          fs.writeFileSync(filePath, 'match this');
          chevron.project.setPaths([projectPath]);
          const paths = [];
          let matches = [];

          await scan(/match this/, {}, result => {
            paths.push(result.filePath);
            matches = matches.concat(result.matches);
          });

          expect(paths.length).toBe(1);
          expect(paths[0]).toBe(filePath);
          expect(matches.length).toBe(1);
        });

        it('excludes values in core.ignoredNames', async () => {
          const ignoredNames = chevron.config.get('core.ignoredNames');
          ignoredNames.push('a');
          chevron.config.set('core.ignoredNames', ignoredNames);

          const resultHandler = jasmine.createSpy('result found');
          await scan(/dollar/, {}, () => resultHandler());

          expect(resultHandler).not.toHaveBeenCalled();
        });

        it('scans buffer contents if the buffer is modified', async () => {
          const results = [];
          const editor = await chevron.workspace.open('a');

          editor.setText('Elephant');

          await scan(/a|Elephant/, {}, result => results.push(result));

          expect(results.length).toBeGreaterThan(0);
          const resultForA = _.find(
            results,
            ({ filePath }) => path.basename(filePath) === 'a'
          );
          expect(resultForA.matches).toHaveLength(1);
          expect(resultForA.matches[0].matchText).toBe('Elephant');
        });

        it('ignores buffers outside the project', async () => {
          const results = [];
          const editor = await chevron.workspace.open(temp.openSync().path);

          editor.setText('Elephant');

          await scan(/Elephant/, {}, result => results.push(result));

          expect(results).toHaveLength(0);
        });

        describe('when the project has multiple root directories', () => {
          let dir1;
          let dir2;
          let file1;
          let file2;

          beforeEach(() => {
            dir1 = chevron.project.getPaths()[0];
            file1 = path.join(dir1, 'a-dir', 'oh-git');

            dir2 = temp.mkdirSync('a-second-dir');
            const aDir2 = path.join(dir2, 'a-dir');
            file2 = path.join(aDir2, 'a-file');
            fs.mkdirSync(aDir2);
            fs.writeFileSync(file2, 'ccc aaaa');

            chevron.project.addPath(dir2);
          });

          it("searches matching files in all of the project's root directories", async () => {
            const resultPaths = [];

            await scan(/aaaa/, {}, ({ filePath }) =>
              resultPaths.push(filePath)
            );

            expect(resultPaths.sort()).toEqual([file1, file2].sort());
          });

          describe('when an inclusion path starts with the basename of a root directory', () => {
            it('interprets the inclusion path as starting from that directory', async () => {
              let resultPaths = [];
              await scan(/aaaa/, { paths: ['dir'] }, ({ filePath }) => {
                if (!resultPaths.includes(filePath)) {
                  resultPaths.push(filePath);
                }
              });

              expect(resultPaths).toEqual([file1]);

              resultPaths = [];
              await scan(
                /aaaa/,
                { paths: [path.join('dir', 'a-dir')] },
                ({ filePath }) => {
                  if (!resultPaths.includes(filePath)) {
                    resultPaths.push(filePath);
                  }
                }
              );

              expect(resultPaths).toEqual([file1]);

              resultPaths = [];
              await scan(
                /aaaa/,
                { paths: [path.basename(dir2)] },
                ({ filePath }) => {
                  if (!resultPaths.includes(filePath)) {
                    resultPaths.push(filePath);
                  }
                }
              );

              expect(resultPaths).toEqual([file2]);

              resultPaths = [];
              await scan(
                /aaaa/,
                { paths: [path.join(path.basename(dir2), 'a-dir')] },
                ({ filePath }) => {
                  if (!resultPaths.includes(filePath)) {
                    resultPaths.push(filePath);
                  }
                }
              );

              expect(resultPaths).toEqual([file2]);
            });
          });

          describe('when a custom directory searcher is registered', () => {
            let fakeSearch = null;
            // Function that is invoked once all of the fields on fakeSearch are set.
            let onFakeSearchCreated = null;

            class FakeSearch {
              constructor(options) {
                // Note that hoisting resolve and reject in this way is generally frowned upon.
                this.options = options;
                this.promise = new Promise((resolve, reject) => {
                  this.hoistedResolve = resolve;
                  this.hoistedReject = reject;
                  if (typeof onFakeSearchCreated === 'function') {
                    onFakeSearchCreated(this);
                  }
                });
              }
              then(...args) {
                return this.promise.then.apply(this.promise, args);
              }
              cancel() {
                this.cancelled = true;
                // According to the spec for a DirectorySearcher, invoking `cancel()` should
                // resolve the thenable rather than reject it.
                this.hoistedResolve();
              }
            }

            beforeEach(async () => {
              useRealClockOnce();
              fakeSearch = null;
              onFakeSearchCreated = null;
              chevron.packages.serviceHub.provide(
                'atom.directory-searcher',
                '0.1.0',
                {
                  canSearchDirectory(directory) {
                    return directory.getPath() === dir1;
                  },
                  search(directory, regex, options) {
                    fakeSearch = new FakeSearch(options);
                    return fakeSearch;
                  }
                }
              );
              await conditionPromise(() => chevron.workspace.directorySearchers.length > 0);
            });

            it('can override the built-in directory searcher on a per-directory basis', async () => {
              const foreignFilePath = 'ssh://foreign-directory:8080/hello.txt';
              const numPathsSearchedInDir2 = 1;
              const numPathsToPretendToSearchInCustomDirectorySearcher = 10;
              const searchResult = {
                filePath: foreignFilePath,
                matches: [
                  {
                    lineText: 'Hello world',
                    lineTextOffset: 0,
                    matchText: 'Hello',
                    range: [[0, 0], [0, 5]]
                  }
                ]
              };
              onFakeSearchCreated = fakeSearch => {
                fakeSearch.options.didMatch(searchResult);
                fakeSearch.options.didSearchPaths(
                  numPathsToPretendToSearchInCustomDirectorySearcher
                );
                fakeSearch.hoistedResolve();
              };

              const resultPaths = [];
              const onPathsSearched = jasmine.createSpy('onPathsSearched');

              await scan(/aaaa/, { onPathsSearched }, ({ filePath }) =>
                resultPaths.push(filePath)
              );

              expect(resultPaths.sort()).toEqual(
                [foreignFilePath, file2].sort()
              );
              // onPathsSearched should be called once by each DirectorySearcher. The order is not
              // guaranteed, so we can only verify the total number of paths searched is correct
              // after the second call.
              expect(onPathsSearched.callCount).toBe(2);
              expect(onPathsSearched.mostRecentCall.args[0]).toBe(
                numPathsToPretendToSearchInCustomDirectorySearcher +
                  numPathsSearchedInDir2
              );
            });

            it('can be cancelled when the object returned by scan() has its cancel() method invoked', async () => {
              useRealClockOnce();
              const thenable = scan(/aaaa/, {}, () => {});
              let resultOfPromiseSearch = null;
              await conditionPromise(() => fakeSearch != null, 'fakeSearch to be defined');
              expect(fakeSearch.cancelled).toBe(undefined);
              thenable.cancel();
              expect(fakeSearch.cancelled).toBe(true);
              await thenable.then(promiseResult => {
                  resultOfPromiseSearch = promiseResult;
                });
              expect(resultOfPromiseSearch).toBe('cancelled');
            });

            it('will have the side-effect of failing the overall search if it fails', async () => {
              useRealClockOnce();
              let cancelableSearch;
              let fakeSearch2 = null;
              chevron.packages.serviceHub.provide(
                'atom.directory-searcher',
                '0.1.0',
                {
                  canSearchDirectory(directory) {
                    return directory.getPath() === dir2;
                  },
                  search(directory, regex, options) {
                    fakeSearch2 = new FakeSearch(options);
                    return fakeSearch2;
                  }
                }
              );
              let didReject = false;
              const promise = (cancelableSearch = scan(/aaaa/, () => {}));
              await conditionPromise(() => fakeSearch != null, 'fakeSearch to be defined');
              fakeSearch.hoistedReject();
              await cancelableSearch.catch(() => {
                  didReject = true;
                });
              await new Promise(done => promise.then(null, done));
              expect(didReject).toBe(true);
              expect(fakeSearch2.cancelled).toBe(true);
            });
          });
        });
      });

      describe('leadingContextLineCount and trailingContextLineCount options', () => {
        async function search({
          leadingContextLineCount,
          trailingContextLineCount
        }) {
          const results = [];
          await scan(
            /result/,
            { leadingContextLineCount, trailingContextLineCount },
            result => results.push(result)
          );

          return {
            leadingContext: results[0].matches.map(
              result => result.leadingContextLines
            ),
            trailingContext: results[0].matches.map(
              result => result.trailingContextLines
            )
          };
        }

        const expectedLeadingContext = [
          ['line 1', 'line 2', 'line 3', 'line 4', 'line 5'],
          ['line 6', 'line 7', 'line 8', 'line 9', 'line 10'],
          ['line 7', 'line 8', 'line 9', 'line 10', 'result 2'],
          ['line 10', 'result 2', 'result 3', 'line 11', 'line 12']
        ];
        const expectedTrailingContext = [
          ['line 6', 'line 7', 'line 8', 'line 9', 'line 10'],
          ['result 3', 'line 11', 'line 12', 'result 4', 'line 13'],
          ['line 11', 'line 12', 'result 4', 'line 13', 'line 14'],
          ['line 13', 'line 14', 'line 15']
        ];

        it('returns valid contexts no matter how many lines are requested', async () => {
          expect(await search({})).toEqual({
            leadingContext: [[], [], [], []],
            trailingContext: [[], [], [], []]
          });

          expect(
            await search({
              leadingContextLineCount: 1,
              trailingContextLineCount: 1
            })
          ).toEqual({
            leadingContext: expectedLeadingContext.map(result =>
              result.slice(-1)
            ),
            trailingContext: expectedTrailingContext.map(result =>
              result.slice(0, 1)
            )
          });

          expect(
            await search({
              leadingContextLineCount: 2,
              trailingContextLineCount: 2
            })
          ).toEqual({
            leadingContext: expectedLeadingContext.map(result =>
              result.slice(-2)
            ),
            trailingContext: expectedTrailingContext.map(result =>
              result.slice(0, 2)
            )
          });

          expect(
            await search({
              leadingContextLineCount: 5,
              trailingContextLineCount: 5
            })
          ).toEqual({
            leadingContext: expectedLeadingContext.map(result =>
              result.slice(-5)
            ),
            trailingContext: expectedTrailingContext.map(result =>
              result.slice(0, 5)
            )
          });

          expect(
            await search({
              leadingContextLineCount: 2,
              trailingContextLineCount: 3
            })
          ).toEqual({
            leadingContext: expectedLeadingContext.map(result =>
              result.slice(-2)
            ),
            trailingContext: expectedTrailingContext.map(result =>
              result.slice(0, 3)
            )
          });
        });
      });
    }); // Cancels other ongoing searches
  }

  describe('::replace(regex, replacementText, paths, iterator)', () => {
    let fixturesDir, projectDir;

    beforeEach(() => {
      fixturesDir = path.dirname(chevron.project.getPaths()[0]);
      projectDir = temp.mkdirSync('atom');
      chevron.project.setPaths([projectDir]);
    });

    describe("when a file doesn't exist", () => {
      it('calls back with an error', async () => {
        const errors = [];
        const missingPath = path.resolve('/not-a-file.js');
        expect(fs.existsSync(missingPath)).toBeFalsy();
        await chevron.workspace.replace(
            /items/gi,
            'items',
            [missingPath],
            (result, error) => errors.push(error)
          );
        expect(errors).toHaveLength(1);
        expect(errors[0].path).toBe(missingPath);
      });
    });

    describe('when called with unopened files', () => {
      it('replaces properly', async () => {
        const filePath = path.join(projectDir, 'sample.js');
        fs.copyFileSync(path.join(fixturesDir, 'sample.js'), filePath);
        const results = [];
        await chevron.workspace.replace(/items/gi, 'items', [filePath], result =>
            results.push(result)
          );
        expect(results).toHaveLength(1);
        expect(results[0].filePath).toBe(filePath);
        expect(results[0].replacements).toBe(6);
      });

      it('does not discard the multiline flag', async () => {
        const filePath = path.join(projectDir, 'sample.js');
        fs.copyFileSync(path.join(fixturesDir, 'sample.js'), filePath);
        const results = [];
        await chevron.workspace.replace(/;$/gim, 'items', [filePath], result =>
            results.push(result)
          );
        expect(results).toHaveLength(1);
        expect(results[0].filePath).toBe(filePath);
        expect(results[0].replacements).toBe(8);
      });
    });

    describe('when a buffer is already open', () => {
      it('replaces properly and saves when not modified', async () => {
        const filePath = path.join(projectDir, 'sample.js');
        fs.copyFileSync(
          path.join(fixturesDir, 'sample.js'),
          path.join(projectDir, 'sample.js')
        );
        let editor = null;
        const results = [];
        await chevron.workspace.open('sample.js').then(o => {
            editor = o;
          });
        expect(editor.isModified()).toBeFalsy();
        await chevron.workspace.replace(/items/gi, 'items', [filePath], result =>
            results.push(result)
          );
        expect(results).toHaveLength(1);
        expect(results[0].filePath).toBe(filePath);
        expect(results[0].replacements).toBe(6);
        expect(editor.isModified()).toBeFalsy();
      });

      it('does not replace when the path is not specified', async () => {
        const filePath = path.join(projectDir, 'sample.js');
        const commentFilePath = path.join(
          projectDir,
          'sample-with-comments.js'
        );
        fs.copyFileSync(path.join(fixturesDir, 'sample.js'), filePath);
        fs.copyFileSync(
          path.join(fixturesDir, 'sample-with-comments.js'),
          path.join(projectDir, 'sample-with-comments.js')
        );
        const results = [];
        await chevron.workspace.open('sample-with-comments.js');
        await chevron.workspace.replace(
            /items/gi,
            'items',
            [commentFilePath],
            result => results.push(result)
          );
        expect(results).toHaveLength(1);
        expect(results[0].filePath).toBe(commentFilePath);
      });

      it('does NOT save when modified', async () => {
        const filePath = path.join(projectDir, 'sample.js');
        fs.copyFileSync(path.join(fixturesDir, 'sample.js'), filePath);
        let editor = null;
        const results = [];
        await chevron.workspace.open('sample.js').then(o => {
            editor = o;
          });
        editor.buffer.setTextInRange([[0, 0], [0, 0]], 'omg');
        expect(editor.isModified()).toBeTruthy();
        await chevron.workspace.replace(/items/gi, 'okthen', [filePath], result =>
            results.push(result)
          );
        expect(results).toHaveLength(1);
        expect(results[0].filePath).toBe(filePath);
        expect(results[0].replacements).toBe(6);
        expect(editor.isModified()).toBeTruthy();
      });
    });
  });

  describe('::saveActivePaneItem()', () => {
    let editor, notificationSpy;

    beforeEach(async () => {
      await chevron.workspace.open('sample.js').then(o => {
          editor = o;
        });
      notificationSpy = jasmine.createSpy('did-add-notification');
      chevron.notifications.onDidAddNotification(notificationSpy);
    });

    describe('when there is an error', () => {
      it('emits a warning notification when the file cannot be saved', async () => {
        spyOn(editor, 'save').andCallFake(() => {
          throw new Error("'/some/file' is a directory");
        });
        await chevron.workspace.saveActivePaneItem().then(() => {
            expect(notificationSpy).toHaveBeenCalled();
            expect(notificationSpy.mostRecentCall.args[0].getType()).toBe(
              'warning'
            );
            expect(
              notificationSpy.mostRecentCall.args[0].getMessage()
            ).toContain('Unable to save');
          });
      });

      it('emits a warning notification when the directory cannot be written to', async () => {
        spyOn(editor, 'save').andCallFake(() => {
          throw new Error("ENOTDIR, not a directory '/Some/dir/and-a-file.js'");
        });
        await chevron.workspace.saveActivePaneItem().then(() => {
            expect(notificationSpy).toHaveBeenCalled();
            expect(notificationSpy.mostRecentCall.args[0].getType()).toBe(
              'warning'
            );
            expect(
              notificationSpy.mostRecentCall.args[0].getMessage()
            ).toContain('Unable to save');
          });
      });

      it('emits a warning notification when the user does not have permission', async () => {
        spyOn(editor, 'save').andCallFake(() => {
          const error = new Error(
            "EACCES, permission denied '/Some/dir/and-a-file.js'"
          );
          error.code = 'EACCES';
          error.path = '/Some/dir/and-a-file.js';
          throw error;
        });
        await chevron.workspace.saveActivePaneItem().then(() => {
            expect(notificationSpy).toHaveBeenCalled();
            expect(notificationSpy.mostRecentCall.args[0].getType()).toBe(
              'warning'
            );
            expect(
              notificationSpy.mostRecentCall.args[0].getMessage()
            ).toContain('Unable to save');
          });
      });

      it('emits a warning notification when the operation is not permitted', async () => {
        spyOn(editor, 'save').andCallFake(() => {
          const error = new Error(
            "EPERM, operation not permitted '/Some/dir/and-a-file.js'"
          );
          error.code = 'EPERM';
          error.path = '/Some/dir/and-a-file.js';
          throw error;
        });
        await chevron.workspace.saveActivePaneItem().then(() => {
            expect(notificationSpy).toHaveBeenCalled();
            expect(notificationSpy.mostRecentCall.args[0].getType()).toBe(
              'warning'
            );
            expect(
              notificationSpy.mostRecentCall.args[0].getMessage()
            ).toContain('Unable to save');
          });
      });

      it('emits a warning notification when the file is already open by another app', async () => {
        spyOn(editor, 'save').andCallFake(() => {
          const error = new Error(
            "EBUSY, resource busy or locked '/Some/dir/and-a-file.js'"
          );
          error.code = 'EBUSY';
          error.path = '/Some/dir/and-a-file.js';
          throw error;
        });
        await chevron.workspace.saveActivePaneItem().then(() => {
            expect(notificationSpy).toHaveBeenCalled();
            expect(notificationSpy.mostRecentCall.args[0].getType()).toBe(
              'warning'
            );
            expect(
              notificationSpy.mostRecentCall.args[0].getMessage()
            ).toContain('Unable to save');
          });
      });

      it('emits a warning notification when the file system is read-only', async () => {
        spyOn(editor, 'save').andCallFake(() => {
          const error = new Error(
            "EROFS, read-only file system '/Some/dir/and-a-file.js'"
          );
          error.code = 'EROFS';
          error.path = '/Some/dir/and-a-file.js';
          throw error;
        });
        await chevron.workspace.saveActivePaneItem().then(() => {
            expect(notificationSpy).toHaveBeenCalled();
            expect(notificationSpy.mostRecentCall.args[0].getType()).toBe(
              'warning'
            );
            expect(
              notificationSpy.mostRecentCall.args[0].getMessage()
            ).toContain('Unable to save');
          });
      });

      it('emits a warning notification when the file cannot be saved', async () => {
        spyOn(editor, 'save').andCallFake(() => {
          throw new Error('no one knows');
        });
        let rejected = false;
        try {
          await chevron.workspace.saveActivePaneItem();
          throw new Error(
            'Expected promise to be rejected, but it was resolved'
          );
        } catch (error) {
          if (
            error.message ===
            'Expected promise to be rejected, but it was resolved'
          ) {
            throw error;
          }
          rejected = true;
        }
        expect(rejected).toBe(true);
      });
    });
  });

  describe('::closeActivePaneItemOrEmptyPaneOrWindow', () => {
    beforeEach(async () => {
      spyOn(chevron, 'close');
      await chevron.workspace.open();
    });

    it('closes the active center pane item, or the active center pane if it is empty, or the current window if there is only the empty root pane in the center', async () => {
      chevron.config.set('core.destroyEmptyPanes', false);

      const pane1 = chevron.workspace.getActivePane();
      const pane2 = pane1.splitRight({ copyActiveItem: true });

      expect(chevron.workspace.getCenter().getPanes().length).toBe(2);
      expect(pane2.getItems().length).toBe(1);
      chevron.workspace.closeActivePaneItemOrEmptyPaneOrWindow();

      expect(chevron.workspace.getCenter().getPanes().length).toBe(2);
      expect(pane2.getItems().length).toBe(0);

      chevron.workspace.closeActivePaneItemOrEmptyPaneOrWindow();

      expect(chevron.workspace.getCenter().getPanes().length).toBe(1);
      expect(pane1.getItems().length).toBe(1);

      chevron.workspace.closeActivePaneItemOrEmptyPaneOrWindow();
      expect(chevron.workspace.getCenter().getPanes().length).toBe(1);
      expect(pane1.getItems().length).toBe(0);
      expect(chevron.workspace.getCenter().getPanes().length).toBe(1);

      // The dock items should not be closed
      await chevron.workspace.open({
        getTitle: () => 'Permanent Dock Item',
        element: document.createElement('div'),
        getDefaultLocation: () => 'left',
        isPermanentDockItem: () => true
      });
      await chevron.workspace.open({
        getTitle: () => 'Impermanent Dock Item',
        element: document.createElement('div'),
        getDefaultLocation: () => 'left'
      });

      expect(chevron.workspace.getLeftDock().getPaneItems().length).toBe(2);
      chevron.workspace.closeActivePaneItemOrEmptyPaneOrWindow();
      expect(chevron.close).toHaveBeenCalled();
    });
  });

  describe('::activateNextPane', () => {
    describe('when the active workspace pane is inside a dock', () => {
      it('activates the next pane in the dock', () => {
        const dock = chevron.workspace.getLeftDock();
        const dockPane1 = dock.getPanes()[0];
        const dockPane2 = dockPane1.splitRight();

        dockPane2.focus();
        expect(chevron.workspace.getActivePane()).toBe(dockPane2);
        chevron.workspace.activateNextPane();
        expect(chevron.workspace.getActivePane()).toBe(dockPane1);
      });
    });

    describe('when the active workspace pane is inside the workspace center', () => {
      it('activates the next pane in the workspace center', () => {
        const center = chevron.workspace.getCenter();
        const centerPane1 = center.getPanes()[0];
        const centerPane2 = centerPane1.splitRight();

        centerPane2.focus();
        expect(chevron.workspace.getActivePane()).toBe(centerPane2);
        chevron.workspace.activateNextPane();
        expect(chevron.workspace.getActivePane()).toBe(centerPane1);
      });
    });
  });

  describe('::activatePreviousPane', () => {
    describe('when the active workspace pane is inside a dock', () => {
      it('activates the previous pane in the dock', () => {
        const dock = chevron.workspace.getLeftDock();
        const dockPane1 = dock.getPanes()[0];
        const dockPane2 = dockPane1.splitRight();

        dockPane1.focus();
        expect(chevron.workspace.getActivePane()).toBe(dockPane1);
        chevron.workspace.activatePreviousPane();
        expect(chevron.workspace.getActivePane()).toBe(dockPane2);
      });
    });

    describe('when the active workspace pane is inside the workspace center', () => {
      it('activates the previous pane in the workspace center', () => {
        const center = chevron.workspace.getCenter();
        const centerPane1 = center.getPanes()[0];
        const centerPane2 = centerPane1.splitRight();

        centerPane1.focus();
        expect(chevron.workspace.getActivePane()).toBe(centerPane1);
        chevron.workspace.activatePreviousPane();
        expect(chevron.workspace.getActivePane()).toBe(centerPane2);
      });
    });
  });

  describe('::getVisiblePanes', () => {
    it('returns all panes in visible pane containers', () => {
      const center = workspace.getCenter();
      const leftDock = workspace.getLeftDock();
      const rightDock = workspace.getRightDock();
      const bottomDock = workspace.getBottomDock();

      const centerPane = center.getPanes()[0];
      const leftDockPane = leftDock.getPanes()[0];
      const rightDockPane = rightDock.getPanes()[0];
      const bottomDockPane = bottomDock.getPanes()[0];

      leftDock.hide();
      rightDock.hide();
      bottomDock.hide();
      expect(workspace.getVisiblePanes()).toContain(centerPane);
      expect(workspace.getVisiblePanes()).not.toContain(leftDockPane);
      expect(workspace.getVisiblePanes()).not.toContain(rightDockPane);
      expect(workspace.getVisiblePanes()).not.toContain(bottomDockPane);

      leftDock.show();
      expect(workspace.getVisiblePanes()).toContain(centerPane);
      expect(workspace.getVisiblePanes()).toContain(leftDockPane);
      expect(workspace.getVisiblePanes()).not.toContain(rightDockPane);
      expect(workspace.getVisiblePanes()).not.toContain(bottomDockPane);

      rightDock.show();
      expect(workspace.getVisiblePanes()).toContain(centerPane);
      expect(workspace.getVisiblePanes()).toContain(leftDockPane);
      expect(workspace.getVisiblePanes()).toContain(rightDockPane);
      expect(workspace.getVisiblePanes()).not.toContain(bottomDockPane);

      bottomDock.show();
      expect(workspace.getVisiblePanes()).toContain(centerPane);
      expect(workspace.getVisiblePanes()).toContain(leftDockPane);
      expect(workspace.getVisiblePanes()).toContain(rightDockPane);
      expect(workspace.getVisiblePanes()).toContain(bottomDockPane);
    });
  });

  describe('::getVisiblePaneContainers', () => {
    it('returns all visible pane containers', () => {
      const center = workspace.getCenter();
      const leftDock = workspace.getLeftDock();
      const rightDock = workspace.getRightDock();
      const bottomDock = workspace.getBottomDock();

      leftDock.hide();
      rightDock.hide();
      bottomDock.hide();
      expect(workspace.getVisiblePaneContainers()).toEqual([center]);

      leftDock.show();
      expect(workspace.getVisiblePaneContainers().sort()).toEqual([
        center,
        leftDock
      ]);

      rightDock.show();
      expect(workspace.getVisiblePaneContainers().sort()).toEqual([
        center,
        leftDock,
        rightDock
      ]);

      bottomDock.show();
      expect(workspace.getVisiblePaneContainers().sort()).toEqual([
        center,
        leftDock,
        rightDock,
        bottomDock
      ]);
    });
  });

  describe('when the core.allowPendingPaneItems option is falsy', () => {
    it('does not open item with `pending: true` option as pending', async () => {
      let pane = null;
      chevron.config.set('core.allowPendingPaneItems', false);
      await chevron.workspace.open('sample.js', { pending: true }).then(() => {
          pane = chevron.workspace.getActivePane();
        });
      expect(pane.getPendingItem()).toBeFalsy();
    });
  });

  describe('grammar activation', () => {
    it('notifies the workspace of which grammar is used', async () => {
      chevron.packages.triggerDeferredActivationHooks();

      const javascriptGrammarUsed = jasmine.createSpy('js grammar used');
      const rubyGrammarUsed = jasmine.createSpy('ruby grammar used');
      const cGrammarUsed = jasmine.createSpy('c grammar used');

      chevron.packages.onDidTriggerActivationHook(
        'language-javascript:grammar-used',
        javascriptGrammarUsed
      );
      chevron.packages.onDidTriggerActivationHook(
        'language-ruby:grammar-used',
        rubyGrammarUsed
      );
      chevron.packages.onDidTriggerActivationHook(
        'language-c:grammar-used',
        cGrammarUsed
      );

      await chevron.packages.activatePackage('language-ruby');
      await chevron.packages.activatePackage('language-javascript');
      await chevron.packages.activatePackage('language-c');
      await chevron.workspace.open('sample-with-comments.js');

      // Hooks are triggered when opening new editors
      expect(javascriptGrammarUsed).toHaveBeenCalled();

      // Hooks are triggered when changing existing editors grammars
      chevron.grammars.assignLanguageMode(
        chevron.workspace.getActiveTextEditor(),
        'source.c'
      );
      expect(cGrammarUsed).toHaveBeenCalled();

      // Hooks are triggered when editors are added in other ways.
      chevron.workspace.getActivePane().splitRight({ copyActiveItem: true });
      chevron.grammars.assignLanguageMode(
        chevron.workspace.getActiveTextEditor(),
        'source.ruby'
      );
      expect(rubyGrammarUsed).toHaveBeenCalled();
    });
  });

  describe('.checkoutHeadRevision()', () => {
    let editor = null;
    beforeEach(async () => {
      useRealClockOnce();
      chevron.config.set('editor.confirmCheckoutHeadRevision', false);

      editor = await chevron.workspace.open('sample-with-comments.js');
    });

    it('reverts to the version of its file checked into the project repository', async () => {
      editor.setCursorBufferPosition([0, 0]);
      editor.insertText('---\n');
      expect(editor.lineTextForBufferRow(0)).toBe('---');

      chevron.workspace.checkoutHeadRevision(editor);

      await conditionPromise(() => editor.lineTextForBufferRow(0) === '');
    });

    describe("when there's no repository for the editor's file", () => {
      it("doesn't do anything", async () => {
        editor = new TextEditor();
        editor.setText('stuff');
        chevron.workspace.checkoutHeadRevision(editor);

        chevron.workspace.checkoutHeadRevision(editor);
      });
    });
  });

  describe('when an item is moved', () => {
    beforeEach(() => {
      chevron.workspace.enablePersistence = true;
    });

    afterEach(async () => {
      await chevron.workspace.itemLocationStore.clear();
      chevron.workspace.enablePersistence = false;
    });

    it("stores the new location if it's not the default", () => {
      const ITEM_URI = 'chevron://test';
      const item = {
        getURI: () => ITEM_URI,
        getDefaultLocation: () => 'left',
        getElement: () => document.createElement('div')
      };
      const centerPane = workspace.getActivePane();
      centerPane.addItem(item);
      const dockPane = chevron.workspace.getRightDock().getActivePane();
      spyOn(workspace.itemLocationStore, 'save');
      centerPane.moveItemToPane(item, dockPane);
      expect(workspace.itemLocationStore.save).toHaveBeenCalledWith(
        ITEM_URI,
        'right'
      );
    });

    it("clears the location if it's the default", () => {
      const ITEM_URI = 'chevron://test';
      const item = {
        getURI: () => ITEM_URI,
        getDefaultLocation: () => 'right',
        getElement: () => document.createElement('div')
      };
      const centerPane = workspace.getActivePane();
      centerPane.addItem(item);
      const dockPane = chevron.workspace.getRightDock().getActivePane();
      spyOn(workspace.itemLocationStore, 'save');
      spyOn(workspace.itemLocationStore, 'delete');
      centerPane.moveItemToPane(item, dockPane);
      expect(workspace.itemLocationStore.delete).toHaveBeenCalledWith(ITEM_URI);
      expect(workspace.itemLocationStore.save).not.toHaveBeenCalled();
    });
  });
});

function escapeStringRegex(string) {
  return string.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}
