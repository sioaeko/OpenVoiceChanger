const DATABASE = 'ovc-recordings';
const STORE = 'takes';

export function createTakeStore(factory = globalThis.indexedDB, name = DATABASE) {
  async function transaction(mode, action) {
    if (!factory) throw new Error('Browser storage is unavailable.');
    const db = await new Promise((resolve, reject) => {
      const request = factory.open(name, 1);
      let blocked = false;
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
      request.onsuccess = () => {
        if (blocked) request.result.close();
        else resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => { blocked = true; reject(new Error('Recording storage is blocked by another tab.')); };
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(tx.error || request.error || new Error('Recording storage failed.'));
        tx.onerror = () => {}; // Abort is the final result, not request success.
      });
    } finally { db.close(); }
  }
  return {
    list: () => transaction('readonly', (store) => store.getAll()),
    put: (take) => transaction('readwrite', (store) => store.put(take)),
    remove: (id) => transaction('readwrite', (store) => store.delete(id)),
  };
}

export function takeFileName(name) {
  // Control characters and platform-reserved punctuation cannot name a download.
  // eslint-disable-next-line no-control-regex
  return `${name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim().replace(/\.wav$/i, '') || 'voice-take'}.wav`;
}
