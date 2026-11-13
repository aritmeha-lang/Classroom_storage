/**
 * CLASSROOM MANAGEMENT — Backend (Google Apps Script)
 * 1) Project Settings → Script properties: ADMIN_PASSWORD = password wali kelas
 * 2) Jalankan initDatabase() sekali (beri izin saat diminta)
 * 3) Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone
 */

const SHEETS = {
  Users: ['id', 'username', 'password_hash', 'nama', 'role', 'status', 'created_at'],
  Profiles: ['id', 'user_id', 'nama_lengkap', 'no_hp', 'alamat', 'foto_url', 'updated_at'],
  Messages: ['id', 'room_id', 'sender_id', 'content', 'attachment_url', 'read_by', 'created_at'],
  Chat_Rooms: ['id', 'name', 'type', 'created_by', 'created_at'],
  Chat_Members: ['id', 'room_id', 'user_id', 'joined_at'],
  Documents: ['id', 'title', 'file_url', 'file_id', 'category', 'uploaded_by', 'created_at'],
  Announcements: ['id', 'title', 'content', 'file_url', 'created_by', 'created_at'],
  Attendance: ['id', 'date', 'student_id', 'status', 'note', 'recorded_by', 'created_at'],
  Schedules: ['id', 'day', 'start', 'end', 'subject', 'teacher', 'created_by'],
  Duty_Schedule: ['id', 'date', 'student_id', 'task', 'created_by'],
  Students: ['id', 'user_id', 'nis', 'nama', 'jenis_kelamin', 'no_absen', 'created_at'],
  Finance: ['id', 'date', 'type', 'amount', 'description', 'proof_url', 'created_by', 'created_at'],
  Seating_Plan: ['id', 'row', 'col', 'student_id'],
  Photobooth: ['id', 'title', 'file_url', 'uploaded_by', 'created_at'],
  Notifications: ['id', 'user_id', 'message', 'is_read', 'created_at'],
  Activity_Logs: ['id', 'user_id', 'action', 'detail', 'created_at'],
  Settings: ['key', 'value']
};
const FOLDERS = ['Profile_Photos', 'Class_Documents', 'Chat_Attachments', 'Finance_Proofs', 'Photobooth_Gallery', 'Announcement_Files'];
const ROLES = { WALI: 'wali_kelas', KETUA: 'ketua_kelas', SEKRE: 'sekretaris', BENDA: 'bendahara', SISWA: 'siswa' };
const PERM = {
  students: [ROLES.WALI, ROLES.KETUA, ROLES.SEKRE],
  attendance: [ROLES.WALI, ROLES.KETUA, ROLES.SEKRE],
  announcements: [ROLES.WALI, ROLES.KETUA],
  accounts: [ROLES.WALI],
  settings: [ROLES.WALI]
};

// ===== Entry point =====
function doGet() { return out({ ok: true, app: 'Classroom API' }); }

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents || '{}');
    const handler = ACTIONS[req.action];
    must(handler, 'Aksi tidak dikenal');
    const user = req.action === 'login' ? null : auth(req.token);
    return out({ ok: true, data: handler(req.payload || {}, user, req) });
  } catch (err) {
    return out({ ok: false, error: err.message });
  }
}

