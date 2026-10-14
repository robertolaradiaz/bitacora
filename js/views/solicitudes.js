// Solicitudes para editar o eliminar lo de otros con aprobación del administrador.
import { html, pintar, icono, $, $$, aviso, modal, confirmar, fFechaHora, fRelativo } from '../ui.js';
import { llamar } from '../api.js';
import { db } from '../db.js';
import { estado, esAdmin, campo, nombreUsuario, miEmail, solicitudesPendientes, on } from '../state.js';
import { mostrarValor } from '../campos.js';
import { enviarSolicitud, anularSolicitud, sincronizar } from '../sync.js';

const ACCION = { editar: 'modificar', eliminar: 'eliminar' };
export const accionTxt = (s) => (s.tipo === 'eliminar' && s.entidad === 'vehiculo' ? 'dar de baja' : ACCION[s.tipo] || s.tipo);
const ESTADO_CHIP = { pendiente: 'chip-medio', aprobada: 'chip-ok', rechazada: 'chip-critico', anulada: 'chip-neutro' };
const enlaceDe = (s) => (s.entidad === 'evento' ? '#/e/' : '#/v/') + s.registro_id;

// Aviso dentro del registro o vehículo que tiene una solicitud pendiente
export function bannerSolicitud(s) {
  const que = s.entidad === 'vehiculo' ? 'este vehículo' : 'este registro';
  if (esAdmin()) {
    return html`<div class="banner banner-solicitud">${icono('bandeja')}<div><b>${nombreUsuario(s.solicitado_por)}</b> pide ${accionTxt(s)} ${que}.
      <a href="#/admin/solicitudes">Revisar solicitud</a></div></div>`;
  }
  return html`<div class="banner banner-solicitud">${icono('bandeja')}<div>Pediste ${accionTxt(s)} ${que} ${s.solicitado_en ? fRelativo(s.solicitado_en) : ''}.
    ${s._pendiente ? 'Se enviará al administrador cuando haya conexión.' : 'Esperando la aprobación del administrador.'}
    <button class="btn-link" data-anular="${s.id}">Anular</button></div></div>`;
}

export function conectarBanners(el, refrescar) {
  $$('[data-anular]', el).forEach((b) => {
    b.onclick = async () => {
      if (!await confirmar('¿Anular esta solicitud? El administrador ya no la verá.', { si: 'Anular', peligro: true })) return;
      try {
        await anularSolicitud(b.dataset.anular);
        aviso('Solicitud anulada', { tipo: 'ok' });
      } catch (e) { aviso(e.message, { tipo: 'error' }); }
      refrescar();
    };
  });
}

function campoMotivo(placeholder) {
  return html`<div class="campo"><label for="motivo">Motivo<span class="req">*</span></label>
    <textarea id="motivo" rows="3" placeholder="${placeholder}"></textarea>
    <small class="ayuda">El administrador recibirá un correo y decidirá si se aplica.</small></div>`;
}

// Pedir eliminar (registro) o dar de baja (vehículo)
export function pedirEliminacion({ entidad, registro_id, nombre }) {
  const verbo = entidad === 'vehiculo' ? 'dar de baja' : 'eliminar';
  modal({
    titulo: 'Pedir ' + verbo,
    contenido: html`<p>No puedes ${verbo} ${nombre} directamente porque lo creó otra persona. Puedes pedírselo al administrador.</p>
      ${campoMotivo('Ej: está duplicado, el vehículo se vendió…')}`,
    acciones: [
      { texto: 'Cancelar', clase: 'btn-sec' },
      { texto: 'Enviar solicitud', clase: 'btn-pri', onClick: async (m) => {
        const motivo = $('#motivo', m).value.trim();
        if (!motivo) { aviso('Escribe el motivo', { tipo: 'error' }); return false; }
        try {
          await enviarSolicitud({ tipo: 'eliminar', entidad, registro_id, motivo });
          aviso(navigator.onLine ? 'Solicitud enviada al administrador' : 'Solicitud guardada; se enviará al recuperar conexión', { tipo: 'ok' });
        } catch (e) { aviso(e.message, { tipo: 'error' }); return false; }
      } },
    ],
  });
}

