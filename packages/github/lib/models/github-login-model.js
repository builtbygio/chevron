"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _crypto = _interopRequireDefault(require("crypto"));

var _eventKit = require("event-kit");

var _keytarStrategy = require("../shared/keytar-strategy");

var _githubAppAuth = require("../github-app-auth");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

let instance = null;

class GithubLoginModel {
  // Classic PAT must have these OAuth scopes. GitHub App user tokens (ghu_)
  // do not use scopes; getScopes treats them as sufficient.
  static get() {
    if (!instance) {
      instance = new GithubLoginModel();
    }

    return instance;
  }

  constructor(Strategy) {
    this._Strategy = Strategy;
    this._strategy = null;
    this.emitter = new _eventKit.Emitter();
    this.checked = new Map();
  }

  async getStrategy() {
    if (this._strategy) {
      return this._strategy;
    }

    if (this._Strategy) {
      this._strategy = new this._Strategy();
      return this._strategy;
    }

    this._strategy = await (0, _keytarStrategy.createStrategy)();
    return this._strategy;
  }

  async getToken(account) {
    const strategy = await this.getStrategy();
    let password = await strategy.getPassword('atom-github', account);

    if (!password || password === _keytarStrategy.UNAUTHENTICATED) {
      // User is not logged in
      return _keytarStrategy.UNAUTHENTICATED;
    }

    if ((0, _githubAppAuth.isAppUserToken)(password) && /^https?:\/\//.test(account)) {
      password = await this.refreshAppTokenIfNeeded(account, password, strategy);
      if (!password || password === _keytarStrategy.UNAUTHENTICATED || password === _keytarStrategy.INSUFFICIENT) {
        return password;
      }
    }

    if (/^https?:\/\//.test(account)) {
      // Avoid storing tokens in memory longer than necessary. Let's cache token scope checks by storing a set of
      // checksums instead.
      const hash = _crypto.default.createHash('md5');

      hash.update(password);
      const fingerprint = hash.digest('base64');
      const outcome = this.checked.get(fingerprint);

      if (outcome === _keytarStrategy.UNAUTHENTICATED || outcome === _keytarStrategy.INSUFFICIENT) {
        // Cached failure
        return outcome;
      } else if (!outcome) {
        // No cached outcome. Query for scopes.
        try {
          const scopes = await this.getScopes(account, password);

          if (scopes === _keytarStrategy.UNAUTHORIZED) {
            // Password is incorrect. Treat it as though you aren't authenticated at all.
            this.checked.set(fingerprint, _keytarStrategy.UNAUTHENTICATED);
            return _keytarStrategy.UNAUTHENTICATED;
          }

          const scopeSet = new Set(scopes);

          for (const scope of this.constructor.REQUIRED_SCOPES) {
            if (!scopeSet.has(scope)) {
              // Token doesn't have enough OAuth scopes, need to reauthenticate
              this.checked.set(fingerprint, _keytarStrategy.INSUFFICIENT);
              return _keytarStrategy.INSUFFICIENT;
            }
          } // Successfully authenticated and had all required scopes.


          this.checked.set(fingerprint, true);
        } catch (e) {
          // Most likely a network error. Do not cache the failure.
          return e;
        }
      }
    }

    return password;
  }

  async setToken(account, token) {
    if (token && typeof token === 'object' && token.accessToken) {
      return this.setAppSession(account, token);
    }

    const strategy = await this.getStrategy();
    await strategy.replacePassword('atom-github', account, token);
    await strategy.deletePassword('atom-github', `${account}#refresh`);
    await strategy.deletePassword('atom-github', `${account}#expires`);
    this.didUpdate();
  }

  async setAppSession(account, {
    accessToken,
    refreshToken,
    expiresIn
  }) {
    const strategy = await this.getStrategy();
    await strategy.replacePassword('atom-github', account, accessToken);
    if (refreshToken) {
      await strategy.replacePassword('atom-github', `${account}#refresh`, refreshToken);
    }
    if (expiresIn) {
      await strategy.replacePassword('atom-github', `${account}#expires`, String(Date.now() + Number(expiresIn) * 1000));
    }
    this.checked.clear();
    this.didUpdate();
  }

  async refreshAppTokenIfNeeded(account, accessToken, strategy) {
    const expiresAt = await strategy.getPassword('atom-github', `${account}#expires`);
    const expiresMs = expiresAt && expiresAt !== _keytarStrategy.UNAUTHENTICATED ? Number(expiresAt) : 0;
    if (!expiresMs || Date.now() < expiresMs - 60 * 1000) {
      return accessToken;
    }
    const refreshToken = await strategy.getPassword('atom-github', `${account}#refresh`);
    if (!refreshToken || refreshToken === _keytarStrategy.UNAUTHENTICATED) {
      return accessToken;
    }
    try {
      const next = await (0, _githubAppAuth.refreshUserToken)({
        clientId: (0, _githubAppAuth.resolveClientId)(),
        refreshToken
      });
      await this.setAppSession(account, {
        accessToken: next.access_token,
        refreshToken: next.refresh_token || refreshToken,
        expiresIn: next.expires_in
      });
      return next.access_token;
    } catch (_e) {
      return _keytarStrategy.INSUFFICIENT;
    }
  }

  async removeToken(account) {
    const strategy = await this.getStrategy();
    await strategy.deletePassword('atom-github', account);
    await strategy.deletePassword('atom-github', `${account}#refresh`);
    await strategy.deletePassword('atom-github', `${account}#expires`);
    this.didUpdate();
  }
  /* istanbul ignore next */


  async getScopes(host, token) {
    if (chevron.inSpecMode()) {
      if (token === 'good-token') {
        return this.constructor.REQUIRED_SCOPES;
      }

      throw new Error('Attempt to check token scopes in specs');
    }

    let response;

    try {
      response = await fetch(host, {
        method: 'HEAD',
        headers: {
          Authorization: `bearer ${token}`
        }
      });
    } catch (e) {
      e.network = true;
      throw e;
    }

    if (response.status === 401) {
      return _keytarStrategy.UNAUTHORIZED;
    }

    if (response.status !== 200) {
      const e = new Error(`Unable to check token for OAuth scopes against ${host}`);
      e.response = response;
      e.responseText = await response.text();
      throw e;
    }

    const header = response.headers.get('X-OAuth-Scopes');
    if (!header) {
      // GitHub App user-to-server tokens (ghu_) do not use classic scopes.
      if ((0, _githubAppAuth.isAppUserToken)(token)) {
        return this.constructor.REQUIRED_SCOPES;
      }
      return [];
    }

    return header.split(/\s*,\s*/);
  }

  didUpdate() {
    this.emitter.emit('did-update');
  }

  onDidUpdate(cb) {
    return this.emitter.on('did-update', cb);
  }

  destroy() {
    this.emitter.dispose();
  }

}

exports.default = GithubLoginModel;

_defineProperty(GithubLoginModel, "REQUIRED_SCOPES", ['repo', 'read:org', 'user:email']);