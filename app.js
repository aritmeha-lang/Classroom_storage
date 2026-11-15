// ===== Konfigurasi & state =====
const API = '/api/gas';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROLE = {
  wali_kelas: { label: 'Wali Kelas', color: 'danger' },
  ketua_kelas: { label: 'Ketua Kelas', color: 'primary' },
  sekretaris: { label: 'Sekretaris', color: 'info' },
  bendahara: { label: 'Bendahara', color: 'warning' },
  siswa: { label: 'Siswa', color: 'secondary' }
};
const STATUS = { H: ['Hadir', 'success'], S: ['Sakit', 'info'], I: ['Izin', 'warning'], A: ['Alpa', 'danger'] };
const CAN = {
  students: ['wali_kelas', 'ketua_kelas', 'sekretaris'],
  attendance: ['wali_kelas', 'ketua_kelas', 'sekretaris'],
  announcements: ['wali_kelas', 'ketua_kelas'],
  accounts: ['wali_kelas'],
  settings: ['wali_kelas']
};
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'bi-grid-1x2-fill' },
  { id: 'students', label: 'Siswa', icon: 'bi-people-fill', perm: 'students' },
  { id: 'attendance', label: 'Absensi', icon: 'bi-calendar2-check-fill', perm: 'attendance' },
  { id: 'announcements', label: 'Pengumuman', icon: 'bi-megaphone-fill' },
  { id: 'profile', label: 'Profil', icon: 'bi-person-circle' },
  { id: 'settings', label: 'Pengaturan', icon: 'bi-gear-fill', perm: 'settings' }
];
const VIEWS = { dashboard: vDashboard, students: vStudents, attendance: vAttendance, announcements: vAnnouncements, profile: vProfile, settings: vSettings };
const can = p => CAN[p].includes(S.user.role);
const todayLocal = () => new Date().toLocaleDateString('sv-SE');
const fmtDate = iso => (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const avatar = (name, url, size = '') => url
  ? `<img src="${esc(url)}" alt="" class="avatar ${size}">`
  : `<span class="avatar initials ${size}">${esc(initials(name))}</span>`;
const roleBadge = r => { const R = ROLE[r] || ROLE.siswa; return `<span class="badge rounded-pill text-bg-${R.color}">${R.label}</span>`; };
const pageHeader = (title, sub, actions = '') => `<div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
  <div><h2 class="fw-bold mb-1">${title}</h2><p class="text-secondary mb-0">${sub}</p></div>
  <div class="d-flex gap-2">${actions}</div></div>`;
const emptyState = (icon, text) => `<div class="text-center text-secondary py-5"><i class="bi ${icon} display-5 d-block mb-2"></i>${text}</div>`;
const readFile = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = no; r.readAsDataURL(f); });
let S = JSON.parse(localStorage.getItem('kelas_session') || 'null'); // { token, user, profile, settings }
let attDate = todayLocal();
let busy = 0;
const formModal = new bootstrap.Modal($('#formModal'));

