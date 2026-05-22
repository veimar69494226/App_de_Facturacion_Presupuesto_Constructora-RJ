// src/pages/HistorialPage.jsx
// Listado unificado de facturas y presupuestos guardados.
// Permite buscar, abrir en preview (regenera PDF) o editar (carga en formulario).

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { loadDocs, deleteDoc } from "../storage/docStore";
import { moneyEUR } from "../utils/money";

// ─── Estilos base ─────────────────────────────────────────────
const S = {
  input: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.20)",
    color: "inherit",
    outline: "none",
    fontSize: 14,
  },
  badge: (tipo) => ({
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.5,
    background:
      tipo === "FACTURA"
        ? "rgba(59,130,246,0.25)"
        : "rgba(168,85,247,0.25)",
    border:
      tipo === "FACTURA"
        ? "1px solid rgba(59,130,246,0.45)"
        : "1px solid rgba(168,85,247,0.45)",
    color: tipo === "FACTURA" ? "#93c5fd" : "#d8b4fe",
  }),
  card: {
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.09)",
    background: "rgba(255,255,255,0.03)",
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    gap: 14,
    transition: "background 0.15s",
  },
  actionBtn: (color) => ({
    padding: "7px 13px",
    borderRadius: 9,
    border: `1px solid ${color}33`,
    background: `${color}15`,
    color: color,
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 13,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    whiteSpace: "nowrap",
  }),
};

// ─── Chips de filtro ──────────────────────────────────────────
function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 999,
        border: active ? "1px solid rgba(255,255,255,0.30)" : "1px solid rgba(255,255,255,0.12)",
        background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
        color: active ? "#fff" : "rgba(255,255,255,0.6)",
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        fontSize: 13,
      }}
    >
      {label}
    </button>
  );
}

