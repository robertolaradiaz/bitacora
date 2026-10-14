// Captura de fotos, videos y audios desde el teléfono.
import { html, icono, modal, $, aviso } from './ui.js';

// Abre la cámara / galería. Debe llamarse directamente desde un toque del usuario.
export function elegirArchivos({ accept = '*/*', capture = null, multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture) input.setAttribute('capture', capture);
    if (multiple) input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    const fin = (lista) => { input.remove(); resolve(lista); };
    input.addEventListener('change', () => fin(Array.from(input.files || [])));
    input.addEventListener('cancel', () => fin([]));
    input.click();
  });
}

// Reduce fotos grandes (ahorra datos móviles y espacio en Drive).
export async function comprimirImagen(file, max = 2048, calidad = 0.82) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size < 400 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * escala);
    const h = Math.round(bmp.height * escala);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close && bmp.close();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', calidad));
    if (!blob || blob.size >= file.size) return file;
    const nombre = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nombre, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch (e) {
    return file;
  }
}

const TIPOS_AUDIO = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/aac'];
export const puedeGrabarAudio = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

// Grabadora de notas de voz dentro de la app.
export function grabarAudio() {
  return new Promise((resolve) => {
    let rec = null;
    let stream = null;
    let partes = [];
    let inicio = 0;
    let reloj = null;
    let resultado = null;
    const detenerTodo = () => {
      clearInterval(reloj);
      if (rec && rec.state !== 'inactive') rec.stop();
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
    const m = modal({
      titulo: 'Nota de voz',
      contenido: html`
        <div class="grabador">
          <div class="grabador-tiempo" id="gTiempo">0:00</div>
          <div class="grabador-onda" id="gOnda"><span></span><span></span><span></span><span></span><span></span></div>
          <p class="grabador-estado" id="gEstado">Pidiendo acceso al micrófono…</p>
          <button class="btn-grabar" id="gBoton" disabled aria-label="Detener">${icono('stop')}</button>
        </div>`,
      acciones: [{ texto: 'Cancelar', clase: 'btn-sec' }],
      alCerrar: () => { detenerTodo(); resolve(resultado); },
    });
    const boton = $('#gBoton', m.el);
    const est = $('#gEstado', m.el);
    navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
      stream = s;
      const tipo = TIPOS_AUDIO.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
      rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      rec.ondataavailable = (e) => { if (e.data && e.data.size) partes.push(e.data); };
      rec.onstop = () => {
        const mime = (rec.mimeType || tipo || 'audio/webm').split(';')[0];
        const ext = mime.includes('mp4') || mime.includes('aac') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
        const dur = Math.round((Date.now() - inicio) / 1000);
        if (partes.length) {
          const blob = new Blob(partes, { type: mime });
          const f = new Date();
          const nombre = `nota-de-voz_${f.getFullYear()}${String(f.getMonth() + 1).padStart(2, '0')}${String(f.getDate()).padStart(2, '0')}_${String(f.getHours()).padStart(2, '0')}${String(f.getMinutes()).padStart(2, '0')}.${ext}`;
          resultado = { blob, nombre, duracion: dur };
        }
        m.cerrar();
      };
      rec.start(1000);
      inicio = Date.now();
      m.el.querySelector('.grabador').classList.add('grabando');
      est.textContent = 'Grabando… toca el botón para terminar';
      boton.disabled = false;
      reloj = setInterval(() => {
        const s = Math.floor((Date.now() - inicio) / 1000);
        $('#gTiempo', m.el).textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        if (s >= 600) boton.click(); // máximo 10 minutos
      }, 250);
    }).catch(() => {
      est.textContent = 'No se pudo usar el micrófono. Revisa los permisos del navegador.';
      aviso('Permiso de micrófono denegado', { tipo: 'error' });
    });
    boton.onclick = () => { boton.disabled = true; est.textContent = 'Guardando…'; clearInterval(reloj); rec.stop(); stream.getTracks().forEach((t) => t.stop()); };
  });
}

// Documentos que se pueden adjuntar (PDF, Office, OpenDocument, texto).
const MIME_DOCS = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  txt: 'text/plain',
  csv: 'text/csv',
};
export const ACCEPT_DOCS = Object.keys(MIME_DOCS).map((e) => '.' + e).concat(Object.values(MIME_DOCS)).join(',');

export const extension = (nombre) => (/\.([a-z0-9]{1,5})$/i.exec(String(nombre || '')) || [])[1]?.toLowerCase() || '';

// Algunos teléfonos entregan documentos sin tipo: se deduce por la extensión.
export function mimeDe(file) {
  return file.type || MIME_DOCS[extension(file.name)] || 'application/octet-stream';
}

export function tipoMedio(mime) {
  const m = String(mime || '');
  if (m.startsWith('image/')) return 'imagen';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (Object.values(MIME_DOCS).includes(m) || m.startsWith('text/')) return 'documento';
  return 'archivo';
}
