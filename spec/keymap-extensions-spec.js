const temp = require('temp').track();
const fs = require('fs-plus');

describe('keymap-extensions', function() {
  beforeEach(function() {
    chevron.keymaps.configDirPath = temp.path('atom-spec-keymap-ext');
    fs.writeFileSync(chevron.keymaps.getUserKeymapPath(), '#');
    this.userKeymapLoaded = function() {};
    chevron.keymaps.onDidLoadUserKeymap(() => this.userKeymapLoaded());
  });

  afterEach(function() {
    fs.removeSync(chevron.keymaps.configDirPath);
    chevron.keymaps.destroy();
  });

  describe('did-load-user-keymap', () =>
    it('fires when user keymap is loaded', function() {
      spyOn(this, 'userKeymapLoaded');
      chevron.keymaps.loadUserKeymap();
      expect(this.userKeymapLoaded).toHaveBeenCalled();
    }));
});
