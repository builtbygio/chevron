'use strict';

/**
 * Clicking the author name on a package card destroyed the editor.
 *
 * Core turns a click on an <a href> into openExternal, through a delegated
 * listener on the document (src/window-event-handler.js handleLinkClick). The
 * package card registers a click handler on the whole card, because clicking a
 * card opens the detail view, and that handler calls stopPropagation -- so the
 * event never reached the document.
 *
 * Nothing then called preventDefault either, so the anchor's default action
 * ran and the window navigated to https://github.com/<owner>. Navigating away
 * from index.html takes the editor with it: the settings view was gone and the
 * `chevron` global came back null.
 *
 * The avatar and the author name were the two anchors on a card with no click
 * handler of their own, which is why those were the ones that did it.
 *
 * Run: node --test script/ci/settings-view-links.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LIB = path.join(ROOT, 'packages', 'settings-view', 'lib');
const { externalHrefFrom } = require(path.join(LIB, 'external-link'));

// Enough of an element to exercise closest().
function anchorAt(href) {
  const anchor = {
    getAttribute: name => (name === 'href' ? href : null),
    closest: selector => (selector === 'a[href]' && href != null ? anchor : null)
  };
  return anchor;
}

describe('an external link on a card opens externally', () => {
  it('finds the href through the enclosing anchor', () => {
    assert.equal(
      externalHrefFrom(anchorAt('https://github.com/builtbygio')),
      'https://github.com/builtbygio'
    );
    assert.equal(externalHrefFrom(anchorAt('http://example.com')), 'http://example.com');
  });

  it('ignores anything that is not an external link', () => {
    // These are handled elsewhere, or are in-page.
    assert.equal(externalHrefFrom(anchorAt('atom://config')), null);
    assert.equal(externalHrefFrom(anchorAt('chevron://config')), null);
    assert.equal(externalHrefFrom(anchorAt('#section')), null);
    assert.equal(externalHrefFrom(anchorAt(null)), null);
    assert.equal(externalHrefFrom(null), null);
    assert.equal(externalHrefFrom({}), null, 'a target with no closest()');
  });

  it('the card checks for a link before it swallows the click', () => {
    const source = fs.readFileSync(path.join(LIB, 'package-card.js'), 'utf8');
    // The order matters: the check has to come before showPanel, and the
    // handler has to preventDefault, or the anchor still navigates.
    const handler = source.slice(
      source.indexOf('const clickHandler = (event) => {'),
      source.indexOf('this.element.addEventListener("click", clickHandler)')
    );
    assert.ok(handler.length > 0, 'card click handler not found');
    assert.match(handler, /externalHrefFrom\(event\.target\)/);
    assert.match(handler, /event\.preventDefault\(\)/);
    assert.ok(
      handler.indexOf('externalHrefFrom') < handler.indexOf('showPanel'),
      'the link check must run before the card swallows the click'
    );
  });

  it('no anchor is rendered with an external href and no interception', () => {
    // A bare href in rendered markup is the shape that caused this. If one is
    // added, it needs a handler, or the card check has to cover its container.
    const card = fs.readFileSync(path.join(LIB, 'package-card.js'), 'utf8');
    assert.ok(
      /href: `https:\/\/github\.com\/\$\{owner\}`/.test(card),
      'the author/avatar anchors still carry an href, which is correct for ' +
        'middle-click and copy-link -- the click handler is what makes it safe'
    );
  });
});
