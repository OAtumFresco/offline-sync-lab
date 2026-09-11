import { test, expect, openLab, saveNote } from './fixture.js';

// Pauses are for legible video pacing; assertions, not delays, establish success.
const hold = page => page.waitForTimeout(2500);
test('offline queue and lost acknowledgement demonstration', async ({ page, lab }) => {
  await openLab(page, lab);
  await hold(page);
  await page.getByRole('checkbox', { name: 'Simulate offline', exact: true }).check();
  await saveNote(page, 'A note saved without a connection');
  await expect(page.locator('#pending-count')).toHaveText('1 pending');
  expect(lab.notes).toHaveLength(0);
  await hold(page);
  await page.getByRole('checkbox', { name: 'Simulate offline', exact: true }).uncheck();
  await expect(page.locator('#saved-count')).toHaveText('1 saved');
  await hold(page);
  await page.getByRole('checkbox', { name: 'Lose the next acknowledgement', exact: true }).check();
  await page.getByRole('textbox', { name: 'Sample note', exact: true }).fill('A retry must not create a duplicate');
  await hold(page);
  await page.getByRole('button', { name: 'Save locally', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Receipt recovered.');
  await expect(page.locator('#saved-count')).toHaveText('2 saved');
  expect(lab.notes).toHaveLength(2);
  await hold(page);
});
