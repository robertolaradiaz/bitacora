// ============================================================================
//  CONFIGURACIÓN DE LA APP — edita estos valores al instalar
// ============================================================================
export const CONFIG = {
  // URL de la implementación "Aplicación web" de Apps Script (termina en /exec).
  // Si se deja vacía, la app funciona en MODO DEMO (datos solo en este dispositivo).
  API_URL: 'https://script.google.com/macros/s/AKfycby0PkkIwmMME4gOWHR_3jInWEMGmgU1qn8vlPK6lzBeNsC1QzEoMTT5G9KT3A_ud8dD/exec',

  // ID de cliente OAuth de Google (tipo "Aplicación web"), el mismo que va en Code.gs.
  GOOGLE_CLIENT_ID: '797314469489-4c48tvl5l1fi9hvq5hpbjfls2ffpaefn.apps.googleusercontent.com',

  // Nombre por defecto (luego se usa el "nombre_empresa" de la configuración).
  APP_NOMBRE: 'Bitácora de Vehículos',

  // Forzar modo demo aunque haya API_URL (útil para mostrar la app).
  DEMO: false,
};

export const VERSION = '1.0.0';
