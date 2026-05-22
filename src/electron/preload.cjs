const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rjApi", {
  saveFacturaPdf: (payload) => ipcRenderer.invoke("rj:saveFacturaPdf", payload),
  exportPdf: (payload) => ipcRenderer.invoke("rj:exportPdf", payload),
  printPdfBytes: (payload) => ipcRenderer.invoke("rj:printPdfBytes", payload),
  suggestSpanishText: (payload) => ipcRenderer.invoke("rj:suggestSpanishText", payload),
  correctSpanishText: (payload) => ipcRenderer.invoke("rj:correctSpanishText", payload),
  getDocsStorageInfo: () => ipcRenderer.invoke("rj:docs:storageInfo"),
  loadDocs: () => ipcRenderer.invoke("rj:docs:load"),
  saveDocs: (docs) => ipcRenderer.invoke("rj:docs:save", docs),
  upsertDoc: (doc) => ipcRenderer.invoke("rj:docs:upsert", doc),
  deleteDoc: (id) => ipcRenderer.invoke("rj:docs:delete", id),
});
