const fs = require("fs");
const path = require("path");
module.exports = {
  async enumerate() {
    if (chevron.inDevMode()) {
      return [];
    }
    const duplicatePackages = [];
    const names = chevron.packages.getAvailablePackageNames();
    for (let name of names) {
      if (chevron.packages.isBundledPackage(name)) {
        const isDuplicatedPackage = await this.isInstalledAsCommunityPackage(
          name
        );
        if (isDuplicatedPackage) {
          duplicatePackages.push(name);
        }
      }
    }
    return duplicatePackages;
  },
  async isInstalledAsCommunityPackage(name) {
    const availablePackagePaths = chevron.packages.getPackageDirPaths();
    for (let packagePath of availablePackagePaths) {
      const candidate = path.join(packagePath, name);
      if (fs.existsSync(candidate)) {
        const realPath = await this.realpath(candidate);
        if (realPath === candidate) {
          return true;
        }
      }
    }
    return false;
  },
  realpath(path2) {
    return new Promise((resolve, reject) => {
      fs.realpath(path2, function(error, realpath) {
        if (error) {
          reject(error);
        } else {
          resolve(realpath);
        }
      });
    });
  }
};
