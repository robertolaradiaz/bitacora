// Estado global de la app y bus de eventos simple.
export const estado = {
  sesion: null,      // { token, usuario: { email, nombre, foto } }
  usuario: null,     // { email, nombre, rol, patentes }
  permisos: {},
  campos: [],
  config: {},
  online: navigator.onLine,
  sync: { activo: false, ultimo: null, error: null, ops: 0, archivos: 0, errores: 0 },
  subida: null,      // { id, enviado, total }
};

const oyentes = {};
export function on(evento, fn) {
  (oyentes[evento] = oyentes[evento] || new Set()).add(fn);
  return () => oyentes[evento].delete(fn);
}
export function emitir(evento, dato) {
  (oyentes[evento] || []).forEach((fn) => { try { fn(dato); } catch (e) { console.error(e); } });
}

export const puede = (permiso) => !!(estado.permisos.administrar || estado.permisos[permiso]);
export const esAdmin = () => !!estado.permisos.administrar;
export const miEmail = () => (estado.usuario && estado.usuario.email) || (estado.sesion && estado.sesion.usuario.email) || '';

export function puedeEditarEvento(ev) {
  if (!ev) return false;
  if (puede('editar_eventos')) return true;
  const propio = (ev.creado_por || '').toLowerCase() === miEmail();
  if (propio && estado.permisos.editar_eventos_propios) return true;
  // Un registro propio aún no sincronizado se puede seguir corrigiendo
  return propio && ev._pendiente && puede('crear_eventos');
}

export function puedeAdjuntar(ev) {
  if (!puede('subir_archivos')) return false;
  if (!ev) return true;
  return (ev.creado_por || '').toLowerCase() === miEmail() || puedeEditarEvento(ev);
}

export function camposDe(entidad, { inactivos = false } = {}) {
  return estado.campos
    .filter((c) => c.entidad === entidad && (inactivos || c.activo))
    .sort((a, b) => a.orden - b.orden);
}

export function campo(entidad, clave) {
  return estado.campos.find((c) => c.entidad === entidad && c.clave === clave);
}

export function nombreApp() {
  return (estado.config && estado.config.nombre_empresa) || 'Bitácora de Vehículos';
}
