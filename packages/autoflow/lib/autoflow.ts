/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const _ = require('underscore-plus');

const CharacterPattern = new RegExp(`\
[\
^\\s\
]\
`);

module.exports = {
  activate() {
    return this.commandDisposable = chevron.commands.add('atom-text-editor', {
      'autoflow:reflow-selection': event => {
        return this.reflowSelection(event.currentTarget.getModel());
      }
    }
    );
  },

  deactivate() {
    if (this.commandDisposable != null) {
      this.commandDisposable.dispose();
    }
    return this.commandDisposable = null;
  },

  reflowSelection(editor) {
    let range = editor.getSelectedBufferRange();
    if (range.isEmpty()) { range = editor.getCurrentParagraphBufferRange(); }
    if (range == null) { return; }

    const reflowOptions = {
        wrapColumn: this.getPreferredLineLength(editor),
        tabLength: this.getTabLength(editor)
      };
    const reflowedText = this.reflow(editor.getTextInRange(range), reflowOptions);
    return editor.getBuffer().setTextInRange(range, reflowedText);
  },

  reflow(text, {wrapColumn, tabLength}) {
    let tabLengthInSpaces;
    const paragraphs = [];
    // Convert all \r\n and \r to \n. The text buffer will normalize them later
    text = text.replace(/\r\n?/g, '\n');

    let leadingVerticalSpace = text.match(/^\s*\n/);
    if (leadingVerticalSpace) {
      text = text.substr(leadingVerticalSpace.length);
    } else {
      leadingVerticalSpace = '';
    }

    let trailingVerticalSpace = text.match(/\n\s*$/);
    if (trailingVerticalSpace) {
      text = text.substr(0, text.length - trailingVerticalSpace.length);
    } else {
      trailingVerticalSpace = '';
    }

    const paragraphBlocks = text.split(/\n\s*\n/g);
    if (tabLength) {
      tabLengthInSpaces = Array(tabLength + 1).join(' ');
    } else {
      tabLengthInSpaces = '';
    }

    for (var block of Array.from(paragraphBlocks)) {
      var blockLines = block.split('\n');

      // For LaTeX tags surrounding the text, we simply ignore them, and
      // reproduce them verbatim in the wrapped text.
      var beginningLinesToIgnore = [];
      var endingLinesToIgnore = [];
      var latexTagRegex = /^\s*\\\w+(\[.*\])?\{\w+\}(\[.*\])?\s*$/g;    // e.g. \begin{verbatim}
      var latexTagStartRegex = /^\s*\\\w+\s*\{\s*$/g;                   // e.g. \item{
      var latexTagEndRegex = /^\s*\}\s*$/g;                             // e.g. }
      while ((blockLines.length > 0) && (
            blockLines[0].match(latexTagRegex) ||
            blockLines[0].match(latexTagStartRegex))) {
        beginningLinesToIgnore.push(blockLines[0]);
        blockLines.shift();
      }
      while ((blockLines.length > 0) && (
            blockLines[blockLines.length - 1].match(latexTagRegex) ||
            blockLines[blockLines.length - 1].match(latexTagEndRegex))) {
        endingLinesToIgnore.unshift(blockLines[blockLines.length - 1]);
        blockLines.pop();
      }

      // The paragraph might be a LaTeX section with no text, only tags:
      // \documentclass{article}
      // In that case, we have nothing to reflow.
      // Push the tags verbatim and continue to the next paragraph.
      if (!(blockLines.length > 0)) {
        paragraphs.push(block);
        continue;
      }

      // TODO: this could be more language specific. Use the actual comment char.
      // Remember that `-` has to be the last character in the character class.
      var linePrefix = blockLines[0].match(/^\s*(\/\/|\/\*|;;|#'|\|\|\||--|[#%*>-])?\s*/g)[0];
      var linePrefixTabExpanded = linePrefix;
      if (tabLengthInSpaces) {
        linePrefixTabExpanded = linePrefix.replace(/\t/g, tabLengthInSpaces);
      }

      if (linePrefix) {
        var escapedLinePrefix = _.escapeRegExp(linePrefix);
        blockLines = blockLines.map(blockLine => blockLine.replace(new RegExp(`^${escapedLinePrefix}`), ''));
      }

      blockLines = blockLines.map(blockLine => blockLine.replace(/^\s+/, ''));

      var lines = [];
      var currentLine = [];
      var currentLineLength = linePrefixTabExpanded.length;

      var wrappedLinePrefix = linePrefix
        .replace(/^(\s*)\/\*/, '$1  ')
        .replace(/^(\s*)-(?!-)/, '$1 ');

      var firstLine = true;
      for (var segment of Array.from(this.segmentText(blockLines.join(' ')))) {
        if (this.wrapSegment(segment, currentLineLength, wrapColumn)) {

          // Independent of line prefix don't mess with it on the first line
          if (firstLine !== true) {
            // Handle C comments
            if ((linePrefix.search(/^\s*\/\*/) !== -1) || (linePrefix.search(/^\s*-(?!-)/) !== -1)) {
              linePrefix = wrappedLinePrefix;
            }
          }
          lines.push(linePrefix + currentLine.join(''));
          currentLine = [];
          currentLineLength = linePrefixTabExpanded.length;
          firstLine = false;
        }
        currentLine.push(segment);
        currentLineLength += segment.length;
      }
      lines.push(linePrefix + currentLine.join(''));

      var wrappedLines = beginningLinesToIgnore.concat(lines.concat(endingLinesToIgnore));
      paragraphs.push(wrappedLines.join('\n').replace(/\s+\n/g, '\n'));
    }

    return leadingVerticalSpace + paragraphs.join('\n\n') + trailingVerticalSpace;
  },

  getTabLength(editor) {
    let left;
    return (left = chevron.config.get('editor.tabLength', {scope: editor.getRootScopeDescriptor()})) != null ? left : 2;
  },

  getPreferredLineLength(editor) {
    return chevron.config.get('editor.preferredLineLength', {scope: editor.getRootScopeDescriptor()});
  },

  wrapSegment(segment, currentLineLength, wrapColumn) {
    return CharacterPattern.test(segment) &&
      ((currentLineLength + segment.length) > wrapColumn) &&
      ((currentLineLength > 0) || (segment.length < wrapColumn));
  },

  segmentText(text) {
    let match;
    const segments = [];
    const re = /[\s]+|[^\s]+/g;
    while ((match = re.exec(text))) { segments.push(match[0]); }
    return segments;
  }
};
