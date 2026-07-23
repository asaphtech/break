(() => {
  'use strict';

  /* ============================================
     Constants
     ============================================ */
  const TOTAL_SECONDS = 37620;        // 08:33:00 → 19:00:00
  const START_SECONDS = 30780;        // 08:33:00 as seconds from midnight
  const MAX_BREAK_DURATION = 1200;    // 20 minutes in seconds
  const TOLERANCE_SECONDS = 60;       // 1 minute (60s) grace period / tolerance
  const LC_OFFSET = 180;             // 3 minutes before break
  const MAX_BREAK_COUNT = 4;

  const MONTHS_ID = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const DAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  const STATUS_CYCLE = ['masuk', 'libur', 'cuti'];
  const STATUS_ICONS = { masuk: '✅', libur: '🏖️', cuti: '📋' };
  const STATUS_LABELS = { masuk: 'Masuk', libur: 'Libur', cuti: 'Cuti' };

  const DEFAULT_STAFF = [
    { id: 'def_01', name: 'PAT', order: 1 },
    { id: 'def_02', name: 'KKY', order: 2 },
    { id: 'def_03', name: 'SUN', order: 3 },
    { id: 'def_04', name: 'JOY', order: 4 },
    { id: 'def_05', name: 'DON', order: 5 },
    { id: 'def_06', name: 'STV', order: 6 },
    { id: 'def_07', name: 'LID', order: 7 },
    { id: 'def_08', name: 'WIL', order: 8 },
    { id: 'def_09', name: 'JUL', order: 9 },
  ];

  /* ============================================
     Utilities
     ============================================ */
  let _idCounter = 0;
  function generateId() {
    return 's_' + Date.now().toString(36) + '_' + (_idCounter++) + '_' + Math.random().toString(36).substring(2, 6);
  }

  function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.round(totalSeconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function parseTimeToSeconds(str) {
    if (!str) return null;
    let clean = str.trim().replace(/[.,\s]+/g, ':');

    if (/^\d{6}$/.test(clean)) {
      clean = `${clean.substring(0,2)}:${clean.substring(2,4)}:${clean.substring(4,6)}`;
    } else if (/^\d{4}$/.test(clean)) {
      clean = `${clean.substring(0,2)}:${clean.substring(2,4)}:00`;
    }

    const parts = clean.split(':');
    if (parts.length < 2) return null;

    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parts[2] !== undefined ? parseInt(parts[2], 10) : 0;

    if (isNaN(h) || isNaN(m) || isNaN(s)) return null;
    if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return null;

    return h * 3600 + m * 60 + s;
  }

  function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function formatDateID(date) {
    const d = new Date(date);
    return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
  }

  function toDateString(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('show'));
    });
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 350);
    }, 3000);
  }

  /* ============================================
     Storage Service
     ============================================ */
  const Storage = {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        console.warn('Storage write failed:', e);
      }
    },
    getStaff()         { return this.get('break_scheduler_staff', null); },
    setStaff(data)     { this.set('break_scheduler_staff', data); },
    getAttendance(y, m){ return this.get(`break_att_${y}_${String(m+1).padStart(2,'0')}`, {}); },
    setAttendance(y, m, data){ this.set(`break_att_${y}_${String(m+1).padStart(2,'0')}`, data); },
  };

  /* ============================================
     Cloud Sync Service (Multi-PC Live Sync)
     ============================================ */
  const CloudSync = {
    _endpoint: 'https://jsonblob.com/api/jsonBlob/019f8d12-4db8-7c04-82f6-a25d87efdf88',
    _syncing: false,
    _lastHash: '',
    _pollTimer: null,

    init() {
      this.updateBadge('syncing', 'Menghubungkan...');
      this._setupModalListeners();
      this.pullData(true).then(() => {
        this.startAutoPoll();
      });
    },

    getSupabaseConfig() {
      const defaultUrl = 'https://cqqkcpplevyibhniszud.supabase.co';
      const defaultKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxcWtjcHBsZXZ5aWJobmlzenVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDI1NTMsImV4cCI6MjA4OTk3ODU1M30.sJsCdap7tU5_luz0dBxzCzULKbPGFdAecS8ukVKms8A';

      let url = Storage.get('break_scheduler_supabase_url', defaultUrl);
      let key = Storage.get('break_scheduler_supabase_key', defaultKey);

      if (url) {
        url = url.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
      }

      return { url, key, isConfigured: Boolean(url && key) };
    },

    setSupabaseConfig(url, key) {
      const cleanUrl = url ? url.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '') : '';
      Storage.set('break_scheduler_supabase_url', cleanUrl);
      Storage.set('break_scheduler_supabase_key', key ? key.trim() : '');
    },

    getEndpoint() {
      return Storage.get('break_scheduler_cloud_url', this._endpoint);
    },

    setEndpoint(url) {
      Storage.set('break_scheduler_cloud_url', url);
    },

    async pullData(isInitial = false) {
      if (this._syncing) return;

      const supa = this.getSupabaseConfig();
      const isSupa = supa.isConfigured;

      if (!isSupa && window.location.protocol === 'file:') {
        this.updateBadge('offline', 'Lokal (file://)');
        return;
      }

      try {
        let data = null;

        if (isSupa) {
          const res = await fetch(`${supa.url}/rest/v1/break_scheduler_data?key=eq.main_state&select=*`, {
            headers: {
              'apikey': supa.key,
              'Authorization': `Bearer ${supa.key}`,
              'Accept': 'application/json'
            }
          });
          if (!res.ok) throw new Error('Supabase pull failed');
          const rows = await res.json();
          if (Array.isArray(rows) && rows.length > 0) {
            data = rows[0].value;
          }
        } else {
          const res = await fetch(this.getEndpoint(), {
            headers: { 'Accept': 'application/json' }
          });
          if (!res.ok) throw new Error('Cloud pull failed');
          data = await res.json();
        }

        if (data && typeof data === 'object' && Array.isArray(data.staff)) {
          const localUpdatedAt = Storage.get('break_scheduler_updated_at', '');
          const cloudUpdatedAt = data.updatedAt || '';

          if (localUpdatedAt && cloudUpdatedAt && new Date(localUpdatedAt) > new Date(cloudUpdatedAt)) {
            this.pushData();
            return;
          }

          const hash = JSON.stringify(data.staff) + JSON.stringify(data.attendance || {}) + JSON.stringify(data.breakChoices || {}) + JSON.stringify(data.breakOverrides || {});
          if (hash !== this._lastHash) {
            this._lastHash = hash;

            if (data.staff && data.staff.length > 0) {
              Storage.setStaff(data.staff);
            }
            if (data.attendance) {
              Object.keys(data.attendance).forEach(k => Storage.set(k, data.attendance[k]));
            }
            if (data.breakChoices) {
              Object.keys(data.breakChoices).forEach(k => Storage.set(k, data.breakChoices[k]));
            }
            if (data.breakOverrides) {
              Object.keys(data.breakOverrides).forEach(k => Storage.set(k, data.breakOverrides[k]));
            }
            if (data.password) Storage.set('break_scheduler_pass', data.password);

            StaffManager.init();
            if (!isInitial) {
              App.refreshAll();
            }
          }
          this.updateBadge('online', isSupa ? 'Supabase Live' : 'Cloud Live');
        }
      } catch (err) {
        console.warn('CloudSync pull error:', err);
        this.updateBadge('offline', 'Local Mode');
      }
    },

    async pushData() {
      const nowIso = new Date().toISOString();
      Storage.set('break_scheduler_updated_at', nowIso);

      const supa = this.getSupabaseConfig();
      const isSupa = supa.isConfigured;

      if (!isSupa && window.location.protocol === 'file:') {
        this.updateBadge('offline', 'Lokal (file://)');
        showToast('Data tersimpan secara lokal!', 'success');
        return;
      }

      try {
        this.updateBadge('syncing', 'Menyimpan...');

        const staff = StaffManager.getAll();
        const password = AuthManager.getPassword();
        
        const attendance = {};
        const breakChoices = {};
        const breakOverrides = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('break_att_')) {
            attendance[key] = Storage.get(key, {});
          }
          if (key && key.startsWith('break_choice_')) {
            breakChoices[key] = Storage.get(key, {});
          }
          if (key && key.startsWith('break_override_')) {
            breakOverrides[key] = Storage.get(key, {});
          }
        }

        const payload = {
          updatedAt: nowIso,
          staff,
          attendance,
          breakChoices,
          breakOverrides,
          password
        };

        this._lastHash = JSON.stringify(staff) + JSON.stringify(attendance) + JSON.stringify(breakChoices) + JSON.stringify(breakOverrides);

        let res;
        if (isSupa) {
          res = await fetch(`${supa.url}/rest/v1/break_scheduler_data`, {
            method: 'POST',
            headers: {
              'apikey': supa.key,
              'Authorization': `Bearer ${supa.key}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify([{
              key: 'main_state',
              value: payload,
              updated_at: nowIso
            }])
          });
        } else {
          res = await fetch(this.getEndpoint(), {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
          });
        }

        if (res.ok) {
          this.updateBadge('online', isSupa ? 'Supabase Live' : 'Cloud Live');
          showToast(isSupa ? 'Data tersimpan ke Supabase! ⚡' : 'Data tersinkronisasi ke Cloud! ☁️', 'success');
        } else {
          throw new Error('Push failed');
        }
      } catch (err) {
        console.warn('CloudSync push error:', err);
        this.updateBadge('offline', 'Gagal Sync');
        showToast('Gagal terhubung ke Cloud (Tersimpan di lokal)', 'info');
      }
    },

    startAutoPoll() {
      if (this._pollTimer) clearInterval(this._pollTimer);
      this._pollTimer = setInterval(() => {
        this.pullData(false);
      }, 10000);
    },

    _setupModalListeners() {
      const cloudBadge = document.getElementById('cloudBadge');
      const supaModal = document.getElementById('supabaseModal');
      const closeSupaModal = document.getElementById('closeSupabaseModal');
      const cancelSupa = document.getElementById('cancelSupabase');
      const saveSupa = document.getElementById('saveSupabase');
      const supaUrlInput = document.getElementById('supabaseUrlInput');
      const supaKeyInput = document.getElementById('supabaseKeyInput');
      const supaStatus = document.getElementById('supabaseStatusMsg');

      if (cloudBadge) {
        cloudBadge.style.cursor = 'pointer';
        cloudBadge.addEventListener('click', () => {
          const cfg = this.getSupabaseConfig();
          supaUrlInput.value = cfg.url;
          supaKeyInput.value = cfg.key;
          supaStatus.style.display = 'none';
          supaModal.classList.add('show');
          setTimeout(() => supaUrlInput.focus(), 150);
        });
      }

      const hideSupaModal = () => {
        if (supaModal) supaModal.classList.remove('show');
      };

      if (closeSupaModal) closeSupaModal.addEventListener('click', hideSupaModal);
      if (cancelSupa) cancelSupa.addEventListener('click', hideSupaModal);
      if (supaModal) {
        supaModal.addEventListener('click', (e) => {
          if (e.target === supaModal) hideSupaModal();
        });
      }

      if (saveSupa) {
        saveSupa.addEventListener('click', async () => {
          const url = supaUrlInput.value.trim().replace(/\/+$/, '');
          const key = supaKeyInput.value.trim();

          if (!url || !key) {
            supaStatus.textContent = '⚠️ Harap isi Supabase URL dan API Key!';
            supaStatus.style.color = 'var(--red)';
            supaStatus.style.display = 'block';
            return;
          }

          this.setSupabaseConfig(url, key);
          supaStatus.textContent = '🔄 Menguji koneksi Supabase...';
          supaStatus.style.color = 'var(--amber)';
          supaStatus.style.display = 'block';

          await this.pushData();
          hideSupaModal();
        });
      }
    },

    startAutoPoll() {
      if (this._pollTimer) clearInterval(this._pollTimer);
      this._pollTimer = setInterval(() => {
        this.pullData(false);
      }, 10000);
    },

    updateBadge(status, text) {
      const badge = document.getElementById('cloudBadge');
      const icon = document.getElementById('cloudIcon');
      const textEl = document.getElementById('cloudText');

      if (!badge) return;

      badge.className = `header-badge cloud-badge cloud-${status}`;
      if (textEl) textEl.textContent = text;

      if (status === 'online') {
        if (icon) icon.textContent = '☁️';
        badge.title = 'Terhubung ke Cloud. Data tersinkronisasi otomatis antar PC.';
      } else if (status === 'syncing') {
        if (icon) icon.textContent = '🔄';
        badge.title = 'Sedang menyinkronkan data...';
      } else {
        if (icon) icon.textContent = '⚠️';
        badge.title = 'Mode Lokal / Gagal terhubung ke Cloud.';
      }
    }
  };

  /* ============================================
     Auth Manager (Password Security)
     ============================================ */
  const AuthManager = {
    _isUnlocked: false,
    _pendingAction: null,

    init() {
      this.updateUI();
      this._setupListeners();
    },

    getPassword() {
      return Storage.get('break_scheduler_pass', '1234');
    },

    setPassword(newPass) {
      Storage.set('break_scheduler_pass', newPass);
      if (typeof CloudSync !== 'undefined' && CloudSync.pushData) {
        CloudSync.pushData();
      }
    },

    verify(inputPass) {
      const correct = this.getPassword();
      if (inputPass === correct) {
        this.unlock();
        return true;
      }
      return false;
    },

    isUnlocked() {
      return this._isUnlocked;
    },

    unlock() {
      this._isUnlocked = true;
      this.updateUI();
      showToast('Akses edit terbuka 🔓', 'info');
    },

    lock() {
      this._isUnlocked = false;
      this.updateUI();
      showToast('Mode edit dikunci 🔒', 'info');
    },

    toggleLock() {
      if (this._isUnlocked) {
        this.lock();
      } else {
        this.requireAuth();
      }
    },

    requireAuth(callback) {
      if (this._isUnlocked) {
        if (callback) callback();
        return true;
      }
      this._pendingAction = callback || null;
      this.showAuthModal();
      return false;
    },

    showAuthModal() {
      const modal = document.getElementById('authModal');
      const input = document.getElementById('authPasswordInput');
      const errorMsg = document.getElementById('authErrorMsg');

      if (!modal) return;
      input.value = '';
      errorMsg.style.display = 'none';
      modal.classList.add('show');
      setTimeout(() => input.focus(), 150);
    },

    hideAuthModal() {
      const modal = document.getElementById('authModal');
      if (modal) modal.classList.remove('show');
      this._pendingAction = null;
    },

    updateUI() {
      const btn = document.getElementById('lockBtn');
      const icon = document.getElementById('lockIcon');
      const text = document.getElementById('lockText');

      if (!btn) return;

      if (this._isUnlocked) {
        btn.className = 'btn-lock unlocked';
        if (icon) icon.textContent = '🔓';
        if (text) text.textContent = 'Mode Edit Aktif';
        btn.title = 'Mode Edit Terbuka (Klik untuk mengunci)';
      } else {
        btn.className = 'btn-lock locked';
        if (icon) icon.textContent = '🔒';
        if (text) text.textContent = 'Terkunci';
        btn.title = 'Mode Terkunci (Klik untuk membuka akses edit dengan password)';
      }
    },

    _setupListeners() {
      const lockBtn = document.getElementById('lockBtn');
      const authModal = document.getElementById('authModal');
      const authInput = document.getElementById('authPasswordInput');
      const confirmAuth = document.getElementById('confirmAuth');
      const cancelAuth = document.getElementById('cancelAuth');
      const closeAuth = document.getElementById('closeAuthModal');
      const errorMsg = document.getElementById('authErrorMsg');

      if (lockBtn) {
        lockBtn.addEventListener('click', () => this.toggleLock());
      }

      const submitAuth = () => {
        const pass = authInput.value;
        if (this.verify(pass)) {
          this.hideAuthModal();
          if (this._pendingAction) {
            const action = this._pendingAction;
            this._pendingAction = null;
            action();
          }
        } else {
          errorMsg.style.display = 'block';
          authInput.select();
        }
      };

      if (confirmAuth) confirmAuth.addEventListener('click', submitAuth);
      if (authInput) {
        authInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submitAuth();
          }
        });
      }

      if (cancelAuth) cancelAuth.addEventListener('click', () => this.hideAuthModal());
      if (closeAuth) closeAuth.addEventListener('click', () => this.hideAuthModal());
      if (authModal) {
        authModal.addEventListener('click', (e) => {
          if (e.target === authModal) this.hideAuthModal();
        });
      }

      // Change Password Modal setup
      const changePassModal = document.getElementById('changePassModal');
      const openChangeBtn = document.getElementById('openChangePassBtn');
      const closeChangeBtn = document.getElementById('closeChangePassModal');
      const cancelChangeBtn = document.getElementById('cancelChangePass');
      const saveChangeBtn = document.getElementById('saveChangePass');
      const oldInput = document.getElementById('oldPassInput');
      const newInput = document.getElementById('newPassInput');
      const confirmNewInput = document.getElementById('confirmNewPassInput');
      const changeErr = document.getElementById('changePassErrorMsg');

      if (openChangeBtn) {
        openChangeBtn.addEventListener('click', () => {
          oldInput.value = '';
          newInput.value = '';
          confirmNewInput.value = '';
          changeErr.style.display = 'none';
          changePassModal.classList.add('show');
          setTimeout(() => oldInput.focus(), 150);
        });
      }

      const hideChangeModal = () => {
        if (changePassModal) changePassModal.classList.remove('show');
      };

      if (closeChangeBtn) closeChangeBtn.addEventListener('click', hideChangeModal);
      if (cancelChangeBtn) cancelChangeBtn.addEventListener('click', hideChangeModal);

      if (saveChangeBtn) {
        saveChangeBtn.addEventListener('click', () => {
          const oldP = oldInput.value;
          const newP = newInput.value;
          const confP = confirmNewInput.value;

          if (oldP !== this.getPassword()) {
            changeErr.textContent = '⚠️ Password lama tidak sesuai!';
            changeErr.style.display = 'block';
            oldInput.focus();
            return;
          }

          if (!newP || newP.length < 3) {
            changeErr.textContent = '⚠️ Password baru minimal 3 karakter!';
            changeErr.style.display = 'block';
            newInput.focus();
            return;
          }

          if (newP !== confP) {
            changeErr.textContent = '⚠️ Konfirmasi password baru tidak cocok!';
            changeErr.style.display = 'block';
            confirmNewInput.focus();
            return;
          }

          this.setPassword(newP);
          showToast('Password keamanan berhasil diubah!', 'success');
          hideChangeModal();
          this.hideAuthModal();
          this.unlock();
        });
      }
    }
  };

  /* ============================================
     Staff Manager
     ============================================ */
  const StaffManager = {
    _staff: [],

    init() {
      const saved = Storage.getStaff();
      if (saved && saved.length > 0) {
        this._staff = saved;
      } else {
        this._staff = JSON.parse(JSON.stringify(DEFAULT_STAFF));
        this._save();
      }
    },

    getAll() {
      return [...this._staff].sort((a, b) => a.order - b.order);
    },

    getById(id) {
      return this._staff.find(s => s.id === id);
    },

    add(name) {
      const trimmed = name.toUpperCase().trim();
      if (!trimmed) return null;
      // Check duplicate
      if (this._staff.some(s => s.name === trimmed)) {
        showToast('Staff dengan nama tersebut sudah ada!', 'error');
        return null;
      }
      const maxOrder = this._staff.length > 0 ? Math.max(...this._staff.map(s => s.order)) : 0;
      const staff = { id: generateId(), name: trimmed, order: maxOrder + 1 };
      this._staff.push(staff);
      this._save();
      return staff;
    },

    update(id, name) {
      const trimmed = name.toUpperCase().trim();
      if (!trimmed) return false;
      const staff = this.getById(id);
      if (!staff) return false;
      // Check duplicate (excluding self)
      if (this._staff.some(s => s.name === trimmed && s.id !== id)) {
        showToast('Staff dengan nama tersebut sudah ada!', 'error');
        return false;
      }
      staff.name = trimmed;
      this._save();
      return true;
    },

    remove(id) {
      this._staff = this._staff.filter(s => s.id !== id);
      // Re-order
      this.getAll().forEach((s, i) => { s.order = i + 1; });
      this._save();
    },

    moveUp(id) {
      const sorted = this.getAll();
      const idx = sorted.findIndex(s => s.id === id);
      if (idx > 0) {
        const tmpOrder = sorted[idx].order;
        sorted[idx].order = sorted[idx - 1].order;
        sorted[idx - 1].order = tmpOrder;
        this._save();
      }
    },

    moveDown(id) {
      const sorted = this.getAll();
      const idx = sorted.findIndex(s => s.id === id);
      if (idx >= 0 && idx < sorted.length - 1) {
        const tmpOrder = sorted[idx].order;
        sorted[idx].order = sorted[idx + 1].order;
        sorted[idx + 1].order = tmpOrder;
        this._save();
      }
    },

    _save() {
      Storage.setStaff(this._staff);
      if (typeof CloudSync !== 'undefined' && CloudSync.pushData) {
        CloudSync.pushData();
      }
    }
  };

  /* ============================================
     Attendance Manager
     ============================================ */
  const AttendanceManager = {
    getStatus(staffId, date) {
      const d = new Date(date);
      const data = Storage.getAttendance(d.getFullYear(), d.getMonth());
      return (data[staffId] && data[staffId][d.getDate()]) || 'masuk';
    },

    setStatus(staffId, date, status) {
      const d = new Date(date);
      const data = Storage.getAttendance(d.getFullYear(), d.getMonth());
      if (!data[staffId]) data[staffId] = {};
      data[staffId][d.getDate()] = status;
      Storage.setAttendance(d.getFullYear(), d.getMonth(), data);
      if (typeof CloudSync !== 'undefined' && CloudSync.pushData) {
        CloudSync.pushData();
      }
    },

    toggleStatus(staffId, date) {
      const current = this.getStatus(staffId, date);
      const nextIdx = (STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length;
      const next = STATUS_CYCLE[nextIdx];
      this.setStatus(staffId, date, next);
      return next;
    },

    getBaseDate() {
      const saved = Storage.get('break_scheduler_base_date', '2026-07-23');
      return new Date(saved + 'T00:00:00');
    },

    setBaseDate(dateStr) {
      Storage.set('break_scheduler_base_date', dateStr);
    },

    getActiveStaffForDate(date) {
      const masterStaff = StaffManager.getAll();
      if (masterStaff.length === 0) return [];

      const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const base = this.getBaseDate();
      const baseDay = new Date(base.getFullYear(), base.getMonth(), base.getDate());

      const diffTime = target.getTime() - baseDay.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));

      const N = masterStaff.length;
      let offset = diffDays % N;
      if (offset < 0) offset = (offset % N + N) % N;

      // Rotate master list: 1st staff moves to back tomorrow, 2nd becomes 1st, etc.
      const rotatedStaff = [
        ...masterStaff.slice(offset),
        ...masterStaff.slice(0, offset)
      ];

      return rotatedStaff.filter(s => this.getStatus(s.id, target) === 'masuk');
    },

    getMonthSummary(year, month) {
      const allStaff = StaffManager.getAll();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const summary = {};
      allStaff.forEach(staff => {
        summary[staff.id] = { name: staff.name, masuk: 0, libur: 0, cuti: 0 };
        for (let d = 1; d <= daysInMonth; d++) {
          const date = new Date(year, month, d);
          const status = this.getStatus(staff.id, date);
          summary[staff.id][status]++;
        }
      });
      return summary;
    }
  };

  /* ============================================
     Break Choice Manager (Staff Custom Duration)
     ============================================ */
  const BreakChoiceManager = {
    getChoices(date) {
      const dateStr = toDateString(date);
      return Storage.get(`break_choice_${dateStr}`, {});
    },

    setChoice(date, staffId, roundNumber, durationSeconds) {
      const dateStr = toDateString(date);
      const choices = this.getChoices(date);
      if (!choices[staffId]) choices[staffId] = {};
      choices[staffId][`round_${roundNumber}`] = durationSeconds;
      Storage.set(`break_choice_${dateStr}`, choices);
      if (typeof CloudSync !== 'undefined' && CloudSync.pushData) {
        CloudSync.pushData();
      }
    },

    getStaffChoice(date, staffId, roundNumber, defaultDuration) {
      const choices = this.getChoices(date);
      if (choices[staffId] && choices[staffId][`round_${roundNumber}`]) {
        return choices[staffId][`round_${roundNumber}`];
      }
      return defaultDuration;
    }
  };

  /* ============================================
     Break Override Manager (Manual KELUAR / MASUK Edits)
     ============================================ */
  const BreakOverrideManager = {
    getOverrides(date) {
      const dateStr = toDateString(date);
      return Storage.get(`break_override_${dateStr}`, {});
    },

    setKeluar(date, staffId, roundNumber, timeStr) {
      const dateStr = toDateString(date);
      const overrides = this.getOverrides(date);
      if (!overrides[staffId]) overrides[staffId] = {};
      if (!overrides[staffId][`round_${roundNumber}`]) overrides[staffId][`round_${roundNumber}`] = {};

      const secs = parseTimeToSeconds(timeStr);
      if (secs !== null) {
        overrides[staffId][`round_${roundNumber}`].keluar = secs;
      } else {
        delete overrides[staffId][`round_${roundNumber}`].keluar;
      }
      Storage.set(`break_override_${dateStr}`, overrides);
      if (typeof CloudSync !== 'undefined' && CloudSync.pushData) {
        CloudSync.pushData();
      }
    },

    setMasuk(date, staffId, roundNumber, timeStr) {
      const dateStr = toDateString(date);
      const overrides = this.getOverrides(date);
      if (!overrides[staffId]) overrides[staffId] = {};
      if (!overrides[staffId][`round_${roundNumber}`]) overrides[staffId][`round_${roundNumber}`] = {};

      const secs = parseTimeToSeconds(timeStr);
      if (secs !== null) {
        overrides[staffId][`round_${roundNumber}`].masuk = secs;
      } else {
        delete overrides[staffId][`round_${roundNumber}`].masuk;
      }
      Storage.set(`break_override_${dateStr}`, overrides);
      if (typeof CloudSync !== 'undefined' && CloudSync.pushData) {
        CloudSync.pushData();
      }
    },

    getStaffOverride(date, staffId, roundNumber) {
      const overrides = this.getOverrides(date);
      if (overrides[staffId] && overrides[staffId][`round_${roundNumber}`]) {
        return overrides[staffId][`round_${roundNumber}`];
      }
      return {};
    }
  };

  /* ============================================
     Break Calculator
     ============================================ */
  const BreakCalculator = {
    /**
     * Calculate 4 break durations (in seconds) for N staff.
     * Uses Arithmetic Progression: B1 >= B2 >= B3 >= B4.
     * B1 is always 20 min (1200s) when possible.
     */
    calculateDurations(N) {
      if (N <= 0) return [];

      const perPerson = Math.floor(TOTAL_SECONDS / N);

      // If enough time for all breaks at max duration
      if (perPerson >= MAX_BREAK_DURATION * MAX_BREAK_COUNT) {
        return Array(MAX_BREAK_COUNT).fill(MAX_BREAK_DURATION);
      }

      // Arithmetic Progression: B1=1200, B2=1200-d, B3=1200-2d, B4=1200-3d
      // Sum = 4×1200 - 6d = perPerson  →  d = (4800 - perPerson) / 6
      const dRaw = (MAX_BREAK_DURATION * MAX_BREAK_COUNT - perPerson) / 6;

      let B1 = MAX_BREAK_DURATION;
      let B2 = Math.floor((MAX_BREAK_DURATION - dRaw) / 10) * 10;
      let B3 = Math.floor((MAX_BREAK_DURATION - 2 * dRaw) / 10) * 10;
      let B4 = perPerson - B1 - B2 - B3;

      // Fix rounding: if B4 >= B3, increment B3 to restore decreasing order
      while (B4 >= B3 && B3 + 10 <= B2) {
        B3 += 10;
        B4 -= 10;
      }

      // Fallback to per-second precision if 10s rounding can't maintain order
      if (B4 >= B3 || B4 <= 0) {
        B2 = Math.floor(MAX_BREAK_DURATION - dRaw);
        B3 = Math.floor(MAX_BREAK_DURATION - 2 * dRaw);
        B4 = perPerson - B1 - B2 - B3;
      }

      // Ultimate safety: equal distribution
      if (B4 <= 0 || B3 <= 0 || B2 <= 0 || B4 >= B3) {
        const eq = Math.floor(perPerson / MAX_BREAK_COUNT);
        return [perPerson - (MAX_BREAK_COUNT - 1) * eq, eq, eq, eq];
      }

      return [B1, B2, B3, B4];
    },

    /**
     * Generate the full break schedule for a list of active staff.
     */
    generateSchedule(activeStaff, date) {
      const N = activeStaff.length;
      if (N === 0) return null;

      const targetDate = date || State.scheduleDate || new Date();
      const defaultDurations = this.calculateDurations(N);
      const schedule = {
        staffCount: N,
        staff: activeStaff,
        durations: defaultDurations,
        breaks: []
      };

      let roundStart = START_SECONDS;

      for (let r = 0; r < MAX_BREAK_COUNT; r++) {
        const defaultDuration = defaultDurations[r];
        const breakRound = {
          roundNumber: r + 1,
          defaultDuration: defaultDuration,
          slots: []
        };

        let currentPointer = roundStart;

        for (let i = 0; i < N; i++) {
          const staff = activeStaff[i];
          const chosenDuration = BreakChoiceManager.getStaffChoice(
            targetDate,
            staff.id,
            r + 1,
            defaultDuration
          );

          const override = BreakOverrideManager.getStaffOverride(
            targetDate,
            staff.id,
            r + 1
          );

          const keluar = (override.keluar !== undefined) ? override.keluar : currentPointer;
          const matikanLC = keluar - LC_OFFSET;
          const masuk = (override.masuk !== undefined) ? override.masuk : (keluar + chosenDuration);

          const actualDuration = masuk - keluar;
          const maxAllowed = chosenDuration + TOLERANCE_SECONDS;
          const isLate = actualDuration > maxAllowed;
          const isWithinTolerance = actualDuration > chosenDuration && actualDuration <= maxAllowed;

          breakRound.slots.push({
            staffId: staff.id,
            staffName: staff.name,
            chosenDuration,
            defaultDuration,
            matikanLC,
            keluar,
            masuk,
            actualDuration,
            isLate,
            isWithinTolerance,
            isKeluarOverride: override.keluar !== undefined,
            isMasukOverride: override.masuk !== undefined,
            isCustom: chosenDuration !== defaultDuration
          });

          // Next staff in line goes out exactly when this staff member returns!
          currentPointer = masuk;
        }

        // Next break round starts when the last staff member of this round finishes!
        roundStart = currentPointer;
        schedule.breaks.push(breakRound);
      }

      return schedule;
    }
  };

  /* ============================================
     UI State
     ============================================ */
  const State = {
    currentTab: 'schedule',
    scheduleDate: new Date(),
    calYear: new Date().getFullYear(),
    calMonth: new Date().getMonth(),
    editingStaffId: null,
    deletingStaffId: null
  };

  /* ============================================
     Schedule Renderer
     ============================================ */
  const ScheduleRenderer = {
    render() {
      const date = State.scheduleDate;
      const activeStaff = AttendanceManager.getActiveStaffForDate(date);

      // Update header
      document.getElementById('headerDate').textContent = formatDateID(date);
      document.getElementById('activeCount').textContent = activeStaff.length;
      document.getElementById('scheduleDate').value = toDateString(date);

      const wrapper = document.getElementById('scheduleTableWrapper');
      const footer = document.getElementById('scheduleFooter');

      if (activeStaff.length === 0) {
        wrapper.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📭</div>
            <div class="empty-state-title">Tidak ada staff aktif</div>
            <div class="empty-state-text">Semua staff sedang libur atau cuti pada tanggal ini. Buka tab "Jadwal Kehadiran" untuk mengatur status staff.</div>
          </div>`;
        footer.innerHTML = '';
        return;
      }

      const schedule = BreakCalculator.generateSchedule(activeStaff, date);
      wrapper.innerHTML = this._buildTable(schedule);
      footer.innerHTML = this._buildFooter(schedule);
    },

    _buildTable(schedule) {
      const staff = schedule.staff;
      const N = staff.length;

      let html = '<table class="schedule-table"><thead><tr>';
      html += '<th class="label-col">BREAK</th>';
      staff.forEach(s => {
        html += `<th class="staff-col">${this._escHtml(s.name)}</th>`;
      });
      html += '</tr></thead><tbody>';

      schedule.breaks.forEach(br => {
        // Break group header
        html += `<tr class="break-header-row"><td colspan="${N + 1}" class="break-header-cell">`;
        html += `<span class="break-label">Break ${br.roundNumber}</span>`;
        html += `<span class="break-duration-badge">Default: ${formatDuration(br.defaultDuration)}</span>`;
        html += '</td></tr>';

        // MATIKAN LC row
        html += '<tr class="row-matikan">';
        html += '<td class="label-cell">🔴 MATIKAN LC</td>';
        br.slots.forEach(slot => {
          html += `<td class="time-cell matikan-cell">${formatTime(slot.matikanLC)}</td>`;
        });
        html += '</tr>';

        // KELUAR row (Editable Text Input for easy typing & pasting)
        html += '<tr class="row-keluar">';
        html += '<td class="label-cell">🚶 KELUAR</td>';
        br.slots.forEach(slot => {
          html += '<td class="time-cell keluar-cell">';
          html += `<input type="text" maxlength="8" class="time-input keluar-input ${slot.isKeluarOverride ? 'is-override' : ''}" `;
          html += `data-staff-id="${slot.staffId}" data-round="${br.roundNumber}" data-type="keluar" `;
          html += `value="${formatTime(slot.keluar)}" placeholder="00:00:00" title="Klik atau paste jam keluar ${this._escHtml(slot.staffName)}">`;
          html += '</td>';
        });
        html += '</tr>';

        // DURASI row (Staff Duration Selector)
        html += '<tr class="row-durasi">';
        html += '<td class="label-cell">⏱️ DURASI</td>';
        br.slots.forEach(slot => {
          html += '<td class="time-cell durasi-cell">';
          html += `<select class="duration-select ${slot.isCustom ? 'custom-chosen' : ''}" `;
          html += `data-staff-id="${slot.staffId}" data-round="${br.roundNumber}" `;
          html += `title="Pilih opsi durasi break untuk ${this._escHtml(slot.staffName)}">`;

          schedule.durations.forEach(durSec => {
            const isSelected = slot.chosenDuration === durSec;
            html += `<option value="${durSec}" ${isSelected ? 'selected' : ''}>${formatDuration(durSec)}</option>`;
          });

          html += '</select></td>';
        });
        html += '</tr>';

        // MASUK row (Editable Text Input for easy typing & pasting)
        html += '<tr class="row-masuk">';
        html += '<td class="label-cell">✅ MASUK</td>';
        br.slots.forEach(slot => {
          let inputClass = 'time-input masuk-input';
          if (slot.isLate) inputClass += ' is-late';
          else if (slot.isWithinTolerance) inputClass += ' is-tolerance';
          else if (slot.isMasukOverride) inputClass += ' is-override';

          html += '<td class="time-cell masuk-cell">';
          html += `<input type="text" maxlength="8" class="${inputClass}" `;
          html += `data-staff-id="${slot.staffId}" data-round="${br.roundNumber}" data-type="masuk" `;
          html += `value="${formatTime(slot.masuk)}" placeholder="00:00:00" title="Klik atau paste jam masuk ${this._escHtml(slot.staffName)}">`;

          if (slot.isLate) {
            html += `<div class="tolerance-tag late-tag" title="Durasi ${formatDuration(slot.actualDuration)} melebihi batas toleransi 21:00m">⚠️ Telat (${formatDuration(slot.actualDuration)})</div>`;
          } else if (slot.isWithinTolerance) {
            html += `<div class="tolerance-tag safe-tag" title="Durasi ${formatDuration(slot.actualDuration)} (Toleransi +1m)">🛡️ Toleransi (${formatDuration(slot.actualDuration)})</div>`;
          }

          html += '</td>';
        });
        html += '</tr>';
      });

      html += '</tbody></table>';
      return html;
    },

    _buildFooter(schedule) {
      const N = schedule.staffCount;
      const durations = schedule.durations;
      const lastBreak = schedule.breaks[MAX_BREAK_COUNT - 1];
      const lastSlot = lastBreak.slots[lastBreak.slots.length - 1];
      const endTime = formatTime(lastSlot.masuk);

      const durList = durations.map(d => formatDuration(d)).join(', ');

      let html = '';
      html += `<p>Total CS yang bertugas hari ini adalah <strong>${N} orang</strong>. Mohon kerjasamanya untuk mematuhi tabel jadwal di atas demi kenyamanan bersama.</p>`;
      html += `<p>🔄 <strong>Rotasi Harian Otomatis:</strong> Urutan break berotasi otomatis setiap hari (staff urutan pertama hari ini bergeser ke posisi paling belakang esok harinya).</p>`;
      html += `<p>🛡️ <strong>Toleransi 1 Menit:</strong> Setiap durasi break diberikan toleransi +1 menit. (Contoh: break 20m baru dianggap telat jika mencapai 21:00 menit).</p>`;
      html += `<p>Terdapat 4 variasi durasi break: <strong>${durList}</strong>.</p>`;
      html += `<p>Jadwal break berjalan berurutan dan baru berhenti hingga CS ke istirahat terakhir selesai pukul <strong>${endTime} WIB</strong>.</p>`;

      if (N <= 7) {
        html += `<p style="color:var(--green)">✅ Semua break berdurasi penuh 20 menit karena jumlah staff ≤ 7 orang.</p>`;
      }

      return html;
    },

    _escHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  };

  /* ============================================
     Staff Renderer
     ============================================ */
  const StaffRenderer = {
    render() {
      const staff = StaffManager.getAll();
      const list = document.getElementById('staffList');
      const badge = document.getElementById('staffCountBadge');

      badge.textContent = `${staff.length} staff`;

      if (staff.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">👥</div>
            <div class="empty-state-title">Belum ada staff</div>
            <div class="empty-state-text">Tambahkan staff baru menggunakan form di atas.</div>
          </div>`;
        return;
      }

      let html = '';
      staff.forEach((s, idx) => {
        html += `<div class="staff-item" data-id="${s.id}">`;
        html += `  <span class="staff-order">${idx + 1}</span>`;
        html += `  <span class="staff-name">${this._escHtml(s.name)}</span>`;
        html += '  <div class="staff-actions">';
        html += `    <button class="btn-action up" data-action="up" data-id="${s.id}" title="Pindah ke atas"${idx === 0 ? ' disabled style="opacity:0.3"' : ''}>▲</button>`;
        html += `    <button class="btn-action down" data-action="down" data-id="${s.id}" title="Pindah ke bawah"${idx === staff.length - 1 ? ' disabled style="opacity:0.3"' : ''}>▼</button>`;
        html += `    <button class="btn-action edit" data-action="edit" data-id="${s.id}" title="Edit nama">✏️</button>`;
        html += `    <button class="btn-action delete" data-action="delete" data-id="${s.id}" title="Hapus staff">🗑️</button>`;
        html += '  </div>';
        html += '</div>';
      });

      list.innerHTML = html;
    },

    _escHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  };

  /* ============================================
     Calendar Renderer
     ============================================ */
  const CalendarRenderer = {
    render() {
      const year = State.calYear;
      const month = State.calMonth;
      const allStaff = StaffManager.getAll();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      // Update label
      document.getElementById('monthLabel').textContent = `${MONTHS_ID[month]} ${year}`;

      const wrapper = document.getElementById('attendanceTableWrapper');
      const summaryEl = document.getElementById('attendanceSummary');

      if (allStaff.length === 0) {
        wrapper.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📅</div>
            <div class="empty-state-title">Belum ada staff</div>
            <div class="empty-state-text">Tambahkan staff terlebih dahulu di tab "Kelola Staff".</div>
          </div>`;
        summaryEl.innerHTML = '';
        return;
      }

      wrapper.innerHTML = this._buildTable(allStaff, year, month, daysInMonth);
      summaryEl.innerHTML = this._buildSummary(year, month);
    },

    _buildTable(staff, year, month, days) {
      let html = '<table class="attendance-table"><thead><tr>';
      html += '<th class="staff-name-col">Staff</th>';

      for (let d = 1; d <= days; d++) {
        const date = new Date(year, month, d);
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        html += `<th class="${isWeekend ? 'weekend' : ''}">${d}<span class="day-name">${DAYS_ID[dayOfWeek]}</span></th>`;
      }
      html += '</tr></thead><tbody>';

      staff.forEach(s => {
        html += '<tr>';
        html += `<td class="staff-name-cell">${this._escHtml(s.name)}</td>`;

        for (let d = 1; d <= days; d++) {
          const date = new Date(year, month, d);
          const dayOfWeek = date.getDay();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          const status = AttendanceManager.getStatus(s.id, date);
          const icon = STATUS_ICONS[status];
          const extraClass = isWeekend ? ' weekend-col' : '';

          html += `<td class="attendance-cell ${status}${extraClass}" `
                + `data-staff-id="${s.id}" data-day="${d}" `
                + `title="${s.name} — ${d} ${MONTHS_ID[month]}: ${STATUS_LABELS[status]}">`
                + `${icon}</td>`;
        }
        html += '</tr>';
      });

      html += '</tbody></table>';
      return html;
    },

    _buildSummary(year, month) {
      const summary = AttendanceManager.getMonthSummary(year, month);
      const staff = StaffManager.getAll();

      let html = `<div class="summary-title">📊 Ringkasan ${MONTHS_ID[month]} ${year}</div>`;
      html += '<div class="summary-grid">';

      staff.forEach(s => {
        const data = summary[s.id] || { masuk: 0, libur: 0, cuti: 0 };
        html += '<div class="summary-item">';
        html += `<span class="summary-name">${this._escHtml(s.name)}</span>`;
        html += '<span class="summary-stats">';
        html += `<span class="summary-stat masuk">${data.masuk} Masuk</span>`;
        html += `<span class="summary-stat libur">${data.libur} Libur</span>`;
        html += `<span class="summary-stat cuti">${data.cuti} Cuti</span>`;
        html += '</span></div>';
      });

      html += '</div>';
      return html;
    },

    _escHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  };

  /* ============================================
     App Controller
     ============================================ */
  const App = {
    init() {
      StaffManager.init();
      AuthManager.init();
      CloudSync.init();
      this._setupClock();
      this._setupNavigation();
      this._setupScheduleControls();
      this._setupStaffControls();
      this._setupAttendanceControls();
      this._setupModals();
      this._setupTableHighlight();
      this.refreshAll();
    },

    refreshAll() {
      ScheduleRenderer.render();
      StaffRenderer.render();
      CalendarRenderer.render();
    },

    refreshSchedule() {
      ScheduleRenderer.render();
    },

    refreshStaff() {
      StaffRenderer.render();
    },

    refreshCalendar() {
      CalendarRenderer.render();
    },

    /* ---- Clock ---- */
    _setupClock() {
      const clockEl = document.getElementById('clock');
      const tick = () => {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        clockEl.textContent = `${h}:${m}:${s}`;
      };
      tick();
      setInterval(tick, 1000);
    },

    /* ---- Navigation ---- */
    _setupNavigation() {
      const tabs = document.querySelectorAll('.nav-tab');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const target = tab.dataset.tab;
          State.currentTab = target;

          // Update tab buttons
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');

          // Update content
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          const tabContent = document.getElementById('tab' + target.charAt(0).toUpperCase() + target.slice(1));
          if (tabContent) {
            tabContent.classList.add('active');
          }

          // Refresh specific tab
          if (target === 'schedule') this.refreshSchedule();
          if (target === 'staff') this.refreshStaff();
          if (target === 'attendance') this.refreshCalendar();
        });
      });
    },

    /* ---- Schedule Controls ---- */
    _setupScheduleControls() {
      const dateInput = document.getElementById('scheduleDate');
      const prevBtn = document.getElementById('prevDay');
      const nextBtn = document.getElementById('nextDay');
      const todayBtn = document.getElementById('todayBtn');
      const printBtn = document.getElementById('printBtn');

      dateInput.value = toDateString(State.scheduleDate);

      dateInput.addEventListener('change', () => {
        State.scheduleDate = new Date(dateInput.value + 'T00:00:00');
        this.refreshSchedule();
      });

      prevBtn.addEventListener('click', () => {
        State.scheduleDate.setDate(State.scheduleDate.getDate() - 1);
        this.refreshSchedule();
      });

      nextBtn.addEventListener('click', () => {
        State.scheduleDate.setDate(State.scheduleDate.getDate() + 1);
        this.refreshSchedule();
      });

      todayBtn.addEventListener('click', () => {
        State.scheduleDate = new Date();
        this.refreshSchedule();
      });

      printBtn.addEventListener('click', () => {
        window.print();
      });

      const wrapper = document.getElementById('scheduleTableWrapper');
      if (wrapper) {
        const handleTimeInput = (input) => {
          const staffId = input.dataset.staffId;
          const roundNumber = parseInt(input.dataset.round, 10);
          const type = input.dataset.type;
          const val = input.value.trim();

          if (type === 'keluar') {
            BreakOverrideManager.setKeluar(State.scheduleDate, staffId, roundNumber, val);
          } else if (type === 'masuk') {
            BreakOverrideManager.setMasuk(State.scheduleDate, staffId, roundNumber, val);
          }

          this.refreshSchedule();
          showToast(`Jam ${type} berhasil disesuaikan! ⏰`, 'success');
        };

        wrapper.addEventListener('change', (e) => {
          const select = e.target.closest('.duration-select');
          if (select) {
            const staffId = select.dataset.staffId;
            const roundNumber = parseInt(select.dataset.round, 10);
            const durationSeconds = parseInt(select.value, 10);

            BreakChoiceManager.setChoice(State.scheduleDate, staffId, roundNumber, durationSeconds);
            this.refreshSchedule();
            showToast('Pilihan durasi break berhasil diperbarui! ⏱️', 'success');
            return;
          }

          const input = e.target.closest('.time-input');
          if (input) {
            handleTimeInput(input);
          }
        });

        // Auto select text on click/focus so Ctrl+V paste replaces whole value immediately
        wrapper.addEventListener('focusin', (e) => {
          const input = e.target.closest('.time-input');
          if (input) input.select();
        });

        // Pressing Enter updates and blurs
        wrapper.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            const input = e.target.closest('.time-input');
            if (input) {
              e.preventDefault();
              input.blur();
            }
          }
        });

        // Instant paste handling
        wrapper.addEventListener('paste', (e) => {
          const input = e.target.closest('.time-input');
          if (input) {
            setTimeout(() => {
              handleTimeInput(input);
            }, 50);
          }
        });
      }
    },

    /* ---- Staff Controls ---- */
    _setupStaffControls() {
      const form = document.getElementById('addStaffForm');
      const nameInput = document.getElementById('staffName');
      const list = document.getElementById('staffList');

      // Add staff form
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = nameInput.value.trim();
        if (!name) return;

        AuthManager.requireAuth(() => {
          const staff = StaffManager.add(name);
          if (staff) {
            nameInput.value = '';
            nameInput.focus();
            showToast(`Staff "${staff.name}" berhasil ditambahkan!`);
            this.refreshStaff();
            this.refreshSchedule();
            this.refreshCalendar();
          }
        });
      });

      // Staff list actions (event delegation)
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const id = btn.dataset.id;

        AuthManager.requireAuth(() => {
          switch (action) {
            case 'up':
              StaffManager.moveUp(id);
              this.refreshStaff();
              this.refreshSchedule();
              break;
            case 'down':
              StaffManager.moveDown(id);
              this.refreshStaff();
              this.refreshSchedule();
              break;
            case 'edit':
              this._openEditModal(id);
              break;
            case 'delete':
              this._openDeleteModal(id);
              break;
          }
        });
      });
    },

    /* ---- Attendance Controls ---- */
    _setupAttendanceControls() {
      const prevBtn = document.getElementById('prevMonth');
      const nextBtn = document.getElementById('nextMonth');
      const wrapper = document.getElementById('attendanceTableWrapper');

      prevBtn.addEventListener('click', () => {
        State.calMonth--;
        if (State.calMonth < 0) {
          State.calMonth = 11;
          State.calYear--;
        }
        this.refreshCalendar();
      });

      nextBtn.addEventListener('click', () => {
        State.calMonth++;
        if (State.calMonth > 11) {
          State.calMonth = 0;
          State.calYear++;
        }
        this.refreshCalendar();
      });

      // Attendance cell click (event delegation)
      wrapper.addEventListener('click', (e) => {
        const cell = e.target.closest('.attendance-cell');
        if (!cell) return;

        const staffId = cell.dataset.staffId;
        const day = parseInt(cell.dataset.day, 10);
        const date = new Date(State.calYear, State.calMonth, day);

        AuthManager.requireAuth(() => {
          const newStatus = AttendanceManager.toggleStatus(staffId, date);

          // Update cell immediately
          cell.className = `attendance-cell ${newStatus}${cell.classList.contains('weekend-col') ? ' weekend-col' : ''}`;
          cell.textContent = STATUS_ICONS[newStatus];

          const staff = StaffManager.getById(staffId);
          cell.title = `${staff ? staff.name : ''} — ${day} ${MONTHS_ID[State.calMonth]}: ${STATUS_LABELS[newStatus]}`;

          // Refresh summary
          document.getElementById('attendanceSummary').innerHTML =
            CalendarRenderer._buildSummary(State.calYear, State.calMonth);

          // If this affects today's schedule, refresh it
          if (date.toDateString() === State.scheduleDate.toDateString()) {
            this.refreshSchedule();
          }
        });
      });
    },

    /* ---- Modals ---- */
    _setupModals() {
      // Edit Modal
      const editModal = document.getElementById('editModal');
      const editInput = document.getElementById('editStaffName');
      const saveEdit = document.getElementById('saveEdit');
      const cancelEdit = document.getElementById('cancelEdit');
      const closeEdit = document.getElementById('closeEditModal');

      const closeEditModal = () => {
        editModal.classList.remove('show');
        State.editingStaffId = null;
      };

      cancelEdit.addEventListener('click', closeEditModal);
      closeEdit.addEventListener('click', closeEditModal);
      editModal.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModal();
      });

      saveEdit.addEventListener('click', () => {
        if (State.editingStaffId && editInput.value.trim()) {
          AuthManager.requireAuth(() => {
            const success = StaffManager.update(State.editingStaffId, editInput.value);
            if (success) {
              showToast('Staff berhasil diperbarui!');
              closeEditModal();
              this.refreshAll();
            }
          });
        }
      });

      editInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveEdit.click();
        }
      });

      // Delete Modal
      const deleteModal = document.getElementById('deleteModal');
      const confirmDelete = document.getElementById('confirmDelete');
      const cancelDelete = document.getElementById('cancelDelete');
      const closeDelete = document.getElementById('closeDeleteModal');

      const closeDeleteModal = () => {
        deleteModal.classList.remove('show');
        State.deletingStaffId = null;
      };

      cancelDelete.addEventListener('click', closeDeleteModal);
      closeDelete.addEventListener('click', closeDeleteModal);
      deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) closeDeleteModal();
      });

      confirmDelete.addEventListener('click', () => {
        if (State.deletingStaffId) {
          AuthManager.requireAuth(() => {
            const staff = StaffManager.getById(State.deletingStaffId);
            const name = staff ? staff.name : '';
            StaffManager.remove(State.deletingStaffId);
            showToast(`Staff "${name}" berhasil dihapus!`);
            closeDeleteModal();
            this.refreshAll();
          });
        }
      });
    },

    _setupTableHighlight() {
      const clearHighlights = (table) => {
        table.querySelectorAll('.row-highlight, .col-highlight').forEach(el => {
          el.classList.remove('row-highlight', 'col-highlight');
        });
      };

      const handleMouseOver = (e) => {
        const cell = e.target.closest('td, th');
        if (!cell) return;
        const table = cell.closest('.schedule-table, .attendance-table');
        if (!table) return;

        if (cell.classList.contains('break-header-cell') || cell.getAttribute('colspan')) return;

        clearHighlights(table);

        const row = cell.parentElement;
        const cellIndex = cell.cellIndex;

        Array.from(row.children).forEach(c => c.classList.add('row-highlight'));

        if (cellIndex !== undefined && cellIndex >= 0) {
          const rows = table.querySelectorAll('tr');
          rows.forEach(r => {
            const targetCell = r.children[cellIndex];
            if (targetCell && !targetCell.getAttribute('colspan')) {
              targetCell.classList.add('col-highlight');
            }
          });
        }
      };

      const handleMouseOut = (e) => {
        const table = e.target.closest('.schedule-table, .attendance-table');
        if (table) {
          clearHighlights(table);
        }
      };

      const main = document.querySelector('.main');
      if (main) {
        main.addEventListener('mouseover', handleMouseOver);
        main.addEventListener('mouseout', (e) => {
          if (!e.relatedTarget || !main.contains(e.relatedTarget)) {
            document.querySelectorAll('.row-highlight, .col-highlight').forEach(el => {
              el.classList.remove('row-highlight', 'col-highlight');
            });
          }
        });
      }
    },

    _openEditModal(staffId) {
      const staff = StaffManager.getById(staffId);
      if (!staff) return;
      State.editingStaffId = staffId;
      document.getElementById('editStaffName').value = staff.name;
      document.getElementById('editModal').classList.add('show');
      setTimeout(() => document.getElementById('editStaffName').focus(), 100);
    },

    _openDeleteModal(staffId) {
      const staff = StaffManager.getById(staffId);
      if (!staff) return;
      State.deletingStaffId = staffId;
      document.getElementById('deleteStaffName').textContent = staff.name;
      document.getElementById('deleteModal').classList.add('show');
    }
  };

  /* ============================================
     Initialize on DOM Ready
     ============================================ */
  document.addEventListener('DOMContentLoaded', () => App.init());

})();
