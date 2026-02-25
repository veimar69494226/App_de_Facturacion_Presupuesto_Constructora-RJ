const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rjApi", {
  saveFacturaPdf: (payload) => ipcRenderer.invoke("rj:saveFacturaPdf", payload),
  exportPdf: (payload) => ipcRenderer.invoke("rj:exportPdf", payload),
  printPdfBytes: (payload) => ipcRenderer.invoke("rj:printPdfBytes", payload),
});
