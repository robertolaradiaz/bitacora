// Cuenta del usuario, instalación de la app y estado de sincronización.
import { html, pintar, icono, $, $$, aviso, confirmar, fRelativo, fFechaHora, fTam } from '../ui.js';
import { db } from '../db.js';
import { estado, esAdmin } from '../state.js';
import { sincronizar, descartarOp, reintentarOp, descartarArchivo, reintentarArchivo } from '../sync.js';
import { esDemo } from '../api.js';
import { VERSION } from '../version.js';
import { PERMISOS_TXT } from './login.js';
import { plantillaMisSolicitudes, conectarBanners } from './solicitudes.js';

let promptInstalar = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptInstalar = e; });
export const hayInstalador = () => !!promptInstalar;
export const esStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export async function instalar() {
  if (!promptInstalar) return false;
  promptInstalar.prompt();
  const r = await promptInstalar.userChoice;
  promptInstalar = null;
  return r.outcome === 'accepted';
}

export function vistaCuenta(el, _p, { cerrarSesion }) {
  const u = estado.usuario || (estado.sesion && estado.sesion.usuario) || {};
  const permisos = Object.entries(estado.permisos || {}).filter(([, v]) => v).map(([k]) => PERMISOS_TXT[k] || k);
  pintar(el, html`
    <section class="pagina">
      <div class="titulo-pag"><h1>Mi cuenta</h1></div>
      <div class="panel cuenta">
        ${estado.sesion && estado.sesion.usuario.foto ? html`<img class="avatar-foto" src="${estado.sesion.usuario.foto}" alt="" referrerpolicy="no-referrer">`
          : html`<span class="avatar grande">${(u.nombre || u.email || '?').charAt(0).toUpperCase()}</span>`}
        <div><strong>${u.nombre || ''}</strong><span>${u.email || ''}</span><span class="chip chip-neutro">${u.rol || ''}</span></div>
      </div>
      <h2 class="sub-tit">Lo que puedes hacer</h2>
      <ul class="lista-permisos">${permisos.map((p) => html`<li>${icono('ok', 'ico-xs')} ${p}</li>`)}</ul>
      ${u.patentes && u.patentes.length ? html`<p class="sub">Vehículos asignados: ${u.patentes.join(', ')}</p>` : ''}
      <div id="misSolicitudes"></div>

      <h2 class="sub-tit">Aplicación</h2>
      <div class="lista-acciones">
        <a href="#/sync">${icono('sync')}<span>Sincronización<small>${estado.sync.ops + estado.sync.archivos} pendiente(s) · última ${fRelativo(estado.sync.ultimo)}</small></span></a>
        ${!esStandalone() && hayInstalador() ? html`<button id="instalar">${icono('descargar')}<span>Instalar en este teléfono<small>Acceso directo y uso sin conexión</small></span></button>` : ''}
        ${!esStandalone() && !hayInstalador() && esIOS() ? html`<div class="ayuda-ios">${icono('descargar')}<span>Para instalar en iPhone: toca <b>Compartir</b> y luego <b>Agregar a pantalla de inicio</b>.</span></div>` : ''}
        ${esAdmin() ? html`<a href="#/admin">${icono('ajustes')}<span>Administración</span></a>` : ''}
        <button id="salir" class="peligro">${icono('salir')}<span>Cerrar sesión</span></button>
      </div>
      <p class="version">Versión ${VERSION}${esDemo() ? ' · modo demostración' : ''}</p>
    </section>`);
  const pintarSolicitudes = async () => {
    const cont = $('#misSolicitudes', el);
    if (!cont) return;
    pintar(cont, await plantillaMisSolicitudes());
    conectarBanners(cont, pintarSolicitudes);
  };
  pintarSolicitudes();
  const ins = $('#instalar', el);
  if (ins) ins.onclick = async () => { if (await instalar()) aviso('¡App instalada!', { tipo: 'ok' }); };
  $('#salir', el).onclick = async () => {
    const pendientes = estado.sync.ops + estado.sync.archivos;
    const msg = pendientes
      ? `Hay ${pendientes} cambio(s) sin sincronizar que se PERDERÁN si cierras sesión ahora. Conéctate a internet y espera a que se envíen.`
      : 'Se borrarán los datos guardados en este teléfono. Podrás volver a entrar con tu cuenta de Google.';
    if (await confirmar(msg, { titulo: 'Cerrar sesión', si: pendientes ? 'Cerrar igual' : 'Cerrar sesión', peligro: !!pendientes })) cerrarSesion();
  };
}

const NOMBRE_OP = { vehiculo: 'Vehículo', evento: 'Registro', eliminarEvento: 'Eliminar registro', eliminarVehiculo: 'Baja de vehículo', quitarAdjunto: 'Quitar archivo', solicitud: 'Solicitud al administrador' };

