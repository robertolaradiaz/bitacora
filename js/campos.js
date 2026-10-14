// Formularios dinámicos: los campos los define el administrador.
import { html, esc, fFecha, fNum, hoyISO, $$, icono } from './ui.js';
import { estado, nombreUsuario, miEmail } from './state.js';

export const opcionesDe = (c) => String(c.opciones || '').split(',').map((s) => s.trim()).filter(Boolean);

export function valorDefecto(c) {
  const d = String(c.por_defecto || '').trim();
  if (!d) return '';
  if (c.tipo === 'fecha' && d.toLowerCase() === 'hoy') return hoyISO();
  if (c.tipo === 'si_no') return /^(si|sí|true|1)$/i.test(d);
  return d;
}

export function inputCampo(c, valor, { soloLectura = false } = {}) {
  const id = 'f_' + c.entidad + '_' + c.clave;
  const v = valor === undefined || valor === null ? '' : valor;
  const req = c.requerido ? html` required` : '';
  const dis = soloLectura ? html` disabled` : '';
  let control;
  switch (c.tipo) {
    case 'texto_largo':
      control = html`<textarea id="${id}" name="${c.clave}" rows="4"${req}${dis}>${v}</textarea>`;
      break;
    case 'numero':
      control = html`<input id="${id}" name="${c.clave}" type="number" inputmode="decimal" step="any" value="${v}"${req}${dis}>`;
      break;
    case 'fecha':
      control = html`<input id="${id}" name="${c.clave}" type="date" value="${v}"${req}${dis}>`;
      break;
    case 'seleccion': {
      const ops = opcionesDe(c);
      if (v && !ops.includes(String(v))) ops.push(String(v));
      control = html`<select id="${id}" name="${c.clave}"${req}${dis}>
        <option value="">— Seleccionar —</option>
        ${ops.map((o) => html`<option value="${o}" ${String(v) === o ? html`selected` : ''}>${o}</option>`)}
      </select>`;
      break;
    }
    case 'multiple': {
      const sel = String(v).split(',').map((s) => s.trim()).filter(Boolean);
      const ops = opcionesDe(c);
      sel.forEach((s) => { if (!ops.includes(s)) ops.push(s); });
      control = html`<div class="chips-opciones" id="${id}" data-multiple="${c.clave}">
        ${ops.map((o) => html`<label class="chip-check"><input type="checkbox" value="${o}" ${sel.includes(o) ? html`checked` : ''}${dis}><span>${o}</span></label>`)}
      </div>`;
      break;
    }
    case 'usuario': {
      // Solo usuarios de la app; un valor antiguo escrito a mano se conserva hasta que se cambie
      const lista = estado.usuarios.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      const actual = String(v);
      const antiguo = actual && !lista.some((u) => u.email === actual.toLowerCase());
      control = html`<select id="${id}" name="${c.clave}" data-usuario="${actual}"${req}${dis}>
        <option value="">— Sin asignar —</option>
        ${antiguo ? html`<option value="${actual}" selected>${actual} (texto anterior)</option>` : ''}
        ${lista.map((u) => html`<option value="${u.email}" ${u.email === actual.toLowerCase() ? html`selected` : ''}>${u.nombre}${u.email === miEmail() ? ' (yo)' : ''}</option>`)}
      </select>
      <small class="aviso-asignacion" hidden></small>`;
      break;
    }
    case 'si_no':
      control = html`<div class="segmentado" id="${id}">
        <label><input type="radio" name="${c.clave}" value="si" ${v === true ? html`checked` : ''}${dis}><span>Sí</span></label>
        <label><input type="radio" name="${c.clave}" value="no" ${v === false ? html`checked` : ''}${dis}><span>No</span></label>
      </div>`;
      break;
    default: {
      const extra = c.clave === 'patente' ? html` autocapitalize="characters" autocomplete="off" spellcheck="false" class="input-patente"` : '';
      control = html`<input id="${id}" name="${c.clave}" type="text" value="${v}"${req}${dis}${extra}>`;
    }
  }
  return html`<div class="campo campo-${c.tipo}" data-campo="${c.clave}">
    <label for="${id}">${c.etiqueta}${c.requerido ? html`<span class="req" aria-label="obligatorio">*</span>` : ''}</label>
    ${control}
    ${c.ayuda ? html`<small class="ayuda">${c.ayuda}</small>` : ''}
    <small class="error-campo" hidden></small>
  </div>`;
}

