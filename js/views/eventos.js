// Vistas de registros (mantenciones, problemas, hallazgos…): listado, detalle y formulario.
import { html, pintar, icono, $, $$, aviso, confirmar, fFecha, fFechaHora, normTexto, fTam, modal } from '../ui.js';
import { db } from '../db.js';
import {
  estado, puede, camposDe, puedeEditarEvento, puedeEliminarEvento, puedeAdjuntar, puedeSolicitar, solicitudPendiente,
  esResponsable, nombreUsuario, miEmail, esAdmin, on, puedeEditarVehiculo,
} from '../state.js';
import { inputCampo, leerCampos, valorDefecto, listaDatos, conectarAvisosResponsable } from '../campos.js';
import { guardarEvento, eliminarEvento, quitarAdjunto, uuid, enviarSolicitud, anularSolicitud } from '../sync.js';
import { reemplazar, salirA } from '../nav.js';
import { bannerSolicitud, conectarBanners, pedirEliminacion, campoMotivo } from './solicitudes.js';
import { formatoPatente, nombreVehiculo, estaAbierto, claseEstado, clasePrioridad, tonoTipo, tituloEvento, ordenarEventos } from '../negocio.js';
import { elegirArchivos, comprimirImagen, grabarAudio, puedeGrabarAudio, ACCEPT_DOCS, mimeDe } from '../media.js';
import { plantillaGaleria, montarGaleria, liberarUrls } from './adjuntos.js';
import { patenteHTML } from './vehiculos.js';

export function itemEvento(e, { conPatente = null } = {}) {
  const n = (e.adjuntos || []).length;
  const cResp = camposDe('evento').find((c) => c.tipo === 'usuario' && e[c.clave]);
  const resp = cResp ? e[cResp.clave] : '';
  const soyResp = resp && String(resp).toLowerCase() === miEmail();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(e.fecha || '');
  const MES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  return html`<li class="item-ev ${e._pendiente ? 'es-pendiente' : ''}" style="--tono:${tonoTipo(e.tipo)}">
    <a href="#/e/${e.id}">
      <div class="ev-fecha">${m ? html`<b>${Number(m[3])}</b><span>${MES[Number(m[2]) - 1]}</span><small>${m[1]}</small>` : '—'}</div>
      <div class="ev-cuerpo">
        <div class="ev-tipo"><span class="punto"></span>${e.tipo || 'Registro'}${conPatente ? html` · <b class="ev-pat">${formatoPatente(conPatente.patente)}</b>` : ''}</div>
        <strong class="ev-titulo">${tituloEvento(e)}</strong>
        ${e.descripcion ? html`<p class="ev-desc">${String(e.descripcion).slice(0, 140)}${String(e.descripcion).length > 140 ? '…' : ''}</p>` : ''}
        <div class="ev-chips">
          ${e.estado ? html`<span class="chip ${claseEstado(e.estado)}">${e.estado}</span>` : ''}
          ${e.prioridad && estaAbierto(e) ? html`<span class="chip ${clasePrioridad(e.prioridad)}">${e.prioridad}</span>` : ''}
          ${resp ? html`<span class="chip ${soyResp ? 'chip-asignado' : 'chip-neutro'}">${icono('usuario', 'ico-xs')} ${soyResp ? 'Asignado a mí' : nombreUsuario(resp)}</span>` : ''}
          ${n ? html`<span class="chip chip-neutro">${icono('clip', 'ico-xs')} ${n}</span>` : ''}
          ${solicitudPendiente(e.id) ? html`<span class="chip chip-medio">${icono('bandeja', 'ico-xs')} Solicitud pendiente</span>` : ''}
          ${e._error ? html`<span class="chip chip-critico">Error al sincronizar</span>` : e._pendiente ? html`<span class="chip chip-pend">${icono('reloj', 'ico-xs')} Sin sincronizar</span>` : ''}
        </div>
      </div>
    </a>
  </li>`;
}

