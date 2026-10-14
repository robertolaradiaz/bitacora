// "Ver como": el administrador mira la app tal como la ve otro usuario (su rol y sus
// vehículos), en solo lectura. Los datos se descargan a una base local aparte que se
// borra al salir, así no se mezclan con los del administrador.
import { db, usarBase } from './db.js';
import { estado, emitir } from './state.js';
import { cargarLocal, sincronizar } from './sync.js';
import { aviso } from './ui.js';
import { reemplazar } from './nav.js';

export async function entrarVerComo(usuario) {
  if (!navigator.onLine) { aviso('Se necesita conexión a internet', { tipo: 'error' }); return false; }
  if (estado.sync.ops || estado.sync.archivos) await sincronizar();
  const espera = aviso(`Cargando la app como ${usuario.nombre || usuario.email}…`, { duracion: 0 });
  await usarBase(true);
  await db.borrarTodo();
  estado.verComo = { email: usuario.email, nombre: usuario.nombre || usuario.email };
  await cargarLocal();
  await sincronizar({ completo: true });
  espera();
  if (!estado.usuario || estado.usuario.email !== usuario.email) {
    const msg = estado.sync.error || 'No se pudo cargar la vista de ese usuario';
    await terminar();
    aviso(msg, { tipo: 'error', duracion: 6000 });
    return false;
  }
  reemplazar('/');
  emitir('shell');
  aviso(`Estás viendo la app como ${estado.verComo.nombre}. Nada de lo que hagas se guarda.`, { duracion: 5000 });
  return true;
}

async function terminar() {
  if (!estado.verComo) return;
  try { await db.borrarTodo(); } catch (e) { /* nada */ }
  await usarBase(false);
  estado.verComo = null;
  await cargarLocal();
}

export async function salirVerComo({ silencioso = false } = {}) {
  await terminar();
  if (silencioso) return;
  reemplazar('/admin/usuarios');
  emitir('shell');
  sincronizar();
}
