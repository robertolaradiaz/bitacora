// Sincronización: guarda primero en el teléfono y envía cuando hay conexión.
import { db } from './db.js';
import { llamar, ErrorRed, ErrorApi, esPermanente, esDemo } from './api.js';
import { estado, emitir, miEmail } from './state.js';

const TROZO = 4 * 1024 * 1024; // 4 MiB (múltiplo de 256 KiB, requerido por Drive)
const LOTE = 40;               // operaciones por envío
const enVuelo = new Set();
let promesaSync = null;
let otraVez = false;
let temporizador = null;

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
export const ahoraISO = () => new Date().toISOString();

// ---------------------------------------------------------------------------
//  Cargar datos guardados al abrir la app
// ---------------------------------------------------------------------------
export async function cargarLocal() {
  const [usuario, permisos, campos, config, ultimo] = await Promise.all(
    ['usuario', 'permisos', 'campos', 'config', 'lastSync'].map((k) => db.kvGet(k)),
  );
  estado.usuario = usuario || null;
  estado.permisos = permisos || {};
  estado.campos = campos || [];
  estado.config = config || {};
  estado.sync.ultimo = ultimo || null;
  await contarPendientes();
}

export async function contarPendientes() {
  const [ops, archivos] = await Promise.all([db.all('outbox'), db.all('archivos')]);
  estado.sync.ops = ops.filter((o) => !o.error).length;
  estado.sync.archivos = archivos.filter((a) => a.estado !== 'error').length;
  estado.sync.errores = ops.filter((o) => o.error).length + archivos.filter((a) => a.estado === 'error').length;
  emitir('estado');
}

// ---------------------------------------------------------------------------
//  Acciones del usuario (funcionan sin conexión)
// ---------------------------------------------------------------------------
async function encolar(op) {
  op.opId = uuid();
  op.email = miEmail();
  op.creado = Date.now();
  if (op.op === 'vehiculo' || op.op === 'evento') {
    // Si ya hay un cambio pendiente (no enviado) del mismo registro, se combinan
    const previo = (await db.all('outbox')).find((o) => o.op === op.op && o.data.id === op.data.id && !o.error && !enVuelo.has(o.seq));
    if (previo) {
      previo.data = Object.assign({}, previo.data, op.data);
      await db.put('outbox', previo);
      return;
    }
  }
  await db.put('outbox', op);
}

export async function guardarVehiculo(datos) {
  const ahora = ahoraISO();
  const id = datos.id || uuid();
  const existente = await db.get('vehiculos', id);
  const reg = Object.assign({}, existente || { id, creado_por: miEmail(), creado_en: ahora }, datos, {
    id, actualizado_por: miEmail(), actualizado_en: ahora, _pendiente: true, _error: null,
  });
  if (reg.patente) reg.patente = String(reg.patente).toUpperCase().replace(/\s+/g, '');
  await db.put('vehiculos', reg);
  await encolar({ op: 'vehiculo', data: Object.assign({}, datos, { id }) });
  await despuesDeCambio();
  return reg;
}

export async function darDeBajaVehiculo(id) {
  await db.del('vehiculos', id);
  await encolar({ op: 'eliminarVehiculo', id });
  await despuesDeCambio();
}

export async function guardarEvento(datos, nuevosArchivos = []) {
  const ahora = ahoraISO();
  const id = datos.id || uuid();
  const existente = await db.get('eventos', id);
  const reg = Object.assign({}, existente || { id, adjuntos: [], creado_por: miEmail(), creado_en: ahora, _nuevo: true }, datos, {
    id, actualizado_por: miEmail(), actualizado_en: ahora, _pendiente: true, _error: null,
  });
  await db.put('eventos', reg);
  await encolar({ op: 'evento', data: Object.assign({}, datos, { id }) });
  for (const a of nuevosArchivos) {
    await db.put('archivos', {
      id: a.id || uuid(), eventoId: id, nombre: a.nombre, mime: a.blob.type || a.mime || 'application/octet-stream',
      tamano: a.blob.size, blob: a.blob, duracion: a.duracion || '', estado: 'pendiente', creado: Date.now(), email: miEmail(),
    });
  }
  await despuesDeCambio();
  return reg;
}

export async function eliminarEvento(id) {
  const local = await db.get('eventos', id);
  await db.del('eventos', id);
  // Si nunca llegó al servidor, basta con descartarlo localmente
  const ops = await db.all('outbox');
  const crear = ops.find((o) => o.op === 'evento' && o.data.id === id && !enVuelo.has(o.seq));
  const archivos = await db.porIndice('archivos', 'eventoId', id);
  await db.bulkDel('archivos', archivos.map((a) => a.id));
  if (crear) await db.del('outbox', crear.seq);
  // Si el registro nunca llegó al servidor no hay nada que eliminar allá
  if (!(local && local._nuevo && crear)) await encolar({ op: 'eliminarEvento', id });
  await despuesDeCambio();
}

