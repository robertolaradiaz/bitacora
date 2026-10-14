// Pantalla de ingreso con cuenta Google (Gmail).
import { html, pintar, icono, $, $$, aviso } from '../ui.js';
import { CONFIG } from '../config.js';
import { esDemo } from '../api.js';

export const PERMISOS_TXT = {
  ver_vehiculos: 'Ver vehículos y su ficha',
  editar_vehiculos: 'Crear, editar y dar de baja vehículos',
  ver_eventos: 'Ver todos los registros',
  crear_eventos: 'Crear registros',
  editar_eventos_propios: 'Editar tus propios registros',
  editar_eventos: 'Editar cualquier registro',
  eliminar_eventos: 'Eliminar registros',
  subir_archivos: 'Adjuntar fotos, videos y audios',
  administrar: 'Administrar usuarios, roles y campos',
};

let gisCargado = null;
function cargarGIS() {
  if (!gisCargado) {
    gisCargado = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { gisCargado = null; reject(new Error('No se pudo cargar el inicio de sesión de Google')); };
      document.head.appendChild(s);
    });
  }
  return gisCargado;
}

export function pantallaLogin(raiz, { mensaje = '', email = '', onCredencial }) {
  pintar(raiz, html`
    <div class="login login-a">
      <div class="login-marca">
        <img class="login-logo logo-sobre-naranjo" src="brand/unit-hb-blanco.svg" alt="UNIT · Universal Intelligence">
        <img class="login-logo logo-sobre-blanco" src="brand/unit-hb-naranjo.svg" alt="UNIT · Universal Intelligence">
        <h1>${CONFIG.APP_NOMBRE}</h1>
        <p>Historial de mantenciones, problemas y hallazgos de cada vehículo de la flota.</p>
      </div>
      <div class="login-caja">
        ${mensaje ? html`<div class="banner banner-error">${icono('alerta')} ${mensaje}</div>` : ''}
        ${email ? html`<p class="sub">Tu sesión terminó. Vuelve a ingresar con <b>${email}</b>; tus cambios sin enviar siguen guardados.</p>` : ''}
        <div id="acceso"></div>
        <ul class="login-puntos">
          <li>${icono('sinNube', 'ico-xs')} Funciona sin señal y sincroniza después</li>
          <li>${icono('camara', 'ico-xs')} Fotos, videos y notas de voz a Google Drive</li>
          <li>${icono('candado', 'ico-xs')} Acceso solo para cuentas autorizadas</li>
        </ul>
      </div>
    </div>`);
  const acceso = $('#acceso', raiz);

  if (esDemo()) {
    import('../../demo/emulador.js').then(({ USUARIOS_DEMO, reiniciarDemo }) => {
      pintar(acceso, html`
        <p class="demo-aviso"><b>Modo demostración.</b> Elige con qué perfil entrar. Los datos se guardan solo en este dispositivo.</p>
        <div class="demo-usuarios">${USUARIOS_DEMO.map((u) => html`
          <button class="demo-user" data-email="${u.email}"><span class="avatar">${u.nombre.charAt(0)}</span>
            <span><strong>${u.rol}</strong><small>${u.email}</small></span>${icono('atras', 'ico-rot')}</button>`)}</div>
        <button class="btn-link" id="reiniciar">Restablecer datos de demostración</button>`);
      $$('[data-email]', acceso).forEach((b) => { b.onclick = () => onCredencial('demo:' + b.dataset.email); });
      $('#reiniciar', acceso).onclick = () => { reiniciarDemo(); indexedDB.deleteDatabase('bitacora'); aviso('Datos de demostración restablecidos'); setTimeout(() => location.reload(), 600); };
    });
    return;
  }

  if (!CONFIG.GOOGLE_CLIENT_ID) {
    pintar(acceso, html`<div class="banner banner-error">Falta configurar GOOGLE_CLIENT_ID en js/config.js</div>`);
    return;
  }
  if (!navigator.onLine) {
    pintar(acceso, html`<div class="banner banner-pend">${icono('sinNube')} Necesitas conexión a internet para ingresar la primera vez.</div>`);
    window.addEventListener('online', () => pantallaLogin(raiz, { mensaje, email, onCredencial }), { once: true });
    return;
  }
  pintar(acceso, html`<div id="gbtn" class="gbtn"><div class="cargando">Cargando Google…</div></div>`);
  cargarGIS().then(() => {
    /* global google */
    google.accounts.id.initialize({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      callback: (r) => onCredencial(r.credential),
      auto_select: false,
      cancel_on_tap_outside: true,
      use_fedcm_for_prompt: true,
      login_hint: email || undefined,
    });
    const cont = $('#gbtn', raiz);
    cont.innerHTML = '';
    google.accounts.id.renderButton(cont, { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', locale: 'es', width: Math.min(320, cont.clientWidth || 320) });
  }).catch((e) => pintar(acceso, html`<div class="banner banner-error">${e.message}. Revisa tu conexión.</div>`));
}
