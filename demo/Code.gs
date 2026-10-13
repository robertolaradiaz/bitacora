/**
 * ============================================================================
 *  BITÁCORA DE VEHÍCULOS — Backend (Google Apps Script)
 * ============================================================================
 *  Datos:    esta Google Sheet (una pestaña por tabla, se crean con setup()).
 *  Archivos: una carpeta de Google Drive (una subcarpeta por patente).
 *  Acceso:   login con cuenta Google (Gmail). Solo entran los correos que
 *            estén en la pestaña "Usuarios" y activos. Lo que cada uno puede
 *            ver o hacer depende de su rol (pestaña "Roles") y de la lista
 *            de patentes asignadas (columna "vehiculos", vacío o * = todos).
 *
 *  Instalación (resumen, ver GUIA_INSTALACION.md):
 *   1. Pega tu Client ID de Google en CONFIG.GOOGLE_CLIENT_ID.
 *   2. Ejecuta la función setup() una vez (te pedirá permisos).
 *   3. Implementar > Nueva implementación > Aplicación web
 *        Ejecutar como: Yo   ·   Quién tiene acceso: Cualquier usuario
 *   4. Copia la URL /exec en app/js/config.js (API_URL).
 * ============================================================================
 */

const CONFIG = {
  // ID de cliente OAuth (tipo "Aplicación web") creado en Google Cloud Console.
  GOOGLE_CLIENT_ID: 'PEGAR_AQUI_TU_CLIENT_ID.apps.googleusercontent.com',
  // Días que dura la sesión en el celular antes de pedir login de nuevo.
  DIAS_SESION: 30,
  VERSION: '1.0.0',
};

const HOJAS = {
  USUARIOS: 'Usuarios',
  ROLES: 'Roles',
  CAMPOS: 'Campos',
  VEHICULOS: 'Vehiculos',
  EVENTOS: 'Eventos',
  CONFIG: 'Config',
  LOG: 'Log',
};

const PERMISOS = [
  ['ver_vehiculos', 'Ver vehículos y su ficha'],
  ['editar_vehiculos', 'Crear, editar y dar de baja vehículos'],
  ['ver_eventos', 'Ver todos los registros (no solo los propios)'],
  ['crear_eventos', 'Crear registros (mantenciones, problemas, hallazgos…)'],
  ['editar_eventos_propios', 'Editar los registros que creó'],
  ['editar_eventos', 'Editar cualquier registro'],
  ['eliminar_eventos', 'Eliminar registros'],
  ['subir_archivos', 'Adjuntar fotos, videos y audios'],
  ['administrar', 'Administrar usuarios, roles, campos y configuración'],
];

const TIPOS_CAMPO = ['texto', 'texto_largo', 'numero', 'fecha', 'seleccion', 'multiple', 'si_no'];

const COLUMNAS = {
  Usuarios: ['email', 'nombre', 'rol', 'vehiculos', 'activo', 'creado_en', 'actualizado_en'],
  Roles: ['rol', 'descripcion'].concat(PERMISOS.map(function (p) { return p[0]; })),
  Campos: ['entidad', 'clave', 'etiqueta', 'tipo', 'opciones', 'requerido', 'por_defecto', 'orden', 'activo', 'sistema', 'alerta', 'ayuda'],
  Vehiculos: ['id', 'creado_por', 'creado_en', 'actualizado_por', 'actualizado_en', 'eliminado'],
  Eventos: ['id', 'vehiculo_id', 'adjuntos', 'creado_por', 'creado_en', 'actualizado_por', 'actualizado_en', 'eliminado'],
  Config: ['clave', 'valor', 'descripcion'],
  Log: ['fecha', 'email', 'accion', 'entidad', 'id', 'detalle'],
};

// Columnas internas que no pueden usarse como clave de un campo.
const RESERVADAS = ['id', 'vehiculo_id', 'adjuntos', 'creado_por', 'creado_en', 'actualizado_por', 'actualizado_en', 'eliminado'];

// ---------------------------------------------------------------------------
//  Valores iniciales (se pueden cambiar después desde la app, como admin)
// ---------------------------------------------------------------------------

function camposIniciales_() {
  // [entidad, clave, etiqueta, tipo, opciones, requerido, por_defecto, sistema, alerta, ayuda]
  const c = [
    ['vehiculo', 'patente', 'Patente', 'texto', '', true, '', true, false, 'Ej: ABCD12'],
    ['vehiculo', 'tipo_vehiculo', 'Tipo de vehículo', 'seleccion', 'Camioneta, Automóvil, Camión, Furgón, Bus, Motocicleta, Maquinaria, Otro', false, '', false, false, ''],
    ['vehiculo', 'marca', 'Marca', 'texto', '', false, '', false, false, ''],
    ['vehiculo', 'modelo', 'Modelo', 'texto', '', false, '', false, false, ''],
    ['vehiculo', 'anio', 'Año', 'numero', '', false, '', false, false, ''],
    ['vehiculo', 'color', 'Color', 'texto', '', false, '', false, false, ''],
    ['vehiculo', 'vin', 'N° de chasis (VIN)', 'texto', '', false, '', false, false, ''],
    ['vehiculo', 'n_motor', 'N° de motor', 'texto', '', false, '', false, false, ''],
    ['vehiculo', 'kilometraje', 'Kilometraje actual', 'numero', '', false, '', false, false, ''],
    ['vehiculo', 'responsable', 'Responsable / conductor asignado', 'texto', '', false, '', false, false, ''],
    ['vehiculo', 'venc_revision_tecnica', 'Vencimiento revisión técnica', 'fecha', '', false, '', false, true, ''],
    ['vehiculo', 'venc_permiso_circulacion', 'Vencimiento permiso de circulación', 'fecha', '', false, '', false, true, ''],
    ['vehiculo', 'venc_soap', 'Vencimiento SOAP', 'fecha', '', false, '', false, true, ''],
    ['vehiculo', 'venc_seguro', 'Vencimiento seguro', 'fecha', '', false, '', false, true, ''],
    ['vehiculo', 'observaciones', 'Observaciones', 'texto_largo', '', false, '', false, false, ''],

    ['evento', 'tipo', 'Tipo de registro', 'seleccion', 'Mantención preventiva, Mantención correctiva, Problema / falla, Hallazgo / inspección, Accidente / siniestro, Revisión técnica, Documentación, Otro', true, '', true, false, ''],
    ['evento', 'fecha', 'Fecha', 'fecha', '', true, 'hoy', true, false, ''],
    ['evento', 'titulo', 'Título', 'texto', '', true, '', false, false, 'Resumen corto, ej: "Cambio de aceite y filtros"'],
    ['evento', 'descripcion', 'Descripción', 'texto_largo', '', false, '', false, false, 'Qué se hizo, qué se encontró, qué falta'],
    ['evento', 'estado', 'Estado', 'seleccion', 'Abierto, En proceso, Resuelto', true, 'Abierto', false, false, ''],
    ['evento', 'prioridad', 'Prioridad', 'seleccion', 'Baja, Media, Alta, Crítica', false, 'Media', false, false, ''],
    ['evento', 'kilometraje', 'Kilometraje', 'numero', '', false, '', false, false, ''],
    ['evento', 'ubicacion', 'Ubicación', 'texto', '', false, '', false, false, ''],
    ['evento', 'responsable', 'Responsable', 'texto', '', false, '', false, false, ''],
    ['evento', 'taller', 'Taller / proveedor', 'texto', '', false, '', false, false, ''],
    ['evento', 'costo', 'Costo ($)', 'numero', '', false, '', false, false, ''],
    ['evento', 'n_documento', 'N° factura / OT', 'texto', '', false, '', false, false, ''],
    ['evento', 'proxima_fecha', 'Próxima mantención (fecha)', 'fecha', '', false, '', false, true, 'Se mostrará como alerta en el vehículo'],
    ['evento', 'proximo_km', 'Próxima mantención (km)', 'numero', '', false, '', false, false, ''],
  ];
  return c.map(function (r, i) {
    return { entidad: r[0], clave: r[1], etiqueta: r[2], tipo: r[3], opciones: r[4], requerido: r[5], por_defecto: r[6], orden: (i + 1) * 10, activo: true, sistema: r[7], alerta: r[8], ayuda: r[9] };
  });
}

