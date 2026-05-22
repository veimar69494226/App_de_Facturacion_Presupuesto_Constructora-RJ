const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

let win;
let spanishSpellPromise = null;

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function docsStoragePaths() {
  const root = path.join(app.getPath("documents"), "Sistema Facturacion RJ");
  const dataDir = path.join(root, "data");
  return {
    root,
    dataDir,
    docsFile: path.join(dataDir, "documentos.json"),
  };
}

function docKey(doc) {
  if (!doc || typeof doc !== "object") return "";
  return doc.id || `${doc.tipo || ""}:${doc.numero || ""}`;
}

function normalizeDocList(list) {
  if (!Array.isArray(list)) return [];

  const seen = new Set();
  const result = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const key = docKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item.id ? item : { ...item, id: key });
  }

  return result;
}

function parseDocsPayload(content) {
  const parsed = JSON.parse(content);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.docs)) return parsed.docs;
  return [];
}

function readDocsFile() {
  const { docsFile } = docsStoragePaths();
  if (!fs.existsSync(docsFile)) return [];
  return normalizeDocList(parseDocsPayload(fs.readFileSync(docsFile, "utf8")));
}

function writeDocsFile(list) {
  const { dataDir, docsFile } = docsStoragePaths();
  ensureDir(dataDir);

  const docs = normalizeDocList(list);
  fs.writeFileSync(
    docsFile,
    JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        docs,
      },
      null,
      2
    ),
    "utf8"
  );

  return docs;
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
      spellcheck: true,
    },
  });

  try {
    win.webContents.session.setSpellCheckerLanguages(["es-ES"]);
  } catch {
    // Electron may not expose dictionaries in every environment.
  }

  if (!app.isPackaged) {
    // DEV
    win.loadURL("http://localhost:5173/#/emision");
  } else {
    //PROD robusto (funciona con asar)
    const indexPath = path.join(process.resourcesPath, "app.asar", "dist", "index.html");
    win.loadURL(pathToFileURL(indexPath).toString() + "#/emision");
    
  }
}