export async function quitarAdjunto(eventoId, adjunto) {
  const local = await db.get('archivos', adjunto.id);
  if (local) {
    await db.del('archivos', adjunto.id);
  } else {
    const ev = await db.get('eventos', eventoId);
    if (ev) {
      ev.adjuntos = (ev.adjuntos || []).filter((a) => a.id !== adjunto.id);
      await db.put('eventos', ev);
    }
    await encolar({ op: 'quitarAdjunto', eventoId, adjuntoId: adjunto.id });
  }
  await despuesDeCambio();
}

async function despuesDeCambio() {
  await contarPendientes();
  emitir('datos');
  programarSync(600);
}

// ---------------------------------------------------------------------------
//  Motor de sincronización
// ---------------------------------------------------------------------------
export function programarSync(ms = 800) {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => sincronizar().catch(() => {}), ms);
}

export function sincronizar(opts = {}) {
  if (promesaSync) { otraVez = true; return promesaSync; }
  const correr = () => ejecutarSync(opts);
  // Evita que dos pestañas abiertas sincronicen al mismo tiempo
  const conBloqueo = navigator.locks
    ? navigator.locks.request('bitacora-sync', { ifAvailable: true }, (lock) => (lock ? correr() : null))
    : correr();
  promesaSync = Promise.resolve(conBloqueo).finally(() => {
    promesaSync = null;
    if (otraVez) { otraVez = false; programarSync(200); }
  });
  return promesaSync;
}

async function ejecutarSync({ completo = false } = {}) {
  if (!estado.sesion) return;
  if (!navigator.onLine) { estado.online = false; emitir('estado'); return; }
  estado.sync.activo = true;
  estado.sync.error = null;
  emitir('estado');
  try {
    let vuelta = 0;
    let forzarCompleto = completo;
    do {
      const pendientes = (await db.all('outbox')).filter((o) => !o.error && o.email === miEmail()).slice(0, LOTE);
      const res = await enviar(pendientes, forzarCompleto);
      forzarCompleto = false;
      vuelta++;
      if (!pendientes.length || pendientes.length < LOTE || res === 'sin-progreso' || vuelta > 25) break;
    } while (true);
    await subirArchivos();
    estado.online = true;
  } catch (e) {
    if (e instanceof ErrorApi && (e.codigo === 'AUTH' || e.codigo === 'NO_AUTORIZADO')) {
      emitir('auth', e);
    } else if (e instanceof ErrorRed) {
      estado.sync.error = e.message;
    } else {
      console.error(e);
      estado.sync.error = e.message || String(e);
    }
  } finally {
    estado.sync.activo = false;
    estado.subida = null;
    await contarPendientes();
    emitir('datos');
  }
}

async function enviar(ops, completo) {
  const since = completo ? null : await db.kvGet('lastSync');
  const permHash = await db.kvGet('permHash');
  ops.forEach((o) => enVuelo.add(o.seq));
  let res;
  try {
    res = await llamar('sync', {
      since, permHash,
      ops: ops.map((o) => ({ opId: o.opId, op: o.op, data: o.data, id: o.id, eventoId: o.eventoId, adjuntoId: o.adjuntoId })),
    }, { timeout: 90000 });
  } finally {
    ops.forEach((o) => enVuelo.delete(o.seq));
  }

  // 1) Resultado de cada operación enviada
  const porId = new Map(ops.map((o) => [o.opId, o]));
  let exitos = 0;
  for (const r of res.resultados || []) {
    const op = porId.get(r.opId);
    if (!op) continue;
    if (r.ok) {
      exitos++;
      await db.del('outbox', op.seq);
      if (r.registro) await aplicarRegistro(op.op === 'vehiculo' || op.op === 'eliminarVehiculo' ? 'vehiculos' : 'eventos', r.registro);
    } else if (esPermanente(new ErrorApi(r.error, r.codigo))) {
      op.error = r.error;
      op.codigo = r.codigo;
      await db.put('outbox', op);
      const store = op.op === 'vehiculo' || op.op === 'eliminarVehiculo' ? 'vehiculos' : 'eventos';
      const id = (op.data && op.data.id) || op.id || op.eventoId;
      const local = id && await db.get(store, id);
      if (local) { local._error = r.error; await db.put(store, local); }
    }
  }

  // 2) Novedades del servidor
  const restantes = await db.all('outbox');
  const conCambiosLocales = new Set(restantes.map((o) => (o.data && o.data.id) || o.id || o.eventoId));
  if (res.completo) {
    for (const [store, lista] of [['vehiculos', res.vehiculos], ['eventos', res.eventos]]) {
      const enServidor = new Set(lista.map((x) => x.id));
      const locales = await db.all(store);
      await db.bulkDel(store, locales.filter((x) => !enServidor.has(x.id) && !conCambiosLocales.has(x.id)).map((x) => x.id));
      await db.bulkPut(store, lista.filter((x) => !conCambiosLocales.has(x.id)).map(limpiarRegistro));
    }
  } else {
    for (const [store, lista] of [['vehiculos', res.vehiculos], ['eventos', res.eventos]]) {
      const borrar = lista.filter((x) => x.eliminado && !conCambiosLocales.has(x.id)).map((x) => x.id);
      await db.bulkDel(store, borrar);
      await db.bulkPut(store, lista.filter((x) => !x.eliminado && !conCambiosLocales.has(x.id)).map(limpiarRegistro));
    }
  }

  // 3) Metadatos (usuario, permisos, campos, configuración)
  estado.usuario = res.usuario;
  estado.permisos = res.permisos;
  estado.campos = res.campos;
  estado.config = res.config;
  estado.sync.ultimo = res.serverTime;
  await Promise.all([
    db.kvSet('usuario', res.usuario), db.kvSet('permisos', res.permisos), db.kvSet('campos', res.campos),
    db.kvSet('config', res.config), db.kvSet('lastSync', res.serverTime), db.kvSet('permHash', res.permHash),
  ]);
  emitir('meta');
  return ops.length && !exitos ? 'sin-progreso' : 'ok';
}

