// src/storage/docStore.js

// FACTURAS
const KEY_FACTURAS = "rj_facturas_v1";
const KEY_COUNTER_FACTURA = "rj_counter_FACTURA_v1";

export function loadFacturas() {
  try {
    return JSON.parse(localStorage.getItem(KEY_FACTURAS) || "[]");
  } catch {
    return [];
  }
}

export function saveFacturas(list) {
  localStorage.setItem(KEY_FACTURAS, JSON.stringify(list));
}

export function peekNextFacturaNumber(prefix = "RJ") {
  const last = Number(localStorage.getItem(KEY_COUNTER_FACTURA) || "0");
  const next = last + 1;
  return `${prefix}-F-${String(next).padStart(5, "0")}`;
}

export function nextFacturaNumber(prefix = "RJ") {
  const last = Number(localStorage.getItem(KEY_COUNTER_FACTURA) || "0");
  const next = last + 1;
  localStorage.setItem(KEY_COUNTER_FACTURA, String(next));
  return `${prefix}-F-${String(next).padStart(5, "0")}`;
}


// PRESUPUESTOS
const KEY_PRESUPUESTOS = "rj_presupuestos_v1";
const KEY_COUNTER_PRESUPUESTO = "rj_counter_PRESUPUESTO_v1";

export function loadPresupuestos() {
  try {
    return JSON.parse(localStorage.getItem(KEY_PRESUPUESTOS) || "[]");
  } catch {
    return [];
  }
}

export function savePresupuestos(list) {
  localStorage.setItem(KEY_PRESUPUESTOS, JSON.stringify(list));
}

export function peekNextPresupuestoNumber(prefix = "RJ") {
  const last = Number(localStorage.getItem(KEY_COUNTER_PRESUPUESTO) || "0");
  const next = last + 1;
  return `${prefix}-P-${String(next).padStart(5, "0")}`;
}

export function nextPresupuestoNumber(prefix = "RJ") {
  const last = Number(localStorage.getItem(KEY_COUNTER_PRESUPUESTO) || "0");
  const next = last + 1;
  localStorage.setItem(KEY_COUNTER_PRESUPUESTO, String(next));
  return `${prefix}-P-${String(next).padStart(5, "0")}`;
}
