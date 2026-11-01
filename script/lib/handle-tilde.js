'use strict';

const os = require('os');
const passwdUser = require('passwd-user');
const path = require('path');

module.exports = function(aPath) {
  if (!aPath.startsWith('~')) {
    return aPath;
  }

  const sepIndex = aPath.indexOf(path.sep);
  const user = sepIndex < 0 ? aPath.substring(1) : aPath.substring(1, sepIndex);
  const rest = sepIndex < 0 ? '' : aPath.substring(sepIndex);
  const home =
    user === ''
      ? os.homedir()
      : (() => {
          // passwd-user 4 renamed sync → passwdUserSync and homedir → homeDirectory.
          const lookup = passwdUser.passwdUserSync || passwdUser.sync;
          const passwd = lookup(user);
          if (passwd === undefined) {
            throw new Error(
              `Failed to expand the tilde in ${aPath} - user "${user}" does not exist`
            );
          }
          return passwd.homedir || passwd.homeDirectory;
        })();

  return `${home}${rest}`;
};
