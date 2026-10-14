// Galería de adjuntos (fotos, videos, audios) y visor.
import { html, icono, pintar, $$, modal, fTam, aviso } from '../ui.js';
import { tipoMedio, extension } from '../media.js';
import { obtenerMiniatura, obtenerArchivo } from '../sync.js';
import { esDemo } from '../api.js';
import { estado } from '../state.js';

const urls = new Set();
export function urlDe(blob) { const u = URL.createObjectURL(blob); urls.add(u); return u; }
export function liberarUrls() { urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear(); }

const ICONO_TIPO = { imagen: 'imagen', video: 'video', audio: 'mic', documento: 'archivo', archivo: 'archivo' };
// Drive genera miniatura (primera página) para fotos, videos y documentos.
const CON_MINIATURA = ['imagen', 'video', 'documento'];

// items: [{ id, nombre, mime, tamano, driveId?, url?, blob?, estado?, error? }]
export function plantillaGaleria(items, { quitable = false } = {}) {
  if (!items.length) return html`<p class="vacio-mini">Sin archivos adjuntos.</p>`;
  return html`<ul class="galeria">${items.map((a) => {
    const tipo = tipoMedio(a.mime);
    const pendiente = !a.driveId;
    const sub = estado.subida && estado.subida.id === a.id ? estado.subida : null;
    const pct = sub ? Math.round((sub.enviado / Math.max(sub.total, 1)) * 100) : 0;
    return html`<li class="adj adj-${tipo} ${pendiente ? 'adj-pendiente' : ''} ${a.estado === 'error' ? 'adj-error' : ''}" data-adj="${a.id}">
      <button type="button" class="adj-ver" data-ver="${a.id}" aria-label="Ver ${a.nombre}">
        <span class="adj-fondo">${icono(ICONO_TIPO[tipo])}</span>
        <img class="adj-img" alt="" hidden>
        ${tipo === 'video' ? html`<span class="adj-play">${icono('play')}</span>` : ''}
        ${(tipo === 'documento' || tipo === 'archivo') && extension(a.nombre) ? html`<span class="adj-ext">${extension(a.nombre).toUpperCase()}</span>` : ''}
        ${tipo === 'audio' && a.duracion ? html`<span class="adj-dur">${Math.floor(a.duracion / 60)}:${String(a.duracion % 60).padStart(2, '0')}</span>` : ''}
      </button>
      <span class="adj-nombre" title="${a.nombre}">${a.nombre}</span>
      <span class="adj-meta">${pendiente
        ? (a.estado === 'error' ? html`<b class="txt-error">Error: ${a.error || 'no se pudo subir'}</b>` : sub ? html`Subiendo ${pct}%` : html`${icono('reloj', 'ico-xs')} Pendiente de subir`)
        : fTam(a.tamano)}</span>
      ${sub ? html`<span class="barra-prog"><span style="width:${pct}%"></span></span>` : ''}
      ${quitable ? html`<button type="button" class="adj-quitar" data-quitar="${a.id}" aria-label="Quitar ${a.nombre}">${icono('x')}</button>` : ''}
    </li>`;
  })}</ul>`;
}

// Carga miniaturas y conecta el visor.
export function montarGaleria(raiz, items, { onQuitar = null } = {}) {
  const porId = new Map(items.map((a) => [a.id, a]));
  $$('[data-adj]', raiz).forEach(async (li) => {
    const a = porId.get(li.dataset.adj);
    if (!a) return;
    const tipo = tipoMedio(a.mime);
    const img = li.querySelector('.adj-img');
    let blob = null;
    if (a.blob && tipo === 'imagen') blob = a.blob;
    else if (a.driveId && CON_MINIATURA.includes(tipo)) blob = await obtenerMiniatura(a.driveId, 400);
    if (blob && /^image\//.test(blob.type || 'image/')) {
      img.src = urlDe(blob);
      img.hidden = false;
      li.classList.add('con-mini');
    } else if (a.blob && tipo === 'video') {
      // primer cuadro del video local
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'metadata';
      v.src = urlDe(a.blob) + '#t=0.5';
      v.className = 'adj-img';
      img.replaceWith(v);
      li.classList.add('con-mini');
    }
  });
  $$('[data-ver]', raiz).forEach((b) => { b.onclick = () => verAdjunto(porId.get(b.dataset.ver)); });
  if (onQuitar) $$('[data-quitar]', raiz).forEach((b) => { b.onclick = () => onQuitar(porId.get(b.dataset.quitar)); });
}

export async function verAdjunto(a) {
  if (!a) return;
  const tipo = tipoMedio(a.mime);
  const enDrive = a.driveId && a.url && !esDemo();
  const m = modal({
    titulo: a.nombre,
    ancho: true,
    contenido: html`<div class="visor" id="visor"><div class="cargando">Cargando…</div></div>
      ${enDrive ? html`<a class="btn btn-sec btn-bloque" href="${a.url}" target="_blank" rel="noopener">${icono('externo')} Abrir en Google Drive</a>` : ''}`,
  });
  const cont = m.el.querySelector('#visor');
  try {
    let blob = a.blob || null;
    if (!blob && a.driveId) {
      if (tipo === 'imagen') blob = await obtenerMiniatura(a.driveId, 1600);
      else if (tipo === 'audio') blob = await obtenerArchivo(a.driveId);
      else if (tipo === 'video') blob = await obtenerArchivoLocal(a.driveId);
      else if (tipo === 'documento' && enDrive) {
        // Vista previa de la primera página; el documento completo se abre en Drive.
        const mini = await obtenerMiniatura(a.driveId, 1600);
        if (mini && /^image\//.test(mini.type || '')) {
          pintar(cont, html`<img src="${urlDe(mini)}" alt="Primera página de ${a.nombre}">`);
          return;
        }
      }
    }
    if (!blob) {
      pintar(cont, html`<div class="visor-vacio">${icono(ICONO_TIPO[tipo])}<p>${navigator.onLine
        ? (enDrive ? 'Este archivo se ve mejor directamente en Google Drive.' : 'Vista previa no disponible.')
        : 'Sin conexión: este archivo no está guardado en el teléfono.'}</p></div>`);
      return;
    }
    const u = urlDe(blob);
    if (tipo === 'imagen') pintar(cont, html`<img src="${u}" alt="${a.nombre}">`);
    else if (tipo === 'video') pintar(cont, html`<video src="${u}" controls playsinline></video>`);
    else if (tipo === 'audio') pintar(cont, html`<div class="visor-audio">${icono('mic')}<audio src="${u}" controls></audio></div>`);
    else pintar(cont, html`<div class="visor-vacio">${icono('archivo')}<p>${fTam(blob.size)}</p>
      <div class="visor-botones">
        ${tipo === 'documento' ? html`<a class="btn btn-sec" href="${u}" target="_blank" rel="noopener">${icono('externo')} Abrir</a>` : ''}
        <a class="btn btn-pri" href="${u}" download="${a.nombre}">${icono('descargar')} Descargar</a>
      </div></div>`);
  } catch (e) {
    pintar(cont, html`<div class="visor-vacio"><p>${e.message}</p></div>`);
    aviso('No se pudo abrir el archivo', { tipo: 'error' });
  }
}

async function obtenerArchivoLocal(driveId) {
  const { db } = await import('../db.js');
  const c = await db.get('cache', 'f:' + driveId);
  return c ? c.blob : null;
}