function rolesIniciales_() {
  const todos = {};
  PERMISOS.forEach(function (p) { todos[p[0]] = true; });
  const sup = Object.assign({}, todos, { administrar: false });
  const ninguno = {};
  PERMISOS.forEach(function (p) { ninguno[p[0]] = false; });
  return [
    Object.assign({ rol: 'Administrador', descripcion: 'Acceso total, incluida la administración' }, todos),
    Object.assign({ rol: 'Supervisor', descripcion: 'Gestiona vehículos y todos los registros' }, sup),
    Object.assign({ rol: 'Conductor', descripcion: 'Ve sus vehículos y reporta registros con fotos/videos/audios' }, ninguno,
      { ver_vehiculos: true, ver_eventos: true, crear_eventos: true, editar_eventos_propios: true, subir_archivos: true }),
    Object.assign({ rol: 'Lector', descripcion: 'Solo consulta' }, ninguno, { ver_vehiculos: true, ver_eventos: true }),
  ];
}

function configInicial_() {
  return [
    ['nombre_empresa', 'Mi Empresa', 'Nombre que aparece en la app'],
    ['dias_alerta', 30, 'Días de anticipación para alertar vencimientos'],
    ['estados_cerrados', 'Resuelto, Cerrado', 'Valores de "Estado" que se consideran cerrados'],
    ['compartir_archivos', 'enlace', '"enlace": cualquiera con el enlace puede ver el archivo · "privado": solo usuarios de la app con su cuenta Google'],
    ['tamano_max_mb', 300, 'Tamaño máximo por archivo (MB)'],
    ['comprimir_fotos', 'si', '"si": reduce las fotos a 2048 px antes de subir (ahorra datos móviles)'],
  ];
}

// ---------------------------------------------------------------------------
//  SETUP — ejecutar una vez desde el editor
// ---------------------------------------------------------------------------

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Abre este script desde la Google Sheet: Extensiones > Apps Script.');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', ss.getId());
  if (!props.getProperty('SESSION_SECRET')) {
    props.setProperty('SESSION_SECRET', Utilities.getUuid() + Utilities.getUuid());
  }

  Object.keys(COLUMNAS).forEach(function (nombre) {
    let sh = ss.getSheetByName(nombre);
    if (!sh) sh = ss.insertSheet(nombre);
    const lastCol = sh.getLastColumn();
    const actuales = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
    const faltan = COLUMNAS[nombre].filter(function (c) { return actuales.indexOf(c) < 0; });
    if (faltan.length) {
      asegurarColumnas_(sh, actuales.length + faltan.length);
      sh.getRange(1, actuales.length + 1, 1, faltan.length).setValues([faltan]);
    }
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#1f2a37').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  });
  // Eliminar la hoja vacía por defecto si existe
  ['Hoja 1', 'Sheet1', 'Hoja1'].forEach(function (n) {
    const h = ss.getSheetByName(n);
    if (h && ss.getSheets().length > 1 && h.getLastRow() === 0) ss.deleteSheet(h);
  });

  // Datos iniciales
  const tRoles = leer_(HOJAS.ROLES);
  if (!tRoles.rows.length) rolesIniciales_().forEach(function (r) { escribir_(tRoles, r); });
  const tCampos = leer_(HOJAS.CAMPOS);
  if (!tCampos.rows.length) camposIniciales_().forEach(function (c) { escribir_(tCampos, c); });
  const tConfig = leer_(HOJAS.CONFIG);
  configInicial_().forEach(function (c) {
    if (!tConfig.rows.some(function (r) { return r.clave === c[0]; })) escribir_(tConfig, { clave: c[0], valor: c[1], descripcion: c[2] });
  });

  // Primer administrador = dueño del script
  const yo = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const tUsr = leer_(HOJAS.USUARIOS);
  if (yo && !tUsr.rows.some(function (u) { return normEmail_(u.email) === yo; })) {
    const ahora = ahora_();
    escribir_(tUsr, { email: yo, nombre: 'Administrador', rol: 'Administrador', vehiculos: '*', activo: true, creado_en: ahora, actualizado_en: ahora });
  }

  // Carpeta de Drive
  let folderId = props.getProperty('DRIVE_FOLDER_ID');
  let carpeta = null;
  if (folderId) { try { carpeta = DriveApp.getFolderById(folderId); } catch (e) { carpeta = null; } }
  if (!carpeta) {
    carpeta = DriveApp.createFolder('Bitácora Vehículos - Archivos');
    props.setProperty('DRIVE_FOLDER_ID', carpeta.getId());
  }
  limpiarCache_();

  const msg = [
    'Configuración lista.',
    'Planilla: ' + ss.getUrl(),
    'Carpeta de archivos en Drive: ' + carpeta.getUrl(),
    'Administrador inicial: ' + (yo || '(no se pudo detectar, agrégalo a mano en la pestaña Usuarios)'),
    CONFIG.GOOGLE_CLIENT_ID.indexOf('PEGAR_AQUI') === 0 ? '⚠ Falta pegar GOOGLE_CLIENT_ID en CONFIG.' : 'Client ID configurado.',
    'Siguiente paso: Implementar > Nueva implementación > Aplicación web.',
  ].join('\n');
  Logger.log(msg);
  return msg;
}

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Bitácora')
      .addItem('Configurar / reparar (setup)', 'setup')
      .addItem('Sincronizar permisos de la carpeta Drive', 'sincronizarPermisosDrive')
      .addToUi();
  } catch (e) { /* sin UI */ }
}

// ---------------------------------------------------------------------------
//  ENTRADA HTTP
// ---------------------------------------------------------------------------

function doGet() {
  return json_({ ok: true, app: 'Bitácora de Vehículos', version: CONFIG.VERSION });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, codigo: 'SOLICITUD', error: 'Solicitud inválida' });
  }
  return json_(manejar_(req));
}

