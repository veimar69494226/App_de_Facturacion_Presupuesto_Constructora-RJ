const KEY_COUNTER_FACTURA = "rj_counter_FACTURA_v1";
const KEY_COUNTER_PRESUPUESTO = "rj_counter_PRESUPUESTO_v1";

const KEY_DOCS = "rj_docs_v1";
const KEY_FACTURAS = "rj_facturas_v1";
const KEY_PRESUPUESTOS = "rj_presupuestos_v1";

function canUseLocalStorage() {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function readCounter(key) {
  if (!canUseLocalStorage()) return 0;
  return Number(localStorage.getItem(key) || "0");
}

function writeCounter(key, value) {
  if (!canUseLocalStorage()) return;
  localStorage.setItem(key, String(value));
}

export function peekNextFacturaNumber(prefix = "RJ") {
  const last = readCounter(KEY_COUNTER_FACTURA);
  return `${prefix}-F-${String(last + 1).padStart(5, "0")}`;
}

export function nextFacturaNumber(prefix = "RJ") {
  const next = readCounter(KEY_COUNTER_FACTURA) + 1;
  writeCounter(KEY_COUNTER_FACTURA, next);
  return `${prefix}-F-${String(next).padStart(5, "0")}`;
}

export function peekNextPresupuestoNumber(prefix = "RJ") {
  const last = readCounter(KEY_COUNTER_PRESUPUESTO);
  return `${prefix}-P-${String(last + 1).padStart(5, "0")}`;
}

export function nextPresupuestoNumber(prefix = "RJ") {
  const next = readCounter(KEY_COUNTER_PRESUPUESTO) + 1;
  writeCounter(KEY_COUNTER_PRESUPUESTO, next);
  return `${prefix}-P-${String(next).padStart(5, "0")}`;
}

function hasElectronDocStore() {
  return (
    typeof window !== "undefined" &&
    !!window.rjApi &&
    typeof window.rjApi.loadDocs === "function" &&
    typeof window.rjApi.saveDocs === "function"
  );
}

function readList(key) {
  if (!canUseLocalStorage()) return [];

  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeList(key, list) {
  if (!canUseLocalStorage()) return;
  localStorage.setItem(key, JSON.stringify(list));
}

function removeList(key) {
  if (!canUseLocalStorage()) return;
  localStorage.removeItem(key);
}

function docKey(doc) {
  if (!doc || typeof doc !== "object") return "";
  return doc.id || `${doc.tipo || ""}:${doc.numero || ""}`;
}

function normalizeDocList(...lists) {
  const seen = new Set();
  const result = [];

  for (const list of lists) {
    if (!Array.isArray(list)) continue;

    for (const doc of list) {
      if (!doc || typeof doc !== "object") continue;
      const key = docKey(doc);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(doc.id ? doc : { ...doc, id: key });
    }
  }

  return result;
}

function legacyDocs() {
  return normalizeDocList(
    readList(KEY_DOCS),
    readList(KEY_FACTURAS).map((doc) => ({ ...doc, tipo: doc.tipo || "FACTURA" })),
    readList(KEY_PRESUPUESTOS).map((doc) => ({
      ...doc,
      tipo: doc.tipo || "PRESUPUESTO",
    }))
  );
}

function clearLegacyDocs() {
  removeList(KEY_DOCS);
  removeList(KEY_FACTURAS);
  removeList(KEY_PRESUPUESTOS);
}

function hasNewDocs(base, extra) {
  const baseKeys = new Set(normalizeDocList(base).map(docKey));
  return normalizeDocList(extra).some((doc) => !baseKeys.has(docKey(doc)));
}

function throwIfFailed(response, action) {
  if (!response?.ok) {
    throw new Error(response?.error || `No se pudo ${action}.`);
  }
}

async function persistDocs(list) {
  const docs = normalizeDocList(list);

  if (hasElectronDocStore()) {
    const res = await window.rjApi.saveDocs(docs);
    throwIfFailed(res, "guardar documentos");
    syncCountersFromDocs(res.docs || docs);
    return normalizeDocList(res.docs || docs);
  }

  writeList(KEY_DOCS, docs);
  syncCountersFromDocs(docs);
  return docs;
}

function maxDocNumber(docs, tipo) {
  const marker = tipo === "FACTURA" ? "-F-" : "-P-";
  let max = 0;

  for (const doc of docs || []) {
    if (doc?.tipo !== tipo || !doc.numero) continue;
    const index = String(doc.numero).lastIndexOf(marker);
    if (index === -1) continue;
    const value = Number(String(doc.numero).slice(index + marker.length));
    if (Number.isFinite(value)) max = Math.max(max, value);
  }

  return max;
}

export function syncCountersFromDocs(docs) {
  if (!canUseLocalStorage()) return;

  const maxFactura = maxDocNumber(docs, "FACTURA");
  const maxPresupuesto = maxDocNumber(docs, "PRESUPUESTO");

  if (maxFactura > readCounter(KEY_COUNTER_FACTURA)) {
    writeCounter(KEY_COUNTER_FACTURA, maxFactura);
  }

  if (maxPresupuesto > readCounter(KEY_COUNTER_PRESUPUESTO)) {
    writeCounter(KEY_COUNTER_PRESUPUESTO, maxPresupuesto);
  }
}

export async function loadDocs() {
  const legacy = legacyDocs();

  if (hasElectronDocStore()) {
    const res = await window.rjApi.loadDocs();
    throwIfFailed(res, "leer documentos");

    const stored = normalizeDocList(res.docs || []);
    const docs = normalizeDocList(stored, legacy);

    if (hasNewDocs(stored, legacy)) {
      await persistDocs(docs);
    } else {
      syncCountersFromDocs(docs);
    }

    if (legacy.length) {
      clearLegacyDocs();
    }

    return docs;
  }

  syncCountersFromDocs(legacy);
  return legacy;
}

export async function initializeCountersFromDocs() {
  const docs = await loadDocs();
  syncCountersFromDocs(docs);
  return docs;
}

export async function upsertDoc(doc) {
  const current = await loadDocs();
  const key = docKey(doc);
  if (!key) throw new Error("Documento sin id o numero.");

  const idx = current.findIndex((item) => docKey(item) === key);
  if (idx === -1) current.unshift(doc);
  else current[idx] = doc;

  return persistDocs(current);
}

export async function deleteDoc(id) {
  const current = await loadDocs();
  return persistDocs(current.filter((doc) => doc.id !== id));
}

export async function getDoc(id) {
  const docs = await loadDocs();
  return docs.find((doc) => doc.id === id) || null;
}

export async function getDocsStorageInfo() {
  if (!hasElectronDocStore() || typeof window.rjApi.getDocsStorageInfo !== "function") {
    return { ok: false, docsFile: null };
  }

  return window.rjApi.getDocsStorageInfo();
}

// Compatibilidad con pantallas antiguas. Ya no guardan el historial principal.
export function loadFacturas() {
  return readList(KEY_FACTURAS);
}

export function saveFacturas(list) {
  writeList(KEY_FACTURAS, list);
}

export function loadPresupuestos() {
  return readList(KEY_PRESUPUESTOS);
}

export function savePresupuestos(list) {
  writeList(KEY_PRESUPUESTOS, list);
}
