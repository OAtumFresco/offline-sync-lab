import { test as base, expect } from '@playwright/test';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createStore } from '../src/store.js';
import { createLabServer } from '../src/server.js';

export const test = base.extend({
  lab: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), 'offline-browser-'));
    let current;
    let port = 0;
    const lab = {
      get url() { return `http://127.0.0.1:${port}`; },
      get notes() { return current.store.list(); },
      async start() {
        if (current) throw new Error('Server is already running');
        const store = createStore(new DatabaseSync(join(directory, 'notes.sqlite')));
        current = createLabServer({ store, allowFaults: true });
        current.server.listen(port, '127.0.0.1');
        await once(current.server, 'listening');
        port = current.server.address().port;
      },
      async stop() {
        if (!current) return;
        const { server, store } = current;
        current = null;
        const closed = new Promise(resolve => server.close(resolve));
        server.closeAllConnections();
        await closed;
        store.close();
      },
    };
    try { await lab.start(); await use(lab); }
    finally { await lab.stop(); await rm(directory, { recursive: true, force: true }); }
  },
});
export { expect };

export async function openLab(page, lab) {
  await page.goto(lab.url);
  await expect(page.getByRole('status')).toContainText('Ready.');
  // Wait for the actual cache installation before requesting an offline reload.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

export async function saveNote(page, text) {
  await page.getByRole('textbox', { name: 'Sample note', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Save locally', exact: true }).click();
}
