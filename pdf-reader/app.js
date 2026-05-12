if (!Promise.withResolvers) {
  Promise.withResolvers = function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  };
}

if (!Map.prototype.getOrInsertComputed) {
  Object.defineProperty(Map.prototype, "getOrInsertComputed", {
    value(key, callback) {
      if (this.has(key)) return this.get(key);
      const value = callback(key);
      this.set(key, value);
      return value;
    },
    configurable: true,
    writable: true
  });
}

if (!Math.sumPrecise) {
  Math.sumPrecise = function sumPrecise(values) {
    let sum = 0;
    for (const value of values) sum += Number(value) || 0;
    return sum;
  };
}

const pdfjsLib = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.mjs");

pdfjsLib.GlobalWorkerOptions.workerSrc = "./pdf-worker-wrapper.mjs";

const DB_NAME = "pdfDeepReader";
const DB_VERSION = 1;
const DOC_STORE = "documents";
const state = {
  db: null,
  docs: [],
  activeDocId: "",
  pdf: null,
  zoom: 1,
  tool: "browse",
  selectedText: "",
  lastLookup: ""
};

const dictionary = [
  ["resilience", "韧性；恢复力；从冲击中恢复的能力"],
  ["consumer spending", "消费者支出；居民消费"],
  ["trade-off", "权衡；取舍"],
  ["scrutiny", "仔细审查；严格监督"],
  ["headwind", "逆风；阻力；不利因素"],
  ["tailwind", "顺风；助力；有利因素"],
  ["monetary policy", "货币政策"],
  ["fiscal policy", "财政政策"],
  ["soft landing", "软着陆"],
  ["lay bare", "揭示；暴露"]
];

