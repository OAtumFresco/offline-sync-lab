import { outbox } from './outbox.js';
import { createSyncEngine, DeliveryError } from './sync.js';

const $ = id => document.getElementById(id);
const offline = $('offline');
const loseResponse = $('lose-response');
let timer;
let syncing = null;
let serverNotes = [];
// navigator.onLine can remain stale or report a network that cannot reach us.
// Only the user's simulation pauses delivery; real requests determine reachability.
const canSend = () => !offline.checked;
const status = text => { $('status').textContent = text; };

function noteItem(text, detail) {
  const li = document.createElement('li');
  const note = document.createElement('p');
  const meta = document.createElement('p');
  note.textContent = text;
  meta.textContent = detail;
  meta.className = 'note-meta';
  li.append(note, meta);
  return li;
}

async function render() {
  const entries = await outbox.list();
  $('pending-count').textContent = `${entries.length} pending`;
  $('outbox').replaceChildren(...entries.map(entry => {
    const detail = entry.blocked ? `Needs attention: ${entry.lastError}`
      : entry.attempts ? `Retry ${entry.attempts} pending · ${entry.key.slice(0, 8)}`
        : `Waiting to send · ${entry.key.slice(0, 8)}`;
    const li = noteItem(entry.text, detail);
    if (entry.blocked) {
      const discard = document.createElement('button');
      discard.type = 'button';
      discard.className = 'discard';
      discard.textContent = 'Discard this blocked sample';
      discard.addEventListener('click', async () => { await outbox.remove(entry.key); await render(); });
      li.append(discard);
    }
    return li;
  }));
  if (!entries.length) $('outbox').append(noteItem('Your outbox is empty.', 'New notes are saved here before any network request.'));
  $('saved-count').textContent = `${serverNotes.length} saved`;
  $('server-notes').replaceChildren(...serverNotes.map(note => noteItem(note.text, note.id.slice(0, 8))));
  if (!serverNotes.length) $('server-notes').append(noteItem('No server notes to show.', 'This view refreshes when the server is reachable.'));
}

async function refreshServer() {
  if (!canSend()) return;
  try {
    const response = await fetch('/api/notes', { signal: AbortSignal.timeout(5000) });
    if (response.ok) serverNotes = (await response.json()).notes;
  } catch { /* A disconnected server does not erase the last displayed snapshot. */ }
  await render();
}

const engine = createSyncEngine({
  queue: outbox, canSend, onChange: render,
  async deliver(entry) {
    const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': entry.key };
    if (loseResponse.checked) {
      headers['X-Demo-Drop-Response'] = 'once';
      loseResponse.checked = false;
    }
    const response = await fetch('/api/notes', {
      method: 'POST', headers, body: JSON.stringify({ text: entry.text }), signal: AbortSignal.timeout(5000),
    });
    const body = await response.json();
    if (!response.ok) throw new DeliveryError(response.status, body.error ?? 'Delivery failed.');
    return body;
  },
});

function synchronise() {
  if (!syncing) syncing = runSync().finally(() => { syncing = null; });
  return syncing;
}

async function runSync() {
  clearTimeout(timer);
  if (!canSend()) {
    status('Offline. New notes stay on this device.');
    return;
  }
  $('sync').disabled = true;
  try {
    const result = navigator.locks
      ? await navigator.locks.request('offline-sync-lab-delivery', () => engine.sync())
      : await engine.sync();
    await refreshServer();
    const pending = await outbox.list();
    if (result.retryAfter !== null) {
      const seconds = Math.ceil(result.retryAfter / 1000);
      status(`No acknowledgement. The note stays local; retrying in ${seconds}s.`);
      timer = setTimeout(synchronise, result.retryAfter);
    } else if (pending.some(entry => entry.blocked)) {
      status('A sample needs attention. It has been kept on this device.');
    } else if (result.replayed) {
      status('Receipt recovered. The retry created no duplicate note.');
    } else if (pending.length) {
      status('More local notes are waiting.');
      timer = setTimeout(synchronise, 0);
    } else {
      status(result.sent ? 'Acknowledged. The notes are now on the server.' : 'Ready. Local and server views are up to date.');
    }
  } catch (error) {
    status(`Local storage needs attention: ${error.message}`);
  } finally {
    $('sync').disabled = false;
  }
}

$('note-form').addEventListener('submit', async event => {
  event.preventDefault();
  const text = $('note').value.trim();
  if (!text) return;
  $('save').disabled = true;
  try {
    await outbox.put({ key: crypto.randomUUID(), text, createdAt: Date.now(), attempts: 0, blocked: false, lastError: null });
    $('note').value = '';
    await render();
    await synchronise();
  } catch (error) { status(`The note could not be saved locally: ${error.message}`); }
  finally { $('save').disabled = false; }
});
$('sync').addEventListener('click', synchronise);
offline.addEventListener('change', synchronise);
window.addEventListener('online', synchronise);
window.addEventListener('offline', synchronise);

try {
  await render();
  $('save').disabled = false;
  await synchronise();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      status('The queue works, but the offline page cache could not be installed.');
    });
  }
} catch (error) { status(`Local storage could not be opened: ${error.message}`); }
