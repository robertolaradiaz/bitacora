// Arranque de la app, navegación y barra de estado.
import { html, pintar, icono, $, $$, aviso } from './ui.js';
import { db } from './db.js';
import { llamar, setToken, esDemo, ErrorApi } from './api.js';
import { estado, on, emitir, esAdmin, nombreApp } from './state.js';
import { cargarLocal, sincronizar, programarSync, contarPendientes } from './sync.js';
import { registrarEntrada, reemplazar, volver, irPestana, hayPendiente } from './nav.js';
import { pantallaLogin } from './views/login.js';
import { vistaVehiculos, vistaVehiculo, vistaVehiculoForm } from './views/vehiculos.js';
import { vistaRegistros, vistaEvento, vistaEventoForm } from './views/eventos.js';
import { vistaAdmin, vistaUsuarios, vistaRoles, vistaCampos, vistaConfig } from './views/admin.js';
import { vistaCuenta, vistaSync } from './views/cuenta.js';
import { vistaSolicitudes, contarPendientesAdmin } from './views/solicitudes.js';
import { ErrorSoloLectura } from './sync.js';
import { salirVerComo } from './vercomo.js';
import { esResponsable } from './state.js';
import { estaAbierto } from './negocio.js';

const raiz = document.getElementById('app');
let vistaActual = null;

// ---------------------------------------------------------------------------
//  Rutas
// ---------------------------------------------------------------------------
const RUTAS = [
  [/^\/?$/, vistaVehiculos, 'vehiculos'],
  [/^\/v\/nuevo$/, (el) => vistaVehiculoForm(el, []), 'vehiculos'],
  [/^\/v\/([^/]+)\/editar$/, (el, p) => vistaVehiculoForm(el, p), 'vehiculos'],
  [/^\/v\/([^/]+)\/solicitar$/, (el, p) => vistaVehiculoForm(el, p, { solicitar: true }), 'vehiculos'],
  [/^\/v\/([^/]+)\/registro$/, (el, p) => vistaEventoForm(el, p), 'vehiculos'],
  [/^\/v\/([^/]+)$/, vistaVehiculo, 'vehiculos'],
  [/^\/e\/([^/]+)\/editar$/, (el, p) => vistaEventoForm(el, p, { editar: true }), 'registros'],
  [/^\/e\/([^/]+)\/solicitar$/, (el, p) => vistaEventoForm(el, p, { solicitar: true }), 'registros'],
  [/^\/e\/([^/]+)$/, vistaEvento, 'registros'],
  [/^\/registros$/, vistaRegistros, 'registros'],
  [/^\/admin$/, vistaAdmin, 'admin'],
  [/^\/admin\/solicitudes$/, vistaSolicitudes, 'admin'],
  [/^\/admin\/usuarios$/, vistaUsuarios, 'admin'],
  [/^\/admin\/roles$/, vistaRoles, 'admin'],
  [/^\/admin\/campos\/(vehiculo|evento)$/, vistaCampos, 'admin'],
  [/^\/admin\/config$/, vistaConfig, 'admin'],
  [/^\/sync$/, vistaSync, 'cuenta'],
  [/^\/cuenta$/, (el, p) => vistaCuenta(el, p, { cerrarSesion }), 'cuenta'],
];

async function navegar() {
  const main = $('#vista');
  if (!main) return;
  if (!registrarEntrada()) return;
  // El botón atrás también cierra los diálogos abiertos
  $$('.modal-fondo [data-cerrar]').forEach((b) => b.click());
  const ruta = location.hash.replace(/^#/, '').split('#')[0];
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
  reemplazar('/');
}

// "Volver" retrocede en el historial en vez de abrir otra pantalla encima
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a.volver');
  if (!a || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  volver(a.getAttribute('href') || '#/');
});

// ---------------------------------------------------------------------------
//  Estructura (barra superior + menú inferior)
// ---------------------------------------------------------------------------
function montarShell() {
  pintar(raiz, html`
    ${esDemo() && !estado.verComo ? html`<div class="cinta-demo">Modo demostración · los datos quedan solo en este dispositivo</div>` : ''}
    ${estado.verComo ? html`<div class="cinta-vercomo">${icono('ojo', 'ico-xs')}<span>Viendo como <b>${estado.verComo.nombre}</b> · solo lectura</span>
      <button id="salirVerComo">Salir</button></div>` : ''}
    <header class="barra-sup">
      <a class="marca" href="#/" aria-label="Inicio"><img class="logo-barra" src="brand/unit-h-blanco.svg" alt="UNIT"><span class="marca-sep"></span><span class="marca-app">Bitácora</span></a>
      <a class="pastilla" id="pastilla" href="#/sync" aria-live="polite"></a>
    </header>
    <main id="vista" class="vista"></main>
    <nav class="tabbar" id="tabbar"></nav>`);
  $('.barra-sup .marca').onclick = (e) => { e.preventDefault(); irPestana('/'); };
  const salir = $('#salirVerComo');
  if (salir) salir.onclick = () => salirVerComo();
  pintarTabs();
  pintarEstado();
  pintarContadores();
}

