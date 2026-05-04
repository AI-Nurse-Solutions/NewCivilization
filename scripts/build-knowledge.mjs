import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceDir = process.argv[2] || "/Users/robertdomondon/downloads/new_civilization";
const outFile = path.resolve("data/knowledge.js");

const sectionRules = [
  ["Foundation", /manifesto|mission|glossary|foundational|realignment|refactor/i],
  ["Governance", /charter|governance|legal|grievance|whistleblower|treasury|congress|retrospective|entity/i],
  ["Architecture", /florence|architecture|compute|energy|edge|agent|robotics|wearables|sovereign/i],
  ["Workforce", /curriculum|program|fellowship|passport|credential|training|labor|jobs|arc|lane|reviewer|bounty|provisions/i],
  ["Risk", /security|risk|incident|vendor|insurance|adversarial|audit|bias|evidence|liability/i],
  ["Clinical", /patient|family|vulnerable|scope|ehr|payer|reimbursement|regulatory|allied|physician|nurse/i],
  ["Narrative", /fmn|media|namos|pitch|website|brand|content|launch|editorial/i]
];

const stopWords = new Set([
  "with", "from", "that", "this", "into", "have", "will", "must", "should", "canonical",
  "document", "section", "system", "layer", "doctrine", "authority", "governance"
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    if (entry.isFile() && /\.(md|txt|json|docx)$/i.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function clean(text) {
  return text
    .replace(/^---[\s\S]*?---/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*`|[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stopWords.has(word));
}

function keyPhrases(text) {
  const counts = new Map();
  for (const word of tokenize(text)) counts.set(word, (counts.get(word) || 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

function inferSection(file, text) {
  const haystack = `${file} ${text.slice(0, 1600)}`;
  return sectionRules.find(([, rule]) => rule.test(haystack))?.[0] || "Reference";
}

function parseDoc(fullPath, text) {
  const relativePath = path.relative(sourceDir, fullPath);
  const file = path.basename(fullPath);
  if (/\.docx$/i.test(file)) {
    const title = file.replace(/\.docx$/i, "").replace(/[-_]/g, " ");
    return {
      id: slug(relativePath),
      file,
      path: relativePath,
      title,
      section: inferSection(file, ""),
      summary: "Office document detected. This app lists it in the project map, but direct browser import currently teaches from Markdown, text, and JSON files.",
      excerpt: "Convert this file to Markdown or paste its contents into a text file to make it fully searchable and quiz-ready inside Project Tutor.",
      headings: ["Office document placeholder", "Convert to Markdown for full tutoring"],
      keyPhrases: keyPhrases(title)
    };
  }
  let parsedJson;
  if (/\.json$/i.test(file)) {
    try {
      parsedJson = JSON.parse(text);
    } catch {
      parsedJson = null;
    }
  }
  const titleMatch = text.match(/^#\s+(.+)$/m) || text.match(/title:\s*["']?(.+?)["']?$/m);
  const title = parsedJson?.name || titleMatch?.[1]?.trim() || file.replace(/\.(md|txt|json)$/i, "").replace(/[-_]/g, " ");
  const headings = Array.from(text.matchAll(/^#{2,3}\s+(.+)$/gm))
    .map((match) => match[1].replace(/#+$/, "").trim())
    .filter(Boolean)
    .slice(0, 14);
  const paragraphs = clean(text)
    .split(/(?<=[.!?])\s+/)
    .reduce((parts, sentence) => {
      const last = parts[parts.length - 1] || "";
      if (last.length < 320) parts[parts.length - 1] = `${last} ${sentence}`.trim();
      else parts.push(sentence);
      return parts;
    }, [""])
    .filter((part) => part.length > 80);
  const summary = paragraphs[0]?.slice(0, 520) || parsedJson?.description || "";
  const excerpt = paragraphs.slice(0, 4).join(" ").slice(0, 1600);
  const section = parsedJson?.section || inferSection(file, text);
  return {
    id: slug(relativePath),
    file,
    path: relativePath,
    title,
    section,
    summary,
    excerpt,
    headings,
    keyPhrases: keyPhrases(`${title} ${headings.join(" ")} ${summary} ${excerpt}`)
  };
}

const files = await walk(sourceDir);
const documents = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  documents.push(parseDoc(file, text));
}

documents.sort((a, b) => {
  const sectionCompare = a.section.localeCompare(b.section);
  return sectionCompare || a.file.localeCompare(b.file);
});

const sections = Object.fromEntries(
  Array.from(documents.reduce((map, doc) => map.set(doc.section, (map.get(doc.section) || 0) + 1), new Map()).entries())
);

const payload = {
  sourceDir,
  builtAt: new Date().toISOString(),
  stats: {
    files: documents.length,
    sections
  },
  documents
};

await writeFile(outFile, `window.PROJECT_KNOWLEDGE = ${JSON.stringify(payload, null, 2)};\n`);
console.log(`Wrote ${documents.length} documents to ${outFile}`);
