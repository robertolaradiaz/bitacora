// Administración: usuarios y accesos, roles y permisos, campos y configuración.
import { html, pintar, icono, $, $$, aviso, modal, confirmar, esc } from '../ui.js';
import { llamar, esDemo } from '../api.js';
import { db } from '../db.js';
import { estado, esAdmin, solicitudesPendientes } from '../state.js';
import { sincronizar } from '../sync.js';
import { formatoPatente } from '../negocio.js';
import { entrarVerComo } from '../vercomo.js';

let datos = null;

const TIPOS = {
  texto: 'Texto corto', texto_largo: 'Texto largo', numero: 'Número', fecha: 'Fecha',
  seleccion: 'Lista (una opción)', multiple: 'Lista (varias opciones)', si_no: 'Sí / No',
  usuario: 'Usuario de la app (responsable, avisa por correo)',
};

async function cargar(el, forzar = false) {
  if (datos && !forzar) return datos;
  if (!navigator.onLine) {
    pintar(el, html`<section class="pagina"><a class="volver" href="#/admin">${icono('atras')} Administración</a>
      <div class="vacio">${icono('sinNube', 'ico-xl')}<h2>Se necesita conexión</h2><p>La administración trabaja directo sobre el servidor para que los cambios se apliquen a todos.</p></div></section>`);
    return null;
  }
  pintar(el, html`<section class="pagina"><div class="cargando">Cargando…</div></section>`);
  try {
    datos = await llamar('adminDatos');
    return datos;
  } catch (e) {
    pintar(el, html`<section class="pagina"><div class="vacio"><h2>No se pudo cargar</h2><p>${e.message}</p></div></section>`);
    return null;
  }
}

function guardia(el) {
  if (esAdmin()) return true;
  pintar(el, html`<section class="pagina"><div class="vacio">${icono('candado', 'ico-xl')}<h2>Sin acceso</h2><p>Solo los administradores pueden entrar aquí.</p></div></section>`);
  return false;
}

async function ejecutar(accion, payload, ok) {
  try {
    const r = await llamar(accion, payload);
    if (ok) aviso(ok, { tipo: 'ok' });
    return r;
  } catch (e) {
    aviso(e.message, { tipo: 'error', duracion: 6000 });
    return null;
  }
}

const cabecera = (titulo, sub) => html`
  <div class="det-nav"><a class="volver" href="#/admin">${icono('atras')} Administración</a></div>
  <div class="titulo-pag"><h1>${titulo}</h1></div>${sub ? html`<p class="sub intro">${sub}</p>` : ''}`;

// ---------------------------------------------------------------------------
export async function vistaAdmin(el) {
  if (!guardia(el)) return;
  datos = null;
  pintar(el, html`
    <section class="pagina">
      <div class="titulo-pag"><h1>Administración</h1></div>
      ${esDemo() ? html`<div class="banner banner-pend">${icono('alerta')} Modo demostración: los cambios solo se guardan en este dispositivo.</div>` : ''}
      <nav class="menu-admin">
        ${(() => {
          const n = solicitudesPendientes().filter((s) => !s._pendiente).length;
          return html`<a href="#/admin/solicitudes" class="${n ? 'con-pendientes' : ''}">${icono('bandeja')}<div><strong>Solicitudes${n ? html` <span class="globo-inline">${n}</span>` : ''}</strong>
            <span>${n ? `${n} pedido${n > 1 ? 's' : ''} de cambio esperando tu aprobación` : 'Cambios y eliminaciones que piden otros usuarios'}</span></div></a>`;
        })()}
        <a href="#/admin/usuarios">${icono('usuario')}<div><strong>Usuarios y accesos</strong><span>Quién entra con su Gmail, su rol y qué vehículos ve. También puedes ver la app como cada uno.</span></div></a>
        <a href="#/admin/roles">${icono('candado')}<div><strong>Roles y permisos</strong><span>Qué puede ver o hacer cada rol</span></div></a>
        <a href="#/admin/campos/evento">${icono('campos')}<div><strong>Campos de los registros</strong><span>Mantenciones, problemas, hallazgos…</span></div></a>
        <a href="#/admin/campos/vehiculo">${icono('auto')}<div><strong>Campos de los vehículos</strong><span>Ficha de cada vehículo</span></div></a>
        <a href="#/admin/config">${icono('ajustes')}<div><strong>Configuración</strong><span>Nombre, alertas, archivos</span></div></a>
      </nav>
      <div id="enlaces" class="enlaces-admin"></div>
    </section>`);
  if (!esDemo() && navigator.onLine) {
    const d = await cargar(document.createElement('div'));
    if (d && $('#enlaces', el)) pintar($('#enlaces', el), html`
      ${d.planillaUrl ? html`<a class="btn btn-sec" href="${d.planillaUrl}" target="_blank" rel="noopener">${icono('hoja')} Abrir planilla de datos</a>` : ''}
      ${d.driveUrl ? html`<a class="btn btn-sec" href="${d.driveUrl}" target="_blank" rel="noopener">${icono('carpeta')} Abrir carpeta de archivos</a>` : ''}`);
  }
}

