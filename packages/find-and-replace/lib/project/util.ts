/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const _ = require('underscore-plus');

let escapeNode = null;

const escapeHtml = function(str) {
  if (escapeNode == null) { escapeNode = document.createElement('div'); }
  escapeNode.innerText = str;
  return escapeNode.innerHTML;
};

const escapeRegex = str => str.replace(/[.?*+^$[\]\\(){}|-]/g, match => "\\" + match);

const sanitizePattern = function(pattern) {
  pattern = escapeHtml(pattern);
  return pattern.replace(/\n/g, '\\n').replace(/\t/g, '\\t');
};

const getReplacementResultsMessage = function({findPattern, replacePattern, replacedPathCount, replacementCount}) {
  if (replacedPathCount) {
    return `<span class=\"text-highlight\">Replaced <span class=\"highlight-error\">${sanitizePattern(findPattern)}</span> with <span class=\"highlight-success\">${sanitizePattern(replacePattern)}</span> ${_.pluralize(replacementCount, 'time')} in ${_.pluralize(replacedPathCount, 'file')}</span>`;
  } else {
    return "<span class=\"text-highlight\">Nothing replaced</span>";
  }
};

const getSearchResultsMessage = function(results) {
  if ((results != null ? results.findPattern : undefined) != null) {
    const {findPattern, matchCount, pathCount, replacedPathCount} = results;
    if (matchCount) {
      return `${_.pluralize(matchCount, 'result')} found in ${_.pluralize(pathCount, 'file')} for <span class=\"highlight-info\">${sanitizePattern(findPattern)}</span>`;
    } else {
      return `No ${(replacedPathCount != null) ? 'more' : ''} results found for '${sanitizePattern(findPattern)}'`;
    }
  } else {
    return '';
  }
};

const showIf = function(condition) {
  if (condition) {
    return null;
  } else {
    return {display: 'none'};
  }
};

const capitalize = str => str[0].toUpperCase() + str.toLowerCase().slice(1);
const titleize = str => str.toLowerCase().replace(/(?:^|\s)\S/g, capital => capital.toUpperCase());

const preserveCase = function(text, reference) {
  // If replaced text is capitalized (strict) like a sentence, capitalize replacement
  if (reference === capitalize(reference.toLowerCase())) {
    return capitalize(text);

  // If replaced text is titleized (i.e., each word start with an uppercase), titleize replacement
  } else if (reference === titleize(reference.toLowerCase())) {
    return titleize(text);

  // If replaced text is uppercase, uppercase replacement
  } else if (reference === reference.toUpperCase()) {
    return text.toUpperCase();

  // If replaced text is lowercase, lowercase replacement
  } else if (reference === reference.toLowerCase()) {
    return text.toLowerCase();
  } else {
    return text;
  }
};


module.exports = {
  escapeHtml, escapeRegex, sanitizePattern, getReplacementResultsMessage,
  getSearchResultsMessage, showIf, preserveCase
};