function normalizeWord(word) {
  return String(word || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function levenshtein(a, b) {
  const left = normalizeWord(a);
  const right = normalizeWord(b);
  const rows = Array.from({ length: left.length + 1 }, (_, i) => [i]);

  for (let j = 1; j <= right.length; j += 1) rows[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    }
  }

  return rows[left.length][right.length];
}

function applyWordCase(original, replacement) {
  if (!replacement) return original;
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0]?.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function orthographicCandidates(word) {
  const accentMap = {
    a: "á",
    e: "é",
    i: "í",
    o: "ó",
    u: "ú",
    A: "Á",
    E: "É",
    I: "Í",
    O: "Ó",
    U: "Ú",
  };
  const chars = Array.from(String(word || ""));
  const accentVariants = [];
  const enyeVariants = [];

  chars.forEach((char, index) => {
    if (accentMap[char]) {
      const copy = chars.slice();
      copy[index] = accentMap[char];
      accentVariants.push(copy.join(""));
    }

    if (char === "n" || char === "N") {
      const copy = chars.slice();
      copy[index] = char === "N" ? "Ñ" : "ñ";
      enyeVariants.push(copy.join(""));
    }
  });

  const combined = [];
  for (const base of enyeVariants) {
    Array.from(base).forEach((char, index) => {
      if (accentMap[char]) {
        const copy = Array.from(base);
        copy[index] = accentMap[char];
        combined.push(copy.join(""));
      }
    });
  }

  return [...accentVariants, ...enyeVariants, ...combined];
}

function orthographicSuggestion(spell, word) {
  const valid = orthographicCandidates(word).filter((candidate) =>
    spell.correct(candidate)
  );

  return valid.length === 1 ? valid[0] : null;
}

async function getSpanishSpell() {
  if (!spanishSpellPromise) {
    spanishSpellPromise = Promise.all([
      import("dictionary-es"),
      import("nspell"),
    ]).then(([dictionaryModule, nspellModule]) => {
      const dictionary = dictionaryModule.default;
      const nspell = nspellModule.default || nspellModule;
      const spell = nspell({
        aff: Buffer.from(dictionary.aff),
        dic: Buffer.from(dictionary.dic),
      });

      [
        "RJ",
        "Ramiro",
        "Jimenez",
        "Jiménez",
        "Vargas",
        "NIF",
        "DNI",
        "IVA",
        "Mazarrón",
        "Murcia",
      ].forEach((word) => spell.add(word));

      return spell;
    });
  }

  return spanishSpellPromise;
}

function shouldCorrectWord(word) {
  return /^\p{L}{4,}$/u.test(word);
}

function bestSuggestion(spell, word) {
  if (!shouldCorrectWord(word) || spell.correct(word)) return word;

  const orthographic = orthographicSuggestion(spell, word);
  if (orthographic) return applyWordCase(word, orthographic);

  const suggestions = spell.suggest(word).slice(0, 8);
  if (!suggestions.length) return word;

  const normalized = normalizeWord(word);
  const accentOnly = suggestions.find((suggestion) => normalizeWord(suggestion) === normalized);
  if (accentOnly) return applyWordCase(word, accentOnly);

  const close = suggestions.find((suggestion) => {
    const distance = levenshtein(word, suggestion);
    const limit = normalized.length <= 6 ? 1 : 2;
    return distance <= limit;
  });

  return close ? applyWordCase(word, close) : word;
}

function uniqueSuggestions(list) {
  const seen = new Set();
  const result = [];

  for (const item of list) {
    const value = String(item || "").trim();
    const key = normalizeWord(value);
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

function suggestionsForWord(spell, word) {
  if (!shouldCorrectWord(word) || spell.correct(word)) return [];

  const normalized = normalizeWord(word);
  const orthographic = orthographicCandidates(word).filter((candidate) =>
    spell.correct(candidate)
  );
  const dictionary = spell.suggest(word).slice(0, 8);
  const accentOnly = dictionary.filter(
    (suggestion) => normalizeWord(suggestion) === normalized
  );
  const close = dictionary.filter((suggestion) => {
    const distance = levenshtein(word, suggestion);
    const limit = normalized.length <= 6 ? 1 : 2;
    return distance <= limit;
  });

  return uniqueSuggestions([...orthographic, ...accentOnly, ...close, ...dictionary])
    .slice(0, 5)
    .map((suggestion) => applyWordCase(word, suggestion));
}

async function suggestSpanishText(text) {
  const spell = await getSpanishSpell();
  const source = String(text || "");
  const suggestions = [];

  for (const match of source.matchAll(/\p{L}+/gu)) {
    const word = match[0];
    const wordSuggestions = suggestionsForWord(spell, word);
    if (!wordSuggestions.length) continue;

    suggestions.push({
      word,
      index: match.index,
      length: word.length,
      suggestions: wordSuggestions,
    });
  }

  return suggestions;
}

async function correctSpanishText(text, includeTail = true) {
  const spell = await getSpanishSpell();
  const source = String(text || "");
  let tail = "";
  let body = source;

  if (!includeTail) {
    const activeWord = source.match(/^(.*?)(\p{L}+)$/u);
    if (activeWord) {
      body = activeWord[1];
      tail = activeWord[2];
    }
  }

  return (
    body.replace(/\p{L}+/gu, (word) => bestSuggestion(spell, word)) + tail
  );
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

// Historial en JSON del usuario: Documents/Sistema Facturacion RJ/data/documentos.json
ipcMain.handle("rj:docs:storageInfo", async () => {
  try {
    const paths = docsStoragePaths();
    return { ok: true, ...paths };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle("rj:docs:load", async () => {
  try {
    return { ok: true, docs: readDocsFile(), ...docsStoragePaths() };
  } catch (e) {
    return { ok: false, error: String(e?.message || e), docs: [] };
  }
});

ipcMain.handle("rj:docs:save", async (_event, docs) => {
  try {
    return { ok: true, docs: writeDocsFile(docs), ...docsStoragePaths() };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle("rj:docs:upsert", async (_event, doc) => {
  try {
    const current = readDocsFile();
    const key = docKey(doc);
    if (!key) return { ok: false, error: "Documento sin id o numero." };

    const idx = current.findIndex((item) => docKey(item) === key);
    if (idx === -1) current.unshift(doc);
    else current[idx] = doc;

    return { ok: true, docs: writeDocsFile(current), ...docsStoragePaths() };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle("rj:docs:delete", async (_event, id) => {
  try {
    const docs = readDocsFile().filter((doc) => doc.id !== id);
    return { ok: true, docs: writeDocsFile(docs), ...docsStoragePaths() };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

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

// Corrector ortográfico español. Devuelve texto corregido solo con sugerencias confiables.
ipcMain.handle("rj:suggestSpanishText", async (_event, { text }) => {
  try {
    const suggestions = await suggestSpanishText(text);
    return { ok: true, suggestions };
  } catch (e) {
    return { ok: false, error: String(e?.message || e), suggestions: [] };
  }
});

ipcMain.handle("rj:correctSpanishText", async (_event, { text, includeTail }) => {
  try {
    const corrected = await correctSpanishText(text, includeTail !== false);
    return { ok: true, text: corrected };
  } catch (e) {
    return { ok: false, error: String(e?.message || e), text: String(text || "") };
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
