const storeKey = "mobileMorningReader";
const wordKey = "mobileMorningWords";
const progressKey = "mobileMorningProgress";

const sampleText = `The point of a reading habit is not to finish every article. It is to build a reliable doorway into attention.

阅读习惯的重点并不是读完每一篇文章，而是建立一个稳定进入专注状态的入口。

focus: 专注；注意力集中
reliable: 可靠的；稳定的

重点解析：The point of ... is not to ..., but to ... 是外刊中很常见的论证句式，用来重新定义一件事的真正价值。

If the source is difficult to reach, the workflow should become lighter, not heavier. A useful reading app should accept whatever text the reader can legally bring to it.

如果材料来源很难获得，工作流就应该变轻，而不是变重。一个有用的阅读 App 应该接受读者能合法带进来的任何文本。

workflow: 工作流；做事流程`;

let articles = load(storeKey, []);
let words = load(wordKey, []);
let progress = load(progressKey, {});
let currentArticleId = articles[0]?.id || "";
let sentenceIndex = 0;
let selectedWord = "";
let utterance = null;

const screens = {
  library: document.querySelector("#libraryScreen"),
  reader: document.querySelector("#readerScreen"),
  import: document.querySelector("#importScreen"),
  words: document.querySelector("#wordsScreen")
};

const articleList = document.querySelector("#articleList");
const readerTitle = document.querySelector("#readerTitle");
const readerSource = document.querySelector("#readerSource");
const readerBody = document.querySelector("#readerBody");
const readerStatus = document.querySelector("#readerStatus");
const progressBar = document.querySelector("#progressBar");
const humanAudio = document.querySelector("#humanAudio");
const dictSheet = document.querySelector("#dictSheet");

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function makeId(value) {
  return `${String(value || "article").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}-${Date.now()}`;
}

function isEnglish(text) {
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = (text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).length;
  return letters > cjk * 1.5 && words >= 5;
}

function isChinese(text) {
  return (text.match(/[\u4e00-\u9fff]/g) || []).length >= 4 && !isEnglish(text);
}

function looksLikeNote(text) {
  return /^(解析|重点|难点|长难句|表达|语法|背景|注释|点评)[:：]/.test(text);
}

function extractVocab(text) {
  const match = text.match(/^([A-Za-z][A-Za-z-]{1,32})\s*(?:\[[^\]]+\])?\s*(?:\([^)]+\))?\s*[-—:：]\s*(.+)$/);
  if (!match || !/[\u4e00-\u9fff]/.test(match[2])) return null;
  return { word: match[1], meaning: match[2].trim(), createdAt: Date.now() };
}

function splitBlocks(text) {
  return text
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseArticle({ title, source, audioUrl, text }) {
  const blocks = splitBlocks(text);
  const paragraphs = [];
  const foundWords = [];
  const first = blocks.find((block) => block.length > 5) || "导入文章";
  const articleTitle = title.trim() || (first.length < 80 && !isEnglish(first) ? first : "导入文章");

  for (const raw of blocks) {
    const block = raw.replace(/^(原文|译文|翻译|参考译文|解析|重点|难点|词汇|单词|表达|长难句|注释)[:：]?\s*/, "").trim();
    if (!block || block === articleTitle) continue;

    const vocab = extractVocab(block);
    if (vocab) {
      foundWords.push(vocab);
      continue;
    }

    if (isEnglish(block)) {
      paragraphs.push({ en: block, zh: "", note: "" });
      continue;
    }

    if (paragraphs.length && looksLikeNote(raw)) {
      const last = paragraphs[paragraphs.length - 1];
      last.note = last.note ? `${last.note}\n${block}` : block;
      continue;
    }

    if (paragraphs.length && isChinese(block)) {
      const last = paragraphs[paragraphs.length - 1];
      if (!last.zh) last.zh = block;
      else last.note = last.note ? `${last.note}\n${block}` : block;
    }
  }

  if (!paragraphs.length) {
    paragraphs.push({
      en: "No English paragraph was detected. Paste English text with optional Chinese notes, then import again.",
      zh: "没有识别到英文段落。请粘贴英文正文，可附带中文讲解后重新导入。",
      note: ""
    });
  }

  const article = {
    id: makeId(articleTitle),
    title: articleTitle,
    source: source.trim() || "The Economist",
    audioUrl: audioUrl.trim(),
    importedAt: Date.now(),
    paragraphs
  };

  mergeWords(foundWords, article.id);
  return article;
}

function mergeWords(items, articleId) {
  for (const item of items) {
    const key = item.word.toLowerCase();
    if (words.some((word) => word.word.toLowerCase() === key)) continue;
    words.unshift({ ...item, articleId });
  }
  save(wordKey, words);
}

function splitSentences(article) {
  return article.paragraphs.flatMap((paragraph, paragraphIndex) => {
    return (paragraph.en.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
      .map((text, localIndex) => ({ text: text.trim(), paragraphIndex, localIndex }))
      .filter((item) => item.text);
  });
}

function getCurrentArticle() {
  return articles.find((article) => article.id === currentArticleId) || articles[0];
}

function navigate(name) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  screens[name].classList.add("active");
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.nav === name));
  if (name === "library") renderLibrary();
  if (name === "words") renderWords();
}

