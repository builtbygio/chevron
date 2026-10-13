'use strict';

/**
 * The outline panel's data: symbol trees from a language server, fold trees
 * from a grammar, and which entry the cursor is in.
 *
 * The panel draws whatever these return, so a wrong nesting or a key that
 * changes on every refresh shows up here rather than as an outline that
 * forgets what was collapsed each time the file is edited.
 *
 * docs/reference/code-context.md
 * Run: node --test script/ci/outline.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const { fromSymbols, fromFolds, pathAt, countNodes } = require(path.join(
  ROOT,
  'packages',
  'outline',
  'lib',
  'outline-tree'
));
const {
  normalizeDocumentSymbols,
  normalizeDocumentSymbolTree
} = require(path.join(ROOT, 'src', 'lsp', 'providers', 'document-symbols'));

const pos = (line, character) => ({ line, character });
const lspRange = (a, b, c, d) => ({ start: pos(a, b), end: pos(c, d) });

// Labelling is enclosing-scopes.test.js's business; this only needs one.
const label = text => text.trim().replace(/[\s{([,]+$/, '');

const labels = nodes =>
  nodes.map(n =>
    n.children.length ? { [n.label]: labels(n.children) } : n.label
  );

describe('document symbols as a tree', () => {
  const documentSymbols = [
    {
      name: 'Outer',
      kind: 5,
      range: lspRange(0, 0, 9, 1),
      selectionRange: lspRange(0, 6, 0, 11),
      children: [
        {
          name: 'method',
          kind: 6,
          detail: '(a: number)',
          range: lspRange(1, 2, 4, 3),
          selectionRange: lspRange(1, 2, 1, 8)
        },
        {
          name: 'other',
          kind: 6,
          range: lspRange(5, 2, 8, 3),
          selectionRange: lspRange(5, 2, 5, 7)
        }
      ]
    },
    {
      name: 'helper',
      kind: 12,
      range: lspRange(11, 0, 13, 1),
      selectionRange: lspRange(11, 9, 11, 15)
    }
  ];

  it('keeps DocumentSymbol children, with the whole range and the name range', () => {
    const tree = normalizeDocumentSymbolTree(documentSymbols);
    assert.deepEqual(labels(fromSymbols(tree)), [
      { Outer: ['method', 'other'] },
      'helper'
    ]);
    const method = tree[0].children[0];
    assert.equal(method.kindName, 'Method');
    assert.equal(method.detail, '(a: number)');
    assert.deepEqual(method.range.start, { row: 1, column: 2 });
    assert.deepEqual(method.range.end, { row: 4, column: 3 });
    assert.deepEqual(method.selectionRange.end, { row: 1, column: 8 });
  });

  it('leaves the flat list that symbols-view and lsp-ui read unchanged', () => {
    assert.deepEqual(
      normalizeDocumentSymbols(documentSymbols).map(s => [
        s.name,
        s.containerName
      ]),
      [
        ['Outer', null],
        ['method', 'Outer'],
        ['other', 'Outer'],
        ['helper', null]
      ]
    );
  });

  it('nests flat SymbolInformation by range, not by containerName', () => {
    const uri = 'file:///p/a.ts';
    const at = (a, b, c, d) => ({ uri, range: lspRange(a, b, c, d) });
    // Two containers named `Box`: by name, `open` could belong to either.
    const tree = normalizeDocumentSymbolTree(
      [
        {
          name: 'open',
          kind: 6,
          location: at(12, 2, 13, 3),
          containerName: 'Box'
        },
        { name: 'Box', kind: 5, location: at(0, 0, 5, 1) },
        {
          name: 'size',
          kind: 7,
          location: at(1, 2, 1, 12),
          containerName: 'Box'
        },
        { name: 'Box', kind: 5, location: at(10, 0, 15, 1) },
        {
          name: 'elsewhere',
          kind: 12,
          location: { uri: 'file:///p/b.ts', range: lspRange(2, 0, 3, 0) }
        }
      ],
      undefined,
      uri
    );
    assert.deepEqual(labels(fromSymbols(tree)), [
      { Box: ['size'] },
      { Box: ['open'] }
    ]);
  });

  it('is empty for a result that is not a list', () => {
    assert.deepEqual(normalizeDocumentSymbolTree(null), []);
    assert.deepEqual(fromSymbols(normalizeDocumentSymbolTree({})), []);
  });

  it('jumps to the name, not to the start of the declaration', () => {
    const [outer] = fromSymbols(normalizeDocumentSymbolTree(documentSymbols));
    assert.deepEqual(outer.target, { row: 0, column: 6 });
    assert.equal(outer.startRow, 0);
    assert.equal(outer.endRow, 9);
  });
});

describe('folds as a tree', () => {
  const fold = (startRow, endRow) => ({
    start: { row: startRow, column: 0 },
    end: { row: endRow, column: 0 }
  });
  const lines = [
    'class Outer {', //            0
    '  method(a) {', //            1
    '    if (a > 0) {', //         2
    '      run();', //             3
    '    } else {', //             4
    '      stop();', //            5
    '    }', //                    6
    '  }', //                      7
    '  {', //                      8
    '    const inner = () => {', // 9
    '    };', //                  10
    '  }', //                     11
    '}' //                        12
  ];
  const lineText = row => lines[row];
  const ranges = [
    fold(0, 12),
    fold(0, 12), // a second fold opening on the same line, as tree-sitter gives
    fold(1, 7),
    fold(2, 4),
    fold(4, 6),
    fold(8, 11), // a bare block: no label, so its child moves up
    fold(9, 10)
  ];

  it('nests by containment and labels by the opening line', () => {
    assert.deepEqual(labels(fromFolds(ranges, lineText, label)), [
      {
        'class Outer': [
          { 'method(a)': ['if (a > 0)', '} else'] },
          'const inner = () =>'
        ]
      }
    ]);
  });

  it('does not depend on the order the grammar returns folds in', () => {
    const shuffled = [
      ranges[5],
      ranges[3],
      ranges[0],
      ranges[6],
      ranges[2],
      ranges[4]
    ];
    assert.deepEqual(
      labels(fromFolds(shuffled, lineText, label)),
      labels(fromFolds(ranges, lineText, label))
    );
  });

  it('jumps to the first character of the opening line', () => {
    const [outer] = fromFolds(ranges, lineText, label);
    assert.deepEqual(outer.children[0].target, { row: 1, column: 2 });
  });

  it('names a multi-line signature or condition once, by its first line', () => {
    const source = [
      '/**', //                                   0
      ' * Parses.', //                            1
      ' */', //                                   2
      'export function parse(', //                3
      '  text: string,', //                       4
      '  options = {}', //                        5
      '): Result {', //                           6
      '  while (', //                             7
      '    more()', //                            8
      '  ) {', //                                 9
      '    step();', //                        10
      '  }', //                                  11
      '}' //                                     12
    ];
    const tree = fromFolds(
      [fold(0, 2), fold(3, 5), fold(6, 12), fold(7, 8), fold(9, 11)],
      row => source[row],
      label
    );
    assert.deepEqual(labels(tree), [{ 'export function parse': ['while'] }]);
    const [parse] = tree;
    assert.equal(parse.startRow, 3);
    assert.equal(parse.endRow, 12);
    assert.deepEqual(parse.target, { row: 3, column: 0 });
    assert.deepEqual(pathAt(tree, 10).map(n => n.label), [
      'export function parse',
      'while'
    ]);
  });

  it('leaves out comment folds but keeps preprocessor blocks', () => {
    const source = ['/**', ' */', '# a comment', '#', '#if DEBUG', '#endif'];
    assert.deepEqual(
      labels(
        fromFolds(
          [fold(0, 1), fold(2, 3), fold(4, 5)],
          row => source[row],
          label
        )
      ),
      ['#if DEBUG']
    );
  });

  it('ignores malformed ranges', () => {
    assert.deepEqual(
      fromFolds(
        [null, {}, { start: { row: NaN }, end: { row: 1 } }],
        lineText,
        label
      ),
      []
    );
  });

  it('counts every node', () => {
    assert.equal(countNodes(fromFolds(ranges, lineText, label)), 5);
  });
});