const els = {
  pdfInput: document.querySelector("#pdfInput"),
  searchInput: document.querySelector("#searchInput"),
  docList: document.querySelector("#docList"),
  docTitle: document.querySelector("#docTitle"),
  docMeta: document.querySelector("#docMeta"),
  pdfViewer: document.querySelector("#pdfViewer"),
  emptyState: document.querySelector("#emptyState"),
  viewerWrap: document.querySelector("#viewerWrap"),
  statusBar: document.querySelector("#statusBar"),
  annotationList: document.querySelector("#annotationList"),
  annotationCount: document.querySelector("#annotationCount"),
  documentNote: document.querySelector("#documentNote"),
  wordCard: document.querySelector("#wordCard"),
  openEudicBtn: document.querySelector("#openEudicBtn"),
  zoomOutBtn: document.querySelector("#zoomOutBtn"),
  zoomInBtn: document.querySelector("#zoomInBtn"),
  zoomLabel: document.querySelector("#zoomLabel"),
  saveDocNoteBtn: document.querySelector("#saveDocNoteBtn"),
  clearDemoBtn: document.querySelector("#clearDemoBtn"),
  copySelectionBtn: document.querySelector("#copySelectionBtn"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileBackdrop: document.querySelector("#mobileBackdrop"),
  libraryPanel: document.querySelector(".library-panel")
};

function uid() {
  return `doc_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function fileSize(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function activeDoc() {
  return state.docs.find((doc) => doc.id === state.activeDocId) || null;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DOC_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("本地数据库打开失败"));
  });
}

function storeRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("本地数据库读写失败"));
  });
}

async function getAllDocs() {
  const tx = state.db.transaction(DOC_STORE, "readonly");
  return storeRequest(tx.objectStore(DOC_STORE).getAll());
}

async function saveDoc(doc) {
  const tx = state.db.transaction(DOC_STORE, "readwrite");
  tx.objectStore(DOC_STORE).put(doc);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("保存失败"));
  });
}

async function deleteDoc(id) {
  const tx = state.db.transaction(DOC_STORE, "readwrite");
  tx.objectStore(DOC_STORE).delete(id);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("删除失败"));
  });
}

function setStatus(message) {
  els.statusBar.textContent = message;
}

function setTool(tool) {
  state.tool = tool;
  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
}

function queryDocs() {
  const query = els.searchInput.value.trim().toLowerCase();
  if (!query) return state.docs;
  return state.docs.filter((doc) => {
    const text = `${doc.name} ${doc.note || ""} ${(doc.annotations || []).map((item) => item.text).join(" ")}`.toLowerCase();
    return text.includes(query);
  });
}

function renderDocList() {
  const docs = queryDocs().sort((a, b) => b.updatedAt - a.updatedAt);
  if (!docs.length) {
    els.docList.innerHTML = `<p class="muted">还没有 PDF。先点击上方“导入 PDF”。</p>`;
    return;
  }
  els.docList.innerHTML = docs.map((doc) => `
    <button class="doc-row ${doc.id === state.activeDocId ? "active" : ""}" data-doc-id="${doc.id}" type="button">
      <div class="doc-row-head">
        <h3>${escapeHtml(doc.name)}</h3>
      </div>
      <p>${doc.pageCount || "-"} 页 · ${(doc.annotations || []).length} 条标注 · ${fileSize(doc.size || 0)} · ${formatDate(doc.updatedAt)}</p>
    </button>
  `).join("");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAnnotationList() {
  const doc = activeDoc();
  const annotations = doc?.annotations || [];
  els.annotationCount.textContent = annotations.length;
  if (!doc) {
    els.annotationList.innerHTML = `<p class="muted">选择 PDF 后显示标注。</p>`;
    return;
  }
  if (!annotations.length) {
    els.annotationList.innerHTML = `<p class="muted">选中文本后添加高亮、划线或笔记。</p>`;
    return;
  }
  els.annotationList.innerHTML = annotations
    .slice()
    .sort((a, b) => a.page - b.page || a.createdAt - b.createdAt)
    .map((item) => `
      <article class="annotation-row" data-annotation-id="${item.id}">
        <div class="annotation-row-head">
          <strong>${annotationLabel(item.type)} · 第 ${item.page} 页</strong>
          <button data-delete-annotation="${item.id}" type="button">删除</button>
        </div>
        <p>${escapeHtml(item.note || item.text || "位置标注")}</p>
      </article>
    `).join("");
}

function annotationLabel(type) {
  if (type === "highlight") return "高亮";
  if (type === "underline") return "划线";
  if (type === "note") return "笔记";
  return "标注";
}

function renderWordCard(term = "") {
  const clean = String(term || "").trim().replace(/\s+/g, " ").slice(0, 80);
  state.lastLookup = clean;
  if (!clean) {
    els.wordCard.innerHTML = `<p class="muted">选中 PDF 里的单词或词组，再点“查词”。</p>`;
    return;
  }
  const found = dictionary.find(([key]) => key.toLowerCase() === clean.toLowerCase());
  els.wordCard.innerHTML = `
    <h3>${escapeHtml(clean)}</h3>
    <p>${escapeHtml(found ? found[1] : "本地小词库暂无释义。可以复制后到欧路词典查询。")}</p>
  `;
}

function closeMobileLibrary() {
  els.libraryPanel.classList.remove("open");
  els.mobileBackdrop.classList.remove("show");
}

function openMobileLibrary() {
  els.libraryPanel.classList.add("open");
  els.mobileBackdrop.classList.add("show");
}

async function refreshDocs(selectId = state.activeDocId) {
  state.docs = await getAllDocs();
  state.activeDocId = selectId || state.docs[0]?.id || "";
  renderDocList();
  renderAnnotationList();
}

async function importPdf(file) {
  if (!file) return;
  setStatus("正在读取 PDF...");
  const data = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data.slice(0)) });
  const pdf = await loadingTask.promise;
  const doc = {
    id: uid(),
    name: file.name.replace(/\.pdf$/i, "") || "未命名 PDF",
    fileName: file.name,
    size: file.size,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pageCount: pdf.numPages,
    note: "",
    annotations: [],
    file: data
  };
  await saveDoc(doc);
  await refreshDocs(doc.id);
  await loadDocument(doc.id);
  setStatus("PDF 已导入。选中文本后可以高亮、划线、笔记或查词。");
}

async function loadDocument(id) {
  const doc = state.docs.find((item) => item.id === id);
  if (!doc) return;
  state.activeDocId = id;
  state.pdf = null;
  state.zoom = 1;
  els.pdfViewer.innerHTML = "";
  els.emptyState.hidden = true;
  els.docTitle.textContent = doc.name;
  els.docMeta.textContent = `${doc.pageCount || "-"} 页 · ${fileSize(doc.size || 0)} · ${formatDate(doc.updatedAt)}`;
  els.documentNote.value = doc.note || "";
  renderDocList();
  renderAnnotationList();
  renderWordCard("");
  setStatus("正在渲染 PDF...");

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(doc.file.slice(0)) });
  state.pdf = await loadingTask.promise;
  await renderPdf();
  setStatus("PDF 已打开。选中文本后使用上方工具。");
}

async function renderPdf() {
  const pdf = state.pdf;
  const doc = activeDoc();
  if (!pdf || !doc) return;
  els.pdfViewer.innerHTML = "";
  els.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;

  const pageOne = await pdf.getPage(1);
  const baseViewport = pageOne.getViewport({ scale: 1 });
  const availableWidth = Math.max(320, els.viewerWrap.clientWidth - 44);
  const fitScale = availableWidth / baseViewport.width;
  const scale = Math.max(0.55, Math.min(2.4, fitScale * state.zoom));

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = pageNumber === 1 ? pageOne : await pdf.getPage(pageNumber);
    await renderPage(page, pageNumber, scale);
  }
  renderAllAnnotationMarks();
}

async function renderPage(page, pageNumber, scale) {
  const viewport = page.getViewport({ scale });
  const shell = document.createElement("section");
  shell.className = "page-shell";
  shell.dataset.page = String(pageNumber);
  shell.style.width = `${viewport.width}px`;
  shell.style.height = `${viewport.height}px`;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  const outputScale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  const textLayer = document.createElement("div");
  textLayer.className = "textLayer";
  textLayer.dataset.page = String(pageNumber);

  const annotationLayer = document.createElement("div");
  annotationLayer.className = "annotation-layer";

  shell.append(canvas, textLayer, annotationLayer);
  els.pdfViewer.append(shell);

  await page.render({
    canvasContext: context,
    viewport,
    transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null
  }).promise;

  const textContent = await page.getTextContent();
  const layer = new pdfjsLib.TextLayer({
    textContentSource: textContent,
    container: textLayer,
    viewport
  });
  await layer.render();
}

function renderAllAnnotationMarks() {
  document.querySelectorAll(".annotation-layer").forEach((layer) => {
    layer.innerHTML = "";
  });
  const doc = activeDoc();
  if (!doc) return;
  (doc.annotations || []).forEach((annotation) => {
    const layer = document.querySelector(`.page-shell[data-page="${annotation.page}"] .annotation-layer`);
    if (!layer) return;
    annotation.rects.forEach((rect) => {
      const mark = document.createElement("div");
      mark.className = `annotation-mark ${annotation.type}`;
      mark.style.left = `${rect.x * 100}%`;
      mark.style.top = `${rect.y * 100}%`;
      mark.style.width = `${rect.w * 100}%`;
      mark.style.height = `${rect.h * 100}%`;
      layer.append(mark);
    });
  });
}

function selectedText() {
  return String(window.getSelection()?.toString() || "").trim().replace(/\s+/g, " ");
}

function selectionRects() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return [];
  const rects = [];
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    Array.from(range.getClientRects()).forEach((clientRect) => {
      if (clientRect.width < 2 || clientRect.height < 2) return;
      document.querySelectorAll(".page-shell").forEach((pageEl) => {
        const pageRect = pageEl.getBoundingClientRect();
        const left = Math.max(clientRect.left, pageRect.left);
        const right = Math.min(clientRect.right, pageRect.right);
        const top = Math.max(clientRect.top, pageRect.top);
        const bottom = Math.min(clientRect.bottom, pageRect.bottom);
        if (right <= left || bottom <= top) return;
        rects.push({
          page: Number(pageEl.dataset.page),
          x: (left - pageRect.left) / pageRect.width,
          y: (top - pageRect.top) / pageRect.height,
          w: (right - left) / pageRect.width,
          h: (bottom - top) / pageRect.height
        });
      });
    });
  }
  return rects;
}

async function applyTool(tool) {
  const doc = activeDoc();
  if (!doc) {
    setStatus("请先导入并打开 PDF。");
    return;
  }
  const text = selectedText();
  const rects = selectionRects();
  if (!text || !rects.length) {
    setTool(tool);
    setStatus(`已选择“${annotationLabel(tool)}”。请先在 PDF 中拖动选中文本，再点工具。`);
    return;
  }

  if (tool === "lookup") {
    renderWordCard(text);
    setStatus(`已查词：${text}`);
    return;
  }

  let note = "";
  if (tool === "note") {
    note = window.prompt("写下这条笔记", text) || "";
    if (!note.trim()) return;
  }

  const pages = [...new Set(rects.map((item) => item.page))];
  doc.annotations = doc.annotations || [];
  doc.annotations.push({
    id: uid(),
    type: tool,
    page: pages[0],
    text,
    note: note.trim(),
    rects,
    createdAt: Date.now()
  });
  doc.updatedAt = Date.now();
  await saveDoc(doc);
  await refreshDocs(doc.id);
  renderAllAnnotationMarks();
  window.getSelection()?.removeAllRanges();
  setStatus(`已添加${annotationLabel(tool)}。`);
}

async function removeAnnotation(id) {
  const doc = activeDoc();
  if (!doc) return;
  doc.annotations = (doc.annotations || []).filter((item) => item.id !== id);
  doc.updatedAt = Date.now();
  await saveDoc(doc);
  await refreshDocs(doc.id);
  renderAllAnnotationMarks();
  setStatus("已删除标注。");
}

async function saveDocumentNote() {
  const doc = activeDoc();
  if (!doc) return;
  doc.note = els.documentNote.value.trim();
  doc.updatedAt = Date.now();
  await saveDoc(doc);
  await refreshDocs(doc.id);
  setStatus("全文笔记已保存。");
}

async function clearAllDocs() {
  if (!state.docs.length) return;
  if (!window.confirm("确认删除本机保存的所有 PDF 和标注？")) return;
  await Promise.all(state.docs.map((doc) => deleteDoc(doc.id)));
  state.docs = [];
  state.activeDocId = "";
  state.pdf = null;
  els.pdfViewer.innerHTML = "";
  els.emptyState.hidden = false;
  els.docTitle.textContent = "导入一份 PDF 开始精读";
  els.docMeta.textContent = "未选择 PDF";
  els.documentNote.value = "";
  renderDocList();
  renderAnnotationList();
  renderWordCard("");
  setStatus("已清空本机资料库。");
}

async function copySelectedText() {
  const text = selectedText();
  if (!text) {
    setStatus("请先选中 PDF 文本。");
    return;
  }
  await navigator.clipboard.writeText(text);
  setStatus("已复制选中文本。");
}

function openEudic() {
  const term = state.lastLookup || selectedText();
  if (!term) {
    setStatus("请先选中单词或词组。");
    return;
  }
  window.location.href = `eudic://dict/${encodeURIComponent(term)}`;
}

function bindEvents() {
  els.pdfInput.addEventListener("change", async (event) => {
    try {
      await importPdf(event.target.files?.[0]);
      event.target.value = "";
    } catch (error) {
      console.error(error);
      setStatus(error.message || "PDF 导入失败。");
    }
  });

  els.searchInput.addEventListener("input", renderDocList);
  els.docList.addEventListener("click", async (event) => {
    const row = event.target.closest("[data-doc-id]");
    if (!row) return;
    closeMobileLibrary();
    await loadDocument(row.dataset.docId);
  });

  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", async () => {
      const tool = button.dataset.tool;
      setTool(tool);
      if (tool !== "browse") await applyTool(tool);
    });
  });

  els.copySelectionBtn.addEventListener("click", copySelectedText);
  els.openEudicBtn.addEventListener("click", openEudic);
  els.saveDocNoteBtn.addEventListener("click", saveDocumentNote);
  els.clearDemoBtn.addEventListener("click", clearAllDocs);
  els.sidebarToggle.addEventListener("click", openMobileLibrary);
  els.mobileBackdrop.addEventListener("click", closeMobileLibrary);

  els.zoomOutBtn.addEventListener("click", async () => {
    if (!state.pdf) return;
    state.zoom = Math.max(0.65, state.zoom - 0.15);
    await renderPdf();
  });

  els.zoomInBtn.addEventListener("click", async () => {
    if (!state.pdf) return;
    state.zoom = Math.min(2.2, state.zoom + 0.15);
    await renderPdf();
  });

  els.annotationList.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest("[data-delete-annotation]");
    if (deleteButton) {
      await removeAnnotation(deleteButton.dataset.deleteAnnotation);
      return;
    }
    const row = event.target.closest("[data-annotation-id]");
    const doc = activeDoc();
    const annotation = doc?.annotations?.find((item) => item.id === row?.dataset.annotationId);
    if (!annotation) return;
    document.querySelector(`.page-shell[data-page="${annotation.page}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  els.viewerWrap.addEventListener("mouseup", () => {
    const text = selectedText();
    state.selectedText = text;
    if (text) setStatus(`已选中：${text.slice(0, 60)}${text.length > 60 ? "..." : ""}`);
  });
}

async function init() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
  state.db = await openDb();
  await refreshDocs();
  bindEvents();
  if (state.activeDocId) {
    await loadDocument(state.activeDocId);
  } else {
    renderDocList();
    renderAnnotationList();
  }
}

init().catch((error) => {
  console.error(error);
  setStatus(error.message || "应用初始化失败。");
});
