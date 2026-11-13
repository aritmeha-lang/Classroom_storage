// ===== Konfigurasi & state =====
const API = '/api/gas';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROLE_LABEL = { wali_kelas: 'Wali Kelas', ketua_kelas: 'Ketua Kelas', sekretaris: 'Sekretaris', bendahara: 'Bendahara', siswa: 'Siswa' };
const CAN = {
  students: ['wali_kelas', 'ketua_kelas', 'sekretaris'],
  attendance: ['wali_kelas', 'ketua_kelas', 'sekretaris'],
  announcements: ['wali_kelas', 'ketua_kelas'],
  accounts: ['wali_kelas'],
  settings: ['wali_kelas']
};
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'students', label: 'Siswa', icon: '👥', perm: 'students' },
  { id: 'attendance', label: 'Absensi', icon: '✅', perm: 'attendance' },
  { id: 'announcements', label: 'Pengumuman', icon: '📢' },
  { id: 'profile', label: 'Profil', icon: '🙍' },
  { id: 'settings', label: 'Pengaturan', icon: '⚙️', perm: 'settings' }
];
const VIEWS = { dashboard: vDashboard, students: vStudents, attendance: vAttendance, announcements: vAnnouncements, profile: vProfile, settings: vSettings };
const can = p => CAN[p].includes(S.user.role);
const todayLocal = () => new Date().toLocaleDateString('sv-SE');
const readFile = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = no; r.readAsDataURL(f); });
let S = JSON.parse(localStorage.getItem('kelas_session') || 'null'); // { token, user, profile, settings }
let attDate = todayLocal();
let busy = 0;

// ===== API & UI dasar =====
function showLoader(on) { busy += on ? 1 : -1; $('#loader').classList.toggle('show', busy > 0); }
function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 3500);
}
async function api(action, payload = {}) {
  showLoader(true);
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload, token: S?.token }) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    return j.data;
  } catch (e) {
    toast(e.message || 'Gagal terhubung ke server', 'error');
    if (/login ulang/.test(e.message)) logout();
    throw e;
  } finally {
    showLoader(false);
  }
}
function modal(title, fields, onSubmit) {
  $('#modal').innerHTML = `<form class="sheet fade"><h3>${title}</h3>${fields}
    <div class="bar end"><button type="button" class="btn ghost" onclick="closeModal()">Batal</button><button class="btn">Simpan</button></div></form>`;
  $('#modal').classList.add('show');
  $('#modal form').onsubmit = async e => {
    e.preventDefault();
    try { await onSubmit(Object.fromEntries(new FormData(e.target))); closeModal(); toast('Tersimpan'); route(); } catch {}
  };
}
function closeModal() { $('#modal').classList.remove('show'); }
function closeSidebar() { $('#app').classList.remove('nav-open'); }

// ===== Sesi, header, routing =====
async function syncMe() {
  const m = await api('me');
  S = { ...S, ...m };
  localStorage.setItem('kelas_session', JSON.stringify(S));
  paintHeader();
}
function paintHeader() {
  $('#class-name').textContent = S.settings?.class_name || 'Kelas';
  $('#class-logo').src = S.settings?.logo_url || '';
  $('#class-logo').hidden = !S.settings?.logo_url;
  $('#user-name').textContent = S.user.nama;
  $('#user-role').textContent = ROLE_LABEL[S.user.role];
  $('#avatar').src = S.profile?.foto_url || '';
  $('#avatar').hidden = !S.profile?.foto_url;
  $('#nav').innerHTML = NAV.filter(n => !n.perm || can(n.perm))
    .map(n => `<a href="#${n.id}" data-id="${n.id}">${n.icon} ${n.label}</a>`).join('');
}
async function boot() {
  $('#login').hidden = !!S;
  $('#app').hidden = !S;
  if (!S) return;
  try { await syncMe(); await route(); } catch {}
}
async function route() {
  if (!S) return;
  let id = location.hash.slice(1) || 'dashboard';
  if (!VIEWS[id]) id = 'dashboard';
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.id === id));
  $('#title').textContent = NAV.find(n => n.id === id).label;
  closeSidebar();
  try { $('#view').innerHTML = await VIEWS[id](); } catch { $('#view').innerHTML = ''; }
}
function logout() {
  localStorage.removeItem('kelas_session');
  S = null;
  location.hash = '';
  boot();
}

