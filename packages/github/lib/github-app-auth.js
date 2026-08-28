'use strict';

/**
 * 8B: GitHub App user-to-server auth via the OAuth device flow.
 * Client ID is public. Device flow does not need a client secret.
 * User access tokens start with ghu_ and do not use classic scopes.
 */

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GRANT_DEVICE = 'urn:ietf:params:oauth:grant-type:device_code';

function resolveClientId() {
  try {
    if (typeof chevron !== 'undefined' && chevron.config) {
      const fromConfig = chevron.config.get('github.oauthClientId');
      if (fromConfig && String(fromConfig).trim()) {
        return String(fromConfig).trim();
      }
    }
  } catch (_e) {
    /* no Atom config in some tests */
  }
  if (process.env.CHEVRON_GITHUB_CLIENT_ID) {
    return String(process.env.CHEVRON_GITHUB_CLIENT_ID).trim();
  }
  return '';
}

function isAppUserToken(token) {
  return typeof token === 'string' && token.startsWith('ghu_');
}

async function postForm(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  let payload;
  try {
    payload = await response.json();
  } catch (_e) {
    payload = {};
  }
  return {response, payload};
}

async function requestDeviceCode(clientId) {
  const {response, payload} = await postForm(DEVICE_CODE_URL, {
    client_id: clientId
  });
  if (!response.ok || payload.error || !payload.device_code) {
    const err = new Error(
      payload.error_description ||
        payload.error ||
        `Device authorization failed (${response.status})`
    );
    err.code = payload.error;
    throw err;
  }
  return payload;
}

async function pollAccessToken({clientId, deviceCode, interval, signal}) {
  let waitMs = Math.max(5, interval || 5) * 1000;
  while (!signal || !signal.aborted) {
    await new Promise(resolve => setTimeout(resolve, waitMs));
    if (signal && signal.aborted) {
      const err = new Error('Login cancelled');
      err.code = 'cancelled';
      throw err;
    }
    const {payload} = await postForm(TOKEN_URL, {
      client_id: clientId,
      device_code: deviceCode,
      grant_type: GRANT_DEVICE
    });
    if (payload.access_token) {
      return payload;
    }
    if (payload.error === 'authorization_pending') {
      continue;
    }
    if (payload.error === 'slow_down') {
      waitMs = (Number(payload.interval) || interval || 5) * 1000;
      continue;
    }
    const err = new Error(
      payload.error_description || payload.error || 'Device login failed'
    );
    err.code = payload.error;
    throw err;
  }
  const err = new Error('Login cancelled');
  err.code = 'cancelled';
  throw err;
}

async function refreshUserToken({clientId, refreshToken}) {
  const {payload} = await postForm(TOKEN_URL, {
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });
  if (!payload.access_token) {
    const err = new Error(
      payload.error_description || payload.error || 'Token refresh failed'
    );
    err.code = payload.error;
    throw err;
  }
  return payload;
}

module.exports = {
  resolveClientId,
  isAppUserToken,
  requestDeviceCode,
  pollAccessToken,
  refreshUserToken
};