function limpiarRegistro(r) {
  const o = Object.assign({}, r);
  delete o._pendiente;
  delete o._error;
  return o;
}

async function aplicarRegistro(store, reg) {
  if (reg.eliminado) { await db.del(store, reg.id); return; }
  const quedan = (await db.all('outbox')).some((o) => !o.error && ((o.data && o.data.id) || o.id || o.eventoId) === reg.id);
  if (quedan) return; // hay otro cambio local esperando; se conserva la versión local
  await db.put(store, limpiarRegistro(reg));
}

// ---------------------------------------------------------------------------
//  Subida de fotos, videos y audios a Google Drive
// ---------------------------------------------------------------------------
const puedeDirecto = () => {
  if (esDemo()) return false;
  try { return localStorage.getItem('bitacora_subida_directa') !== 'no'; } catch (e) { return true; }
};
const marcarSinDirecto = () => { try { localStorage.setItem('bitacora_subida_directa', 'no'); } catch (e) { /* nada */ } };

async function subirArchivos() {
  const lista = (await db.all('archivos'))
    .filter((a) => a.estado !== 'error' && (!a.email || a.email === miEmail()))
    .sort((a, b) => a.creado - b.creado);
  if (!lista.length) return;
  const ops = await db.all('outbox');
  for (const a of lista) {
    if (!navigator.onLine) return;
    // Esperar a que el registro exista en el servidor
    if (ops.some((o) => o.op === 'evento' && o.data.id === a.eventoId)) continue;
    const ev = await db.get('eventos', a.eventoId);
    if (!ev) { await db.del('archivos', a.id); continue; }
    try {
      await subirUno(a);
    } catch (e) {
      if (e instanceof ErrorRed) throw e;
      if (esPermanente(e) || (e instanceof ErrorApi && e.codigo === 'DRIVE')) {
        a.estado = 'error';
        a.error = e.message;
        await db.put('archivos', a);
        continue;
      }
      throw e;
    }
  }
}

