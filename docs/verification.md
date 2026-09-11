# Verification

The project has **13 unit/integration tests** and **18 browser checks** (6 journeys across Chromium, Firefox and WebKit). The GitHub workflow runs Node 22 and 24 for the unit/integration suite and Node 24 on Ubuntu for browser checks. The latest Actions run is the authoritative result.

## Run the suites

```sh
npm run check
npm test
npm ci
npx playwright install chromium firefox webkit
npm run test:browser
```

On Linux, use `npx playwright install --with-deps chromium firefox webkit` to include required system libraries. The Node-only suite needs no npm packages. Browser tests use a pinned Playwright development dependency and the committed lockfile.

Each browser test starts an isolated loopback server on an ephemeral port. Tests never connect to a product deployment, reuse user browser profiles or need credentials. They cover server-offline reload with a real stopped endpoint, a stale offline hint, lost acknowledgement recovery, SQLite persistence after server restart, two tabs sharing a queue and a narrow viewport.

The server-stop test checks real endpoint failure rather than relying on every browser's network emulation to handle service workers identically. Offline network emulation is also used for queue and restart scenarios. No scenario is marked skipped and automatic retries are disabled.

## Reproduce the demonstration

```sh
npm run demo:record
```

This launches a separate Chromium session and records a real UI journey under `demo-results/`. Assertions establish success; brief pauses only make the recording readable. The README GIF and release MP4 were converted from this recording without replacing application states. The source run, commit and recording checksum are recorded in [demo-recording.json](demo-recording.json).

A manually dispatched workflow also records the demo. CI retains test reports, failure traces and recordings in the `browser-evidence` artifact for 14 days. The selected release recording remains attached to `v0.1.0`. Routine push runs execute the tests without recording a new demo.

## Manual browser checks

- With the server running, enable **Simulate offline**, save a sample and confirm it appears only in the local queue.
- Stop the server and reload the page after its service worker has installed. The shell and queued sample must still appear. Save a second sample.
- Restart the server, disable simulated offline and select **Sync now**. Both notes must move to the server once each.
- Enable **Lose the next acknowledgement** and save another sample. Its first attempt commits on the server and loses the HTTP response; a retry must recover the receipt and leave one server note.
- Reload again. The outbox remains empty and SQLite still contains the acknowledged notes.
- Clear this origin's site data only when you intend to discard its local queue. With the server stopped, deleting `.data/` resets the server's samples and receipts.

The initial manual run on 2026-09-11 verified server-offline reload, two persisted samples syncing after restart, and recovery of one deliberately lost acknowledgement in the Codex in-app browser.
