/*
 * Electron BP P0.1: path confinement for chevron:// resolution helpers.
 * Pure unit tests (no Electron protocol registration).
 */

const path = require('path');
const {
  pathContained,
  relativePathFromChevronUrl
} = require('../src/main-process/chevron-protocol-path');

describe('chevron-protocol-handler path confinement (P0.1)', function() {
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

  describe('relativePathFromChevronUrl', function() {
    it('parses chevron:// package paths', function() {
      expect(relativePathFromChevronUrl('chevron://tree-view/styles/tree.less')).toBe(
        path.join('tree-view', 'styles', 'tree.less')
      );
      expect(
        relativePathFromChevronUrl('chevron://settings-view/lib/main.js')
      ).toBe(path.join('settings-view', 'lib', 'main.js'));
    });

    it('rejects traversal and absolute paths', function() {
      expect(relativePathFromChevronUrl('chevron://../../etc/passwd')).toBe(null);
      expect(relativePathFromChevronUrl('chevron://foo/../../../etc/hosts')).toBe(
        null
      );
      expect(relativePathFromChevronUrl('chevron://assets/../../../etc/hosts')).toBe(
        null
      );
      expect(relativePathFromChevronUrl('chevron:///etc/passwd')).toBe(null);
    });

    it('strips query and hash', function() {
      expect(
        relativePathFromChevronUrl('chevron://tree-view/x.js?cache=1#frag')
      ).toBe(path.join('tree-view', 'x.js'));
    });

    it('rejects empty', function() {
      expect(relativePathFromChevronUrl('chevron://')).toBe(null);
      expect(relativePathFromChevronUrl('')).toBe(null);
    });
  });
});