// ─── Tarjeta de documento ─────────────────────────────────────
function DocCard({ doc, onPreview, onEditar, onEliminar }) {
  const [hover, setHover] = useState(false);
  const fecha = doc.fecha
    ? new Date(doc.fecha + "T00:00:00").toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

  return (
    <div
      style={{
        ...S.card,
        background: hover ? "rgba(255,255,255,0.06)" : S.card.background,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Tipo badge */}
      <div style={{ flexShrink: 0 }}>
        <span style={S.badge(doc.tipo)}>{doc.tipo === "FACTURA" ? "FAC" : "PRS"}</span>
      </div>

      {/* Info principal */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: 0.3 }}>{doc.numero}</span>
          <span style={{ fontSize: 12, opacity: 0.55 }}>{fecha}</span>
        </div>

        <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {doc.cliente?.nombre
            ? <><i className="bi bi-person" style={{ marginRight: 4 }} />{doc.cliente.nombre}</>
            : <span style={{ opacity: 0.4 }}>Sin cliente</span>}
        </div>

        {doc.tituloDetalle && (
          <div style={{ fontSize: 12, opacity: 0.5, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {doc.tituloDetalle}
          </div>
        )}
      </div>

      {/* Total */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>{moneyEUR(doc.total)}</div>
        {doc.aplicaIVA && (
          <div style={{ fontSize: 11, opacity: 0.5 }}>IVA {doc.ivaPorc}%</div>
        )}
      </div>

      {/* Acciones */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={() => onPreview(doc)} style={S.actionBtn("#93c5fd")} title="Ver PDF">
          <i className="bi bi-eye" />
          <span style={{ display: "none" }}>Ver</span>
        </button>

        <button onClick={() => onEditar(doc)} style={S.actionBtn("#86efac")} title="Editar">
          <i className="bi bi-pencil-square" />
          <span style={{ display: "none" }}>Editar</span>
        </button>

        <button
          onClick={() => {
            if (window.confirm(`¿Eliminar ${doc.tipo} ${doc.numero}? Esta acción no se puede deshacer.`)) {
              onEliminar(doc.id);
            }
          }}
          style={S.actionBtn("#f87171")}
          title="Eliminar"
        >
          <i className="bi bi-trash3" />
        </button>
      </div>
    </div>
  );
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────
export default function HistorialPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("TODOS"); // "TODOS" | "FACTURA" | "PRESUPUESTO"

  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(async () => {
      if (!cancelled) {
        setLoading(true);
        setLoadError("");
      }

      try {
        const nextDocs = await loadDocs();
        if (!cancelled) setDocs(nextDocs);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error?.message || String(error));
          setDocs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [location.key]);

  // ── Filtrado ────────────────────────────────────────────────
  const docsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return docs.filter((d) => {
      const porTipo = filtroTipo === "TODOS" || d.tipo === filtroTipo;
      if (!porTipo) return false;
      if (!q) return true;
      return (
        (d.numero || "").toLowerCase().includes(q) ||
        (d.cliente?.nombre || "").toLowerCase().includes(q) ||
        (d.tituloDetalle || "").toLowerCase().includes(q) ||
        (d.fecha || "").includes(q)
      );
    });
  }, [docs, busqueda, filtroTipo]);

  // ── Handlers ────────────────────────────────────────────────
  const handlePreview = useCallback((doc) => {
    const route = doc.tipo === "FACTURA" ? "/facturas/preview" : "/presupuestos/preview";
    navigate(route, { state: { doc } });
  }, [navigate]);

  const handleEditar = useCallback((doc) => {
    navigate("/emision", { state: { docEditar: doc } });
  }, [navigate]);

  const handleEliminar = useCallback(async (id) => {
    try {
      const nextDocs = await deleteDoc(id);
      setDocs(nextDocs);
    } catch (error) {
      alert("No se pudo eliminar el documento:\n" + (error?.message || error));
    }
  }, []);

  // ── Contadores para chips ────────────────────────────────────
  const totalF = docs.filter((d) => d.tipo === "FACTURA").length;
  const totalP = docs.filter((d) => d.tipo === "PRESUPUESTO").length;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 16 }}>
      <h2 style={{ margin: 0 }}>HISTORIAL</h2>
      <p style={{ margin: "4px 0 16px", opacity: 0.55, fontSize: 13 }}>
        {loading
          ? "Cargando historial..."
          : `${docs.length} documento${docs.length !== 1 ? "s" : ""} guardado${docs.length !== 1 ? "s" : ""}`}
      </p>

      {loadError && (
        <div style={{ marginBottom: 12, color: "#fecaca", fontSize: 13 }}>
          No se pudo cargar el historial: {loadError}
        </div>
      )}

      {/* Búsqueda + filtros */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <i
            className="bi bi-search"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.4, fontSize: 14 }}
          />
          <input
            style={{ ...S.input, width: "100%", paddingLeft: 34, boxSizing: "border-box" }}
            placeholder="Buscar por número, cliente, título o fecha…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            spellCheck={false}
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda("")}
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16 }}
            >×</button>
          )}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <FilterChip label={`Todos (${docs.length})`} active={filtroTipo === "TODOS"} onClick={() => setFiltroTipo("TODOS")} />
          <FilterChip label={`Facturas (${totalF})`} active={filtroTipo === "FACTURA"} onClick={() => setFiltroTipo("FACTURA")} />
          <FilterChip label={`Presupuestos (${totalP})`} active={filtroTipo === "PRESUPUESTO"} onClick={() => setFiltroTipo("PRESUPUESTO")} />
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "48px 0", opacity: 0.45 }}>
          Cargando documentos...
        </div>
      ) : docsFiltrados.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", opacity: 0.4 }}>
          {docs.length === 0 ? (
            <>
              <i className="bi bi-inbox" style={{ fontSize: 40, display: "block", marginBottom: 12 }} />
              <p style={{ margin: 0 }}>Aún no hay documentos guardados.</p>
              <p style={{ margin: "6px 0 0", fontSize: 13 }}>
                Crea tu primera factura o presupuesto y aparecerá aquí.
              </p>
            </>
          ) : (
            <>
              <i className="bi bi-search" style={{ fontSize: 32, display: "block", marginBottom: 10 }} />
              <p style={{ margin: 0 }}>Sin resultados para «{busqueda}»</p>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {docsFiltrados.map((doc) => (
            <DocCard
              key={doc.id}
              doc={doc}
              onPreview={handlePreview}
              onEditar={handleEditar}
              onEliminar={handleEliminar}
            />
          ))}
        </div>
      )}
    </div>
  );
}