// ===== UI dasar: loader, toast, modal, API =====
function showLoader(on) { busy += on ? 1 : -1; $('#loader').classList.toggle('d-none', busy <= 0); }
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${type} border-0`;
  el.innerHTML = `<div class="d-flex"><div class="toast-body fw-semibold">${esc(msg)}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Tutup"></button></div>`;
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
    toast(e.message || 'Gagal terhubung ke server', 'danger');
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
      <button type="button" class="btn btn-light rounded-3" data-bs-dismiss="modal">Batal</button>
      <button class="btn btn-primary rounded-3 px-4">${btnText}</button></div></form>`;
  $('#formModalBody form').onsubmit = async e => {
    e.preventDefault();
    try { await onSubmit(Object.fromEntries(new FormData(e.target))); formModal.hide(); toast('Berhasil disimpan'); route(); } catch {}
  };
  formModal.show();
}
function confirmDo(text, action) {
  $('#formModalTitle').textContent = 'Konfirmasi';
  $('#formModalBody').innerHTML = `<p>${esc(text)}</p>
    <div class="d-flex justify-content-end gap-2">
      <button class="btn btn-light rounded-3" data-bs-dismiss="modal">Batal</button>
      <button id="confirm-ok" class="btn btn-danger rounded-3 px-4">Ya, lanjutkan</button></div>`;
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
  document.querySelectorAll('.brand-icon').forEach(el => el.classList.toggle('d-none', !!st.logo_url));
  $('#user-name').textContent = S.user.nama;
  $('#user-role').textContent = (ROLE[S.user.role] || ROLE.siswa).label;
  $('#top-avatar').innerHTML = avatar(S.user.nama, S.profile?.foto_url, 'sm');
  const links = NAV.filter(n => !n.perm || can(n.perm))
    .map(n => `<a href="#${n.id}" data-id="${n.id}" class="nav-app"><i class="bi ${n.icon}"></i>${n.label}</a>`).join('');
  $('#nav-desktop').innerHTML = links;
  $('#nav-mobile').innerHTML = links;
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
  if (!VIEWS[id]) id = 'dashboard';
  document.querySelectorAll('.nav-app').forEach(a => a.classList.toggle('active', a.dataset.id === id));
  $('#page-title').textContent = NAV.find(n => n.id === id).label;
  bootstrap.Offcanvas.getInstance($('#mobileNav'))?.hide();
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
  document.querySelectorAll('.theme-icon').forEach(i => i.className = `bi theme-icon ${t === 'dark' ? 'bi-sun-fill' : 'bi-moon-stars-fill'}`);
  localStorage.setItem('kelas_theme', t);
}

// ===== Komponen kartu =====
const statCard = (icon, color, label, val) => `<div class="col-12 col-md-4"><div class="card border-0 shadow-sm rounded-4 h-100 card-hover">
  <div class="card-body d-flex align-items-center gap-3 p-4">
    <div class="stat-icon bg-${color}-subtle text-${color}"><i class="bi ${icon}"></i></div>
    <div><div class="text-secondary small">${label}</div><div class="fs-2 fw-bold lh-1">${val}</div></div>
  </div></div></div>`;
const annCard = (a, manage = false) => `<div class="col"><div class="card border-0 shadow-sm rounded-4 h-100 card-hover"><div class="card-body p-4">
  <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
    <h6 class="fw-bold mb-0">${esc(a.title)}</h6>
    ${manage ? `<button class="btn btn-sm btn-link text-danger p-0" onclick="delAnn('${a.id}')"><i class="bi bi-trash"></i></button>` : ''}
  </div>
  <p class="text-secondary mb-3" style="white-space:pre-line">${esc(a.content)}</p>
  <small class="text-body-tertiary"><i class="bi bi-clock me-1"></i>${fmtDate(a.created_at)}</small>
