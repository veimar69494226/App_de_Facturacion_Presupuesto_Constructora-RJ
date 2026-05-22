import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { moneyEUR, toNumber } from "../utils/money";
import { peekNextFacturaNumber, nextFacturaNumber } from "../storage/docStore";

const DRAFT_KEY = "rj_factura_draft_v1";

function emptyFactura() {
  const fecha = new Date().toISOString().slice(0, 10);
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    tipo: "FACTURA",
    fecha,
    numero: peekNextFacturaNumber("RJ"), // preview
    numeroAsignado: false,

    empresa: {
      nombreComercial: "CONSTRUCCIONES Y REFORMAS R.J.",
      titular: "Ramiro Jimenez Vargas",
      telefono: "626120538",
      email: "ramirojimenezvargas26@gmail.com",
      direccion: "Murcia – Mazarrón",
      nif: "61367222W",
    },

    cliente: { nombre: "", nif: "", direccion: "" },

    tituloDetalle: "",
    items: [{ concepto: "", cantidad: 1, precio: 0, totalLinea: 0 }],

    aplicaIVA: true,
    ivaPorc: 21,

    notas:
      "Precios incluyen garantía.\nEste documento tendrá validez de 30 días a partir de su emisión, salvo confirmación expresa de su aprobación dentro de dicho plazo.",
    
    subtotalModo: "auto",   // "auto" 
    subtotalManual: "",     // string (para input)
    subtotal: 0,
    ivaMonto: 0,
    total: 0,
  };
}


