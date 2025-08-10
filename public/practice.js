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
let timerId = null;

function computeScore(target, typed, durationMs){
  const totalChars = target.length;
  let correct = 0;
  const len = Math.min(target.length, typed.length);
  for (let i=0;i<len;i++) if (target[i]===typed[i]) correct++;
  const errors = Math.max(0, typed.length - correct) + Math.max(0, totalChars - typed.length);
  const minutes = Math.max(0.001, (durationMs||0)/60000);
  const grossWPM = typed.length / 5 / minutes;
  const netWPM = Math.max(0, grossWPM - errors/ minutes / 5);
  const accuracy = totalChars ? Math.max(0, Math.min(1, correct/totalChars)) : 1;
  return { totalChars, typedChars: typed.length, correct, errors, accuracy, grossWPM, netWPM };
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
}

function updateLiveMetrics(){
  if (!doc) return;
  const typed = $('#typed').value;
  const dur = Date.now() - startTime;
  const s = computeScore(doc.content, typed, dur);
  $('#acc').textContent = 'Độ chính xác: ' + fmtPercent(s.accuracy);
  $('#wpm').textContent = 'WPM: ' + fmtWpm(s.grossWPM);
  $('#errors').textContent = 'Lỗi: ' + s.errors;
  $('#target').innerHTML = renderDiff(doc.content, typed);
}

$('#typed').addEventListener('input', updateLiveMetrics);

$('#finishBtn').addEventListener('click', async ()=>{
  if (!doc) return;
  const typed = $('#typed').value;
  const dur = Date.now() - startTime;
  const score = await fetchJSON('/api/score', { method:'POST', body: JSON.stringify({ target: doc.content, typed, durationMs: dur })});
  alert(`Điểm:\n- Độ chính xác: ${fmtPercent(score.accuracy)}\n- Gross WPM: ${fmtWpm(score.grossWPM)}\n- Net WPM: ${fmtWpm(score.netWPM)}\n- Lỗi: ${score.errors}`);
});

init().catch(err=>{
  console.error(err);
  alert('Không tải được bài luyện');
  location.href = '/';
});
