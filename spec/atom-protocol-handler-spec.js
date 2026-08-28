/*
 * Electron BP P0.1: path confinement for chevron:// resolution helpers.
 * Pure unit tests (no Electron protocol registration).
 */

const path = require('path');
const {
  pathContained,
  relativePathFromAtomUrl
} = require('../src/main-process/atom-protocol-path');

describe('atom-protocol-handler path confinement (P0.1)', function() {
  describe('pathContained', function() {
    it('allows the root itself and children', function() {
      const root = path.resolve('/tmp/chevron-assets');
      expect(pathContained(root, root)).toBe(true);
      expect(pathContained(root, path.join(root, 'logo.png'))).toBe(true);
      expect(pathContained(root, path.join(root, 'a', 'b', 'c'))).toBe(true);
    });

    it('rejects parent and sibling escapes', function() {
      const root = path.resolve('/tmp/chevron-pkg');
      expect(pathContained(root, path.resolve(root, '..'))).toBe(false);
      expect(pathContained(root, path.resolve(root, '..', 'etc', 'passwd'))).toBe(
        false
      );
      expect(pathContained(root, path.resolve('/tmp/other'))).toBe(false);
    });

    it('rejects prefix false friends', function() {
      const root = path.resolve('/tmp/pkg');
      expect(pathContained(root, path.resolve('/tmp/pkg-evil/x'))).toBe(false);
    });
  });

  describe('relativePathFromAtomUrl', function() {
    it('parses chevron:// package paths', function() {
      expect(relativePathFromAtomUrl('chevron://tree-view/styles/tree.less')).toBe(
        path.join('tree-view', 'styles', 'tree.less')
      );
      expect(
        relativePathFromAtomUrl('chevron://settings-view/lib/main.js')
      ).toBe(path.join('settings-view', 'lib', 'main.js'));
    });

    it('rejects traversal and absolute paths', function() {
      expect(relativePathFromAtomUrl('chevron://../../etc/passwd')).toBe(null);
      expect(relativePathFromAtomUrl('chevron://foo/../../../etc/hosts')).toBe(
        null
      );
      expect(relativePathFromAtomUrl('chevron://assets/../../../etc/hosts')).toBe(
        null
      );
      expect(relativePathFromAtomUrl('chevron:///etc/passwd')).toBe(null);
    });

    it('strips query and hash', function() {
      expect(
        relativePathFromAtomUrl('chevron://tree-view/x.js?cache=1#frag')
      ).toBe(path.join('tree-view', 'x.js'));
    });

    it('rejects empty', function() {
      expect(relativePathFromAtomUrl('chevron://')).toBe(null);
      expect(relativePathFromAtomUrl('')).toBe(null);
    });
  });
});
