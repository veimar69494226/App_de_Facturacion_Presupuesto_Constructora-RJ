import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { moneyEUR } from "../utils/money";
import { Image } from "@react-pdf/renderer";
import logo from "../assets/logo constructora.png";


const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 11 },
  row: { flexDirection: "row" },
  header: { marginBottom: 12 },
  title: { fontSize: 16, marginBottom: 6, fontWeight: 700 },
  small: { fontSize: 10, color: "#444" },
  box: { border: "1px solid #ddd", padding: 10, marginBottom: 10 },
  tableHeader: { flexDirection: "row", borderBottom: "1px solid #000", paddingBottom: 6, marginTop: 8 },
  th: { fontWeight: 700 },
  td: { paddingVertical: 4 },
  colConcepto: { width: "55%" },
  colQty: { width: "15%", textAlign: "right" },
  colPrice: { width: "15%", textAlign: "right" },
  colTotal: { width: "15%", textAlign: "right" },
  totals: { marginTop: 10, alignSelf: "flex-end", width: "45%" },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
});

export default function DocPdf({ doc }) {
  const isFactura = doc.tipo === "FACTURA";

  return (
    <Document>
      <Page size="Letter" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {isFactura ? "FACTURA" : "PRESUPUESTO"} {doc.numero}
          </Text>
          <Text style={styles.small}>Fecha: {doc.fecha}</Text>
        </View>
<View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
  <Image src={logo} style={{ width: 140, height: 140 }} />
  <View>
    <Text style={styles.title}>{doc.tipo} {doc.numero}</Text>
    <Text style={styles.small}>Fecha: {doc.fecha}</Text>
  </View>
</View>

        <View style={styles.box}>
          <Text style={{ fontWeight: 700, marginBottom: 4 }}>DATOS DE LA EMPRESA</Text>
          <Text>{doc.empresa.nombreComercial}</Text>
          <Text>{doc.empresa.titular}</Text>
          <Text>Tel: {doc.empresa.telefono}</Text>
          <Text>Email: {doc.empresa.email}</Text>
          {doc.empresa.direccion ? <Text>Dirección: {doc.empresa.direccion}</Text> : null}
          {doc.empresa.nif ? <Text>NIF: {doc.empresa.nif}</Text> : null}
        </View>

        <View style={styles.box}>
          <Text style={{ fontWeight: 700, marginBottom: 4 }}>DATOS DEL CLIENTE</Text>
          <Text>Cliente: {doc.cliente.nombre}</Text>
          {doc.cliente.direccion ? <Text>Dirección: {doc.cliente.direccion}</Text> : null}
          {doc.cliente.nif ? <Text>NIF: {doc.cliente.nif}</Text> : null}
        </View>

        <View>
          <View style={styles.tableHeader}>
            <Text style={[styles.colConcepto, styles.th]}>Concepto</Text>
            <Text style={[styles.colQty, styles.th]}>Cantidad</Text>
            <Text style={[styles.colPrice, styles.th]}>Precio</Text>
            <Text style={[styles.colTotal, styles.th]}>Total</Text>
          </View>

          {doc.items.map((it, idx) => (
            <View key={idx} style={styles.row}>
              <Text style={[styles.colConcepto, styles.td]}>{it.concepto}</Text>
              <Text style={[styles.colQty, styles.td]}>{it.cantidad}</Text>
              <Text style={[styles.colPrice, styles.td]}>{moneyEUR(it.precio)}</Text>
              <Text style={[styles.colTotal, styles.td]}>{moneyEUR(it.totalLinea)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalsRow}>
            <Text>Subtotal</Text>
            <Text>{moneyEUR(doc.subtotal)}</Text>
          </View>

          {doc.aplicaIVA ? (
            <View style={styles.totalsRow}>
              <Text>IVA {doc.ivaPorc}%</Text>
              <Text>{moneyEUR(doc.ivaMonto)}</Text>
            </View>
          ) : null}

          <View style={[styles.totalsRow, { borderTop: "1px solid #000", marginTop: 4, paddingTop: 6 }]}>
            <Text style={{ fontWeight: 700 }}>TOTAL</Text>
            <Text style={{ fontWeight: 700 }}>{moneyEUR(doc.total)}</Text>
          </View>

          {doc.notas ? <Text style={{ marginTop: 10 }}>* {doc.notas}</Text> : null}
        </View>
      </Page>
    </Document>
  );
}