function compute(doc) {
  const items = (doc.items || []).map((it) => {
    const cantidad = Math.max(1, toNumber(it.cantidad));
    const precio = toNumber(it.precio);
    const totalLinea = cantidad * precio;
    return { ...it, cantidad, precio, totalLinea };
  });

  // subtotal automático tradicional calculo
  const subtotalAuto = items.reduce((acc, it) => acc + (it.totalLinea || 0), 0);

  const ivaPorc = toNumber(doc.ivaPorc);

  //  decidir subtotal según modo
  const modo = doc.subtotalModo === "manual" ? "manual" : "auto";
  const subtotalBase =
    modo === "manual" && toNumber(doc.subtotalManual) > 0
      ? toNumber(doc.subtotalManual)
      : subtotalAuto;

  //  IVA y total SIEMPRE se calculan desde subtotalBase
  const ivaMonto = doc.aplicaIVA ? subtotalBase * (ivaPorc / 100) : 0;
  const total = subtotalBase + ivaMonto;

  return {
    ...doc,
    items,
    ivaPorc,
    subtotal: subtotalBase,
    ivaMonto,
    total,
    subtotalModo: modo,
  };
}
// UI helpers (labels y validaciones errores) 
const styles = {
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

function isEmailLike(v) {
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
}
function isPhoneLike(v) {
  if (!v) return true;
  const s = String(v).replace(/\s/g, "");
  return /^[0-9+()-]{6,20}$/.test(s);
}

/**
 * Solo la PRIMERA letra en mayúscula.
 * - Mantiene el resto tal cual lo escribió el usuario.
 */
function toSentenceCase(value) {
  if (value == null) return "";
  // normaliza espacios 
  const s = String(value).replace(/\s+/g, " ");

  // conserva espacios iniciales mientras escribe (mejor UX)
  const leadingSpaces = s.match(/^\s*/)?.[0] ?? "";
  const core = s.slice(leadingSpaces.length);

  if (!core) return s;

  // encuentra la primera letra (ignora signos como "(", "¿", etc.)
  const i = core.search(/\p{L}/u);
  if (i === -1) return s;

  return (
    leadingSpaces +
    core.slice(0, i) +
    core[i].toUpperCase() +
    core.slice(i + 1)
  );
}

function Field({ id, label, required, error, style, inputStyle, ...props }) {
  return (
    <div style={{ ...styles.field, ...style }}>
      <label htmlFor={id} style={styles.label}>
        {label}
        {required && <span style={styles.req}>*</span>}
      </label>
      <input
        id={id}
        style={{
          ...styles.input,
          ...(inputStyle || {}),
          border: error
            ? "1px solid rgba(255,107,107,0.95)"
            : styles.input.border,
          boxShadow: error ? "0 0 0 3px rgba(255,107,107,0.15)" : "none",
        }}
        {...props}
      />
      {error && <div style={styles.errorText}>{error}</div>}
    </div>
  );
}

//  Validación por campos 
function validateFactura(doc) {
  const errors = {};
  const add = (path, msg) => {
    if (!errors[path]) errors[path] = msg;
  };

  // Cliente
  if (!doc.cliente?.nombre?.trim())
    add("cliente.nombre", "El nombre del cliente es obligatorio.");

  // Cliente NIF/DNI (si escribe algo, validar longitud mínima)
  if (doc.cliente?.nif && String(doc.cliente.nif).trim().length < 6) {
    add("cliente.nif", "NIF/DNI parece muy corto.");
  }

  // Empresa
  if (!doc.empresa?.nombreComercial?.trim())
    add("empresa.nombreComercial", "Nombre empresa es obligatorio.");
  if (doc.empresa?.email && !isEmailLike(doc.empresa.email))
    add("empresa.email", "Email no válido.");
  if (doc.empresa?.telefono && !isPhoneLike(doc.empresa.telefono))
    add("empresa.telefono", "Teléfono no válido.");
 //  Título del trabajo (OBLIGATORIO)
  if (!doc.tituloDetalle?.trim()) {
    add("tituloDetalle", "El título del trabajo es obligatorio.");
  }
  // Detalle: al menos 1 concepto
  const items = doc.items || [];
  const hasConcept = items.some((x) => (x.concepto || "").trim().length > 0);
  if (!hasConcept) add("items", "Debes ingresar al menos 1 concepto en el detalle.");

  items.forEach((it, idx) => {
    const concept = (it.concepto || "").trim();
    const precio = toNumber(it.precio);
    const cantidad = toNumber(it.cantidad);

    // NO se permiten filas con concepto vacío (si existe la fila)
    if (!concept) {
      add(`items.${idx}.concepto`, "No puedes dejar una línea vacía. Llena el concepto o elimina la fila.");
      return; // no seguimos validando precio/cantidad de esa fila vacía
    }

    

    //  Cantidad mínima
    if (cantidad < 1) {
      add(`items.${idx}.cantidad`, "Cantidad mínima es 1.");
    }
  });
 const modoManual = doc.subtotalModo === "manual";
//validacion subtotal manual
if (modoManual) {
  const s = toNumber(doc.subtotalManual);
  if (!(Number.isFinite(s) && s > 0)) {
    add("subtotalManual", "Debes ingresar un subtotal manual mayor a 0.");
  }
} 

  return errors;
}

function loadDraftOrEmpty() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return compute(emptyFactura());

    const parsed = JSON.parse(raw);

    if (!parsed.numeroAsignado) parsed.numero = peekNextFacturaNumber("RJ");

    if (!parsed.items || !parsed.items.length) {
      parsed.items = [{ concepto: "", cantidad: 1, precio: 0, totalLinea: 0 }];
    }

    return compute(parsed);
  } catch {
    return compute(emptyFactura());
  }
}

