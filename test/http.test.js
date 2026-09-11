import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createLabServer } from '../src/server.js';

async function start(t) {
  const {server, store} = createLabServer({allowFaults:true});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(async () => { const closed = new Promise(resolve => server.close(resolve)); server.closeAllConnections(); await closed; store.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const send = (key, text, headers={}) => fetch(url+'/api/notes', {method:'POST', headers:{'Content-Type':'application/json','Idempotency-Key':key,...headers},body:JSON.stringify({text})});
  return {url, send};
}

test('real socket loss after commit followed by retry produces one durable effect', async t => {
  const {url,send} = await start(t);
  await assert.rejects(send('network-key','Sample',{'X-Demo-Drop-Response':'once'}));
  const before = await (await fetch(url+'/api/notes')).json();
  assert.equal(before.notes.length, 1, 'the server committed before the socket broke');
  const retry = await send('network-key','Sample');
  assert.equal(retry.status, 200);
  const receipt = await retry.json();
  assert.equal(receipt.replayed, true);
  assert.equal(receipt.note.id, before.notes[0].id);
  assert.equal((await send('network-key','Changed')).status, 409);
  assert.equal((await (await fetch(url+'/api/notes')).json()).notes.length, 1);
});

test('parallel HTTP retries share the same result', async t => {
  const {url,send} = await start(t);
  const results = await Promise.all(Array.from({length:12}, () => send('same-key','Concurrent').then(r => r.json())));
  assert.equal(new Set(results.map(r => r.note.id)).size, 1);
  assert.equal(results.filter(r => !r.replayed).length, 1);
  assert.equal((await (await fetch(url+'/api/notes')).json()).notes.length, 1);
});

test('HTTP input and origin limits are enforced', async t => {
  const {url,send} = await start(t);
  assert.equal((await send('x','Sample',{Origin:'https://unrelated.example'})).status, 403);
  assert.equal((await fetch(url+'/api/notes',{method:'POST',body:'plain text'})).status,415);
  assert.equal((await fetch(url+'/api/notes',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
  assert.equal((await send('x','x'.repeat(5000))).status,413);
  assert.equal((await fetch(url+'/.data/notes.sqlite')).status,404);
  const page = await fetch(url+'/');
  assert.equal(page.status,200);
  assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
});
