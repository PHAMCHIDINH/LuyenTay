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

function renderDiff(target, typed){
  let out = '';
  const len = Math.max(target.length, typed.length);
  for (let i=0;i<len;i++){
    const t = target[i] ?? '';
    const y = typed[i] ?? '';
    if (y===''){
      out += escapeHtml(t);
    } else if (y===t){
      out += `<span class="mark-correct">${escapeHtml(t)}</span>`;
    } else {
      out += `<span class="mark-wrong">${escapeHtml(t||'∅')}</span>`;
    }
  }
  return out;
}

async function init(){
  const id = getQueryParam('id');
  if (!id){
    location.href = '/';
    return;
  }
  doc = await fetchJSON('/api/docs/'+id);
  $('#docTitle').textContent = doc.title;
  $('#target').innerHTML = renderDiff(doc.content, '');
  $('#typed').value = '';
  $('#typed').focus();
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
  const typed = $('#typed').value;
  // Chỉ hiển thị lỗi sau khi kết thúc mỗi lần, tránh tính lỗi theo từng phím (IME tiếng Việt)
  const errEl = document.getElementById('errors');
  if (testMode.active && (testMode.status === 'running' || testMode.status === 'waiting')){
    errEl.textContent = 'Lỗi: —';
  } else if (testMode.lastErrors != null){
    errEl.textContent = 'Lỗi: ' + testMode.lastErrors;
  }
  const words = countWords(typed);
  const wordsEl = document.getElementById('words');
  if (wordsEl) wordsEl.textContent = 'Từ: ' + words;
  // Trong khi đang gõ, để giảm nhiễu cho IME tiếng Việt, chỉ hiển thị văn bản gốc
  if (testMode.active && testMode.status === 'running'){
    $('#target').textContent = doc.content;
  } else {
    $('#target').innerHTML = renderDiff(doc.content, typed);
  }
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
  $('#typed').value = '';
  $('#typed').disabled = false;
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
  $('#typed').value = '';
  $('#typed').disabled = false;
  $('#typed').focus();
  updateRoundInfo();
  updateTimerUI('Chờ bắt đầu...');
  const errEl = document.getElementById('errors'); if (errEl) errEl.textContent = 'Lỗi: —';
}

function endRound(){
  const typed = $('#typed').value;
  const dur = Math.min(Date.now() - startTime, timeLimitMs);
  const s = computeScore(doc.content, typed, dur);
  s.wordsCount = countWords(typed);
  testMode.results.push(s);
  if (!testMode.best || s.wordsCount > testMode.best.wordsCount || (s.wordsCount === testMode.best.wordsCount && s.errors < testMode.best.errors)) testMode.best = s;
  $('#typed').disabled = true;
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

$('#typed').addEventListener('input', updateLiveMetrics);

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
document.getElementById('typed').addEventListener('input', ()=>{
  startRoundIfFirstKey();
  updateLiveMetrics();
});

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
