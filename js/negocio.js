// Reglas de negocio de la bitácora (alertas, estados, títulos).
import { estado, camposDe } from './state.js';
import { diasHasta, fFecha, colorDe } from './ui.js';

export function formatoPatente(p) {
  const s = String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^[A-Z]{4}\d{2}$/.test(s)) return s.slice(0, 2) + '·' + s.slice(2, 4) + '·' + s.slice(4);
  if (/^[A-Z]{2}\d{4}$/.test(s)) return s.slice(0, 2) + '·' + s.slice(2, 4) + '·' + s.slice(4);
  return String(p || '').toUpperCase() || '—';
}

export function estadosCerrados() {
  return String(estado.config.estados_cerrados || 'Resuelto, Cerrado').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export const estaAbierto = (ev) => {
  if (ev.estado === undefined || ev.estado === '') return false;
  return !estadosCerrados().includes(String(ev.estado).toLowerCase());
};

export function claseEstado(valor) {
  const v = String(valor || '').toLowerCase();
  if (!v) return '';
  if (estadosCerrados().includes(v)) return 'chip-ok';
  if (/proceso|curso|espera|revisi/.test(v)) return 'chip-medio';
  return 'chip-alerta';
}

export function clasePrioridad(valor) {
  const v = String(valor || '').toLowerCase();
  if (/cr[ií]tic|urgente/.test(v)) return 'chip-critico';
  if (/alta/.test(v)) return 'chip-alerta';
  if (/media/.test(v)) return 'chip-medio';
  return 'chip-neutro';
}

export const tonoTipo = (tipo) => colorDe(tipo);

export function tituloEvento(ev) {
  return ev.titulo || ev.tipo || 'Registro';
}

export function nombreVehiculo(v) {
  if (!v) return 'Vehículo';
  return [v.marca, v.modelo].filter(Boolean).join(' ') || v.tipo_vehiculo || 'Vehículo';
}

// Alertas de vencimiento: campos de fecha marcados con "alerta" en la ficha del
// vehículo y en el último registro que tenga ese campo (ej. próxima mantención).
export function alertasVehiculo(v, eventos = []) {
  const margen = Number(estado.config.dias_alerta || 30);
  const out = [];
  const revisar = (etiqueta, fecha, origen) => {
    const d = diasHasta(fecha);
    if (d === null || d > margen) return;
    out.push({ etiqueta, fecha, dias: d, nivel: d < 0 ? 'vencido' : 'proximo', origen,
      texto: d < 0 ? `vencido hace ${-d} día${d === -1 ? '' : 's'}` : d === 0 ? 'vence hoy' : `vence en ${d} día${d === 1 ? '' : 's'}`,
      fechaTxt: fFecha(fecha) });
  };
  camposDe('vehiculo').filter((c) => c.alerta && c.tipo === 'fecha').forEach((c) => revisar(c.etiqueta, v[c.clave], 'vehiculo'));
  const ordenados = eventos.slice().sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || String(b.creado_en).localeCompare(String(a.creado_en)));
  camposDe('evento').filter((c) => c.alerta && c.tipo === 'fecha').forEach((c) => {
    const ev = ordenados.find((e) => e[c.clave]);
    if (ev) revisar(c.etiqueta, ev[c.clave], 'evento');
  });
  return out.sort((a, b) => a.dias - b.dias);
}

export function ordenarEventos(lista) {
  return lista.slice().sort((a, b) =>
    String(b.fecha || '').localeCompare(String(a.fecha || '')) || String(b.creado_en || '').localeCompare(String(a.creado_en || '')));
}
