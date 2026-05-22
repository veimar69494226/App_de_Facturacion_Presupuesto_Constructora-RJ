import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { moneyEUR, toNumber } from "../utils/money";
import {
  peekNextFacturaNumber,
  nextFacturaNumber,
  peekNextPresupuestoNumber,
  nextPresupuestoNumber,
  initializeCountersFromDocs,
  upsertDoc,
} from "../storage/docStore";

const DRAFT_KEY = "rj_emision_draft_v1";
const PRE_EDIT_DRAFT_KEY = "rj_emision_pre_edit_draft_v1";
const LEGACY_FACTURA_DRAFT = "rj_factura_draft_v1";
const LEGACY_PRESUPUESTO_DRAFT = "rj_presupuesto_draft_v1";

const EMPRESA_DEFAULT = {
  nombreComercial: "CONSTRUCCIONES Y REFORMAS R.J.",
  titular: "Ramiro Jimenez Vargas",
  telefono: "626120538",
  email: "ramirojimenezvargas26@gmail.com",
  direccion: "Murcia - Mazarrón",
  nif: "61367222W",
};

const NOTAS_DEFAULT =
  "Precios incluyen garantía.\nEste documento tendrá validez de 30 días a partir de su emisión, salvo confirmación expresa de su aprobación dentro de dicho plazo.";

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
}

function clienteCompleto(cliente = {}) {
  return {
    nombre: "",
    nif: "",
    direccion: "",
    ...cliente,
  };
}

function emptyDoc() {
  const fecha = new Date().toISOString().slice(0, 10);
  return {
    id: newId(),
    tipo: "EMISION",
    fecha,
    numero: "",
    numeroAsignado: false,
    empresa: { ...EMPRESA_DEFAULT },
    cliente: clienteCompleto(),
    tituloDetalle: "",
    items: [{ concepto: "", cantidad: 1, precio: 0, totalLinea: 0 }],
    aplicaIVA: true,
    ivaPorc: 21,
    notas: NOTAS_DEFAULT,
    subtotalModo: "auto",
    subtotalManual: "",
    subtotal: 0,
    ivaMonto: 0,
    total: 0,
  };
}

function compute(doc) {
  const items = (doc.items || []).map((it) => {
    const cantidad = Math.max(1, toNumber(it.cantidad));
    const precio = toNumber(it.precio);
    return { ...it, cantidad, precio, totalLinea: cantidad * precio };
  });

  const subtotalAuto = items.reduce((acc, it) => acc + (it.totalLinea || 0), 0);
  const ivaPorc = toNumber(doc.ivaPorc);
  const subtotalModo = doc.subtotalModo === "manual" ? "manual" : "auto";
  const subtotal =
    subtotalModo === "manual" && toNumber(doc.subtotalManual) > 0
      ? toNumber(doc.subtotalManual)
      : subtotalAuto;
  const ivaMonto = doc.aplicaIVA ? subtotal * (ivaPorc / 100) : 0;

  return {
    ...doc,
    cliente: clienteCompleto(doc.cliente),
    items,
    ivaPorc,
    subtotalModo,
    subtotal,
    ivaMonto,
    total: subtotal + ivaMonto,
  };
}

function normalizeDoc(raw) {
  const base = emptyDoc();
  const empresa = { ...base.empresa, ...(raw?.empresa || {}) };

  if (empresa.titular === "Ramiro Jiménez Vargas") {
    empresa.titular = EMPRESA_DEFAULT.titular;
  }

  const merged = {
    ...base,
    ...raw,
    empresa,
    cliente: clienteCompleto(raw?.cliente),
    items: raw?.items?.length ? raw.items : base.items,
  };
  return compute(merged);
}

function loadDraftOrEmpty(docParaEditar) {
  if (docParaEditar) return normalizeDoc(docParaEditar);

  for (const key of [DRAFT_KEY, LEGACY_FACTURA_DRAFT, LEGACY_PRESUPUESTO_DRAFT]) {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) return normalizeDoc(JSON.parse(raw));
    } catch {
      // Ignore bad drafts and continue with a clean document.
    }
  }

  return compute(emptyDoc());
}

function clearAllDrafts() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
    sessionStorage.removeItem(PRE_EDIT_DRAFT_KEY);
    sessionStorage.removeItem(LEGACY_FACTURA_DRAFT);
    sessionStorage.removeItem(LEGACY_PRESUPUESTO_DRAFT);
  } catch {
    // Session storage can be unavailable in restricted environments.
  }
}

