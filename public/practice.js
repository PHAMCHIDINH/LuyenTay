const $ = sel => document.querySelector(sel);

function getQueryParam(name){
  const url = new URL(location.href);
  return url.searchParams.get(name);
}

function fmtPercent(p){return (p*100).toFixed(1)+'%'}
function fmtWpm(w){return Math.round(w)}

const API_BASE = localStorage.getItem('API_BASE') || '';

async function fetchJSON(url, opts){
  const full = url.startsWith('http') ? url : API_BASE + url;
  const res = await fetch(full, { headers: { 'Content-Type':'application/json' }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

let doc = null;
let docWords = [];
let streamWords = [];
let typedWords = [];
let currentIndex = 0;
let wordMode = 'random'; // 'random' | 'script'
let startTime = null;
let timerId = null;       // metrics updater
let countdownId = null;   // per-round countdown
let breakId = null;       // break countdown
const timeLimitMs = 60_000; // 1 minute per requirement
const breakMs = 5_000;      // 5 seconds break
let testMode = {
  active: false,
  round: 0,
  maxRounds: 3,
  best: null,
  results: [],
  status: 'idle', // idle | waiting | running | break | finished
  lastErrors: null
};

function computeScore(target, typed, durationMs){
  // Character-level edit distance after completion
  const errors = charEditDistance(target, typed);
  const totalChars = target.length;
  const minutes = Math.max(0.001, (durationMs||0)/60000);
  const grossWPM = (typed.length) / 5 / minutes;
  const netWPM = Math.max(0, grossWPM - (errors / 5) / minutes);
  const accuracy = totalChars ? Math.max(0, Math.min(1, (totalChars - errors) / totalChars)) : 1;
  return { totalChars, typedChars: typed.length, errors, accuracy, grossWPM, netWPM };
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
        dp[i-1][j] + 1,      // deletion
        dp[i][j-1] + 1,      // insertion
        dp[i-1][j-1] + cost  // substitution
      );
    }
  }
  return dp[m][n];
}

function escapeHtml(s){
  return s.replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'}[c]));
}

// 10fastfingers-like flow: render words stream, single-word input, submit on Space/Enter
function tokenizeWords(text){
  // Extract word-like tokens (letters incl. Vietnamese range + digits)
  const m = text.match(/[A-Za-zÀ-ỹà-ỹÁ-Ỹ0-9]+/g);
  return m ? m : [];
}

function buildStream(count = 250){
  if (!docWords.length) return [];
  if (wordMode === 'script'){
    // Use the document words in original order, repeating if needed to reach count
    const out = [];
    while (out.length < count){
      const remain = Math.min(count - out.length, docWords.length);
      out.push(...docWords.slice(0, remain));
    }
    return out;
  } else {
    // Random sample with replacement from docWords
    const out = [];
    for (let i=0;i<count;i++){
      const idx = Math.floor(Math.random() * docWords.length);
      out.push(docWords[idx]);
    }
    return out;
  }
}

function renderStream(){
  const cont = document.getElementById('wordsStream');
  cont.innerHTML = '';
  streamWords.forEach((w, i)=>{
    const span = document.createElement('span');
    span.className = 'w' + (i===0 ? ' cur' : '');
    span.textContent = w;
    span.dataset.idx = String(i);
    cont.appendChild(span);
    cont.appendChild(document.createTextNode(' '));
  });
}

function updateCurrentHighlight(){
  const cont = document.getElementById('wordsStream');
  const prev = cont.querySelector('.w.cur');
  if (prev) prev.classList.remove('cur');
  const cur = cont.querySelector(`.w[data-idx="${currentIndex}"]`);
  if (cur) {
    cur.classList.add('cur');
    // ensure visible
    try{ cur.scrollIntoView({ block: 'center', inline: 'nearest' }); }catch{}
  }
}

function markWordResult(idx, ok){
  const cont = document.getElementById('wordsStream');
  const el = cont.querySelector(`.w[data-idx="${idx}"]`);
  if (!el) return;
  el.classList.add(ok ? 'ok' : 'bad');
}

