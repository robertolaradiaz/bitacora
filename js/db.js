// Almacenamiento local (IndexedDB): datos para trabajar sin conexión,
// cola de cambios pendientes y archivos a subir.
// "ver como" usa una base aparte para no mezclar sus datos con los del administrador.
const PRINCIPAL = 'bitacora';
const VERSION_DB = 1;
let NOMBRE = PRINCIPAL;
let conexion = null;

export async function usarBase(alternativa = false) {
  const nombre = alternativa ? PRINCIPAL + '-vercomo' : PRINCIPAL;
  if (nombre === NOMBRE) return;
  if (conexion) { try { (await conexion).close(); } catch (e) { /* nada */ } }
  conexion = null;
  NOMBRE = nombre;
}

function abrir() {
  if (conexion) return conexion;
  conexion = new Promise((resolve, reject) => {
    const req = indexedDB.open(NOMBRE, VERSION_DB);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('vehiculos')) d.createObjectStore('vehiculos', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('eventos')) {
        const s = d.createObjectStore('eventos', { keyPath: 'id' });
        s.createIndex('vehiculo_id', 'vehiculo_id');
      }
      if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      if (!d.objectStoreNames.contains('archivos')) {
        const s = d.createObjectStore('archivos', { keyPath: 'id' });
        s.createIndex('eventoId', 'eventoId');
      }
      if (!d.objectStoreNames.contains('cache')) d.createObjectStore('cache', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return conexion;
}

function promesa(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tienda(nombre, modo = 'readonly') {
  const d = await abrir();
  return d.transaction(nombre, modo).objectStore(nombre);
}

export const db = {
  async get(store, key) { return promesa((await tienda(store)).get(key)); },
  async all(store) { return promesa((await tienda(store)).getAll()); },
  async porIndice(store, indice, valor) { return promesa((await tienda(store)).index(indice).getAll(valor)); },
  async put(store, valor, key) { return promesa((await tienda(store, 'readwrite')).put(valor, key)); },
  async del(store, key) { return promesa((await tienda(store, 'readwrite')).delete(key)); },
  async clear(store) { return promesa((await tienda(store, 'readwrite')).clear()); },
  async bulkPut(store, valores) {
    if (!valores.length) return;
    const d = await abrir();
    await new Promise((resolve, reject) => {
      const tx = d.transaction(store, 'readwrite');
      const s = tx.objectStore(store);
      valores.forEach((v) => s.put(v));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },
  async bulkDel(store, keys) {
    if (!keys.length) return;
    const d = await abrir();
    await new Promise((resolve, reject) => {
      const tx = d.transaction(store, 'readwrite');
      const s = tx.objectStore(store);
      keys.forEach((k) => s.delete(k));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },
  async kvGet(k) { return this.get('kv', k); },
  async kvSet(k, v) { return this.put('kv', v, k); },
  async borrarTodo() {
    for (const s of ['kv', 'vehiculos', 'eventos', 'outbox', 'archivos', 'cache']) await this.clear(s);
  },
};
