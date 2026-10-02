const ProtocolHandlerInstaller = require('../src/protocol-handler-installer');

describe('ProtocolHandlerInstaller', () => {
  let installer, notifications;

  function configWith(value) {
    return { get: () => value, set() {} };
  }

  beforeEach(() => {
    installer = new ProtocolHandlerInstaller();
    notifications = { addInfo: jasmine.createSpy('addInfo') };
    spyOn(installer, 'isSupported').andReturn(true);
    spyOn(installer, 'promptToBecomeProtocolClient');
    spyOn(installer, 'setAsDefaultProtocolClient').andReturn(
      Promise.resolve(true)
    );
  });

  describe('when Chevron is not the default chevron:// handler', () => {
    beforeEach(() => {
      spyOn(installer, 'isDefaultProtocolClient').andReturn(
        Promise.resolve(false)
      );
    });

    it('prompts when the setting is "prompt"', async () => {
      await installer.initialize(configWith('prompt'), notifications);
      expect(installer.promptToBecomeProtocolClient).toHaveBeenCalled();
      expect(installer.setAsDefaultProtocolClient).not.toHaveBeenCalled();
    });

    it('registers when the setting is "always"', async () => {
      await installer.initialize(configWith('always'), notifications);
      expect(installer.setAsDefaultProtocolClient).toHaveBeenCalled();
      expect(installer.promptToBecomeProtocolClient).not.toHaveBeenCalled();
    });
  });

  describe('when Chevron already is the default handler', () => {
    beforeEach(() => {
      spyOn(installer, 'isDefaultProtocolClient').andReturn(
        Promise.resolve(true)
      );
    });

    it('neither prompts nor registers', async () => {
      await installer.initialize(configWith('prompt'), notifications);
      await installer.initialize(configWith('always'), notifications);
      expect(installer.promptToBecomeProtocolClient).not.toHaveBeenCalled();
      expect(installer.setAsDefaultProtocolClient).not.toHaveBeenCalled();
    });
  });
});