async function init(){
  const id = getQueryParam('id');
  if (!id){
    location.href = '/';
    return;
  }
  doc = await fetchJSON('/api/docs/'+id);
  $('#docTitle').textContent = doc.title;
  docWords = tokenizeWords(doc.content);
  // Initialize first round stream and UI
  // read saved mode
  try{ const saved = localStorage.getItem('WORD_MODE'); if (saved) wordMode = saved; }catch{}
  const modeSel = document.getElementById('wordMode');
  if (modeSel){ modeSel.value = wordMode; }
  streamWords = buildStream();
  typedWords = [];
  currentIndex = 0;
  renderStream();
  $('#wordInput').value = '';
  $('#wordInput').focus();
  resetTimer();
}

function resetTimer(){
  if (timerId) clearInterval(timerId);
  startTime = Date.now();
  timerId = setInterval(updateLiveMetrics, 500);
  if (!testMode.active) updateTimerUI('∞');
}

function updateLiveMetrics(){
  if (!doc) return;
  // Chỉ hiển thị lỗi sau khi kết thúc mỗi lần, tránh tính lỗi theo từng phím (IME tiếng Việt)
  const errEl = document.getElementById('errors');
  if (testMode.active && (testMode.status === 'running' || testMode.status === 'waiting')){
    errEl.textContent = 'Lỗi: —';
  } else if (testMode.lastErrors != null){
    errEl.textContent = 'Lỗi: ' + testMode.lastErrors;
  }
  const wordsEl = document.getElementById('words');
  if (wordsEl) wordsEl.textContent = 'Từ: ' + typedWords.length;
}

function startCountdown(){
  if (countdownId) clearInterval(countdownId);
  const endAt = startTime + timeLimitMs;
  countdownId = setInterval(()=>{
    const remain = Math.max(0, endAt - Date.now());
    updateTimerUI(formatMs(remain));
    if (remain <= 0){
      clearInterval(countdownId);
      countdownId = null;
      endRound();
    }
  }, 200);
}

function updateTimerUI(text){
  const el = document.getElementById('timer');
  if (el) el.textContent = text;
}

function formatMs(ms){
  const s = Math.ceil(ms/1000);
  const mm = Math.floor(s/60).toString().padStart(2,'0');
  const ss = Math.floor(s%60).toString().padStart(2,'0');
  return `${mm}:${ss}`;
}

function startTest(){
  // Enter test mode and wait for first key to start Round 1
  testMode.active = true;
  testMode.round = 1;
  testMode.best = null;
  testMode.results = [];
  testMode.status = 'waiting';
  testMode.lastErrors = null;
  // Reset round stream
  streamWords = buildStream();
  typedWords = [];
  currentIndex = 0;
  renderStream();
  $('#wordInput').value = '';
  $('#wordInput').disabled = false;
  // start button removed; auto mode
  updateRoundInfo();
  updateTimerUI('Chờ bắt đầu...');
  const errEl = document.getElementById('errors'); if (errEl) errEl.textContent = 'Lỗi: —';
}

function prepareNextRound(){
  if (testMode.round >= testMode.maxRounds){
    finishTest();
    return;
  }
  testMode.round += 1;
  testMode.status = 'waiting';
  testMode.lastErrors = null;
  // New stream for the new round
  streamWords = buildStream();
  typedWords = [];
  currentIndex = 0;
  renderStream();
  $('#wordInput').value = '';
  $('#wordInput').disabled = false;
  $('#wordInput').focus();
  updateRoundInfo();
  updateTimerUI('Chờ bắt đầu...');
  const errEl = document.getElementById('errors'); if (errEl) errEl.textContent = 'Lỗi: —';
}

function endRound(){
  const dur = Math.min(Date.now() - startTime, timeLimitMs);
  // Build target/typed strings based on submitted words only
  const wordsTyped = typedWords.length;
  const targetJoined = streamWords.slice(0, wordsTyped).join(' ');
  const typedJoined = typedWords.join(' ');
  const s = computeScore(targetJoined, typedJoined, dur);
  s.wordsCount = wordsTyped;
  testMode.results.push(s);
  if (!testMode.best || s.wordsCount > testMode.best.wordsCount || (s.wordsCount === testMode.best.wordsCount && s.errors < testMode.best.errors)) testMode.best = s;
  $('#wordInput').disabled = true;
  appendResultCard(testMode.round, s);
  updateBestInfo();
  testMode.lastErrors = s.errors;
  const errEl = document.getElementById('errors'); if (errEl) errEl.textContent = 'Lỗi: ' + s.errors;
  startBreak();
}