function pintarTabs() {
  const nav = $('#tabbar');
  if (!nav) return;
  pintar(nav, html`
    <a href="#/" data-tab="vehiculos">${icono('auto')}<span>Vehículos</span></a>
    <a href="#/registros" data-tab="registros">${icono('lista')}<span>Registros</span><b class="globo" id="globoReg" hidden></b></a>
    ${esAdmin() ? html`<a href="#/admin" data-tab="admin">${icono('ajustes')}<span>Admin</span><b class="globo" id="globoAdmin" hidden></b></a>` : ''}
    <a href="#/cuenta" data-tab="cuenta">${icono('usuario')}<span>Cuenta</span></a>`);
  const ruta = location.hash.replace(/^#/, '');
  const tab = (RUTAS.find(([re]) => re.test(ruta.split('#')[0])) || [])[2] || 'vehiculos';
  $$('.tabbar a').forEach((a) => {
    a.classList.toggle('activo', a.dataset.tab === tab);
    a.onclick = (e) => { e.preventDefault(); irPestana(a.getAttribute('href')); };
  });
}

// Globos del menú: registros abiertos asignados a mí y solicitudes por revisar (admin)
async function pintarContadores() {
  const evs = await db.all('eventos');
  const asignados = evs.filter((e) => esResponsable(e) && estaAbierto(e)).length;
  const gR = $('#globoReg');
  if (gR) { gR.textContent = String(asignados); gR.hidden = !asignados; gR.title = 'Asignados a mí'; }
  const gA = $('#globoAdmin');
  const sol = contarPendientesAdmin();
  if (gA) { gA.textContent = String(sol); gA.hidden = !sol; gA.title = 'Solicitudes por revisar'; }
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
  if (estado.verComo) await salirVerComo({ silencioso: true });
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
  pintarContadores();
});
on('meta', () => {
  document.title = 'Bitácora · ' + nombreApp();
  const tenia = !!$('.tabbar a[data-tab="admin"]');
  if (tenia !== esAdmin()) pintarTabs();
  pintarContadores();
});

// Entrar o salir de "ver como" rehace la estructura (cinta superior y menú)
on('shell', () => { montarShell(); navegar(); });

// Intentos de guardar en modo "ver como" (solo lectura)
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason instanceof ErrorSoloLectura) { e.preventDefault(); aviso(e.reason.message, { tipo: 'error' }); }
});
// En la demo los correos no se envían: se muestran como aviso para poder probar
window.addEventListener('demo-correo', (e) => aviso(`Demo · correo a ${e.detail.to}: «${e.detail.subject}»`, { duracion: 6000 }));
on('auth', async (e) => {
  if (estado.verComo) await salirVerComo({ silencioso: true });
  const email = (estado.sesion && estado.sesion.usuario.email) || '';
  estado.sesion = null;
  setToken(null);
  await db.del('kv', 'sesion');
  mostrarLogin({ mensaje: e.codigo === 'NO_AUTORIZADO' ? e.message : 'Tu sesión expiró.', email: e.codigo === 'AUTH' ? email : '' });
});

window.addEventListener('hashchange', () => { if (estado.sesion) navegar(); });
// Al cambiar de pestaña se retrocede en el historial; si la ruta no cambió, no hay "hashchange"
window.addEventListener('popstate', () => { setTimeout(() => { if (hayPendiente() && estado.sesion) navegar(); }, 60); });
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
// Actualización automática: se busca una versión nueva al abrir, al volver a la app y
// cada 30 minutos. El service worker nuevo se activa solo; aquí se avisa y se recarga.
const enFormulario = () => /\/(editar|registro|nuevo|solicitar)$/.test(location.hash.split('#')[1] || '');

function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting) reg.waiting.postMessage('activar'); // versión que quedó esperando (apps antiguas)
    const buscar = () => { if (navigator.onLine) reg.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') buscar(); });
    setInterval(buscar, 30 * 60000);
  }).catch((e) => console.warn('SW no registrado', e));
  // Recargar solo cuando una versión nueva reemplaza a otra (no en la primera instalación)
  const habiaControlador = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaControlador || recargando) return;
    recargando = true;
    const recargar = () => { aviso('Nueva versión instalada. Actualizando…', { tipo: 'ok', duracion: 0 }); setTimeout(() => location.reload(), 1500); };
    // Si la persona está llenando un formulario, se espera a que salga de él para no perder lo escrito
    if (!enFormulario()) { recargar(); return; }
    aviso('Hay una nueva versión. Se actualizará al terminar este formulario.', { duracion: 6000 });
    const alSalir = () => { if (!enFormulario()) { window.removeEventListener('hashchange', alSalir); recargar(); } };
    window.addEventListener('hashchange', alSalir);
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
