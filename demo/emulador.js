// MODO DEMO: ejecuta el MISMO código del backend (Code.gs) dentro del navegador,
// simulando Google Sheets, Drive y la verificación de Google con datos guardados
// en este dispositivo. Sirve para probar la app antes de conectarla a Google.
const CLAVE = 'bitacora_demo_v1';
const TZ_LOCAL = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'America/Santiago';

export const USUARIOS_DEMO = [
  { email: 'admin@demo.cl', nombre: 'Ana Admin', rol: 'Administrador' },
  { email: 'supervisor@demo.cl', nombre: 'Sergio Supervisor', rol: 'Supervisor' },
  { email: 'conductor@demo.cl', nombre: 'Pedro Conductor', rol: 'Conductor' },
  { email: 'lector@demo.cl', nombre: 'Laura Lectora', rol: 'Lector' },
];

function hashStr(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return [h1, h2];
}
function bytesHash(str) {
  const out = [];
  for (let s = 0; s < 4; s++) hashStr(str, s).forEach((h) => { for (let k = 0; k < 4; k++) out.push(((h >>> (k * 8)) & 0xff) - 128); });
  return out;
}
const toBytes = (s) => Array.from(new TextEncoder().encode(s)).map((b) => (b > 127 ? b - 256 : b));
const fromBytes = (b) => new TextDecoder().decode(new Uint8Array(b.map((x) => x & 0xff)));
function b64(bytes) {
  let bin = '';
  const u = bytes.map((x) => x & 0xff);
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.slice(i, i + 0x8000));
  return btoa(bin);
}
function unb64(s) {
  const bin = atob(s);
  const out = new Array(bin.length);
  for (let i = 0; i < bin.length; i++) { const c = bin.charCodeAt(i); out[i] = c > 127 ? c - 256 : c; }
  return out;
}

