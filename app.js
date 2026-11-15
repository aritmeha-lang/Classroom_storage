// ===== Konfigurasi & state =====
const API = '/api/gas';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const ROLE = {
  wali_kelas: { label: 'Wali Kelas', c: 'var(--tomato)' },
  ketua_kelas: { label: 'Ketua Kelas', c: 'var(--sky)' },
  sekretaris: { label: 'Sekretaris', c: 'var(--mint)' },
  bendahara: { label: 'Bendahara', c: 'var(--sun)' },
  siswa: { label: 'Siswa', c: 'var(--card)' }
};
const STATUS = { H: ['Hadir', 'var(--mint)'], S: ['Sakit', 'var(--sky)'], I: ['Izin', 'var(--sun)'], A: ['Alpa', 'var(--pink)'] };
const CAN = {
  students: ['wali_kelas', 'ketua_kelas', 'sekretaris'],
  attendance: ['wali_kelas', 'ketua_kelas', 'sekretaris'],
  announcements: ['wali_kelas', 'ketua_kelas'],
  accounts: ['wali_kelas'],
  settings: ['wali_kelas']
};
const NAV = [
  { id: 'dashboard', label: 'Beranda', icon: 'home', c: 'var(--sun)' },
  { id: 'students', label: 'Siswa', icon: 'users', c: 'var(--sky)', perm: 'students' },
  { id: 'attendance', label: 'Absensi', icon: 'calcheck', c: 'var(--mint)', perm: 'attendance' },
  { id: 'announcements', label: 'Papan', icon: 'horn', c: 'var(--pink)' },
  { id: 'profile', label: 'Kartu Saya', icon: 'user', c: 'var(--tomato)' },
  { id: 'settings', label: 'Pengaturan', icon: 'sliders', c: 'var(--sun)', perm: 'settings' }
];
const VIEWS = { dashboard: vDashboard, students: vStudents, attendance: vAttendance, announcements: vAnnouncements, profile: vProfile, settings: vSettings };
const can = p => CAN[p].includes(S.user.role);
const todayLocal = () => new Date().toLocaleDateString('sv-SE');
const fmtDate = iso => (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const PAL = ['var(--sun)', 'var(--mint)', 'var(--sky)', 'var(--pink)', 'var(--tomato)'];
const colorOf = n => PAL[[...String(n)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % PAL.length];
const avatar = (name, url, cls = '') => url
  ? `<img class="av ${cls}" src="${esc(url)}" alt="">`
  : `<span class="av ${cls}" style="background:${colorOf(name)}">${esc(initials(name))}</span>`;
const roleTag = r => { const R = ROLE[r] || ROLE.siswa; return `<span class="tag" style="--c:${R.c}">${R.label}</span>`; };
const head = (title, sub, actions = '') => `<div class="head"><div><h2>${title}</h2><p>${sub}</p></div><div class="d-flex gap-2 flex-wrap">${actions}</div></div>`;
const empty = text => `<div class="empty">${text}</div>`;
const readFile = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = no; r.readAsDataURL(f); });
let S = JSON.parse(localStorage.getItem('kelas_session') || 'null'); // { token, user, profile, settings }
let attDate = todayLocal();
let busy = 0;
const formModal = new bootstrap.Modal($('#formModal'));

// ===== UI dasar: loader, toast, modal, API =====
function showLoader(on) { busy += on ? 1 : -1; $('#loader').classList.toggle('d-none', busy <= 0); }
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast align-items-center border-0 ${type === 'ok' ? '' : 'err'}`;
  el.setAttribute('role', 'alert');
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(msg)}</div>
    <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Tutup"></button></div>`;
  $('#toasts').append(el);
  el.addEventListener('hidden.bs.toast', () => el.remove());
  new bootstrap.Toast(el, { delay: 3500 }).show();
}
async function api(action, payload = {}) {
  showLoader(true);
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload, token: S?.token }) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    return j.data;
  } catch (e) {
    toast(e.message || 'Gagal terhubung ke server', 'err');
    if (/login ulang/.test(e.message)) logout();
    throw e;
  } finally {
    showLoader(false);
  }
}
function openForm(title, body, onSubmit, btnText = 'Simpan') {
  $('#formModalTitle').textContent = title;
  $('#formModalBody').innerHTML = `<form class="vstack gap-3">${body}
    <div class="d-flex justify-content-end gap-2 pt-2">
      <button type="button" class="btn btn-plain" data-bs-dismiss="modal">Batal</button>
      <button class="btn btn-ink">${btnText}</button></div></form>`;
  $('#formModalBody form').onsubmit = async e => {
    e.preventDefault();
    try { await onSubmit(Object.fromEntries(new FormData(e.target))); formModal.hide(); toast('Berhasil disimpan'); route(); } catch {}
  };
  formModal.show();
}
function confirmDo(text, action) {
  $('#formModalTitle').textContent = 'Yakin?';
  $('#formModalBody').innerHTML = `<p class="mb-4">${esc(text)}</p>
    <div class="d-flex justify-content-end gap-2">
      <button class="btn btn-plain" data-bs-dismiss="modal">Batal</button>
      <button id="confirm-ok" class="btn btn-pink">Ya, lanjutkan</button></div>`;
  $('#confirm-ok').onclick = async () => { formModal.hide(); try { await action(); toast('Berhasil'); route(); } catch {} };
  formModal.show();
}