// ===== Halaman: Dashboard =====
const card = (label, val, icon) => `<div class="stat"><span>${icon}</span><div><small>${label}</small><b>${val}</b></div></div>`;
const annCard = a => `<article class="card"><h4>${esc(a.title)}</h4><p>${esc(a.content)}</p><small class="muted">${esc(a.created_at).slice(0, 16).replace('T', ' ')}</small></article>`;
async function vDashboard() {
  const d = await api('dashboard');
  return `<section class="fade">
    <div class="grid">${card('Total Siswa', d.totalSiswa, '👥')}${card('Hadir Hari Ini', d.hadir, '✅')}${card('Tidak Hadir', d.tidakHadir, '⚠️')}</div>
    <h3>Pengumuman Terbaru</h3>
    ${d.pengumuman.map(annCard).join('') || '<p class="muted">Belum ada pengumuman.</p>'}
  </section>`;
}

// ===== Halaman: Siswa =====
const roleOpts = cur => ['ketua_kelas', 'sekretaris', 'bendahara', 'siswa']
  .map(r => `<option value="${r}" ${r === cur ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('');
async function vStudents() {
  const list = await api('students');
  return `<section class="fade">
    <div class="bar"><h2>Daftar Siswa</h2><button class="btn" onclick="formStudent()">+ Tambah Siswa</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>No</th><th>NIS</th><th>Nama</th><th>L/P</th><th>Role</th><th>Aksi</th></tr></thead>
      <tbody>${list.map(s => `<tr>
        <td>${s.no_absen}</td><td>${esc(s.nis)}</td><td>${esc(s.nama)}</td><td>${esc(s.jenis_kelamin)}</td>
        <td><span class="badge">${ROLE_LABEL[s.role]}</span></td>
        <td class="actions">
          ${can('accounts') ? `<select onchange="setRole('${s.id}',this.value)">${roleOpts(s.role)}</select>` : ''}
          <button class="link danger" onclick="delStudent('${s.id}')">Hapus</button>
        </td></tr>`).join('')}
      </tbody></table></div>
  </section>`;
}
function formStudent() {
  modal('Tambah Siswa', `
    <label>NIS (jadi username & password awal)<input name="nis" required></label>
    <label>Nama<input name="nama" required></label>
    <label>No. Absen<input name="no_absen" type="number" min="1"></label>
    <label>Jenis Kelamin<select name="jenis_kelamin"><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></label>`,
    d => api('addStudent', d));
}
async function setRole(id, role) { try { await api('setRole', { student_id: id, role }); toast('Role diperbarui'); route(); } catch {} }
async function delStudent(id) {
  if (!confirm('Hapus siswa ini beserta akunnya?')) return;
  try { await api('deleteStudent', { id }); toast('Siswa dihapus'); route(); } catch {}
}

// ===== Halaman: Absensi =====
const ST = { H: 'Hadir', S: 'Sakit', I: 'Izin', A: 'Alpa' };
async function vAttendance() {
  const list = await api('attendance', { date: attDate });
  return `<section class="fade">
    <div class="bar"><h2>Absensi</h2><input type="date" style="width:auto" value="${attDate}" onchange="attDate=this.value;route()"></div>
    <div class="table-wrap"><table>
      <thead><tr><th>No</th><th>Nama</th><th>Status</th></tr></thead>
      <tbody>${list.map(s => `<tr><td>${s.no_absen}</td><td>${esc(s.nama)}</td><td>
        <div class="seg" data-id="${s.student_id}">${Object.entries(ST).map(([k, v]) =>
          `<button type="button" data-k="${k}" class="${s.status === k ? 'on' : ''}" onclick="pickStatus(this)">${v}</button>`).join('')}</div>
      </td></tr>`).join('')}</tbody></table></div>
    <div class="bar end" style="margin-top:14px"><button class="btn" onclick="saveAtt()">Simpan Absensi</button></div>
  </section>`;
}
function pickStatus(btn) { [...btn.parentElement.children].forEach(b => b.classList.toggle('on', b === btn)); }
async function saveAtt() {
  const records = [...document.querySelectorAll('.seg')].map(seg => ({
    student_id: seg.dataset.id, status: seg.querySelector('.on')?.dataset.k || 'H'
  }));
  try { await api('saveAttendance', { date: attDate, records }); toast('Absensi tersimpan'); } catch {}
}

// ===== Halaman: Pengumuman =====
async function vAnnouncements() {
  const list = await api('announcements');
  const manage = can('announcements');
  return `<section class="fade">
    <div class="bar"><h2>Pengumuman</h2>${manage ? '<button class="btn" onclick="formAnn()">+ Buat Pengumuman</button>' : ''}</div>
    ${list.map(a => `<article class="card">
      <div class="bar"><h4>${esc(a.title)}</h4>${manage ? `<button class="link danger" onclick="delAnn('${a.id}')">Hapus</button>` : ''}</div>
      <p>${esc(a.content)}</p><small class="muted">${esc(a.created_at).slice(0, 16).replace('T', ' ')}</small>
    </article>`).join('') || '<p class="muted">Belum ada pengumuman.</p>'}
  </section>`;
}
function formAnn() {
  modal('Pengumuman Baru', `
    <label>Judul<input name="title" required></label>
    <label>Isi<textarea name="content" rows="4" required></textarea></label>`,
    d => api('addAnnouncement', d));
}
async function delAnn(id) {
  if (!confirm('Hapus pengumuman ini?')) return;
  try { await api('deleteAnnouncement', { id }); route(); } catch {}
}

// ===== Halaman: Profil =====
async function vProfile() {
  const p = S.profile || {};
  return `<section class="fade"><h2>Profil Saya</h2>
    <div class="card profile">
      ${p.foto_url ? `<img class="avatar" src="${esc(p.foto_url)}" alt="">` : '<div class="avatar"></div>'}
      <div>
        <h3>${esc(S.user.nama)}</h3>
        <span class="muted">${ROLE_LABEL[S.user.role]} · ${esc(S.user.username)}</span>
        <div class="bar" style="justify-content:flex-start;margin:12px 0 0">
          <label class="btn sm">Ganti Foto<input type="file" accept="image/*" hidden onchange="uploadFile(this,'uploadPhoto','file')"></label>
          <button class="btn ghost sm" onclick="formPass()">Ubah Password</button>
        </div>
      </div>
    </div></section>`;
}
function formPass() {
  modal('Ubah Password', `
    <label>Password lama<input type="password" name="old" required></label>
    <label>Password baru (min. 6 karakter)<input type="password" name="new" minlength="6" required></label>`,
    d => api('changePassword', d));
}
async function uploadFile(input, action, key) {
  const f = input.files[0];
  if (!f) return;
  if (f.size > 1e6) return toast('Ukuran maksimal 1 MB', 'error');
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
  return `<section class="fade"><h2>Pengaturan Kelas</h2>
    <form class="card form" onsubmit="saveClassName(event)">
      <label>Nama Kelas<input name="class_name" value="${esc(S.settings?.class_name)}" required></label>
      <div><button class="btn">Simpan Nama</button></div>
    </form>
    <div class="card form">
      <label>Logo Kelas (PNG/JPG, maks 1 MB)<input type="file" accept="image/*" onchange="uploadFile(this,'saveSettings','logo')"></label>
    </div></section>`;
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
    S = await api('login', { username: f.username.value, password: f.password.value });
    localStorage.setItem('kelas_session', JSON.stringify(S));
    boot();
  } catch {}
};
$('#logout').onclick = logout;
$('#menu').onclick = () => $('#app').classList.toggle('nav-open');
$('#theme').onclick = () => {
  const d = document.documentElement;
  d.dataset.theme = d.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('kelas_theme', d.dataset.theme);
};
document.documentElement.dataset.theme = localStorage.getItem('kelas_theme') || 'light';
window.addEventListener('hashchange', route);
boot();
