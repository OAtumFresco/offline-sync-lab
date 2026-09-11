import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createStore } from '../src/store.js';

test('retries return the original note; a different payload with the same key is rejected', t => {
  const store = createStore(); t.after(() => store.close());
  const first = store.apply('operation-1', { text: 'Sample note' });
  const again = store.apply('operation-1', { text: 'Sample note' });
  assert.deepEqual(again, { ...first, replayed: true });
  assert.throws(() => store.apply('operation-1', { text: 'Changed' }), { status: 409 });
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].text, 'Sample note');
  assert.equal(store.apply('operation-2', { text: 'Sample note' }).replayed, false);
  assert.equal(store.list().length, 2, 'different operations may have identical text');
});

test('a failure while saving the receipt rolls back the note too', t => {
  const db = new DatabaseSync(':memory:');
  const store = createStore(db); t.after(() => store.close());
  db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'injected disk failure'); END;");
  assert.throws(() => store.apply('operation-1', { text: 'Atomic' }), /injected disk failure/);
  assert.equal(store.list().length, 0);
  db.exec('DROP TRIGGER fail_receipt');
  assert.equal(store.apply('operation-1', { text: 'Atomic' }).replayed, false);
  assert.equal(store.list().length, 1);
});

test('the deduplication receipt survives a database close and reopen', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'offline-sync-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'notes.sqlite');
  const first = createStore(new DatabaseSync(path));
  const saved = first.apply('durable-key', { text: 'Survives restart' });
  first.close();
  const reopened = createStore(new DatabaseSync(path)); t.after(() => reopened.close());
  assert.deepEqual(reopened.apply('durable-key', { text: 'Survives restart' }), { ...saved, replayed: true });
  assert.equal(reopened.list().length, 1);
});

test('invalid input never changes storage', t => {
  const store = createStore(); t.after(() => store.close());
  for (const [key, body] of [[null, {text:'x'}], ['', {text:'x'}], ['a b',{text:'x'}], ['x',{text:''}], ['x',{text:' '.repeat(3)}], ['x',{text:'a'.repeat(201)}], ['x',{text:'x', extra:true}], ['x',null], ['x',['x']]]) {
    assert.throws(() => store.apply(key, body), { status: 400 });
  }
  assert.equal(store.list().length, 0);
});
