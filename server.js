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
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// Ensure data dir
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DOCS_FILE)) fs.writeFileSync(DOCS_FILE, JSON.stringify([]));
if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));

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

// History helpers
function readHistory(){
  try{
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    return JSON.parse(raw);
  }catch{
    return [];
  }
}
function writeHistory(items){
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(items, null, 2));
}

// Routes
app.get('/api/docs', (req, res) => {
  res.json(readDocs());
});

// Default preset documents (English)
const DEFAULT_DOCS = [
  {
    title: 'EN 6: travelling overseas',
    content: `Travelling overseas can be complicated if you wish to hire and drive a car. We often don’t give much thought to the problems encountered in a strange country when we are planning our itinerary. At
home it is second nature for us to jump into the car and drive somewhere.`
  },
  {
    title: 'EN 7: autumn leaves',
    content: `When the leaves on trees and bushes get their autumn tunings it is a very colorful time in the garden. The sad dest part about autumn is the anticipation of those cold, dreary winter months that must be endured   before we once again enjoy
the sight of the buds coming out.`
  },
  {
    title: 'EN 9: prepare dinner',
    content: `The children in the family wanted to surprise their mother and prepare dinner for her. Tom decided to check the availability of the required ingredients. Jan wrote the list as he called out the missing items: a cup of champignons, 5 veal fillets, unsalted butter and an onion.`
  },
  {
    title: 'EN 15: tax returns',
    content: `As June draws closer, we start to think about our tax returns, and we despair of finding the vouchers and receipts required for everything we wish to claim. Some of us do know exactly where they are, but others search everywhere: in boxes, flowerpots and even queerer places.`
  },
  {
    title: 'EN 17: first speed lesson',
    content: `This is the first speed lesson in this book. You can add to your speed if you make the most of the work on this page, which is set up to help you to type at a smooth and fast pace. First you type a lot of easy words that will get your fingers flying, and then you try to keep them flying at your best speed for a longer and longer time.`
  },
  {
    title: 'EN 18: good team',
    content: `Most of us like to be on a good team and to help it win, if we can. We get a lot of pleasure from doing our share, and we do not like t he fellow who ducks doing his. That is one thing to remember if you ever go to work on an office team. None of us like the fellow who ducks his share of the work.`
  }
];

// Seed defaults if missing (by title)
function seedDefaultDocs(){
  const docs = readDocs();
  const byTitle = new Map(docs.map(d => [d.title, d]));
  let changed = false;
  for (const def of DEFAULT_DOCS){
    const existing = byTitle.get(def.title);
    if (existing){
      if (existing.content !== def.content){
        existing.content = def.content;
        changed = true;
      }
    } else {
      const newDoc = { id: nanoid(10), title: def.title, content: def.content, createdAt: Date.now() };
      docs.unshift(newDoc);
      changed = true;
    }
  }
  if (changed){
    writeDocs(docs);
    console.log('Seeded/updated default docs.');
  }
}
seedDefaultDocs();

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

// History APIs
// List history with optional filters: ?limit=200&userId=...&since=timestamp&until=timestamp
app.get('/api/history', (req, res) => {
  const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 200));
  const userId = req.query.userId ? String(req.query.userId) : null;
  const since = req.query.since ? Number(req.query.since) : null;
  const until = req.query.until ? Number(req.query.until) : null;
  let items = readHistory();
  if (userId) items = items.filter(i => i.userId === userId);
  if (since) items = items.filter(i => (i.createdAt || 0) >= since);
  if (until) items = items.filter(i => (i.createdAt || 0) <= until);
  items.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));
  res.json(items.slice(0, limit));
});

// Append a history record
app.post('/api/history', (req, res) => {
  const { userId, sessionId, round, docId, docTitle, mode, words, errors, durationMs, startedAt, client } = req.body || {};
  if (!userId || !docId || typeof words !== 'number' || typeof errors !== 'number'){
    return res.status(400).json({ error: 'userId, docId, words, errors are required' });
  }
  const item = {
    id: nanoid(12),
    userId: String(userId),
    sessionId: sessionId ? String(sessionId) : undefined,
    round: typeof round === 'number' ? round : undefined,
    docId: String(docId),
    docTitle: docTitle ? String(docTitle) : undefined,
    mode: mode === 'script' ? 'script' : 'random',
    words: Number(words),
    errors: Number(errors),
    durationMs: typeof durationMs === 'number' ? durationMs : undefined,
    startedAt: typeof startedAt === 'number' ? startedAt : undefined,
    client: client && typeof client === 'object' ? client : undefined,
    createdAt: Date.now(),
  };
  const items = readHistory();
  items.unshift(item);
  // Optional cap to prevent unbounded growth
  if (items.length > 50000) items.length = 50000;
  writeHistory(items);
  res.status(201).json({ ok: true, id: item.id });
});

app.get('/api/docs/:id', (req, res) => {
  const doc = readDocs().find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'not found' });
  res.json(doc);
});

app.delete('/api/docs/:id', (req, res) => {
  const id = req.params.id;
  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const [deleted] = docs.splice(idx, 1);
  writeDocs(docs);
  res.json({ ok: true, deleted: { id: deleted.id, title: deleted.title } });
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
  // Normalize punctuation for fair scoring (e.g., curly quotes)
  const nt = normalizeText(target);
  const ny = normalizeText(typed);
  const totalChars = nt.length;
  // character-level edit distance
  const errors = charEditDistance(nt, ny);

  const minutes = Math.max(0.001, (durationMs || 0) / 60000);
  const grossWPM = ny.length / 5 / minutes;
  const netWPM = Math.max(0, grossWPM - (errors / 5) / minutes);
  const accuracy = totalChars ? Math.max(0, Math.min(1, (totalChars - errors) / totalChars)) : 1;

  return { totalChars, typedChars: ny.length, errors, accuracy, grossWPM, netWPM };
}

function charEditDistance(a, b){
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, ()=>Array(n+1).fill(0));
  for (let i=0;i<=m;i++) dp[i][0] = i;
  for (let j=0;j<=n;j++) dp[0][j] = j;
  for (let i=1;i<=m;i++){
    for (let j=1;j<=n;j++){
      const cost = a.charAt(i-1) === b.charAt(j-1) ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i-1][j] + 1,
        dp[i][j-1] + 1,
        dp[i-1][j-1] + cost
      );
    }
  }
  return dp[m][n];
}

function normalizeText(s){
  return String(s || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00A0/g, ' ');
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