// ---------------------------------------------------------------------------
export async function vistaUsuarios(el) {
  if (!guardia(el)) return;
  const d = await cargar(el, true);
  if (!d) return;
  const pintarLista = () => {
    const usuarios = d.usuarios.slice().sort((a, b) => (b.activo - a.activo) || a.email.localeCompare(b.email));
    pintar(el, html`
      <section class="pagina">
        ${cabecera('Usuarios y accesos', 'Solo pueden entrar las cuentas de Google que estén en esta lista y activas.')}
        <ul class="lista-admin">${usuarios.map((u) => html`
          <li class="${u.activo ? '' : 'inactivo'}"><button data-email="${u.email}">
            <span class="avatar" style="--h:${[...u.email].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0)}">${(u.nombre || u.email).charAt(0).toUpperCase()}</span>
            <div><strong>${u.nombre || u.email}</strong><span>${u.email}</span>
              <span class="etiquetas"><span class="chip chip-neutro">${u.rol}</span>
              <span class="chip chip-neutro">${!u.vehiculos || u.vehiculos === '*' ? 'Todos los vehículos' : u.vehiculos.split(',').length + ' vehículo(s)'}</span>
              ${u.activo ? '' : html`<span class="chip chip-alerta">Inactivo</span>`}</span></div>
            ${icono('editar')}
          </button>
          ${u.activo && u.email !== (estado.usuario || {}).email ? html`<button class="btn-vercomo" data-vercomo="${u.email}" title="Ver la app como ${u.nombre || u.email}">${icono('ojo')}<span>Ver como</span></button>` : ''}
          </li>`)}</ul>
        <a class="fab" href="javascript:void 0" id="nuevo">${icono('mas')}<span>Usuario</span></a>
      </section>`);
    $$('[data-email]', el).forEach((b) => { b.onclick = () => editar(d.usuarios.find((u) => u.email === b.dataset.email)); });
    $$('[data-vercomo]', el).forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        await entrarVerComo(d.usuarios.find((u) => u.email === b.dataset.vercomo));
        b.disabled = false;
      };
    });
    $('#nuevo', el).onclick = (e) => { e.preventDefault(); editar(null); };
  };

  const editar = async (u) => {
    const vehiculos = (await db.all('vehiculos')).sort((a, b) => String(a.patente).localeCompare(String(b.patente)));
    const asignadas = u && u.vehiculos && u.vehiculos !== '*' ? u.vehiculos.split(/[,;]+/).map((s) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')) : [];
    const todos = !u || !u.vehiculos || u.vehiculos === '*';
    modal({
      titulo: u ? 'Editar usuario' : 'Nuevo usuario',
      contenido: html`<form class="formulario" id="fu" novalidate>
        <div class="campo"><label for="ue">Correo Gmail<span class="req">*</span></label><input id="ue" name="email" type="email" inputmode="email" autocomplete="off" value="${u ? u.email : ''}" placeholder="nombre@gmail.com"></div>
        <div class="campo"><label for="un">Nombre</label><input id="un" name="nombre" value="${u ? u.nombre : ''}"></div>
        <div class="campo"><label for="ur">Rol<span class="req">*</span></label><select id="ur" name="rol">
          ${d.roles.map((r) => html`<option ${u && u.rol === r.rol ? html`selected` : ''}>${r.rol}</option>`)}</select>
          <small class="ayuda" id="rolDesc"></small></div>
        <div class="campo"><label>Vehículos que puede ver</label>
          <div class="segmentado"><label><input type="radio" name="alcance" value="todos" ${todos ? html`checked` : ''}><span>Todos</span></label>
          <label><input type="radio" name="alcance" value="algunos" ${todos ? '' : html`checked`}><span>Solo algunos</span></label></div>
          <div class="chips-opciones lista-patentes" id="patentes" ${todos ? html`hidden` : ''}>
            ${vehiculos.length ? vehiculos.map((v) => {
              const p = String(v.patente || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
              return html`<label class="chip-check"><input type="checkbox" value="${v.patente}" ${asignadas.includes(p) ? html`checked` : ''}><span>${formatoPatente(v.patente)}</span></label>`;
            }) : html`<small class="ayuda">No hay vehículos cargados.</small>`}
          </div></div>
        <label class="toggle"><input type="checkbox" name="activo" ${!u || u.activo ? html`checked` : ''}><span>Acceso activo</span></label>
      </form>`,
      acciones: [
        ...(u && u.email !== (estado.usuario || {}).email ? [{ texto: 'Eliminar', clase: 'btn-peligro-sec', onClick: async (m) => {
          if (!await confirmar(`¿Eliminar a ${u.email}? Perderá el acceso de inmediato. (Si solo quieres suspenderlo, desactívalo.)`, { peligro: true, si: 'Eliminar' })) return false;
          const r = await ejecutar('eliminarUsuario', { email: u.email }, 'Usuario eliminado');
          if (!r) return false;
          d.usuarios = d.usuarios.filter((x) => x.email !== u.email);
          pintarLista();
        } }] : []),
        { texto: 'Cancelar', clase: 'btn-sec' },
        { texto: 'Guardar', clase: 'btn-pri', onClick: async (m) => {
          const f = $('#fu', m);
          const alcance = f.querySelector('[name=alcance]:checked').value;
          const pats = $$('#patentes input:checked', m).map((i) => i.value);
          if (alcance === 'algunos' && !pats.length) { aviso('Elige al menos un vehículo o marca "Todos"', { tipo: 'error' }); return false; }
          const usuario = { email: f.email.value.trim().toLowerCase(), nombre: f.nombre.value.trim(), rol: f.rol.value, vehiculos: alcance === 'todos' ? '*' : pats.join(', '), activo: f.activo.checked };
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(usuario.email)) { aviso('Correo inválido', { tipo: 'error' }); return false; }
          const r = await ejecutar('guardarUsuario', { usuario, emailOriginal: u ? u.email : usuario.email, nuevo: !u }, 'Usuario guardado');
          if (!r) return false;
          d.usuarios = d.usuarios.filter((x) => x.email !== (u ? u.email : usuario.email)).concat([r.usuario]);
          pintarLista();
          if (u && u.email === (estado.usuario || {}).email) sincronizar({ completo: true });
        } },
      ],
    }).el.querySelectorAll('[name=alcance]').forEach((r, _, todosR) => {
      r.onchange = () => { document.getElementById('patentes').hidden = r.value === 'todos' && r.checked; };
    });
    const sel = document.getElementById('ur');
    const desc = () => { const r = d.roles.find((x) => x.rol === sel.value); document.getElementById('rolDesc').textContent = r ? r.descripcion : ''; };
    sel.onchange = desc; desc();
  };
  pintarLista();
}

