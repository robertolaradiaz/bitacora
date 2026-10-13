// Utilidades de interfaz: plantillas seguras, íconos, avisos, diálogos y formatos.

// --- Plantillas HTML con escape automático --------------------------------
class Crudo { constructor(s) { this.s = s; } toString() { return this.s; } }
export const crudo = (s) => new Crudo(String(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function fmt(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Crudo) return v.s;
  if (Array.isArray(v)) return v.map(fmt).join('');
  return esc(v);
}
export function html(partes, ...valores) {
  let out = '';
  partes.forEach((p, i) => { out += p; if (i < valores.length) out += fmt(valores[i]); });
  return new Crudo(out);
}
export function pintar(el, plantilla) { el.innerHTML = fmt(plantilla); return el; }
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

// --- Íconos (SVG en línea) -------------------------------------------------
const P = {
  auto: '<path d="M5 17h14M6 17v2M18 17v2"/><path d="M3 13l2-6a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 7l2 6v4H3z"/><circle cx="7.5" cy="13.5" r="1"/><circle cx="16.5" cy="13.5" r="1"/>',
  lista: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  ajustes: '<path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.5-4.5M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5M20 20v-4h-4"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  camara: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  clip: '<path d="M20 11.5l-8.5 8.5a5 5 0 0 1-7-7L13 4.5a3.5 3.5 0 0 1 5 5L9.5 18a2 2 0 0 1-3-3L14 7.5"/>',
  atras: '<path d="M15 5l-7 7 7 7"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  basura: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  alerta: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  ok: '<path d="M5 12l5 5L20 7"/>',
  nube: '<path d="M7 18a5 5 0 0 1-.6-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>',
  sinNube: '<path d="M3 3l18 18"/><path d="M7 18a5 5 0 0 1-1.6-9.7M10 6.3A6 6 0 0 1 18 9a4.5 4.5 0 0 1 2.3 8"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  archivo: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  arriba: '<path d="M6 15l6-6 6 6"/>',
  abajo: '<path d="M6 9l6 6 6-6"/>',
  externo: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v6H4V6h6"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  imagen: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  salir: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  descargar: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  filtro: '<path d="M4 5h16l-6 8v6l-4-2v-4z"/>',
  hoja: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/>',
  carpeta: '<path d="M3 6h6l2 2h10v11H3z"/>',
  candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  campos: '<rect x="4" y="4" width="16" height="5" rx="1"/><rect x="4" y="12" width="16" height="8" rx="1"/>',
};
export const icono = (n, clase = '') => crudo(`<svg class="ico ${clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`);

// --- Avisos (toasts) -------------------------------------------------------
export function aviso(mensaje, { tipo = 'info', duracion = 3500, accion = null } = {}) {
  let cont = $('#avisos');
  if (!cont) { cont = document.createElement('div'); cont.id = 'avisos'; document.body.appendChild(cont); }
  const el = document.createElement('div');
  el.className = 'aviso aviso-' + tipo;
  el.setAttribute('role', 'status');
  pintar(el, html`<span>${mensaje}</span>${accion ? html`<button class="aviso-btn">${accion.texto}</button>` : ''}`);
  cont.appendChild(el);
  const quitar = () => { el.classList.add('saliendo'); setTimeout(() => el.remove(), 250); };
  if (accion) $('.aviso-btn', el).onclick = () => { accion.fn(); quitar(); };
  if (duracion) setTimeout(quitar, duracion);
  return quitar;
}

// --- Diálogos --------------------------------------------------------------
export function modal({ titulo, contenido, acciones = [], ancho = false, alCerrar = null }) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  pintar(fondo, html`
    <div class="modal ${ancho ? 'modal-ancho' : ''}" role="dialog" aria-modal="true" aria-label="${titulo}">
      <header class="modal-cab"><h2>${titulo}</h2><button class="btn-icono" data-cerrar aria-label="Cerrar">${icono('x')}</button></header>
      <div class="modal-cuerpo">${contenido}</div>
      ${acciones.length ? html`<footer class="modal-pie">${acciones.map((a, i) => html`<button class="btn ${a.clase || ''}" data-i="${i}">${a.texto}</button>`)}</footer>` : ''}
    </div>`);
  document.body.appendChild(fondo);
  document.body.classList.add('con-modal');
  let cerrado = false;
  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    fondo.remove();
    if (!$('.modal-fondo')) document.body.classList.remove('con-modal');
    if (alCerrar) alCerrar();
  };
  $('[data-cerrar]', fondo).onclick = cerrar;
  fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });
  $$('[data-i]', fondo).forEach((b) => {
    b.onclick = async () => {
      const a = acciones[Number(b.dataset.i)];
      if (!a.onClick) return cerrar();
      b.disabled = true;
      try { const r = await a.onClick(fondo, cerrar); if (r !== false) cerrar(); } finally { b.disabled = false; }
    };
  });
  const primero = $('input,select,textarea', fondo);
  if (primero && window.matchMedia('(pointer:fine)').matches) primero.focus();
  return { el: fondo, cerrar };
}

export function confirmar(mensaje, { titulo = 'Confirmar', si = 'Aceptar', peligro = false } = {}) {
  return new Promise((resolve) => {
    let r = false;
    modal({
      titulo,
      contenido: html`<p>${mensaje}</p>`,
      acciones: [
        { texto: 'Cancelar', clase: 'btn-sec' },
        { texto: si, clase: peligro ? 'btn-peligro' : 'btn-pri', onClick: () => { r = true; } },
      ],
      alCerrar: () => resolve(r),
    });
  });
}

// --- Formatos --------------------------------------------------------------
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function hoyISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function fFecha(s) {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (!m) return String(s);
  return Number(m[3]) + ' ' + MESES[Number(m[2]) - 1] + ' ' + m[1];
}
export function fFechaHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear() + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
export function fRelativo(iso) {
  if (!iso) return 'nunca';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'recién';
  if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min';
  if (s < 86400) return 'hace ' + Math.floor(s / 3600) + ' h';
  return fFechaHora(iso);
}
export function diasHasta(fechaISO) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fechaISO || ''));
  if (!m) return null;
  const f = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const h = new Date(); h.setHours(0, 0, 0, 0);
  return Math.round((f - h) / 86400000);
}
export const fNum = (n) => (n === '' || n === null || n === undefined || isNaN(Number(n)) ? String(n ?? '') : Number(n).toLocaleString('es-CL'));
export function fTam(b) {
  if (!b && b !== 0) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
export function colorDe(texto) {
  let h = 0;
  for (const c of String(texto || '')) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
export const normTexto = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
