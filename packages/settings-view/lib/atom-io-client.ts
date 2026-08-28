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

async function httpGetText(
  url: string,
  qs?: Record<string, string>
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const parsed = new URL(url);
  if (qs) {
    for (const [key, value] of Object.entries(qs)) {
      parsed.searchParams.set(key, value);
    }
  }
  const res = await fetch(parsed.toString(), {
    headers: { 'User-Agent': userAgent() }
  });
  return {
    status: res.status,
    body: await res.text(),
    headers: headerMap(res)
  };
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

class AtomIoClient {
  packageManager: any;
  baseURL: string;
  expiry: number;
  cachePath: string | undefined;

  constructor(packageManager: any, baseURL?: string) {
    this.packageManager = packageManager;
    this.baseURL =
      baseURL != null
        ? baseURL
        : (process.env.CPM_REGISTRY_URL ||
            process.env.ATOM_PACKAGE_REGISTRY ||
            'https://api.pulsar-edit.dev'
          ).replace(/\/+$/, '') + '/api/';
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
    const packagePath = `packages/${name}`;
    const data = this.fetchFromCache(packagePath);
    if (data) {
      return callback(null, data);
    }
    return this.request(packagePath, callback);
  }

  featuredPackages(callback: Function) {
    const data = this.fetchFromCache('packages/featured');
    if (data) {
      return callback(null, data);
    }
    return this.getFeatured(false, callback);
  }

  featuredThemes(callback: Function) {
    const data = this.fetchFromCache('themes/featured');
    if (data) {
      return callback(null, data);
    }
    return this.getFeatured(true, callback);
  }

  getFeatured(loadThemes: boolean, callback: Function) {
    return this.packageManager
      .getFeatured(loadThemes)
      .then((packages: any) => {
        const key = loadThemes ? 'themes/featured' : 'packages/featured';
        const cached = { data: packages, createdOn: Date.now() };
        localStorage.setItem(this.cacheKeyForPath(key), JSON.stringify(cached));
        return callback(null, packages);
      })
      .catch((error: any) => callback(error, null));
  }

  request(relPath: string, callback: Function) {
    return httpGetText(`${this.baseURL}${relPath}`)
      .then(({ body }) => {
        const parsed = this.parseJSON(body);
        delete parsed.versions;
        const cached = { data: parsed, createdOn: Date.now() };
        localStorage.setItem(this.cacheKeyForPath(relPath), JSON.stringify(cached));
        return callback(null, cached.data);
      })
      .catch((error: any) => callback(error));
  }

  cacheKeyForPath(relPath: string) {
    return `settings-view:${relPath}`;
  }

  online() {
    try {
      return navigator.onLine;
    } catch (error) {
      return true;
    }
  }

  fetchFromCache(packagePath: string) {
    let cached: any = localStorage.getItem(this.cacheKeyForPath(packagePath));
    cached = cached ? this.parseJSON(cached) : undefined;
    if (
      cached != null &&
      (!this.online() || Date.now() - cached.createdOn < this.expiry)
    ) {
      return cached.data;
    }
    return null;
  }

  createAvatarCache() {
    const { ipcRenderer } = require('electron');
    const onRoot = (root: string) => {
      if (root) this.cachePath = root;
    };
    const onErr = (error: any) =>
      console.warn('settings-view avatar cache ensure failed', error);
    return ipcRenderer.invoke('atom-settings-view-cache-ensure').then(onRoot).catch(onErr);
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
    return ipcRenderer.invoke('atom-settings-view-cache-list').then(handle).catch(callback);
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
          .invoke('atom-settings-view-cache-write', basename, body)
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
            .invoke('atom-settings-view-cache-unlink', child)
            .catch((error: any) => console.warn(`Error deleting avatar: ${child}`, error));
        }
      }
    };
    const onErr = (error: any) =>
      console.warn('settings-view avatar cache list failed', error);
    return ipcRenderer.invoke('atom-settings-view-cache-list').then(handle).catch(onErr);
  }

  getCachePath() {
    if (this.cachePath != null) return this.cachePath;
    this.cachePath = path.join(
      require('electron').ipcRenderer.sendSync('atom-app-get-path-sync', 'userData'),
      'Cache',
      'settings-view'
    );
    return this.cachePath;
  }

  search(query: string, options: { themes?: boolean; packages?: boolean }) {
    const qs: Record<string, string> = { q: query };
    if (options.themes) qs.filter = 'theme';
    else if (options.packages) qs.filter = 'package';

    return httpGetText(`${this.baseURL}packages/search`, qs).then(({ body }) => {
      const parsed = this.parseJSON(body);
      return parsed
        .filter((pkg: any) => pkg.releases != null && pkg.releases.latest != null)
        .map(({ readme, metadata, downloads, stargazers_count, repository }: any) => {
          const repositoryUrl =
            repository != null && repository.url != null ? repository.url : repository;
          return Object.assign(metadata, {
            readme,
            downloads,
            stargazers_count,
            repository: repositoryUrl
          });
        });
    }).catch((err: any) => {
      const error: any = new Error(`Searching for “${query}” failed.`);
      error.stderr = err && err.message ? err.message : String(err);
      throw error;
    });
  }

  parseJSON(s: string) {
    return JSON.parse(s);
  }
}

module.exports = AtomIoClient;
