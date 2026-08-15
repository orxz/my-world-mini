// ============================================================
// save.js - IndexedDB 纯存储层(多存档 DB v2)
// 从 game.js 提取:openDB 与增删查改。不含游戏状态——
// rec 由调用方(game.js collectSaveRecord)构造,读取后由 applySave 应用。
// Node 环境可 require(接口结构可测;indexedDB 调用仅在浏览器运行时发生)。
// ============================================================
(function (global) {
  'use strict';

  const DB_NAME = 'myword_save';
  const DB_VERSION = 2;            // v2:多存档(自增 id keyPath)
  const STORE = 'saves';           // 存档存储(v1 是 'world',v2 升级)
  let dbReady = null;

  function openDB() {
    if (dbReady) return dbReady;
    dbReady = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined' || !indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        // v2:新建自增 id 的 saves store
        if (!d.objectStoreNames.contains(STORE)) {
          const os = d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          os.createIndex('timestamp', 'timestamp', { unique: false });
        }
        // 删除旧的 v1 'world' store(如果有)
        if (d.objectStoreNames.contains('world')) d.deleteObjectStore('world');
      };
      req.onblocked = () => {
        console.warn('IndexedDB 升级被阻塞,请关闭其他标签页');
        dbReady = null;  // 重置缓存,允许重试(和 onerror 一致)
        reject(new Error('DB blocked'));
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbReady = null; reject(req.error); };  // 失败时重置缓存,允许重试
    });
    return dbReady;
  }

  // 新增存档,返回自增 id(失败 null)
  async function add(rec) {
    try {
      const db = await openDB();
      if (!db) return null;
      const tx = db.transaction(STORE, 'readwrite');
      return new Promise((resolve) => {
        const r = tx.objectStore(STORE).add(rec);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(null);
      });
    } catch (e) { return null; }
  }

  // 覆盖存档(保留旧记录的名称),返回 bool
  async function overwrite(id, rec) {
    try {
      const db = await openDB();
      if (!db) return false;
      const tx = db.transaction(STORE, 'readwrite');
      return new Promise((resolve) => {
        const gr = tx.objectStore(STORE).get(id);
        gr.onsuccess = () => {
          if (gr.result) rec.name = gr.result.name;   // 保留原名称
          const pr = tx.objectStore(STORE).put(rec);
          pr.onsuccess = () => resolve(true);
          pr.onerror = () => resolve(false);
        };
        gr.onerror = () => resolve(false);
      });
    } catch (e) { return false; }
  }

  // 列出所有存档(按时间倒序,全量;供存档管理面板)
  async function list() {
    try {
      const db = await openDB();
      if (!db) return [];
      const tx = db.transaction(STORE, 'readonly');
      return new Promise((resolve) => {
        const r = tx.objectStore(STORE).getAll();
        r.onsuccess = () => {
          const saves = r.result || [];
          saves.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          resolve(saves);
        };
        r.onerror = () => resolve([]);
      });
    } catch (e) { return []; }
  }

  // 读取单条存档(失败/不存在返回 null)
  async function get(id) {
    try {
      const db = await openDB();
      if (!db) return null;
      const tx = db.transaction(STORE, 'readonly');
      return new Promise((resolve) => {
        const r = tx.objectStore(STORE).get(id);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => resolve(null);
      });
    } catch (e) { return null; }
  }

  // 删除存档,返回 bool
  async function remove(id) {
    try {
      const db = await openDB();
      if (!db) return false;
      const tx = db.transaction(STORE, 'readwrite');
      return new Promise((resolve) => {
        const r = tx.objectStore(STORE).delete(id);
        r.onsuccess = () => resolve(true);
        r.onerror = () => resolve(false);
      });
    } catch (e) { return false; }
  }

  // 存档条数(只取 count,不反序列化存档体;启动时每次刷新都会调用)
  async function count() {
    try {
      const db = await openDB();
      if (!db) return 0;
      const tx = db.transaction(STORE, 'readonly');
      return new Promise((resolve) => {
        const r = tx.objectStore(STORE).count();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(0);
      });
    } catch (e) { return 0; }
  }

  // 最新存档的 id(反向 timestamp 索引 openKeyCursor 只取主键,不反序列化存档体)
  async function latestId() {
    try {
      const db = await openDB();
      if (!db) return null;
      const tx = db.transaction(STORE, 'readonly');
      return new Promise((resolve) => {
        const req = tx.objectStore(STORE).index('timestamp').openKeyCursor(null, 'prev');
        req.onsuccess = () => resolve(req.result ? req.result.primaryKey : null);
        req.onerror = () => resolve(null);
      });
    } catch (e) { return null; }
  }

  const SAVELIB = { add, overwrite, list, get, remove, count, latestId };

  // 导出(Node 环境)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SAVELIB;
  }
  // 浏览器:挂到全局
  global.SAVELIB = SAVELIB;

})(typeof window !== 'undefined' ? window : globalThis);
