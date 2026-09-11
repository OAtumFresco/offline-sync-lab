import { test, expect, openLab, saveNote } from './fixture.js';

test('real offline reload preserves the queue and restores delivery', async ({ page, context, lab }) => {
  await openLab(page, lab);
  await context.setOffline(true);
  await saveNote(page, 'Saved before offline reload');
  await expect(page.locator('#pending-count')).toHaveText('1 pending');
  expect(lab.notes).toHaveLength(0);
  await page.reload();
  await expect(page.locator('#outbox')).toContainText('Saved before offline reload');
  await saveNote(page, 'Saved after offline reload');
  await expect(page.locator('#pending-count')).toHaveText('2 pending');
  await context.setOffline(false);
  await expect(page.locator('#pending-count')).toHaveText('0 pending');
  await expect(page.locator('#saved-count')).toHaveText('2 saved');
  expect(lab.notes.map(note => note.text)).toEqual(['Saved before offline reload', 'Saved after offline reload']);
});

test('losing the response after commit recovers one server note', async ({ page, lab }) => {
  await openLab(page, lab);
  await page.getByRole('checkbox', { name: 'Lose the next acknowledgement', exact: true }).check();
  await saveNote(page, 'A response can be lost');
  await expect(page.getByRole('status')).toContainText('Receipt recovered.');
  await expect(page.locator('#pending-count')).toHaveText('0 pending');
  await expect(page.locator('#saved-count')).toHaveText('1 saved');
  expect(lab.notes).toHaveLength(1);
});

test('a server restart preserves SQLite notes and accepts queued work', async ({ page, context, lab }) => {
  await openLab(page, lab);
  await saveNote(page, 'Before server restart');
  await expect(page.locator('#saved-count')).toHaveText('1 saved');
  await context.setOffline(true);
  await lab.stop();
  await saveNote(page, 'While the server was stopped');
  await expect(page.locator('#pending-count')).toHaveText('1 pending');
  await lab.start();
  await context.setOffline(false);
  await expect(page.locator('#saved-count')).toHaveText('2 saved');
  expect(lab.notes.map(note => note.text)).toEqual(['Before server restart', 'While the server was stopped']);
});

test('two tabs recovering the same queue create one effect', async ({ page, context, lab }) => {
  await openLab(page, lab);
  const second = await context.newPage();
  await openLab(second, lab);
  await context.setOffline(true);
  await saveNote(page, 'Shared between tabs');
  await expect(page.locator('#pending-count')).toHaveText('1 pending');
  await context.setOffline(false);
  await expect(page.locator('#pending-count')).toHaveText('0 pending');
  await expect(second.locator('#pending-count')).toHaveText('0 pending');
  expect(lab.notes).toHaveLength(1);
});

test('a narrow viewport keeps the note form and queue usable', async ({ page, lab }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLab(page, lab);
  await saveNote(page, 'Small screens can save notes too');
  await expect(page.locator('#saved-count')).toHaveText('1 saved');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
