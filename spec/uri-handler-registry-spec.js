/** @babel */

import url from 'url';

import URIHandlerRegistry from '../src/uri-handler-registry';

describe('URIHandlerRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new URIHandlerRegistry(5);
  });

  it('handles URIs on a per-host basis', async () => {
    const testPackageSpy = jasmine.createSpy();
    const otherPackageSpy = jasmine.createSpy();
    registry.registerHostHandler('test-package', testPackageSpy);
    registry.registerHostHandler('other-package', otherPackageSpy);

    await registry.handleURI('chevron://yet-another-package/path');
    expect(testPackageSpy).not.toHaveBeenCalled();
    expect(otherPackageSpy).not.toHaveBeenCalled();

    await registry.handleURI('chevron://test-package/path');
    expect(testPackageSpy).toHaveBeenCalledWith(
      url.parse('chevron://test-package/path', true),
      'chevron://test-package/path'
    );
    expect(otherPackageSpy).not.toHaveBeenCalled();

    await registry.handleURI('chevron://other-package/path');
    expect(otherPackageSpy).toHaveBeenCalledWith(
      url.parse('chevron://other-package/path', true),
      'chevron://other-package/path'
    );
  });

  it('keeps track of the most recent URIs', async () => {
    const spy1 = jasmine.createSpy();
    const spy2 = jasmine.createSpy();
    const changeSpy = jasmine.createSpy();
    registry.registerHostHandler('one', spy1);
    registry.registerHostHandler('two', spy2);
    registry.onHistoryChange(changeSpy);

    const uris = [
      'chevron://one/something?asdf=1',
      'chevron://fake/nothing',
      'chevron://two/other/stuff',
      'chevron://one/more/thing',
      'chevron://two/more/stuff'
    ];

    for (const u of uris) {
      await registry.handleURI(u);
    }

    expect(changeSpy.callCount).toBe(5);
    expect(registry.getRecentlyHandledURIs()).toEqual(
      uris
        .map((u, idx) => {
          return {
            id: idx + 1,
            uri: u,
            handled: !u.match(/fake/),
            host: url.parse(u).host
          };
        })
        .reverse()
    );

    await registry.handleURI('chevron://another/url');
    expect(changeSpy.callCount).toBe(6);
    const history = registry.getRecentlyHandledURIs();
    expect(history.length).toBe(5);
    expect(history[0].uri).toBe('chevron://another/url');
    expect(history[4].uri).toBe(uris[1]);
  });

  it('refuses to handle bad URLs', async () => {
    const invalidUris = [
      'atom:package/path',
      'atom:8080://package/path',
      'user:pass@chevron://package/path',
      'smth://package/path'
    ];

    let numErrors = 0;
    for (const uri of invalidUris) {
      try {
        await registry.handleURI(uri);
        expect(uri).toBe('throwing an error');
      } catch (ex) {
        numErrors++;
      }
    }

    expect(numErrors).toBe(invalidUris.length);
  });
});
