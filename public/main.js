const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const API_BASE = localStorage.getItem('API_BASE') || '';

async function fetchJSON(url, opts){
  const full = url.startsWith('http') ? url : API_BASE + url;
  const res = await fetch(full, { headers: { 'Content-Type':'application/json' }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadDocs(){
  const docs = await fetchJSON('/api/docs');
  const container = $('#docs');
  container.innerHTML = '';
  if (!docs.length){
    container.innerHTML = '<p>Chưa có tài liệu. Hãy thêm ở trên.</p>';
    return;
  }
  for (const d of docs){
    const el = document.createElement('div');
    el.className = 'doc';
    el.innerHTML = `<h3>${escapeHtml(d.title)}</h3>
      <p>${escapeHtml(d.content.slice(0, 120))}${d.content.length>120?'…':''}</p>
      <a class="btn" href="/practice.html?id=${d.id}">Luyện bài này</a>`;
    container.appendChild(el);
  }
}

function escapeHtml(s){
  return s.replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'}[c]));
}

// Utilities previously used for practice page are moved to practice.js

// Handlers
$('#addDocForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const title = $('#title').value.trim();
  const content = $('#content').value.replace(/\s+$/,'');
  if (!content){ alert('Vui lòng nhập nội dung'); return; }
  const doc = await fetchJSON('/api/docs', { method:'POST', body: JSON.stringify({ title, content }) });
  $('#title').value = '';
  $('#content').value = '';
  await loadDocs();
  // Redirect to practice page after adding
  location.href = `/practice.html?id=${doc.id}`;
});

// Init
loadDocs().catch(err=>{
  console.error(err);
  $('#docs').innerHTML = '<p>Lỗi tải tài liệu.</p>';
});
