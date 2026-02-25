import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { moneyEUR } from "../utils/money";
import logo from "../assets/logo constructora.png";

const ACCENT = "#000000";
const LINE = "#cfd6df";

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingLeft: 28,
    paddingRight: 28,
    paddingBottom: 90, // deja espacio para el footer
    fontSize: 10,
    fontFamily: "Helvetica",
    position: "relative",
  },

  // Marca de agua del logo
  watermarkWrap: {
    position: "absolute",
    top: 170,
    left: 0,
    right: 0,
    alignItems: "center",
    opacity: 0.08,
    zIndex: 0,
  },
  watermarkLogo: {
    width: 360,
    height: 360,
    objectFit: "contain",
  },

  content: { zIndex: 1 },

  row: { flexDirection: "row", justifyContent: "space-between" },
  title: { fontSize: 16, fontWeight: 700 },

  separator: {
    marginTop: 10,
    borderBottom: `1.2pt solid ${ACCENT}`,
    opacity: 0.85,
  },

  h2: { fontSize: 12, marginTop: 10, marginBottom: 6, fontWeight: 700 },

  box: {
    border: `1pt solid ${LINE}`,
    padding: 10,
    borderRadius: 6,
    marginTop: 10,
    backgroundColor: "#fff",
  },

  workTitle: {
    marginTop: 10,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: 700,
    textAlign: "center",
    letterSpacing: 0.6,
  },

  tableHead: {
    flexDirection: "row",
    borderBottom: `1pt solid ${ACCENT}`,
    paddingBottom: 6,
    marginTop: 8,
  },
  th: { fontWeight: 700, color: ACCENT },

  tr: {
    flexDirection: "row",
    borderBottom: `0.6pt solid ${LINE}`,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },

  trAlt: { backgroundColor: "#ffffff" },

  c1: { width: "55%" },
  c2: { width: "15%", textAlign: "right" },
  c3: { width: "15%", textAlign: "right" },
  c4: { width: "15%", textAlign: "right" },

  totals: { marginTop: 10, alignSelf: "flex-end", width: 200 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },

  //  Footer fijo al fondo
  footerNotes: {
    position: "absolute",
    bottom: 28,
    left: 28,
    right: 28,
    fontSize: 9,
    lineHeight: 1.3,
    color: "#333",
    zIndex: 2,
  },
  //  Línea arriba del footer
  footerLine: {
    borderTop: `0.7pt solid ${LINE}`,
    paddingTop: 6,
  },
});

export default function PresupuestoPdf({ doc }) {
  const isManual = doc?.subtotalModo === "manual";
  return (
    <Document>
      <Page size="Letter" style={styles.page} wrap>
        {/* Marca de agua */}
        <View style={styles.watermarkWrap} fixed>
          <Image src={logo} style={styles.watermarkLogo} />
        </View>

        {/* Contenido */}
        <View style={styles.content}>
          <View style={styles.row}>
            <View>
              <Text style={styles.title}>{doc.empresa?.nombreComercial}</Text>
              <Image src={logo} style={{ width: 70, height: 70 }} />

              <Text>Nombre: {doc.empresa?.titular}</Text>
              <Text>NIF/DNI: {doc.empresa?.nif}</Text>
              <Text>Dirección: {doc.empresa?.direccion}</Text>
              <Text>Correo: {doc.empresa?.email}</Text>
              <Text>Teléfono: {doc.empresa?.telefono}</Text>
            </View>

            <View style={{ textAlign: "right" }}>
              <Text style={styles.title}>PRESUPUESTO</Text>
              <Text>Nº: {doc.numero}</Text>
              <Text>Fecha: {doc.fecha}</Text>
            </View>
          </View>

          <View style={styles.separator} />

          <View style={styles.box}>
            <Text style={styles.h2}>Cliente</Text>
            <Text>Nombre: {doc.cliente?.nombre?.trim() ? doc.cliente.nombre : ""}</Text>
          </View>

          {doc.tituloDetalle ? <Text style={styles.workTitle}>{doc.tituloDetalle}</Text> : null}

  <View style={styles.tableHead}>
  <Text style={[styles.c1, styles.th]}>Concepto</Text>
  <Text style={[styles.c2, styles.th]}>Cantidad</Text>
  <Text style={[styles.c3, styles.th]}>Precio</Text>
  <Text style={[styles.c4, styles.th]}>Total</Text>
</View>

{doc.items?.map((it, i) => {
  const precioNum = Number(it.precio || 0);
  const totalLineaNum = Number(it.totalLinea || 0);

  const showPrecio = !isManual && precioNum > 0;
  const showTotal = !isManual && totalLineaNum > 0;

  return (
    <View key={i} style={[styles.tr, i % 2 === 1 ? styles.trAlt : null]}>
      <Text style={styles.c1}>{i + 1}. {it.concepto}</Text>
      <Text style={styles.c2}>{it.cantidad}</Text>

      {/* Mantiene columna, pero oculta 0,00 € */}
      <Text style={styles.c3}>{showPrecio ? moneyEUR(precioNum) : ""}</Text>

      {/* Mantiene columna, pero oculta 0,00 € */}
      <Text style={styles.c4}>{showTotal ? moneyEUR(totalLineaNum) : ""}</Text>
    </View>
  );
})}
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text>Subtotal</Text>
              <Text>{moneyEUR(doc.subtotal)}</Text>
            </View>

            {doc.aplicaIVA ? (
              <View style={styles.totalRow}>
                <Text>IVA {doc.ivaPorc}%</Text>
                <Text>{moneyEUR(doc.ivaMonto)}</Text>
              </View>
            ) : null}

            <View style={[styles.totalRow, { borderTop: `1pt solid ${ACCENT}`, paddingTop: 6, marginTop: 6 }]}>
              <Text style={{ fontWeight: 700 }}>TOTAL</Text>
              <Text style={{ fontWeight: 700 }}>{moneyEUR(doc.total)}</Text>
            </View>
          </View>
        </View>

        {/* NOTAS (FOOTER FIJO ) */}
        {doc.notas ? (
          <View style={[styles.footerNotes, styles.footerLine]} fixed>
            <Text>{doc.notas}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