function renderStats() {
  document.querySelector("#articleTotal").textContent = articles.length;
  document.querySelector("#wordTotal").textContent = words.length;
  document.querySelector("#streakDays").textContent = localStorage.getItem("mobileMorningStreak") || "0";
}

function renderLibrary() {
  renderStats();
  articleList.innerHTML = articles.length
    ? articles.map((article) => `
      <button class="article-card" data-article="${escapeHtml(article.id)}" type="button">
        <strong>${escapeHtml(article.title)}</strong>
        <span>${escapeHtml(article.source)} · ${new Date(article.importedAt).toLocaleDateString("zh-CN")}</span>
        <span>${article.paragraphs.length} 段 · ${article.audioUrl ? "有音频" : "无音频"}</span>
      </button>
    `).join("")
    : `<div class="article-card"><strong>还没有文章</strong><span>点“导入文章”，粘贴你能合法访问的材料。</span></div>`;
}

function renderReader() {
  const article = getCurrentArticle();
  if (!article) {
    navigate("library");
    return;
  }
  const sentences = splitSentences(article);
  sentenceIndex = Math.min(progress[article.id]?.sentenceIndex || 0, Math.max(0, sentences.length - 1));
  readerTitle.textContent = article.title;
  readerSource.textContent = article.source;
  humanAudio.src = article.audioUrl || "";
  humanAudio.classList.toggle("has-audio", Boolean(article.audioUrl));

  readerBody.innerHTML = article.paragraphs.map((paragraph, paragraphIndex) => {
    const sentenceHtml = (paragraph.en.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [paragraph.en]).map((sentence, localIndex) => {
      const globalIndex = sentences.findIndex((item) => item.paragraphIndex === paragraphIndex && item.localIndex === localIndex);
      return `<span class="sentence ${globalIndex === sentenceIndex ? "current" : ""}" data-sentence="${globalIndex}">${escapeHtml(sentence.trim())} </span>`;
    }).join("");
    const active = sentences[sentenceIndex]?.paragraphIndex === paragraphIndex ? "active" : "";
    return `
      <section class="paragraph ${active}">
        <p class="english" lang="en">${sentenceHtml}</p>
        ${paragraph.zh ? `<p class="chinese">${escapeHtml(paragraph.zh)}</p>` : ""}
        ${paragraph.note ? `<p class="note-block">${escapeHtml(paragraph.note)}</p>` : ""}
      </section>
    `;
  }).join("");

  const pct = sentences.length <= 1 ? 0 : Math.round((sentenceIndex / (sentences.length - 1)) * 100);
  progressBar.value = String(pct);
  readerStatus.textContent = sentences.length ? `第 ${sentenceIndex + 1} / ${sentences.length} 句` : "暂无可朗读句子";
  saveProgress();
}

function saveProgress() {
  const article = getCurrentArticle();
  if (!article) return;
  progress[article.id] = { sentenceIndex, updatedAt: Date.now() };
  save(progressKey, progress);
}

function moveSentence(delta) {
  const article = getCurrentArticle();
  const total = splitSentences(article).length;
  sentenceIndex = Math.max(0, Math.min(total - 1, sentenceIndex + delta));
  renderReader();
}

