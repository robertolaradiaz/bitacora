// Arranque de la app, navegación y barra de estado.
import { html, pintar, icono, $, $$, aviso } from './ui.js';
import { db } from './db.js';
import { llamar, setToken, esDemo, ErrorApi } from './api.js';
import { estado, on, emitir, esAdmin, nombreApp } from './state.js';
import { cargarLocal, sincronizar, programarSync, contarPendientes } from './sync.js';
import { pantallaLogin } from './views/login.js';
import { vistaVehiculos, vistaVehiculo, vistaVehiculoForm } from './views/vehiculos.js';
import { vistaRegistros, vistaEvento, vistaEventoForm } from './views/eventos.js';
import { vistaAdmin, vistaUsuarios, vistaRoles, vistaCampos, vistaConfig } from './views/admin.js';
import { vistaCuenta, vistaSync } from './views/cuenta.js';

const raiz = document.getElementById('app');
let vistaActual = null;

// ---------------------------------------------------------------------------
//  Rutas
// ---------------------------------------------------------------------------
const RUTAS = [
  [/^\/?$/, vistaVehiculos, 'vehiculos'],
  [/^\/v\/nuevo$/, (el) => vistaVehiculoForm(el, []), 'vehiculos'],
  [/^\/v\/([^/]+)\/editar$/, vistaVehiculoForm, 'vehiculos'],
  [/^\/v\/([^/]+)\/registro$/, (el, p) => vistaEventoForm(el, p), 'vehiculos'],
  [/^\/v\/([^/]+)$/, vistaVehiculo, 'vehiculos'],
  [/^\/e\/([^/]+)\/editar$/, (el, p) => vistaEventoForm(el, p, { editar: true }), 'registros'],
  [/^\/e\/([^/]+)$/, vistaEvento, 'registros'],
  [/^\/registros$/, vistaRegistros, 'registros'],
  [/^\/admin$/, vistaAdmin, 'admin'],
  [/^\/admin\/usuarios$/, vistaUsuarios, 'admin'],
  [/^\/admin\/roles$/, vistaRoles, 'admin'],
  [/^\/admin\/campos\/(vehiculo|evento)$/, vistaCampos, 'admin'],
  [/^\/admin\/config$/, vistaConfig, 'admin'],
  [/^\/sync$/, vistaSync, 'cuenta'],
  [/^\/cuenta$/, (el, p) => vistaCuenta(el, p, { cerrarSesion }), 'cuenta'],
];

