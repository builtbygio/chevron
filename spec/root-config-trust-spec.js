const fs = require('fs');
const path = require('path');
const temp = require('temp').track();
const { conditionPromise } = require('./async-spec-helpers');

// Per-root config and trust, in a real window: the project asks the trust
// store, an untrusted root's risky settings wait, trusting applies them, and
// packages read the root's settings. docs/reference/config-precedence.md.
describe('Per-root config and trust', () => {
  let root, file, trusted;

  beforeEach(() => {
    jasmine.useRealClock();
    root = fs.realpathSync(temp.mkdirSync('root-config-trust'));
    fs.mkdirSync(path.join(root, '.chevron'));
    file = path.join(root, 'index.js');
    fs.writeFileSync(file, 'let x = 1;   \n');
    trusted = false;
    spyOn(chevron.applicationDelegate, 'isProjectTrusted').andCallFake(
      async () => trusted
    );
  });

  afterEach(() => {
    chevron.project.setPaths([]);
  });

  function writeRootConfig(settings) {
    fs.writeFileSync(
      path.join(root, '.chevron', 'config.json'),
      JSON.stringify(settings)
    );
  }

  it('holds back an untrusted root’s risky settings, says so once, and applies them when trusted', async () => {
    writeRootConfig({
      editor: { tabLength: 3 },
      lsp: { formatOnSave: true }
    });
    const notificationsBefore = chevron.notifications.getNotifications().length;
    chevron.project.setPaths([root]);
    await conditionPromise(
      () => chevron.applicationDelegate.isProjectTrusted.callCount > 0
    );
    await conditionPromise(
      () => chevron.notifications.getNotifications().length > notificationsBefore
    );

    expect(chevron.config.get('editor.tabLength', { root: file })).toBe(3);
    expect(chevron.config.get('lsp.formatOnSave', { root: file })).toBe(false);
    expect(chevron.config.getWithheldRootKeys(root)).toEqual(['lsp.formatOnSave']);

    const notification = chevron.notifications.getNotifications().slice(-1)[0];
    expect(notification.getMessage()).toMatch(/apply only once you trust/);
    expect(notification.getDetail()).toMatch(/lsp\.formatOnSave/);
    expect(notification.getOptions().buttons[0].text).toBe('Trust Project…');

    // A second load of the same root does not repeat the notification.
    chevron.project.syncRootConfigs();
    await chevron.project.syncRootTrust();
    expect(chevron.notifications.getNotifications().length).toBe(notificationsBefore + 1);

    // The main process broadcasts a trust change; the project re-asks.
    trusted = true;
    await chevron.project.syncRootTrust();
    expect(chevron.config.get('lsp.formatOnSave', { root: file })).toBe(true);
    expect(chevron.config.getWithheldRootKeys(root)).toEqual([]);

    trusted = false;
    await chevron.project.syncRootTrust();
    expect(chevron.config.get('lsp.formatOnSave', { root: file })).toBe(false);
  });

  it('does not ask about a root whose config only sets what any root may', async () => {
    writeRootConfig({ editor: { tabLength: 3 }, whitespace: { removeTrailingWhitespace: false } });
    chevron.project.setPaths([root]);
    await chevron.project.syncRootTrust();
    expect(chevron.applicationDelegate.isProjectTrusted).not.toHaveBeenCalled();
    expect(chevron.config.get('editor.tabLength', { root: file })).toBe(3);
  });

  it('whitespace honours the root’s settings on save', async () => {
    await chevron.packages.activatePackage(path.join(chevron.getLoadSettings().resourcePath, 'packages', 'whitespace'));
    // The trailing whitespace is off the cursor's row: whitespace leaves the
    // current line alone by default.
    const outside = path.join(fs.realpathSync(temp.mkdirSync('outside')), 'loose.js');
    fs.writeFileSync(outside, '// top\nlet y = 2;   \n');
    fs.writeFileSync(file, '// top\nlet x = 1;   \n');

    writeRootConfig({ whitespace: { removeTrailingWhitespace: false } });
    chevron.project.setPaths([root]);

    const inRoot = await chevron.workspace.open(file);
    await inRoot.save();
    expect(fs.readFileSync(file, 'utf8')).toBe('// top\nlet x = 1;   \n');

    const loose = await chevron.workspace.open(outside);
    await loose.save();
    expect(fs.readFileSync(outside, 'utf8')).toBe('// top\nlet y = 2;\n');
  });

  it('config:show-effective-settings names where each value came from', async () => {
    writeRootConfig({ editor: { tabLength: 3 }, lsp: { formatOnSave: true } });
    chevron.project.setPaths([root]);
    await chevron.project.syncRootTrust();
    await chevron.workspace.open(file);

    await chevron.commands.dispatch(
      chevron.views.getView(chevron.workspace),
      'config:show-effective-settings'
    );
    await conditionPromise(() => {
      const editor = chevron.workspace.getActiveTextEditor();
      return editor && !editor.getPath() && /Where these settings/.test(editor.getText());
    });
    const text = chevron.workspace.getActiveTextEditor().getText();
    expect(text).toContain(path.join(root, '.chevron', 'config.json'));
    expect(text).toMatch(/\| `editor\.tabLength` \| `3` \| project \|/);
    expect(text).toMatch(/## Waiting for trust/);
    expect(text).toMatch(/`lsp\.formatOnSave`/);
  });
});