// ---------------------------------------------------------------------------
export async function vistaRoles(el) {
  if (!guardia(el)) return;
  const d = await cargar(el, true);
  if (!d) return;
  const pintarLista = () => {
    pintar(el, html`
      <section class="pagina">
        ${cabecera('Roles y permisos', 'Cada usuario tiene un rol. Puedes crear roles nuevos a la medida.')}
        <div class="roles">${d.roles.map((r) => {
          const n = d.usuarios.filter((u) => u.rol === r.rol).length;
          return html`<form class="rol panel" data-rol="${r.rol}">
            <div class="rol-cab"><input name="rol" value="${r.rol}" aria-label="Nombre del rol" class="input-titulo">
              <span class="chip chip-neutro">${n} usuario${n === 1 ? '' : 's'}</span></div>
            <input name="descripcion" value="${r.descripcion}" placeholder="Descripción" class="input-desc" aria-label="Descripción">
            <div class="permisos">${d.permisosDef.map((p) => html`
              <label class="toggle"><input type="checkbox" name="${p.clave}" ${r[p.clave] ? html`checked` : ''}><span>${p.etiqueta}</span></label>`)}</div>
            <div class="rol-acciones">
              ${n ? '' : html`<button type="button" class="btn btn-peligro-sec btn-chico" data-borrar>Eliminar</button>`}
              <button type="submit" class="btn btn-pri btn-chico">Guardar</button>
            </div>
          </form>`;
        })}</div>
        <a class="fab" href="javascript:void 0" id="nuevo">${icono('mas')}<span>Rol</span></a>
      </section>`);
    $$('form[data-rol]', el).forEach((f) => {
      f.onsubmit = async (e) => {
        e.preventDefault();
        const rol = { rol: f.rol.value.trim(), descripcion: f.descripcion.value.trim() };
        d.permisosDef.forEach((p) => { rol[p.clave] = f[p.clave].checked; });
        const original = f.dataset.rol;
        const r = await ejecutar('guardarRol', { rol, rolOriginal: original || rol.rol, nuevo: !original }, 'Rol guardado');
        if (!r) return;
        d.roles = d.roles.map((x) => (x.rol === original ? r.rol : x));
        d.usuarios.forEach((u) => { if (u.rol === original) u.rol = r.rol.rol; });
        pintarLista();
        if ((estado.usuario || {}).rol === original) sincronizar({ completo: true });
      };
      const b = f.querySelector('[data-borrar]');
      if (b) b.onclick = async () => {
        if (!f.dataset.rol) { d.roles = d.roles.filter((x) => x.rol); pintarLista(); return; }
        if (!await confirmar(`¿Eliminar el rol "${f.dataset.rol}"?`, { peligro: true, si: 'Eliminar' })) return;
        if (await ejecutar('eliminarRol', { rol: f.dataset.rol }, 'Rol eliminado')) { d.roles = d.roles.filter((x) => x.rol !== f.dataset.rol); pintarLista(); }
      };
    });
    $('#nuevo', el).onclick = (e) => {
      e.preventDefault();
      if (d.roles.some((r) => !r.rol)) return;
      d.roles.push({ rol: '', descripcion: '' });
      pintarLista();
      const ultimo = $$('form[data-rol]', el).pop();
      ultimo.scrollIntoView({ behavior: 'smooth' });
      ultimo.rol.focus();
    };
  };
  pintarLista();
}

