const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

let win;

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    backgroundColor: "#0b1220",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    // DEV
    win.loadURL("http://localhost:5173/#/facturas");
  } else {
    //PROD robusto (funciona con asar)
    const indexPath = path.join(process.resourcesPath, "app.asar", "dist", "index.html");
    win.loadURL(pathToFileURL(indexPath).toString() + "#/facturas");
    
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/* Guardar en Documentos/FacturasRJ
ipcMain.handle("rj:saveFacturaPdf", async (_event, { fileName, bytes }) => {
  try {
    const documents = app.getPath("documents");
    const folder = path.join(documents, "FacturasRJ");
    ensureDir(folder);

    const target = path.join(folder, fileName);
    fs.writeFileSync(target, Buffer.from(bytes));

    return { ok: true, path: target };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});*/

// Exportar PDF
ipcMain.handle("rj:exportPdf", async (_event, { suggestedName, bytes }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: suggestedName || "FACTURA.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });

    if (canceled || !filePath) return { ok: true, canceled: true };

    fs.writeFileSync(filePath, Buffer.from(bytes));
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// Imprimir SOLO el PDF 
ipcMain.handle("rj:printPdfBytes", async (_event, { bytes, title }) => {
  let tmpPath = null;
  let printWin = null;

  try {
    if (!bytes || !Array.isArray(bytes) || bytes.length === 0) {
      return { ok: false, error: "PDF vacío (bytes=0)" };
    }

    const safeName = String(title || "FACTURA.pdf").replace(/[\\/:*?"<>|]/g, "_");
    tmpPath = path.join(app.getPath("temp"), `rj_print_${Date.now()}_${safeName}`);
    fs.writeFileSync(tmpPath, Buffer.from(bytes));

    printWin = new BrowserWindow({
      show: false,
      width: 900,
      height: 700,
      backgroundColor: "#ffffff",
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    printWin.setSkipTaskbar(true);

    await printWin.loadURL(pathToFileURL(tmpPath).toString());

    await new Promise((resolve) => {
      const wc = printWin.webContents;
      const done = () => resolve();
      wc.once("did-finish-load", done);
      setTimeout(done, 1200);
    });

    await new Promise((r) => setTimeout(r, 500));

    const result = await new Promise((resolve) => {
      printWin.webContents.print(
        { silent: false, printBackground: true },
        (success, failureReason) => resolve({ success, failureReason })
      );
    });

    try { printWin.close(); } catch {}
    try { fs.unlinkSync(tmpPath); } catch {}

    if (!result.success) return { ok: false, error: result.failureReason || "No se pudo imprimir" };
    return { ok: true };
  } catch (e) {
    try { if (printWin) printWin.close(); } catch {}
    try { if (tmpPath) fs.unlinkSync(tmpPath); } catch {}
    return { ok: false, error: String(e?.message || e) };
  }
});