export default function FacturasPage() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(() => loadDraftOrEmpty());

  //  SOLO mostrar errores cuando el usuario presione "Facturar"
  const [submitted, setSubmitted] = useState(false);

  // Guardar errores en estado (NO recalcular en cada tecla)
  const [errors, setErrors] = useState({});

  // Guarda borrador en sessionStorage cada vez que cambia
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(current));
    } catch {}
  }, [current]);

  const doc = useMemo(() => compute(current), [current]);

  //  update liviano: clona SOLO el camino (no todo el doc)
  function update(path, value) {
    setCurrent((d) => {
      const keys = path.split(".");
      const copy = { ...d };
      let ref = copy;

      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        ref[k] = { ...ref[k] };
        ref = ref[k];
      }

      ref[keys[keys.length - 1]] = value;
      return copy;
    });
  }

  //  updateItem liviano: clona SOLO items y la fila editada
  function updateItem(idx, field, value) {
    setCurrent((d) => {
      const items = d.items.slice();
      items[idx] = { ...items[idx], [field]: value };
      return { ...d, items };
    });
  }

  function addItem() {
    setCurrent((d) => ({
      ...d,
      items: [...d.items, { concepto: "", cantidad: 1, precio: 0, totalLinea: 0 }],
    }));
  }

  function removeItem(idx) {
    setCurrent((d) => ({
      ...d,
      items: d.items.filter((_, i) => i !== idx),
    }));
  }

  function ensureNumeroReal(d) {
    if (d.numeroAsignado) return d;
    const real = nextFacturaNumber("RJ");
    return { ...d, numero: real, numeroAsignado: true };
  }

  function irAPrevisualizar() {
    setSubmitted(true);

    const computedNow = compute(current);
    const errs = validateFactura(computedNow);

    //  congelar/actualizar errores SOLO al presionar Facturar
    setErrors(errs);

    if (Object.keys(errs).length) {
      alert(" Corrige esto:\n\n- " + Object.values(errs).join("\n- "));
      return;
    }

    const withReal = ensureNumeroReal(computedNow);
    const finalDoc = compute(withReal);

    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(finalDoc));
    } catch {}

    setCurrent(finalDoc);
    navigate("/facturas/preview", { state: { doc: finalDoc } });
  }

  const hasErrors = submitted && Object.keys(errors).length > 0;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h2 style={{ margin: 0 }}>FACTURAS</h2>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginTop: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.85 }}>Nº Factura</span>
          <input value={doc.numero} readOnly style={{ ...styles.input, width: 200 }} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.85 }}>Fecha</span>
        <input
                     type="date"
                   className="dateInput"
                 value={doc.fecha || new Date().toISOString().slice(0, 10)}
                 onChange={(e) => update("fecha", e.target.value)}
                   style={{ ...styles.input, width: 200 }}
                  />

        </label>
      </div>

      {/* Botón verde abajo derecha */}
      <button
        onClick={irAPrevisualizar}
        style={{
          position: "fixed",
          right: 28,
          bottom: 28,
          zIndex: 9999,
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
          opacity: hasErrors ? 0.95 : 1,
        }}
        title={hasErrors ? "Hay campos obligatorios o errores por corregir" : "Generar y previsualizar factura"}
      >
        <i className="bi bi-check2-circle" style={{ fontSize: 18 }} />
        Facturar
      </button>

      <hr style={{ margin: "14px 0" }} />

      {/* Empresa + Cliente */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* EMPRESA */}
        <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: 12 }}>
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
          />

          <div style={styles.row2}>
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
              onChange={(e) => update("empresa.direccion", e.target.value)}
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

        {/* CLIENTE */}
        <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Cliente</h3>

          <Field
            id="cliNombre"
            label="Nombre completo / Razón social"
            required
            value={doc.cliente.nombre}
            onChange={(e) => update("cliente.nombre", e.target.value)}
            error={errors["cliente.nombre"]}
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
            onChange={(e) => update("cliente.direccion", e.target.value)}
          />
        </div>
      </div>

      {/* Detalle */}
      <div style={{ marginTop: 12, border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Detalle</h3>

           <Field
             id="tituloDetalle"
             label="Título del trabajo"
             required
               value={doc.tituloDetalle}
                onChange={(e) => update("tituloDetalle", e.target.value.toUpperCase())}
                      placeholder="Ej: DETALLE DE REFORMA DEL BAÑO"
                error={errors["tituloDetalle"]}
                    />


        {errors["items"] && <div style={{ ...styles.errorText, marginBottom: 10 }}>{errors["items"]}</div>}

        <table width="100%" cellPadding="8" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid rgba(255,255,255,0.15)" }}>
              <th style={{ width: "4%", textAlign: "left", paddingLeft: 10 }}>#</th>
              <th style={{ width: "46%", textAlign: "left" }}>Concepto</th>
              <th style={{ width: "18%", textAlign: "center" }}>Cant.</th>
              <th style={{ width: "16%", textAlign: "center" }}>Precio</th>
              <th style={{ width: "12%", textAlign: "center" }}>Total</th>
              <th style={{ width: "4%", textAlign: "right", paddingRight: 10 }}></th>
            </tr>
          </thead>

          <tbody>
            {doc.items.map((it, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <td style={{ paddingLeft: 10, opacity: 0.9 }}>{idx + 1}</td>

                <td>
                  <input
                    style={{
                      ...styles.input,
                      width: "100%",
                      padding: "8px 10px",
                    }}
                    value={it.concepto}
                    // ✅ aquí: solo primera letra en mayúscula (no cada palabra)
                    onChange={(e) => updateItem(idx, "concepto", toSentenceCase(e.target.value))}
                    placeholder="Descripción del concepto"
                  />
                </td>

                <td>
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => updateItem(idx, "cantidad", Math.max(1, Number(it.cantidad || 1) - 1))}
                      style={{ width: 34, height: 34, borderRadius: 8 }}
                    >
                      −
                    </button>

                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={it.cantidad}
                      onChange={(e) => updateItem(idx, "cantidad", e.target.value)}
                      style={{
                        ...styles.input,
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
                      onClick={() => updateItem(idx, "cantidad", Number(it.cantidad || 1) + 1)}
                      style={{ width: 34, height: 34, borderRadius: 8 }}
                    >
                      +
                    </button>
                  </div>
                </td>

                <td>
                  <input
                    style={{
                      ...styles.input,
                      width: "90%",
                      textAlign: "right",
                      padding: "8px 10px",
                      border:
                        submitted && errors[`items.${idx}.precio`]
                          ? "1px solid rgba(255,107,107,0.95)"
                          : "1px solid rgba(255,255,255,0.14)",
                    }}
                    value={it.precio}
                    onChange={(e) => updateItem(idx, "precio", e.target.value)}
                    placeholder="0"
                  />

                  {submitted && errors[`items.${idx}.precio`] && (
                    <div style={{ ...styles.errorText, marginTop: 6 }}>{errors[`items.${idx}.precio`]}</div>
                  )}
                </td>

                <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>{moneyEUR(it.totalLinea)}</td>

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
            <input type="checkbox" checked={doc.aplicaIVA} onChange={(e) => update("aplicaIVA", e.target.checked)} />
            Aplicar IVA
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            IVA %:
            <input
              style={{ ...styles.input, width: 100, padding: "8px 10px" }}
              value={doc.ivaPorc}
              onChange={(e) => update("ivaPorc", e.target.value)}
              disabled={!doc.aplicaIVA}
            />
          </label>
        </div>

        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid rgba(255,255,255,0.10)",
            maxWidth: 360,
            marginLeft: "auto",
            borderRadius: 10,
          }}
        >
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
    <div style={{ marginBottom: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
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
       <div style={{ marginBottom: 10 }}>
        <label style={styles.label}>Subtotal manual (€)</label>
        <input
         style={{ ...styles.input, textAlign: "left" }}
         value={doc.subtotalManual}
         onChange={(e) => update("subtotalManual", e.target.value)}
         placeholder="Ej: 24900"
         />
         {submitted && errors["subtotalManual"] && (
          <div style={styles.errorText}>{errors["subtotalManual"]}</div>
          )}
        </div>
       )}
        <div style={{ marginTop: 12 }}>
          <label style={styles.label}>Notas</label>
          <textarea
            style={{ ...styles.input, minHeight: 90, resize: "vertical" }}
            rows={3}
            value={doc.notas}
            onChange={(e) => update("notas", e.target.value)}
            placeholder="Notas (garantía, condiciones, etc.)"
          />
        </div>
      </div>
    </div>
  );
}
