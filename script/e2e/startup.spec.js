'use strict';

/**
 * The application starts, shows a workspace, and closes.
 *
 * The smallest useful test: it proves launch, wait, assertion, teardown and
 * artefact capture all work, which is what Phase 2 is for.
 */

const { test, expect } = require('@playwright/test');
const { launchChevron } = require('./launch');

test('opens a workspace window', async () => {
  const chevron = await launchChevron();
  try {
    await expect(
      chevron.window.locator('atom-workspace').first()
    ).toBeVisible({ timeout: 45000 });

    expect(await chevron.window.title()).toContain('Chevron');
  } finally {
    await chevron.close();
  }
});
