'use strict';

/**
 * The minimap draws the whole buffer into the editor's height. A click is a
 * row, and the viewport rectangle is the same fraction of the file the
 * editor is showing.
 */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rowForY(y, height, lineCount) {
  if (lineCount <= 0 || height <= 0) return 0;
  const row = Math.floor((y / height) * lineCount);
  return clamp(row, 0, lineCount - 1);
}

function yForRow(row, height, lineCount) {
  if (lineCount <= 0 || height <= 0) return 0;
  return (row / lineCount) * height;
}

function viewportBox({ scrollTop, viewHeight, contentHeight, minimapHeight }) {
  const content = Math.max(contentHeight, viewHeight, 1);
  const height = Math.max(content, 1);
  const top = (Math.max(0, scrollTop) / height) * minimapHeight;
  const box = (Math.max(viewHeight, 1) / height) * minimapHeight;
  return {
    top,
    height: Math.min(Math.max(box, 8), minimapHeight)
  };
}

/**
 * A long file is drawn as a sample of its lines so a paint stays bounded.
 * `step` is 1 until the file is longer than `maxMarks`.
 */
function sampleStep(lineCount, maxMarks) {
  if (lineCount <= maxMarks) return 1;
  return Math.ceil(lineCount / maxMarks);
}

module.exports = { rowForY, yForRow, viewportBox, sampleStep };