async function subirUno(a) {
  let ultimoAviso = 0;
  const progreso = (enviado) => {
    estado.subida = { id: a.id, eventoId: a.eventoId, enviado, total: a.tamano };
    const ahora = Date.now();
    if (ahora - ultimoAviso > 700 || enviado >= a.tamano) { ultimoAviso = ahora; emitir('subida', estado.subida); }
  };
  a.estado = 'subiendo';
  progreso(a.offset || 0);

  let resultado = null;
  if (a.uploadUrl) {
    const st = await llamar('subidaEstado', { uploadUrl: a.uploadUrl, total: a.tamano });
    if (st.estado === 'completo') resultado = st.archivo;
    else if (st.estado === 'expirado') { a.uploadUrl = null; a.offset = 0; }
    else a.offset = st.recibido;
  }
  if (!resultado && !a.uploadUrl) {
    const ini = await llamar('subidaIniciar', { eventoId: a.eventoId, adjuntoId: a.id, nombre: a.nombre, mime: a.mime, tamano: a.tamano, origin: location.origin });
    a.uploadUrl = ini.uploadUrl;
    a.offset = 0;
  }
  await db.put('archivos', a);

  // 1° intento: directo del teléfono a Drive (más rápido). Respaldo: en trozos vía Apps Script.
  if (!resultado && puedeDirecto() && a.offset === 0) {
    try {
      resultado = await putDirecto(a.uploadUrl, a.blob, a.tamano, progreso);
    } catch (e) {
      if (!navigator.onLine) throw new ErrorRed('Sin conexión');
      marcarSinDirecto();
      const st = await llamar('subidaEstado', { uploadUrl: a.uploadUrl, total: a.tamano });
      if (st.estado === 'completo') resultado = st.archivo;
      else a.offset = st.recibido || 0;
    }
  }
  while (!resultado) {
    const fin = Math.min(a.offset + TROZO, a.tamano);
    const base64 = await aBase64(a.blob.slice(a.offset, fin));
    const r = await llamar('subidaParte', { uploadUrl: a.uploadUrl, inicio: a.offset, total: a.tamano, mime: a.mime, base64 }, { timeout: 180000 });
    if (r.estado === 'completo') resultado = r.archivo;
    else if (r.estado === 'expirado') { a.uploadUrl = null; await db.put('archivos', a); throw new ErrorRed('La sesión de subida expiró; se reintentará'); }
    else {
      a.offset = r.recibido;
      await db.put('archivos', a);
      progreso(a.offset);
    }
  }
  progreso(a.tamano);
  const conf = await llamar('subidaConfirmar', {
    eventoId: a.eventoId,
    adjunto: { id: a.id, driveId: resultado.id, nombre: a.nombre, mime: a.mime, tamano: a.tamano, duracion: a.duracion || '' },
  });
  // Guardar copia local para verla sin conexión (fotos y audios; videos chicos)
  if (a.tamano < 40 * 1024 * 1024) await db.put('cache', { key: 'f:' + resultado.id, blob: a.blob, ts: Date.now() });
  await db.del('archivos', a.id);
  await aplicarRegistro('eventos', conf.registro);
  emitir('datos');
}

function putDirecto(url, blob, total, progreso) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Range', 'bytes 0-' + (total - 1) + '/' + total);
    xhr.upload.onprogress = (e) => progreso(e.loaded);
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        try { resolve(JSON.parse(xhr.responseText)); } catch (e) { reject(new Error('respuesta')); }
      } else reject(new Error('HTTP ' + xhr.status));
    };
    xhr.onerror = () => reject(new Error('cors/red'));
    xhr.ontimeout = () => reject(new Error('timeout'));
    xhr.send(blob);
  }).then((f) => ({ id: f.id, nombre: f.name, mime: f.mimeType, tamano: Number(f.size || total) }));
}

function aBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
//  Gestión de la cola (pantalla "Sincronización")
// ---------------------------------------------------------------------------
export async function descartarOp(seq) {
  await db.del('outbox', seq);
  await db.kvSet('lastSync', null); // re-descargar para recuperar la versión del servidor
  await contarPendientes();
  programarSync(100);
}
export async function reintentarOp(seq) {
  const op = (await db.all('outbox')).find((o) => o.seq === seq);
  if (op) { delete op.error; delete op.codigo; await db.put('outbox', op); }
  await contarPendientes();
  programarSync(100);
}
export async function descartarArchivo(id) {
  await db.del('archivos', id);
  await contarPendientes();
  emitir('datos');
}
export async function reintentarArchivo(id) {
  const a = await db.get('archivos', id);
  if (a) { a.estado = 'pendiente'; delete a.error; await db.put('archivos', a); }
  await contarPendientes();
  programarSync(100);
}

// Miniaturas e archivos ya subidos (con caché local para verlos sin conexión)
export async function obtenerMiniatura(driveId, tam = 400) {
  const local = await db.get('cache', 'f:' + driveId);
  if (local) return local.blob;
  const clave = 'm' + tam + ':' + driveId;
  const c = await db.get('cache', clave);
  if (c) return c.blob;
  if (!navigator.onLine) return null;
  try {
    const r = await llamar('miniatura', { driveId, tam });
    if (!r.base64) return null;
    const blob = b64aBlob(r.base64, r.mime || 'image/jpeg');
    await db.put('cache', { key: clave, blob, ts: Date.now() });
    return blob;
  } catch (e) { return null; }
}

export async function obtenerArchivo(driveId) {
  const local = await db.get('cache', 'f:' + driveId);
  if (local) return local.blob;
  if (!navigator.onLine) return null;
  const r = await llamar('archivo', { driveId }, { timeout: 120000 });
  if (!r.base64) return null;
  const blob = b64aBlob(r.base64, r.mime);
  await db.put('cache', { key: 'f:' + driveId, blob, ts: Date.now() });
  return blob;
}

function b64aBlob(b64, mime) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: mime });
}
