const defaultKnowledge = window.PROJECT_KNOWLEDGE || { documents: [], stats: {} };

const icons = {
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 7h5l2 2h11v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
  spark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M13 2 4 14h7l-1 8 10-13h-7z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m20 6-11 11-5-5"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/></svg>`,
  target: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M3 12A9 9 0 0 1 18.5 5.8"/><path d="M18 2v4h4"/><path d="M6 22v-4H2"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg>`,
  volume: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`
};

const STORAGE_KEY = "project-tutor-state-v1";
const state = {
  documents: defaultKnowledge.documents,
  query: "",
  section: "All",
  selectedId: defaultKnowledge.documents[0]?.id,
  mode: "Explain",
  selectedQuiz: null,
  quizResult: null,
  askAnswer: "",
  voiceStatus: "",
  listeningTarget: null,
  isSpeaking: false,
  mastery: loadMastery()
};

const app = document.querySelector("#app");
let activeRecognition = null;

function loadMastery() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveMastery() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.mastery));
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !["with", "from", "that", "this", "into", "have", "will", "must", "should", "canonical"].includes(word));
}

function getSelectedDoc() {
  return state.documents.find((doc) => doc.id === state.selectedId) || state.documents[0];
}

function getSections() {
  const counts = new Map();
  for (const doc of state.documents) counts.set(doc.section || "Unsorted", (counts.get(doc.section || "Unsorted") || 0) + 1);
  return ["All", ...Array.from(counts.keys()).sort((a, b) => counts.get(b) - counts.get(a))];
}

function getFilteredDocs() {
  const query = state.query.trim().toLowerCase();
  return state.documents.filter((doc) => {
    const sectionMatch = state.section === "All" || doc.section === state.section;
    const text = `${doc.title} ${doc.file} ${doc.section} ${(doc.headings || []).join(" ")} ${doc.summary}`.toLowerCase();
    return sectionMatch && (!query || text.includes(query));
  });
}

function getMastery(docId) {
  return state.mastery[docId] || { seen: false, correct: 0, attempts: 0, noteScore: 0 };
}

function masteryPercent(docId) {
  const item = getMastery(docId);
  const quiz = item.attempts ? Math.min(50, Math.round((item.correct / item.attempts) * 50)) : 0;
  return Math.min(100, (item.seen ? 25 : 0) + quiz + (item.noteScore || 0));
}

function overallMastery() {
  if (!state.documents.length) return 0;
  return Math.round(state.documents.reduce((sum, doc) => sum + masteryPercent(doc.id), 0) / state.documents.length);
}

function createQuiz(doc) {
  const headings = (doc.headings || []).filter(Boolean);
  const correct = headings[0] || doc.keyPhrases?.[0] || doc.title;
  const pool = state.documents
    .filter((item) => item.id !== doc.id)
    .flatMap((item) => item.headings?.slice(0, 2) || [item.title])
    .filter(Boolean);
  const distractors = pool.sort(() => 0.5 - Math.random()).slice(0, 3);
  const options = [correct, ...distractors].sort(() => 0.5 - Math.random());
  return {
    prompt: `Which concept is most central to "${doc.title}"?`,
    correct,
    options,
    explanation: `The strongest evidence is in ${doc.file}: ${doc.summary || doc.excerpt || "the selected source document."}`
  };
}

function buildTeachPoints(doc) {
  const title = doc.title || doc.file;
  const section = doc.section || "project knowledge";
  const headings = doc.headings || [];
  const firstHeading = headings[0] || "its operating commitments";
  const secondHeading = headings[1] || "its related governance surface";
  return [
    `${title} belongs to the ${section} part of the canon, so read it as part of that operating layer rather than as a standalone note.`,
    `Start with ${firstHeading}; it is the fastest entry point into what this document wants a reader to understand or do.`,
    `${secondHeading} is the second anchor. Compare it with the glossary and charter language when you test whether you really understand the concept.`,
    `A useful recall test: explain what authority this document assigns, what risk it controls, and which adjacent files it depends on.`
  ];
}

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function supportsSpeechInput() {
  return Boolean(getSpeechRecognition());
}

function supportsSpeechOutput() {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function getExplanationText(doc) {
  return buildTeachPoints(doc).join(" ");
}

function setVoiceStatus(message, target = null) {
  state.voiceStatus = message;
  state.listeningTarget = target;
  render();
}

function stopListening() {
  if (activeRecognition) {
    activeRecognition.onend = null;
    activeRecognition.stop();
    activeRecognition = null;
  }
  state.listeningTarget = null;
  state.voiceStatus = "Listening stopped.";
  render();
}

function startListening(target) {
  const Recognition = getSpeechRecognition();
  if (!Recognition) {
    setVoiceStatus("Speech input is not supported in this browser. Try Chrome or Edge for dictation.");
    return;
  }
  if (activeRecognition) stopListening();

  const recognition = new Recognition();
  activeRecognition = recognition;
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.onstart = () => setVoiceStatus(target === "teachBack" ? "Listening for your teach-back..." : "Listening for your question...", target);
  recognition.onerror = (event) => {
    activeRecognition = null;
    setVoiceStatus(event.error === "not-allowed" ? "Microphone permission was blocked or dismissed." : `Voice input stopped: ${event.error}.`);
  };
  recognition.onend = () => {
    activeRecognition = null;
    if (state.listeningTarget === target) setVoiceStatus("Voice input ended.");
  };
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0]?.transcript || "")
      .join(" ")
      .trim();
    activeRecognition = null;
    state.listeningTarget = null;
    state.voiceStatus = transcript ? `Heard: "${transcript}"` : "I did not catch that. Try again close to the mic.";
    if (transcript && target === "ask") {
      state.mode = "Ask";
      state.askAnswer = askLocalQuestion(transcript, getSelectedDoc());
      state.pendingAskText = transcript;
    }
    if (transcript && target === "teachBack") {
      state.mode = "Quiz";
      state.pendingTeachBackText = transcript;
    }
    render();
  };
  recognition.start();
}

function speakText(text) {
  if (!supportsSpeechOutput()) {
    setVoiceStatus("Speech playback is not supported in this browser.");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.94;
  utterance.pitch = 1;
  utterance.onstart = () => {
    state.isSpeaking = true;
    state.voiceStatus = "Reading aloud...";
    render();
  };
  utterance.onend = () => {
    state.isSpeaking = false;
    state.voiceStatus = "Finished reading.";
    render();
  };
  utterance.onerror = () => {
    state.isSpeaking = false;
    state.voiceStatus = "Speech playback stopped.";
    render();
  };
  window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  if (supportsSpeechOutput()) window.speechSynthesis.cancel();
  state.isSpeaking = false;
  state.voiceStatus = "Speech playback stopped.";
  render();
}

function askLocalQuestion(question, doc) {
  const terms = tokenize(question);
  if (!terms.length) return "Ask a focused question about a role, layer, doctrine, workflow, or risk surface and I will search the loaded knowledge snapshot.";
  const docs = state.documents
    .map((item) => {
      const haystack = `${item.title} ${item.section} ${item.summary} ${item.excerpt} ${(item.headings || []).join(" ")}`;
      const score = terms.reduce((sum, term) => sum + (haystack.toLowerCase().includes(term) ? 1 : 0), 0);
      return { item, score };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (!docs.length) return `I did not find a strong match in the loaded snapshot. Try a canon term like "Joint Clinical Authority", "Stack Passport", "Florence-X", "EDENA", "Stop-the-Line", or choose a narrower file.`;

  return docs
    .map(({ item }) => `${item.title}: ${item.summary || item.excerpt || "Relevant document found."}`)
    .join("\n\n");
}

async function importFolder(files) {
  const docs = [];
  for (const file of Array.from(files)) {
    const isText = /\.(md|txt|json)$/i.test(file.name);
    if (!isText) continue;
    const text = await file.text();
    docs.push(parseTextFile(file.webkitRelativePath || file.name, text));
  }
  if (docs.length) {
    state.documents = docs.sort((a, b) => a.file.localeCompare(b.file));
    state.selectedId = docs[0].id;
    state.section = "All";
    state.query = "";
    state.quizResult = null;
    state.askAnswer = "";
    render();
  }
}

function parseTextFile(path, text) {
  const file = path.split("/").pop();
  const titleMatch = text.match(/^#\s+(.+)$/m) || text.match(/title:\s*["']?(.+?)["']?$/m);
  const title = (titleMatch?.[1] || file.replace(/\.(md|txt|json)$/i, "").replace(/[-_]/g, " ")).trim();
  const headings = Array.from(text.matchAll(/^#{2,3}\s+(.+)$/gm)).map((match) => match[1].trim()).slice(0, 12);
  const paragraphs = text
    .replace(/^---[\s\S]*?---/, "")
    .split(/\n{2,}/)
    .map((part) => part.replace(/[#>*`|-]/g, " ").replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 80);
  return {
    id: slug(path),
    file,
    path,
    title,
    section: inferSection(file, text),
    summary: paragraphs[0]?.slice(0, 460) || "",
    excerpt: paragraphs.slice(0, 3).join(" ").slice(0, 1400),
    headings,
    keyPhrases: extractKeyPhrases(`${title} ${headings.join(" ")} ${paragraphs.slice(0, 2).join(" ")}`)
  };
}