async function navegar() {
  const ruta = location.hash.replace(/^#/, '').split('#')[0];
  const main = $('#vista');
  if (!main) return;
  if (vistaActual && vistaActual.salir) vistaActual.salir();
  vistaActual = null;
  for (const [re, fn, tab] of RUTAS) {
    const m = re.exec(ruta);
    if (!m) continue;
    $$('.tabbar a').forEach((a) => a.classList.toggle('activo', a.dataset.tab === tab));
    main.scrollTop = 0;
    window.scrollTo(0, 0);
    main.classList.remove('entrando');
    void main.offsetWidth;
    main.classList.add('entrando');
    try {
      vistaActual = (await fn(main, m.slice(1))) || null;
    } catch (e) {
      console.error(e);
      pintar(main, html`<section class="pagina"><div class="vacio"><h2>Algo salió mal</h2><p>${e.message}</p><a class="btn btn-sec" href="#/">Volver al inicio</a></div></section>`);
    }
    return;
  }
  location.hash = '#/';
}

// ---------------------------------------------------------------------------
//  Estructura (barra superior + menú inferior)
// ---------------------------------------------------------------------------
function montarShell() {
  pintar(raiz, html`
    ${esDemo() ? html`<div class="cinta-demo">Modo demostración · los datos quedan solo en este dispositivo</div>` : ''}
    <header class="barra-sup">
      <a class="marca" href="#/" aria-label="Inicio"><img class="logo-barra" src="brand/unit-h-blanco.svg" alt="UNIT"><span class="marca-sep"></span><span class="marca-app">Bitácora</span></a>
      <a class="pastilla" id="pastilla" href="#/sync" aria-live="polite"></a>
    </header>
    <main id="vista" class="vista"></main>
    <nav class="tabbar" id="tabbar"></nav>`);
  pintarTabs();
  pintarEstado();
}

function pintarTabs() {
  const nav = $('#tabbar');
  if (!nav) return;
  pintar(nav, html`
    <a href="#/" data-tab="vehiculos">${icono('auto')}<span>Vehículos</span></a>
    <a href="#/registros" data-tab="registros">${icono('lista')}<span>Registros</span></a>
    ${esAdmin() ? html`<a href="#/admin" data-tab="admin">${icono('ajustes')}<span>Admin</span></a>` : ''}
    <a href="#/cuenta" data-tab="cuenta">${icono('usuario')}<span>Cuenta</span></a>`);
  const ruta = location.hash.replace(/^#/, '');
  const tab = (RUTAS.find(([re]) => re.test(ruta.split('#')[0])) || [])[2] || 'vehiculos';
  $$('.tabbar a').forEach((a) => a.classList.toggle('activo', a.dataset.tab === tab));
}

function pintarEstado() {
  const p = $('#pastilla');
  if (!p) return;
  const s = estado.sync;
  const pend = s.ops + s.archivos;
  let cls = 'ok', ico = 'ok', txt = 'Al día';
  if (!estado.online) { cls = 'off'; ico = 'sinNube'; txt = pend ? `Sin conexión · ${pend}` : 'Sin conexión'; }
  else if (s.activo) {
    cls = 'activo'; ico = 'sync';
    txt = estado.subida ? `Subiendo ${Math.round((estado.subida.enviado / Math.max(estado.subida.total, 1)) * 100)}%` : 'Sincronizando';
  } else if (s.errores) { cls = 'error'; ico = 'alerta'; txt = `${s.errores} con error`; }
  else if (pend) { cls = 'pend'; ico = 'reloj'; txt = `${pend} por enviar`; }
  else if (s.error) { cls = 'off'; ico = 'sinNube'; txt = 'Sin servidor'; }
  p.className = 'pastilla ' + cls;
  pintar(p, html`${icono(ico, cls === 'activo' ? 'girando' : '')}<span>${txt}</span>`);
  p.title = s.ultimo ? 'Última sincronización: ' + new Date(s.ultimo).toLocaleString('es-CL') : 'Aún no sincroniza';
}

// ---------------------------------------------------------------------------
//  Sesión
// ---------------------------------------------------------------------------
function mostrarLogin(opciones = {}) {
  vistaActual = null;
  pantallaLogin(raiz, {
    ...opciones,
    onCredencial: async (credential) => {
      const espera = aviso('Verificando acceso…', { duracion: 0 });
      try {
        const r = await llamar('login', { credential });
        espera();
        await iniciarSesion(r);
      } catch (e) {
        espera();
        const msg = e instanceof ErrorApi ? e.message : 'No se pudo conectar con el servidor. ' + e.message;
        mostrarLogin({ ...opciones, mensaje: msg });
      }
    },
  });
}

async function iniciarSesion(r) {
  const anterior = await db.kvGet('sesion');
  const emailAnterior = (await db.kvGet('usuario') || {}).email || (anterior && anterior.usuario.email);
  if (emailAnterior && emailAnterior !== r.usuario.email) {
    // Otra persona usa este teléfono: no mezclar datos
    await db.borrarTodo();
  }
  const sesion = { token: r.token, usuario: r.usuario };
  await db.kvSet('sesion', sesion);
  estado.sesion = sesion;
  setToken(r.token);
  await cargarLocal();
  montarShell();
  navegar();
  aviso('Hola, ' + (r.usuario.nombre || r.usuario.email).split(' ')[0], { tipo: 'ok' });
  await sincronizar({ completo: !estado.campos.length });
}

async function cerrarSesion() {
  await db.borrarTodo();
  estado.sesion = null;
  estado.usuario = null;
  estado.permisos = {};
  setToken(null);
  try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) { /* nada */ }
  location.hash = '#/';
  mostrarLogin();
}

// ---------------------------------------------------------------------------
//  Eventos globales
// ---------------------------------------------------------------------------
on('estado', () => { pintarEstado(); if (vistaActual && vistaActual.enEstado) vistaActual.enEstado(); });
on('subida', () => { pintarEstado(); if (vistaActual && vistaActual.enSubida) vistaActual.enSubida(); });
on('datos', () => {
  if (vistaActual && vistaActual.actualizar) vistaActual.actualizar();
});
on('meta', () => {
  document.title = 'Bitácora · ' + nombreApp();
  const tenia = !!$('.tabbar a[data-tab="admin"]');
  if (tenia !== esAdmin()) pintarTabs();
});
on('auth', async (e) => {
  const email = (estado.sesion && estado.sesion.usuario.email) || '';
  estado.sesion = null;
  setToken(null);
  await db.del('kv', 'sesion');
  mostrarLogin({ mensaje: e.codigo === 'NO_AUTORIZADO' ? e.message : 'Tu sesión expiró.', email: e.codigo === 'AUTH' ? email : '' });
});

window.addEventListener('hashchange', () => { if (estado.sesion) navegar(); });
window.addEventListener('online', () => { estado.online = true; pintarEstado(); programarSync(500); });
window.addEventListener('offline', () => { estado.online = false; pintarEstado(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && estado.sesion) programarSync(300); });
setInterval(() => {
  if (!estado.sesion || document.visibilityState !== 'visible' || !navigator.onLine) return;
  const hace = estado.sync.ultimo ? Date.now() - new Date(estado.sync.ultimo).getTime() : Infinity;
  if (estado.sync.ops || estado.sync.archivos || hace > 120000) sincronizar();
}, 45000);

// ---------------------------------------------------------------------------
//  Service worker (funcionamiento sin conexión e instalación)
// ---------------------------------------------------------------------------
function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      nuevo.addEventListener('statechange', () => {
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
          aviso('Hay una nueva versión de la app', { duracion: 0, accion: { texto: 'Actualizar', fn: () => nuevo.postMessage('activar') } });
        }
      });
    });
  }).catch((e) => console.warn('SW no registrado', e));
  // Recargar solo cuando una versión nueva reemplaza a otra (no en la primera instalación)
  const habiaControlador = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaControlador || recargando) return;
    recargando = true;
    location.reload();
  });
}

// ---------------------------------------------------------------------------
async function iniciar() {
  registrarSW();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  const sesion = await db.kvGet('sesion');
  if (!sesion) { mostrarLogin(); return; }
  estado.sesion = sesion;
  setToken(sesion.token);
  await cargarLocal();
  document.title = 'Bitácora · ' + nombreApp();
  montarShell();
  navegar();
  sincronizar();
}

iniciar().catch((e) => {
  console.error(e);
  pintar(raiz, html`<div class="vacio"><h2>No se pudo iniciar la app</h2><p>${e.message}</p></div>`);
});

export { emitir, contarPendientes };
