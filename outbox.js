(function (root) {
  'use strict';
  const DB_NAME = 'kakeibo-outbox-v1';
  let opening;
  function database() {
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('entries', {keyPath: 'entryId'});
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); opening = null; };
          resolve(db);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('別の画面を閉じて、もう一度お試しください。'));
      }).catch(error => { opening = null; throw error; });
    }
    return opening;
  }
  async function transact(mode, action) {
    const db = await database();
    return new Promise((resolve, reject) => {
      // Resolve after transaction completion, not just the individual request.
      const tx = db.transaction('entries', mode, {durability: 'strict'});
      const request = action(tx.objectStore('entries'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || new Error('端末への保存に失敗しました。'));
      tx.onerror = () => {}; // onabort reports the failed transaction.
    });
  }
  function newId() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    if (root.crypto && root.crypto.getRandomValues) {
      const bytes = root.crypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('送信の準備ができません。最新のブラウザで開いてください。');
  }
  root.KakeiboOutbox = {
    newId,
    add: data => transact('readwrite', store => store.add({...data, queuedAt: Date.now()})),
    all: () => transact('readonly', store => store.getAll()),
    remove: entryId => transact('readwrite', store => store.delete(entryId))
  };
})(globalThis);
