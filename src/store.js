import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function validate(key, body) {
  if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(key)) {
    throw new RequestError(400, 'A valid Idempotency-Key is required.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).length !== 1 || typeof body.text !== 'string'
      || body.text.trim().length === 0 || body.text.length > 200) {
    throw new RequestError(400, 'Provide only text, between 1 and 200 characters.');
  }
}

export function createStore(db = new DatabaseSync(':memory:')) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS notes (
      position INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      text TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS receipts (
      key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      result TEXT NOT NULL
    ) STRICT;
  `);
  const receipt = db.prepare('SELECT payload, result FROM receipts WHERE key = ?');
  const insertNote = db.prepare('INSERT INTO notes(id, text) VALUES (?, ?)');
  const insertReceipt = db.prepare('INSERT INTO receipts(key, payload, result) VALUES (?, ?, ?)');

  return {
    apply(key, body) {
      validate(key, body);
      const payload = JSON.stringify({ text: body.text });
      db.exec('BEGIN IMMEDIATE');
      try {
        const saved = receipt.get(key);
        if (saved) {
          if (saved.payload !== payload) {
            throw new RequestError(409, 'This key already belongs to a different note.');
          }
          const note = JSON.parse(saved.result);
          db.exec('COMMIT');
          return { key, note, replayed: true };
        }
        const note = { id: randomUUID(), text: body.text };
        insertNote.run(note.id, note.text);
        insertReceipt.run(key, payload, JSON.stringify(note));
        // The note and its receipt commit together. Network delivery happens later.
        db.exec('COMMIT');
        return { key, note, replayed: false };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    list() { return db.prepare('SELECT id, text FROM notes ORDER BY position').all(); },
    close() { db.close(); },
  };
}