function inferSection(file, text = "") {
  const haystack = `${file} ${text.slice(0, 1200)}`.toLowerCase();
  if (/manifesto|mission|glossary|foundational|realignment|refactor/.test(haystack)) return "Foundation";
  if (/charter|governance|legal|grievance|whistleblower|treasury|congress|retrospective/.test(haystack)) return "Governance";
  if (/florence|architecture|compute|energy|edge|agent|robotics|wearables/.test(haystack)) return "Architecture";
  if (/curriculum|program|fellowship|passport|credential|training|labor|jobs|arc|lane|reviewer/.test(haystack)) return "Workforce";
  if (/security|risk|incident|vendor|insurance|adversarial|audit|bias|evidence/.test(haystack)) return "Risk";
  if (/patient|family|vulnerable|scope|ehr|payer|reimbursement|regulatory/.test(haystack)) return "Clinical";
  if (/fmn|media|namos|pitch|website|brand|content/.test(haystack)) return "Narrative";
  return "Reference";
}

function extractKeyPhrases(text) {
  const words = tokenize(text);
  const counts = new Map();
  for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

function render() {
  const doc = getSelectedDoc();
  if (doc && !getMastery(doc.id).seen) {
    state.mastery[doc.id] = { ...getMastery(doc.id), seen: true };
    saveMastery();
  }

  app.innerHTML = `
    <div class="app-shell">
      ${renderTopbar()}
      <div class="workspace">
        ${renderSidebar()}
        ${renderMain(doc)}
        ${renderCoach(doc)}
      </div>
    </div>
    <input class="hidden" id="folderInput" type="file" webkitdirectory directory multiple />
  `;
  bindEvents();
}

function renderTopbar() {
  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">${icons.book}</div>
        <div>
          <h1>Project Tutor</h1>
          <span>${state.documents.length} knowledge files loaded</span>
        </div>
      </div>
      <select class="project-select" aria-label="Project selector">
        <option>NIN-NAIO-Florence-X Civilization Layer</option>
      </select>
      <nav class="mode-tabs" aria-label="Study mode">
        ${["Explain", "Quiz", "Mastery", "Ask"].map((mode) => `<button class="tab ${state.mode === mode ? "active" : ""}" data-mode="${mode}">${mode}</button>`).join("")}
      </nav>
      <div class="top-actions">
        <button class="button ghost" id="readButton" title="Read the current explanation aloud">${state.isSpeaking ? icons.stop : icons.volume}<span>${state.isSpeaking ? "Stop" : "Read Aloud"}</span></button>
        <button class="button" id="folderButton" title="Import knowledge folder">${icons.upload}<span>Import Files</span></button>
        <button class="button primary" id="quizButton" title="Generate a test">${icons.target}<span>Generate Test</span></button>
      </div>
    </header>
  `;
}

function renderSidebar() {
  const docs = getFilteredDocs();
  return `
    <aside class="panel sidebar">
      <div class="panel-head">
        <h2>Knowledge Files</h2>
        <label class="search">${icons.search}<input id="searchInput" value="${escapeHtml(state.query)}" placeholder="Search doctrine, roles, layers..." /></label>
      </div>
      <div class="section-filter">
        ${getSections().slice(0, 10).map((section) => `<button class="chip ${state.section === section ? "active" : ""}" data-section="${escapeHtml(section)}">${section}</button>`).join("")}
      </div>
      <div class="file-list">
        ${docs.length ? docs.map(renderFileItem).join("") : `<div class="empty">No matching files.</div>`}
      </div>
    </aside>
  `;
}

function renderFileItem(doc) {
  return `
    <button class="file-item ${state.selectedId === doc.id ? "active" : ""}" data-doc="${doc.id}">
      <span class="file-title">${icons.folder}<span>${escapeHtml(doc.title)}</span></span>
      <span class="file-meta"><span>${escapeHtml(doc.section || "Reference")}</span><span>${masteryPercent(doc.id)}%</span></span>
    </button>
  `;
}

function renderMain(doc) {
  if (!doc) return `<main class="panel main"><div class="empty">Import a folder of Markdown, text, or JSON files to begin.</div></main>`;
  const points = buildTeachPoints(doc);
  const headings = doc.headings || [];
  return `
    <main class="panel main">
      <section class="hero">
        <div>
          <h2>${escapeHtml(doc.title)}</h2>
          <p>${escapeHtml(doc.summary || "This file is loaded into the tutor. Use the explanation, quiz, and ask modes to turn it into working understanding.")}</p>
        </div>
        <div class="score-card">
          <span class="small-muted">File mastery</span>
          <strong>${masteryPercent(doc.id)}%</strong>
          <div class="bar" style="--value:${masteryPercent(doc.id)}%"><span></span></div>
        </div>
      </section>
      <section class="content-grid">
        <article class="content-card ${state.mode !== "Explain" ? "hidden" : ""}">
          <h3>Explain This To Me</h3>
          <ul class="explain-list">
            ${points.map((point, index) => `<li><span class="number">${index + 1}</span><span>${escapeHtml(point)}</span></li>`).join("")}
          </ul>
        </article>
        <article class="content-card ${state.mode !== "Explain" ? "hidden" : ""}">
          <h3>Source Grounding</h3>
          <div class="source-box">${escapeHtml(doc.excerpt || doc.summary || "No excerpt available in the bundled snapshot.")}</div>
        </article>
        <article class="content-card ${state.mode !== "Ask" ? "hidden" : ""}">
          <h3>Ask The Loaded Files</h3>
          <div class="ask-row">
            <input id="askInput" value="${escapeHtml(state.pendingAskText || "")}" placeholder="Example: how do nurses and physicians share authority?" />
            <button class="button icon voice-button ${state.listeningTarget === "ask" ? "listening" : ""}" id="voiceAskButton" title="Speak a question" aria-label="Speak a question">${state.listeningTarget === "ask" ? icons.stop : icons.mic}</button>
            <button class="button primary" id="askButton">Ask</button>
          </div>
          <div class="voice-status">${escapeHtml(state.voiceStatus || voiceSupportText())}</div>
          <div class="ask-answer">${escapeHtml(state.askAnswer || "Answers are grounded in the loaded file summaries and excerpts.")}</div>
        </article>
        <article class="content-card ${state.mode !== "Mastery" ? "hidden" : ""}">
          <h3>What To Remember</h3>
          <ul class="concept-list">
            ${(doc.keyPhrases || []).slice(0, 6).map((phrase, index) => `<li><span class="number">${index + 1}</span><span>${escapeHtml(phrase)}</span></li>`).join("")}
          </ul>
        </article>
        <article class="content-card ${state.mode !== "Quiz" ? "hidden" : ""}">
          <h3>Teach-Back Check</h3>
          <textarea class="answer-box" id="teachBack" placeholder="Explain this file in your own words. Include authority, risk, and adjacent canon links.">${escapeHtml(state.pendingTeachBackText || "")}</textarea>
          <div class="teachback-actions">
            <button class="button icon voice-button ${state.listeningTarget === "teachBack" ? "listening" : ""}" id="voiceTeachBackButton" title="Speak your teach-back" aria-label="Speak your teach-back">${state.listeningTarget === "teachBack" ? icons.stop : icons.mic}</button>
            <button class="button primary" id="checkTeachBack">${icons.check}<span>Check Answer</span></button>
          </div>
          <div class="voice-status">${escapeHtml(state.voiceStatus || voiceSupportText())}</div>
          ${state.quizResult ? `<div class="result">${escapeHtml(state.quizResult)}</div>` : ""}
        </article>
        <article class="content-card">
          <h3>Document Map</h3>
          <div class="headings">
            ${headings.length ? headings.slice(0, 8).map((heading, index) => `<div class="heading-row"><strong>${escapeHtml(heading)}</strong><span>Study checkpoint ${index + 1}</span></div>`).join("") : `<div class="heading-row"><strong>No headings found</strong><span>Use the source excerpt and quiz mode instead.</span></div>`}
          </div>
        </article>
      </section>
    </main>
  `;
}

function voiceSupportText() {
  if (supportsSpeechInput() && supportsSpeechOutput()) return "Voice ready. Use the mic to dictate or Read Aloud to listen.";
  if (supportsSpeechOutput()) return "Read Aloud is available. Speech input is not supported in this browser.";
  if (supportsSpeechInput()) return "Speech input is available. Read Aloud is not supported in this browser.";
  return "Voice features need a browser with Web Speech support.";
}

function renderCoach(doc) {
  const quiz = state.selectedQuiz || (doc ? createQuiz(doc) : null);
  if (!state.selectedQuiz && quiz) state.selectedQuiz = quiz;
  return `
    <aside class="panel coach">
      <section class="coach-section">
        <h2 class="section-title">Mastery</h2>
        <div class="progress-row">
          <div class="progress-label"><span>Overall project</span><strong>${overallMastery()}%</strong></div>
          <div class="bar" style="--value:${overallMastery()}%"><span></span></div>
        </div>
        <div class="progress-row">
          <div class="progress-label"><span>Current file</span><strong>${doc ? masteryPercent(doc.id) : 0}%</strong></div>
          <div class="bar" style="--value:${doc ? masteryPercent(doc.id) : 0}%"><span></span></div>
        </div>
      </section>
      <section class="coach-section">
        <h2 class="section-title">Active Quiz</h2>
        ${quiz ? renderQuiz(quiz) : `<div class="empty">Load files to generate a quiz.</div>`}
      </section>
      <section class="coach-section">
        <h2 class="section-title">Learning Path</h2>
        <div class="learning-path">
          ${["Foundation", "Architecture", "Governance", "Workforce", "Clinical", "Risk"].map((section) => renderPathStep(section)).join("")}
        </div>
      </section>
    </aside>
  `;
}

function renderQuiz(quiz) {
  return `
    <div class="quiz-card">
      <h3>${escapeHtml(quiz.prompt)}</h3>
      <div class="quiz-options">
        ${quiz.options.map((option) => `<button data-answer="${escapeHtml(option)}">${escapeHtml(option)}</button>`).join("")}
      </div>
      ${state.quizResult ? `<div class="result">${escapeHtml(state.quizResult)}</div>` : ""}
    </div>
  `;
}

function renderPathStep(section) {
  const docs = state.documents.filter((doc) => doc.section === section);
  const percent = docs.length ? Math.round(docs.reduce((sum, doc) => sum + masteryPercent(doc.id), 0) / docs.length) : 0;
  return `
    <div class="path-step">
      <span class="check">${percent > 40 ? icons.check : ""}</span>
      <div><strong>${section}</strong><span>${docs.length} files · ${percent}% mastery</span></div>
    </div>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      render();
    });
  });
  document.querySelector("#searchInput")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });
  document.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => {
      state.section = button.dataset.section;
      render();
    });
  });
  document.querySelectorAll("[data-doc]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.doc;
      state.selectedQuiz = null;
      state.quizResult = null;
      render();
    });
  });
  document.querySelector("#folderButton")?.addEventListener("click", () => document.querySelector("#folderInput").click());
  document.querySelector("#folderInput")?.addEventListener("change", (event) => importFolder(event.target.files));
  document.querySelector("#readButton")?.addEventListener("click", () => {
    if (state.isSpeaking) stopSpeaking();
    else speakText(getExplanationText(getSelectedDoc()));
  });
  document.querySelector("#quizButton")?.addEventListener("click", () => {
    state.mode = "Quiz";
    state.selectedQuiz = createQuiz(getSelectedDoc());
    state.quizResult = null;
    render();
  });
  document.querySelectorAll("[data-answer]").forEach((button) => {
    button.addEventListener("click", () => checkQuiz(button.dataset.answer));
  });
  document.querySelector("#checkTeachBack")?.addEventListener("click", checkTeachBack);
  document.querySelector("#askButton")?.addEventListener("click", () => {
    const question = document.querySelector("#askInput").value;
    state.pendingAskText = question;
    state.askAnswer = askLocalQuestion(question, getSelectedDoc());
    render();
  });
  document.querySelector("#voiceAskButton")?.addEventListener("click", () => {
    if (state.listeningTarget === "ask") stopListening();
    else startListening("ask");
  });
  document.querySelector("#voiceTeachBackButton")?.addEventListener("click", () => {
    if (state.listeningTarget === "teachBack") stopListening();
    else startListening("teachBack");
  });
}

