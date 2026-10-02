const UpdateManager = require('../lib/update-manager');

describe('UpdateManager', () => {
  let updateManager;

  beforeEach(() => {
    updateManager = new UpdateManager();
  });

  describe('::getReleaseNotesURLForVersion', () => {
    it('returns the releases page for a dev version', () => {
      expect(
        updateManager.getReleaseNotesURLForVersion('1.7.0-dev-e44b57d')
      ).toBe('https://github.com/builtbygio/chevron/releases');
    });

    it('returns the page for the release when not a dev version', () => {
      const tag = 'https://github.com/builtbygio/chevron/releases/tag/';
      expect(updateManager.getReleaseNotesURLForVersion('1.7.0')).toBe(
        tag + 'v1.7.0'
      );
      expect(updateManager.getReleaseNotesURLForVersion('v1.7.0')).toBe(
        tag + 'v1.7.0'
      );
      expect(updateManager.getReleaseNotesURLForVersion('1.7.0-beta10')).toBe(
        tag + 'v1.7.0-beta10'
      );
    });
  });
});