// ---------------------------------------------------------------------------
export async function vistaCampos(el, [entidad]) {
  if (!guardia(el)) return;
  const d = await cargar(el, true);
  if (!d) return;
  const nombre = entidad === 'vehiculo' ? 'Campos de los vehículos' : 'Campos de los registros';
  const pintarLista = () => {
    const campos = d.campos.filter((c) => c.entidad === entidad).sort((a, b) => a.orden - b.orden);
    pintar(el, html`
      <section class="pagina">
        ${cabecera(nombre, 'Define qué datos se piden en el formulario y en qué orden. Desactivar un campo lo oculta, pero conserva la información ya registrada.')}
        <ul class="lista-campos">${campos.map((c, i) => html`
          <li class="${c.activo ? '' : 'inactivo'}">
            <div class="orden">
              <button class="btn-icono" data-subir="${c.clave}" ${i === 0 ? html`disabled` : ''} aria-label="Subir">${icono('arriba')}</button>
              <button class="btn-icono" data-bajar="${c.clave}" ${i === campos.length - 1 ? html`disabled` : ''} aria-label="Bajar">${icono('abajo')}</button>
            </div>
            <button class="campo-item" data-clave="${c.clave}">
              <strong>${c.etiqueta}</strong>
              <span class="etiquetas"><span class="chip chip-neutro">${TIPOS[c.tipo] || c.tipo}</span>
                ${c.requerido ? html`<span class="chip chip-medio">Obligatorio</span>` : ''}
                ${c.alerta ? html`<span class="chip chip-alerta">Alerta de vencimiento</span>` : ''}
                ${c.sistema ? html`<span class="chip chip-neutro">${icono('candado', 'ico-xs')} Base</span>` : ''}
                ${c.activo ? '' : html`<span class="chip chip-pend">Desactivado</span>`}</span>
            </button>
          </li>`)}</ul>
        <a class="fab" href="javascript:void 0" id="nuevo">${icono('mas')}<span>Campo</span></a>
      </section>`);
    $$('[data-clave]', el).forEach((b) => { b.onclick = () => editar(campos.find((c) => c.clave === b.dataset.clave)); });
    $('#nuevo', el).onclick = (e) => { e.preventDefault(); editar(null); };
    const mover = async (clave, delta) => {
      const orden = campos.map((c) => c.clave);
      const i = orden.indexOf(clave);
      orden.splice(i, 1);
      orden.splice(i + delta, 0, clave);
      orden.forEach((k, j) => { d.campos.find((c) => c.entidad === entidad && c.clave === k).orden = (j + 1) * 10; });
      pintarLista();
      if (await ejecutar('ordenarCampos', { entidad, claves: orden })) sincronizar();
    };
    $$('[data-subir]', el).forEach((b) => { b.onclick = () => mover(b.dataset.subir, -1); });
    $$('[data-bajar]', el).forEach((b) => { b.onclick = () => mover(b.dataset.bajar, 1); });
  };

  const editar = (c) => {
    const sis = c && c.sistema;
    const m = modal({
      titulo: c ? 'Editar campo' : 'Nuevo campo',
      contenido: html`<form class="formulario" id="fc" novalidate>
        <div class="campo"><label for="ce">Nombre del campo<span class="req">*</span></label><input id="ce" name="etiqueta" value="${c ? c.etiqueta : ''}" placeholder="Ej: Nivel de combustible"></div>
        <div class="campo"><label for="ct">Tipo</label><select id="ct" name="tipo" ${sis ? html`disabled` : ''}>
          ${Object.entries(TIPOS).map(([k, t]) => html`<option value="${k}" ${c && c.tipo === k ? html`selected` : ''}>${t}</option>`)}</select>
          ${sis ? html`<small class="ayuda">Campo base del sistema: se puede renombrar y cambiar sus opciones, pero no su tipo.</small>` : ''}</div>
        <div class="campo" id="bloqueOpc"><label for="co">Opciones (separadas por coma)</label><textarea id="co" name="opciones" rows="3" placeholder="Opción 1, Opción 2, Opción 3">${c ? c.opciones : ''}</textarea></div>
        <div class="campo"><label for="cd">Valor por defecto</label><input id="cd" name="por_defecto" value="${c ? c.por_defecto : ''}" placeholder="Opcional. En fechas puedes escribir: hoy"></div>
        <div class="campo"><label for="ca">Texto de ayuda</label><input id="ca" name="ayuda" value="${c ? c.ayuda : ''}" placeholder="Opcional"></div>
        <label class="toggle"><input type="checkbox" name="requerido" ${c && c.requerido ? html`checked` : ''} ${sis ? html`disabled` : ''}><span>Obligatorio</span></label>
        <label class="toggle" id="bloqueAlerta"><input type="checkbox" name="alerta" ${c && c.alerta ? html`checked` : ''}><span>Alertar cuando la fecha esté próxima o vencida</span></label>
        <label class="toggle"><input type="checkbox" name="activo" ${!c || c.activo ? html`checked` : ''} ${sis ? html`disabled` : ''}><span>Activo (visible en formularios)</span></label>
        ${c ? html`<p class="ayuda">Columna en la planilla: <code>${c.clave}</code></p>` : ''}
      </form>`,
      acciones: [
        { texto: 'Cancelar', clase: 'btn-sec' },
        { texto: 'Guardar', clase: 'btn-pri', onClick: async (mm) => {
          const f = $('#fc', mm);
          const campo = {
            entidad, clave: c ? c.clave : '', etiqueta: f.etiqueta.value.trim(), tipo: f.tipo.value, opciones: f.opciones.value.trim(),
            por_defecto: f.por_defecto.value.trim(), ayuda: f.ayuda.value.trim(), requerido: f.requerido.checked, alerta: f.alerta.checked, activo: f.activo.checked,
          };
          if (!campo.etiqueta) { aviso('Escribe un nombre', { tipo: 'error' }); return false; }
          const r = await ejecutar('guardarCampo', { campo }, 'Campo guardado');
          if (!r) return false;
          d.campos = d.campos.filter((x) => !(x.entidad === entidad && x.clave === r.campo.clave)).concat([r.campo]);
          pintarLista();
          sincronizar();
        } },
      ],
    });
    const tipo = $('#ct', m.el);
    const ajustar = () => {
      $('#bloqueOpc', m.el).hidden = !['seleccion', 'multiple'].includes(tipo.value);
      $('#bloqueAlerta', m.el).hidden = tipo.value !== 'fecha';
    };
    tipo.onchange = ajustar;
    ajustar();
  };
  pintarLista();
}