function checkQuiz(answer) {
  const doc = getSelectedDoc();
  const quiz = state.selectedQuiz;
  const item = getMastery(doc.id);
  const correct = answer === quiz.correct;
  state.mastery[doc.id] = {
    ...item,
    attempts: item.attempts + 1,
    correct: item.correct + (correct ? 1 : 0)
  };
  state.quizResult = correct ? `Correct. ${quiz.explanation}` : `Not quite. The best answer is "${quiz.correct}". ${quiz.explanation}`;
  saveMastery();
  render();
}

function checkTeachBack() {
  const doc = getSelectedDoc();
  const text = document.querySelector("#teachBack").value;
  state.pendingTeachBackText = text;
  const expected = tokenize(`${doc.title} ${doc.summary} ${(doc.headings || []).join(" ")} ${(doc.keyPhrases || []).join(" ")}`);
  const answer = tokenize(text);
  const hits = new Set(answer.filter((word) => expected.includes(word)));
  const score = Math.min(25, Math.round(hits.size * 4));
  const item = getMastery(doc.id);
  state.mastery[doc.id] = { ...item, noteScore: Math.max(item.noteScore || 0, score) };
  state.quizResult = score > 14
    ? `Strong teach-back. You touched ${hits.size} source concepts. Now add one concrete adjacent document or role relationship.`
    : `Good start. Try again with the file's authority model, risk surface, and two exact terms from the document map.`;
  saveMastery();
  render();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

render();