export function leerCampos(form, campos) {
  const datos = {};
  const errores = [];
  $$('.error-campo', form).forEach((e) => { e.hidden = true; });
  $$('.campo.con-error', form).forEach((e) => e.classList.remove('con-error'));
  for (const c of campos) {
    let v;
    if (c.tipo === 'multiple') {
      v = $$(`[data-multiple="${c.clave}"] input:checked`, form).map((i) => i.value).join(', ');
    } else if (c.tipo === 'si_no') {
      const r = form.querySelector(`input[name="${c.clave}"]:checked`);
      v = r ? r.value === 'si' : '';
    } else {
      const el = form.elements[c.clave];
      if (!el) continue;
      v = String(el.value ?? '').trim();
      if (c.tipo === 'numero' && v !== '') {
        const n = Number(v.replace(',', '.'));
        if (isNaN(n)) { errores.push([c, 'Debe ser un número']); continue; }
        v = n;
      }
    }
    if (c.requerido && (v === '' || v === null)) errores.push([c, 'Este campo es obligatorio']);
    datos[c.clave] = v;
  }
  errores.forEach(([c, msg]) => {
    const cont = form.querySelector(`[data-campo="${c.clave}"]`);
    if (!cont) return;
    cont.classList.add('con-error');
    const e = cont.querySelector('.error-campo');
    e.textContent = msg;
    e.hidden = false;
  });
  if (errores.length) {
    const primero = form.querySelector('.con-error');
    if (primero) primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  return { datos, errores };
}

export function mostrarValor(c, v) {
  if (v === '' || v === null || v === undefined) return '';
  switch (c.tipo) {
    case 'fecha': return fFecha(v);
    case 'numero': return /costo|precio|monto|valor|\$/i.test(c.clave + c.etiqueta) ? '$' + fNum(v) : fNum(v);
    case 'si_no': return v === true || v === 'true' ? 'Sí' : 'No';
    case 'usuario': return nombreUsuario(v);
    default: return String(v);
  }
}

// Al elegir un responsable distinto, avisa que se le enviará un correo. Devuelve una función
// que entrega los nombres de las personas que recibirán aviso al guardar.
export function conectarAvisosResponsable(form, { patente = null, entidad = 'evento', solicitud = false } = {}) {
  const selects = $$('select[data-usuario]', form);
  const nuevos = () => selects.filter((s) => s.value && s.value !== s.dataset.usuario && s.value !== miEmail());
  selects.forEach((s) => {
    const nota = s.parentElement.querySelector('.aviso-asignacion');
    const pintarNota = () => {
      const u = estado.usuarios.find((x) => x.email === s.value);
      if (!u || s.value === s.dataset.usuario || s.value === miEmail()) { nota.hidden = true; return; }
      const sinAcceso = patente && u.patentes && !u.patentes.includes(String(patente).toUpperCase().replace(/[^A-Z0-9]/g, ''));
      nota.innerHTML = html`${icono('correo', 'ico-xs')}<span>${solicitud ? 'Si el administrador aprueba, se' : 'Al guardar se'} le enviará un correo a <b>${u.nombre}</b> avisándole que es responsable${entidad === 'evento' ? ', y lo verá en «Asignados a mí»' : ''}.${sinAcceso ? html` <b class="txt-alerta">Ojo: no tiene acceso a este vehículo, así que no podrá verlo en la app.</b>` : ''}</span>`.toString();
      nota.hidden = false;
    };
    s.addEventListener('change', pintarNota);
  });
  return () => nuevos().map((s) => nombreUsuario(s.value));
}

export function listaDatos(campos, reg, { excluir = [] } = {}) {
  const filas = campos
    .filter((c) => !excluir.includes(c.clave))
    .map((c) => [c, mostrarValor(c, reg[c.clave])])
    .filter(([, v]) => v !== '');
  if (!filas.length) return html`<p class="vacio-mini">Sin datos registrados.</p>`;
  return html`<dl class="datos">${filas.map(([c, v]) => html`
    <div class="dato ${c.tipo === 'texto_largo' ? 'dato-ancho' : ''}"><dt>${c.etiqueta}</dt><dd>${v}</dd></div>`)}</dl>`;
}

export const escAttr = esc;
export const estadoCampos = () => estado.campos;
