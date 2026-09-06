'use strict';

/**
 * The application starts, shows a workspace, and closes.
 *
 * The smallest useful test: it proves launch, wait, assertion, teardown and
 * artefact capture all work, which is what Phase 2 is for.
 */

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { launchChevron } = require('./launch');

// A first run opens the Welcome Guide, which changes the window title and
// whatever else a later test might look at. Turn it off so the starting state
// is the same everywhere.
function quietFirstRun(home) {
  fs.writeFileSync(
    path.join(home, 'config.json'),
    JSON.stringify({ '*': { welcome: { showOnStartup: false } } })
  );
}

test('opens a workspace window', async () => {
  const chevron = await launchChevron({ prepareHome: quietFirstRun });
  try {
    await expect(
      chevron.window.locator('atom-workspace').first()
    ).toBeVisible({ timeout: 45000 });

    const title = await chevron.window.title();
    expect(title.length).toBeGreaterThan(0);

    // src/workspace.js appends the application name to the title on every
    // platform but macOS, where the convention is to leave it to the menu bar.
    if (process.platform === 'darwin') {
      expect(title).not.toContain('— Chevron');
    } else {
      expect(title).toContain('Chevron');
    }
  } finally {
    await chevron.close();
  }
});
