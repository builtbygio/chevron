class PaneResizeHandleElement extends HTMLElement {
  constructor() {
    super();
    this.resizePane = this.resizePane.bind(this);
    this.resizeStopped = this.resizeStopped.bind(this);
    this.subscribeToDOMEvents();
  }

  subscribeToDOMEvents() {
    this.addEventListener('dblclick', this.resizeToFitContent.bind(this));
    this.addEventListener('mousedown', this.resizeStarted.bind(this));
  }

  connectedCallback() {
    // For some reason Chromium 58 is firing the attached callback after the
    // element has been detached, so we ignore the callback when a parent element
    // can't be found.
    if (this.parentElement) {
      this.classList.add(this.isHorizontalAxis() ? 'horizontal' : 'vertical');
    }
  }

  // Read the axis at the moment it is needed rather than caching it here.
  //
  // static/index.js loads the document-register-element polyfill, and its
  // upgrade is asynchronous: connectedCallback can run a tick or more after
  // the element is in the DOM, and under the spec suite's mocked clock it had
  // not run at all by the time a drag was simulated. `isHorizontal` was then
  // undefined, the drag took the vertical branch, and resizing a row divided
  // by a zero height.
  //
  // Reading it live also fixes a real case: a handle moved between axes kept
  // whichever orientation it first saw.
  isHorizontalAxis() {
    return Boolean(
      this.parentElement && this.parentElement.classList.contains('horizontal')
    );
  }

  disconnectedCallback() {
    this.resizeStopped();
  }

  resizeToFitContent() {
    // clear flex-grow css style of both pane
    if (this.previousSibling != null) {
      this.previousSibling.model.setFlexScale(1);
    }
    return this.nextSibling != null
      ? this.nextSibling.model.setFlexScale(1)
      : undefined;
  }

  resizeStarted(e) {
    e.stopPropagation();
    if (!this.overlay) {
      this.overlay = document.createElement('div');
      this.overlay.classList.add('atom-pane-cursor-overlay');
      this.overlay.classList.add(this.isHorizontal ? 'horizontal' : 'vertical');
      this.appendChild(this.overlay);
    }
    document.addEventListener('mousemove', this.resizePane);
    document.addEventListener('mouseup', this.resizeStopped);
  }

  resizeStopped() {
    document.removeEventListener('mousemove', this.resizePane);
    document.removeEventListener('mouseup', this.resizeStopped);
    if (this.overlay) {
      this.removeChild(this.overlay);
      this.overlay = undefined;
    }
  }

  calcRatio(ratio1, ratio2, total) {
    const allRatio = ratio1 + ratio2;
    // A pane with no extent on the axis being dragged gives 0/0. Leaving the
    // scales alone is the only sane answer, and it keeps a NaN out of the
    // model, which nothing downstream recovers from.
    if (allRatio === 0) return null;
    return [(total * ratio1) / allRatio, (total * ratio2) / allRatio];
  }

  setFlexGrow(prevSize, nextSize) {
    this.prevModel = this.previousSibling.model;
    this.nextModel = this.nextSibling.model;
    const totalScale =
      this.prevModel.getFlexScale() + this.nextModel.getFlexScale();
    const flexGrows = this.calcRatio(prevSize, nextSize, totalScale);
    if (!flexGrows) return;
    this.prevModel.setFlexScale(flexGrows[0]);
    this.nextModel.setFlexScale(flexGrows[1]);
  }

  fixInRange(val, minValue, maxValue) {
    return Math.min(Math.max(val, minValue), maxValue);
  }

  resizePane({ clientX, clientY, which }) {
    if (which !== 1) {
      return this.resizeStopped();
    }
    if (this.previousSibling == null || this.nextSibling == null) {
      return this.resizeStopped();
    }

    if (this.isHorizontalAxis()) {
      const totalWidth =
        this.previousSibling.clientWidth + this.nextSibling.clientWidth;
      // get the left and right width after move the resize view
      let leftWidth =
        clientX - this.previousSibling.getBoundingClientRect().left;
      leftWidth = this.fixInRange(leftWidth, 0, totalWidth);
      const rightWidth = totalWidth - leftWidth;
      // set the flex grow by the ratio of left width and right width
      // to change pane width
      this.setFlexGrow(leftWidth, rightWidth);
    } else {
      const totalHeight =
        this.previousSibling.clientHeight + this.nextSibling.clientHeight;
      let topHeight =
        clientY - this.previousSibling.getBoundingClientRect().top;
      topHeight = this.fixInRange(topHeight, 0, totalHeight);
      const bottomHeight = totalHeight - topHeight;
      this.setFlexGrow(topHeight, bottomHeight);
    }
  }
}

window.customElements.define(
  'atom-pane-resize-handle',
  PaneResizeHandleElement
);

const createCustomElement = require('./create-custom-element');

function createPaneResizeHandleElement() {
  return createCustomElement(
    'atom-pane-resize-handle',
    PaneResizeHandleElement
  );
}

module.exports = {
  createPaneResizeHandleElement
};
