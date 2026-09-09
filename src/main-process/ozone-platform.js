'use strict';

/**
 * Which Ozone platform hint Chevron passes to Chromium on Linux.
 *
 * Electron defaults to X11 (XWayland on a Wayland desktop). `auto` picks
 * Wayland when the session offers it and falls back to X11 otherwise. An
 * explicit choice always wins: `--ozone-platform` / `--ozone-platform-hint`
 * on the command line, or ELECTRON_OZONE_PLATFORM_HINT in the environment.
 * CI sets both to x11 so the smoke test runs under Xvfb.
 *
 * Kept free of `electron` so it runs under node --test.
 */

const DEFAULT_HINT = 'auto';
const OZONE_SWITCHES = ['ozone-platform', 'ozone-platform-hint'];

function hasOzoneSwitch(argv) {
  return (argv || []).some(arg =>
    OZONE_SWITCHES.some(
      name => arg === `--${name}` || arg.startsWith(`--${name}=`)
    )
  );
}

/**
 * Returns the hint to append with app.commandLine.appendSwitch, or null when
 * the platform is not Linux or the choice was already made elsewhere.
 */
function ozonePlatformHintToApply({ platform, argv, env } = {}) {
  if (platform !== 'linux') return null;
  if (hasOzoneSwitch(argv)) return null;
  const fromEnv = env && env.ELECTRON_OZONE_PLATFORM_HINT;
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return null;
  return DEFAULT_HINT;
}

module.exports = {
  DEFAULT_HINT,
  OZONE_SWITCHES,
  hasOzoneSwitch,
  ozonePlatformHintToApply
};