// ===== Actions =====
const ACTIONS = {
  login: p => {
    const u = rows('Users').find(x => String(x.username) === clean(p.username, 50)
      && x.password_hash === hash(String(p.password ?? '')) && x.status === 'aktif');
    must(u, 'Username atau password salah');
    const user = { id: u.id, username: String(u.username), nama: u.nama, role: u.role };
    const token = Utilities.getUuid();
    CacheService.getScriptCache().put(token, JSON.stringify(user), 21600);
    log(user, 'login', user.username);
    return { token, user, settings: settings() };
  },
  logout: (p, user, req) => { CacheService.getScriptCache().remove(req.token); return true; },
  me: (p, user) => ({ user, profile: rows('Profiles').find(x => x.user_id === user.id) || {}, settings: settings() }),
  changePassword: (p, user) => {
    const u = rows('Users').find(x => x.id === user.id);
    must(u && u.password_hash === hash(String(p.old ?? '')), 'Password lama salah');
    must(String(p.new ?? '').length >= 6, 'Password baru minimal 6 karakter');
    update('Users', user.id, { password_hash: hash(String(p.new)) });
    log(user, 'ganti_password', user.username);
    return true;
  },
  dashboard: () => {
    const att = rows('Attendance').filter(r => day(r.date) === today());
    return {
      totalSiswa: rows('Students').length,
      hadir: att.filter(r => r.status === 'H').length,
      tidakHadir: att.filter(r => r.status && r.status !== 'H').length,
      pengumuman: rows('Announcements').sort(byDesc('created_at')).slice(0, 5)
    };
  },
  students: (p, user) => {
    need(user, 'students');
    const roles = Object.fromEntries(rows('Users').map(u => [u.id, u.role]));
    return rows('Students').sort(byNum('no_absen')).map(s => ({ ...s, role: roles[s.user_id] || ROLES.SISWA }));
  },
  addStudent: (p, user) => {
    need(user, 'students');
    const nis = clean(p.nis, 20), nama = clean(p.nama, 100);
    must(nis && nama, 'NIS dan nama wajib diisi');
    must(!rows('Students').some(s => String(s.nis) === nis), 'NIS sudah terdaftar');
    const acc = insert('Users', { username: nis, password_hash: hash(nis), nama, role: ROLES.SISWA, status: 'aktif' });
    log(user, 'tambah_siswa', nama);
    return insert('Students', { user_id: acc.id, nis, nama, jenis_kelamin: clean(p.jenis_kelamin, 1), no_absen: Number(p.no_absen) || 0 });
  },
  deleteStudent: (p, user) => {
    need(user, 'students');
    const s = rows('Students').find(x => x.id === p.id);
    must(s, 'Siswa tidak ditemukan');
    remove('Students', s.id);
    remove('Users', s.user_id);
    log(user, 'hapus_siswa', s.nama);
    return true;
  },
  setRole: (p, user) => {
    need(user, 'accounts');
    must([ROLES.KETUA, ROLES.SEKRE, ROLES.BENDA, ROLES.SISWA].includes(p.role), 'Role tidak valid');
    const s = rows('Students').find(x => x.id === p.student_id);
    must(s, 'Siswa tidak ditemukan');
    update('Users', s.user_id, { role: p.role });
    log(user, 'ubah_role', s.nama + ' → ' + p.role);
    return true;
  },
  attendance: (p, user) => {
    need(user, 'attendance');
    const date = clean(p.date, 10) || today();
    const recs = rows('Attendance').filter(r => day(r.date) === date);
    return rows('Students').sort(byNum('no_absen')).map(s => ({
      student_id: s.id, nama: s.nama, no_absen: s.no_absen,
      status: (recs.find(r => r.student_id === s.id) || {}).status || 'H'
    }));
  },
  saveAttendance: (p, user) => {
    need(user, 'attendance');
    const date = clean(p.date, 10);
    must(date, 'Tanggal wajib diisi');
    const all = rows('Attendance');
    (p.records || []).forEach(r => {
      must(['H', 'S', 'I', 'A'].includes(r.status), 'Status tidak valid');
      const ex = all.find(x => day(x.date) === date && x.student_id === r.student_id);
      if (ex) update('Attendance', ex.id, { status: r.status, recorded_by: user.id });
      else insert('Attendance', { date, student_id: r.student_id, status: r.status, note: '', recorded_by: user.id });
    });
    log(user, 'simpan_absensi', date);
    return true;
  },
  announcements: () => rows('Announcements').sort(byDesc('created_at')),
  addAnnouncement: (p, user) => {
    need(user, 'announcements');
    const title = clean(p.title, 150), content = clean(p.content, 2000);
    must(title && content, 'Judul dan isi wajib diisi');
    log(user, 'pengumuman', title);
    return insert('Announcements', { title, content, file_url: '', created_by: user.id });
  },
  deleteAnnouncement: (p, user) => { need(user, 'announcements'); remove('Announcements', p.id); return true; },
  uploadPhoto: (p, user) => {
    const f = upload('Profile_Photos', user.username + '_' + Date.now(), p.file);
    const now = new Date().toISOString();
    const pr = rows('Profiles').find(x => x.user_id === user.id);
    if (pr) update('Profiles', pr.id, { foto_url: f.url, updated_at: now });
    else insert('Profiles', { user_id: user.id, nama_lengkap: user.nama, foto_url: f.url, updated_at: now });
    return f.url;
  },
  saveSettings: (p, user) => {
    need(user, 'settings');
    if (p.class_name) setSetting('class_name', clean(p.class_name, 60));
    if (p.logo) setSetting('logo_url', upload('Class_Documents', 'logo_kelas', p.logo).url);
    log(user, 'ubah_pengaturan', p.class_name || 'logo');
    return settings();
  }
};

