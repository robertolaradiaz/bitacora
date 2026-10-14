// Estado global de la app y bus de eventos simple.
export const estado = {
  sesion: null,      // { token, usuario: { email, nombre, foto } }
  usuario: null,     // { email, nombre, rol, patentes }
  permisos: {},
  campos: [],
  config: {},
  usuarios: [],      // personas que se pueden elegir como responsables: { email, nombre, patentes }
  solicitudes: [],   // admin: todas las recientes · otros: las propias
  verComo: null,     // { email, nombre } cuando el admin mira la app como otro usuario
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
const esPropio = (r) => !!r && (r.creado_por || '').toLowerCase() === miEmail();

export function puedeEditarEvento(ev) {
  if (!ev) return false;
  if (puede('editar_eventos')) return true;
  if (esPropio(ev) && estado.permisos.editar_eventos_propios) return true;
  // Un registro propio aún no sincronizado se puede seguir corrigiendo
  return esPropio(ev) && ev._pendiente && puede('crear_eventos');
}

export function puedeEliminarEvento(ev) {
  if (!ev) return false;
  if (puede('eliminar_eventos')) return true;
  return esPropio(ev) && (estado.permisos.eliminar_eventos_propios || (ev._pendiente && ev._nuevo));
}

export const puedeCrearVehiculo = () => puede('editar_vehiculos') || puede('crear_vehiculos');

// Editar y dar de baja usan la misma regla.
export function puedeEditarVehiculo(v) {
  if (!v) return false;
  if (puede('editar_vehiculos')) return true;
  return esPropio(v) && !!estado.permisos.crear_vehiculos;
}

// Pedir al administrador cambiar lo que no se puede cambiar directamente.
export const puedeSolicitar = () => !esAdmin() && !!estado.permisos.solicitar_cambios;

export function solicitudPendiente(registroId, tipo = null) {
  return estado.solicitudes.find((s) => s.registro_id === registroId && s.estado === 'pendiente'
    && (!tipo || s.tipo === tipo) && (esAdmin() || s.solicitado_por === miEmail()));
}

export const solicitudesPendientes = () => estado.solicitudes.filter((s) => s.estado === 'pendiente');

export function puedeAdjuntar(ev) {
  if (!puede('subir_archivos')) return false;
  if (!ev) return true;
  return esPropio(ev) || puedeEditarEvento(ev);
}

export function nombreUsuario(email) {
  const u = estado.usuarios.find((x) => x.email === String(email || '').toLowerCase());
  return u ? u.nombre : String(email || '');
}

// Registros en los que la persona figura como responsable (campos de tipo "usuario")
export function esResponsable(r, entidad = 'evento', email = miEmail()) {
  if (!r || !email) return false;
  return camposDe(entidad).some((c) => c.tipo === 'usuario' && String(r[c.clave] || '').toLowerCase() === email);
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
