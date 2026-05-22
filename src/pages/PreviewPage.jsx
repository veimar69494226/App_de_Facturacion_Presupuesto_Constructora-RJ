// src/pages/PreviewPage.jsx
// Preview unificado para FACTURA y PRESUPUESTO.
// Recibe prop `tipo` ("FACTURA" | "PRESUPUESTO") desde AppShell.
// Al generar el PDF final también guarda el doc en el historial.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { pdf, PDFDownloadLink } from "@react-pdf/renderer";
import InvoicePdf from "../pdf/InvoicePdf";
import PresupuestoPdf from "../pdf/PresupuestoPdf";
import { upsertDoc } from "../storage/docStore";

const DRAFT_KEY_F = "rj_factura_draft_v1";
const DRAFT_KEY_P = "rj_presupuesto_draft_v1";
const DRAFT_KEY_EMISION = "rj_emision_draft_v1";
const draftKey = (tipo) => (tipo === "FACTURA" ? DRAFT_KEY_F : DRAFT_KEY_P);

function hasElectronApi() {
  return typeof window !== "undefined" && !!window.rjApi;
}
function canExport() {
  return hasElectronApi() && typeof window.rjApi.exportPdf === "function";
}
function canPrintPdfBytes() {
  return hasElectronApi() && typeof window.rjApi.printPdfBytes === "function";
}

function PdfComponent({ tipo, doc }) {
  return tipo === "FACTURA" ? <InvoicePdf doc={doc} /> : <PresupuestoPdf doc={doc} />;
}

