const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('offline-sync-lab', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('outbox', { keyPath: 'key' });
  request.onsuccess = () => {
    request.result.onversionchange = () => request.result.close();
    resolve(request.result);
  };
  request.onerror = () => reject(request.error);
  request.onblocked = () => reject(new Error('Close other lab tabs before upgrading local storage.'));
});

async function transact(mode, operation) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('outbox', mode);
    let value;
    const request = operation(transaction.objectStore('outbox'));
    request.onsuccess = () => { value = request.result; };
    // Wait for transaction completion, not only request success.
    transaction.oncomplete = () => resolve(value);
    transaction.onabort = () => reject(transaction.error ?? new Error('Local storage transaction aborted.'));
    transaction.onerror = () => reject(transaction.error);
  });
}

export const outbox = {
  async list() {
    const entries = await transact('readonly', store => store.getAll());
    return entries.sort((a, b) => a.createdAt - b.createdAt || a.key.localeCompare(b.key));
  },
  put(entry) { return transact('readwrite', store => store.put(entry)); },
  remove(key) { return transact('readwrite', store => store.delete(key)); },
};
