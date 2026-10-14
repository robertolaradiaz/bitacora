// Navegación sin apilar pantallas de más en el historial, para que el botón atrás de
// Android retroceda de forma natural y, desde la pantalla inicial, cierre la app.
// Cada entrada del historial guarda su profundidad (0 = primera pantalla abierta) y la
// ruta de la pantalla anterior.
const nav = { prof: 0, ruta: null, reemplazo: false, iniciado: false, pendiente: null };

const rutaActual = () => location.hash.replace(/^#/, '').split('#')[0] || '/';
const normal = (ruta) => String(ruta).replace(/^#/, '').split('#')[0] || '/';
const conGato = (ruta) => '#' + (String(ruta).replace(/^#/, '') || '/');

// Al retroceder o avanzar (aunque la ruta no cambie) se toma la posición guardada
window.addEventListener('popstate', () => {
  const st = history.state;
  if (st && typeof st.prof === 'number') { nav.prof = Math.max(0, st.prof); nav.ruta = rutaActual(); }
});

// Se llama antes de mostrar cada pantalla. Devuelve false si no hay que dibujarla
// (paso intermedio al cambiar de pestaña desde una pantalla interior).
export function registrarEntrada() {
  const st = history.state;
  if (nav.pendiente) {
    nav.prof = st && typeof st.prof === 'number' ? st.prof : 0;
    nav.ruta = rutaActual();
    const destino = nav.pendiente;
    nav.pendiente = null;
    if (rutaActual() !== destino) { location.hash = conGato(destino); return false; }
    return true;
  }
  if (!nav.iniciado) {
    // Al abrir (o recargar) la app, la pantalla actual pasa a ser la primera
    nav.prof = 0;
    history.replaceState({ prof: 0, previa: null }, '');
  } else if (st && typeof st.prof === 'number' && !nav.reemplazo) {
    nav.prof = st.prof;
  } else {
    const nueva = nav.iniciado && !nav.reemplazo;
    const previa = nueva ? nav.ruta : (st && st.previa) || nav.previaReemplazo || null;
    if (nueva) nav.prof += 1;
    history.replaceState({ prof: nav.prof, previa }, '');
  }
  nav.ruta = rutaActual();
  nav.reemplazo = false;
  nav.previaReemplazo = null;
  nav.iniciado = true;
  return true;
}

export const hayPendiente = () => !!nav.pendiente;

// Cambia de pantalla sin dejar la actual en el historial (redirecciones…)
export function reemplazar(ruta) {
  if (rutaActual() === normal(ruta)) return;
  nav.reemplazo = true;
  nav.previaReemplazo = history.state && history.state.previa;
  location.replace(conGato(ruta));
}

// Después de guardar: si la pantalla anterior es el destino, se vuelve a ella (no se
// repite en el historial); si no, se reemplaza el formulario por el destino.
export function salirA(ruta) {
  const st = history.state;
  if (nav.prof > 0 && st && st.previa === normal(ruta)) history.back();
  else reemplazar(ruta);
}

// "Volver": retrocede en el historial si hay de dónde; si no, va a la ruta indicada.
export function volver(rutaPorDefecto = '/') {
  if (nav.prof > 0) history.back();
  else reemplazar(rutaPorDefecto);
}

// Pestañas del menú inferior: el historial queda como [primera pantalla, pestaña], así el
// botón atrás vuelve a la primera pantalla y luego cierra la app.
export function irPestana(ruta) {
  const destino = normal(ruta);
  if (rutaActual() === destino) return;
  const pasos = Math.min(nav.prof, history.length - 1);
  if (pasos <= 0) { location.hash = conGato(destino); return; }
  nav.pendiente = destino;
  history.go(-pasos);
}