export default function PreviewPage({ tipo }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [doc, setDoc] = useState(null);
  const [pdfBaseUrl, setPdfBaseUrl] = useState("");
  const lastUrlRef = useRef("");

  const formRoute = "/emision";
  const docFromState = location.state?.doc || null;

  const saveDocSilently = useCallback(async (nextDoc) => {
    try {
      await upsertDoc(nextDoc);
    } catch (error) {
      console.error("No se pudo guardar el documento:", error);
    }
  }, []);

  // ── Cargar doc: state.doc → sessionStorage ────────────────
  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      const fromState = docFromState;

    if (fromState) {
      if (!cancelled) setDoc(fromState);
      try {
        sessionStorage.setItem(DRAFT_KEY_EMISION, JSON.stringify(fromState));
        sessionStorage.setItem(draftKey(tipo), JSON.stringify(fromState));
      } catch {
        // Preview can still render if the draft cache is not available.
      }
      void saveDocSilently(fromState);
      return;
    }

    try {
      const candidates = [
        sessionStorage.getItem(DRAFT_KEY_EMISION),
        sessionStorage.getItem(draftKey(tipo)),
      ].filter(Boolean);

      for (const raw of candidates) {
        const parsed = JSON.parse(raw);
        if (parsed?.tipo !== tipo) continue;
        if (!cancelled) setDoc(parsed);
        void saveDocSilently(parsed);
        return;
      }
    } catch {
      // Ignore broken cached drafts and show the empty-preview state.
    }
    });

    return () => {
      cancelled = true;
    };
  }, [docFromState, location.key, saveDocSilently, tipo]);

  // ── Generar blob para iframe ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function buildPreview() {
      if (!doc) return;
      const blob = await pdf(<PdfComponent tipo={tipo} doc={doc} />).toBlob();
      const url = URL.createObjectURL(blob);
      if (cancelled) { URL.revokeObjectURL(url); return; }
      if (lastUrlRef.current) {
        try {
          URL.revokeObjectURL(lastUrlRef.current);
        } catch {
          // Nothing else to do if the browser already released it.
        }
      }
      lastUrlRef.current = url;
      setPdfBaseUrl(url);
    }
    buildPreview();
    return () => { cancelled = true; };
  }, [doc, tipo]);

  // ── Cleanup ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (lastUrlRef.current) {
        try {
          URL.revokeObjectURL(lastUrlRef.current);
        } catch {
          // Nothing else to do if the browser already released it.
        }
      }
    };
  }, []);

  const fileName = useMemo(() => {
    if (!doc?.numero) return `${tipo}.pdf`;
    return `${tipo}_${doc.numero}.pdf`;
  }, [doc, tipo]);

  const pdfDisplayUrl = useMemo(
    () => (pdfBaseUrl ? `${pdfBaseUrl}#zoom=page-width` : ""),
    [pdfBaseUrl]
  );

  // ── Sin doc ───────────────────────────────────────────────
  if (!doc) {
    return (
      <div style={{ padding: 24 }}>
        <p>No hay datos para previsualizar.</p>
        <button onClick={() => navigate(formRoute)}>Volver</button>
      </div>
    );
  }

  // ── Acciones ──────────────────────────────────────────────
  async function getPdfBytes() {
    const blob = await pdf(<PdfComponent tipo={tipo} doc={doc} />).toBlob();
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function exportar() {
    if (canExport()) {
      const bytes = await getPdfBytes();
      const res = await window.rjApi.exportPdf({
        suggestedName: fileName,
        bytes: Array.from(bytes),
      });
      if (res?.canceled) return;
      if (!res?.ok) alert("No se pudo exportar: " + (res?.error || "error"));
      else alert("Exportado en: " + res.path);
      return;
    }
    alert("Estás en navegador: usa el botón Exportar PDF (descarga).");
  }

  async function imprimir() {
    if (!hasElectronApi()) {
      const w = window.open(pdfDisplayUrl || pdfBaseUrl, "_blank");
      setTimeout(() => {
        try {
          w?.print();
        } catch {
          // Browser print can fail if the preview window was blocked.
        }
      }, 700);
      return;
    }
    if (canPrintPdfBytes()) {
      const bytes = await getPdfBytes();
      const res = await window.rjApi.printPdfBytes({
        title: fileName,
        bytes: Array.from(bytes),
      });
      if (!res?.ok) alert("No se pudo imprimir: " + (res?.error || "error"));
      return;
    }
    alert("Falta implementar rjApi.printPdfBytes en preload/main.");
  }

  async function nuevoDoc() {
    try {
      await upsertDoc(doc);
    } catch (error) {
      alert("No se pudo guardar el documento antes de crear uno nuevo:\n" + (error?.message || error));
      return;
    }

    sessionStorage.removeItem(DRAFT_KEY_EMISION);
    sessionStorage.removeItem(DRAFT_KEY_F);
    sessionStorage.removeItem(DRAFT_KEY_P);
    navigate(formRoute, { replace: true, state: { nuevoDocumento: Date.now() } });
  }

  function volverAlFormulario() {
    navigate(formRoute);
  }

  function irAEditar() {
    // Navega al formulario con el doc actual para editar
    navigate(formRoute, { state: { docEditar: doc } });
  }

  // ─── UI ──────────────────────────────────────────────────
  const labelNuevo = "Nuevo documento";

  return (
    <div style={wrap()}>
      {/* Barra de botones */}
      <div style={toolbar()}>
        <button onClick={volverAlFormulario} style={btn()}>
          <i className="bi bi-arrow-left" style={{ marginRight: 8 }} />
          Volver
        </button>

        <button onClick={irAEditar} style={btn({ border: "1px solid rgba(255,193,7,0.45)", background: "rgba(255,193,7,0.13)" })}>
          <i className="bi bi-pencil-square" style={{ marginRight: 8 }} />
          Editar
        </button>

        {canExport() ? (
          <button onClick={exportar} style={btn()}>
            <i className="bi bi-file-earmark-pdf" style={{ marginRight: 8 }} />
            Exportar PDF
          </button>
        ) : (
          <PDFDownloadLink
            document={<PdfComponent tipo={tipo} doc={doc} />}
            fileName={fileName}
            style={{ ...btn(), textDecoration: "none" }}
          >
            <i className="bi bi-file-earmark-pdf" style={{ marginRight: 8 }} />
            Exportar PDF
          </PDFDownloadLink>
        )}

        <button onClick={imprimir} style={btn()}>
          <i className="bi bi-printer" style={{ marginRight: 8 }} />
          Imprimir
        </button>

        <button
          onClick={nuevoDoc}
          style={btn({ border: "1px solid rgba(46,204,113,0.45)", background: "rgba(46,204,113,0.18)" })}
        >
          <i className="bi bi-plus-circle" style={{ marginRight: 8 }} />
          {labelNuevo}
        </button>
      </div>

      {/* Visor */}
      <div style={viewerOuter()}>
        <div style={viewerCard()}>
          <div style={viewerFrame()}>
            {pdfDisplayUrl ? (
              <iframe
                title="preview"
                src={pdfDisplayUrl}
                style={{ width: "100%", height: "100%", border: 0, display: "block" }}
              />
            ) : (
              <div style={{ padding: 24, color: "#111" }}>
                Generando previsualización…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function wrap() {
  return { width: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 12, flex: 1, minWidth: 0, minHeight: 0 };
}
function toolbar() {
  return { display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", alignItems: "center", marginBottom: 2 };
}
function viewerOuter() {
  return { width: "100%", minWidth: 0, flex: 1, minHeight: 0 };
}
function viewerCard() {
  return { width: "100%", borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(0,0,0,0.18)", padding: 12, boxSizing: "border-box" };
}
function viewerFrame() {
  return { height: "78vh", background: "#fff", borderRadius: 12, overflow: "hidden" };
}
function btn(extra = {}) {
  return {
    padding: "10px 14px", borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff", fontWeight: 800, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 6,
    textDecoration: "none",
    ...extra,
  };
}
