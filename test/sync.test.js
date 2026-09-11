import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncEngine, DeliveryError } from '../public/sync.js';

function fixture() {
  const entries = new Map([['stable-key', {key:'stable-key', text:'A note', attempts:0, blocked:false}]]);
  const queue = {
    async list() { return structuredClone([...entries.values()]); },
    async put(entry) { entries.set(entry.key, structuredClone(entry)); },
    async remove(key) { entries.delete(key); },
  };
  const ack = entry => ({key:entry.key, note:{id:'server-id', text:entry.text}, replayed:true});
  return {entries, queue, ack};
}

test('a lost acknowledgement keeps the same operation key until a successful retry', async () => {
  const {entries, queue, ack} = fixture(); const keys = [];
  const engine = createSyncEngine({ queue, deliver:async entry => {
    keys.push(entry.key);
    if (keys.length === 1) throw new TypeError('Network lost after commit');
    return ack(entry);
  }});
  const failure = await engine.sync();
  assert.equal(entries.size, 1);
  assert.ok(failure.retryAfter >= 800);
  assert.equal(entries.get('stable-key').attempts, 1);
  const recovery = await engine.sync();
  assert.deepEqual(keys, ['stable-key','stable-key']);
  assert.equal(entries.size, 0);
  assert.equal(recovery.replayed, 1);
});

test('an acknowledgement for another operation cannot discard a queued note', async () => {
  const {entries, queue, ack} = fixture();
  const engine = createSyncEngine({queue, deliver:async entry => ({...ack(entry), key:'someone-else'})});
  assert.ok((await engine.sync()).retryAfter);
  assert.equal(entries.size, 1);
});

test('a permanent rejection remains visible and is not retried automatically', async () => {
  const {entries, queue} = fixture(); let calls = 0;
  const engine = createSyncEngine({queue, deliver:async () => { calls++; throw new DeliveryError(409, 'Key conflict'); }});
  assert.equal((await engine.sync()).blocked, 1);
  await engine.sync();
  assert.equal(calls, 1);
  assert.equal(entries.get('stable-key').blocked, true);
});

test('concurrent sync requests share one delivery', async () => {
  const {queue, ack} = fixture(); let calls = 0; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const engine = createSyncEngine({queue, deliver:async entry => {calls++; await gate; return ack(entry);}});
  const a = engine.sync(); const b = engine.sync();
  assert.equal(a, b);
  release(); await Promise.all([a,b]);
  assert.equal(calls, 1);
});

test('offline mode never calls the network', async () => {
  const {entries, queue} = fixture();
  const engine = createSyncEngine({queue, canSend:() => false, deliver:() => assert.fail('network called')});
  assert.equal((await engine.sync()).sent, 0);
  assert.equal(entries.size, 1);
});

test('failure to remove an acknowledged entry keeps it retryable', async () => {
  const {entries, queue, ack} = fixture();
  const remove = queue.remove; queue.remove = async () => {throw new Error('Storage temporarily unavailable');};
  const engine = createSyncEngine({queue, deliver:async entry => ack(entry)});
  await engine.sync(); assert.equal(entries.size, 1);
  queue.remove = remove;
  assert.equal((await engine.sync()).replayed, 1);
  assert.equal(entries.size, 0);
});