function updateRoundInfo(){
  const el = document.getElementById('roundInfo');
  if (el) el.textContent = `Lần: ${testMode.round}/${testMode.maxRounds}`;
}

function updateBestInfo(){
  const el = document.getElementById('bestInfo');
  if (el){
  const best = testMode.best ? testMode.best.wordsCount : 0;
  el.textContent = `Tốt nhất: ${best} từ`;
  }
}

function appendResultCard(round, s){
  const div = document.createElement('div');
  div.className = 'result-card';
  div.innerHTML = `
    <span class="badge">Lần ${round}</span>
  <span>Từ: ${s.wordsCount}</span>
  <span>Lỗi: ${s.errors}</span>
  `;
  document.getElementById('testResults').appendChild(div);
}

$('#wordInput').addEventListener('input', updateLiveMetrics);

function startRoundIfFirstKey(){
  if (testMode.active && testMode.status === 'waiting'){
    // Start the round from first key press
    testMode.status = 'running';
    if (timerId) clearInterval(timerId);
    startTime = Date.now();
    timerId = setInterval(updateLiveMetrics, 500);
    startCountdown();
  }
}

function startBreak(){
  testMode.status = 'break';
  updateTimerUI('Nghỉ: 00:05');
  if (breakId) clearInterval(breakId);
  const endAt = Date.now() + breakMs;
  breakId = setInterval(()=>{
    const remain = Math.max(0, endAt - Date.now());
    const s = Math.ceil(remain/1000);
    const mm = Math.floor(s/60).toString().padStart(2,'0');
    const ss = Math.floor(s%60).toString().padStart(2,'0');
    updateTimerUI('Nghỉ: ' + `${mm}:${ss}`);
    if (remain <= 0){
      clearInterval(breakId);
      breakId = null;
      prepareNextRound();
    }
  }, 200);
}

function finishTest(){
  testMode.status = 'finished';
  // no start button to restore
  const best = testMode.best ? {
    words: testMode.best.wordsCount,
    err: testMode.best.errors
  } : null;
  if (best){
    alert(`Kết thúc kiểm tra 3 lần\nTốt nhất: ${best.words} từ\nLỗi: ${best.err}`);
  } else {
    alert('Kết thúc kiểm tra.');
  }
}

function countWords(text){
  const t = (text || '').trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

// Start the round timer when first key is pressed in test mode
document.getElementById('wordInput').addEventListener('input', ()=>{
  startRoundIfFirstKey();
  updateLiveMetrics();
});

// Submit on Space or Enter
document.getElementById('wordInput').addEventListener('keydown', (e)=>{
  if (e.key === ' ' || e.code === 'Space' || e.key === 'Enter'){
    e.preventDefault();
    const val = (e.target.value || '').trim();
    // Only advance if user actually typed something
    if (val.length > 0){
      const target = streamWords[currentIndex] || '';
      const ok = val === target;
      typedWords.push(val);
      markWordResult(currentIndex, ok);
      currentIndex += 1;
      updateCurrentHighlight();
      e.target.value = '';
      updateLiveMetrics();
    }
  }
});

// Mode selector handling
const modeSel = document.getElementById('wordMode');
if (modeSel){
  modeSel.addEventListener('change', (e)=>{
    wordMode = e.target.value === 'script' ? 'script' : 'random';
    try{ localStorage.setItem('WORD_MODE', wordMode); }catch{}
    // Rebuild stream for current round only if not running to avoid disrupting timing
    if (testMode.status !== 'running'){
      streamWords = buildStream();
      typedWords = [];
      currentIndex = 0;
      renderStream();
      const inp = document.getElementById('wordInput');
      inp.value = '';
      updateLiveMetrics();
    }
  });
}

init().catch(err=>{
  console.error(err);
  alert('Không tải được bài luyện');
  location.href = '/';
});

// Auto-enter test mode on load
window.addEventListener('load', ()=>{
  // Show overlay once per session
  try{
    if (!sessionStorage.getItem('seenOverlay')){
      const ov = document.getElementById('overlay');
      if (ov) { ov.style.display = 'flex'; }
      const btn = document.getElementById('overlayClose');
      if (btn){ btn.onclick = ()=>{ ov.style.display = 'none'; sessionStorage.setItem('seenOverlay','1'); }; }
    }
  }catch{}
  startTest();
});