function crearEstado(guardado) {
  const st = guardado || { hojas: {}, maxCols: {}, props: {}, archivos: {}, carpetas: {}, sesiones: {} };
  const cache = {};

  const parseCelda = (v) => {
    if (typeof v === 'string') {
      if (v.startsWith("'")) return v.slice(1);
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); }
      if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    }
    return v;
  };

  function hoja(nombre) {
    if (!st.hojas[nombre]) { st.hojas[nombre] = []; st.maxCols[nombre] = 26; }
    const data = st.hojas[nombre];
    const sh = {
      getName: () => nombre,
      getLastRow: () => data.length,
      getLastColumn: () => data.reduce((m, r) => { let n = r.length; while (n > 0 && (r[n - 1] === '' || r[n - 1] == null)) n--; return Math.max(m, n); }, 0),
      getMaxColumns: () => st.maxCols[nombre],
      insertColumnsAfter: (_, n) => { st.maxCols[nombre] += n; },
      setFrozenRows() {},
      appendRow(fila) { data.push(fila.map(parseCelda)); return sh; },
      deleteRow(r) { data.splice(r - 1, 1); },
      getRange(r, c, nr = 1, nc = 1) {
        const rng = {
          getValues() {
            const out = [];
            for (let i = 0; i < nr; i++) {
              const fila = data[r - 1 + i] || [];
              const f = [];
              for (let j = 0; j < nc; j++) f.push(fila[c - 1 + j] === undefined || fila[c - 1 + j] === null ? '' : fila[c - 1 + j]);
              out.push(f);
            }
            return out;
          },
          setValues(vals) {
            for (let i = 0; i < nr; i++) {
              while (data.length < r + i) data.push([]);
              const fila = data[r - 1 + i];
              for (let j = 0; j < nc; j++) fila[c - 1 + j] = parseCelda(vals[i][j]);
            }
            return rng;
          },
          setFontWeight() { return rng; }, setBackground() { return rng; }, setFontColor() { return rng; },
        };
        return rng;
      },
    };
    return sh;
  }

  const ss = {
    getId: () => 'DEMO', getUrl: () => '#demo-planilla', getSpreadsheetTimeZone: () => TZ_LOCAL,
    getSheetByName: (n) => (st.hojas[n] ? hoja(n) : null),
    insertSheet: (n) => hoja(n),
    getSheets: () => Object.keys(st.hojas).map(hoja),
    deleteSheet: (h) => { delete st.hojas[h.getName()]; },
  };

  function carpeta(id) {
    const f = st.carpetas[id];
    if (!f) throw new Error('Carpeta no encontrada');
    return {
      getId: () => id, getUrl: () => '#demo-drive', getName: () => f.nombre,
      getFoldersByName: (n) => {
        const l = Object.keys(st.carpetas).filter((k) => st.carpetas[k].padre === id && st.carpetas[k].nombre === n).map(carpeta);
        let i = 0;
        return { hasNext: () => i < l.length, next: () => l[i++] };
      },
      createFolder: (n) => nuevaCarpeta(n, id),
      getParents: () => { const l = f.padre ? [carpeta(f.padre)] : []; let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; },
    };
  }
  function nuevaCarpeta(nombre, padre) {
    const id = 'F' + Math.random().toString(36).slice(2, 10);
    st.carpetas[id] = { nombre, padre };
    return carpeta(id);
  }
  function archivo(id) {
    const a = st.archivos[id];
    if (!a) throw new Error('Archivo no encontrado');
    return {
      getName: () => a.nombre, getMimeType: () => a.mime, getSize: () => a.tamano,
      setSharing() {}, setTrashed() { a.papelera = true; },
      getParents: () => { let i = 0; return { hasNext: () => i < 1, next: () => (i++, carpeta(a.padre)) }; },
      getBlob: () => ({ getContentType: () => a.mime, getBytes: () => [] }),
    };
  }

  const resp = (code, body, headers = {}) => ({
    getResponseCode: () => code,
    getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)),
    getHeaders: () => headers, getAllHeaders: () => headers,
    getBlob: () => ({ getContentType: () => 'image/jpeg', getBytes: () => [] }),
  });

  const globals = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, getUi: () => { throw new Error('sin ui'); } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => st.props[k] || null, setProperty: (k, v) => { st.props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; }, removeAll: (ks) => ks.forEach((k) => delete cache[k]) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'admin@demo.cl' }), getScriptTimeZone: () => TZ_LOCAL },
    ScriptApp: { getOAuthToken: () => 'DEMO' },
    Logger: { log() {} },
    console: { log() {}, error: (...a) => console.error('[demo-backend]', ...a) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType: () => s }) },
    DriveApp: {
      createFolder: (n) => nuevaCarpeta(n, null),
      getFolderById: (id) => carpeta(id),
      getFileById: (id) => archivo(id),
      Access: { ANYONE_WITH_LINK: 'link' }, Permission: { VIEW: 'view' },
    },
    UrlFetchApp: {
      fetch(url, o = {}) {
        if (url.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
          const cred = decodeURIComponent(url.split('id_token=')[1]);
          if (!cred.startsWith('demo:')) return resp(400, {});
          const email = cred.slice(5);
          const u = USUARIOS_DEMO.find((x) => x.email === email);
          return resp(200, { aud: 'demo', iss: 'accounts.google.com', email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 3600), email, name: u ? u.nombre : email });
        }
        if (url.includes('uploadType=resumable') && !url.includes('upload_id=')) {
          const meta = JSON.parse(o.payload);
          const sid = 'S' + Math.random().toString(36).slice(2, 10);
          st.sesiones[sid] = { meta, total: Number(o.headers['X-Upload-Content-Length']), recibido: 0 };
          return resp(200, '', { Location: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=' + sid });
        }
        if (url.includes('upload_id=')) {
          const s = st.sesiones[url.split('upload_id=')[1]];
          if (!s) return resp(404, '');
          if (!o.headers['Content-Range'].startsWith('bytes */')) s.recibido += o.payload.length;
          if (s.recibido >= s.total) {
            const id = 'D' + Math.random().toString(36).slice(2, 12);
            st.archivos[id] = { nombre: s.meta.name, mime: s.meta.mimeType, tamano: s.total, padre: s.meta.parents[0] };
            return resp(200, { id, name: s.meta.name, mimeType: s.meta.mimeType, size: String(s.total) });
          }
          return resp(308, '', s.recibido ? { Range: 'bytes=0-' + (s.recibido - 1) } : {});
        }
        if (url.includes('/permissions')) return resp(200, { permissions: [] });
        if (url.startsWith('https://www.googleapis.com/drive/v3/files/')) return resp(200, {}); // sin miniatura: la app usa la copia local
        return resp(404, '');
      },
    },
    Utilities: {
      Charset: { UTF_8: 'utf8' },
      DigestAlgorithm: { MD5: 'md5' },
      getUuid: () => crypto.randomUUID ? crypto.randomUUID() : 'u' + Date.now() + Math.random().toString(16).slice(2),
      base64EncodeWebSafe: (x) => b64(typeof x === 'string' ? toBytes(x) : x).replace(/\+/g, '-').replace(/\//g, '_'),
      base64DecodeWebSafe: (s) => unb64(s.replace(/-/g, '+').replace(/_/g, '/')),
      base64Decode: (s) => unb64(s),
      base64Encode: (b) => b64(b),
      computeHmacSha256Signature: (v, k) => bytesHash(k + '|' + v),
      computeDigest: (alg, s) => bytesHash(s),
      newBlob: (bytes) => ({ getDataAsString: () => fromBytes(bytes) }),
      formatDate: (d, tz, fmt) => {
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
        return fmt.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
      },
    },
  };
  return { st, globals };
}

