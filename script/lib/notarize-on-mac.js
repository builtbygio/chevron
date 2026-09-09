'use strict';

/**
 * Notarize a signed Chevron.app with Apple's notarytool and staple the ticket.
 *
 * Credentials come from the environment, in either form Apple supports:
 *   APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID
 *   APPLE_API_KEY (path to the .p8) + APPLE_API_KEY_ID + APPLE_API_ISSUER
 * These are the names electron-builder uses, so one set of CI secrets serves
 * both. Without them notarization is skipped and the caller is told so.
 *
 * altool, which the previous version of this file drove, was retired by Apple
 * in November 2023.
 */

function notaryCredentialsFromEnv(env = process.env) {
  if (env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID) {
    return {
      appleId: env.APPLE_ID,
      appleIdPassword: env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: env.APPLE_TEAM_ID
    };
  }
  if (env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER) {
    return {
      appleApiKey: env.APPLE_API_KEY,
      appleApiKeyId: env.APPLE_API_KEY_ID,
      appleApiIssuer: env.APPLE_API_ISSUER
    };
  }
  return null;
}

/** @returns {Promise<boolean>} whether the app was notarized */
module.exports = async function notarizeOnMac(packagedAppPath) {
  const credentials = notaryCredentialsFromEnv();
  if (!credentials) {
    console.log(
      'Skipping notarization: set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID (or an App Store Connect API key) to notarize.'
    );
    return false;
  }
  // @electron/notarize 3 is ESM-only.
  const { notarize } = await import('@electron/notarize');
  console.log(`Notarizing ${packagedAppPath} with notarytool`);
  await notarize({ appPath: packagedAppPath, ...credentials });
  console.log('Notarized and stapled');
  return true;
};

module.exports.notaryCredentialsFromEnv = notaryCredentialsFromEnv;