// ---------------------------------------------------------------------------
const filtroReg = { q: '', estado: 'abiertos', tipo: '' };

export function vistaRegistros(el) {
  const tipos = (camposDe('evento').find((c) => c.clave === 'tipo') || {}).opciones || '';
  pintar(el, html`
    <section class="pagina">
      <div class="titulo-pag"><h1>Registros</h1><span class="contador" id="cuenta"></span></div>
      <label class="busqueda">${icono('buscar')}<input type="search" id="q" placeholder="Buscar en títulos, descripciones, patentes…" value="${filtroReg.q}" autocomplete="off"></label>
      <div class="filtros">
        ${[['abiertos', 'Abiertos'], ['asignados', 'Asignados a mí'], ['todos', 'Todos'], ['mios', 'Creados por mí'], ['pendientes', 'Sin sincronizar']].map(([k, t]) =>
          html`<button class="filtro ${filtroReg.estado === k ? 'activo' : ''}" data-f="${k}">${t}${k === 'asignados' ? html` <span class="num-filtro" id="numAsig"></span>` : ''}</button>`)}
        <select id="fTipo" class="filtro-select" aria-label="Tipo"><option value="">Todos los tipos</option>
          ${tipos.split(',').map((s) => s.trim()).filter(Boolean).map((t) => html`<option ${filtroReg.tipo === t ? html`selected` : ''}>${t}</option>`)}</select>
      </div>
      <ol id="lista" class="linea-tiempo"></ol>
    </section>`);

  const actualizar = async () => {
    const [evs, vs] = await Promise.all([db.all('eventos'), db.all('vehiculos')]);
    const vMap = new Map(vs.map((v) => [v.id, v]));
    const q = normTexto(filtroReg.q);
    let lista = evs.filter((e) => vMap.has(e.vehiculo_id));
    const asignadosAbiertos = lista.filter((e) => esResponsable(e) && estaAbierto(e)).length;
    $('#numAsig', el).textContent = asignadosAbiertos ? String(asignadosAbiertos) : '';
    if (filtroReg.estado === 'abiertos') lista = lista.filter(estaAbierto);
    if (filtroReg.estado === 'asignados') lista = lista.filter((e) => esResponsable(e));
    if (filtroReg.estado === 'mios') lista = lista.filter((e) => e.creado_por === (estado.usuario || {}).email);
    if (filtroReg.estado === 'pendientes') lista = lista.filter((e) => e._pendiente || e._error);
    if (filtroReg.tipo) lista = lista.filter((e) => e.tipo === filtroReg.tipo);
    if (q) lista = lista.filter((e) => normTexto(Object.values(e).filter((x) => typeof x !== 'object').join(' ') + ' ' + (vMap.get(e.vehiculo_id) || {}).patente).includes(q));
    lista = ordenarEventos(lista).slice(0, 300);
    $('#cuenta', el).textContent = String(lista.length);
    pintar($('#lista', el), lista.length ? lista.map((e) => itemEvento(e, { conPatente: vMap.get(e.vehiculo_id) }))
      : html`<li class="vacio vacio-chico">${icono('lista', 'ico-xl')}<p>${filtroReg.estado === 'abiertos' && !q ? 'No hay registros abiertos. ¡Todo al día!'
        : filtroReg.estado === 'asignados' && !q ? 'No tienes registros asignados.' : 'No hay registros con estos filtros.'}</p></li>`);
  };
  const q = $('#q', el);
  q.addEventListener('input', () => { filtroReg.q = q.value; actualizar(); });
  $$('[data-f]', el).forEach((b) => b.addEventListener('click', () => {
    filtroReg.estado = b.dataset.f;
    $$('[data-f]', el).forEach((x) => x.classList.toggle('activo', x === b));
    actualizar();
  }));
  $('#fTipo', el).onchange = (e) => { filtroReg.tipo = e.target.value; actualizar(); };
  actualizar();
  return { actualizar };
}