// ===== Setup database =====
function initDatabase() {
  const doc = ss();
  Object.entries(SHEETS).forEach(([name, cols]) => {
    const sh = doc.getSheetByName(name) || doc.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(cols);
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@'); // simpan sebagai teks (ID, NIS, tanggal)
    sh.setFrozenRows(1);
  });
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SALT')) props.setProperty('SALT', Utilities.getUuid());
  const adminPw = props.getProperty('ADMIN_PASSWORD');
  must(adminPw, 'Isi Script Property ADMIN_PASSWORD dulu');
  if (!rows('Users').length) insert('Users', { username: 'walikelas', password_hash: hash(adminPw), nama: 'Wali Kelas', role: ROLES.WALI, status: 'aktif' });
  if (!rows('Settings').length) setSetting('class_name', 'Kelas Saya');
  const root = folder(DriveApp.getRootFolder(), 'CLASSROOM_STORAGE');
  FOLDERS.forEach(f => folder(root, f));
  Logger.log('Inisialisasi selesai');
}

// ===== Helpers: sheet =====
const ss = () => SpreadsheetApp.getActiveSpreadsheet();
const sheet = name => { const sh = ss().getSheetByName(name); must(sh, 'Sheet ' + name + ' belum ada, jalankan initDatabase()'); return sh; };
const rows = name => {
  const v = sheet(name).getDataRange().getValues();
  return v.slice(1).filter(r => r[0] !== '').map(r => Object.fromEntries(v[0].map((k, i) => [k, r[i]])));
};
function insert(name, data) {
  const row = { id: Utilities.getUuid().slice(0, 8), created_at: new Date().toISOString(), ...data };
  sheet(name).appendRow(SHEETS[name].map(c => row[c] ?? ''));
  return row;
}
function update(name, id, patch) {
  const sh = sheet(name), v = sh.getDataRange().getValues();
  const i = v.findIndex((r, j) => j > 0 && String(r[0]) === String(id));
  must(i > 0, 'Data tidak ditemukan');
  Object.entries(patch).forEach(([k, val]) => { const c = v[0].indexOf(k); if (c >= 0) sh.getRange(i + 1, c + 1).setValue(val); });
}
function remove(name, id) {
  const sh = sheet(name), v = sh.getDataRange().getValues();
  const i = v.findIndex((r, j) => j > 0 && String(r[0]) === String(id));
  if (i > 0) sh.deleteRow(i + 1);
}
const settings = () => Object.fromEntries(rows('Settings').map(r => [r.key, r.value]));
function setSetting(key, value) {
  const sh = sheet('Settings'), v = sh.getDataRange().getValues();
  const i = v.findIndex((r, j) => j > 0 && r[0] === key);
  if (i > 0) sh.getRange(i + 1, 2).setValue(value); else sh.appendRow([key, value]);
}
const log = (user, action, detail) => insert('Activity_Logs', { user_id: user ? user.id : '', action, detail: String(detail || '') });

// ===== Helpers: auth & validasi =====
const hash = s => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, PropertiesService.getScriptProperties().getProperty('SALT') + s)
  .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
function auth(token) {
  must(token, 'Sesi berakhir, silakan login ulang');
  const raw = CacheService.getScriptCache().get(token);
  must(raw, 'Sesi berakhir, silakan login ulang');
  return JSON.parse(raw);
}
const need = (user, perm) => must(PERM[perm].includes(user.role), 'Akses ditolak untuk role ini');
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
const clean = (s, max = 200) => String(s ?? '').trim().slice(0, max);
const today = () => Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
const day = v => String(v).slice(0, 10);
const byDesc = k => (a, b) => String(b[k]).localeCompare(String(a[k]));
const byNum = k => (a, b) => Number(a[k]) - Number(b[k]);
const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);

// ===== Helpers: Google Drive =====
function folder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function saveFile(folderName, name, mime, base64) {
  const dir = folder(folder(DriveApp.getRootFolder(), 'CLASSROOM_STORAGE'), folderName);
  const f = dir.createFile(Utilities.newBlob(Utilities.base64Decode(base64), mime, name));
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { id: f.getId(), url: 'https://drive.google.com/thumbnail?sz=w600&id=' + f.getId() };
}
function upload(folderName, name, file) {
  must(file && /^image\//.test(file.mime), 'File harus berupa gambar');
  must(String(file.base64).length < 1.4e6, 'Ukuran file maksimal 1 MB');
  return saveFile(folderName, name, file.mime, file.base64);
}
