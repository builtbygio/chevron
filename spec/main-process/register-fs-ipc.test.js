/* globals assert */

const os = require('os');
const path = require('path');
const registerFsIpc = require('../../src/main-process/register-fs-ipc');

describe('register-fs-ipc strict roots', function() {
  const tmp = os.tmpdir();
  const outsideProject = path.sep + path.join('opt', 'chevron-fs-ipc-test-root');

  afterEach(function() {
    registerFsIpc.setFsIpcPolicy({ strict: true, roots: [] });
  });

  it('denies absolute paths outside configured roots', function() {
    registerFsIpc.setFsIpcPolicy({
      strict: true,
      roots: [tmp]
    });
    assert.isTrue(registerFsIpc.isAllowedFsPath(path.join(tmp, 'a')));
    assert.isFalse(registerFsIpc.isAllowedFsPath(outsideProject));
  });

  it('applyProjectRootsFromRenderer allows a newly opened project folder', function() {
    registerFsIpc.setFsIpcPolicy({
      strict: true,
      roots: [tmp]
    });
    assert.isFalse(registerFsIpc.isAllowedFsPath(outsideProject));

    registerFsIpc.applyProjectRootsFromRenderer({}, [outsideProject]);

    assert.isTrue(registerFsIpc.isAllowedFsPath(outsideProject));
    assert.isTrue(
      registerFsIpc.isAllowedFsPath(path.join(outsideProject, 'src', 'file.js'))
    );
  });
});