</div></div></div>`;

// ===== Halaman: Dashboard =====
async function vDashboard() {
  const d = await api('dashboard');
  const total = d.hadir + d.tidakHadir;
  const rate = total ? Math.round(d.hadir / total * 100) : 0;
  const h = new Date().getHours();
  const greet = h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
  const tanggal = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `<section class="fade-up">
    <div class="hero rounded-4 p-4 p-md-5 mb-4 text-white">
      <p class="mb-1 opacity-75">${tanggal}</p>
      <h2 class="fw-bold mb-2">${greet}, ${esc(S.user.nama.split(' ')[0])} 👋</h2>
      <p class="mb-0 opacity-75">Pantau kehadiran dan pengumuman kelas hari ini.</p>
    </div>
    <div class="row g-3 mb-4">
      ${statCard('bi-people-fill', 'primary', 'Total Siswa', d.totalSiswa)}
      ${statCard('bi-check2-circle', 'success', 'Hadir Hari Ini', d.hadir)}
      ${statCard('bi-exclamation-circle', 'warning', 'Tidak Hadir', d.tidakHadir)}
    </div>
    <div class="card border-0 shadow-sm rounded-4 mb-4"><div class="card-body p-4">
      <div class="d-flex justify-content-between mb-2"><span class="fw-semibold">Tingkat Kehadiran</span><span class="fw-bold">${rate}%</span></div>
      <div class="progress" style="height:10px"><div class="progress-bar bg-success" style="width:${rate}%"></div></div>
    </div></div>
    <h5 class="fw-bold mb-3">Pengumuman Terbaru</h5>
    ${d.pengumuman.length
      ? `<div class="row row-cols-1 row-cols-md-2 g-3">${d.pengumuman.map(a => annCard(a)).join('')}</div>`
      : emptyState('bi-megaphone', 'Belum ada pengumuman')}
  </section>`;
}

// ===== Halaman: Siswa =====
const roleOpts = cur => ['ketua_kelas', 'sekretaris', 'bendahara', 'siswa']
  .map(r => `<option value="${r}" ${r === cur ? 'selected' : ''}>${ROLE[r].label}</option>`).join('');
async function vStudents() {
  const list = await api('students');
  const rows = list.map(s => `<tr data-search="${esc((s.nama + ' ' + s.nis).toLowerCase())}">
    <td class="text-secondary">${esc(s.no_absen)}</td>
    <td><div class="d-flex align-items-center gap-2">${avatar(s.nama, '', 'sm')}
      <div><div class="fw-semibold">${esc(s.nama)}</div><small class="text-secondary">NIS ${esc(s.nis)}</small></div></div></td>
    <td>${s.jenis_kelamin === 'P' ? 'Perempuan' : 'Laki-laki'}</td>
    <td>${roleBadge(s.role)}</td>
    <td class="text-end"><div class="d-flex justify-content-end gap-2">
      ${can('accounts') ? `<select class="form-select form-select-sm w-auto" onchange="setRole('${s.id}', this.value)">${roleOpts(s.role)}</select>` : ''}
      <button class="btn btn-sm btn-outline-danger" title="Hapus" onclick="delStudent('${s.id}')"><i class="bi bi-trash"></i></button>
    </div></td></tr>`).join('');
  return `<section class="fade-up">
    ${pageHeader('Daftar Siswa', `${list.length} siswa terdaftar`,
      `<button class="btn btn-primary rounded-3" onclick="formStudent()"><i class="bi bi-person-plus me-1"></i>Tambah Siswa</button>`)}
    <div class="card border-0 shadow-sm rounded-4"><div class="card-body p-0">
      <div class="p-3 border-bottom"><div class="input-group">
        <span class="input-group-text bg-transparent border-0"><i class="bi bi-search"></i></span>
        <input class="form-control bg-transparent border-0" placeholder="Cari nama atau NIS…" oninput="filterRows(this.value)">
      </div></div>
      <div class="table-responsive"><table class="table table-hover align-middle mb-0">
        <thead><tr><th>No</th><th>Siswa</th><th>Gender</th><th>Role</th><th class="text-end">Aksi</th></tr></thead>
        <tbody id="st-body">${rows || `<tr><td colspan="5">${emptyState('bi-people', 'Belum ada siswa')}</td></tr>`}</tbody>
      </table></div>
    </div></div>
  </section>`;
}
function filterRows(q) {
  q = q.toLowerCase();
  document.querySelectorAll('#st-body tr[data-search]').forEach(tr => tr.classList.toggle('d-none', !tr.dataset.search.includes(q)));
}
function formStudent() {
  openForm('Tambah Siswa', `
    <div><label class="form-label">NIS</label><input name="nis" class="form-control form-control-lg" required>
      <div class="form-text">NIS dipakai sebagai username dan password awal siswa.</div></div>
    <div><label class="form-label">Nama lengkap</label><input name="nama" class="form-control" required></div>
    <div class="row g-3">
      <div class="col-5"><label class="form-label">No. absen</label><input name="no_absen" type="number" min="1" class="form-control"></div>
      <div class="col-7"><label class="form-label">Jenis kelamin</label>
        <select name="jenis_kelamin" class="form-select"><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></div>
    </div>`, d => api('addStudent', d), 'Tambah');
}
async function setRole(id, role) {
  try { await api('setRole', { student_id: id, role }); toast('Role diperbarui'); route(); } catch {}
}
function delStudent(id) {
  confirmDo('Hapus siswa ini beserta akunnya? Tindakan ini tidak bisa dibatalkan.', () => api('deleteStudent', { id }));
}

// ===== Halaman: Absensi =====
const statusBtn = (k, [label, c], cur) =>
  `<button type="button" data-k="${k}" data-c="${c}" class="btn ${k === cur ? 'btn-' : 'btn-outline-'}${c}" onclick="pickStatus(this)">${label}</button>`;
function pickStatus(btn) {
  const group = btn.parentElement;
  group.dataset.status = btn.dataset.k;
  [...group.children].forEach(b => { b.className = `btn ${b === btn ? 'btn-' : 'btn-outline-'}${b.dataset.c}`; });
}
async function vAttendance() {
  const list = await api('attendance', { date: attDate });
  const chips = Object.entries(STATUS).map(([k, [label, c]]) =>
    `<span class="badge rounded-pill bg-${c}-subtle text-${c}-emphasis px-3 py-2">${label} <strong>${list.filter(s => s.status === k).length}</strong></span>`).join('');
  const rows = list.map(s => `<tr>
    <td class="text-secondary">${esc(s.no_absen)}</td>
    <td class="fw-semibold">${esc(s.nama)}</td>
    <td><div class="btn-group btn-group-sm" data-student="${s.student_id}" data-status="${s.status}">
      ${Object.entries(STATUS).map(([k, v]) => statusBtn(k, v, s.status)).join('')}</div></td>
  </tr>`).join('');
  return `<section class="fade-up">
    ${pageHeader('Absensi', 'Catat kehadiran siswa per tanggal',
      `<input type="date" class="form-control rounded-3" style="max-width:200px" value="${attDate}" onchange="attDate=this.value;route()">`)}
    <div class="d-flex flex-wrap gap-2 mb-3">${chips}</div>
    <div class="card border-0 shadow-sm rounded-4">
      <div class="table-responsive"><table class="table align-middle mb-0">
        <thead><tr><th>No</th><th>Nama</th><th>Status</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="3">${emptyState('bi-calendar2-check', 'Belum ada siswa')}</td></tr>`}</tbody>
      </table></div>
      <div class="card-footer bg-transparent border-0 d-flex justify-content-end p-3">
        <button class="btn btn-primary rounded-3 px-4" onclick="saveAtt()"><i class="bi bi-cloud-check me-1"></i>Simpan Absensi</button>
      </div>
    </div>
  </section>`;
}
async function saveAtt() {
  const records = [...document.querySelectorAll('[data-student]')].map(g => ({ student_id: g.dataset.student, status: g.dataset.status }));
  try { await api('saveAttendance', { date: attDate, records }); toast('Absensi tersimpan'); } catch {}
}

