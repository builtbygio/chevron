declare const atom: any

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__, or convert again using --optional-chaining
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let StatusBarView;
const {Disposable} = require('chevron');
const Tile = require('./tile');

module.exports =
(StatusBarView = class StatusBarView {
  constructor() {
    this.element = document.createElement('status-bar');
    this.element.classList.add('status-bar');

    const flexboxHackElement = document.createElement('div');
    flexboxHackElement.classList.add('flexbox-repaint-hack');
    this.element.appendChild(flexboxHackElement);

    this.leftPanel = document.createElement('div');
    this.leftPanel.classList.add('status-bar-left');
    flexboxHackElement.appendChild(this.leftPanel);
    this.element.leftPanel = this.leftPanel;

    this.rightPanel = document.createElement('div');
    this.rightPanel.classList.add('status-bar-right');
    flexboxHackElement.appendChild(this.rightPanel);
    this.element.rightPanel = this.rightPanel;

    this.leftTiles = [];
    this.rightTiles = [];

    this.element.getLeftTiles = this.getLeftTiles.bind(this);
    this.element.getRightTiles = this.getRightTiles.bind(this);
    this.element.addLeftTile = this.addLeftTile.bind(this);
    this.element.addRightTile = this.addRightTile.bind(this);

    this.bufferSubscriptions = [];

    this.activeItemSubscription = chevron.workspace.getCenter().onDidChangeActivePaneItem(() => {
      this.unsubscribeAllFromBuffer();
      this.storeActiveBuffer();
      this.subscribeAllToBuffer();

      return this.element.dispatchEvent(new CustomEvent('active-buffer-changed', {bubbles: true}));
    });

    this.storeActiveBuffer();
  }

  destroy() {
    this.activeItemSubscription.dispose();
    this.unsubscribeAllFromBuffer();
    return this.element.remove();
  }

  addLeftTile(options) {
    let index;
    const newItem = options.item;
    const newPriority = (options != null ? options.priority : undefined) != null ? (options != null ? options.priority : undefined) : this.leftTiles[this.leftTiles.length - 1].priority + 1;
    let nextItem = null;
    for (index = 0; index < this.leftTiles.length; index++) {
      var {priority, item} = this.leftTiles[index];
      if (priority > newPriority) {
        nextItem = item;
        break;
      }
    }

    const newTile = new Tile(newItem, newPriority, this.leftTiles);
    this.leftTiles.splice(index, 0, newTile);
    const newElement = chevron.views.getView(newItem);
    const nextElement = chevron.views.getView(nextItem);
    this.leftPanel.insertBefore(newElement, nextElement);
    return newTile;
  }

  addRightTile(options) {
    let index;
    const newItem = options.item;
    const newPriority = (options != null ? options.priority : undefined) != null ? (options != null ? options.priority : undefined) : this.rightTiles[0].priority + 1;
    let nextItem = null;
    for (index = 0; index < this.rightTiles.length; index++) {
      var {priority, item} = this.rightTiles[index];
      if (priority < newPriority) {
        nextItem = item;
        break;
      }
    }

    const newTile = new Tile(newItem, newPriority, this.rightTiles);
    this.rightTiles.splice(index, 0, newTile);
    const newElement = chevron.views.getView(newItem);
    const nextElement = chevron.views.getView(nextItem);
    this.rightPanel.insertBefore(newElement, nextElement);
    return newTile;
  }

  getLeftTiles() {
    return this.leftTiles;
  }

  getRightTiles() {
    return this.rightTiles;
  }

  getActiveBuffer() {
    return this.buffer;
  }

  getActiveItem() {
    return chevron.workspace.getCenter().getActivePaneItem();
  }

  storeActiveBuffer() {
    return this.buffer = __guardMethod__(this.getActiveItem(), 'getBuffer', o => o.getBuffer());
  }

  subscribeToBuffer(event, callback) {
    this.bufferSubscriptions.push([event, callback]);
    if (this.buffer) { return this.buffer.on(event, callback); }
  }

  subscribeAllToBuffer() {
    if (!this.buffer) { return; }
    return (() => {
      const result = [];
      for (var [event, callback] of Array.from(this.bufferSubscriptions)) {
        result.push(this.buffer.on(event, callback));
      }
      return result;
    })();
  }

  unsubscribeAllFromBuffer() {
    if (!this.buffer) { return; }
    return (() => {
      const result = [];
      for (var [event, callback] of Array.from(this.bufferSubscriptions)) {
        result.push(this.buffer.off(event, callback));
      }
      return result;
    })();
  }
});

function __guardMethod__(obj, methodName, transform) {
  if (typeof obj !== 'undefined' && obj !== null && typeof obj[methodName] === 'function') {
    return transform(obj, methodName);
  } else {
    return undefined;
  }
}