function manejar_(req) {
  try {
    const accion = String(req.accion || '');
    if (accion === 'ping') return { ok: true, version: CONFIG.VERSION, hora: ahora_() };
    if (accion === 'login') return accionLogin_(req);

    const email = validarSesion_(req.token);
    const ctx = contexto_(email);
    const acciones = {
      sync: accionSync_,
      subidaIniciar: accionSubidaIniciar_,
      subidaParte: accionSubidaParte_,
      subidaEstado: accionSubidaEstado_,
      subidaConfirmar: accionSubidaConfirmar_,
      miniatura: accionMiniatura_,
      archivo: accionArchivo_,
      adminDatos: accionAdminDatos_,
      guardarUsuario: accionGuardarUsuario_,
      eliminarUsuario: accionEliminarUsuario_,
      guardarRol: accionGuardarRol_,
      eliminarRol: accionEliminarRol_,
      guardarCampo: accionGuardarCampo_,
      ordenarCampos: accionOrdenarCampos_,
      guardarConfig: accionGuardarConfig_,
      sincronizarDrive: function (c) { soloAdmin_(c); return { ok: true, detalle: sincronizarPermisosDrive_() }; },
    };
    if (!acciones[accion]) throw error_('SOLICITUD', 'Acción desconocida: ' + accion);
    const r = acciones[accion](ctx, req);
    r.ok = true;
    return r;
  } catch (err) {
    if (!err.codigo) console.error(err && err.stack || err);
    return { ok: false, codigo: err.codigo || 'ERROR', error: err.message || String(err) };
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function error_(codigo, mensaje) {
  const e = new Error(mensaje);
  e.codigo = codigo;
  return e;
}

// ---------------------------------------------------------------------------
//  AUTENTICACIÓN Y SESIÓN
// ---------------------------------------------------------------------------

function accionLogin_(req) {
  const g = verificarGoogle_(String(req.credential || ''));
  const ctx = contexto_(g.email); // lanza NO_AUTORIZADO si no está en la lista
  // Completar nombre si el admin lo dejó vacío
  if (g.nombre) {
    const t = leer_(HOJAS.USUARIOS);
    const u = t.rows.find(function (r) { return normEmail_(r.email) === g.email; });
    if (u && (!u.nombre || u.nombre === 'Administrador')) {
      u.nombre = g.nombre;
      escribir_(t, u);
      limpiarCache_();
    }
  }
  log_(g.email, 'login', '', '', '');
  return { ok: true, token: crearSesion_(g.email), usuario: { email: g.email, nombre: g.nombre || ctx.nombre, foto: g.foto || '' } };
}

function verificarGoogle_(credential) {
  if (!credential) throw error_('AUTH', 'Falta la credencial de Google');
  if (CONFIG.GOOGLE_CLIENT_ID.indexOf('PEGAR_AQUI') === 0) throw error_('CONFIG', 'El backend no tiene configurado GOOGLE_CLIENT_ID');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw error_('AUTH', 'No se pudo verificar la cuenta de Google. Intenta de nuevo.');
  const info = JSON.parse(res.getContentText());
  if (info.aud !== CONFIG.GOOGLE_CLIENT_ID) throw error_('AUTH', 'Credencial emitida para otra aplicación');
  if (['accounts.google.com', 'https://accounts.google.com'].indexOf(info.iss) < 0) throw error_('AUTH', 'Emisor inválido');
  if (String(info.email_verified) !== 'true') throw error_('AUTH', 'El correo de Google no está verificado');
  if (Number(info.exp) * 1000 < Date.now()) throw error_('AUTH', 'La credencial expiró, vuelve a ingresar');
  return { email: normEmail_(info.email), nombre: info.name || '', foto: info.picture || '' };
}

function secreto_() {
  const s = PropertiesService.getScriptProperties().getProperty('SESSION_SECRET');
  if (!s) throw error_('CONFIG', 'Backend no configurado: ejecuta setup()');
  return s;
}

function crearSesion_(email) {
  const payload = JSON.stringify({ e: email, x: Date.now() + CONFIG.DIAS_SESION * 86400000 });
  const p = Utilities.base64EncodeWebSafe(payload, Utilities.Charset.UTF_8).replace(/=+$/, '');
  const firma = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(p, secreto_())).replace(/=+$/, '');
  return p + '.' + firma;
}

function validarSesion_(token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 2) throw error_('AUTH', 'Sesión no válida, ingresa de nuevo');
  const esperada = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(partes[0], secreto_())).replace(/=+$/, '');
  if (!igualSeguro_(esperada, partes[1])) throw error_('AUTH', 'Sesión no válida, ingresa de nuevo');
  let datos;
  try {
    const pad = partes[0] + '==='.slice((partes[0].length + 3) % 4);
    datos = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(pad)).getDataAsString('UTF-8'));
  } catch (e) { throw error_('AUTH', 'Sesión no válida, ingresa de nuevo'); }
  if (!datos.x || datos.x < Date.now()) throw error_('AUTH', 'Tu sesión expiró, ingresa de nuevo');
  return normEmail_(datos.e);
}

function igualSeguro_(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function contexto_(email) {
  const usuarios = leerCache_(HOJAS.USUARIOS);
  const u = usuarios.find(function (r) { return normEmail_(r.email) === email; });
  if (!u || !bool_(u.activo)) throw error_('NO_AUTORIZADO', 'La cuenta ' + email + ' no tiene acceso a la Bitácora. Pide al administrador que te agregue.');
  const rol = leerCache_(HOJAS.ROLES).find(function (r) { return String(r.rol) === String(u.rol); });
  const permisos = {};
  PERMISOS.forEach(function (p) { permisos[p[0]] = rol ? bool_(rol[p[0]]) : false; });
  const lista = String(u.vehiculos || '').trim();
  const patentes = (lista && lista !== '*') ? lista.split(/[,;\n]+/).map(normPatente_).filter(String) : null;
  const ctx = { email: email, nombre: String(u.nombre || email), rol: String(u.rol || ''), permisos: permisos, patentes: patentes };
  ctx.admin = permisos.administrar;
  ctx.hash = hash_(JSON.stringify([ctx.rol, permisos, patentes]));
  return ctx;
}

function soloAdmin_(ctx) {
  if (!ctx.admin) throw error_('PERMISO', 'Solo un administrador puede hacer esto');
}

function puedeVerVehiculo_(ctx, v) {
  if (!v || bool_(v.eliminado)) return false;
  if (ctx.admin) return true;
  const p = ctx.permisos;
  if (!(p.ver_vehiculos || p.crear_eventos || p.editar_vehiculos)) return false;
  return !ctx.patentes || ctx.patentes.indexOf(normPatente_(v.patente)) >= 0;
}

function puedeVerEvento_(ctx, ev, veh) {
  if (!puedeVerVehiculo_(ctx, veh)) return false;
  return ctx.admin || ctx.permisos.ver_eventos || normEmail_(ev.creado_por) === ctx.email;
}

function puedeEditarEvento_(ctx, ev) {
  if (ctx.admin || ctx.permisos.editar_eventos) return true;
  return ctx.permisos.editar_eventos_propios && normEmail_(ev.creado_por) === ctx.email;
}

// ---------------------------------------------------------------------------
//  SINCRONIZACIÓN (envío de cambios offline + descarga de novedades)
// ---------------------------------------------------------------------------

function accionSync_(ctx, req) {
  const inicio = new Date(Date.now() - 5000).toISOString();
  const ops = Array.isArray(req.ops) ? req.ops : [];
  const resultados = [];
  let tV = null, tE = null;

  if (ops.length) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      tV = leer_(HOJAS.VEHICULOS);
      tE = leer_(HOJAS.EVENTOS);
      ops.forEach(function (op) {
        try {
          resultados.push({ opId: op.opId, ok: true, registro: aplicarOp_(ctx, op, tV, tE) });
        } catch (err) {
          if (!err.codigo) console.error(err && err.stack || err);
          resultados.push({ opId: op.opId, ok: false, codigo: err.codigo || 'ERROR', error: err.message || String(err) });
        }
      });
    } finally {
      lock.releaseLock();
    }
  }

  if (!tV) tV = leer_(HOJAS.VEHICULOS);
  if (!tE) tE = leer_(HOJAS.EVENTOS);
  const completo = !req.since || req.permHash !== ctx.hash;
  const since = completo ? '' : String(req.since);

  const vehPorId = {};
  tV.rows.forEach(function (v) { vehPorId[v.id] = v; });

  const vehiculos = [];
  tV.rows.forEach(function (v) {
    const visible = puedeVerVehiculo_(ctx, v);
    if (completo) { if (visible) vehiculos.push(publico_(v)); return; }
    if (String(v.actualizado_en) <= since) return;
    if (visible) vehiculos.push(publico_(v));
    else if (bool_(v.eliminado)) vehiculos.push({ id: v.id, eliminado: true });
  });

  const eventos = [];
  tE.rows.forEach(function (ev) {
    const veh = vehPorId[ev.vehiculo_id];
    const visible = !bool_(ev.eliminado) && puedeVerEvento_(ctx, ev, veh);
    if (completo) { if (visible) eventos.push(publico_(ev)); return; }
    if (String(ev.actualizado_en) <= since) return;
    if (visible) eventos.push(publico_(ev));
    else eventos.push({ id: ev.id, eliminado: true });
  });

  return {
    serverTime: inicio,
    completo: completo,
    permHash: ctx.hash,
    usuario: { email: ctx.email, nombre: ctx.nombre, rol: ctx.rol, patentes: ctx.patentes },
    permisos: ctx.permisos,
    campos: leerCache_(HOJAS.CAMPOS).map(publicoCampo_),
    config: configObj_(),
    vehiculos: vehiculos,
    eventos: eventos,
    resultados: resultados,
  };
}

