/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const path = require('path');
const fs = require('fs');
const temp = require('temp').track();
const TypeScriptTranspiler = require('../src/typescript');
const CSON = require('season');
const CompileCache = require('../src/compile-cache');

describe('CompileCache', function() {
  let [atomHome, fixtures] = Array.from([]);

  beforeEach(function() {
    fixtures = atom.project.getPaths()[0];
    atomHome = temp.mkdirSync('fake-atom-home');

    CSON.setCacheDir(null);
    CompileCache.resetCacheStats();

    return spyOn(TypeScriptTranspiler, 'compile').andReturn('the-typescript-code');
  });

  afterEach(function() {
    CompileCache.setAtomHomeDirectory(process.env.ATOM_HOME);
    CSON.setCacheDir(CompileCache.getCacheDirectory());
    try {
      return temp.cleanupSync();
    } catch (error) {}
  });

  describe('addPathToCache(filePath, atomHome)', function() {
    describe('when the given file is plain javascript', () => it('does not compile or cache the file', function() {
      CompileCache.addPathToCache(path.join(fixtures, 'sample.js'), atomHome);
      return expect(CompileCache.getCacheStats()['.js']).toBeUndefined();
  }));

    describe('when the given file is typescript', () => it('compiles the file with typescript and caches it', function() {
      CompileCache.addPathToCache(path.join(fixtures, 'typescript', 'valid.ts'), atomHome);
      expect(CompileCache.getCacheStats()['.ts']).toEqual({hits: 0, misses: 1});
      expect(TypeScriptTranspiler.compile.callCount).toBe(1);

      CompileCache.addPathToCache(path.join(fixtures, 'typescript', 'valid.ts'), atomHome);
      expect(CompileCache.getCacheStats()['.ts']).toEqual({hits: 1, misses: 1});
      return expect(TypeScriptTranspiler.compile.callCount).toBe(1);
    }));

    return describe('when the given file is CSON', () => it('compiles the file to JSON and caches it', function() {
      spyOn(CSON, 'setCacheDir').andCallThrough();
      spyOn(CSON, 'readFileSync').andCallThrough();

      CompileCache.addPathToCache(path.join(fixtures, 'cson.json'), atomHome);
      expect(CSON.readFileSync).toHaveBeenCalledWith(path.join(fixtures, 'cson.json'));
      expect(CSON.setCacheDir).toHaveBeenCalledWith(path.join(atomHome, '/compile-cache'));

      CSON.readFileSync.reset();
      CSON.setCacheDir.reset();
      CompileCache.addPathToCache(path.join(fixtures, 'cson.json'), atomHome);
      expect(CSON.readFileSync).toHaveBeenCalledWith(path.join(fixtures, 'cson.json'));
      return expect(CSON.setCacheDir).not.toHaveBeenCalled();
    }));
  });

  return describe('overriding Error.prepareStackTrace', function() {
    it('removes the override on the next tick, and always assigns the raw stack', function() {
      if (process.platform === 'win32') { return; } // Flakey Error.stack contents on Win32

      Error.prepareStackTrace = () => 'a-stack-trace';

      let error = new Error("Oops");
      expect(error.stack).toBe('a-stack-trace');
      expect(Array.isArray(error.getRawStack())).toBe(true);

      waits(1);
      return runs(function() {
        error = new Error("Oops again");
        expect(error.stack).toContain('compile-cache-spec.coffee');
        return expect(Array.isArray(error.getRawStack())).toBe(true);
      });
    });

    it('does not infinitely loop when the original prepareStackTrace value is reassigned', function() {
      const originalPrepareStackTrace = Error.prepareStackTrace;

      Error.prepareStackTrace = () => 'a-stack-trace';
      Error.prepareStackTrace = originalPrepareStackTrace;

      const error = new Error('Oops');
      expect(error.stack).toContain('compile-cache-spec.coffee');
      return expect(Array.isArray(error.getRawStack())).toBe(true);
    });

    return it('does not infinitely loop when the assigned prepareStackTrace calls the original prepareStackTrace', function() {
      const originalPrepareStackTrace = Error.prepareStackTrace;

      Error.prepareStackTrace = function(error, stack) {
        error.foo = 'bar';
        return originalPrepareStackTrace(error, stack);
      };

      const error = new Error('Oops');
      expect(error.stack).toContain('compile-cache-spec.coffee');
      expect(error.foo).toBe('bar');
      return expect(Array.isArray(error.getRawStack())).toBe(true);
    });
  });
});