// ---------------------------------------------------------------------------
export async function vistaConfig(el) {
  if (!guardia(el)) return;
  const d = await cargar(el, true);
  if (!d) return;
  const val = (k, def = '') => { const r = d.config.find((x) => x.clave === k); return r ? r.valor : def; };
  pintar(el, html`
    <section class="pagina pagina-form">
      ${cabecera('Configuración')}
      <form class="formulario" id="fcfg" novalidate>
        <div class="campo"><label for="k1">Nombre de la empresa</label><input id="k1" name="nombre_empresa" value="${val('nombre_empresa')}"></div>
        <div class="campo"><label for="k2">Días de anticipación para alertas de vencimiento</label><input id="k2" name="dias_alerta" type="number" min="1" value="${val('dias_alerta', 30)}"></div>
        <div class="campo"><label for="k3">Estados que se consideran cerrados</label><input id="k3" name="estados_cerrados" value="${val('estados_cerrados', 'Resuelto, Cerrado')}">
          <small class="ayuda">Los registros con otros estados cuentan como "abiertos".</small></div>
        <div class="campo"><label for="k4">Acceso a los archivos en Drive</label><select id="k4" name="compartir_archivos">
          <option value="enlace" ${val('compartir_archivos') !== 'privado' ? html`selected` : ''}>Por enlace (más simple: se abren en cualquier teléfono)</option>
          <option value="privado" ${val('compartir_archivos') === 'privado' ? html`selected` : ''}>Privado (solo usuarios de la app con su cuenta Google)</option></select>
          <small class="ayuda">Dentro de la app las fotos siempre respetan los permisos. Esto define quién puede abrir el archivo original en Drive.</small></div>
        <div class="campo"><label for="k5">Tamaño máximo por archivo (MB)</label><input id="k5" name="tamano_max_mb" type="number" min="1" max="2000" value="${val('tamano_max_mb', 300)}"></div>
        <label class="toggle"><input type="checkbox" name="comprimir_fotos" ${val('comprimir_fotos', 'si') !== 'no' ? html`checked` : ''}><span>Reducir fotos antes de subir (ahorra datos móviles)</span></label>
        <div class="form-acciones"><button class="btn btn-pri btn-bloque" type="submit">${icono('ok')} Guardar configuración</button></div>
      </form>
    </section>`);
  $('#fcfg', el).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const config = {
      nombre_empresa: f.nombre_empresa.value.trim(), dias_alerta: Number(f.dias_alerta.value) || 30,
      estados_cerrados: f.estados_cerrados.value.trim(), compartir_archivos: f.compartir_archivos.value,
      tamano_max_mb: Number(f.tamano_max_mb.value) || 300, comprimir_fotos: f.comprimir_fotos.checked ? 'si' : 'no',
    };
    const r = await ejecutar('guardarConfig', { config }, 'Configuración guardada');
    if (r) {
      if (r.detalle) aviso(r.detalle, { duracion: 6000 });
      d.config = Object.entries(config).map(([clave, valor]) => ({ clave, valor }));
      sincronizar();
    }
  };
}

export const _esc = esc;