// ---------------------------------------------------------------------------
async function adjuntosDe(ev) {
  const pendientes = await db.porIndice('archivos', 'eventoId', ev.id);
  return (ev.adjuntos || []).concat(pendientes.map((a) => ({
    id: a.id, nombre: a.nombre, mime: a.mime, tamano: a.tamano, blob: a.blob, estado: a.estado, error: a.error, duracion: a.duracion,
  })));
}

export function vistaEvento(el, [id]) {
  let quitarOyente = null;
  const actualizar = async () => {
    const ev = await db.get('eventos', id);
    if (!ev) {
      pintar(el, html`<section class="pagina"><a class="volver" href="#/registros">${icono('atras')} Registros</a>
        <div class="vacio"><h2>Registro no encontrado</h2><p>Puede que haya sido eliminado o que no tengas acceso.</p></div></section>`);
      return;
    }
    const v = await db.get('vehiculos', ev.vehiculo_id);
    const items = await adjuntosDe(ev);
    const editable = puedeEditarEvento(ev);
    const eliminable = puedeEliminarEvento(ev);
    const solicitar = puedeSolicitar() && !ev._pendiente;
    const pendientes = estado.solicitudes.filter((s) => s.registro_id === id && s.estado === 'pendiente' && (esAdmin() || s.solicitado_por === miEmail()));
    liberarUrls();
    pintar(el, html`
      <section class="pagina pagina-det" style="--tono:${tonoTipo(ev.tipo)}">
        <div class="det-nav">
          <a class="volver" href="#/v/${ev.vehiculo_id}">${icono('atras')} ${v ? formatoPatente(v.patente) : 'Volver'}</a>
          <div class="det-acciones">
            ${editable ? html`<a class="btn btn-sec btn-chico" href="#/e/${id}/editar">${icono('editar')} Editar</a>`
              : solicitar ? html`<a class="btn btn-sec btn-chico" href="#/e/${id}/solicitar">${icono('editar')} Pedir cambio</a>` : ''}
            ${eliminable ? html`<button class="btn-icono peligro" id="eliminar" aria-label="Eliminar registro">${icono('basura')}</button>`
              : solicitar ? html`<button class="btn-icono peligro" id="pedirEliminar" aria-label="Pedir eliminar registro" title="Pedir eliminar">${icono('basura')}</button>` : ''}
          </div>
        </div>
        ${pendientes.map((s) => bannerSolicitud(s))}
        <header class="ev-cab">
          <div class="ev-tipo grande"><span class="punto"></span>${ev.tipo || 'Registro'}</div>
          <h1>${tituloEvento(ev)}</h1>
          <div class="ev-chips">
            <span class="chip chip-neutro">${icono('reloj', 'ico-xs')} ${fFecha(ev.fecha)}</span>
            ${ev.estado ? html`<span class="chip ${claseEstado(ev.estado)}">${ev.estado}</span>` : ''}
            ${ev.prioridad ? html`<span class="chip ${clasePrioridad(ev.prioridad)}">Prioridad ${String(ev.prioridad).toLowerCase()}</span>` : ''}
          </div>
        </header>
        ${ev._error ? html`<div class="banner banner-error">${icono('alerta')} No se pudo sincronizar: ${ev._error}. <a href="#/sync">Ver detalle</a></div>`
          : ev._pendiente ? html`<div class="banner banner-pend">${icono('reloj')} Guardado en el teléfono; se enviará al servidor cuando haya conexión.</div>` : ''}
        ${v ? html`<a class="veh-mini" href="#/v/${v.id}">${patenteHTML(v.patente)}<span>${nombreVehiculo(v)}</span>${icono('atras', 'ico-rot')}</a>` : ''}

        <div class="panel">${listaDatos(camposDe('evento'), ev, { excluir: ['titulo', 'tipo', 'fecha', 'estado', 'prioridad'] })}</div>

        <h2 class="sub-tit">Archivos <span class="num">${items.length}</span>
          ${puedeAdjuntar(ev) && editable ? html`<a class="btn-link" href="#/e/${id}/editar#adjuntos">${icono('mas', 'ico-xs')} Agregar</a>` : ''}</h2>
        <div id="galeria">${plantillaGaleria(items)}</div>

        <footer class="meta">
          <span>Creado por <b>${ev.creado_por}</b> · ${fFechaHora(ev.creado_en)}</span>
          ${ev.actualizado_en && ev.actualizado_en !== ev.creado_en ? html`<span>Actualizado por <b>${ev.actualizado_por}</b> · ${fFechaHora(ev.actualizado_en)}</span>` : ''}
        </footer>
      </section>`);
    montarGaleria($('#galeria', el), items);
    const elim = $('#eliminar', el);
    if (elim) elim.onclick = async () => {
      if (!await confirmar('¿Eliminar este registro? Los archivos adjuntos se conservan en Drive.', { titulo: 'Eliminar registro', si: 'Eliminar', peligro: true })) return;
      await eliminarEvento(id);
      aviso('Registro eliminado', { tipo: 'ok' });
      reemplazar('/v/' + ev.vehiculo_id);
    };
    const pedir = $('#pedirEliminar', el);
    if (pedir) pedir.onclick = () => pedirEliminacion({ entidad: 'evento', registro_id: id, nombre: `el registro «${tituloEvento(ev)}»` });
    conectarBanners(el, actualizar);
  };
  // refrescar la barra de progreso de subida
  quitarOyente = on('subida', (s) => { if (s && s.eventoId === id) actualizar(); });
  actualizar();
  return { actualizar, salir: () => { quitarOyente && quitarOyente(); liberarUrls(); } };
}