function speakSentence() {
  const article = getCurrentArticle();
  const current = splitSentences(article)[sentenceIndex];
  if (!current || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  utterance = new SpeechSynthesisUtterance(current.text);
  utterance.lang = "en-US";
  utterance.rate = 0.88;
  utterance.onend = () => {
    const total = splitSentences(article).length;
    if (sentenceIndex < total - 1) {
      sentenceIndex += 1;
      renderReader();
      speakSentence();
    }
  };
  window.speechSynthesis.speak(utterance);
}

function showDictionary() {
  const selection = window.getSelection();
  const text = selection.toString().trim();
  if (!text || text.split(/\s+/).length > 1 || !/[A-Za-z]/.test(text)) return;
  selectedWord = text.replace(/[^A-Za-z-]/g, "");
  const saved = words.find((word) => word.word.toLowerCase() === selectedWord.toLowerCase());
  document.querySelector("#sheetWord").textContent = selectedWord;
  document.querySelector("#sheetMeaning").textContent = saved?.meaning || "本地生词本尚未收录。可以加入生词本，或打开欧路词典查看完整释义。";
  document.querySelector("#eudicLink").href = `eudic://dict/${encodeURIComponent(selectedWord)}?context=${encodeURIComponent(selection.anchorNode?.textContent || "")}`;
  dictSheet.classList.add("visible");
  dictSheet.setAttribute("aria-hidden", "false");
}

function renderWords() {
  document.querySelector("#wordList").innerHTML = words.length
    ? words.map((word) => `
      <div class="word-card">
        <strong>${escapeHtml(word.word)}</strong>
        <p>${escapeHtml(word.meaning)}</p>
      </div>
    `).join("")
    : `<div class="word-card"><strong>暂无生词</strong><p>阅读时选中单词，可以加入这里。</p></div>`;
}

function addSample() {
  const article = parseArticle({
    title: "A lighter way to read",
    source: "Sample",
    audioUrl: "",
    text: sampleText
  });
  articles.unshift(article);
  currentArticleId = article.id;
  save(storeKey, articles);
  renderLibrary();
  renderReader();
  navigate("reader");
}

function updateStreak() {
  const today = new Date().toISOString().slice(0, 10);
  const last = localStorage.getItem("mobileMorningLastRead");
  if (last === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const current = Number(localStorage.getItem("mobileMorningStreak") || "0");
  localStorage.setItem("mobileMorningStreak", String(last === yesterday ? current + 1 : 1));
  localStorage.setItem("mobileMorningLastRead", today);
}

document.querySelectorAll("[data-nav]").forEach((button) => {
  button.addEventListener("click", () => navigate(button.dataset.nav));
});

document.querySelectorAll("[data-open-import]").forEach((button) => {
  button.addEventListener("click", () => navigate("import"));
});

articleList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-article]");
  if (!button) return;
  currentArticleId = button.dataset.article;
  updateStreak();
  renderReader();
  navigate("reader");
});

document.querySelector("#importForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = document.querySelector("#textInput").value.trim();
  if (!text) return;
  const article = parseArticle({
    title: document.querySelector("#titleInput").value,
    source: document.querySelector("#sourceInput").value,
    audioUrl: document.querySelector("#audioInput").value,
    text
  });
  articles.unshift(article);
  currentArticleId = article.id;
  save(storeKey, articles);
  document.querySelector("#titleInput").value = "";
  document.querySelector("#audioInput").value = "";
  document.querySelector("#textInput").value = "";
  renderReader();
  navigate("reader");
});

document.querySelector("#sampleBtn").addEventListener("click", addSample);
document.querySelector("#clearDemoBtn").addEventListener("click", () => {
  articles = articles.filter((article) => article.source !== "Sample");
  save(storeKey, articles);
  renderLibrary();
});

document.querySelector("#speakBtn").addEventListener("click", speakSentence);
document.querySelector("#pauseBtn").addEventListener("click", () => {
  window.speechSynthesis?.cancel();
  humanAudio.pause();
});
document.querySelector("#prevSentenceBtn").addEventListener("click", () => moveSentence(-1));
document.querySelector("#nextSentenceBtn").addEventListener("click", () => moveSentence(1));

progressBar.addEventListener("input", () => {
  const article = getCurrentArticle();
  const total = splitSentences(article).length;
  sentenceIndex = Math.round((Number(progressBar.value) / 100) * Math.max(0, total - 1));
  renderReader();
});

readerBody.addEventListener("mouseup", showDictionary);
readerBody.addEventListener("touchend", () => setTimeout(showDictionary, 120));

document.querySelector("#closeSheetBtn").addEventListener("click", () => {
  dictSheet.classList.remove("visible");
  dictSheet.setAttribute("aria-hidden", "true");
});

document.querySelector("#saveWordBtn").addEventListener("click", () => {
  if (!selectedWord) return;
  if (!words.some((word) => word.word.toLowerCase() === selectedWord.toLowerCase())) {
    words.unshift({ word: selectedWord, meaning: "待查", createdAt: Date.now(), articleId: currentArticleId });
    save(wordKey, words);
  }
  dictSheet.classList.remove("visible");
  renderStats();
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}

renderLibrary();
