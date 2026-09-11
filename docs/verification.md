# Verification

Run `npm run check` and `npm test`. No npm packages, credentials or external services are required. HTTP tests bind to an ephemeral loopback port; an environment that forbids listening sockets cannot run those integration tests.

Automated checks exercise the real HTTP server as well as the state model. Browser persistence, service worker installation and visual layout are checked manually; they are not claimed as automated browser coverage. CI targets Node 22 and 24 on Ubuntu. Inspect the latest Actions run for its actual result.

## Manual browser checks

- With the server running, enable **Simulate offline**, save a sample and confirm it appears only in the local queue.
- Stop the server and reload the page after its service worker has installed. The shell and queued sample must still appear. Save a second sample.
- Restart the server, disable simulated offline and select **Sync now**. Both notes must move to the server once each.
- Enable **Lose the next acknowledgement** and save another sample. Its first attempt commits on the server and loses the HTTP response; a retry must recover the receipt and leave one server note.
- Reload again. The outbox remains empty and SQLite still contains the acknowledged notes.
- Clear this origin's site data only when you intend to discard its local queue. With the server stopped, deleting `.data/` resets the server's samples and receipts.

The initial manual run on 2026-09-11 verified server-offline reload, two persisted samples syncing after restart, and recovery of one deliberately lost acknowledgement in the Codex in-app browser.
