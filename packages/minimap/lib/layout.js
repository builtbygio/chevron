'use strict';

/**
 * A short file keeps a fixed line size, so the thumbnail sits at the top of
 * the gutter instead of stretching each line into a bar. A long file shrinks
 * until it fits. A click is still a row.
 */

const LINE_PX = 3;
const CHAR_PX = 2;

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

function minimapScale(lineCount, minimapHeight) {
  const lines = Math.max(lineCount, 1);
  const natural = lines * LINE_PX;
  const scale = minimapHeight > 0 && natural > minimapHeight ? minimapHeight / natural : 1;
  return {
    lineHeight: LINE_PX * scale,
    charWidth: CHAR_PX * scale,
    contentHeight: natural * scale
  };
}

function scopeColor(scopes) {
  const text = Array.isArray(scopes) ? scopes.join(' ') : String(scopes || '');
  if (text.includes('comment')) return '#5c6370';
  if (text.includes('string')) return '#98c379';
  if (text.includes('constant') || text.includes('numeric')) return '#d19a6a';
  if (text.includes('entity')) return '#61afef';
  if (text.includes('storage') || text.includes('keyword')) return '#c678dd';
  return '#abb2bf';
}

module.exports = {
  rowForY,
  yForRow,
  viewportBox,
  sampleStep,
  minimapScale,
  scopeColor,
  LINE_PX,
  CHAR_PX
};
