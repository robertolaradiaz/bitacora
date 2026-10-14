// Comunicación con el backend (Apps Script) o con el emulador del modo demo.
import { CONFIG } from './config.js';

export class ErrorRed extends Error {}
export class ErrorApi extends Error {
  constructor(mensaje, codigo) { super(mensaje); this.codigo = codigo; }
}

// Errores que no se arreglan reintentando (el usuario debe corregir algo)
export const esPermanente = (e) => e instanceof ErrorApi && ['PERMISO', 'VALIDACION', 'NO_ENCONTRADO', 'SOLICITUD'].includes(e.codigo);

export const esDemo = () => CONFIG.DEMO || !CONFIG.API_URL;

let token = null;
export const setToken = (t) => { token = t; };

let demo = null;
async function backendDemo() {
  if (!demo) demo = import('../demo/emulador.js').then((m) => m.iniciar());
  return demo;
}

export async function llamar(accion, datos = {}, { timeout = 60000 } = {}) {
  // appUrl: el servidor la usa para poner el enlace a la app en los correos
  const req = { accion, ...datos, token, appUrl: location.origin + location.pathname };
  if (esDemo()) {
    if (!navigator.onLine) throw new ErrorRed('Sin conexión');
    const b = await backendDemo();
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 250)); // simula latencia
    return revisar(JSON.parse(JSON.stringify(b.manejar(JSON.parse(JSON.stringify(req))))));
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      // text/plain evita el "preflight" CORS que Apps Script no soporta
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(req),
      redirect: 'follow',
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new ErrorRed(navigator.onLine ? 'No se pudo contactar al servidor' : 'Sin conexión');
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) throw new ErrorRed('El servidor respondió ' + res.status);
  let j;
  try { j = await res.json(); } catch (e) { throw new ErrorRed('Respuesta inválida del servidor (¿URL de Apps Script correcta y con acceso "Cualquier usuario"?)'); }
  return revisar(j);
}

function revisar(j) {
  if (!j || !j.ok) throw new ErrorApi((j && j.error) || 'Error desconocido', j && j.codigo);
  return j;
}