function snapshotDraftBeforeEdit() {
  try {
    const currentDraft = sessionStorage.getItem(DRAFT_KEY);
    if (currentDraft) sessionStorage.setItem(PRE_EDIT_DRAFT_KEY, currentDraft);
    else sessionStorage.removeItem(PRE_EDIT_DRAFT_KEY);
  } catch {
    // Keeping this best-effort prevents edit cancel from blocking the form.
  }
}

function restoreDraftAfterCancelEdit() {
  try {
    const previousDraft = sessionStorage.getItem(PRE_EDIT_DRAFT_KEY);
    if (previousDraft) sessionStorage.setItem(DRAFT_KEY, previousDraft);
    else sessionStorage.removeItem(DRAFT_KEY);
    sessionStorage.removeItem(PRE_EDIT_DRAFT_KEY);
  } catch {
    // If restoring a draft fails, the form still opens as a clean document.
  }
}

function isEmailLike(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function isPhoneLike(value) {
  if (!value) return true;
  return /^[0-9+()-]{6,20}$/.test(String(value).replace(/\s/g, ""));
}

function validateDoc(doc) {
  const errors = {};
  const add = (path, message) => {
    if (!errors[path]) errors[path] = message;
  };

  if (!doc.empresa?.nombreComercial?.trim()) {
    add("empresa.nombreComercial", "Nombre empresa es obligatorio.");
  }
  if (doc.empresa?.email && !isEmailLike(doc.empresa.email)) {
    add("empresa.email", "Email no válido.");
  }
  if (doc.empresa?.telefono && !isPhoneLike(doc.empresa.telefono)) {
    add("empresa.telefono", "Teléfono no válido.");
  }
  if (doc.cliente?.nif && String(doc.cliente.nif).trim().length < 6) {
    add("cliente.nif", "NIF/DNI parece muy corto.");
  }
  if (!doc.tituloDetalle?.trim()) {
    add("tituloDetalle", "El título del trabajo es obligatorio.");
  }

  const items = doc.items || [];
  if (!items.some((item) => (item.concepto || "").trim())) {
    add("items", "Debes ingresar al menos 1 concepto.");
  }

  items.forEach((item, idx) => {
    if (!(item.concepto || "").trim()) {
      add(`items.${idx}.concepto`, "Línea vacía: completa o elimina.");
      return;
    }
    if (toNumber(item.cantidad) < 1) {
      add(`items.${idx}.cantidad`, "Cantidad mínima es 1.");
    }
  });

  if (doc.subtotalModo === "manual") {
    const subtotalManual = toNumber(doc.subtotalManual);
    if (!(Number.isFinite(subtotalManual) && subtotalManual > 0)) {
      add("subtotalManual", "Debes ingresar un subtotal manual mayor a 0.");
    }
  }

  return errors;
}

async function sugerirEspanol(value) {
  if (!window.rjApi?.suggestSpanishText) return null;

  const res = await window.rjApi.suggestSpanishText({
    text: String(value || ""),
  });

  return res?.ok ? res.suggestions?.[0] || null : null;
}

function applyTextSuggestion(value, suggestion, replacement) {
  if (!suggestion) return String(value || "");

  const text = String(value || "");
  const start = suggestion.index;
  const end = start + suggestion.length;

  return text.slice(0, start) + replacement + text.slice(end);
}

function toSentenceCase(value) {
  const text = String(value || "").replace(/\s+/g, " ");
  const leading = text.match(/^\s*/)?.[0] ?? "";
  const core = text.slice(leading.length);
  if (!core) return text;
  const index = core.search(/\p{L}/u);
  if (index === -1) return text;
  return (
    leading +
    core.slice(0, index) +
    core[index].toUpperCase() +
    core.slice(index + 1)
  );
}

function toSpanishUpper(value) {
  return String(value || "").toUpperCase();
}

const S = {
  field: { marginBottom: 12 },
  label: { display: "block", marginBottom: 6, fontSize: 12, opacity: 0.85 },
  req: { color: "#ff6b6b", marginLeft: 6, fontWeight: 900 },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.15)",
    color: "inherit",
    outline: "none",
  },
  errorText: { marginTop: 6, fontSize: 12, color: "#ff6b6b" },
  row2: { display: "flex", gap: 8 },
};

