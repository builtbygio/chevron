const CompileCache = require('../src/compile-cache');

describe('Babel transpile support (removed, issue #62 / PR 11)', function() {
  it('does not register a .js Babel compiler', function() {
    expect(CompileCache.supportedExtensions).not.toContain('.js');
    expect(CompileCache.supportedExtensions).not.toContain('.coffee');
    expect(CompileCache.supportedExtensions).toContain('.ts');
  });
});