// ===== Sesi, header, routing =====
async function syncMe() {
  S = { ...S, ...(await api('me')) };
  localStorage.setItem('kelas_session', JSON.stringify(S));
  paintHeader();
}
function paintHeader() {
  const st = S.settings || {};
  document.querySelectorAll('.class-name').forEach(el => el.textContent = st.class_name || 'Kelas Saya');
  document.querySelectorAll('.class-logo').forEach(img => { img.src = st.logo_url || ''; img.classList.toggle('d-none', !st.logo_url); });
  document.querySelectorAll('.brand-fallback').forEach(el => el.classList.toggle('d-none', !!st.logo_url));
  $('#user-name').textContent = S.user.nama;
  $('#user-role').textContent = (ROLE[S.user.role] || ROLE.siswa).label;
  $('#top-avatar').innerHTML = avatar(S.user.nama, S.profile?.foto_url);
  const items = NAV.filter(n => !n.perm || can(n.perm));
  $('#tabs').innerHTML = items.map(n => `<a href="#${n.id}" data-nav="${n.id}" class="tab" style="--tabc:${n.c}">${ic(n.icon)}${n.label}</a>`).join('');
  $('#dock').innerHTML = items.map(n => `<a href="#${n.id}" data-nav="${n.id}" class="dock-item">${ic(n.icon)}<span>${n.label}</span></a>`).join('');
}
async function boot() {
  $('#login').classList.toggle('d-none', !!S);
  $('#app').classList.toggle('d-none', !S);
  if (!S) return;
  try { await syncMe(); await route(); } catch {}
}
async function route() {
  if (!S) return;
  let id = location.hash.slice(1) || 'dashboard';
  if (!VIEWS[id] || (NAV.find(n => n.id === id).perm && !can(NAV.find(n => n.id === id).perm))) id = 'dashboard';
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === id));
  try { $('#view').innerHTML = await VIEWS[id](); } catch { $('#view').innerHTML = ''; }
}
function logout() {
  localStorage.removeItem('kelas_session');
  S = null;
  location.hash = '';
  boot();
}
function applyTheme(t) {
  document.documentElement.setAttribute('data-bs-theme', t);
  document.querySelectorAll('.theme-btn use').forEach(u => u.setAttribute('href', t === 'dark' ? '#i-sun' : '#i-moon'));
  localStorage.setItem('kelas_theme', t);
}