function Field({
  id,
  label,
  required,
  error,
  style,
  inputStyle,
  textarea,
  suggestion,
  onApplySuggestion,
  onDismissSuggestion,
  ...props
}) {
  const commonStyle = {
    ...S.input,
    ...(inputStyle || {}),
    border: error ? "1px solid rgba(255,107,107,0.95)" : S.input.border,
    boxShadow: error ? "0 0 0 3px rgba(255,107,107,0.15)" : "none",
  };

  return (
    <div style={{ ...S.field, ...style }}>
      <label htmlFor={id} style={S.label}>
        {label}
        {required && <span style={S.req}>*</span>}
      </label>
      {textarea ? (
        <textarea
          id={id}
          style={{ ...commonStyle, minHeight: 90, resize: "vertical" }}
          spellCheck="true"
          lang="es"
          autoCorrect="off"
          {...props}
        />
      ) : (
        <input
          id={id}
          style={commonStyle}
          spellCheck="true"
          lang="es"
          autoCorrect="off"
          autoCapitalize="sentences"
          {...props}
        />
      )}
      {error && <div style={S.errorText}>{error}</div>}
      {suggestion?.suggestions?.length > 0 && (
        <SpellSuggestion
          suggestion={suggestion}
          onApply={onApplySuggestion}
          onDismiss={onDismissSuggestion}
        />
      )}
    </div>
  );
}

function SpellSuggestion({ suggestion, onApply, onDismiss }) {
  const options = suggestion.suggestions || [];

  return (
    <div style={spellBox}>
      <span style={spellLabel}>Sugerencia para "{suggestion.word}":</span>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onApply(option)}
          style={spellOption}
        >
          {option}
        </button>
      ))}
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onDismiss}
        style={spellDismiss}
      >
        Ignorar
      </button>
    </div>
  );
}