// ===== Halaman: Pengumuman =====
async function vAnnouncements() {
  const list = await api('announcements');
  const manage = can('announcements');
  return `<section class="fade-up">
    ${pageHeader('Pengumuman', 'Informasi terbaru untuk seluruh kelas',
      manage ? `<button class="btn btn-primary rounded-3" onclick="formAnn()"><i class="bi bi-plus-lg me-1"></i>Buat Pengumuman</button>` : '')}
    ${list.length
      ? `<div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3">${list.map(a => annCard(a, manage)).join('')}</div>`
      : emptyState('bi-megaphone', 'Belum ada pengumuman')}
  </section>`;
}
function formAnn() {
  openForm('Pengumuman Baru', `
    <div><label class="form-label">Judul</label><input name="title" class="form-control" required maxlength="150"></div>
    <div><label class="form-label">Isi</label><textarea name="content" rows="5" class="form-control" required></textarea></div>`,
    d => api('addAnnouncement', d), 'Terbitkan');
}
function delAnn(id) {
  confirmDo('Hapus pengumuman ini?', () => api('deleteAnnouncement', { id }));
}

// ===== Halaman: Profil =====
async function vProfile() {
  const p = S.profile || {};
  return `<section class="fade-up">
    ${pageHeader('Profil Saya', 'Kelola foto dan keamanan akun Anda')}
    <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
      <div class="profile-cover"></div>
      <div class="card-body px-4 pb-4">
        <div class="d-flex flex-column flex-md-row align-items-md-end gap-3 mt-n5">
          <div class="avatar-ring">${avatar(S.user.nama, p.foto_url, 'lg')}</div>
          <div class="flex-grow-1 pb-1">
            <h4 class="fw-bold mb-1">${esc(S.user.nama)}</h4>
            ${roleBadge(S.user.role)} <span class="text-secondary small ms-1">@${esc(S.user.username)}</span>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <label class="btn btn-outline-primary rounded-3 mb-0"><i class="bi bi-camera me-1"></i>Ganti Foto
              <input type="file" accept="image/*" class="d-none" onchange="uploadFile(this,'uploadPhoto','file')"></label>
            <button class="btn btn-primary rounded-3" onclick="formPass()"><i class="bi bi-shield-lock me-1"></i>Ubah Password</button>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}