// ===== Beranda =====
function donut(parts, total) {
  const R = 42, C = 2 * Math.PI * R;
  let off = 0;
  const segs = total ? parts.filter(p => p.v > 0).map(p => {
    const len = p.v / total * C;
    const s = `<circle cx="60" cy="60" r="${R}" fill="none" style="stroke:${p.c}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"/>`;
    off += len;
    return s;
  }).join('') : '';
  const pct = total ? Math.round(parts[0].v / total * 100) : 0;
  return `<svg class="donut" viewBox="0 0 120 120" role="img" aria-label="Kehadiran ${pct} persen">
    <circle cx="60" cy="60" r="${R}" fill="none" style="stroke:color-mix(in srgb,var(--ink) 12%,transparent)" stroke-width="16"/>
    ${segs}
    <circle cx="60" cy="60" r="50" fill="none" style="stroke:var(--ink)" stroke-width="2"/>
    <circle cx="60" cy="60" r="34" fill="none" style="stroke:var(--ink)" stroke-width="2"/>
    <text x="60" y="63" text-anchor="middle" font-size="19" font-weight="800">${pct}%</text>
    <text x="60" y="76" text-anchor="middle" font-size="7.5" font-weight="700" style="fill:var(--muted)">HADIR</text>
  </svg>`;
}
const noteCard = (a, i, manage) => `<div class="col"><article class="note n${i % 4}">
  ${manage ? `<button class="del" title="Hapus" aria-label="Hapus pengumuman" onclick="delAnn('${a.id}')">${ic('trash')}</button>` : ''}
  <h6>${esc(a.title)}</h6><p>${esc(a.content)}</p>
  <small>${ic('clock')} ${fmtDate(a.created_at)}</small>
</article></div>`;
async function vDashboard() {
  const d = await api('dashboard');
  const total = d.totalSiswa;
  const belum = Math.max(0, total - d.hadir - d.tidakHadir);
  const now = new Date();
  const h = now.getHours();
  const sapa = h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
  return `<section class="fade-up">
    <div class="row g-4">
      <div class="col-lg-4"><div class="cal">
        <div class="cal-top">${now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</div>
        <div class="cal-body">
          <div class="cal-day">${now.getDate()}</div>
          <div class="cal-hari">${now.toLocaleDateString('id-ID', { weekday: 'long' })}</div>
          <div class="cal-hi">${sapa}, ${esc(S.user.nama.split(' ')[0])}.</div>
        </div>
      </div></div>
      <div class="col-lg-8"><div class="panel">
        <h5 class="fw-bold mb-3">Kehadiran hari ini</h5>
        <div class="d-flex flex-wrap align-items-center gap-4">
          ${donut([{ v: d.hadir, c: 'var(--mint)' }, { v: d.tidakHadir, c: 'var(--pink)' }, { v: belum, c: 'var(--sun)' }], total)}
          <div class="legend">
            <div><i style="background:var(--mint)"></i>Hadir<b>${d.hadir}</b></div>
            <div><i style="background:var(--pink)"></i>Tidak hadir<b>${d.tidakHadir}</b></div>
            <div><i style="background:var(--sun)"></i>Belum dicatat<b>${belum}</b></div>
            <div><i style="background:var(--card)"></i>Total siswa<b>${total}</b></div>
          </div>
        </div>
      </div></div>
    </div>
    <h4 class="section-title">Papan pengumuman</h4>
    ${d.pengumuman.length
      ? `<div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-4">${d.pengumuman.map((a, i) => noteCard(a, i, false)).join('')}</div>`
      : empty('Papan masih kosong. Belum ada pengumuman.')}
  </section>`;
}

// ===== Siswa =====
const roleOpts = cur => ['ketua_kelas', 'sekretaris', 'bendahara', 'siswa']
  .map(r => `<option value="${r}" ${r === cur ? 'selected' : ''}>${ROLE[r].label}</option>`).join('');
async function vStudents() {
  const list = await api('students');
  const rows = list.map(s => `<tr data-q="${esc((s.nama + ' ' + s.nis).toLowerCase())}">
    <td class="text-muted-ink fw-bold">${esc(s.no_absen)}</td>
    <td><div class="d-flex align-items-center gap-3">${avatar(s.nama, '')}
      <div class="lh-sm"><b>${esc(s.nama)}</b><br><small class="text-muted-ink">NIS ${esc(s.nis)}</small></div></div></td>
    <td>${s.jenis_kelamin === 'P' ? 'Perempuan' : 'Laki-laki'}</td>
    <td>${roleTag(s.role)}</td>
    <td><div class="d-flex justify-content-end gap-2">
      ${can('accounts') ? `<select class="form-select form-select-sm w-auto" aria-label="Ubah role" onchange="setRole('${s.id}', this.value)">${roleOpts(s.role)}</select>` : ''}
      <button class="btn btn-pink btn-sm" title="Hapus" aria-label="Hapus siswa" onclick="delStudent('${s.id}')">${ic('trash')}</button>
    </div></td></tr>`).join('');
  return `<section class="fade-up">
    ${head('Daftar Siswa', `${list.length} siswa di kelas ini`, `<button class="btn btn-ink" onclick="formStudent()">${ic('plus')} Tambah siswa</button>`)}
    <div class="searchbox mb-3">${ic('search')}<input class="form-control" placeholder="Cari nama atau NIS" oninput="filterRows(this.value)"></div>
    <div class="tbl"><div class="table-responsive"><table class="table table-hover mb-0">
      <thead><tr><th>No</th><th>Siswa</th><th>Gender</th><th>Role</th><th class="text-end">Aksi</th></tr></thead>
      <tbody id="st-body">${rows || `<tr><td colspan="5">${empty('Belum ada siswa. Tambahkan siswa pertama.')}</td></tr>`}</tbody>
    </table></div></div>
  </section>`;
}
function filterRows(q) {
  q = q.toLowerCase();
  document.querySelectorAll('#st-body tr[data-q]').forEach(tr => tr.classList.toggle('d-none', !tr.dataset.q.includes(q)));
}
function formStudent() {
  openForm('Tambah Siswa', `
    <div class="field"><label>NIS</label><input name="nis" class="form-control" required>
      <div class="form-text">NIS dipakai sebagai username dan password awal.</div></div>
    <div class="field"><label>Nama lengkap</label><input name="nama" class="form-control" required></div>
    <div class="row g-3">
      <div class="col-5 field"><label>No. absen</label><input name="no_absen" type="number" min="1" class="form-control"></div>
      <div class="col-7 field"><label>Jenis kelamin</label>
        <select name="jenis_kelamin" class="form-select"><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></div>
    </div>`, d => api('addStudent', d), 'Tambahkan');
}
async function setRole(id, role) {
  try { await api('setRole', { student_id: id, role }); toast('Role diperbarui'); route(); } catch {}
}
function delStudent(id) {
  confirmDo('Hapus siswa ini beserta akunnya? Tindakan ini tidak bisa dibatalkan.', () => api('deleteStudent', { id }));
}

// ===== Absensi =====
function pickStatus(btn) {
  const seg = btn.parentElement;
  seg.dataset.status = btn.dataset.k;
  [...seg.children].forEach(b => b.classList.toggle('on', b === btn));
}
async function vAttendance() {
  const list = await api('attendance', { date: attDate });
  const stamps = Object.entries(STATUS).map(([k, [label, c]]) =>
    `<div class="stamp" style="--c:${c}">${label}<b>${list.filter(s => s.status === k).length}</b></div>`).join('');
  const rows = list.map(s => `<tr>
    <td class="text-muted-ink fw-bold">${esc(s.no_absen)}</td>
    <td><b>${esc(s.nama)}</b></td>
    <td><div class="seg" data-student="${s.student_id}" data-status="${s.status}">
      ${Object.entries(STATUS).map(([k, [label]]) => `<button type="button" data-k="${k}" class="${k} ${k === s.status ? 'on' : ''}" onclick="pickStatus(this)">${label}</button>`).join('')}
    </div></td></tr>`).join('');
  return `<section class="fade-up">
    ${head('Absensi', 'Catat kehadiran siswa untuk tanggal yang dipilih',
      `<input type="date" class="form-control" style="max-width:190px" value="${attDate}" onchange="attDate=this.value;route()">`)}
    <div class="stamps">${stamps}</div>
    <div class="tbl"><div class="table-responsive"><table class="table mb-0">
      <thead><tr><th>No</th><th>Nama</th><th>Status</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="3">${empty('Belum ada siswa untuk diabsen.')}</td></tr>`}</tbody>
    </table></div></div>
    <div class="d-flex justify-content-end mt-4"><button class="btn btn-ink" onclick="saveAtt()">Simpan absensi</button></div>
  </section>`;
}
async function saveAtt() {
  const records = [...document.querySelectorAll('[data-student]')].map(g => ({ student_id: g.dataset.student, status: g.dataset.status }));
  try { await api('saveAttendance', { date: attDate, records }); toast('Absensi tersimpan'); route(); } catch {}
}