// ---------------------------------------------------------------------------
// Formulario: /v/:vehiculoId/registro (nuevo), /e/:id/editar o /e/:id/solicitar (pedir cambio)
export async function vistaEventoForm(el, [idVeh], { editar = false, solicitar = false } = {}) {
  let ev = null;
  let vehiculoId = idVeh;
  if (editar || solicitar) {
    ev = await db.get('eventos', idVeh);
    const permitido = ev && (solicitar ? puedeSolicitar() : puedeEditarEvento(ev));
    if (!permitido) { aviso('No puedes editar este registro', { tipo: 'error' }); reemplazar(ev ? '/e/' + ev.id : '/'); return; }
    vehiculoId = ev.vehiculo_id;
  } else if (!puede('crear_eventos')) { reemplazar('/v/' + idVeh); return; }
  const v = await db.get('vehiculos', vehiculoId);
  if (!v) { reemplazar('/'); return; }

  const campos = camposDe('evento');
  const nuevos = [];         // archivos agregados en este formulario
  const aQuitar = [];        // adjuntos existentes a quitar
  const existentes = ev && !solicitar ? await adjuntosDe(ev) : [];
  const permiteAdjuntar = !solicitar && puedeAdjuntar(ev);
  const maxMB = Number(estado.config.tamano_max_mb || 300);
  const volver = ev ? '#/e/' + ev.id : '#/v/' + vehiculoId;
  const previa = solicitar ? solicitudPendiente(ev.id, 'editar') : null;
  // Si ya hay una solicitud pendiente, el formulario muestra lo que se pidió para poder corregirlo
  const valorInicial = (c) => (previa && previa.cambios && previa.cambios[c.clave] ? previa.cambios[c.clave][1] : ev ? ev[c.clave] : valorDefecto(c));

  pintar(el, html`
    <section class="pagina pagina-form">
      <div class="det-nav"><a class="volver" href="${volver}">${icono('atras')} Cancelar</a></div>
      <div class="form-cab">
        ${patenteHTML(v.patente)}
        <div><h1>${solicitar ? 'Pedir cambio' : ev ? 'Editar registro' : 'Nuevo registro'}</h1><p class="sub">${nombreVehiculo(v)}</p></div>
      </div>
      ${solicitar ? html`<div class="banner banner-solicitud">${icono('bandeja')}<div>Este registro lo creó ${nombreUsuario(ev.creado_por)}.
        Cambia lo que haga falta y explica el motivo: el administrador recibirá la solicitud y decidirá si se aplica.</div></div>` : ''}
      <form id="form" class="formulario" novalidate>
        ${campos.map((c) => inputCampo(c, valorInicial(c)))}
        ${solicitar ? campoMotivo('¿Por qué hay que cambiarlo?') : ''}
        ${permiteAdjuntar ? html`
          <fieldset class="adjuntar" id="adjuntos">
            <legend>Fotos, videos, audios y documentos</legend>
            <div class="botones-medios">
              <button type="button" class="btn-medio" data-medio="foto">${icono('camara')}<span>Foto</span></button>
              <button type="button" class="btn-medio" data-medio="video">${icono('video')}<span>Video</span></button>
              <button type="button" class="btn-medio" data-medio="audio">${icono('mic')}<span>Audio</span></button>
              <button type="button" class="btn-medio" data-medio="archivo">${icono('clip')}<span>Galería</span></button>
              <button type="button" class="btn-medio" data-medio="documento">${icono('archivo')}<span>PDF/Doc</span></button>
            </div>
            <div id="galeria"></div>
            <small class="ayuda">Máximo ${maxMB} MB por archivo. Se suben a Google Drive al sincronizar.</small>
          </fieldset>` : ''}
        <div class="form-acciones">
          <button type="submit" class="btn btn-pri btn-bloque">${icono('ok')} ${solicitar ? 'Enviar solicitud al administrador' : 'Guardar registro'}</button>
        </div>
        <p class="nota-offline">${icono('nube', 'ico-xs')} Puedes guardar sin conexión: se enviará automáticamente.</p>
      </form>
    </section>`);

  const form = $('#form', el);
  const galeria = $('#galeria', el);
  const avisados = conectarAvisosResponsable(form, { patente: v.patente, solicitud: solicitar });

  const pintarGaleria = () => {
    if (!galeria) return;
    liberarUrls();
    const items = existentes.filter((a) => !aQuitar.includes(a.id)).concat(nuevos);
    pintar(galeria, plantillaGaleria(items, { quitable: true }));
    montarGaleria(galeria, items, {
      onQuitar: (a) => {
        const i = nuevos.findIndex((x) => x.id === a.id);
        if (i >= 0) nuevos.splice(i, 1); else aQuitar.push(a.id);
        pintarGaleria();
      },
    });
  };

  const agregar = async (archivos, extra = {}) => {
    for (let f of archivos) {
      if (!f || !f.size) continue;
      if (f.type.startsWith('image/') && estado.config.comprimir_fotos !== 'no') f = await comprimirImagen(f);
      if (f.size > maxMB * 1048576) { aviso(`"${f.name}" supera ${maxMB} MB (${fTam(f.size)})`, { tipo: 'error', duracion: 6000 }); continue; }
      const nombre = f.name && f.name !== 'image.jpg' ? f.name : `foto_${Date.now()}.jpg`;
      const mime = mimeDe(f);
      if (mime !== f.type) f = new File([f], f.name, { type: mime, lastModified: f.lastModified });
      nuevos.push(Object.assign({ id: uuid(), nombre, mime, tamano: f.size, blob: f }, extra));
    }
    pintarGaleria();
  };

  $$('[data-medio]', el).forEach((b) => {
    b.onclick = async () => {
      const t = b.dataset.medio;
      if (t === 'foto') agregar(await elegirArchivos({ accept: 'image/*', capture: 'environment' }));
      else if (t === 'video') agregar(await elegirArchivos({ accept: 'video/*', capture: 'environment' }));
      else if (t === 'archivo') agregar(await elegirArchivos({ accept: 'image/*,video/*,audio/*', multiple: true }));
      else if (t === 'documento') agregar(await elegirArchivos({ accept: ACCEPT_DOCS, multiple: true }));
      else if (t === 'audio') {
        if (puedeGrabarAudio()) {
          const r = await grabarAudio();
          if (r) { const f = new File([r.blob], r.nombre, { type: r.blob.type }); agregar([f], { duracion: r.duracion }); }
        } else {
          agregar(await elegirArchivos({ accept: 'audio/*', capture: 'user' }));
        }
      }
    };
  });
  pintarGaleria();
  if (location.hash.endsWith('#adjuntos') && galeria) setTimeout(() => $('#adjuntos', el).scrollIntoView({ behavior: 'smooth' }), 50);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { datos, errores } = leerCampos(form, campos);
    if (errores.length) { aviso('Revisa los campos marcados', { tipo: 'error' }); return; }
    const btn = form.querySelector('[type=submit]');
    if (solicitar) {
      const motivo = $('#motivo', form).value.trim();
      const cambios = {};
      campos.forEach((c) => {
        const antes = ev[c.clave] === undefined || ev[c.clave] === null ? '' : ev[c.clave];
        if (String(antes) !== String(datos[c.clave] ?? '')) cambios[c.clave] = datos[c.clave];
      });
      if (!Object.keys(cambios).length) { aviso('No cambiaste ningún dato', { tipo: 'error' }); return; }
      if (!motivo) { aviso('Explica el motivo de la solicitud', { tipo: 'error' }); $('#motivo', form).focus(); return; }
      btn.disabled = true;
      try {
        await enviarSolicitud({ tipo: 'editar', entidad: 'evento', registro_id: ev.id, datos: cambios, motivo, resumen: `${v.patente} · ${tituloEvento(ev)}`,
          cambios: Object.fromEntries(Object.entries(cambios).map(([k, x]) => [k, [ev[k] ?? '', x]])) });
        aviso(navigator.onLine ? 'Solicitud enviada. Te avisaremos por correo cuando el administrador la revise.' : 'Solicitud guardada; se enviará al recuperar conexión', { tipo: 'ok', duracion: 5000 });
        salirA('/e/' + ev.id);
      } catch (err) { aviso(err.message, { tipo: 'error' }); } finally { btn.disabled = false; }
      return;
    }
    btn.disabled = true;
    try {
      const reg = await guardarEvento(Object.assign({}, datos, { id: ev ? ev.id : uuid(), vehiculo_id: vehiculoId }), nuevos.map((n) => ({
        id: n.id, nombre: n.nombre, blob: n.blob, mime: n.mime, duracion: n.duracion,
      })));
      for (const idAdj of aQuitar) {
        const a = existentes.find((x) => x.id === idAdj);
        if (a) await quitarAdjunto(reg.id, a);
      }
      // Actualizar kilometraje del vehículo si el registro trae uno mayor
      if (datos.kilometraje && puedeEditarVehiculo(v) && Number(datos.kilometraje) > Number(v.kilometraje || 0) && camposDe('vehiculo').some((c) => c.clave === 'kilometraje')) {
        const { guardarVehiculo } = await import('../sync.js');
        await guardarVehiculo({ id: v.id, kilometraje: Number(datos.kilometraje) });
      }
      const nombres = avisados();
      aviso((navigator.onLine ? 'Registro guardado' : 'Guardado en el teléfono. Se enviará al recuperar conexión')
        + (nombres.length ? `. Se avisará por correo a ${nombres.join(' y ')}.` : ''), { tipo: 'ok', duracion: nombres.length ? 5000 : 3500 });
      salirA('/e/' + reg.id);
    } catch (err) {
      aviso(err.message, { tipo: 'error' });
    } finally {
      btn.disabled = false;
    }
  });
  return { salir: liberarUrls };
}