function formPass() {
  openForm('Ubah Password', `
    <div><label class="form-label">Password lama</label><input type="password" name="old" class="form-control" required></div>
    <div><label class="form-label">Password baru</label><input type="password" name="new" minlength="6" class="form-control" required>
      <div class="form-text">Minimal 6 karakter.</div></div>`,
    d => api('changePassword', d), 'Ubah Password');
}
async function uploadFile(input, action, key) {
  const f = input.files[0];
  if (!f) return;
  if (f.size > 1e6) return toast('Ukuran maksimal 1 MB', 'danger');
  try {
    const base64 = await readFile(f);
    await api(action, { [key]: { mime: f.type, base64 } });
    await syncMe();
    toast('Berhasil diunggah');
    route();
  } catch {}
}

// ===== Halaman: Pengaturan (wali kelas) =====
async function vSettings() {
  const st = S.settings || {};
  return `<section class="fade-up">
    ${pageHeader('Pengaturan Kelas', 'Identitas kelas yang tampil di seluruh aplikasi')}
    <div class="row g-4">
      <div class="col-lg-7"><div class="card border-0 shadow-sm rounded-4"><div class="card-body p-4">
        <h5 class="fw-bold mb-3">Nama Kelas</h5>
        <form onsubmit="saveClassName(event)" class="vstack gap-3">
          <input name="class_name" class="form-control form-control-lg" value="${esc(st.class_name)}" required maxlength="60">
          <div><button class="btn btn-primary rounded-3 px-4">Simpan</button></div>
        </form>
      </div></div></div>
      <div class="col-lg-5"><div class="card border-0 shadow-sm rounded-4"><div class="card-body p-4">
        <h5 class="fw-bold mb-3">Logo Kelas</h5>
        <div class="d-flex align-items-center gap-3 mb-3">
          ${st.logo_url ? `<img src="${esc(st.logo_url)}" class="logo-preview" alt="">` : '<div class="logo-preview"><i class="bi bi-image"></i></div>'}
          <p class="small text-secondary mb-0">PNG atau JPG, maksimal 1 MB.</p>
        </div>
        <input type="file" accept="image/*" class="form-control" onchange="uploadFile(this,'saveSettings','logo')">
      </div></div></div>
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
document.querySelectorAll('.theme-toggle').forEach(b => b.onclick = () =>
  applyTheme(document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark'));
window.addEventListener('hashchange', route);
applyTheme(localStorage.getItem('kelas_theme') || 'light');
boot();