function serializar(st) {
  return JSON.stringify(st, function (k, v) {
    const orig = this[k];
    return orig instanceof Date ? { __d: orig.getTime() } : v;
  });
}
function deserializar(txt) {
  return JSON.parse(txt, (k, v) => (v && typeof v === 'object' && '__d' in v ? new Date(v.__d) : v));
}

function semilla(manejar) {
  const hoy = new Date();
  const dia = (n) => { const d = new Date(hoy); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const t = manejar({ accion: 'login', credential: 'demo:admin@demo.cl' }).token;
  const m = (accion, datos) => manejar(Object.assign({ accion, token: t }, datos));
  m('guardarConfig', { config: { nombre_empresa: 'Transportes Demo' } });
  m('guardarUsuario', { usuario: { email: 'admin@demo.cl', nombre: 'Ana Admin', rol: 'Administrador', vehiculos: '*' } });
  m('guardarUsuario', { usuario: { email: 'supervisor@demo.cl', nombre: 'Sergio Supervisor', rol: 'Supervisor', vehiculos: '*' } });
  m('guardarUsuario', { usuario: { email: 'conductor@demo.cl', nombre: 'Pedro Conductor', rol: 'Conductor', vehiculos: 'HJKL23, PRTZ45' } });
  m('guardarUsuario', { usuario: { email: 'lector@demo.cl', nombre: 'Laura Lectora', rol: 'Lector', vehiculos: '*' } });
  const V = [
    { id: 'demo-v1', patente: 'HJKL23', tipo_vehiculo: 'Camioneta', marca: 'Toyota', modelo: 'Hilux 2.4 4x4', anio: 2021, color: 'Blanco', kilometraje: 84500, responsable: 'Pedro Conductor', venc_revision_tecnica: dia(12), venc_permiso_circulacion: dia(170), venc_soap: dia(170) },
    { id: 'demo-v2', patente: 'PRTZ45', tipo_vehiculo: 'Furgón', marca: 'Mercedes-Benz', modelo: 'Sprinter 515', anio: 2019, color: 'Gris', kilometraje: 152300, responsable: 'Pedro Conductor', venc_revision_tecnica: dia(-20), venc_permiso_circulacion: dia(170), venc_soap: dia(170) },
    { id: 'demo-v3', patente: 'GFDS78', tipo_vehiculo: 'Camión', marca: 'Volvo', modelo: 'FH 460', anio: 2018, color: 'Rojo', kilometraje: 410200, responsable: 'Juan Pérez', venc_revision_tecnica: dia(95), venc_permiso_circulacion: dia(170), venc_soap: dia(170) },
    { id: 'demo-v4', patente: 'LKJH90', tipo_vehiculo: 'Automóvil', marca: 'Hyundai', modelo: 'Accent', anio: 2022, color: 'Azul', kilometraje: 38900, responsable: 'Oficina', venc_revision_tecnica: dia(230), venc_permiso_circulacion: dia(170), venc_soap: dia(170) },
  ];
  const E = [
    { id: 'demo-e1', vehiculo_id: 'demo-v1', tipo: 'Mantención preventiva', fecha: dia(-40), titulo: 'Mantención 80.000 km', descripcion: 'Cambio de aceite, filtros de aire, aceite y combustible. Revisión de frenos OK.', estado: 'Resuelto', prioridad: 'Media', kilometraje: 80150, taller: 'Taller Los Andes', costo: 189000, n_documento: 'OT-2231', proxima_fecha: dia(50), proximo_km: 90000 },
    { id: 'demo-e2', vehiculo_id: 'demo-v1', tipo: 'Hallazgo / inspección', fecha: dia(-3), titulo: 'Neumático trasero izquierdo con desgaste irregular', descripcion: 'Detectado en inspección diaria. Posible problema de alineación.', estado: 'Abierto', prioridad: 'Alta', kilometraje: 84400, responsable: 'Pedro Conductor' },
    { id: 'demo-e3', vehiculo_id: 'demo-v2', tipo: 'Problema / falla', fecha: dia(-8), titulo: 'Luz de check engine encendida', descripcion: 'Se enciende en frío y se apaga a los 10 minutos. Código P0401 según escáner.', estado: 'En proceso', prioridad: 'Alta', kilometraje: 152100, taller: 'Servicio Mercedes Quilicura' },
    { id: 'demo-e4', vehiculo_id: 'demo-v2', tipo: 'Revisión técnica', fecha: dia(-385), titulo: 'Revisión técnica aprobada', estado: 'Resuelto', prioridad: 'Media', kilometraje: 121000, costo: 32000 },
    { id: 'demo-e5', vehiculo_id: 'demo-v3', tipo: 'Accidente / siniestro', fecha: dia(-60), titulo: 'Golpe en parachoques delantero', descripcion: 'Maniobra en patio de carga. Sin lesionados. Se informó a la aseguradora.', estado: 'Resuelto', prioridad: 'Media', ubicacion: 'Centro de distribución Lo Espejo', costo: 450000, n_documento: 'Siniestro 88-1123' },
    { id: 'demo-e6', vehiculo_id: 'demo-v3', tipo: 'Mantención correctiva', fecha: dia(-15), titulo: 'Cambio de pastillas de freno', estado: 'Resuelto', prioridad: 'Alta', kilometraje: 409800, taller: 'Volvo Trucks Santiago', costo: 520000, proxima_fecha: dia(20) },
  ];
  const ops = V.map((d, i) => ({ opId: 'sv' + i, op: 'vehiculo', data: d })).concat(E.map((d, i) => ({ opId: 'se' + i, op: 'evento', data: d })));
  m('sync', { ops });
}

export async function iniciar() {
  const url = new URL('./Code.gs', import.meta.url);
  const codigo = await (await fetch(url)).text();
  let txt = null;
  try { txt = localStorage.getItem(CLAVE); } catch (e) { /* sin almacenamiento */ }
  const { st, globals } = crearEstado(txt ? deserializar(txt) : null);
  const nombres = Object.keys(globals);
  // eslint-disable-next-line no-new-func
  const fabrica = new Function(...nombres, codigo + '\nCONFIG.GOOGLE_CLIENT_ID = "demo";\nreturn { manejar_: manejar_, setup: setup };');
  const backend = fabrica(...nombres.map((n) => globals[n]));
  const guardar = () => { try { localStorage.setItem(CLAVE, serializar(st)); } catch (e) { console.warn('demo: no se pudo guardar', e); } };
  if (!txt) {
    backend.setup();
    semilla(backend.manejar_);
    guardar();
  }
  return {
    manejar(req) {
      const r = backend.manejar_(req);
      guardar();
      return r;
    },
  };
}

export function reiniciarDemo() {
  try { localStorage.removeItem(CLAVE); } catch (e) { /* nada */ }
}
