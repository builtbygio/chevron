// Core turns a click on an <a href> into openExternal, via a delegated listener
// on the document (src/window-event-handler.js). Anything that calls
// stopPropagation on the way up takes that away, and an anchor whose default
// action then runs navigates the window away from index.html -- which destroys
// the editor.
//
// The package cards stop propagation on every click, because a click anywhere
// on a card opens the detail view. So they have to recognise a link themselves.

// The http(s) href of the nearest enclosing anchor, or null.
function externalHrefFrom(target) {
  const anchor =
    target && typeof target.closest === 'function' ? target.closest('a[href]') : null;
  if (!anchor) return null;
  const href = anchor.getAttribute('href');
  return typeof href === 'string' && /^https?:\/\//.test(href) ? href : null;
}

module.exports = { externalHrefFrom };
