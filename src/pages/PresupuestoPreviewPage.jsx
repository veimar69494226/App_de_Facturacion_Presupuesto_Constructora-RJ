import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { pdf, PDFDownloadLink } from "@react-pdf/renderer";
import PresupuestoPdf from "../pdf/PresupuestoPdf";

const DRAFT_KEY = "rj_presupuesto_draft_v1";

function hasElectronApi() {
  return typeof window !== "undefined" && window.rjApi;
}
function canExport() {
  return hasElectronApi() && typeof window.rjApi.exportPdf === "function";
}
function canPrintPdfBytes() {
  return hasElectronApi() && typeof window.rjApi.printPdfBytes === "function";
}

export default function PresupuestoPreviewPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [doc, setDoc] = useState(null);

  const [pdfBaseUrl, setPdfBaseUrl] = useState("");
  const lastUrlRef = useRef("");

  // Cargar doc: state.doc -> sessionStorage
  useEffect(() => {
    const fromState = location.state?.doc || null;

    if (fromState) {
      setDoc(fromState);
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(fromState));
      } catch {}
      return;
    }

    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      setDoc(JSON.parse(raw));
    } catch {}
  }, [location.key]);

  // Persistir draft si doc cambia
  useEffect(() => {
    if (!doc) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(doc));
    } catch {}
  }, [doc]);

  // Generar preview (blob url)
  useEffect(() => {
    let cancelled = false;

    async function buildPreview() {
      if (!doc) return;

      const blob = await pdf(<PresupuestoPdf doc={doc} />).toBlob();
      const url = URL.createObjectURL(blob);

      if (cancelled) {
        URL.revokeObjectURL(url);
        return;
      }

      if (lastUrlRef.current) {
        try {
          URL.revokeObjectURL(lastUrlRef.current);
        } catch {}
      }

      lastUrlRef.current = url;
      setPdfBaseUrl(url);
    }

    buildPreview();

    return () => {
      cancelled = true;
    };
  }, [doc]);

  // Cleanup final
  useEffect(() => {
    return () => {
      if (lastUrlRef.current) {
        try {
          URL.revokeObjectURL(lastUrlRef.current);
        } catch {}
      }
    };
  }, []);

  const fileName = useMemo(
    () => (doc?.numero ? `PRESUPUESTO_${doc.numero}.pdf` : "PRESUPUESTO.pdf"),
    [doc]
  );

  const pdfDisplayUrl = useMemo(() => {
    return pdfBaseUrl ? `${pdfBaseUrl}#zoom=page-width` : "";
  }, [pdfBaseUrl]);

  if (!doc) {
    return (
      <div style={{ padding: 24 }}>
        <p>No hay datos para previsualizar.</p>
        <button onClick={() => navigate("/presupuestos")}>Volver</button>
      </div>
    );
  }

  async function getPdfBytes() {
    const blob = await pdf(<PresupuestoPdf doc={doc} />).toBlob();
    const ab = await blob.arrayBuffer();
    return new Uint8Array(ab);
  }

  async function exportarElegirRuta() {
    if (canExport()) {
      const bytes = await getPdfBytes();
      const res = await window.rjApi.exportPdf({
        suggestedName: fileName,
        bytes: Array.from(bytes),
      });
      if (res?.canceled) return;
      if (!res?.ok) alert(" No se pudo exportar: " + (res?.error || "error"));
      else alert(" Exportado en: " + res.path);
      return;
    }

    alert("Estás en navegador: usa Exportar PDF (descarga).");
  }

  async function imprimir() {
    // Navegador
    if (!hasElectronApi()) {
      if (pdfBaseUrl) {
        const w = window.open(pdfDisplayUrl || pdfBaseUrl, "_blank");
        setTimeout(() => {
          try {
            w?.print();
          } catch {}
        }, 700);
        return;
      }
      window.print();
      return;
    }

    // Electron: imprimir bytes (main process)
    if (canPrintPdfBytes()) {
      const bytes = await getPdfBytes();
      const res = await window.rjApi.printPdfBytes({
        title: fileName,
        bytes: Array.from(bytes),
      });
      if (!res?.ok) alert("❌ No se pudo imprimir: " + (res?.error || "error"));
      return;
    }

    alert("Falta implementar rjApi.printPdfBytes en preload/main.");
  }

  function nuevoPresupuesto() {
    sessionStorage.removeItem(DRAFT_KEY);
    navigate("/presupuestos");
  }

  function volverSinPerderDatos() {
    navigate("/presupuestos");
  }

  return (
    <div style={wrap()}>
      {/* Barra botones */}
      <div style={toolbar()}>
        <button onClick={volverSinPerderDatos} style={btn()}>
          <i className="bi bi-arrow-left" style={{ marginRight: 8 }} />
          Volver
        </button>

        {canExport() ? (
          <button onClick={exportarElegirRuta} style={btn()}>
            <i className="bi bi-file-earmark-pdf" style={{ marginRight: 8 }} />
            Exportar PDF
          </button>
        ) : (
          <PDFDownloadLink
            document={<PresupuestoPdf doc={doc} />}
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
          onClick={nuevoPresupuesto}
          style={btn({
            border: "1px solid rgba(46,204,113,0.45)",
            background: "rgba(46,204,113,0.18)",
          })}
        >
          <i className="bi bi-plus-circle" style={{ marginRight: 8 }} />
          Nuevo presupuesto
        </button>
      </div>

      {/* Visor FULL WIDTH + FULL HEIGHT */}
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

// estilos (inline) 
function wrap() {
  return {
    width: "100%",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  };
}

function toolbar() {
  return {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
  };
}

function viewerOuter() {
  return {
    width: "100%",
    minWidth: 0,
    flex: 1,
    minHeight: 0,
  };
}

function viewerCard() {
  return {
    width: "100%",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
    padding: 12,
    boxSizing: "border-box",
  };
}

function viewerFrame() {
  return {
    height: "78vh",
    background: "#fff",
    borderRadius: 12,
    overflow: "hidden",
  };
}

function btn(extra = {}) {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    ...extra,
  };
}