function aplicarOp_(ctx, op, tV, tE) {
  const ahora = ahora_();
  switch (op.op) {
    case 'vehiculo': return guardarVehiculo_(ctx, op.data || {}, tV, ahora);
    case 'evento': return guardarEvento_(ctx, op.data || {}, tV, tE, ahora);
    case 'eliminarEvento': {
      const ev = buscar_(tE, op.id);
      if (!ev || bool_(ev.eliminado)) return { id: op.id, eliminado: true };
      if (!(ctx.admin || ctx.permisos.eliminar_eventos)) throw error_('PERMISO', 'No tienes permiso para eliminar registros');
      if (!puedeVerVehiculo_(ctx, buscar_(tV, ev.vehiculo_id))) throw error_('PERMISO', 'No tienes acceso a este vehículo');
      ev.eliminado = true; ev.actualizado_por = ctx.email; ev.actualizado_en = ahora;
      escribir_(tE, ev);
      log_(ctx.email, 'eliminar', 'evento', ev.id, ev.titulo || ev.tipo || '');
      return { id: ev.id, eliminado: true };
    }
    case 'eliminarVehiculo': {
      const v = buscar_(tV, op.id);
      if (!v || bool_(v.eliminado)) return { id: op.id, eliminado: true };
      if (!(ctx.admin || ctx.permisos.editar_vehiculos)) throw error_('PERMISO', 'No tienes permiso para dar de baja vehículos');
      if (!puedeVerVehiculo_(ctx, v)) throw error_('PERMISO', 'No tienes acceso a este vehículo');
      v.eliminado = true; v.actualizado_por = ctx.email; v.actualizado_en = ahora;
      escribir_(tV, v);
      log_(ctx.email, 'baja', 'vehiculo', v.id, v.patente);
      return { id: v.id, eliminado: true };
    }
    case 'quitarAdjunto': {
      const ev = buscar_(tE, op.eventoId);
      if (!ev || bool_(ev.eliminado)) throw error_('NO_ENCONTRADO', 'El registro no existe');
      if (!puedeEditarEvento_(ctx, ev)) throw error_('PERMISO', 'No tienes permiso para modificar este registro');
      const lista = parseJson_(ev.adjuntos, []);
      const quitado = lista.filter(function (a) { return a.id === op.adjuntoId; })[0];
      ev.adjuntos = JSON.stringify(lista.filter(function (a) { return a.id !== op.adjuntoId; }));
      ev.actualizado_por = ctx.email; ev.actualizado_en = ahora;
      escribir_(tE, ev);
      if (quitado && quitado.driveId) { try { DriveApp.getFileById(quitado.driveId).setTrashed(true); } catch (e) { /* ya no existe */ } }
      log_(ctx.email, 'quitar_adjunto', 'evento', ev.id, quitado ? quitado.nombre : op.adjuntoId);
      return publico_(ev);
    }
    default:
      throw error_('SOLICITUD', 'Operación desconocida: ' + op.op);
  }
}

function guardarVehiculo_(ctx, data, tV, ahora) {
  if (!(ctx.admin || ctx.permisos.editar_vehiculos)) throw error_('PERMISO', 'No tienes permiso para crear o editar vehículos');
  const id = String(data.id || '').trim() || Utilities.getUuid();
  const existente = buscar_(tV, id);
  if (existente && bool_(existente.eliminado)) throw error_('NO_ENCONTRADO', 'Este vehículo fue dado de baja');
  if (existente && !puedeVerVehiculo_(ctx, existente)) throw error_('PERMISO', 'No tienes acceso a este vehículo');

  const campos = camposDe_('vehiculo');
  const limpio = limpiarDatos_(campos, data);
  if (limpio.patente !== undefined) limpio.patente = String(limpio.patente).toUpperCase().replace(/\s+/g, '').trim();

  const reg = existente ? Object.assign(existente, limpio) : Object.assign({ id: id, creado_por: ctx.email, creado_en: ahora, eliminado: false }, limpio);
  validarRequeridos_(campos, reg);
  const pn = normPatente_(reg.patente);
  const dup = tV.rows.some(function (v) { return v.id !== id && !bool_(v.eliminado) && normPatente_(v.patente) === pn; });
  if (dup) throw error_('VALIDACION', 'Ya existe un vehículo con la patente ' + reg.patente);
  reg.actualizado_por = ctx.email;
  reg.actualizado_en = ahora;
  escribir_(tV, reg);
  log_(ctx.email, existente ? 'editar' : 'crear', 'vehiculo', id, reg.patente);
  return publico_(reg);
}

function guardarEvento_(ctx, data, tV, tE, ahora) {
  const id = String(data.id || '').trim() || Utilities.getUuid();
  const existente = buscar_(tE, id);
  if (existente && bool_(existente.eliminado)) throw error_('NO_ENCONTRADO', 'Este registro fue eliminado');
  const vehiculoId = existente ? existente.vehiculo_id : String(data.vehiculo_id || '');
  const veh = buscar_(tV, vehiculoId);
  if (!veh || bool_(veh.eliminado)) throw error_('NO_ENCONTRADO', 'El vehículo no existe o fue dado de baja');
  if (!puedeVerVehiculo_(ctx, veh)) throw error_('PERMISO', 'No tienes acceso al vehículo ' + veh.patente);
  if (existente) {
    if (!puedeEditarEvento_(ctx, existente)) throw error_('PERMISO', 'No tienes permiso para editar este registro');
  } else if (!(ctx.admin || ctx.permisos.crear_eventos)) {
    throw error_('PERMISO', 'No tienes permiso para crear registros');
  }
  const campos = camposDe_('evento');
  const limpio = limpiarDatos_(campos, data);
  const reg = existente ? Object.assign(existente, limpio) : Object.assign({
    id: id, vehiculo_id: vehiculoId, adjuntos: '[]', creado_por: ctx.email, creado_en: ahora, eliminado: false,
  }, limpio);
  validarRequeridos_(campos, reg);
  reg.actualizado_por = ctx.email;
  reg.actualizado_en = ahora;
  escribir_(tE, reg);
  log_(ctx.email, existente ? 'editar' : 'crear', 'evento', id, veh.patente + ' · ' + (reg.titulo || reg.tipo || ''));
  return publico_(reg);
}

