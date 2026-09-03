'use strict';

/**
 * Markdown parses in two passes: the block grammar leaves every run of inline
 * text as one `inline` node, and a second grammar parses what is inside it.
 * Fenced code is the same idea with the language named in the fence.
 *
 * The block grammar alone would highlight headings and lists but leave every
 * **bold**, `code` and [link] flat, so the inline injection is not optional.
 */

function infoString(node) {
  const info = node.children.find(child => child.type === 'info_string');
  if (!info) return undefined;
  // ```js title="x" — the language is the first word.
  const text = info.text.trim().split(/\s+/)[0];
  return text ? text.toLowerCase() : undefined;
}

module.exports = {
  activate() {
    const grammars = global.chevron && global.chevron.grammars;
    if (!grammars || typeof grammars.addInjectionPoint !== 'function') return;

    grammars.addInjectionPoint('source.gfm', {
      type: 'inline',
      language() {
        return 'markdown_inline';
      },
      content(node) {
        return node;
      },
      // Without this the injected range is only the gaps between the node's
      // children, and the inline parser is handed nothing to parse.
      includeChildren: true
    });

    grammars.addInjectionPoint('source.gfm', {
      type: 'fenced_code_block',
      language(node) {
        return infoString(node);
      },
      content(node) {
        return node.children.filter(child => child.type === 'code_fence_content');
      },
      includeChildren: true
    });
  },

  deactivate() {}
};
