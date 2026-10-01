'use strict';

/**
 * Auto-indent for language modes.
 *
 * These methods lived on TextMateLanguageMode, and TreeSitterLanguageMode
 * borrowed them off its prototype. When the TextMate engine was deleted the
 * borrow had nowhere to point, so they moved here.
 *
 * The patterns come from package `settings/` (`editor.increaseIndentPattern`
 * and friends), written for oniguruma. They compile with `new RegExp` after
 * fromOniguruma() rewrites extended mode and possessive quantifiers; one that
 * still does not parse yields no regex, so that language gets no indent
 * adjustment.
 */

const { Point } = require('text-buffer');

// Rewrites the Oniguruma constructs the bundled settings use: extended mode
// `(?x)` / `(?x:...)` (whitespace and `#` comments ignored outside classes)
// and possessive quantifiers (`*+`, `++`, `?+`), which become greedy ones.
function fromOniguruma(source) {
  let out = '';
  const extended = [false];
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '\\') {
      out += c + (source[i + 1] || '');
      i++;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      out += c;
      continue;
    }
    if (c === '[') {
      inClass = true;
      out += c;
      if (source[i + 1] === '^') out += source[++i];
      if (source[i + 1] === ']') out += source[++i];
      continue;
    }
    if (c === '(') {
      const flagGroup = /^\(\?([imx]*)(?:-([imx]*))?([:)])/.exec(source.slice(i));
      if (flagGroup && (flagGroup[1] + (flagGroup[2] || '')).includes('x')) {
        const on = flagGroup[1].replace('x', '');
        const off = (flagGroup[2] || '').replace('x', '');
        const x = flagGroup[1].includes('x');
        i += flagGroup[0].length - 1;
        if (flagGroup[3] === ')') {
          // JavaScript has no standalone (?i); only (?x) is expected here.
          if (on || off) throw new Error('unsupported inline flags');
          extended[extended.length - 1] = x;
        } else {
          extended.push(x);
          out += on || off ? `(?${on}${off ? '-' + off : ''}:` : '(?:';
        }
        continue;
      }
      extended.push(extended[extended.length - 1]);
      out += c;
      continue;
    }
    if (c === ')') {
      if (extended.length > 1) extended.pop();
      out += c;
      continue;
    }
    if (extended[extended.length - 1]) {
      if (/\s/.test(c)) continue;
      if (c === '#') {
        while (i + 1 < source.length && source[i + 1] !== '\n') i++;
        continue;
      }
    }
    out += c;
    if ((c === '*' || c === '+' || c === '?') && source[i + 1] === '+') i++;
  }
  return out;
}

function compile(pattern) {
  if (!pattern) return null;
  if (pattern instanceof RegExp) return pattern;
  const source = Array.isArray(pattern) ? pattern[0] : pattern;
  const flags = Array.isArray(pattern) ? pattern[1] || '' : '';
  if (typeof source !== 'string') return null;
  try {
    return new RegExp(fromOniguruma(source), flags);
  } catch (error) {
    // Oniguruma syntax with no JavaScript equivalent: no indent adjustment.
    return null;
  }
}

const AutoIndent = {
  getNonWordCharacters(position) {
    const scope = this.scopeDescriptorForPosition(position);
    return this.config.get('editor.nonWordCharacters', { scope });
  },

  regexForPattern(pattern) {
    if (!pattern) return undefined;
    if (!this.regexesByPattern) this.regexesByPattern = {};
    const key = Array.isArray(pattern) ? pattern.join(' ') : pattern;
    if (!(key in this.regexesByPattern)) {
      this.regexesByPattern[key] = compile(pattern);
    }
    return this.regexesByPattern[key] || undefined;
  },

  increaseIndentRegexForScopeDescriptor(scope) {
    return this.regexForPattern(
      this.config.get('editor.increaseIndentPattern', { scope })
    );
  },

  decreaseIndentRegexForScopeDescriptor(scope) {
    return this.regexForPattern(
      this.config.get('editor.decreaseIndentPattern', { scope })
    );
  },

  decreaseNextIndentRegexForScopeDescriptor(scope) {
    return this.regexForPattern(
      this.config.get('editor.decreaseNextIndentPattern', { scope })
    );
  },

  suggestedIndentForEditedBufferRow(bufferRow, tabLength) {
    const line = this.buffer.lineForRow(bufferRow);
    const currentIndentLevel = this.indentLevelForLine(line, tabLength);
    if (currentIndentLevel === 0) return;

    const scopeDescriptor = this.scopeDescriptorForPosition(
      new Point(bufferRow, 0)
    );
    const decreaseIndentRegex = this.decreaseIndentRegexForScopeDescriptor(
      scopeDescriptor
    );
    if (!decreaseIndentRegex) return;
    if (!decreaseIndentRegex.test(line)) return;

    const precedingRow = this.buffer.previousNonBlankRow(bufferRow);
    if (precedingRow == null) return;

    const precedingLine = this.buffer.lineForRow(precedingRow);
    let desiredIndentLevel = this.indentLevelForLine(precedingLine, tabLength);

    const increaseIndentRegex = this.increaseIndentRegexForScopeDescriptor(
      scopeDescriptor
    );
    if (increaseIndentRegex && !increaseIndentRegex.test(precedingLine)) {
      desiredIndentLevel -= 1;
    }

    const decreaseNextIndentRegex = this.decreaseNextIndentRegexForScopeDescriptor(
      scopeDescriptor
    );
    if (decreaseNextIndentRegex && decreaseNextIndentRegex.test(precedingLine)) {
      desiredIndentLevel -= 1;
    }

    if (desiredIndentLevel < 0) return 0;
    if (desiredIndentLevel >= currentIndentLevel) return;
    return desiredIndentLevel;
  },

  _suggestedIndentForLineWithScopeAtBufferRow(
    bufferRow,
    line,
    scopeDescriptor,
    tabLength,
    options
  ) {
    const increaseIndentRegex = this.increaseIndentRegexForScopeDescriptor(
      scopeDescriptor
    );
    const decreaseIndentRegex = this.decreaseIndentRegexForScopeDescriptor(
      scopeDescriptor
    );
    const decreaseNextIndentRegex = this.decreaseNextIndentRegexForScopeDescriptor(
      scopeDescriptor
    );

    let precedingRow;
    if (!options || options.skipBlankLines !== false) {
      precedingRow = this.buffer.previousNonBlankRow(bufferRow);
      if (precedingRow == null) return 0;
    } else {
      precedingRow = bufferRow - 1;
      if (precedingRow < 0) return 0;
    }

    const precedingLine = this.buffer.lineForRow(precedingRow);
    let desiredIndentLevel = this.indentLevelForLine(precedingLine, tabLength);
    if (!increaseIndentRegex) return desiredIndentLevel;

    if (!this.isRowCommented(precedingRow)) {
      if (increaseIndentRegex.test(precedingLine)) desiredIndentLevel += 1;
      if (
        decreaseNextIndentRegex &&
        decreaseNextIndentRegex.test(precedingLine)
      ) {
        desiredIndentLevel -= 1;
      }
    }

    if (!this.buffer.isRowBlank(precedingRow)) {
      if (decreaseIndentRegex && decreaseIndentRegex.test(line)) {
        desiredIndentLevel -= 1;
      }
    }

    return Math.max(desiredIndentLevel, 0);
  }
};

module.exports = { AutoIndent, compileIndentPattern: compile, fromOniguruma };