export { campoMotivo };

// Tabla de cambios propuestos: campo, valor anterior y valor nuevo
function tablaCambios(s) {
  const claves = Object.keys(s.cambios || {});
  if (!claves.length) return '';
  return html`<table class="tabla-cambios"><thead><tr><th>Campo</th><th>Antes</th><th>Propuesto</th></tr></thead><tbody>
    ${claves.map((k) => {
      const c = campo(s.entidad, k) || { clave: k, etiqueta: k, tipo: 'texto' };
      const [antes, despues] = s.cambios[k];
      return html`<tr><td>${c.etiqueta}</td><td class="antes">${mostrarValor(c, antes) || '—'}</td><td class="despues">${mostrarValor(c, despues) || '—'}</td></tr>`;
    })}</tbody></table>`;
}

function tarjeta(s, registro, { admin }) {
  const cambio = registro && s.estado === 'pendiente' && s.base_actualizado_en && registro.actualizado_en && registro.actualizado_en > s.base_actualizado_en;
  return html`<li class="panel solicitud ${s.estado}">
    <div class="sol-cab">
      <span class="chip ${s.tipo === 'eliminar' ? 'chip-critico' : 'chip-medio'}">${accionTxt(s).replace(/^./, (x) => x.toUpperCase())}</span>
      <span class="chip ${ESTADO_CHIP[s.estado] || 'chip-neutro'}">${s._pendiente ? 'Por enviar' : s.estado}</span>
    </div>
    <a class="sol-titulo" href="${enlaceDe(s)}">${s.resumen || 'Registro'} ${icono('atras', 'ico-rot ico-xs')}</a>
    <p class="sol-meta">${admin ? html`Pedido por <b>${nombreUsuario(s.solicitado_por)}</b> · ` : ''}${s.solicitado_en ? fFechaHora(s.solicitado_en) : ''}</p>
    ${!registro && s.estado === 'pendiente' ? html`<p class="txt-alerta">${icono('alerta', 'ico-xs')} El registro ya no existe o no está descargado en este teléfono.</p>` : ''}
    ${cambio ? html`<p class="txt-alerta">${icono('alerta', 'ico-xs')} El registro se modificó después de esta solicitud. Revisa antes de aprobar.</p>` : ''}
    ${tablaCambios(s)}
    <p class="sol-motivo"><b>Motivo:</b> ${s.motivo}</p>
    ${s.estado !== 'pendiente' ? html`<p class="sol-meta">${s.estado === 'anulada' ? 'Anulada' : (s.estado === 'aprobada' ? 'Aprobada' : 'Rechazada') + ' por ' + nombreUsuario(s.resuelto_por)} · ${fFechaHora(s.resuelto_en)}
      ${s.comentario ? html`<br><b>Comentario:</b> ${s.comentario}` : ''}</p>` : ''}
    ${admin && s.estado === 'pendiente' && !s._pendiente ? html`<div class="sol-acciones">
      <button class="btn btn-sec btn-chico" data-rechazar="${s.id}">${icono('x')} Rechazar</button>
      <button class="btn btn-pri btn-chico" data-aprobar="${s.id}">${icono('ok')} Aprobar</button></div>` : ''}
    ${!admin && s.estado === 'pendiente' ? html`<div class="sol-acciones"><button class="btn btn-peligro-sec btn-chico" data-anular="${s.id}">Anular</button></div>` : ''}
  </li>`;
}

async function registroDe(s) {
  return db.get(s.entidad === 'evento' ? 'eventos' : 'vehiculos', s.registro_id);
}

