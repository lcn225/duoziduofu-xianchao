const DB_NAME = 'idle-xiuxian';
const DB_VERSION = 1;
const STORE_NAME = 'player-data';
const CACHE = new Map(); // 新增内存缓存

export class GameDB {
  static dbPromise = null;

  static async openDB () {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
      });
    }
    return this.dbPromise;
  }

  static async getData (key) {
    // 内存缓存检查
    if (CACHE.has(key)) return CACHE.get(key);
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = (e) => {
        CACHE.set(key, e.target.result); // 更新缓存
        resolve(e.target.result);
      };
    });
  }

  static async setData (key, value) {
    CACHE.set(key, value); // 先更新缓存
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);
      request.onerror = () => {
        CACHE.delete(key); // 回滚缓存
        reject(request.error);
      };
      request.onsuccess = () => resolve(request.result);
    });
  }

  // 新增批量操作接口
  static async batchSet (items) {
    items.forEach(([key, value]) => CACHE.set(key, value));
    const db = await this.openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      items.forEach(([key, value]) => store.put(value, key));
      transaction.oncomplete = resolve;
    });
  }
}