function limpiarDatos_(campos, data) {
  const out = {};
  campos.forEach(function (c) {
    if (!bool_(c.activo)) return;
    if (!Object.prototype.hasOwnProperty.call(data, c.clave)) return;
    let v = data[c.clave];
    if (v === null || v === undefined) v = '';
    switch (c.tipo) {
      case 'numero':
        if (v === '' || v === '-') { v = ''; break; }
        v = Number(String(v).replace(',', '.'));
        if (isNaN(v)) throw error_('VALIDACION', '"' + c.etiqueta + '" debe ser un número');
        break;
      case 'fecha':
        v = String(v).trim();
        if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw error_('VALIDACION', '"' + c.etiqueta + '" debe ser una fecha válida');
        break;
      case 'si_no':
        v = v === '' ? '' : bool_(v);
        break;
      case 'multiple':
        v = Array.isArray(v) ? v.join(', ') : String(v);
        break;
      default:
        v = String(v).trim();
        if (v.length > 45000) v = v.slice(0, 45000);
    }
    out[c.clave] = v;
  });
  return out;
}

function validarRequeridos_(campos, reg) {
  campos.forEach(function (c) {
    if (bool_(c.activo) && bool_(c.requerido)) {
      const v = reg[c.clave];
      if (v === '' || v === null || v === undefined) throw error_('VALIDACION', 'El campo "' + c.etiqueta + '" es obligatorio');
    }
  });
}

// ---------------------------------------------------------------------------
//  ARCHIVOS (fotos, videos, audios) → Google Drive
// ---------------------------------------------------------------------------

function eventoParaSubir_(ctx, eventoId) {
  if (!(ctx.admin || ctx.permisos.subir_archivos)) throw error_('PERMISO', 'No tienes permiso para adjuntar archivos');
  const ev = buscar_(leer_(HOJAS.EVENTOS), eventoId);
  if (!ev || bool_(ev.eliminado)) throw error_('NO_ENCONTRADO', 'El registro no existe (¿se sincronizó?)');
  const veh = buscar_(leer_(HOJAS.VEHICULOS), ev.vehiculo_id);
  if (!puedeVerVehiculo_(ctx, veh)) throw error_('PERMISO', 'No tienes acceso a este vehículo');
  if (!(normEmail_(ev.creado_por) === ctx.email || puedeEditarEvento_(ctx, ev))) throw error_('PERMISO', 'No puedes adjuntar archivos a este registro');
  return { ev: ev, veh: veh };
}

function carpetaRaiz_() {
  const id = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
  if (!id) throw error_('CONFIG', 'Falta la carpeta de Drive: ejecuta setup()');
  return DriveApp.getFolderById(id);
}

function carpetaVehiculo_(veh) {
  const raiz = carpetaRaiz_();
  const nombre = String(veh.patente || veh.id).toUpperCase();
  const it = raiz.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : raiz.createFolder(nombre);
}

function accionSubidaIniciar_(ctx, req) {
  const x = eventoParaSubir_(ctx, req.eventoId);
  const tamano = Number(req.tamano || 0);
  const max = Number(configObj_().tamano_max_mb || 300) * 1024 * 1024;
  if (!tamano) throw error_('VALIDACION', 'Archivo vacío');
  if (tamano > max) throw error_('VALIDACION', 'El archivo supera el máximo permitido (' + Math.round(max / 1048576) + ' MB)');
  const mime = String(req.mime || 'application/octet-stream');
  const fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Santiago', 'yyyy-MM-dd_HHmmss');
  const nombre = (fecha + '_' + String(req.nombre || 'archivo')).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 180);
  const carpeta = carpetaVehiculo_(x.veh);

  const opciones = {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    payload: JSON.stringify({
      name: nombre,
      mimeType: mime,
      parents: [carpeta.getId()],
      description: 'Vehículo ' + x.veh.patente + ' · ' + (x.ev.titulo || x.ev.tipo || '') + ' (' + x.ev.fecha + ') · subido por ' + ctx.email,
      appProperties: { eventoId: String(x.ev.id), adjuntoId: String(req.adjuntoId || '') },
    }),
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'X-Upload-Content-Type': mime,
      'X-Upload-Content-Length': String(tamano),
    },
    muteHttpExceptions: true,
  };
  if (req.origin && /^https?:\/\/[^/]+$/.test(String(req.origin))) opciones.headers.Origin = String(req.origin);
  const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,size';
  let res;
  try { res = UrlFetchApp.fetch(url, opciones); } catch (e) {
    delete opciones.headers.Origin;
    res = UrlFetchApp.fetch(url, opciones);
  }
  const h = res.getAllHeaders ? res.getAllHeaders() : res.getHeaders();
  const location = h.Location || h.location;
  if (res.getResponseCode() !== 200 || !location) throw error_('DRIVE', 'No se pudo iniciar la subida a Drive (' + res.getResponseCode() + ')');
  return { uploadUrl: location, nombre: nombre };
}

function validarUploadUrl_(u) {
  u = String(u || '');
  if (u.indexOf('https://www.googleapis.com/upload/drive/') !== 0) throw error_('SOLICITUD', 'URL de subida inválida');
  return u;
}

function respuestaSubida_(res) {
  const code = res.getResponseCode();
  if (code === 200 || code === 201) {
    const f = JSON.parse(res.getContentText());
    return { estado: 'completo', archivo: { id: f.id, nombre: f.name, mime: f.mimeType, tamano: Number(f.size || 0) } };
  }
  if (code === 308) {
    const h = res.getAllHeaders ? res.getAllHeaders() : res.getHeaders();
    const rango = h.Range || h.range || '';
    const m = /bytes=0-(\d+)/.exec(rango);
    return { estado: 'incompleto', recibido: m ? Number(m[1]) + 1 : 0 };
  }
  if (code === 404 || code === 410) return { estado: 'expirado' };
  throw error_('DRIVE', 'Error de Drive al subir (' + code + ')');
}

// Sube un trozo a través del servidor (respaldo cuando el navegador no puede subir directo a Drive).
function accionSubidaParte_(ctx, req) {
  if (!(ctx.admin || ctx.permisos.subir_archivos)) throw error_('PERMISO', 'No tienes permiso para adjuntar archivos');
  const url = validarUploadUrl_(req.uploadUrl);
  const bytes = Utilities.base64Decode(String(req.base64 || ''));
  const inicio = Number(req.inicio || 0);
  const total = Number(req.total || 0);
  const fin = inicio + bytes.length - 1;
  const res = UrlFetchApp.fetch(url, {
    method: 'put',
    payload: bytes,
    contentType: String(req.mime || 'application/octet-stream'),
    headers: { 'Content-Range': 'bytes ' + inicio + '-' + fin + '/' + total },
    muteHttpExceptions: true,
    followRedirects: false,
  });
  return respuestaSubida_(res);
}

function accionSubidaEstado_(ctx, req) {
  const url = validarUploadUrl_(req.uploadUrl);
  const res = UrlFetchApp.fetch(url, {
    method: 'put',
    headers: { 'Content-Range': 'bytes */' + Number(req.total || 0) },
    muteHttpExceptions: true,
    followRedirects: false,
  });
  return respuestaSubida_(res);
}

