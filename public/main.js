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
    container.innerHTML = '<p class="muted">Chưa có tài liệu. Hãy thêm ở bên trái hoặc dùng nút "Thêm mẫu nhanh".</p>';
    return;
  }
  for (const d of docs){
    const el = document.createElement('div');
    el.className = 'doc';
    el.innerHTML = `<h3>${escapeHtml(d.title)}</h3>
      <p>${escapeHtml(d.content.slice(0, 120))}${d.content.length>120?'…':''}</p>
      <div style="display:flex;align-items:center;gap:8px;justify-content:space-between">
        <div style="display:flex; gap:8px; align-items:center">
          <a class="btn" href="/practice.html?id=${d.id}">Luyện</a>
          <button class="btn-secondary" data-del="${d.id}">Xóa</button>
        </div>
        <small class="muted">${new Date(d.createdAt||Date.now()).toLocaleString('vi-VN')}</small>
      </div>`;
    const delBtn = el.querySelector('[data-del]');
    delBtn.onclick = async ()=>{
      if (!confirm('Xóa tài liệu này?')) return;
      await fetchJSON('/api/docs/'+d.id, { method:'DELETE' });
      await loadDocs();
    };
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

// Add a quick sample document for first-time users
const sampleBtn = document.getElementById('addSample');
if (sampleBtn){
  sampleBtn.addEventListener('click', async ()=>{
    const title = 'Mẫu luyện gõ nhanh';
    const content = 'Luyện gõ thật đều tay và chính xác. Gõ nhẹ nhàng, không vội vàng, giữ nhịp thở ổn định.';
    const doc = await fetchJSON('/api/docs', { method:'POST', body: JSON.stringify({ title, content }) });
    location.href = `/practice.html?id=${doc.id}`;
  });
}

// Init
loadDocs().catch(err=>{
  console.error(err);
  $('#docs').innerHTML = '<p>Lỗi tải tài liệu.</p>';
});
