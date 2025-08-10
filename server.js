import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DOCS_FILE = path.join(DATA_DIR, 'docs.json');

// Ensure data dir
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DOCS_FILE)) fs.writeFileSync(DOCS_FILE, JSON.stringify([]));

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());

// Helper to read/write docs
function readDocs() {
  try {
    const raw = fs.readFileSync(DOCS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}
function writeDocs(docs) {
  fs.writeFileSync(DOCS_FILE, JSON.stringify(docs, null, 2));
}

// Routes
app.get('/api/docs', (req, res) => {
  res.json(readDocs());
});

app.post('/api/docs', (req, res) => {
  const { title, content } = req.body || {};
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'content is required' });
  }
  const doc = {
    id: nanoid(10),
    title: title?.trim() || `Tài liệu ${new Date().toLocaleString('vi-VN')}`,
    content,
    createdAt: Date.now(),
  };
  const docs = readDocs();
  docs.unshift(doc);
  writeDocs(docs);
  res.status(201).json(doc);
});

app.get('/api/docs/:id', (req, res) => {
  const doc = readDocs().find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'not found' });
  res.json(doc);
});

// scoring endpoint (optional server calc if needed)
app.post('/api/score', (req, res) => {
  const { target, typed, durationMs } = req.body || {};
  if (typeof target !== 'string' || typeof typed !== 'string') {
    return res.status(400).json({ error: 'target and typed required' });
  }
  const score = computeScore(target, typed, durationMs);
  res.json(score);
});

function computeScore(target, typed, durationMs) {
  const totalChars = target.length;
  // Compare char by char
  let correct = 0;
  const len = Math.min(target.length, typed.length);
  for (let i = 0; i < len; i++) if (target[i] === typed[i]) correct++;
  const errors = Math.max(0, typed.length - correct) + Math.max(0, totalChars - typed.length);

  const minutes = Math.max(0.001, (durationMs || 0) / 60000);
  const grossWPM = typed.length / 5 / minutes;
  const netWPM = Math.max(0, grossWPM - errors / minutes / 5);
  const accuracy = totalChars ? Math.max(0, Math.min(1, correct / totalChars)) : 1;

  return { totalChars, typedChars: typed.length, correct, errors, accuracy, grossWPM, netWPM };
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
