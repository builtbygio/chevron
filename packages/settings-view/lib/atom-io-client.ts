const path = require('path');

function userAgent(): string {
  try {
    return navigator.userAgent;
  } catch (error) {
    return 'Chevron-settings-view';
  }
}

function headerMap(res: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return headers;
}

async function httpGetBuffer(
  url: string
): Promise<{ status: number; body: Buffer; headers: Record<string, string> }> {
  const res = await fetch(url, { headers: { 'User-Agent': userAgent() } });
  const bytes = await res.arrayBuffer();
  return {
    status: res.status,
    body: Buffer.from(bytes),
    headers: headerMap(res)
  };
}

// Package cards' avatars, and the registry lookups the cards and detail view
// still ask for. Chevron has no package registry (#239), so `package` answers
// with an error rather than a network request.
class AtomIoClient {
  packageManager: any;
  expiry: number;
  cachePath: string | undefined;

  constructor(packageManager: any) {
    this.packageManager = packageManager;
    this.expiry = 1000 * 60 * 60 * 12;
    this.createAvatarCache();
    this.expireAvatarCache();
  }

  avatar(login: string, callback: Function) {
    return this.cachedAvatar(login, (err: any, cached: string | null) => {
      let stale = false;
      if (cached) {
        stale = Date.now() - parseInt(cached.split('-').pop() as string, 10) > this.expiry;
      }
      if (cached && (!stale || !this.online())) {
        return callback(null, cached);
      }
      return this.fetchAndCacheAvatar(login, callback);
    });
  }

  package(name: string, callback: Function) {
    return callback(new Error(`No package registry to look up ${name} in`));
  }

  online() {
    try {
      return navigator.onLine;
    } catch (error) {
      return true;
    }
  }

  createAvatarCache() {
    const { ipcRenderer } = require('electron');
    const onRoot = (root: string) => {
      if (root) this.cachePath = root;
    };
    const onErr = (error: any) =>
      console.warn('settings-view avatar cache ensure failed', error);
    return ipcRenderer.invoke('chevron:settings-view-cache-ensure').then(onRoot).catch(onErr);
  }

  avatarPath(login: string) {
    return path.join(this.getCachePath(), `${login}-${Date.now()}`);
  }

  cachedAvatar(login: string, callback: Function) {
    const { ipcRenderer } = require('electron');
    const root = this.getCachePath();
    const handle = (names: string[]) => {
      const files: string[] = [];
      for (const name of names || []) {
        if (name.indexOf(login + '-') !== 0) continue;
        const stamp = name.substring(login.length + 1);
        if (!/^\d+$/.test(stamp)) continue;
        files.push(path.join(root, name));
      }
      files.sort().reverse();
      for (const imagePath of files) {
        const createdOn = path.basename(imagePath).substring(login.length + 1);
        if (Date.now() - parseInt(createdOn, 10) < this.expiry) {
          return callback(null, imagePath);
        }
      }
      return callback(null, null);
    };
    return ipcRenderer.invoke('chevron:settings-view-cache-list').then(handle).catch(callback);
  }

  fetchAndCacheAvatar(login: string, callback: Function) {
    if (!this.online()) {
      return callback(null, null);
    }
    const basename = `${login}-${Date.now()}`;
    const imagePath = path.join(this.getCachePath(), basename);
    const { ipcRenderer } = require('electron');
    return httpGetBuffer(`https://avatars.githubusercontent.com/${login}`)
      .then(({ status, body, headers }) => {
        const contentType = headers['content-type'] || '';
        if (status !== 200 || contentType.indexOf('image/') !== 0) {
          return callback(new Error(`avatar fetch failed: ${status}`));
        }
        return ipcRenderer
          .invoke('chevron:settings-view-cache-write', basename, body)
          .then((result: any) => {
            if (result && result.ok) {
              return callback(null, result.path || imagePath);
            }
            return callback(new Error(result ? result.error : 'cache-write-failed'));
          });
      })
      .catch(callback);
  }

  expireAvatarCache() {
    const { ipcRenderer } = require('electron');
    const handle = (names: string[]) => {
      const files: Record<string, string[]> = {};
      for (const filename of names || []) {
        const parts = filename.split('-');
        const stamp = parts.pop();
        const key = parts.join('-');
        if (files[key] == null) files[key] = [];
        files[key].push(`${key}-${stamp}`);
      }
      for (const key of Object.keys(files)) {
        const children = files[key];
        children.sort();
        children.pop();
        for (const child of children) {
          ipcRenderer
            .invoke('chevron:settings-view-cache-unlink', child)
            .catch((error: any) => console.warn(`Error deleting avatar: ${child}`, error));
        }
      }
    };
    const onErr = (error: any) =>
      console.warn('settings-view avatar cache list failed', error);
    return ipcRenderer.invoke('chevron:settings-view-cache-list').then(handle).catch(onErr);
  }

  getCachePath() {
    if (this.cachePath != null) return this.cachePath;
    this.cachePath = path.join(
      require('electron').ipcRenderer.sendSync('chevron:app-get-path-sync', 'userData'),
      'Cache',
      'settings-view'
    );
    return this.cachePath;
  }
}

module.exports = AtomIoClient;