function accionSubidaConfirmar_(ctx, req) {
  const x = eventoParaSubir_(ctx, req.eventoId);
  const a = req.adjunto || {};
  if (!a.id || !a.driveId) throw error_('SOLICITUD', 'Faltan datos del adjunto');
  let archivo;
  try { archivo = DriveApp.getFileById(a.driveId); } catch (e) { throw error_('DRIVE', 'El archivo no existe en Drive'); }
  // Verificar que el archivo está dentro de la carpeta de la bitácora
  const raizId = carpetaRaiz_().getId();
  let dentro = false;
  const padres = archivo.getParents();
  while (padres.hasNext()) {
    const p = padres.next();
    if (p.getId() === raizId) { dentro = true; break; }
    const abuelos = p.getParents();
    while (abuelos.hasNext()) if (abuelos.next().getId() === raizId) { dentro = true; break; }
    if (dentro) break;
  }
  if (!dentro) throw error_('PERMISO', 'El archivo no pertenece a la bitácora');
  if (String(configObj_().compartir_archivos || 'enlace') === 'enlace') {
    try { archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* política del dominio */ }
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const tE = leer_(HOJAS.EVENTOS);
    const ev = buscar_(tE, x.ev.id);
    const lista = parseJson_(ev.adjuntos, []);
    if (!lista.some(function (z) { return z.id === a.id; })) {
      lista.push({
        id: String(a.id), driveId: String(a.driveId), nombre: String(a.nombre || archivo.getName()),
        mime: String(a.mime || archivo.getMimeType()), tamano: Number(a.tamano || archivo.getSize()),
        duracion: a.duracion || '', subido_por: ctx.email, subido_en: ahora_(),
        url: 'https://drive.google.com/file/d/' + a.driveId + '/view',
      });
    }
    ev.adjuntos = JSON.stringify(lista);
    ev.actualizado_en = ahora_();
    escribir_(tE, ev);
    log_(ctx.email, 'adjuntar', 'evento', ev.id, a.nombre || '');
    return { registro: publico_(ev) };
  } finally {
    lock.releaseLock();
  }
}

// Busca el adjunto y verifica que el usuario puede ver el registro que lo contiene.
function adjuntoAccesible_(ctx, driveId) {
  driveId = String(driveId || '');
  if (!driveId) throw error_('SOLICITUD', 'Falta el archivo');
  const tE = leer_(HOJAS.EVENTOS);
  const ev = tE.rows.filter(function (r) { return !bool_(r.eliminado) && String(r.adjuntos || '').indexOf(driveId) >= 0; })[0];
  if (!ev) throw error_('NO_ENCONTRADO', 'Archivo no encontrado');
  const veh = buscar_(leer_(HOJAS.VEHICULOS), ev.vehiculo_id);
  if (!puedeVerEvento_(ctx, ev, veh)) throw error_('PERMISO', 'No tienes acceso a este archivo');
  return parseJson_(ev.adjuntos, []).filter(function (a) { return a.driveId === driveId; })[0];
}

function accionMiniatura_(ctx, req) {
  const adj = adjuntoAccesible_(ctx, req.driveId);
  const tam = Math.min(Math.max(Number(req.tam || 400), 100), 1600);
  const meta = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + adj.driveId + '?fields=thumbnailLink,mimeType,size&supportsAllDrives=true', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true,
  });
  if (meta.getResponseCode() === 200) {
    const m = JSON.parse(meta.getContentText());
    if (m.thumbnailLink) {
      const link = m.thumbnailLink.replace(/=s\d+$/, '') + '=s' + tam;
      const img = UrlFetchApp.fetch(link, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
      if (img.getResponseCode() === 200) {
        const blob = img.getBlob();
        return { mime: blob.getContentType() || 'image/jpeg', base64: Utilities.base64Encode(blob.getBytes()) };
      }
    }
  }
  return { mime: '', base64: '' }; // aún sin miniatura (Drive puede tardar en procesar videos)
}

function accionArchivo_(ctx, req) {
  const adj = adjuntoAccesible_(ctx, req.driveId);
  const f = DriveApp.getFileById(adj.driveId);
  if (f.getSize() > 25 * 1024 * 1024) throw error_('VALIDACION', 'Archivo muy grande para abrir en la app; ábrelo en Drive');
  const blob = f.getBlob();
  return { mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
}

// Da acceso de lectura a la carpeta de Drive a los usuarios activos (modo "privado")
// y lo quita a quienes ya no deben tenerlo. No envía correos de notificación.
function sincronizarPermisosDrive() { return sincronizarPermisosDrive_(); }

function sincronizarPermisosDrive_() {
  const modo = String(configObj_().compartir_archivos || 'enlace');
  const carpeta = carpetaRaiz_();
  const token = ScriptApp.getOAuthToken();
  const base = 'https://www.googleapis.com/drive/v3/files/' + carpeta.getId() + '/permissions';
  const roles = leer_(HOJAS.ROLES).rows;
  const permitidos = leer_(HOJAS.USUARIOS).rows.filter(function (u) {
    if (!bool_(u.activo)) return false;
    const r = roles.filter(function (x) { return String(x.rol) === String(u.rol); })[0];
    return r && (bool_(r.ver_eventos) || bool_(r.administrar) || bool_(r.crear_eventos));
  }).map(function (u) { return normEmail_(u.email); });

  const res = UrlFetchApp.fetch(base + '?fields=permissions(id,emailAddress,role,type)&supportsAllDrives=true', { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  const actuales = res.getResponseCode() === 200 ? (JSON.parse(res.getContentText()).permissions || []) : [];
  const conAcceso = actuales.filter(function (p) { return p.type === 'user'; }).map(function (p) { return normEmail_(p.emailAddress); });
  let agregados = 0, quitados = 0;
  if (modo !== 'privado') return 'Modo "enlace": los archivos se comparten por enlace, no se modificaron accesos de la carpeta.';

  permitidos.forEach(function (email) {
    if (conAcceso.indexOf(email) >= 0) return;
    const r = UrlFetchApp.fetch(base + '?sendNotificationEmail=false&supportsAllDrives=true', {
      method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ role: 'reader', type: 'user', emailAddress: email }), muteHttpExceptions: true,
    });
    if (r.getResponseCode() < 300) agregados++;
  });
  // Quitar lectores que ya no son usuarios activos de la app
  actuales.forEach(function (p) {
    if (p.type !== 'user' || p.role !== 'reader') return;
    if (permitidos.indexOf(normEmail_(p.emailAddress)) >= 0) return;
    const r = UrlFetchApp.fetch(base + '/' + p.id + '?supportsAllDrives=true', { method: 'delete', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    if (r.getResponseCode() < 300) quitados++;
  });
  return 'Modo "privado": ' + agregados + ' acceso(s) agregado(s), ' + quitados + ' quitado(s).';
}

// ---------------------------------------------------------------------------
//  ADMINISTRACIÓN
// ---------------------------------------------------------------------------

function accionAdminDatos_(ctx) {
  soloAdmin_(ctx);
  return {
    usuarios: leer_(HOJAS.USUARIOS).rows.map(function (u) {
      return { email: normEmail_(u.email), nombre: u.nombre || '', rol: u.rol || '', vehiculos: String(u.vehiculos || ''), activo: bool_(u.activo) };
    }),
    roles: leer_(HOJAS.ROLES).rows.map(publicoRol_),
    campos: leer_(HOJAS.CAMPOS).rows.map(publicoCampo_),
    config: leer_(HOJAS.CONFIG).rows.map(function (r) { return { clave: r.clave, valor: r.valor, descripcion: r.descripcion || '' }; }),
    permisosDef: PERMISOS.map(function (p) { return { clave: p[0], etiqueta: p[1] }; }),
    tiposCampo: TIPOS_CAMPO,
    driveUrl: (function () { try { return carpetaRaiz_().getUrl(); } catch (e) { return ''; } })(),
    planillaUrl: (function () { try { return ss_().getUrl(); } catch (e) { return ''; } })(),
  };
}

function quedaAdmin_(usuarios, roles) {
  return usuarios.some(function (u) {
    if (!bool_(u.activo)) return false;
    const r = roles.filter(function (x) { return String(x.rol) === String(u.rol); })[0];
    return r && bool_(r.administrar);
  });
}

function conLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); limpiarCache_(); }
}

