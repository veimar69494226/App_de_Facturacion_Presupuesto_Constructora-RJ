import React from "react";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";

import DocumentoPage from "../pages/DocumentoPage";
import PreviewPage from "../pages/PreviewPage";
import HistorialPage from "../pages/HistorialPage";
import logo from "../assets/logo constructora.png";

export default function AppShell() {
  return (
    <HashRouter>
      <AppLayout />
    </HashRouter>
  );
}

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const isPreview =
    location.pathname.startsWith("/facturas/preview") ||
    location.pathname.startsWith("/presupuestos/preview");
  const activeTab = location.pathname.startsWith("/historial")
    ? "HISTORIAL"
    : "EMISION";

  return (
    <div style={styles.app}>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <img src={logo} alt="Logo" style={styles.logo} />
          <div>
            <div style={styles.brandTitle}>RAMIRO</div>
            <div style={styles.brandSub}>Construcciones y Reformas</div>
            <div style={styles.brandSub}>Murcia - Mazarrón</div>
          </div>
        </div>

        <nav style={styles.nav}>
          <button
            onClick={() => navigate("/emision")}
            style={{
              ...styles.navItem,
              ...(activeTab === "EMISION" ? styles.navItemActive : {}),
            }}
          >
            <i className="bi bi-send-check" style={{ marginRight: 8 }} />
            Emisión
          </button>
          <button
            onClick={() => navigate("/historial")}
            style={{
              ...styles.navItem,
              ...(activeTab === "HISTORIAL" ? styles.navItemActive : {}),
            }}
          >
            <i className="bi bi-clock-history" style={{ marginRight: 8 }} />
            Historial
          </button>
        </nav>
      </aside>

      <main style={styles.main}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.h1}>Sistema de Facturación</h1>
            <p style={styles.subtitle}>
              CONSTRUCCIONES Y REFORMAS R.J. - Documentos listos para imprimir en PDF
            </p>
          </div>
          <div style={styles.badge}>
            {activeTab === "HISTORIAL" ? "HISTORIAL" : "EMISIÓN"}
          </div>
        </header>

        <div style={{ ...styles.content, padding: isPreview ? 0 : 18 }}>
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
            <Routes>
              <Route path="/" element={<Navigate to="/emision" replace />} />
              <Route path="/emision" element={<DocumentoPage />} />
              <Route path="/historial" element={<HistorialPage />} />

              <Route path="/facturas" element={<Navigate to="/emision" replace />} />
              <Route path="/presupuestos" element={<Navigate to="/emision" replace />} />

              <Route path="/facturas/preview" element={<PreviewPage tipo="FACTURA" />} />
              <Route path="/presupuestos/preview" element={<PreviewPage tipo="PRESUPUESTO" />} />

              <Route path="*" element={<Navigate to="/emision" replace />} />
            </Routes>
          </div>
        </div>
      </main>
    </div>
  );
}

const styles = {
  app: {
    minHeight: "100vh",
    height: "100vh",
    display: "flex",
    background:
      "radial-gradient(1200px 600px at 20% 10%, #0b2a5a 0%, #050a14 55%, #05060a 100%)",
    color: "#fff",
    fontFamily:
      "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    overflow: "hidden",
  },
  sidebar: {
    width: 280,
    padding: 18,
    borderRight: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(6px)",
    flexShrink: 0,
  },
  brand: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  logo: {
    width: 62,
    height: 62,
    objectFit: "contain",
    borderRadius: 12,
    background: "rgba(255,255,255,0.08)",
    padding: 6,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: 1,
    lineHeight: 1.1,
  },
  brandSub: { fontSize: 12, opacity: 0.85, marginTop: 2 },
  nav: { marginTop: 14, display: "flex", flexDirection: "column", gap: 10 },
  navItem: {
    width: "100%",
    textAlign: "left",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.90)",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
  },
  navItemActive: {
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.18)",
    color: "#fff",
    boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    height: "100%",
  },
  header: {
    padding: "18px 22px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
    flexShrink: 0,
  },
  h1: { margin: 0, fontSize: 28, letterSpacing: 0.3 },
  subtitle: { margin: "6px 0 0 0", opacity: 0.85, fontSize: 13 },
  badge: {
    padding: "10px 12px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    fontWeight: 800,
    letterSpacing: 0.8,
    fontSize: 12,
  },
  content: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
  },
};