export function vistaSync(el) {
  const actualizar = async () => {
    const [ops, archivos, vs, evs] = await Promise.all([db.all('outbox'), db.all('archivos'), db.all('vehiculos'), db.all('eventos')]);
    const vMap = new Map(vs.map((v) => [v.id, v]));
    const eMap = new Map(evs.map((e) => [e.id, e]));
    const desc = (o) => {
      if (o.op === 'vehiculo') return (o.data.patente || (vMap.get(o.data.id) || {}).patente || '');
      const e = eMap.get((o.data && o.data.id) || o.id || o.eventoId);
      return o.data && o.data.titulo ? o.data.titulo : e ? (e.titulo || e.tipo) : '';
    };
    const sub = estado.subida;
    pintar(el, html`
      <section class="pagina">
        <div class="det-nav"><a class="volver" href="#/cuenta">${icono('atras')} Volver</a></div>
        <div class="titulo-pag"><h1>Sincronización</h1></div>
        <div class="panel estado-sync">
          <div class="${estado.online ? 'ok' : 'off'}">${icono(estado.online ? 'nube' : 'sinNube')}<span>${estado.online ? 'Con conexión' : 'Sin conexión'}</span></div>
          <p>Última sincronización: <b>${estado.sync.ultimo ? fFechaHora(estado.sync.ultimo) : 'nunca'}</b></p>
          ${estado.sync.error ? html`<p class="txt-error">${estado.sync.error}</p>` : ''}
          <div class="botones-fila">
            <button class="btn btn-pri" id="ahora" ${estado.sync.activo || !navigator.onLine ? html`disabled` : ''}>${icono('sync', estado.sync.activo ? 'girando' : '')} ${estado.sync.activo ? 'Sincronizando…' : 'Sincronizar ahora'}</button>
            <button class="btn btn-sec" id="completa" ${!navigator.onLine ? html`disabled` : ''}>Descargar todo de nuevo</button>
          </div>
        </div>

        <h2 class="sub-tit">Cambios por enviar <span class="num">${ops.length}</span></h2>
        ${ops.length ? html`<ul class="cola">${ops.map((o) => html`
          <li class="${o.error ? 'con-error' : ''}">
            <div><strong>${NOMBRE_OP[o.op] || o.op}</strong> <span>${desc(o)}</span>
              <small>${fFechaHora(new Date(o.creado).toISOString())}${o.email !== (estado.usuario || {}).email ? ' · de otra cuenta' : ''}</small>
              ${o.error ? html`<p class="txt-error">${o.error}</p>` : ''}</div>
            ${o.error ? html`<div class="cola-acc"><button class="btn btn-sec btn-chico" data-reint="${o.seq}">Reintentar</button><button class="btn btn-peligro-sec btn-chico" data-desc="${o.seq}">Descartar</button></div>` : ''}
          </li>`)}</ul>` : html`<p class="vacio-mini">${icono('ok', 'ico-xs')} No hay cambios pendientes.</p>`}

        <h2 class="sub-tit">Archivos por subir <span class="num">${archivos.length}</span></h2>
        ${archivos.length ? html`<ul class="cola">${archivos.map((a) => {
          const pct = sub && sub.id === a.id ? Math.round((sub.enviado / Math.max(sub.total, 1)) * 100) : null;
          return html`<li class="${a.estado === 'error' ? 'con-error' : ''}">
            <div><strong>${a.nombre}</strong> <span>${fTam(a.tamano)}</span>
              <small>${(eMap.get(a.eventoId) || {}).titulo || ''}</small>
              ${pct !== null ? html`<span class="barra-prog"><span style="width:${pct}%"></span></span>` : ''}
              ${a.estado === 'error' ? html`<p class="txt-error">${a.error}</p>` : ''}</div>
            ${a.estado === 'error' ? html`<div class="cola-acc"><button class="btn btn-sec btn-chico" data-areint="${a.id}">Reintentar</button><button class="btn btn-peligro-sec btn-chico" data-adesc="${a.id}">Descartar</button></div>` : ''}
          </li>`;
        })}</ul>` : html`<p class="vacio-mini">${icono('ok', 'ico-xs')} No hay archivos pendientes.</p>`}
        <p class="sub">Los cambios se guardan en el teléfono y se envían solos cuando hay internet. Mantén la app abierta unos segundos al recuperar señal para que suban los archivos.</p>
      </section>`);
    $('#ahora', el).onclick = () => sincronizar();
    $('#completa', el).onclick = () => sincronizar({ completo: true });
    $$('[data-reint]', el).forEach((b) => { b.onclick = () => reintentarOp(Number(b.dataset.reint)); });
    $$('[data-desc]', el).forEach((b) => { b.onclick = async () => { if (await confirmar('¿Descartar este cambio? No se enviará al servidor.', { peligro: true, si: 'Descartar' })) descartarOp(Number(b.dataset.desc)); }; });
    $$('[data-areint]', el).forEach((b) => { b.onclick = () => reintentarArchivo(b.dataset.areint); });
    $$('[data-adesc]', el).forEach((b) => { b.onclick = async () => { if (await confirmar('¿Descartar este archivo?', { peligro: true, si: 'Descartar' })) descartarArchivo(b.dataset.adesc); }; });
  };
  actualizar();
  return { actualizar, enEstado: actualizar, enSubida: actualizar };
}
