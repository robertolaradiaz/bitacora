// Vistas de vehículos: listado, ficha con historial y formulario.
import { html, pintar, icono, $, $$, aviso, confirmar, fNum, normTexto, fFecha } from '../ui.js';
import { db } from '../db.js';
import {
  estado, puede, camposDe, puedeCrearVehiculo, puedeEditarVehiculo, puedeSolicitar, solicitudPendiente, nombreUsuario,
  esResponsable, miEmail, esAdmin,
} from '../state.js';
import { inputCampo, leerCampos, valorDefecto, listaDatos, conectarAvisosResponsable } from '../campos.js';
import { guardarVehiculo, darDeBajaVehiculo, enviarSolicitud } from '../sync.js';
import { formatoPatente, nombreVehiculo, alertasVehiculo, estaAbierto, ordenarEventos } from '../negocio.js';
import { itemEvento } from './eventos.js';
import { reemplazar, salirA } from '../nav.js';
import { bannerSolicitud, conectarBanners, pedirEliminacion, campoMotivo } from './solicitudes.js';

const filtro = { q: '', modo: 'todos' };
const etiquetaCorta = (t) => {
  const s = String(t).replace(/^Vencimiento\s+(de\s+)?/i, '').replace(/\s*\((fecha|km)\)\s*$/i, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function patenteHTML(p, grande = false) {
  return html`<span class="patente ${grande ? 'patente-grande' : ''}"><span class="patente-txt">${formatoPatente(p)}</span><span class="patente-pais">CHILE</span></span>`;
}

function agrupar(eventos) {
  const m = new Map();
  eventos.forEach((e) => { if (!m.has(e.vehiculo_id)) m.set(e.vehiculo_id, []); m.get(e.vehiculo_id).push(e); });
  return m;
}

// ---------------------------------------------------------------------------
export function vistaVehiculos(el) {
  pintar(el, html`
    <section class="pagina">
      <div class="titulo-pag"><h1>Vehículos</h1><span class="contador" id="cuenta"></span></div>
      <label class="busqueda">${icono('buscar')}<input type="search" id="q" placeholder="Buscar patente, marca, responsable…" value="${filtro.q}" autocomplete="off"></label>
      <div class="filtros" role="tablist">
        ${[['todos', 'Todos'], ['asignados', 'Asignados a mí'], ['alertas', 'Con alertas'], ['abiertos', 'Con pendientes']].map(([k, t]) =>
          html`<button class="filtro ${filtro.modo === k ? 'activo' : ''}" data-modo="${k}" role="tab">${t}</button>`)}
      </div>
      <div id="lista" class="lista-veh"></div>
      ${puedeCrearVehiculo() ? html`<a class="fab" href="#/v/nuevo">${icono('mas')}<span>Vehículo</span></a>` : ''}
    </section>`);

  const actualizar = async () => {
    const [vs, evs] = await Promise.all([db.all('vehiculos'), db.all('eventos')]);
    const porVeh = agrupar(evs);
    const q = normTexto(filtro.q);
    let lista = vs.map((v) => {
      const eventos = porVeh.get(v.id) || [];
      return { v, alertas: alertasVehiculo(v, eventos), abiertos: eventos.filter(estaAbierto).length, total: eventos.length };
    });
    if (q) lista = lista.filter(({ v }) => normTexto(Object.values(v).join(' ') + ' ' + nombreUsuario(v.responsable)).includes(q) || normTexto(formatoPatente(v.patente)).includes(q));
    if (filtro.modo === 'asignados') lista = lista.filter((x) => esResponsable(x.v, 'vehiculo'));
    if (filtro.modo === 'alertas') lista = lista.filter((x) => x.alertas.length);
    if (filtro.modo === 'abiertos') lista = lista.filter((x) => x.abiertos);
    lista.sort((a, b) => (b.alertas.some((x) => x.nivel === 'vencido') - a.alertas.some((x) => x.nivel === 'vencido')) || String(a.v.patente).localeCompare(String(b.v.patente)));
    $('#cuenta', el).textContent = vs.length ? `${lista.length} de ${vs.length}` : '';
    const cont = $('#lista', el);
    if (!vs.length) {
      pintar(cont, html`<div class="vacio">${icono('auto', 'ico-xl')}
        <h2>${estado.sync.ultimo ? 'Aún no hay vehículos' : 'Descargando datos…'}</h2>
        <p>${estado.sync.ultimo
          ? (puede('editar_vehiculos') ? 'Agrega el primer vehículo de la flota con el botón +.' : 'Cuando el administrador te asigne vehículos aparecerán aquí.')
          : 'La primera vez se necesita conexión a internet.'}</p></div>`);
      return;
    }
    if (!lista.length) { pintar(cont, html`<div class="vacio vacio-chico"><p>Ningún vehículo coincide con la búsqueda.</p></div>`); return; }
    pintar(cont, lista.map(({ v, alertas, abiertos, total }) => html`
      <a class="tarjeta-veh ${v._pendiente ? 'es-pendiente' : ''}" href="#/v/${v.id}">
        ${patenteHTML(v.patente)}
        <div class="veh-info">
          <strong>${nombreVehiculo(v)}</strong>
          <span>${[v.tipo_vehiculo, v.anio, v.kilometraje ? fNum(v.kilometraje) + ' km' : ''].filter(Boolean).join(' · ')}</span>
          ${v.responsable ? html`<span class="veh-resp">${icono('usuario', 'ico-xs')} ${String(v.responsable).toLowerCase() === miEmail() ? 'Asignado a mí' : nombreUsuario(v.responsable)}</span>` : ''}
        </div>
        <div class="veh-marcas">
          ${alertas.slice(0, 2).map((a) => html`<span class="marca-alerta ${a.nivel}" title="${a.etiqueta}: ${a.fechaTxt}">${icono('alerta', 'ico-xs')} ${etiquetaCorta(a.etiqueta)}</span>`)}
          ${alertas.length > 2 ? html`<span class="marca-alerta proximo">+${alertas.length - 2}</span>` : ''}
          ${abiertos ? html`<span class="marca-abiertos">${abiertos} abierto${abiertos > 1 ? 's' : ''}</span>` : ''}
          ${!alertas.length && !abiertos ? html`<span class="marca-total">${total} registro${total === 1 ? '' : 's'}</span>` : ''}
          ${v._error ? html`<span class="marca-alerta vencido">Error al sincronizar</span>` : v._pendiente ? html`<span class="marca-pend">${icono('reloj', 'ico-xs')} Sin sincronizar</span>` : ''}
        </div>
      </a>`));
  };

  const q = $('#q', el);
  q.addEventListener('input', () => { filtro.q = q.value; actualizar(); });
  $$('[data-modo]', el).forEach((b) => b.addEventListener('click', () => {
    filtro.modo = b.dataset.modo;
    $$('[data-modo]', el).forEach((x) => x.classList.toggle('activo', x === b));
    actualizar();
  }));
  actualizar();
  return { actualizar };
}

// ---------------------------------------------------------------------------
const filtroHist = { tipo: '', soloAbiertos: false, pestana: 'historial' };

export function vistaVehiculo(el, [id]) {
  const actualizar = async () => {
    const v = await db.get('vehiculos', id);
    if (!v) {
      pintar(el, html`<section class="pagina"><a class="volver" href="#/">${icono('atras')} Vehículos</a>
        <div class="vacio"><h2>Vehículo no encontrado</h2><p>Puede que haya sido dado de baja o que no tengas acceso.</p></div></section>`);
      return;
    }
    const eventos = ordenarEventos(await db.porIndice('eventos', 'vehiculo_id', id));
    const alertas = alertasVehiculo(v, eventos);
    const tipos = [...new Set(eventos.map((e) => e.tipo).filter(Boolean))];
    let lista = eventos;
    if (filtroHist.tipo) lista = lista.filter((e) => e.tipo === filtroHist.tipo);
    if (filtroHist.soloAbiertos) lista = lista.filter(estaAbierto);
    const abiertos = eventos.filter(estaAbierto).length;
    const ultimo = eventos[0];

    const pendientes = estado.solicitudes.filter((s) => s.registro_id === id && s.estado === 'pendiente' && (esAdmin() || s.solicitado_por === miEmail()));
    pintar(el, html`
      <section class="pagina pagina-det">
        <div class="det-nav">
          <a class="volver" href="#/">${icono('atras')} Vehículos</a>
          ${puedeEditarVehiculo(v) ? html`<a class="btn btn-sec btn-chico" href="#/v/${id}/editar">${icono('editar')} Editar</a>`
            : puedeSolicitar() && !v._pendiente ? html`<a class="btn btn-sec btn-chico" href="#/v/${id}/solicitar">${icono('editar')} Pedir cambio</a>` : ''}
        </div>
        ${pendientes.map((s) => bannerSolicitud(s))}
        <header class="veh-cab">
          ${patenteHTML(v.patente, true)}
          <div>
            <h1>${nombreVehiculo(v)}</h1>
            <p class="sub">${[v.tipo_vehiculo, v.anio, v.color].filter(Boolean).join(' · ')}</p>
          </div>
        </header>
        <div class="kpis">
          <div class="kpi"><span>Kilometraje</span><strong>${v.kilometraje ? fNum(v.kilometraje) : '—'}</strong></div>
          <div class="kpi"><span>Abiertos</span><strong class="${abiertos ? 'txt-alerta' : ''}">${abiertos}</strong></div>
          <div class="kpi"><span>Último registro</span><strong>${ultimo ? fFecha(ultimo.fecha) : '—'}</strong></div>
        </div>
        ${v._error ? html`<div class="banner banner-error">${icono('alerta')} No se pudo sincronizar: ${v._error}. <a href="#/sync">Ver detalle</a></div>` : ''}
        ${alertas.length ? html`<ul class="alertas">${alertas.map((a) => html`
          <li class="alerta ${a.nivel}">${icono('alerta')}<div><strong>${a.etiqueta}</strong><span>${a.fechaTxt} · ${a.texto}</span></div></li>`)}</ul>` : ''}

        <div class="pestanas" role="tablist">
          <button role="tab" class="${filtroHist.pestana === 'historial' ? 'activo' : ''}" data-pest="historial">Historial <span class="num">${eventos.length}</span></button>
          <button role="tab" class="${filtroHist.pestana === 'ficha' ? 'activo' : ''}" data-pest="ficha">Ficha</button>
        </div>

        ${filtroHist.pestana === 'ficha'
          ? html`<div class="panel">${listaDatos(camposDe('vehiculo'), v, { excluir: ['patente'] })}</div>`
          : html`
            ${eventos.length ? html`<div class="filtros-hist">
              <select id="fTipo" aria-label="Filtrar por tipo"><option value="">Todos los tipos</option>
                ${tipos.map((t) => html`<option ${filtroHist.tipo === t ? html`selected` : ''}>${t}</option>`)}</select>
              <label class="toggle-chico"><input type="checkbox" id="fAbiertos" ${filtroHist.soloAbiertos ? html`checked` : ''}> Solo abiertos</label>
            </div>` : ''}
            ${lista.length ? html`<ol class="linea-tiempo">${lista.map((e) => itemEvento(e))}</ol>`
              : html`<div class="vacio vacio-chico">${icono('lista', 'ico-xl')}<p>${eventos.length ? 'No hay registros con este filtro.' : 'Este vehículo aún no tiene registros.'}</p></div>`}`}
        ${puede('crear_eventos') ? html`<a class="fab" href="#/v/${id}/registro">${icono('mas')}<span>Registro</span></a>` : ''}
      </section>`);

    $$('[data-pest]', el).forEach((b) => { b.onclick = () => { filtroHist.pestana = b.dataset.pest; actualizar(); }; });
    const fTipo = $('#fTipo', el);
    if (fTipo) fTipo.onchange = () => { filtroHist.tipo = fTipo.value; actualizar(); };
    const fAb = $('#fAbiertos', el);
    if (fAb) fAb.onchange = () => { filtroHist.soloAbiertos = fAb.checked; actualizar(); };
    conectarBanners(el, actualizar);
  };
  filtroHist.tipo = '';
  filtroHist.soloAbiertos = false;
  filtroHist.pestana = 'historial';
  actualizar();
  return { actualizar };
}

// ---------------------------------------------------------------------------
export async function vistaVehiculoForm(el, [id], { solicitar = false } = {}) {
  const v = id ? await db.get('vehiculos', id) : null;
  if (id && !v) { reemplazar('/'); return; }
  const permitido = solicitar ? (v && puedeSolicitar()) : (v ? puedeEditarVehiculo(v) : puedeCrearVehiculo());
  if (!permitido) { reemplazar(id ? '/v/' + id : '/'); return; }
  const campos = camposDe('vehiculo');
  const previa = solicitar ? solicitudPendiente(id, 'editar') : null;
  const valorInicial = (c) => (previa && previa.cambios && previa.cambios[c.clave] ? previa.cambios[c.clave][1] : v ? v[c.clave] : valorDefecto(c));
  pintar(el, html`
    <section class="pagina pagina-form">
      <div class="det-nav"><a class="volver" href="${id ? '#/v/' + id : '#/'}">${icono('atras')} ${id ? 'Volver' : 'Vehículos'}</a></div>
      <h1>${solicitar ? 'Pedir cambio' : id ? 'Editar vehículo' : 'Nuevo vehículo'}</h1>
      ${solicitar ? html`<div class="banner banner-solicitud">${icono('bandeja')}<div>Este vehículo lo registró ${nombreUsuario(v.creado_por)}.
        Cambia lo que haga falta y explica el motivo: el administrador recibirá la solicitud y decidirá si se aplica.</div></div>` : ''}
      <form id="form" class="formulario" novalidate>
        ${campos.map((c) => inputCampo(c, valorInicial(c)))}
        ${solicitar ? campoMotivo('¿Por qué hay que cambiarlo?') : ''}
        <div class="form-acciones">
          <button type="submit" class="btn btn-pri btn-bloque">${icono('ok')} ${solicitar ? 'Enviar solicitud al administrador' : 'Guardar'}</button>
          ${id ? html`<button type="button" class="btn btn-peligro-sec btn-bloque" id="baja">${icono('basura')} ${solicitar ? 'Pedir dar de baja' : 'Dar de baja vehículo'}</button>` : ''}
        </div>
        <p class="nota-offline">${icono('nube', 'ico-xs')} Se guarda en el teléfono y se sincroniza automáticamente cuando haya conexión.</p>
      </form>
    </section>`);

  const form = $('#form', el);
  const avisados = conectarAvisosResponsable(form, { patente: v ? v.patente : null, entidad: 'vehiculo', solicitud: solicitar });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { datos, errores } = leerCampos(form, campos);
    if (errores.length) { aviso('Revisa los campos marcados', { tipo: 'error' }); return; }
    if (solicitar) {
      const motivo = $('#motivo', form).value.trim();
      const cambios = {};
      campos.forEach((c) => {
        const antes = v[c.clave] === undefined || v[c.clave] === null ? '' : v[c.clave];
        if (String(antes) !== String(datos[c.clave] ?? '')) cambios[c.clave] = datos[c.clave];
      });
      if (!Object.keys(cambios).length) { aviso('No cambiaste ningún dato', { tipo: 'error' }); return; }
      if (!motivo) { aviso('Explica el motivo de la solicitud', { tipo: 'error' }); $('#motivo', form).focus(); return; }
      try {
        await enviarSolicitud({ tipo: 'editar', entidad: 'vehiculo', registro_id: id, datos: cambios, motivo, resumen: `${v.patente} · ${nombreVehiculo(v)}`,
          cambios: Object.fromEntries(Object.entries(cambios).map(([k, x]) => [k, [v[k] ?? '', x]])) });
        aviso(navigator.onLine ? 'Solicitud enviada. Te avisaremos por correo cuando el administrador la revise.' : 'Solicitud guardada; se enviará al recuperar conexión', { tipo: 'ok', duracion: 5000 });
        salirA('/v/' + id);
      } catch (err) { aviso(err.message, { tipo: 'error' }); }
      return;
    }
    // patente duplicada (validación local; el servidor también la valida)
    const pn = String(datos.patente || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const otros = await db.all('vehiculos');
    if (pn && otros.some((x) => x.id !== id && String(x.patente || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === pn)) {
      aviso('Ya existe un vehículo con esa patente', { tipo: 'error' });
      return;
    }
    let reg;
    try {
      reg = await guardarVehiculo(Object.assign({}, datos, { id: id || undefined }));
    } catch (err) { aviso(err.message, { tipo: 'error' }); return; }
    const nombres = avisados();
    aviso((navigator.onLine ? 'Vehículo guardado' : 'Guardado en el teléfono. Se enviará al recuperar conexión')
      + (nombres.length ? `. Se avisará por correo a ${nombres.join(' y ')}.` : ''), { tipo: 'ok', duracion: nombres.length ? 5000 : 3500 });
    salirA('/v/' + reg.id);
  });
  const baja = $('#baja', el);
  if (baja && solicitar) baja.onclick = () => pedirEliminacion({ entidad: 'vehiculo', registro_id: id, nombre: `el vehículo ${formatoPatente(v.patente)}` });
  else if (baja) baja.onclick = async () => {
    if (!await confirmar(`¿Dar de baja el vehículo ${formatoPatente(v.patente)}? Dejará de aparecer en la app, pero su historial se conserva en la planilla.`, { titulo: 'Dar de baja', si: 'Dar de baja', peligro: true })) return;
    try { await darDeBajaVehiculo(id); } catch (err) { aviso(err.message, { tipo: 'error' }); return; }
    aviso('Vehículo dado de baja', { tipo: 'ok' });
    reemplazar('/');
  };
}