// ===== Papan pengumuman =====
async function vAnnouncements() {
  const list = await api('announcements');
  const manage = can('announcements');
  return `<section class="fade-up">
    ${head('Papan Pengumuman', 'Kabar terbaru untuk seluruh kelas',
      manage ? `<button class="btn btn-ink" onclick="formAnn()">${ic('plus')} Tempel pengumuman</button>` : '')}
    ${list.length
      ? `<div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-4 pt-2">${list.map((a, i) => noteCard(a, i, manage)).join('')}</div>`
      : empty('Papan masih kosong.')}
  </section>`;
}
function formAnn() {
  openForm('Pengumuman Baru', `
    <div class="field"><label>Judul</label><input name="title" class="form-control" required maxlength="150"></div>
    <div class="field"><label>Isi</label><textarea name="content" rows="5" class="form-control" required></textarea></div>`,
    d => api('addAnnouncement', d), 'Tempel');
}
function delAnn(id) { confirmDo('Hapus pengumuman ini dari papan?', () => api('deleteAnnouncement', { id })); }

// ===== Kartu saya =====
async function vProfile() {
  const p = S.profile || {};
  const st = S.settings || {};
  return `<section class="fade-up">
    ${head('Kartu Saya', 'Foto dan keamanan akun Anda')}
    <div class="idcard">
      <div class="id-top"><span>${esc(st.class_name || 'Kelas Saya')}</span><span>${(ROLE[S.user.role] || ROLE.siswa).label}</span></div>
      <div class="id-body">
        ${p.foto_url ? `<img class="id-photo" src="${esc(p.foto_url)}" alt="Foto profil">` : `<div class="id-photo" style="background:${colorOf(S.user.nama)}">${esc(initials(S.user.nama))}</div>`}
        <div class="flex-grow-1">
          <div class="id-name">${esc(S.user.nama)}</div>
          ${roleTag(S.user.role)}
          <div class="id-label">Username</div><div class="fw-bold">${esc(S.user.username)}</div>
        </div>
      </div>
      <div class="barcode" aria-hidden="true"></div>
    </div>
    <div class="d-flex flex-wrap gap-3 mt-4">
      <label class="btn btn-plain mb-0">${ic('camera')} Ganti foto
        <input type="file" accept="image/*" class="d-none" onchange="uploadFile(this,'uploadPhoto','file')"></label>
      <button class="btn btn-ink" onclick="formPass()">${ic('lock')} Ubah password</button>
    </div>
  </section>`;
}
function formPass() {
  openForm('Ubah Password', `
    <div class="field"><label>Password lama</label><input type="password" name="old" class="form-control" required></div>
    <div class="field"><label>Password baru</label><input type="password" name="new" minlength="6" class="form-control" required>
      <div class="form-text">Minimal 6 karakter.</div></div>`,
    d => api('changePassword', d), 'Ubah password');
}
async function uploadFile(input, action, key) {
  const f = input.files[0];
  if (!f) return;
  if (f.size > 1e6) return toast('Ukuran maksimal 1 MB', 'err');
  try {
    const base64 = await readFile(f);
    await api(action, { [key]: { mime: f.type, base64 } });
    await syncMe();
    toast('Berhasil diunggah');
    route();
  } catch {}
}

// ===== Pengaturan (wali kelas) =====
async function vSettings() {
  const st = S.settings || {};
  return `<section class="fade-up">
    ${head('Pengaturan Kelas', 'Identitas kelas yang tampil di seluruh aplikasi')}
    <div class="row g-4">
      <div class="col-lg-7"><div class="panel">
        <h5 class="fw-bold mb-3">Nama kelas</h5>
        <form onsubmit="saveClassName(event)" class="vstack gap-3">
          <input name="class_name" class="form-control" value="${esc(st.class_name)}" required maxlength="60">
          <div><button class="btn btn-ink">Simpan nama</button></div>
        </form>
      </div></div>
      <div class="col-lg-5"><div class="panel">
        <h5 class="fw-bold mb-3">Logo kelas</h5>
        <div class="d-flex align-items-center gap-3 mb-3">
          ${st.logo_url ? `<img src="${esc(st.logo_url)}" class="logo-preview" alt="Logo kelas">` : `<div class="logo-preview">${ic('image')}</div>`}
          <small class="text-muted-ink">PNG atau JPG, maksimal 1 MB.</small>
        </div>
        <input type="file" accept="image/*" class="form-control" onchange="uploadFile(this,'saveSettings','logo')">
      </div></div>
    </div>
  </section>`;
}
async function saveClassName(e) {
  e.preventDefault();
  try { await api('saveSettings', { class_name: e.target.class_name.value }); await syncMe(); toast('Nama kelas diperbarui'); route(); } catch {}
}

// ===== Inisialisasi =====
$('#login-form').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  try {
    S = await api('login', { username: f.username.value.trim(), password: f.password.value });
    localStorage.setItem('kelas_session', JSON.stringify(S));
    boot();
  } catch {}
};
document.querySelectorAll('.theme-btn').forEach(b => b.onclick = () =>
  applyTheme(document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark'));
window.addEventListener('hashchange', route);
applyTheme(localStorage.getItem('kelas_theme') || 'light');
boot();