function accionGuardarUsuario_(ctx, req) {
  soloAdmin_(ctx);
  const d = req.usuario || {};
  const email = normEmail_(d.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw error_('VALIDACION', 'Correo inválido');
  const original = normEmail_(req.emailOriginal || email);
  return conLock_(function () {
    const t = leer_(HOJAS.USUARIOS);
    const roles = leer_(HOJAS.ROLES).rows;
    if (!roles.some(function (r) { return String(r.rol) === String(d.rol); })) throw error_('VALIDACION', 'El rol "' + d.rol + '" no existe');
    if ((req.nuevo || email !== original) && t.rows.some(function (u) { return normEmail_(u.email) === email; })) throw error_('VALIDACION', 'Ese correo ya está registrado');
    let u = t.rows.filter(function (r) { return normEmail_(r.email) === original; })[0];
    const copia = t.rows.map(function (r) { return Object.assign({}, r); });
    const nuevo = { email: email, nombre: String(d.nombre || '').trim(), rol: String(d.rol), vehiculos: String(d.vehiculos || '*').trim() || '*', activo: d.activo !== false, actualizado_en: ahora_() };
    const simulados = copia.filter(function (r) { return normEmail_(r.email) !== original; }).concat([nuevo]);
    if (!quedaAdmin_(simulados, roles)) throw error_('VALIDACION', 'Debe quedar al menos un administrador activo');
    if (u) Object.assign(u, nuevo); else u = Object.assign({ creado_en: ahora_() }, nuevo);
    escribir_(t, u);
    log_(ctx.email, 'guardar_usuario', 'usuario', email, u.rol + (u.activo ? '' : ' (inactivo)'));
    if (String(configObj_().compartir_archivos) === 'privado') { try { sincronizarPermisosDrive_(); } catch (e) { console.error(e); } }
    return { usuario: { email: email, nombre: u.nombre, rol: u.rol, vehiculos: u.vehiculos, activo: bool_(u.activo) } };
  });
}

function accionEliminarUsuario_(ctx, req) {
  soloAdmin_(ctx);
  const email = normEmail_(req.email);
  if (email === ctx.email) throw error_('VALIDACION', 'No puedes eliminar tu propia cuenta');
  return conLock_(function () {
    const t = leer_(HOJAS.USUARIOS);
    const u = t.rows.filter(function (r) { return normEmail_(r.email) === email; })[0];
    if (!u) return {};
    const resto = t.rows.filter(function (r) { return r !== u; });
    if (!quedaAdmin_(resto, leer_(HOJAS.ROLES).rows)) throw error_('VALIDACION', 'Debe quedar al menos un administrador activo');
    t.sh.deleteRow(u._row);
    log_(ctx.email, 'eliminar_usuario', 'usuario', email, '');
    if (String(configObj_().compartir_archivos) === 'privado') { try { sincronizarPermisosDrive_(); } catch (e) { console.error(e); } }
    return {};
  });
}

function accionGuardarRol_(ctx, req) {
  soloAdmin_(ctx);
  const d = req.rol || {};
  const nombre = String(d.rol || '').trim();
  if (!nombre) throw error_('VALIDACION', 'El rol necesita un nombre');
  const original = String(req.rolOriginal || nombre);
  return conLock_(function () {
    const t = leer_(HOJAS.ROLES);
    if ((req.nuevo || nombre !== original) && t.rows.some(function (r) { return String(r.rol) === nombre; })) throw error_('VALIDACION', 'Ya existe un rol con ese nombre');
    let r = t.rows.filter(function (x) { return String(x.rol) === original; })[0];
    const nuevo = { rol: nombre, descripcion: String(d.descripcion || '') };
    PERMISOS.forEach(function (p) { nuevo[p[0]] = bool_(d[p[0]]); });
    const simRoles = t.rows.filter(function (x) { return x !== r; }).concat([nuevo]);
    const tU = leer_(HOJAS.USUARIOS);
    const simUsuarios = tU.rows.map(function (u) { return Object.assign({}, u, { rol: String(u.rol) === original ? nombre : u.rol }); });
    if (!quedaAdmin_(simUsuarios, simRoles)) throw error_('VALIDACION', 'Debe quedar al menos un administrador activo con un rol administrador');
    if (r) Object.assign(r, nuevo); else r = nuevo;
    escribir_(t, r);
    if (nombre !== original) {
      tU.rows.forEach(function (u) { if (String(u.rol) === original) { u.rol = nombre; escribir_(tU, u); } });
    }
    log_(ctx.email, 'guardar_rol', 'rol', nombre, '');
    return { rol: publicoRol_(r) };
  });
}

function accionEliminarRol_(ctx, req) {
  soloAdmin_(ctx);
  const nombre = String(req.rol || '');
  return conLock_(function () {
    if (leer_(HOJAS.USUARIOS).rows.some(function (u) { return String(u.rol) === nombre; })) throw error_('VALIDACION', 'Hay usuarios con este rol; cámbialos antes de eliminarlo');
    const t = leer_(HOJAS.ROLES);
    const r = t.rows.filter(function (x) { return String(x.rol) === nombre; })[0];
    if (r) t.sh.deleteRow(r._row);
    log_(ctx.email, 'eliminar_rol', 'rol', nombre, '');
    return {};
  });
}

function slug_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'campo';
}

function accionGuardarCampo_(ctx, req) {
  soloAdmin_(ctx);
  const d = req.campo || {};
  const entidad = String(d.entidad);
  if (['vehiculo', 'evento'].indexOf(entidad) < 0) throw error_('VALIDACION', 'Entidad inválida');
  const etiqueta = String(d.etiqueta || '').trim();
  if (!etiqueta) throw error_('VALIDACION', 'El campo necesita un nombre');
  if (TIPOS_CAMPO.indexOf(d.tipo) < 0) throw error_('VALIDACION', 'Tipo de campo inválido');
  return conLock_(function () {
    const t = leer_(HOJAS.CAMPOS);
    const deEntidad = t.rows.filter(function (c) { return c.entidad === entidad; });
    let c = d.clave ? deEntidad.filter(function (x) { return x.clave === d.clave; })[0] : null;
    if (c) {
      const esSistema = bool_(c.sistema);
      c.etiqueta = etiqueta;
      c.opciones = String(d.opciones || '');
      c.ayuda = String(d.ayuda || '');
      c.por_defecto = String(d.por_defecto || '');
      c.alerta = c.tipo === 'fecha' || d.tipo === 'fecha' ? bool_(d.alerta) : false;
      if (!esSistema) {
        c.tipo = d.tipo;
        c.requerido = bool_(d.requerido);
        c.activo = d.activo !== false;
      }
    } else {
      let clave = slug_(etiqueta);
      let n = 2;
      const base = clave;
      while (RESERVADAS.indexOf(clave) >= 0 || deEntidad.some(function (x) { return x.clave === clave; })) clave = base + '_' + (n++);
      const maxOrden = deEntidad.reduce(function (m, x) { return Math.max(m, Number(x.orden) || 0); }, 0);
      c = {
        entidad: entidad, clave: clave, etiqueta: etiqueta, tipo: d.tipo, opciones: String(d.opciones || ''),
        requerido: bool_(d.requerido), por_defecto: String(d.por_defecto || ''), orden: maxOrden + 10,
        activo: d.activo !== false, sistema: false, alerta: d.tipo === 'fecha' && bool_(d.alerta), ayuda: String(d.ayuda || ''),
      };
    }
    if ((c.tipo === 'seleccion' || c.tipo === 'multiple') && !String(c.opciones).trim()) throw error_('VALIDACION', 'Indica las opciones separadas por coma');
    escribir_(t, c);
    log_(ctx.email, 'guardar_campo', entidad, c.clave, etiqueta);
    return { campo: publicoCampo_(c) };
  });
}