describe('the entry the cursor is in', () => {
  const tree = fromSymbols(
    normalizeDocumentSymbolTree([
      {
        name: 'Outer',
        kind: 5,
        range: lspRange(0, 0, 12, 1),
        selectionRange: lspRange(0, 6, 0, 11),
        children: [
          {
            name: 'first',
            kind: 6,
            range: lspRange(1, 2, 4, 3),
            selectionRange: lspRange(1, 2, 1, 7)
          },
          {
            name: 'second',
            kind: 6,
            range: lspRange(4, 2, 7, 3),
            selectionRange: lspRange(4, 2, 4, 8)
          }
        ]
      }
    ])
  );
  const at = row => pathAt(tree, row).map(n => n.label);

  it('is the innermost, with its ancestors outermost first', () => {
    assert.deepEqual(at(2), ['Outer', 'first']);
  });

  it('is the later entry on a line where one ends and the next begins', () => {
    assert.deepEqual(at(4), ['Outer', 'second']);
  });

  it('is the container between its children, and nothing outside', () => {
    assert.deepEqual(at(9), ['Outer']);
    assert.deepEqual(at(20), []);
  });
});

describe('keys', () => {
  const sym = (name, a, b, children = []) => ({
    name,
    kind: 6,
    range: lspRange(a, 0, b, 0),
    selectionRange: lspRange(a, 0, a, 1),
    children
  });

  it('survive edits that move entries, so collapsed state is kept', () => {
    const before = fromSymbols(
      normalizeDocumentSymbolTree([sym('A', 0, 9, [sym('run', 1, 3)])])
    );
    const after = fromSymbols(
      normalizeDocumentSymbolTree([
        sym('A', 0, 19, [sym('added', 1, 8), sym('run', 10, 13)])
      ])
    );
    assert.equal(after[0].children[1].key, before[0].children[0].key);
  });

  it('tell overloads and same-named members of different parents apart', () => {
    const tree = fromSymbols(
      normalizeDocumentSymbolTree([
        sym('A', 0, 9, [sym('run', 1, 2), sym('run', 3, 4)]),
        sym('B', 10, 19, [sym('run', 11, 12)])
      ])
    );
    const keys = [
      tree[0].children[0].key,
      tree[0].children[1].key,
      tree[1].children[0].key
    ];
    assert.equal(new Set(keys).size, 3);
  });
});