// Pantalla del administrador: #/admin/solicitudes
export function vistaSolicitudes(el) {
  if (!esAdmin()) { pintar(el, html`<section class="pagina"><div class="vacio">${icono('candado', 'ico-xl')}<h2>Sin acceso</h2></div></section>`); return null; }
  const actualizar = async () => {
    const lista = estado.solicitudes.slice();
    const pend = lista.filter((s) => s.estado === 'pendiente');
    const resueltas = lista.filter((s) => s.estado !== 'pendiente');
    const regs = new Map(await Promise.all(lista.map(async (s) => [s.id, await registroDe(s)])));
    pintar(el, html`
      <section class="pagina">
        <div class="det-nav"><a class="volver" href="#/admin">${icono('atras')} Administración</a></div>
        <div class="titulo-pag"><h1>Solicitudes</h1><span class="contador">${pend.length ? pend.length + ' pendiente' + (pend.length > 1 ? 's' : '') : ''}</span></div>
        <p class="sub intro">Cambios o eliminaciones que pidieron personas sin permiso para hacerlo directamente. Al aprobar, el cambio se aplica a nombre tuyo y se le avisa por correo a quien lo pidió.</p>
        ${!navigator.onLine ? html`<div class="banner banner-pend">${icono('sinNube')} Sin conexión: para aprobar o rechazar se necesita internet.</div>` : ''}
        ${pend.length ? html`<ul class="lista-solicitudes">${pend.map((s) => tarjeta(s, regs.get(s.id), { admin: true }))}</ul>`
          : html`<div class="vacio vacio-chico">${icono('bandeja', 'ico-xl')}<p>No hay solicitudes pendientes.</p></div>`}
        ${resueltas.length ? html`<h2 class="sub-tit">Últimos 30 días</h2>
          <ul class="lista-solicitudes">${resueltas.map((s) => tarjeta(s, regs.get(s.id), { admin: true }))}</ul>` : ''}
      </section>`);
    $$('[data-aprobar]', el).forEach((b) => { b.onclick = () => resolver(b.dataset.aprobar, true); });
    $$('[data-rechazar]', el).forEach((b) => { b.onclick = () => resolver(b.dataset.rechazar, false); });
  };
  const resolver = (id, aprobar) => {
    const s = estado.solicitudes.find((x) => x.id === id);
    if (!s) return;
    modal({
      titulo: aprobar ? 'Aprobar solicitud' : 'Rechazar solicitud',
      contenido: html`<p>${aprobar ? html`Se aplicará el cambio: <b>${accionTxt(s)}</b> «${s.resumen}».` : html`No se aplicará ningún cambio en «${s.resumen}».`}
        Se le avisará por correo a ${nombreUsuario(s.solicitado_por)}.</p>
        <div class="campo"><label for="coment">Comentario${aprobar ? ' (opcional)' : ' (recomendado)'}</label>
        <textarea id="coment" rows="3" placeholder="${aprobar ? 'Opcional' : 'Ej: el registro es correcto, no se elimina'}"></textarea></div>`,
      acciones: [
        { texto: 'Cancelar', clase: 'btn-sec' },
        { texto: aprobar ? 'Aprobar' : 'Rechazar', clase: aprobar ? 'btn-pri' : 'btn-peligro', onClick: async (m) => {
          if (!navigator.onLine) { aviso('Se necesita conexión a internet', { tipo: 'error' }); return false; }
          try {
            await llamar('resolverSolicitud', { id, aprobar, comentario: $('#coment', m).value.trim() });
            aviso(aprobar ? 'Solicitud aprobada y aplicada' : 'Solicitud rechazada', { tipo: 'ok' });
          } catch (e) { aviso(e.message, { tipo: 'error', duracion: 6000 }); return false; }
          await sincronizar();
          actualizar();
        } },
      ],
    });
  };
  const quitar = on('meta', actualizar);
  actualizar();
  return { actualizar, salir: quitar };
}

// Lista de "Mis solicitudes" (pantalla Cuenta)
export async function plantillaMisSolicitudes() {
  const mias = estado.solicitudes.filter((s) => s.solicitado_por === miEmail());
  if (!mias.length) return '';
  const regs = new Map(await Promise.all(mias.map(async (s) => [s.id, await registroDe(s)])));
  return html`<h2 class="sub-tit">Mis solicitudes</h2><ul class="lista-solicitudes">${mias.map((s) => tarjeta(s, regs.get(s.id), { admin: false }))}</ul>`;
}

export const contarPendientesAdmin = () => (esAdmin() ? solicitudesPendientes().filter((s) => !s._pendiente).length : 0);