function accionOrdenarCampos_(ctx, req) {
  soloAdmin_(ctx);
  const claves = Array.isArray(req.claves) ? req.claves : [];
  return conLock_(function () {
    const t = leer_(HOJAS.CAMPOS);
    claves.forEach(function (clave, i) {
      const c = t.rows.filter(function (x) { return x.entidad === req.entidad && x.clave === clave; })[0];
      if (c && Number(c.orden) !== (i + 1) * 10) { c.orden = (i + 1) * 10; escribir_(t, c); }
    });
    return {};
  });
}

function accionGuardarConfig_(ctx, req) {
  soloAdmin_(ctx);
  const valores = req.config || {};
  const res = conLock_(function () {
    const t = leer_(HOJAS.CONFIG);
    Object.keys(valores).forEach(function (k) {
      if (!/^[a-z0-9_]+$/.test(k)) return;
      let r = t.rows.filter(function (x) { return x.clave === k; })[0];
      if (r) r.valor = valores[k]; else r = { clave: k, valor: valores[k], descripcion: '' };
      escribir_(t, r);
    });
    log_(ctx.email, 'guardar_config', 'config', '', Object.keys(valores).join(', '));
    return {};
  });
  if (valores.compartir_archivos !== undefined) {
    try { res.detalle = sincronizarPermisosDrive_(); } catch (e) { console.error(e); }
  }
  return res;
}

// ---------------------------------------------------------------------------
//  ACCESO A LA PLANILLA
// ---------------------------------------------------------------------------

let SS_CACHE_ = null;
function ss_() {
  if (SS_CACHE_) return SS_CACHE_;
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  SS_CACHE_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!SS_CACHE_) throw error_('CONFIG', 'Backend no configurado: ejecuta setup()');
  return SS_CACHE_;
}

function hoja_(nombre) {
  const sh = ss_().getSheetByName(nombre);
  if (!sh) throw error_('CONFIG', 'Falta la pestaña "' + nombre + '": ejecuta setup()');
  return sh;
}

let TZ_ = null;
function tz_() {
  if (!TZ_) TZ_ = ss_().getSpreadsheetTimeZone() || 'America/Santiago';
  return TZ_;
}

function leer_(nombre) {
  const sh = hoja_(nombre);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (!lastCol || !lastRow) return { sh: sh, headers: [], rows: [] };
  const valores = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = valores[0].map(function (h) { return String(h).trim(); });
  const rows = [];
  for (let i = 1; i < valores.length; i++) {
    const fila = valores[i];
    if (fila.every(function (v) { return v === '' || v === null; })) continue;
    const o = { _row: i + 1 };
    for (let j = 0; j < headers.length; j++) if (headers[j]) o[headers[j]] = norm_(fila[j]);
    rows.push(o);
  }
  return { sh: sh, headers: headers, rows: rows };
}

function norm_(v) {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    if (Utilities.formatDate(v, tz_(), 'HH:mm:ss') === '00:00:00') return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
    return v.toISOString();
  }
  return v;
}

function celda_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean' || typeof v === 'number') return v;
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  // Evita fórmulas inyectadas y que Sheets transforme textos (teléfonos, códigos con ceros, timestamps)
  if (/^[=+\-@]/.test(s) || /^\d{4}-\d\d-\d\dT/.test(s) || /^0\d+$/.test(s) || /^\d{12,}$/.test(s)) return "'" + s;
  return s;
}

function asegurarColumnas_(sh, n) {
  const max = sh.getMaxColumns();
  if (n > max) sh.insertColumnsAfter(max, n - max);
}

function escribir_(t, obj) {
  const claves = Object.keys(obj).filter(function (k) { return k.charAt(0) !== '_'; });
  const nuevas = claves.filter(function (k) { return t.headers.indexOf(k) < 0; });
  if (nuevas.length) {
    asegurarColumnas_(t.sh, t.headers.length + nuevas.length);
    t.sh.getRange(1, t.headers.length + 1, 1, nuevas.length).setValues([nuevas])
      .setFontWeight('bold').setBackground('#1f2a37').setFontColor('#ffffff');
    t.headers = t.headers.concat(nuevas);
  }
  const fila = t.headers.map(function (h) { return h && Object.prototype.hasOwnProperty.call(obj, h) ? celda_(obj[h]) : ''; });
  if (obj._row) {
    t.sh.getRange(obj._row, 1, 1, fila.length).setValues([fila]);
  } else {
    t.sh.appendRow(fila);
    obj._row = t.sh.getLastRow();
    t.rows.push(obj);
  }
  return obj;
}

function buscar_(t, id) {
  id = String(id || '');
  if (!id) return null;
  for (let i = 0; i < t.rows.length; i++) if (String(t.rows[i].id) === id) return t.rows[i];
  return null;
}

function leerCache_(nombre) {
  const cache = CacheService.getScriptCache();
  const clave = 'tabla_v1_' + nombre;
  const guardado = cache.get(clave);
  if (guardado) { try { return JSON.parse(guardado); } catch (e) { /* recargar */ } }
  const rows = leer_(nombre).rows;
  try { cache.put(clave, JSON.stringify(rows), 300); } catch (e) { /* muy grande */ }
  return rows;
}

function limpiarCache_() {
  CacheService.getScriptCache().removeAll([HOJAS.USUARIOS, HOJAS.ROLES, HOJAS.CAMPOS, HOJAS.CONFIG].map(function (n) { return 'tabla_v1_' + n; }));
}

function camposDe_(entidad) {
  return leerCache_(HOJAS.CAMPOS).filter(function (c) { return c.entidad === entidad; });
}

function configObj_() {
  const o = {};
  leerCache_(HOJAS.CONFIG).forEach(function (r) { if (r.clave) o[r.clave] = r.valor; });
  return o;
}

function log_(email, accion, entidad, id, detalle) {
  try {
    hoja_(HOJAS.LOG).appendRow([celda_(ahora_()), email, accion, entidad, String(id || ''), celda_(String(detalle || '').slice(0, 500))]);
  } catch (e) { /* el log nunca debe romper la operación */ }
}

// ---------------------------------------------------------------------------
//  UTILIDADES
// ---------------------------------------------------------------------------

function publico_(r) {
  const o = {};
  Object.keys(r).forEach(function (k) { if (k.charAt(0) !== '_') o[k] = r[k]; });
  if (o.eliminado !== undefined) o.eliminado = bool_(o.eliminado);
  if (o.adjuntos !== undefined) o.adjuntos = parseJson_(o.adjuntos, []);
  return o;
}

function publicoCampo_(c) {
  return {
    entidad: c.entidad, clave: c.clave, etiqueta: c.etiqueta, tipo: c.tipo, opciones: String(c.opciones || ''),
    requerido: bool_(c.requerido), por_defecto: String(c.por_defecto || ''), orden: Number(c.orden) || 0,
    activo: bool_(c.activo), sistema: bool_(c.sistema), alerta: bool_(c.alerta), ayuda: String(c.ayuda || ''),
  };
}

function publicoRol_(r) {
  const o = { rol: String(r.rol), descripcion: String(r.descripcion || '') };
  PERMISOS.forEach(function (p) { o[p[0]] = bool_(r[p[0]]); });
  return o;
}

function bool_(v) {
  if (v === true) return true;
  if (v === false || v === null || v === undefined) return false;
  return /^(true|verdadero|si|sí|1|x|yes)$/i.test(String(v).trim());
}

function normEmail_(e) { return String(e || '').trim().toLowerCase(); }
function normPatente_(p) { return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function ahora_() { return new Date().toISOString(); }

function parseJson_(s, defecto) {
  if (Array.isArray(s)) return s;
  try { const v = JSON.parse(String(s || '')); return v == null ? defecto : v; } catch (e) { return defecto; }
}

function hash_(s) {
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8);
  return d.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