export default function DocumentoPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const docParaEditar = location.state?.docEditar || null;
  const nuevoDocumento = location.state?.nuevoDocumento || null;
  const isEditing = Boolean(docParaEditar);

  const [current, setCurrent] = useState(() =>
    nuevoDocumento ? compute(emptyDoc()) : loadDraftOrEmpty(docParaEditar)
  );
  const [, setCounterRevision] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});
  const [spellHints, setSpellHints] = useState({});

  useEffect(() => {
    if (nuevoDocumento) {
      clearAllDrafts();
      setCurrent(compute(emptyDoc()));
      setSubmitted(false);
      setErrors({});
      navigate("/emision", { replace: true, state: null });
      return;
    }

    if (docParaEditar) {
      snapshotDraftBeforeEdit();
      setCurrent(loadDraftOrEmpty(docParaEditar));
      setSubmitted(false);
      setErrors({});
    }
  }, [docParaEditar, navigate, nuevoDocumento]);

  useEffect(() => {
    if (isEditing) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(current));
    } catch {
      // Draft persistence is best-effort.
    }
  }, [current, isEditing]);

  useEffect(() => {
    let active = true;

    initializeCountersFromDocs()
      .then(() => {
        if (active) setCounterRevision((revision) => revision + 1);
      })
      .catch(() => {
        // Counter sync is best-effort while the form is loading.
      });

    return () => {
      active = false;
    };
  }, []);

  const doc = useMemo(() => compute(current), [current]);

  function update(path, value) {
    setCurrent((prev) => {
      const keys = path.split(".");
      const copy = { ...prev };
      let ref = copy;

      for (let i = 0; i < keys.length - 1; i += 1) {
        ref[keys[i]] = { ...ref[keys[i]] };
        ref = ref[keys[i]];
      }

      ref[keys[keys.length - 1]] = value;
      return copy;
    });
  }

  function updateItem(idx, field, value) {
    setCurrent((prev) => {
      const items = prev.items.slice();
      items[idx] = { ...items[idx], [field]: value };
      return { ...prev, items };
    });
  }

  function clearSpellHint(key) {
    setSpellHints((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function requestSpellHint(key, value) {
    const source = String(value || "");
    const suggestion = await sugerirEspanol(source);

    setSpellHints((prev) => {
      if (!suggestion) {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }

      return {
        ...prev,
        [key]: { ...suggestion, source },
      };
    });
  }

  function applyFieldSuggestion(path, replacement, transform = (text) => text) {
    const key = `field:${path}`;
    const suggestion = spellHints[key];
    if (!suggestion) return;

    update(path, transform(applyTextSuggestion(suggestion.source, suggestion, replacement)));
    clearSpellHint(key);
  }

  function applyItemSuggestion(idx, field, replacement, transform = (text) => text) {
    const key = `item:${idx}:${field}`;
    const suggestion = spellHints[key];
    if (!suggestion) return;

    updateItem(idx, field, transform(applyTextSuggestion(suggestion.source, suggestion, replacement)));
    clearSpellHint(key);
  }

  function updateSpanishField(path, value, transform = (text) => text) {
    update(path, transform(value));
    clearSpellHint(`field:${path}`);
  }

  function updateSpanishItem(idx, field, value, transform = (text) => text) {
    updateItem(idx, field, transform(value));
    clearSpellHint(`item:${idx}:${field}`);
  }

  function addItem() {
    setCurrent((prev) => ({
      ...prev,
      items: [...prev.items, { concepto: "", cantidad: 1, precio: 0, totalLinea: 0 }],
    }));
  }

  function removeItem(idx) {
    setCurrent((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIdx) => itemIdx !== idx),
    }));
  }

  function buildFinalDoc(tipoDestino, computedDoc) {
    const mantieneNumero =
      computedDoc.numeroAsignado && computedDoc.tipo === tipoDestino && computedDoc.numero;
    const numero = mantieneNumero
      ? computedDoc.numero
      : tipoDestino === "FACTURA"
        ? nextFacturaNumber("RJ")
        : nextPresupuestoNumber("RJ");

    return compute({
      ...computedDoc,
      tipo: tipoDestino,
      numero,
      numeroAsignado: true,
      cliente: clienteCompleto(computedDoc.cliente),
      notas: computedDoc.notas?.trim() ? computedDoc.notas : NOTAS_DEFAULT,
    });
  }

  async function irAPrevisualizar(tipoDestino) {
    setSubmitted(true);

    const computedNow = compute(current);
    const nextErrors = validateDoc(computedNow);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      alert("Corrige lo siguiente:\n\n- " + Object.values(nextErrors).join("\n- "));
      return;
    }

    try {
      await initializeCountersFromDocs();
    } catch {
      // If counter sync fails, validation/save will still protect the document.
    }

    const finalDoc = buildFinalDoc(tipoDestino, computedNow);

    try {
      await upsertDoc(finalDoc);
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(finalDoc));
      sessionStorage.setItem(
        tipoDestino === "FACTURA" ? LEGACY_FACTURA_DRAFT : LEGACY_PRESUPUESTO_DRAFT,
        JSON.stringify(finalDoc)
      );
    } catch (error) {
      alert("No se pudo guardar el documento en el historial:\n" + (error?.message || error));
      return;
    }

    setCurrent(finalDoc);
    navigate(tipoDestino === "FACTURA" ? "/facturas/preview" : "/presupuestos/preview", {
      state: { doc: finalDoc },
    });
  }

  function cancelarEdicion() {
    restoreDraftAfterCancelEdit();
    setCurrent(compute(emptyDoc()));
    setSubmitted(false);
    setErrors({});
    navigate("/emision", {
      replace: true,
      state: { nuevoDocumento: Date.now() },
    });
  }

  const facturaNumber =
    doc.numeroAsignado && doc.tipo === "FACTURA"
      ? doc.numero
      : peekNextFacturaNumber("RJ");
  const presupuestoNumber =
    doc.numeroAsignado && doc.tipo === "PRESUPUESTO"
      ? doc.numero
      : peekNextPresupuestoNumber("RJ");
  const hasErrors = submitted && Object.keys(errors).length > 0;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 16px 92px" }}>
      <h2 style={{ margin: 0 }}>EMISIÓN</h2>

      {isEditing && (
        <div style={editToolbar}>
          <span style={editBadge}>
            Editando {doc.tipo === "FACTURA" ? "factura" : "presupuesto"} {doc.numero}
          </span>
          <button type="button" onClick={cancelarEdicion} style={cancelEditButton}>
            <i className="bi bi-x-circle" style={{ marginRight: 8 }} />
            Cancelar edición
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginTop: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.85 }}>No. Factura</span>
          <input value={facturaNumber} readOnly style={{ ...S.input, width: 200 }} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.85 }}>No. Presupuesto</span>
          <input value={presupuestoNumber} readOnly style={{ ...S.input, width: 220 }} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.85 }}>Fecha</span>
          <input
            type="date"
            className="dateInput"
            value={doc.fecha || new Date().toISOString().slice(0, 10)}
            onChange={(e) => update("fecha", e.target.value)}
            style={{ ...S.input, width: 200 }}
          />
        </label>
      </div>

      <div style={fixedActions}>
        <button
          onClick={() => irAPrevisualizar("PRESUPUESTO")}
          title={hasErrors ? "Hay errores por corregir" : "Generar y previsualizar presupuesto"}
          style={actionButton}
        >
          <i className="bi bi-file-earmark-text" style={{ fontSize: 18 }} />
          Presupuestar
        </button>
        <button
          onClick={() => irAPrevisualizar("FACTURA")}
          title={hasErrors ? "Hay errores por corregir" : "Generar y previsualizar factura"}
          style={actionButton}
        >
          <i className="bi bi-receipt" style={{ fontSize: 18 }} />
          Facturar
        </button>
      </div>

      <hr style={{ margin: "14px 0" }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={panelStyle}>
          <h3 style={{ marginTop: 0 }}>Empresa</h3>

          <Field
            id="empNombre"
            label="Nombre empresa"
            required
            value={doc.empresa.nombreComercial}
            onChange={(e) => update("empresa.nombreComercial", e.target.value)}
            error={errors["empresa.nombreComercial"]}
          />

          <Field
            id="empTitular"
            label="Titular / Responsable"
            value={doc.empresa.titular}
            onChange={(e) => update("empresa.titular", e.target.value)}
            spellCheck={false}
          />

          <div style={S.row2}>
            <Field
              id="empNif"
              label="NIF"
              style={{ flex: 1, marginBottom: 0 }}
              value={doc.empresa.nif}
              onChange={(e) => update("empresa.nif", e.target.value)}
            />
            <Field
              id="empTel"
            label="Teléfono"
              style={{ flex: 1, marginBottom: 0 }}
              value={doc.empresa.telefono}
              onChange={(e) => update("empresa.telefono", e.target.value)}
              error={errors["empresa.telefono"]}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <Field
              id="empDir"
              label="Dirección"
              value={doc.empresa.direccion}
              onChange={(e) => updateSpanishField("empresa.direccion", e.target.value)}
              onBlur={(e) => void requestSpellHint("field:empresa.direccion", e.target.value)}
              suggestion={spellHints["field:empresa.direccion"]}
              onApplySuggestion={(option) => applyFieldSuggestion("empresa.direccion", option)}
              onDismissSuggestion={() => clearSpellHint("field:empresa.direccion")}
            />
          </div>

          <Field
            id="empEmail"
            label="Email"
            value={doc.empresa.email}
            onChange={(e) => update("empresa.email", e.target.value)}
            error={errors["empresa.email"]}
          />
        </div>

        <div style={panelStyle}>
          <h3 style={{ marginTop: 0 }}>Cliente</h3>

          <Field
            id="cliNombre"
            label="Nombre completo / Razón social"
            value={doc.cliente.nombre}
            onChange={(e) => updateSpanishField("cliente.nombre", e.target.value)}
            onBlur={(e) => void requestSpellHint("field:cliente.nombre", e.target.value)}
            suggestion={spellHints["field:cliente.nombre"]}
            onApplySuggestion={(option) => applyFieldSuggestion("cliente.nombre", option)}
            onDismissSuggestion={() => clearSpellHint("field:cliente.nombre")}
            placeholder="Nombre del cliente"
          />

          <Field
            id="cliNif"
            label="NIF / DNI"
            value={doc.cliente.nif}
            onChange={(e) => update("cliente.nif", e.target.value)}
            error={errors["cliente.nif"]}
          />

          <Field
            id="cliDir"
            label="Dirección"
            value={doc.cliente.direccion}
            onChange={(e) => updateSpanishField("cliente.direccion", e.target.value)}
            onBlur={(e) => void requestSpellHint("field:cliente.direccion", e.target.value)}
            suggestion={spellHints["field:cliente.direccion"]}
            onApplySuggestion={(option) => applyFieldSuggestion("cliente.direccion", option)}
            onDismissSuggestion={() => clearSpellHint("field:cliente.direccion")}
          />
        </div>
      </div>

      <div style={{ ...panelStyle, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Detalle</h3>

        <Field
          id="tituloDetalle"
          label="Título del trabajo"
          required
          value={doc.tituloDetalle}
          onChange={(e) => updateSpanishField("tituloDetalle", e.target.value, toSpanishUpper)}
          onBlur={(e) => void requestSpellHint("field:tituloDetalle", e.target.value)}
          suggestion={spellHints["field:tituloDetalle"]}
          onApplySuggestion={(option) => applyFieldSuggestion("tituloDetalle", option, toSpanishUpper)}
          onDismissSuggestion={() => clearSpellHint("field:tituloDetalle")}
          placeholder="Ej: DETALLE DE REFORMA DEL BAÑO"
          error={errors["tituloDetalle"]}
        />

        {errors["items"] && (
          <div style={{ ...S.errorText, marginBottom: 10 }}>{errors["items"]}</div>
        )}

        <table width="100%" cellPadding="8" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid rgba(255,255,255,0.15)" }}>
              <th style={{ width: "4%", textAlign: "left", paddingLeft: 10 }}>#</th>
              <th style={{ width: "46%", textAlign: "left" }}>Concepto</th>
              <th style={{ width: "18%", textAlign: "center" }}>Cant.</th>
              <th style={{ width: "16%", textAlign: "center" }}>Precio</th>
              <th style={{ width: "12%", textAlign: "center" }}>Total</th>
              <th style={{ width: "4%", textAlign: "right", paddingRight: 10 }} />
            </tr>
          </thead>

          <tbody>
            {doc.items.map((item, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <td style={{ paddingLeft: 10, opacity: 0.9 }}>{idx + 1}</td>

                <td>
                  <input
                    style={{ ...S.input, width: "100%", padding: "8px 10px" }}
                    value={item.concepto}
                    onChange={(e) => updateSpanishItem(idx, "concepto", e.target.value, toSentenceCase)}
                    onBlur={(e) => void requestSpellHint(`item:${idx}:concepto`, e.target.value)}
                    placeholder="Descripción del concepto"
                    spellCheck="true"
                    lang="es"
                    autoCorrect="off"
                  />
                  {submitted && errors[`items.${idx}.concepto`] && (
                    <div style={{ ...S.errorText, marginTop: 4 }}>
                      {errors[`items.${idx}.concepto`]}
                    </div>
                  )}
                  {spellHints[`item:${idx}:concepto`]?.suggestions?.length > 0 && (
                    <SpellSuggestion
                      suggestion={spellHints[`item:${idx}:concepto`]}
                      onApply={(option) => applyItemSuggestion(idx, "concepto", option, toSentenceCase)}
                      onDismiss={() => clearSpellHint(`item:${idx}:concepto`)}
                    />
                  )}
                </td>

                <td>
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => updateItem(idx, "cantidad", Math.max(1, Number(item.cantidad || 1) - 1))}
                      style={{ width: 34, height: 34, borderRadius: 8 }}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={item.cantidad}
                      onChange={(e) => updateItem(idx, "cantidad", e.target.value)}
                      style={{
                        ...S.input,
                        width: 70,
                        textAlign: "center",
                        padding: "8px 10px",
                        border:
                          submitted && errors[`items.${idx}.cantidad`]
                            ? "1px solid rgba(255,107,107,0.95)"
                            : "1px solid rgba(255,255,255,0.14)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => updateItem(idx, "cantidad", Number(item.cantidad || 1) + 1)}
                      style={{ width: 34, height: 34, borderRadius: 8 }}
                    >
                      +
                    </button>
                  </div>
                </td>

                <td>
                  <input
                    style={{ ...S.input, width: "90%", textAlign: "right", padding: "8px 10px" }}
                    value={item.precio}
                    onChange={(e) => updateItem(idx, "precio", e.target.value)}
                    placeholder="0"
                  />
                </td>

                <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                  {moneyEUR(item.totalLinea)}
                </td>

                <td style={{ width: "4%", textAlign: "right", paddingRight: 10 }}>
                  {doc.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      title="Eliminar línea"
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 12,
                        background: "#e53935",
                        border: "1px solid #e53935",
                        color: "#fff",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 10px 20px rgba(0,0,0,0.28)",
                        transform: "translateX(-10px)",
                      }}
                    >
                      <i className="bi bi-trash3-fill" style={{ fontSize: 18, lineHeight: 1 }} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button onClick={addItem} style={{ marginTop: 8 }}>
          + Agregar línea
        </button>

        <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={doc.aplicaIVA}
              onChange={(e) => update("aplicaIVA", e.target.checked)}
            />
            Aplicar IVA
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            IVA %:
            <input
              style={{ ...S.input, width: 100, padding: "8px 10px" }}
              value={doc.ivaPorc}
              onChange={(e) => update("ivaPorc", e.target.value)}
              disabled={!doc.aplicaIVA}
            />
          </label>
        </div>

        <div style={totalsStyle}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Subtotal</span>
            <b>{moneyEUR(doc.subtotal)}</b>
          </div>

          {doc.aplicaIVA && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>IVA {doc.ivaPorc}%</span>
              <b>{moneyEUR(doc.ivaMonto)}</b>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: "1px solid rgba(255,255,255,0.20)",
              marginTop: 8,
              paddingTop: 8,
            }}
          >
            <span>TOTAL</span>
            <b>{moneyEUR(doc.total)}</b>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="radio"
              name="subtotalModo"
              checked={doc.subtotalModo !== "manual"}
              onChange={() => update("subtotalModo", "auto")}
            />
            Subtotal automático
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="radio"
              name="subtotalModo"
              checked={doc.subtotalModo === "manual"}
              onChange={() => update("subtotalModo", "manual")}
            />
            Subtotal manual
          </label>
        </div>

        {doc.subtotalModo === "manual" && (
          <div style={{ marginTop: 10 }}>
            <label style={S.label}>Subtotal manual (EUR)</label>
            <input
              style={{ ...S.input, textAlign: "left" }}
              value={doc.subtotalManual}
              onChange={(e) => update("subtotalManual", e.target.value)}
              placeholder="Ej: 24900"
            />
            {submitted && errors["subtotalManual"] && (
              <div style={S.errorText}>{errors["subtotalManual"]}</div>
            )}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <Field
            id="notas"
            label="Notas"
            textarea
            rows={3}
            value={doc.notas}
            onChange={(e) => updateSpanishField("notas", e.target.value)}
            onBlur={(e) => void requestSpellHint("field:notas", e.target.value)}
            suggestion={spellHints["field:notas"]}
            onApplySuggestion={(option) => applyFieldSuggestion("notas", option)}
            onDismissSuggestion={() => clearSpellHint("field:notas")}
            placeholder="Notas, garantia, condiciones, etc."
          />
        </div>
      </div>
    </div>
  );
}

const panelStyle = {
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 10,
  padding: 12,
};

const totalsStyle = {
  marginTop: 12,
  padding: 12,
  border: "1px solid rgba(255,255,255,0.10)",
  maxWidth: 360,
  marginLeft: "auto",
  borderRadius: 10,
};

const editToolbar = {
  marginTop: 12,
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const editBadge = {
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,193,7,0.35)",
  background: "rgba(255,193,7,0.12)",
  color: "#fde68a",
  fontSize: 13,
  fontWeight: 800,
};

const cancelEditButton = {
  padding: "9px 13px",
  borderRadius: 12,
  border: "1px solid rgba(248,113,113,0.40)",
  background: "rgba(248,113,113,0.14)",
  color: "#fecaca",
  fontWeight: 800,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
};

const spellBox = {
  marginTop: 6,
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  fontSize: 12,
};

const spellLabel = {
  color: "rgba(255,255,255,0.62)",
};

const spellOption = {
  padding: "4px 8px",
  borderRadius: 8,
  border: "1px solid rgba(96,165,250,0.45)",
  background: "rgba(96,165,250,0.16)",
  color: "#bfdbfe",
  fontWeight: 800,
  cursor: "pointer",
};

const spellDismiss = {
  padding: "4px 8px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)",
  color: "rgba(255,255,255,0.68)",
  cursor: "pointer",
};

const fixedActions = {
  position: "fixed",
  right: 28,
  bottom: 28,
  zIndex: 9999,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const actionButton = {
  background: "linear-gradient(180deg, rgba(34,197,94,0.95), rgba(22,163,74,0.95))",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 14,
  padding: "14px 18px",
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 18px 45px rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  gap: 10,
};
