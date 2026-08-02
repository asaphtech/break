(() => {
  'use strict';

  /* ============================================
     Constants
     ============================================ */
  const TOTAL_SECONDS = 38400;        // 08:20:00 → 19:00:00
  const START_SECONDS = 30000;        // 08:20:00 as seconds from midnight
  const MAX_BREAK_DURATION = 1260;    // 21 minutes in seconds (20 min break + 1 min tolerance)
  const LC_OFFSET = 180;             // 3 minutes before break
  const MAX_BREAK_COUNT = 4;

  const MONTHS_ID = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const DAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  const STATUS_CYCLE = ['masuk', 'libur', 'cuti'];
  const STATUS_ICONS = { masuk: '', libur: '🏖️', cuti: '📋' };
  const STATUS_LABELS = { masuk: 'Masuk', libur: 'Libur', cuti: 'Cuti' };

  const DEFAULT_STAFF = [
    { id: 'def_01', name: 'PAT', order: 1, shift: 'malam' },
    { id: 'def_02', name: 'KKY', order: 2, shift: 'pagi' },
    { id: 'def_03', name: 'SUN', order: 3, shift: 'malam' },
    { id: 'def_04', name: 'JOY', order: 4, shift: 'pagi' },
    { id: 'def_05', name: 'DON', order: 5, shift: 'pagi' },
    { id: 'def_06', name: 'STV', order: 6, shift: 'pagi' },
    { id: 'def_07', name: 'LID', order: 7, shift: 'malam' },
    { id: 'def_08', name: 'WIL', order: 8, shift: 'malam' },
    { id: 'def_09', name: 'JUL', order: 9, shift: 'pagi' },
    { id: 'def_10', name: 'JOHN', order: 10, shift: 'pagi' },
    { id: 'def_11', name: 'WEN', order: 11, shift: 'malam' }
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
      clean = `${clean.substring(0, 2)}:${clean.substring(2, 4)}:${clean.substring(4, 6)}`;
    } else if (/^\d{4}$/.test(clean)) {
      clean = `${clean.substring(0, 2)}:${clean.substring(2, 4)}:00`;
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

  function formatDuration(seconds, includeHours = false) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.round(seconds % 60);

    if (includeHours) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function formatHoursMinutes(seconds) {
    const abs = Math.abs(seconds);
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    if (h > 0 && m > 0) return `${h} Jam ${m} Menit`;
    if (h > 0) return `${h} Jam`;
    return `${m} Menit`;
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
    getStaff() { return this.get('break_scheduler_staff', null); },
    setStaff(data) { this.set('break_scheduler_staff', data); },
    getAttendance(y, m) { return this.get(`break_att_${y}_${String(m + 1).padStart(2, '0')}`, {}); },
    setAttendance(y, m, data) { this.set(`break_att_${y}_${String(m + 1).padStart(2, '0')}`, data); },
  };

  /* ============================================
     Cloud Sync Service (Multi-PC Live Sync)
     ============================================ */
  const CloudSync = {
    _endpoint: 'https://jsonblob.com/api/jsonBlob/019f8d12-4db8-7c04-82f6-a25d87efdf88',
    _syncing: false,
    _initialPullCompleted: false,
    _cloudPassword: null,
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
      this._syncing = true;

      const supa = this.getSupabaseConfig();
      const isSupa = supa.isConfigured;

      if (!isSupa && window.location.protocol === 'file:') {
        this.updateBadge('offline', 'Lokal (file://)');
        this._syncing = false;
        this._initialPullCompleted = true;
        return;
      }

      try {
        let rows = [];

        if (isSupa) {
          const res = await fetch(`${supa.url}/rest/v1/break_scheduler_data?select=*`, {
            headers: {
              'apikey': supa.key,
              'Authorization': `Bearer ${supa.key}`,
              'Accept': 'application/json'
            }
          });
          if (!res.ok) throw new Error('Supabase pull failed');
          rows = await res.json();
        } else {
          const res = await fetch(this.getEndpoint(), {
            headers: { 'Accept': 'application/json' }
          });
          if (!res.ok) throw new Error('Cloud pull failed');
          const data = await res.json();
          if (data) rows = [{ key: 'main_state', value: data }];
        }

        if (Array.isArray(rows) && rows.length > 0) {
          const dataMap = {};
          rows.forEach(r => {
            if (r.key === 'main_state' && r.value) {
              Object.assign(dataMap, r.value);
            } else if (r.key && r.value !== undefined) {
              dataMap[r.key] = r.value;
            }
          });

          if (dataMap.settings && dataMap.settings.password) {
            dataMap.password = dataMap.settings.password;
          }

          if (Array.isArray(dataMap.staff)) {
            if (dataMap.password) {
              this._cloudPassword = dataMap.password;
            }

            const localUpdatedAt = Storage.get('break_scheduler_updated_at', '');
            const cloudUpdatedAt = (dataMap.settings && dataMap.settings.updatedAt) || dataMap.updatedAt || '';

            // If local modification timestamp is newer than cloud data timestamp, skip cloud overwrite!
            if (!isInitial && localUpdatedAt && cloudUpdatedAt && new Date(localUpdatedAt) > new Date(cloudUpdatedAt)) {
              this.updateBadge('online', isSupa ? 'Supabase Live' : 'Cloud Live');
              return;
            }

            const hash = JSON.stringify(dataMap.staff) + JSON.stringify(dataMap.attendance || {}) + JSON.stringify(dataMap.breakChoices || {}) + JSON.stringify(dataMap.breakOverrides || {}) + JSON.stringify(dataMap.breakStatuses || {}) + JSON.stringify(dataMap.password || '');
            if (hash !== this._lastHash) {
              this._lastHash = hash;
              this._mergeState(dataMap);
              StaffManager.init();
              if (!isInitial) {
                const activeTag = document.activeElement ? document.activeElement.tagName : '';
                if (activeTag !== 'INPUT' && activeTag !== 'SELECT') {
                  App.refreshAll();
                }
              }
            }
            this.updateBadge('online', isSupa ? 'Supabase Live' : 'Cloud Live');
          }
        }
      } catch (err) {
        console.warn('CloudSync pull error:', err);
        this.updateBadge('offline', 'Local Mode');
      } finally {
        this._syncing = false;
        this._initialPullCompleted = true;
      }
    },

    _mergeState(data) {
      if (!data) return;
      if (Array.isArray(data.staff)) {
        Storage.setStaff(data.staff);
        if (typeof StaffManager !== 'undefined') {
          StaffManager._staff = data.staff;
        }
      }
      if (data.attendance) Storage.set('break_scheduler_attendance', data.attendance);
      if (data.password) Storage.set('break_scheduler_admin_pass', data.password);
      if (data.breakChoices) {
        Object.keys(data.breakChoices).forEach(key => Storage.set(key, data.breakChoices[key]));
      }
      if (data.breakOverrides) {
        Object.keys(data.breakOverrides).forEach(key => Storage.set(key, data.breakOverrides[key]));
      }
      if (data.breakStatuses) {
        Object.keys(data.breakStatuses).forEach(key => Storage.set(key, data.breakStatuses[key]));
      }
    },

    _pushDebounceTimer: null,
    debouncePushData(delayMs = 1200) {
      if (this._pushDebounceTimer) clearTimeout(this._pushDebounceTimer);
      this._pushDebounceTimer = setTimeout(() => {
        this.pushData(false, true);
      }, delayMs);
    },

    async pushData(force = false, silent = false) {
      if (!this._initialPullCompleted && !force) {
        console.log('Skipping pushData: initial pull from Cloud is not complete yet.');
        return;
      }

      const nowIso = new Date().toISOString();
      Storage.set('break_scheduler_updated_at', nowIso);

      const supa = this.getSupabaseConfig();
      const isSupa = supa.isConfigured;

      if (!isSupa && window.location.protocol === 'file:') {
        this.updateBadge('offline', 'Lokal (file://)');
        if (!silent) showToast('Data tersimpan secara lokal!', 'success');
        return;
      }

      try {
        this.updateBadge('syncing', 'Menyimpan...');

        const staff = StaffManager.getAll();
        let password = AuthManager.getPassword();

        if (password === '1234' && !Storage.get('break_scheduler_pass_custom', false) && this._cloudPassword) {
          password = this._cloudPassword;
        }

        const attendance = {};
        const breakChoices = {};
        const breakOverrides = {};
        const breakStatuses = {};
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
          if (key && key.startsWith('break_status_')) {
            breakStatuses[key] = Storage.get(key, {});
          }
        }

        const payload = {
          updatedAt: nowIso,
          staff,
          attendance,
          breakChoices,
          breakOverrides,
          breakStatuses,
          password
        };

        this._lastHash = JSON.stringify(staff) + JSON.stringify(attendance) + JSON.stringify(breakChoices) + JSON.stringify(breakOverrides) + JSON.stringify(breakStatuses) + JSON.stringify(password || '');

        let res;
        if (isSupa) {
          const supaRows = [
            { key: 'staff', value: staff, updated_at: nowIso },
            { key: 'settings', value: { password, updatedAt: nowIso }, updated_at: nowIso },
            { key: 'attendance', value: attendance, updated_at: nowIso },
            { key: 'breakChoices', value: breakChoices, updated_at: nowIso },
            { key: 'breakOverrides', value: breakOverrides, updated_at: nowIso },
            { key: 'breakStatuses', value: breakStatuses, updated_at: nowIso }
          ];

          res = await fetch(`${supa.url}/rest/v1/break_scheduler_data`, {
            method: 'POST',
            headers: {
              'apikey': supa.key,
              'Authorization': `Bearer ${supa.key}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(supaRows)
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
          if (!silent) showToast(isSupa ? 'Data tersimpan ke Supabase!' : 'Data tersinkronisasi ke Cloud!', 'success');
        } else {
          throw new Error('Push failed');
        }
      } catch (err) {
        console.warn('CloudSync push error:', err);
        this.updateBadge('offline', 'Gagal Sync');
        if (!silent) showToast('Gagal terhubung ke Cloud (Tersimpan di lokal)', 'info');
      }
    },

    startAutoPoll() {
      if (this._pollTimer) clearInterval(this._pollTimer);
      this._pollTimer = setInterval(() => {
        this.pullData(false);
      }, 5000);
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
      Storage.set('break_scheduler_pass_custom', true);
      Storage.set('break_scheduler_updated_at', new Date().toISOString());
      if (typeof CloudSync !== 'undefined' && CloudSync.pushData) {
        CloudSync.pushData(true);
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
      if (Array.isArray(saved)) {
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
      if (typeof CloudSync !== 'undefined' && CloudSync.pushData) {
        CloudSync.pushData(true, true);
      }
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

    sortAlphabetical(asc = true) {
      this._staff.sort((a, b) => {
        const nameA = a.name.toUpperCase();
        const nameB = b.name.toUpperCase();
        if (nameA < nameB) return asc ? -1 : 1;
        if (nameA > nameB) return asc ? 1 : -1;
        return 0;
      });
      this._staff.forEach((s, idx) => { s.order = idx + 1; });
      this._save();
    },

    resetOrderToDefault() {
      const defaultMap = new Map(DEFAULT_STAFF.map((s, idx) => [s.name, idx + 1]));
      this._staff.sort((a, b) => {
        const orderA = defaultMap.has(a.name) ? defaultMap.get(a.name) : 999;
        const orderB = defaultMap.has(b.name) ? defaultMap.get(b.name) : 999;
        return orderA - orderB;
      });
      this._staff.forEach((s, idx) => { s.order = idx + 1; });
      this._save();
    },

    reorderByIds(idArray) {
      const map = new Map(idArray.map((id, index) => [id, index + 1]));
      this._staff.forEach(s => {
        if (map.has(s.id)) s.order = map.get(s.id);
      });
      this._save();
    },

    setShift(id, shift) {
      const staff = this.getById(id);
      if (staff) {
        staff.shift = shift;
        this._save();
      }
      return staff ? staff.shift : 'pagi';
    },

    toggleShift(id) {
      const staff = this.getById(id);
      if (staff) {
        staff.shift = staff.shift === 'malam' ? 'pagi' : 'malam';
        this._save();
      }
      return staff ? staff.shift : 'pagi';
    },

    applyNightPreset(nightNames = ['PAT', 'WIL', 'SUN', 'LID', 'WEN']) {
      const setNames = new Set(nightNames.map(n => n.toUpperCase()));
      this._staff.forEach(s => {
        s.shift = setNames.has(s.name.toUpperCase()) ? 'malam' : 'pagi';
      });
      this._save();
    },

    _save() {
      Storage.setStaff(this._staff);
      if (typeof CloudSync !== 'undefined' && CloudSync.debouncePushData) {
        CloudSync.debouncePushData();
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
      App.refreshAll();
      if (typeof CloudSync !== 'undefined' && CloudSync.pushData) {
        CloudSync.pushData(true);
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
      if (typeof CloudSync !== 'undefined' && CloudSync.debouncePushData) {
        CloudSync.debouncePushData();
      }
    },

    getStaffChoice(date, staffId, roundNumber, defaultDuration) {
      const choices = this.getChoices(date);
      if (choices[staffId] && choices[staffId][`round_${roundNumber}`]) {
        return choices[staffId][`round_${roundNumber}`];
      }
      return defaultDuration;
    },

    resetRound(date, roundNumber) {
      const dateStr = toDateString(date);
      const choices = this.getChoices(date);
      let changed = false;
      Object.keys(choices).forEach(staffId => {
        if (choices[staffId] && choices[staffId][`round_${roundNumber}`]) {
          delete choices[staffId][`round_${roundNumber}`];
          changed = true;
        }
      });
      if (changed) {
        Storage.set(`break_choice_${dateStr}`, choices);
        if (typeof CloudSync !== 'undefined' && CloudSync.debouncePushData) {
          CloudSync.debouncePushData();
        }
      }
    },

    resetAll(date) {
      const dateStr = toDateString(date);
      Storage.remove(`break_choice_${dateStr}`);
      if (typeof CloudSync !== 'undefined' && CloudSync.debouncePushData) {
        CloudSync.debouncePushData();
      }
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
      if (typeof CloudSync !== 'undefined' && CloudSync.debouncePushData) {
        CloudSync.debouncePushData();
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
      if (typeof CloudSync !== 'undefined' && CloudSync.debouncePushData) {
        CloudSync.debouncePushData();
      }
    },

    getStaffOverride(date, staffId, roundNumber) {
      const overrides = this.getOverrides(date);
      if (overrides[staffId] && overrides[staffId][`round_${roundNumber}`]) {
        return overrides[staffId][`round_${roundNumber}`];
      }
      return {};
    },

    resetRound(date, roundNumber) {
      const dateStr = toDateString(date);
      const overrides = this.getOverrides(date);
      let changed = false;
      Object.keys(overrides).forEach(staffId => {
        if (overrides[staffId] && overrides[staffId][`round_${roundNumber}`]) {
          delete overrides[staffId][`round_${roundNumber}`];
          changed = true;
        }
      });
      if (changed) {
        Storage.set(`break_override_${dateStr}`, overrides);
        if (typeof CloudSync !== 'undefined' && CloudSync.debouncePushData) {
          CloudSync.debouncePushData();
        }
      }
    },

    resetAll(date) {
      const dateStr = toDateString(date);
      Storage.remove(`break_override_${dateStr}`);
      if (typeof CloudSync !== 'undefined' && CloudSync.debouncePushData) {
        CloudSync.debouncePushData();
      }
    }
  };

  /* ============================================
     Break Status Manager (Done / Selesai Tracking)
     ============================================ */
  const BreakStatusManager = {
    getStatusMap(date) {
      const dateStr = toDateString(date);
      return Storage.get(`break_status_${dateStr}`, {});
    },

    isCompleted(date, staffId, roundNumber) {
      const map = this.getStatusMap(date);
      return Boolean(map[staffId] && map[staffId][`round_${roundNumber}`]);
    },

    toggleStatus(date, staffId, roundNumber) {
      const dateStr = toDateString(date);
      const map = this.getStatusMap(date);
      if (!map[staffId]) map[staffId] = {};

      const current = Boolean(map[staffId][`round_${roundNumber}`]);
      if (current) {
        delete map[staffId][`round_${roundNumber}`];
      } else {
        map[staffId][`round_${roundNumber}`] = true;
      }

      Storage.set(`break_status_${dateStr}`, map);
      if (typeof CloudSync !== 'undefined' && CloudSync.pushData) {
        CloudSync.pushData();
      }
      return !current;
    },

    resetRound(date, roundNumber) {
      const dateStr = toDateString(date);
      const map = this.getStatusMap(date);
      let changed = false;
      Object.keys(map).forEach(staffId => {
        if (map[staffId] && map[staffId][`round_${roundNumber}`]) {
          delete map[staffId][`round_${roundNumber}`];
          changed = true;
        }
      });
      if (changed) {
        Storage.set(`break_status_${dateStr}`, map);
        if (typeof CloudSync !== 'undefined' && CloudSync.pushData) {
          CloudSync.pushData();
        }
      }
    },

    resetAll(date) {
      const dateStr = toDateString(date);
      Storage.remove(`break_status_${dateStr}`);
      if (typeof CloudSync !== 'undefined' && CloudSync.pushData) {
        CloudSync.pushData();
      }
    }
  };

  /* ============================================
     Smart Timing Manager
     ============================================ */
  const SmartTimingManager = {
    getConfig(shift = 'pagi') {
      const saved = Storage.get(`break_smart_timing_${shift}`, null);
      if (saved && typeof saved === 'object') return saved;
      return null;
    },

    setConfig(shift = 'pagi', config) {
      Storage.set(`break_smart_timing_${shift}`, config);
      if (typeof CloudSync !== 'undefined' && CloudSync.debouncePushData) {
        CloudSync.debouncePushData();
      }
    },

    resetConfig(shift = 'pagi') {
      Storage.remove(`break_smart_timing_${shift}`);
      if (typeof CloudSync !== 'undefined' && CloudSync.debouncePushData) {
        CloudSync.debouncePushData();
      }
    }
  };

  /* ============================================
     Smart Calculator Engine (Active Staff, Break Duration & Interval)
     ============================================ */
  const SmartCalculatorEngine = {
    calculateSystem(options = {}) {
      const N = Math.max(1, parseInt(options.staffCount || 8, 10));
      const shiftStartSec = parseTimeToSeconds(options.startTimeStr || '08:00:00') ?? 28800;
      let shiftEndSec = parseTimeToSeconds(options.endTimeStr || '19:00:00') ?? 68400;

      if (shiftEndSec <= shiftStartSec) {
        shiftEndSec += 86400; // Overnight shift handle
      }

      const totalShiftSec = shiftEndSec - shiftStartSec;
      const roundsCount = parseInt(options.roundsCount || 4, 10);
      const distMode = options.distMode || 'auto';
      const staffGapSec = parseInt(options.staffGapSec || 0, 10) * 60;
      const rawGapBufferOption = options.gapBufferOption || 'auto';

      let roundDurationsSec = [];
      if (distMode === 'custom' && Array.isArray(options.customDurationsMin) && options.customDurationsMin.length === roundsCount) {
        roundDurationsSec = options.customDurationsMin.map(m => Math.max(60, Math.round((parseFloat(m) || 15) * 60)));
      } else if (distMode === 'equal') {
        const perPersonTotalSec = Math.floor(totalShiftSec / N);
        const eqSec = Math.min(1200, Math.floor(perPersonTotalSec / roundsCount));
        roundDurationsSec = Array(roundsCount).fill(eqSec);
      } else {
        // Priority 20 Minutes (1200s) Break Quota per CS
        const targetBreakSecPerRound = 1200; // 20 minutes
        const maxBreaksAllowedSec = Math.floor(totalShiftSec / (roundsCount * N));

        // Give full 20 minutes to all staff if shift window allows
        if (maxBreaksAllowedSec >= targetBreakSecPerRound) {
          roundDurationsSec = Array(roundsCount).fill(targetBreakSecPerRound);
        } else {
          const adjustedSec = Math.max(600, Math.floor(maxBreaksAllowedSec / 10) * 10);
          roundDurationsSec = Array(roundsCount).fill(adjustedSec);
        }
      }

      const totalBreakSecPerStaff = roundDurationsSec.reduce((a, b) => a + b, 0);
      const totalNetWorkSecPerStaff = totalShiftSec - totalBreakSecPerStaff;
      const totalDeptBreakSec = N * totalBreakSecPerStaff;

      // Calculate Total Time Needed For All Rounds
      let totalRoundsSec = 0;
      for (let r = 0; r < roundsCount; r++) {
        totalRoundsSec += N * roundDurationsSec[r] + (N - 1) * staffGapSec;
      }

      let gapBufferSec = 0;
      if (rawGapBufferOption === 'auto') {
        const remainingShiftSec = totalShiftSec - totalRoundsSec;
        if (remainingShiftSec > 0 && roundsCount > 1) {
          gapBufferSec = Math.floor(remainingShiftSec / (roundsCount - 1));
        } else {
          gapBufferSec = 0;
        }
      } else {
        gapBufferSec = parseInt(rawGapBufferOption || 0, 10) * 60;
      }

      // Calculate Round Rotations
      const roundDetails = [];
      let currentPointer = shiftStartSec;

      for (let r = 0; r < roundsCount; r++) {
        const durSec = roundDurationsSec[r];
        const roundTotalSec = N * durSec + (N - 1) * staffGapSec;
        const roundStartSec = currentPointer;
        const roundEndSec = roundStartSec + roundTotalSec;

        roundDetails.push({
          roundNumber: r + 1,
          durSec: durSec,
          durMin: Math.round(durSec / 60),
          roundStartSec: roundStartSec,
          roundEndSec: roundEndSec,
          roundTotalSec: roundTotalSec,
          staffGapSec: staffGapSec,
          staggerIntervalSec: durSec + staffGapSec
        });

        currentPointer = roundEndSec + gapBufferSec;
      }

      // Calculate Work Intervals ("Jarak Durasi Kerja")
      const staff1FirstBreakStart = roundDetails[0].roundStartSec;
      const staff1WorkBeforeB1 = staff1FirstBreakStart - shiftStartSec;
      const staffNFirstBreakStart = roundDetails[0].roundStartSec + (N - 1) * (roundDurationsSec[0] + staffGapSec);
      const staffNWorkBeforeB1 = staffNFirstBreakStart - shiftStartSec;
      const avgWorkBeforeB1 = (staff1WorkBeforeB1 + staffNWorkBeforeB1) / 2;

      const interRoundIntervals = [];
      for (let r = 0; r < roundsCount - 1; r++) {
        const r1 = roundDetails[r];
        const r2 = roundDetails[r + 1];

        const staff1Gap = r2.roundStartSec - (r1.roundStartSec + r1.durSec);
        const staffNGap = (r2.roundStartSec + (N - 1) * (r2.durSec + staffGapSec)) - (r1.roundStartSec + (N - 1) * (r1.durSec + staffGapSec) + r1.durSec);

        interRoundIntervals.push({
          fromRound: r + 1,
          toRound: r + 2,
          minIntervalSec: Math.min(staff1Gap, staffNGap),
          maxIntervalSec: Math.max(staff1Gap, staffNGap),
          avgIntervalSec: (staff1Gap + staffNGap) / 2,
          roundGapSec: r2.roundStartSec - r1.roundEndSec
        });
      }

      const lastRound = roundDetails[roundsCount - 1];
      const staff1WorkAfterLast = shiftEndSec - (lastRound.roundStartSec + lastRound.durSec);
      const staffNWorkAfterLast = shiftEndSec - (lastRound.roundStartSec + (N - 1) * (lastRound.durSec + staffGapSec) + lastRound.durSec);
      const avgWorkAfterLast = (staff1WorkAfterLast + staffNWorkAfterLast) / 2;

      const finalBreakEndSec = roundDetails[roundsCount - 1].roundEndSec;
      const isFinishExact = Math.abs(finalBreakEndSec - shiftEndSec) <= 60;

      return {
        staffCount: N,
        totalShiftSec,
        shiftStartSec,
        shiftEndSec,
        roundsCount,
        distMode,
        staffGapSec,
        gapBufferOption: rawGapBufferOption,
        gapBufferSec,
        roundDurationsSec,
        totalBreakSecPerStaff,
        totalNetWorkSecPerStaff,
        totalDeptBreakSec,
        roundDetails,
        finalBreakEndSec,
        isFinishExact,
        intervals: {
          staff1WorkBeforeB1,
          staffNWorkBeforeB1,
          avgWorkBeforeB1,
          interRoundIntervals,
          staff1WorkAfterLast,
          staffNWorkAfterLast,
          avgWorkAfterLast
        }
      };
    }
  };

  /* ============================================
     Smart Calculator UI Controller
     ============================================ */
  const SmartCalculatorUI = {
    _activeResult: null,

    init() {
      this._bindEvents();
    },

    openModal() {
      const modal = document.getElementById('smartCalcModal');
      if (!modal) return;

      const date = State.scheduleDate || new Date();
      const activeStaffToday = AttendanceManager.getActiveStaffForDate(date);
      const todayCount = activeStaffToday.length;

      const activeTodayBadge = document.getElementById('calcActiveTodayCount');
      if (activeTodayBadge) activeTodayBadge.textContent = todayCount;

      const staffInput = document.getElementById('calcStaffInput');
      if (staffInput && todayCount > 0) {
        staffInput.value = todayCount;
      }

      this._renderStaffNames(activeStaffToday);
      this.updateCalculation();

      modal.classList.add('show');
    },

    closeModal() {
      const modal = document.getElementById('smartCalcModal');
      if (modal) modal.classList.remove('show');
    },

    _renderStaffNames(staffList) {
      const box = document.getElementById('calcStaffNamesList');
      if (!box) return;
      if (!staffList || staffList.length === 0) {
        box.innerHTML = '<span style="font-size:0.7rem;color:var(--text-muted);">Belum ada staff aktif pada tanggal ini</span>';
        return;
      }
      box.innerHTML = staffList.map(s => `<span class="calc-staff-chip">${s.name}</span>`).join('');
    },

    updateCalculation() {
      const staffInput = document.getElementById('calcStaffInput');
      const staffCount = parseInt(staffInput ? staffInput.value : 6, 10) || 6;

      const startTimeStr = document.getElementById('calcStartTime')?.value || '08:00';
      const endTimeStr = document.getElementById('calcEndTime')?.value || '19:00';

      const roundsCount = parseInt(document.getElementById('calcRoundsCount')?.value || 4, 10);
      const distMode = document.getElementById('calcDistMode')?.value || 'auto';
      const staffGapSec = parseInt(document.getElementById('calcStaffGap')?.value || 0, 10);
      const gapBufferOption = document.getElementById('calcGapBuffer')?.value || 'auto';

      const customBox = document.getElementById('customDurationsBox');
      if (customBox) {
        customBox.style.display = (distMode === 'custom') ? 'block' : 'none';
      }

      const customDurationsMin = [
        parseFloat(document.getElementById('customDurR1')?.value) || 20,
        parseFloat(document.getElementById('customDurR2')?.value) || 18,
        parseFloat(document.getElementById('customDurR3')?.value) || 17,
        parseFloat(document.getElementById('customDurR4')?.value) || 15
      ];

      const res = SmartCalculatorEngine.calculateSystem({
        staffCount,
        startTimeStr,
        endTimeStr,
        roundsCount,
        distMode,
        staffGapSec,
        gapBufferOption,
        customDurationsMin
      });

      this._activeResult = res;

      const shiftInfoEl = document.getElementById('calcShiftTotalTimeInfo');
      if (shiftInfoEl) {
        shiftInfoEl.innerHTML = `Total Waktu Shift: <strong>${formatHoursMinutes(res.totalShiftSec)}</strong> (${res.totalShiftSec.toLocaleString()} Detik)`;
      }

      const resultsBox = document.getElementById('smartCalcResultsBox');
      if (resultsBox) {
        resultsBox.innerHTML = this._buildResultsHTML(res);
      }
    },

    _buildResultsHTML(res) {
      const totalBreakMin = Math.round(res.totalBreakSecPerStaff / 60);
      const productivityPct = ((res.totalNetWorkSecPerStaff / res.totalShiftSec) * 100).toFixed(1);
      const finalEndTimeStr = formatTime(res.finalBreakEndSec % 86400).substring(0, 5);

      let html = '';

      // 1. Metric Stat Cards
      html += '<div class="calc-stats-grid">';
      html += `  <div class="calc-stat-card">
                   <span class="stat-label">👥 Staff Aktif</span>
                   <span class="stat-value">${res.staffCount} Staff</span>
                   <span class="stat-subtext">Jumlah CS bertugas pada shift ini</span>
                 </div>`;
      html += `  <div class="calc-stat-card stat-cyan">
                   <span class="stat-label">⏱️ Total Break / Staff</span>
                   <span class="stat-value">${totalBreakMin} Menit</span>
                   <span class="stat-subtext">${res.roundsCount} Ronde sesi istirahat</span>
                 </div>`;
      html += `  <div class="calc-stat-card stat-purple">
                   <span class="stat-label">💼 Jam Kerja Efektif</span>
                   <span class="stat-value">${formatHoursMinutes(res.totalNetWorkSecPerStaff)}</span>
                   <span class="stat-subtext">${productivityPct}% waktu kerja aktif CS</span>
                 </div>`;
      html += `  <div class="calc-stat-card stat-amber">
                   <span class="stat-label">🎯 Akhir Sesi Break</span>
                   <span class="stat-value">${finalEndTimeStr} WIB</span>
                   <span class="stat-subtext">${res.isFinishExact ? '✅ Selesai Pas Tepat Shift' : 'Jeda Blok: ' + formatHoursMinutes(res.gapBufferSec)}</span>
                 </div>`;
      html += '</div>';

      // 2. Details Grid (Durasi per Ronde & Jarak Durasi Kerja)
      html += '<div class="calc-details-grid">';

      // Panel 1: Rincian Durasi Break Per Ronde
      html += '  <div class="calc-card-panel">';
      html += '    <div class="panel-header">🎯 Rincian Durasi Break Per Ronde</div>';
      html += '    <table class="calc-table"><thead><tr>';
      html += '      <th>RONDE</th><th>DURASI / CS</th><th>TOTAL SESI</th><th>JAM SESI</th>';
      html += '    </tr></thead><tbody>';

      res.roundDetails.forEach(rd => {
        const startT = formatTime(rd.roundStartSec);
        const endT = formatTime(rd.roundEndSec % 86400);
        html += `<tr>`;
        html += `  <td><span class="round-badge-tag">Ronde ${rd.roundNumber}</span></td>`;
        html += `  <td><strong>${rd.durMin} Mins</strong></td>`;
        html += `  <td>${formatHoursMinutes(rd.roundTotalSec)}</td>`;
        html += `  <td><span class="time-mono">${startT.substring(0, 5)} - ${endT.substring(0, 5)}</span></td>`;
        html += `</tr>`;
      });

      html += '    </tbody></table>';
      html += '  </div>';

      // Panel 2: Rincian Jarak Durasi (Work Intervals & Spacing)
      html += '  <div class="calc-card-panel">';
      html += '    <div class="panel-header">📏 Rincian Jarak Durasi Kerja & Estafet</div>';
      html += '    <div class="interval-cards-list">';

      const staffGapText = res.staffGapSec === 0
        ? '0 Menit (Langsung Sambung / Estafet)'
        : `${Math.round(res.staffGapSec / 60)} Menit Jeda Pergantian CS`;

      html += `      <div class="interval-card-item">
                       <div class="interval-info">
                         <span class="interval-name">🔄 Jarak Estafet CS (Menit Selesai ➔ CS Berikutnya)</span>
                         <span class="interval-desc">Jarak dari CS selesai break ke CS berikutnya berangkat</span>
                       </div>
                       <span class="interval-badge">${staffGapText}</span>
                     </div>`;

      html += `      <div class="interval-card-item">
                       <div class="interval-info">
                         <span class="interval-name">🚀 Awal Shift ➔ Break 1</span>
                         <span class="interval-desc">Waktu kerja sebelum ronde 1 dimulai</span>
                       </div>
                       <span class="interval-badge">${formatHoursMinutes(res.intervals.avgWorkBeforeB1)}</span>
                     </div>`;

      res.intervals.interRoundIntervals.forEach(iri => {
        html += `      <div class="interval-card-item">
                         <div class="interval-info">
                           <span class="interval-name">⏸️ Jarak Antar Blok (Break ${iri.fromRound} ➔ Break ${iri.toRound})</span>
                           <span class="interval-desc">Jeda jam kerja bebas antar Ronde ${iri.fromRound} ke Ronde ${iri.toRound}</span>
                         </div>
                         <span class="interval-badge" style="color:var(--cyan);">${formatHoursMinutes(iri.roundGapSec)}</span>
                       </div>`;
      });

      html += `      <div class="interval-card-item">
                       <div class="interval-info">
                         <span class="interval-name">🏁 Break ${res.roundsCount} ➔ Akhir Shift</span>
                         <span class="interval-desc">Sisa waktu kerja CS dari break terakhir sampai jam pulang</span>
                       </div>
                       <span class="interval-badge">${formatHoursMinutes(res.intervals.avgWorkAfterLast)}</span>
                     </div>`;

      html += '    </div>';
      html += '  </div>';

      html += '</div>';

      // 3. Visual Timeline Bar
      html += '<div class="visual-timeline-card">';
      html += '  <div class="timeline-title">📊 Visual Timeline Rotasi & Jarak Break</div>';
      html += '  <div class="timeline-track-wrapper">';
      html += '    <div class="timeline-bar-track">';

      const totalSec = res.totalShiftSec;

      const p1 = (res.intervals.avgWorkBeforeB1 / totalSec) * 100;
      if (p1 > 0) {
        html += `<div class="timeline-seg seg-work" style="width:${p1.toFixed(2)}%;" title="Sesi Kerja Awal: ${formatHoursMinutes(res.intervals.avgWorkBeforeB1)}">Kerja 1</div>`;
      }

      res.roundDetails.forEach((rd, idx) => {
        const pR = (rd.roundTotalSec / totalSec) * 100;
        const breakClass = `seg-break-${(idx % 4) + 1}`;
        html += `<div class="timeline-seg ${breakClass}" style="width:${pR.toFixed(2)}%;" title="Sesi Break Ronde ${rd.roundNumber}: ${formatTime(rd.roundStartSec).substring(0, 5)} - ${formatTime(rd.roundEndSec % 86400).substring(0, 5)} (${res.staffCount} CS × ${rd.durMin}m)">Break ${rd.roundNumber}</div>`;

        if (idx < res.intervals.interRoundIntervals.length) {
          const gapSec = res.intervals.interRoundIntervals[idx].roundGapSec;
          const pGap = (gapSec / totalSec) * 100;
          if (pGap > 0) {
            html += `<div class="timeline-seg seg-work" style="width:${pGap.toFixed(2)}%;" title="Jarak Kerja B${idx + 1} ➔ B${idx + 2}: ${formatHoursMinutes(gapSec)}">Jarak R${idx + 1}-R${idx + 2}</div>`;
          }
        }
      });

      const pEnd = (res.intervals.avgWorkAfterLast / totalSec) * 100;
      if (pEnd > 0) {
        html += `<div class="timeline-seg seg-work" style="width:${pEnd.toFixed(2)}%;" title="Sesi Kerja Akhir: ${formatHoursMinutes(res.intervals.avgWorkAfterLast)}">Kerja Akhir</div>`;
      }

      html += '    </div>';

      html += '    <div class="timeline-legend">';
      html += '      <div class="timeline-legend-item"><span class="legend-color-dot" style="background:#3b82f6;"></span> Sesi Jam Kerja / Jarak Antar Blok</div>';
      html += '      <div class="timeline-legend-item"><span class="legend-color-dot" style="background:#14b8a6;"></span> Sesi Break Ronde 1</div>';
      html += '      <div class="timeline-legend-item"><span class="legend-color-dot" style="background:#38bdf8;"></span> Sesi Break Ronde 2</div>';
      html += '      <div class="timeline-legend-item"><span class="legend-color-dot" style="background:#a78bfa;"></span> Sesi Break Ronde 3</div>';
      html += '      <div class="timeline-legend-item"><span class="legend-color-dot" style="background:#fbbf24;"></span> Sesi Break Ronde 4</div>';
      html += '    </div>';

      html += '  </div>';
      html += '</div>';

      return html;
    },

    _bindEvents() {
      const openBtn = document.getElementById('openSmartCalcBtn');
      const closeBtn = document.getElementById('closeSmartCalcModal');
      const cancelBtn = document.getElementById('cancelSmartCalc');
      const modal = document.getElementById('smartCalcModal');
      const applyBtn = document.getElementById('applySmartCalcBtn');
      const copyBtn = document.getElementById('copyCalcSummaryBtn');

      if (openBtn) openBtn.addEventListener('click', () => this.openModal());
      if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal());
      if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeModal());

      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) this.closeModal();
        });
      }

      const staffInput = document.getElementById('calcStaffInput');
      const minusBtn = document.getElementById('calcStaffMinus');
      const plusBtn = document.getElementById('calcStaffPlus');
      const syncBtn = document.getElementById('syncActiveStaffBtn');

      if (minusBtn && staffInput) {
        minusBtn.addEventListener('click', () => {
          let val = parseInt(staffInput.value, 10) || 1;
          if (val > 1) {
            staffInput.value = val - 1;
            this._updatePresetActivePill(val - 1);
            this.updateCalculation();
          }
        });
      }

      if (plusBtn && staffInput) {
        plusBtn.addEventListener('click', () => {
          let val = parseInt(staffInput.value, 10) || 1;
          if (val < 50) {
            staffInput.value = val + 1;
            this._updatePresetActivePill(val + 1);
            this.updateCalculation();
          }
        });
      }

      if (staffInput) {
        staffInput.addEventListener('input', () => {
          let val = parseInt(staffInput.value, 10) || 1;
          this._updatePresetActivePill(val);
          this.updateCalculation();
        });
      }

      if (syncBtn) {
        syncBtn.addEventListener('click', () => {
          const date = State.scheduleDate || new Date();
          const activeStaffToday = AttendanceManager.getActiveStaffForDate(date);
          if (activeStaffToday.length > 0 && staffInput) {
            staffInput.value = activeStaffToday.length;
            this._updatePresetActivePill(activeStaffToday.length);
            this._renderStaffNames(activeStaffToday);
            this.updateCalculation();
            showToast(`Menggunakan ${activeStaffToday.length} staff aktif hari ini!`);
          } else {
            showToast('Tidak ada staff aktif pada tanggal ini', 'info');
          }
        });
      }

      const pills = document.querySelectorAll('.preset-pills .pill-btn');
      pills.forEach(p => {
        p.addEventListener('click', () => {
          const sVal = parseInt(p.dataset.staff, 10);
          if (staffInput) staffInput.value = sVal;
          this._updatePresetActivePill(sVal);
          this.updateCalculation();
        });
      });

      const shiftPagi8PresetBtn = document.getElementById('shiftPagi8PresetBtn');
      const shiftPagi820PresetBtn = document.getElementById('shiftPagi820PresetBtn');
      const shiftMalamPresetBtn = document.getElementById('shiftMalamPresetBtn');
      const startTimeInput = document.getElementById('calcStartTime');
      const endTimeInput = document.getElementById('calcEndTime');

      const resetShiftBtns = () => {
        if (shiftPagi8PresetBtn) shiftPagi8PresetBtn.classList.remove('active');
        if (shiftPagi820PresetBtn) shiftPagi820PresetBtn.classList.remove('active');
        if (shiftMalamPresetBtn) shiftMalamPresetBtn.classList.remove('active');
      };

      if (shiftPagi8PresetBtn) {
        shiftPagi8PresetBtn.addEventListener('click', () => {
          resetShiftBtns();
          shiftPagi8PresetBtn.classList.add('active');
          if (startTimeInput) startTimeInput.value = '08:00';
          if (endTimeInput) endTimeInput.value = '19:00';
          this.updateCalculation();
        });
      }

      if (shiftPagi820PresetBtn) {
        shiftPagi820PresetBtn.addEventListener('click', () => {
          resetShiftBtns();
          shiftPagi820PresetBtn.classList.add('active');
          if (startTimeInput) startTimeInput.value = '08:20';
          if (endTimeInput) endTimeInput.value = '19:00';
          this.updateCalculation();
        });
      }

      if (shiftMalamPresetBtn) {
        shiftMalamPresetBtn.addEventListener('click', () => {
          resetShiftBtns();
          shiftMalamPresetBtn.classList.add('active');
          if (startTimeInput) startTimeInput.value = '19:00';
          if (endTimeInput) endTimeInput.value = '05:20';
          this.updateCalculation();
        });
      }

      ['calcStartTime', 'calcEndTime', 'calcRoundsCount', 'calcDistMode', 'calcStaffGap', 'calcGapBuffer', 'customDurR1', 'customDurR2', 'customDurR3', 'customDurR4'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('change', () => this.updateCalculation());
          el.addEventListener('input', () => this.updateCalculation());
        }
      });

      if (applyBtn) {
        applyBtn.addEventListener('click', () => {
          AuthManager.requireAuth(() => {
            this.applyToSchedule();
          });
        });
      }

      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          this.copySummary();
        });
      }
    },

    _updatePresetActivePill(val) {
      const pills = document.querySelectorAll('.preset-pills .pill-btn');
      pills.forEach(p => {
        const pVal = parseInt(p.dataset.staff, 10);
        if (pVal === val) {
          p.classList.add('active');
        } else {
          p.classList.remove('active');
        }
      });
    },

    applyToSchedule() {
      if (!this._activeResult) return;
      const res = this._activeResult;

      const currentShift = State.shiftFilter === 'malam' ? 'malam' : 'pagi';
      const durationsMin = res.roundDurationsSec.map(s => Math.round(s / 60));

      const config = {
        staffCount: res.staffCount,
        durations: durationsMin,
        startTimeSec: res.shiftStartSec,
        gaps: Array(res.roundsCount).fill(res.gapBufferSec / 60)
      };

      SmartTimingManager.setConfig(currentShift, config);

      this.closeModal();
      App.refreshSchedule();
      showToast(`⚡ Parametrisasi Kalkulator Pintar diterapkan ke ${res.staffCount} staff shift ${currentShift}!`, 'success');
    },

    copySummary() {
      if (!this._activeResult) return;
      const res = this._activeResult;

      let text = `🧠 RINGKASAN KALKULASI PINTAR BREAK STAFF\n`;
      text += `--------------------------------------------------\n`;
      text += `👥 Jumlah Staff Aktif : ${res.staffCount} CS\n`;
      text += `⏰ Jam Shift Kerja    : ${formatTime(res.shiftStartSec).substring(0, 5)} - ${formatTime(res.shiftEndSec % 86400).substring(0, 5)} (${formatHoursMinutes(res.totalShiftSec)})\n`;
      text += `🎯 Akhir Sesi Ronde 4 : ${formatTime(res.finalBreakEndSec % 86400).substring(0, 5)} WIB (${res.isFinishExact ? 'Pas Tepat Shift' : 'Buffer'})\n`;
      text += `⏱️ Total Break/Staff  : ${Math.round(res.totalBreakSecPerStaff / 60)} Menit (${res.roundsCount} Sesi Ronde)\n`;
      text += `💼 Kerja Efektif/Staff: ${formatHoursMinutes(res.totalNetWorkSecPerStaff)}\n\n`;

      text += `🎯 RINCIAN DURASI BREAK PER RONDE:\n`;
      res.roundDetails.forEach(rd => {
        text += `  • Ronde ${rd.roundNumber} : ${rd.durMin} Menit per CS (Sesi: ${formatTime(rd.roundStartSec).substring(0, 5)} - ${formatTime(rd.roundEndSec % 86400).substring(0, 5)})\n`;
      });

      text += `\n📏 RINCIAN JARAK DURASI KERJA & ESTAFET:\n`;
      text += `  • Jarak Estafet CS           : ${res.staffGapSec === 0 ? '0 Menit (Langsung Sambung)' : Math.round(res.staffGapSec / 60) + ' Menit'}\n`;
      text += `  • Jam Kerja ke Break 1       : ${formatHoursMinutes(res.intervals.avgWorkBeforeB1)}\n`;
      res.intervals.interRoundIntervals.forEach(iri => {
        text += `  • Jarak Antar Blok (R${iri.fromRound} ➔ R${iri.toRound}) : ${formatHoursMinutes(iri.roundGapSec)}\n`;
      });
      text += `  • Jam Kerja Akhir Shift      : ${formatHoursMinutes(res.intervals.avgWorkAfterLast)}\n`;

      navigator.clipboard.writeText(text).then(() => {
        showToast('📋 Ringkasan hasil kalkulasi berhasil disalin!');
      }).catch(() => {
        showToast('Gagal menyalin ringkasan', 'error');
      });
    }
  };


  /* ============================================
     Break Calculator Engine
     ============================================ */
  const BreakCalculator = {
    /**
     * Calculate default durations for each of the 4 break rounds based on staff count N.
     */
    calculateDurations(N) {
      if (N <= 0) return [MAX_BREAK_DURATION, MAX_BREAK_DURATION, MAX_BREAK_DURATION, MAX_BREAK_DURATION];

      // Total time per person allowed across 4 breaks
      const perPerson = Math.floor(TOTAL_SECONDS / N);

      // If enough time for all breaks at max duration
      if (perPerson >= MAX_BREAK_DURATION * MAX_BREAK_COUNT) {
        return Array(MAX_BREAK_COUNT).fill(MAX_BREAK_DURATION);
      }

      // Arithmetic Progression: B1=1200, B2=1200-d, B3=1200-2d, B4=1200-3d
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
      let filteredStaff = activeStaff;
      if (State.shiftFilter && State.shiftFilter !== 'all') {
        filteredStaff = activeStaff.filter(s => (s.shift || 'pagi') === State.shiftFilter);
      }

      const N = filteredStaff.length;
      if (N === 0) return null;

      const currentShift = State.shiftFilter === 'malam' ? 'malam' : 'pagi';
      const smartConfig = SmartTimingManager.getConfig(currentShift);
      const targetDate = date || State.scheduleDate || new Date();

      let startTimeStr = '08:00';
      if (State.customBreakStartTimeSec !== undefined) {
        startTimeStr = formatTime(State.customBreakStartTimeSec).substring(0, 5);
      } else if (currentShift === 'malam') {
        startTimeStr = '19:00';
      }

      // Automated Smart Calculator System Engine by Default!
      const autoCalcRes = SmartCalculatorEngine.calculateSystem({
        staffCount: N,
        startTimeStr: startTimeStr,
        endTimeStr: (currentShift === 'malam') ? '05:20' : '19:00',
        roundsCount: 4,
        distMode: 'auto',
        staffGapSec: 0,
        gapBufferOption: 'auto'
      });

      let defaultDurations = autoCalcRes.roundDurationsSec;

      if (smartConfig && Array.isArray(smartConfig.durations) && smartConfig.durations.length === 4) {
        defaultDurations = smartConfig.durations.map(m => m * 60);
      }

      const schedule = {
        staffCount: N,
        staff: filteredStaff,
        durations: defaultDurations,
        autoCalcRes: autoCalcRes,
        breaks: []
      };

      const usedDurationsByStaff = {};
      filteredStaff.forEach(s => {
        usedDurationsByStaff[s.id] = new Set();
      });

      for (let r = 0; r < MAX_BREAK_COUNT; r++) {
        const defaultDuration = defaultDurations[r];

        // Determine round start time (from manual config or auto-calculated Auto-Fit gap)
        let roundStart;
        if (smartConfig && smartConfig.startTimeSec !== undefined) {
          roundStart = smartConfig.startTimeSec + r * ((smartConfig.gaps && smartConfig.gaps[r] !== undefined ? smartConfig.gaps[r] * 60 : 0) + N * defaultDuration);
        } else {
          roundStart = autoCalcRes.roundDetails[r] ? autoCalcRes.roundDetails[r].roundStartSec : ((currentShift === 'malam') ? 68400 : 28800);
        }

        const breakRound = {
          roundNumber: r + 1,
          defaultDuration: defaultDuration,
          roundStart: roundStart,
          slots: []
        };

        let currentPointer = roundStart;

        for (let i = 0; i < N; i++) {
          const staff = filteredStaff[i];
          const staffUsed = usedDurationsByStaff[staff.id];

          const savedChoice = BreakChoiceManager.getStaffChoice(
            targetDate,
            staff.id,
            r + 1,
            null
          );

          let chosenDuration = savedChoice;

          if (savedChoice !== null && !staffUsed.has(savedChoice)) {
            chosenDuration = savedChoice;
          } else {
            const availableDur = defaultDurations.find(d => !staffUsed.has(d));
            if (availableDur !== undefined) {
              chosenDuration = availableDur;
            } else {
              chosenDuration = defaultDuration;
            }
          }

          staffUsed.add(chosenDuration);

          const override = BreakOverrideManager.getStaffOverride(
            targetDate,
            staff.id,
            r + 1
          );

          const keluar = (override.keluar !== undefined) ? override.keluar : currentPointer;
          const matikanLC = keluar - LC_OFFSET;
          const masuk = (override.masuk !== undefined) ? override.masuk : (keluar + chosenDuration);
          const isCompleted = BreakStatusManager.isCompleted(targetDate, staff.id, r + 1);
          const actualDuration = masuk - keluar;

          let isExceeded = actualDuration > chosenDuration;
          const isToday = toDateString(targetDate) === toDateString(new Date());
          if (isToday && !isCompleted) {
            const now = new Date();
            const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
            if (nowSec > masuk) {
              isExceeded = true;
            }
          }

          breakRound.slots.push({
            staffId: staff.id,
            staffName: staff.name,
            chosenDuration,
            defaultDuration,
            matikanLC,
            keluar,
            masuk,
            actualDuration,
            isCompleted,
            isExceeded,
            isKeluarOverride: override.keluar !== undefined,
            isMasukOverride: override.masuk !== undefined,
            isCustom: chosenDuration !== defaultDuration
          });

          // Next staff in line goes out exactly when this staff member returns!
          currentPointer = masuk;
        }

        let expectedPointer = roundStart;
        breakRound.slots.forEach(slot => {
          const targetKeluar = expectedPointer;
          const targetMasuk = targetKeluar + slot.chosenDuration;
          const delaySecs = slot.masuk - targetMasuk;

          slot.targetKeluar = targetKeluar;
          slot.targetMasuk = targetMasuk;
          slot.delaySecs = delaySecs;
          slot.isBottleneck = delaySecs > 0;

          expectedPointer = targetMasuk;
        });

        const bottlenecks = breakRound.slots.filter(s => s.delaySecs > 0).sort((a, b) => b.delaySecs - a.delaySecs);
        breakRound.bottlenecks = bottlenecks;

        const firstSlot = breakRound.slots[0];
        const lastSlot = breakRound.slots[N - 1];

        const totalScheduledDuration = breakRound.slots.reduce((sum, s) => sum + s.chosenDuration, 0);
        const blockStart = firstSlot ? firstSlot.keluar : roundStart;
        const blockTargetEnd = blockStart + totalScheduledDuration;
        const blockActualEnd = lastSlot ? lastSlot.masuk : blockTargetEnd;
        const diffSecs = blockActualEnd - blockTargetEnd;

        breakRound.blockStart = blockStart;
        breakRound.blockTargetEnd = blockTargetEnd;
        breakRound.blockActualEnd = blockActualEnd;
        breakRound.diffSecs = diffSecs;
        breakRound.totalScheduledDuration = totalScheduledDuration;
        breakRound.totalActualDuration = blockActualEnd - blockStart;

        // Next break round starts when the last staff member of this round finishes + optional gap!
        const gapSecs = (smartConfig && Array.isArray(smartConfig.gaps) && smartConfig.gaps[r] !== undefined)
          ? (smartConfig.gaps[r] * 60)
          : 0;
        roundStart = currentPointer + gapSecs;
        schedule.breaks.push(breakRound);
      }

      // --- Clash Detection Engine ---
      const allSlots = [];
      schedule.breaks.forEach(br => {
        br.slots.forEach(slot => {
          allSlots.push({ ...slot, round: br.roundNumber, slotRef: slot });
        });
      });

      const clashes = [];
      for (let i = 0; i < allSlots.length; i++) {
        for (let j = i + 1; j < allSlots.length; j++) {
          const s1 = allSlots[i];
          const s2 = allSlots[j];
          if (s1.keluar < s2.masuk && s2.keluar < s1.masuk) {
            const overlapStart = Math.max(s1.keluar, s2.keluar);
            const overlapEnd = Math.min(s1.masuk, s2.masuk);
            if (overlapEnd - overlapStart >= 60) {
              s1.slotRef.hasClash = true;
              s2.slotRef.hasClash = true;
              s1.slotRef.clashWith = s1.slotRef.clashWith || [];
              s2.slotRef.clashWith = s2.slotRef.clashWith || [];

              if (!s1.slotRef.clashWith.includes(s2.staffName)) s1.slotRef.clashWith.push(s2.staffName);
              if (!s2.slotRef.clashWith.includes(s1.staffName)) s2.slotRef.clashWith.push(s1.staffName);

              clashes.push({
                staff1: s1.staffName,
                staff2: s2.staffName,
                round1: s1.round,
                round2: s2.round,
                start: overlapStart,
                end: overlapEnd
              });
            }
          }
        }
      }
      schedule.clashes = clashes;

      return schedule;
    }
  };

  /* ============================================
     UI State
     ============================================ */
  const State = {
    currentTab: 'schedule',
    scheduleDate: new Date(),
    shiftFilter: 'pagi', // 'pagi', 'malam', 'all'
    calYear: new Date().getFullYear(),
    calMonth: new Date().getMonth(),
    editingStaffId: null,
    deletingStaffId: null,
    focusTarget: null,
    activeCauseStaffId: null
  };

  /* ============================================
     Schedule Renderer
     ============================================ */
  const ScheduleRenderer = {
    render() {
      const date = State.scheduleDate;
      const activeStaff = AttendanceManager.getActiveStaffForDate(date);

      // Preserve focus target before re-rendering
      const activeEl = document.activeElement;
      let focusTarget = State.focusTarget;
      if (!focusTarget && activeEl && activeEl.classList && (activeEl.classList.contains('time-input') || activeEl.classList.contains('duration-select'))) {
        focusTarget = {
          staffId: activeEl.dataset.staffId,
          round: activeEl.dataset.round,
          type: activeEl.dataset.type || 'select'
        };
      }
      State.focusTarget = null;

      let filteredStaff = activeStaff;
      if (State.shiftFilter && State.shiftFilter !== 'all') {
        filteredStaff = activeStaff.filter(s => (s.shift || 'pagi') === State.shiftFilter);
      }

      // Update header
      document.getElementById('headerDate').textContent = formatDateID(date);
      document.getElementById('activeCount').textContent = filteredStaff.length;
      document.getElementById('scheduleDate').value = toDateString(date);

      const wrapper = document.getElementById('scheduleTableWrapper');
      const footer = document.getElementById('scheduleFooter');

      if (!filteredStaff || filteredStaff.length === 0) {
        wrapper.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-title">Tidak Ada Staff Aktif pada Shift Ini</div>
            <div class="empty-state-text">Semua staff sedang libur, cuti, atau berada di shift lain. Silakan atur status staff di tab "Kelola Staff & Kehadiran".</div>
          </div>`;
        footer.innerHTML = '';
        return;
      }

      const schedule = BreakCalculator.generateSchedule(activeStaff, date);
      if (!schedule) {
        wrapper.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-title">Tidak Ada Jadwal Berjalan</div>
            <div class="empty-state-text">Silakan aktifkan status staff di tab "Kelola Staff & Kehadiran".</div>
          </div>`;
        footer.innerHTML = '';
        return;
      }

      wrapper.innerHTML = this._buildTable(schedule);
      footer.innerHTML = this._buildFooter(schedule);

      // Restore focus after re-render!
      if (focusTarget && focusTarget.staffId && focusTarget.round) {
        let selector = '';
        if (focusTarget.type === 'select') {
          selector = `.duration-select[data-staff-id="${focusTarget.staffId}"][data-round="${focusTarget.round}"]`;
        } else {
          selector = `.time-input[data-staff-id="${focusTarget.staffId}"][data-round="${focusTarget.round}"][data-type="${focusTarget.type}"]`;
        }
        const targetEl = wrapper.querySelector(selector);
        if (targetEl) {
          targetEl.focus();
          if (focusTarget.type !== 'select' && targetEl.select) {
            targetEl.select();
          }
        }
      }
    },

    _buildDelaySummaryCard(schedule) {
      return '';
    },

    _formatDiffSummary(diffSecs, blockTargetEnd, blockActualEnd, bottlenecks = [], lastStaffName = '') {
      const targetStr = formatTime(blockTargetEnd);
      const actualStr = formatTime(blockActualEnd);

      if (diffSecs === 0) {
        return {
          text: `ON TIME`,
          badgeClass: 'block-status-exact',
          targetStr,
          actualStr
        };
      }

      const absDiff = Math.abs(diffSecs);
      const m = Math.floor(absDiff / 60);
      const s = absDiff % 60;
      let diffStr = '';
      if (m > 0 && s > 0) {
        diffStr = `${m}m ${s}s`;
      } else if (m > 0) {
        diffStr = `${m}m`;
      } else {
        diffStr = `${s}s`;
      }

      if (diffSecs > 0) {
        return {
          text: `SLOWER ${diffStr}`,
          badgeClass: 'block-status-slower',
          targetStr,
          actualStr,
          diffStr
        };
      } else {
        return {
          text: `FASTER ${diffStr}`,
          badgeClass: 'block-status-faster',
          targetStr,
          actualStr,
          diffStr
        };
      }
    },

    _buildTable(schedule) {
      if (!schedule || !schedule.staff || schedule.staff.length === 0) {
        return `<div class="empty-state">
                  <div class="empty-state-title">Tidak Ada Staff Aktif pada Shift Ini</div>
                  <div class="empty-state-text">Silakan atur status staff ke HADIR di tab Kelola Staff & Kehadiran.</div>
                </div>`;
      }
      const staff = schedule.staff;
      const N = staff.length;

      let html = '';

      // Automated Smart Timing Summary Card
      const shiftTitle = State.shiftFilter === 'malam' ? 'Shift Malam' : (State.shiftFilter === 'pagi' ? 'Shift Pagi' : 'Semua Shift');
      const firstRound = schedule.breaks[0];

      if (firstRound && firstRound.slots.length > 0) {
        html += '<div class="auto-timing-card">';
        html += '  <div class="auto-timing-header">';
        html += `    <div class="auto-timing-title"><strong>Kalkulasi Waktu Otomatis</strong> — ${N} Staff On-Duty (${shiftTitle})</div>`;
        html += `    <div class="auto-timing-badge">Jam Mulai Sesi 1: ${formatTime(firstRound.slots[0].keluar)} WIB</div>`;
        html += '  </div>';
        html += '  <div class="auto-timing-grid">';

        schedule.breaks.forEach((br, rIdx) => {
          const firstSlot = br.slots[0];
          const lastSlot = br.slots[br.slots.length - 1];
          if (!firstSlot || !lastSlot) return;

          const startT = formatTime(firstSlot.keluar);
          const endT = formatTime(lastSlot.masuk);
          const durMin = Math.round(br.defaultDuration / 60);

          let gapNotice = '';
          if (rIdx < schedule.breaks.length - 1 && schedule.breaks[rIdx + 1].slots.length > 0) {
            const nextRoundFirstSlot = schedule.breaks[rIdx + 1].slots[0];
            if (nextRoundFirstSlot) {
              const gapSec = nextRoundFirstSlot.keluar - lastSlot.masuk;
              if (gapSec > 60) {
                gapNotice = ` • Jeda: ${Math.round(gapSec / 60)}m`;
              }
            }
          }

          html += '    <div class="timing-session-chip">';
          html += `      <div class="chip-title">Break ${br.roundNumber} (Sesi ${br.roundNumber})</div>`;
          html += `      <div class="chip-time">${startT} - ${endT}</div>`;
          html += `      <div class="chip-detail">${N} Staff × ${durMin}m per staff${gapNotice}</div>`;
          html += '    </div>';
        });

        html += '  </div>';
        html += '</div>';
      }

      // Clash Warning Alert Banner
      if (schedule.clashes && schedule.clashes.length > 0) {
        html += `<div class="clash-alert-banner">`;
        html += `<div class="clash-alert-header">⚠️ DITEMUKAN ${schedule.clashes.length} BENTROK JADWAL BREAK</div>`;
        html += `<div class="clash-alert-body">`;
        schedule.clashes.forEach(c => {
          html += `<div class="clash-item"><strong>${this._escHtml(c.staff1)}</strong> (Break ${c.round1}) &amp; <strong>${this._escHtml(c.staff2)}</strong> (Break ${c.round2}) <span class="clash-time">Waktu bentrok: ${formatTime(c.start)} - ${formatTime(c.end)}</span></div>`;
        });
        html += `</div></div>`;
      }

      html += '<table class="schedule-table"><thead><tr>';
      html += '<th class="break-col">BREAK</th>';
      html += '<th class="label-col">ROW</th>';
      staff.forEach(s => {
        html += `<th class="staff-col" data-staff-id="${s.id}" title="Shift: ${s.shift === 'malam' ? 'Malam' : 'Pagi'}">${this._escHtml(s.name)}</th>`;
      });
      html += '<th class="status-col">STATUS</th>';
      html += '</tr></thead><tbody>';

      const now = new Date();
      const isToday = toDateString(schedule.date || State.scheduleDate) === toDateString(now);
      const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

      schedule.breaks.forEach(br => {
        const firstSlot = br.slots[0];
        const lastSlot = br.slots[br.slots.length - 1];
        const blockStart = firstSlot ? firstSlot.keluar : 0;
        const blockEnd = lastSlot ? lastSlot.masuk : 0;

        const isActiveBlock = isToday && (nowSecs >= blockStart && nowSecs <= blockEnd);
        const activeClass = isActiveBlock ? 'active-break-block' : '';

        const lastStaffName = lastSlot ? lastSlot.staffName : '';
        const summary = this._formatDiffSummary(br.diffSecs, br.blockTargetEnd, br.blockActualEnd, br.bottlenecks, lastStaffName);

        // 1. DURASI row (with rowspan=4 for BREAK and STATUS cells)
        html += `<tr class="row-durasi ${activeClass}">`;
        html += `<td rowspan="4" class="break-block-cell ${activeClass}">`;
        html += `<div class="break-block-info">`;
        html += `<div class="break-block-title">BREAK ${br.roundNumber}</div>`;
        html += `<div class="break-block-default">Default: ${formatDuration(br.defaultDuration)}</div>`;
        if (isActiveBlock) {
          html += `<div class="live-block-badge">SEDANG BERJALAN</div>`;
        }
        html += `<button type="button" class="btn-reset-round" data-round="${br.roundNumber}" title="Reset jam dan durasi Break ${br.roundNumber} ke default">Reset</button>`;
        html += `</div></td>`;
        html += '<td class="label-cell">DURASI</td>';

        br.slots.forEach(slot => {
          html += '<td class="time-cell durasi-cell">';
          html += `<select class="duration-select ${slot.isCustom ? 'custom-chosen' : ''}" `;
          html += `data-staff-id="${slot.staffId}" data-round="${br.roundNumber}" `;
          html += `title="Pilih opsi durasi break untuk ${this._escHtml(slot.staffName)}">`;

          // Collect durations already selected by this staff member in other break rounds
          const usedDurationsInOtherRounds = new Set();
          schedule.breaks.forEach(otherBr => {
            if (otherBr.roundNumber !== br.roundNumber) {
              const otherSlot = otherBr.slots.find(s => s.staffId === slot.staffId);
              if (otherSlot) {
                usedDurationsInOtherRounds.add(otherSlot.chosenDuration);
              }
            }
          });

          schedule.durations.forEach(durSec => {
            const isSelected = slot.chosenDuration === durSec;
            html += `<option value="${durSec}" ${isSelected ? 'selected' : ''}>${formatDuration(durSec)}</option>`;
          });

          html += '</select></td>';
        });

        html += `<td rowspan="4" class="block-status-cell ${activeClass}">`;
        html += `<span class="block-status-badge ${summary.badgeClass}" title="Jadwal Target Selesai: ${summary.targetStr} | Realisasi Selesai: ${summary.actualStr}">${summary.text}</span>`;
        html += `</td>`;
        html += '</tr>';

        // 2. MATIKAN LC row
        html += `<tr class="row-matikan ${activeClass}">`;
        html += '<td class="label-cell">MATIKAN LC</td>';
        br.slots.forEach(slot => {
          html += `<td class="time-cell matikan-cell">${formatTime(slot.matikanLC)}</td>`;
        });
        html += '</tr>';

        // 3. KELUAR row
        html += `<tr class="row-keluar ${activeClass}">`;
        html += '<td class="label-cell">KELUAR</td>';
        br.slots.forEach(slot => {
          const clashClass = slot.hasClash ? 'has-clash-cell' : '';
          const inputClash = slot.hasClash ? 'has-clash' : '';
          const clashTitle = slot.hasClash ? ` ⚠️ BENTROK JAM BREAK: Bersamaan dengan ${slot.clashWith ? slot.clashWith.join(', ') : ''}` : '';
          html += `<td class="time-cell keluar-cell ${clashClass}">`;
          html += `<input type="text" maxlength="8" class="time-input keluar-input ${slot.isKeluarOverride ? 'is-override' : ''} ${inputClash}" `;
          html += `data-staff-id="${slot.staffId}" data-round="${br.roundNumber}" data-type="keluar" `;
          html += `value="${formatTime(slot.keluar)}" placeholder="00:00:00" title="Jam keluar ${this._escHtml(slot.staffName)}${clashTitle}">`;
          html += '</td>';
        });
        html += '</tr>';

        // 4. MASUK row
        html += `<tr class="row-masuk ${activeClass}">`;
        html += '<td class="label-cell">MASUK</td>';
        br.slots.forEach(slot => {
          let inputClass = 'time-input masuk-input';
          if (slot.isExceeded) inputClass += ' is-exceeded';
          else if (slot.isMasukOverride) inputClass += ' is-override';
          if (slot.hasClash) inputClass += ' has-clash';
          const clashClass = slot.hasClash ? 'has-clash-cell' : '';

          // Calculate actual elapsed duration (from KELUAR to MASUK)
          const actualSecs = Math.max(0, slot.actualDuration || (slot.masuk - slot.keluar));
          const m = Math.floor(actualSecs / 60);
          const s = actualSecs % 60;
          let actualDurStr = '';
          if (m > 0 && s > 0) actualDurStr = `${m}m ${s}s`;
          else if (m > 0) actualDurStr = `${m}m`;
          else actualDurStr = `${s}s`;

          const durTargetStr = formatDuration(slot.chosenDuration);

          const clashMsg = slot.hasClash ? ` | ⚠️ BENTROK dengan ${slot.clashWith ? slot.clashWith.join(', ') : ''}` : '';
          const titleMsg = slot.isExceeded
            ? `⚠️ CS ${this._escHtml(slot.staffName)}: Terpakai ${actualDurStr} (Target: ${durTargetStr}) - Melebihi target!${clashMsg}`
            : `CS ${this._escHtml(slot.staffName)} | Durasi Terpakai: ${actualDurStr} (Target: ${durTargetStr})${clashMsg}`;

          html += `<td class="time-cell masuk-cell ${clashClass}" data-duration="${actualDurStr}" title="${titleMsg}">`;
          html += `<input type="text" maxlength="8" class="${inputClass}" `;
          html += `data-staff-id="${slot.staffId}" data-round="${br.roundNumber}" data-type="masuk" `;
          html += `value="${formatTime(slot.masuk)}" placeholder="00:00:00" title="${titleMsg}">`;
          html += '</td>';
        });
        html += '</tr>';
      });

      // Cumulative summary row below Block 4 for each staff member
      html += '<tr class="row-total-summary">';
      html += '<td colspan="2" class="label-cell">📊 AKUMULASI CS</td>';

      staff.forEach((s, colIdx) => {
        let totalChosen = 0;
        let totalActual = 0;

        schedule.breaks.forEach(br => {
          const slot = br.slots[colIdx];
          if (slot) {
            totalChosen += slot.chosenDuration;
            totalActual += slot.actualDuration;
          }
        });

        const netSecs = totalActual - totalChosen;
        const absSecs = Math.abs(netSecs);
        const m = Math.floor(absSecs / 60);
        const sec = absSecs % 60;

        let timeStr = (m > 0 && sec > 0) ? `${m}m ${sec}s` : (m > 0 ? `${m}m` : `${sec}s`);

        let label = '🎯 On time';
        let cellClass = 'summary-exact';

        if (netSecs > 0) {
          label = `<span class="sum-icon">⚠️</span><span class="sum-time">Slower ${timeStr}</span>`;
          cellClass = 'summary-slower';
        } else if (netSecs < 0) {
          label = `<span class="sum-icon">⚡</span><span class="sum-time">Faster ${timeStr}</span>`;
          cellClass = 'summary-faster';
        }

        html += `<td class="time-cell ${cellClass}" title="Total Target: ${formatDuration(totalChosen)} | Total Realisasi: ${formatDuration(totalActual)}">${label}</td>`;
      });

      // Calculate overall On Time vs Delay percentage across all break blocks
      const totalBlocks = schedule.breaks.length;
      const delayedBlocks = schedule.breaks.filter(b => b.diffSecs > 0).length;
      const onTimeBlocks = totalBlocks - delayedBlocks;
      const blockOnTimePercent = Math.round((onTimeBlocks / totalBlocks) * 100);
      const blockDelayPercent = 100 - blockOnTimePercent;

      let onTimeBadgeHtml = '';
      if (blockDelayPercent === 0) {
        onTimeBadgeHtml = `<div class="accuracy-badge is-ontime" title="Ketepatan waktu jadwal hari ini: 100% On Time">🎯 100% On Time</div>`;
      } else {
        onTimeBadgeHtml = `<div class="accuracy-badge is-delay" title="Ketepatan waktu: ${blockOnTimePercent}% On Time | ${blockDelayPercent}% Delay">⚠️ ${blockOnTimePercent}% On Time<span class="delay-subtext">${blockDelayPercent}% Delay</span></div>`;
      }

      html += `<td class="summary-empty-cell summary-accuracy-cell">${onTimeBadgeHtml}</td>`;
      html += '</tr>';

      html += '</tbody></table>';
      return html;
    },

    _buildFooter(schedule) {
      if (!schedule || !schedule.staff || schedule.staff.length === 0 || !schedule.breaks || schedule.breaks.length === 0) return '';
      const N = schedule.staffCount;
      const durations = schedule.durations;
      const lastBreak = schedule.breaks[MAX_BREAK_COUNT - 1];
      const lastSlot = lastBreak.slots[lastBreak.slots.length - 1];
      const endTime = formatTime(lastSlot.masuk);

      const durList = durations.map(d => formatDuration(d)).join(', ');

      let html = '';
      html += `<p>Total CS yang bertugas hari ini adalah <strong>${N} orang</strong>. Mohon kerjasamanya untuk mematuhi tabel jadwal di atas demi kenyamanan bersama.</p>`;
      html += `<p><strong>Rotasi Harian Otomatis:</strong> Urutan break berotasi otomatis setiap hari (staff urutan pertama hari ini bergeser ke posisi paling belakang esok harinya).</p>`;
      html += `<p>Terdapat 4 variasi durasi break: <strong>${durList}</strong> (sudah termasuk toleransi 1 menit).</p>`;
      html += `<p>Jadwal break berjalan berurutan dan baru berhenti hingga CS ke istirahat terakhir selesai pukul <strong>${endTime} WIB</strong>.</p>`;

      if (N <= 7) {
        html += `<p style="color:var(--green)">Semua break berdurasi 21 menit (20 menit break + 1 menit toleransi) karena jumlah staff ≤ 7 orang.</p>`;
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

      if (!list) return;

      badge.textContent = `${staff.length} staff`;

      if (staff.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-title">Belum ada staff</div>
            <div class="empty-state-text">Tambahkan staff baru menggunakan form di atas.</div>
          </div>`;
        return;
      }

      const activeDate = State.scheduleDate || new Date();

      const groups = {
        pagi: [],
        malam: [],
        libur: [],
        cuti: []
      };

      staff.forEach((s, idx) => {
        const shiftType = s.shift || 'pagi';
        const status = AttendanceManager.getStatus(s.id, activeDate); // 'masuk', 'libur', 'cuti'
        const itemData = { s, idx, shiftType, status };

        if (status === 'libur') {
          groups.libur.push(itemData);
        } else if (status === 'cuti') {
          groups.cuti.push(itemData);
        } else if (shiftType === 'malam') {
          groups.malam.push(itemData);
        } else {
          groups.pagi.push(itemData);
        }
      });

      const categories = [
        { key: 'pagi', label: 'PAGI', icon: '☀️', class: 'group-pagi', count: groups.pagi.length },
        { key: 'malam', label: 'MALAM', icon: '🌙', class: 'group-malam', count: groups.malam.length },
        { key: 'libur', label: 'LIBUR', icon: '🏖️', class: 'group-libur', count: groups.libur.length },
        { key: 'cuti', label: 'CUTI', icon: '📋', class: 'group-cuti', count: groups.cuti.length }
      ];

      let html = '<div class="staff-groups-container">';

      categories.forEach(cat => {
        const items = groups[cat.key];

        html += `<div class="staff-group-section ${cat.class}" data-group="${cat.key}">`;
        html += `  <div class="staff-group-header">`;
        html += `    <div class="staff-group-title">`;
        html += `      <span class="staff-group-icon">${cat.icon}</span>`;
        html += `      <span class="staff-group-name">${cat.label}</span>`;
        html += `      <span class="staff-group-badge">${cat.count} staff</span>`;
        html += `    </div>`;
        html += `  </div>`;
        html += `  <div class="staff-group-body">`;

        if (items.length === 0) {
          html += `    <div class="staff-group-empty">Tidak ada staff di kategori ini</div>`;
        } else {
          items.forEach(({ s, idx, shiftType, status }) => {
            html += `<div class="staff-item" data-id="${s.id}" draggable="true">`;
            html += `  <span class="drag-handle" title="Tarik / geser untuk mengubah urutan">⋮⋮</span>`;
            html += `  <span class="staff-order">${idx + 1}</span>`;
            html += `  <span class="staff-name">${this._escHtml(s.name)}</span>`;

            html += '  <div class="staff-controls-container">';
            // Status Kehadiran Selector (HADIR | LIBUR | CUTI)
            html += '    <div class="status-btn-group">';
            html += `      <button type="button" class="btn-status-pill ${status === 'masuk' ? 'active-hadir' : ''}" data-action="set-status" data-status="masuk" data-id="${s.id}" title="Set status Hadir untuk hari ini">HADIR</button>`;
            html += `      <button type="button" class="btn-status-pill ${status === 'libur' ? 'active-libur' : ''}" data-action="set-status" data-status="libur" data-id="${s.id}" title="Set status Libur untuk hari ini">LIBUR</button>`;
            html += `      <button type="button" class="btn-status-pill ${status === 'cuti' ? 'active-cuti' : ''}" data-action="set-status" data-status="cuti" data-id="${s.id}" title="Set status Cuti untuk hari ini">CUTI</button>`;
            html += '    </div>';

            // Shift Selector (PAGI | MALAM)
            html += '    <div class="shift-btn-group">';
            html += `      <button type="button" class="btn-shift-pill ${shiftType === 'pagi' ? 'active-pagi' : ''}" data-action="set-shift" data-shift="pagi" data-id="${s.id}" title="Set Shift Pagi">PAGI</button>`;
            html += `      <button type="button" class="btn-shift-pill ${shiftType === 'malam' ? 'active-malam' : ''}" data-action="set-shift" data-shift="malam" data-id="${s.id}" title="Set Shift Malam">MALAM</button>`;
            html += '    </div>';
            html += '  </div>';

            html += '  <div class="staff-actions">';
            html += `    <button class="btn-action up" data-action="up" data-id="${s.id}" title="Pindah ke atas"${idx === 0 ? ' disabled style="opacity:0.3"' : ''}>▲</button>`;
            html += `    <button class="btn-action down" data-action="down" data-id="${s.id}" title="Pindah ke bawah"${idx === staff.length - 1 ? ' disabled style="opacity:0.3"' : ''}>▼</button>`;
            html += `    <button class="btn-action edit" data-action="edit" data-id="${s.id}" title="Edit nama">Edit</button>`;
            html += `    <button class="btn-action delete" data-action="delete" data-id="${s.id}" title="Hapus staff">Hapus</button>`;
            html += '  </div>';
            html += '</div>';
          });
        }

        html += `  </div>`;
        html += `</div>`;
      });

      html += '</div>';
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
      SmartCalculatorUI.init();
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

    copyScheduleToSheet() {
      const activeStaff = AttendanceManager.getActiveStaffForDate(State.scheduleDate);
      if (activeStaff.length === 0) {
        showToast('Tidak ada staff aktif untuk disalin', 'error');
        return;
      }

      const schedule = BreakCalculator.generateSchedule(activeStaff, State.scheduleDate);
      if (!schedule || !schedule.breaks || schedule.breaks.length === 0) {
        showToast('Jadwal tidak tersedia', 'error');
        return;
      }

      const dateStr = formatDateID(State.scheduleDate);
      const staffNames = schedule.staff.map(s => s.name);

      let tsv = `JADWAL BREAK STAFF — ${dateStr}\n`;
      tsv += 'BREAK\tROW\t' + staffNames.join('\t') + '\tSTATUS\n\n';

      schedule.breaks.forEach(br => {
        const lastSlot = br.slots[br.slots.length - 1];
        const lastStaffName = lastSlot ? lastSlot.staffName : '';
        const summary = ScheduleRenderer._formatDiffSummary(br.diffSecs, br.blockTargetEnd, br.blockActualEnd, br.bottlenecks, lastStaffName);

        const bTitle = `BREAK ${br.roundNumber}\nDefault: ${formatDuration(br.defaultDuration)}`;

        tsv += `${bTitle}\tDURASI\t` + br.slots.map(s => formatDuration(s.chosenDuration, true)).join('\t') + `\t${summary.text}\n`;
        tsv += `\tMATIKAN LC\t` + br.slots.map(s => formatTime(s.matikanLC)).join('\t') + '\t\n';
        tsv += `\tKELUAR\t` + br.slots.map(s => formatTime(s.keluar)).join('\t') + '\t\n';
        tsv += `\tMASUK\t` + br.slots.map(s => formatTime(s.masuk)).join('\t') + '\t\n\n';
      });

      // Accumulation row at bottom of TSV
      let accumRow = '\t📊 AKUMULASI CS\t';
      const accumLabels = schedule.staff.map((s, colIdx) => {
        let totalChosen = 0;
        let totalActual = 0;
        schedule.breaks.forEach(br => {
          const slot = br.slots[colIdx];
          if (slot) {
            totalChosen += slot.chosenDuration;
            totalActual += slot.actualDuration;
          }
        });
        const netSecs = totalActual - totalChosen;
        const absSecs = Math.abs(netSecs);
        const m = Math.floor(absSecs / 60);
        const sec = absSecs % 60;
        let timeStr = (m > 0 && sec > 0) ? `${m}m ${sec}s` : (m > 0 ? `${m}m` : `${sec}s`);
        if (netSecs > 0) return `Slower ${timeStr}`;
        if (netSecs < 0) return `Faster ${timeStr}`;
        return 'On time';
      });
      tsv += accumRow + accumLabels.join('\t') + '\t\n';

      const notifySuccess = () => {
        showToast('Jadwal berhasil disalin! Tinggal Ctrl+V di Google Sheets / Excel 📊', 'success');
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(tsv).then(notifySuccess).catch(() => {
          this._fallbackCopyText(tsv, notifySuccess);
        });
      } else {
        this._fallbackCopyText(tsv, notifySuccess);
      }
    },

    _fallbackCopyText(text, callback) {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        if (callback) callback();
      } catch {
        showToast('Gagal menyalin ke clipboard', 'error');
      }
      document.body.removeChild(textArea);
    },

    refreshStaff() {
      StaffRenderer.render();
    },

    refreshCalendar() {
      CalendarRenderer.render();
    },

    /* ---- Clock & Live Monitor ---- */
    _setupClock() {
      const clockEl = document.getElementById('clock');
      const tick = () => {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        if (clockEl) clockEl.textContent = `${h}:${m}:${s}`;
        this._updateLiveBreakMonitor();
      };
      tick();
      setInterval(tick, 1000);
    },

    _updateLiveBreakMonitor() {
      const activeBox = document.getElementById('liveActiveBreakBox');
      const upcomingBox = document.getElementById('liveUpcomingBreakBox');
      if (!activeBox || !upcomingBox) return;

      const date = State.scheduleDate;
      const isToday = toDateString(date) === toDateString(new Date());

      if (!isToday) {
        activeBox.innerHTML = '<div class="live-empty-state">Monitor Live aktif untuk tanggal hari ini</div>';
        upcomingBox.innerHTML = '<div class="live-empty-state">Pilih tanggal "Hari Ini" untuk memantau countdown</div>';
        return;
      }

      const activeStaff = AttendanceManager.getActiveStaffForDate(date);
      if (!activeStaff || activeStaff.length === 0) {
        activeBox.innerHTML = '<div class="live-empty-state">Tidak ada staff aktif hari ini</div>';
        upcomingBox.innerHTML = '<div class="live-empty-state">Tidak ada jadwal break</div>';
        return;
      }

      const schedule = BreakCalculator.generateSchedule(activeStaff, date);
      if (!schedule || !schedule.breaks) return;

      const now = new Date();
      const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

      const activeBreaks = [];
      const warningBreaks = [];
      const upcomingBreaks = [];

      schedule.breaks.forEach(br => {
        br.slots.forEach(slot => {
          if (nowSec >= slot.keluar && nowSec < slot.masuk) {
            const remSec = slot.masuk - nowSec;
            activeBreaks.push({ slot, round: br.roundNumber, remSec });
          } else if (nowSec >= slot.matikanLC && nowSec < slot.keluar) {
            const remSec = slot.keluar - nowSec;
            warningBreaks.push({ slot, round: br.roundNumber, remSec });
          } else if (nowSec < slot.matikanLC) {
            const startSec = slot.keluar - nowSec;
            upcomingBreaks.push({ slot, round: br.roundNumber, startSec });
          }
        });
      });

      // Render Active Breaks
      if (activeBreaks.length > 0) {
        activeBox.innerHTML = activeBreaks.map(item => `
          <div class="live-staff-item">
            <div>
              <span class="live-staff-name">${item.slot.staffName}</span>
              <span style="font-size:0.8rem;color:var(--text-muted);margin-left:8px;">Break ${item.round} (${formatTime(item.slot.keluar)} - ${formatTime(item.slot.masuk)})</span>
            </div>
            <div class="live-countdown">⏳ ${formatDuration(item.remSec, true)}</div>
          </div>
        `).join('');
      } else {
        activeBox.innerHTML = '<div class="live-empty-state">Tidak ada staff yang sedang break saat ini</div>';
      }

      // Render Warning & Upcoming Breaks
      if (warningBreaks.length > 0) {
        upcomingBox.innerHTML = warningBreaks.map(item => `
          <div class="live-staff-item" style="border-color: rgba(245,158,11,0.4); background: rgba(245,158,11,0.08);">
            <div>
              <span class="live-staff-name" style="color:var(--amber);">⚠️ ${item.slot.staffName}</span>
              <span style="font-size:0.8rem;color:var(--amber-dim);margin-left:8px;">SIAP-SIAP MATIKAN LIVECHAT! Break pada ${formatTime(item.slot.keluar)}</span>
            </div>
            <div class="live-staff-time" style="color:var(--amber);">Keluar dalam ${formatDuration(item.remSec, false)}</div>
          </div>
        `).join('');
      } else if (upcomingBreaks.length > 0) {
        const next = upcomingBreaks[0];
        upcomingBox.innerHTML = `
          <div class="live-staff-item">
            <div>
              <span class="live-staff-name">${next.slot.staffName}</span>
              <span style="font-size:0.8rem;color:var(--text-muted);margin-left:8px;">Break ${next.round} jam ${formatTime(next.slot.keluar)} (Matikan LC ${formatTime(next.slot.matikanLC)})</span>
            </div>
            <div class="live-staff-time">Jadwal berikutnya</div>
          </div>
        `;
      } else {
        upcomingBox.innerHTML = '<div class="live-empty-state">Semua jadwal break hari ini telah selesai 🎉</div>';
      }
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
      const searchInput = document.getElementById('scheduleSearchInput');
      const shiftFilterGroup = document.getElementById('shiftFilterGroup');

      if (shiftFilterGroup) {
        shiftFilterGroup.addEventListener('click', (e) => {
          const btn = e.target.closest('.btn-shift');
          if (!btn) return;
          const shiftVal = btn.dataset.shift;
          State.shiftFilter = shiftVal;
          shiftFilterGroup.querySelectorAll('.btn-shift').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.refreshSchedule();
        });
      }

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

      if (searchInput) {
        searchInput.addEventListener('input', () => {
          const query = searchInput.value.toLowerCase().trim();
          const table = document.querySelector('#scheduleTableWrapper table');
          if (!table) return;
          const ths = table.querySelectorAll('thead th');
          const trs = table.querySelectorAll('tbody tr');

          if (!query) {
            table.querySelectorAll('th, td').forEach(el => el.style.opacity = '1');
            return;
          }

          const matchedCols = new Set();
          ths.forEach((th, idx) => {
            if (idx >= 2 && th.textContent.toLowerCase().includes(query)) {
              matchedCols.add(idx);
            }
          });

          ths.forEach((th, idx) => {
            if (idx >= 2) {
              th.style.opacity = (matchedCols.size > 0 && !matchedCols.has(idx)) ? '0.2' : '1';
            }
          });

          trs.forEach(tr => {
            const tds = tr.querySelectorAll('td');
            tds.forEach((td, idx) => {
              if (idx >= 2) {
                td.style.opacity = (matchedCols.size > 0 && !matchedCols.has(idx)) ? '0.2' : '1';
              }
            });
          });
        });
      }

      const breakStartInput = document.getElementById('customBreakStartTime');
      if (breakStartInput) {
        breakStartInput.addEventListener('change', () => {
          const secs = parseTimeToSeconds(breakStartInput.value);
          if (secs !== null) {
            State.customBreakStartTimeSec = secs;
            showToast(`Jam mulai break disesuaikan ke ${breakStartInput.value} WIB`);
            this.refreshSchedule();
          }
        });
      }

      const copySheetBtn = document.getElementById('copySheetBtn');
      if (copySheetBtn) {
        copySheetBtn.addEventListener('click', () => {
          this.copyScheduleToSheet();
        });
      }

      const resetAllBtn = document.getElementById('resetAllBtn');
      if (resetAllBtn) {
        resetAllBtn.addEventListener('click', () => {
          AuthManager.requireAuth(() => {
            if (confirm('Apakah Anda yakin ingin mereset seluruh break hari ini ke default?')) {
              BreakOverrideManager.resetAll(State.scheduleDate);
              BreakChoiceManager.resetAll(State.scheduleDate);
              BreakStatusManager.resetAll(State.scheduleDate);
              SmartTimingManager.resetConfig('pagi');
              SmartTimingManager.resetConfig('malam');
              delete State.customBreakStartTimeSec;
              const startInput = document.getElementById('customBreakStartTime');
              if (startInput) startInput.value = '08:00';
              showToast('Seluruh jadwal break hari ini berhasil di-reset ke default!', 'info');
              this.refreshSchedule();
            }
          });
        });
      }

      const wrapper = document.getElementById('scheduleTableWrapper');
      if (wrapper) {
        wrapper.addEventListener('click', (e) => {
          const statusBtn = e.target.closest('.status-btn');
          if (statusBtn) {
            const staffId = statusBtn.dataset.staffId;
            const roundNumber = parseInt(statusBtn.dataset.round, 10);
            BreakStatusManager.toggleStatus(State.scheduleDate, staffId, roundNumber);
            this.refreshSchedule();
            return;
          }

          const resetBtn = e.target.closest('.btn-reset-round');
          if (resetBtn) {
            AuthManager.requireAuth(() => {
              const roundNumber = parseInt(resetBtn.dataset.round, 10);
              if (confirm(`Apakah Anda yakin ingin mengembalikan jadwal Break ${roundNumber} ke default?`)) {
                BreakOverrideManager.resetRound(State.scheduleDate, roundNumber);
                BreakChoiceManager.resetRound(State.scheduleDate, roundNumber);
                BreakStatusManager.resetRound(State.scheduleDate, roundNumber);
                this.refreshSchedule();
              }
            });
          }
        });
        const handleTimeInput = (input, setSelfFocus = true) => {
          const staffId = input.dataset.staffId;
          const roundNumber = parseInt(input.dataset.round, 10);
          const type = input.dataset.type;
          const val = input.value.trim();

          if (setSelfFocus && !State.focusTarget) {
            State.focusTarget = {
              staffId: staffId,
              round: roundNumber.toString(),
              type: type
            };
          }

          if (type === 'keluar') {
            BreakOverrideManager.setKeluar(State.scheduleDate, staffId, roundNumber, val);
          } else if (type === 'masuk') {
            BreakOverrideManager.setMasuk(State.scheduleDate, staffId, roundNumber, val);
          }

          this.refreshSchedule();
        };

        wrapper.addEventListener('change', (e) => {
          const select = e.target.closest('.duration-select');
          if (select) {
            const staffId = select.dataset.staffId;
            const roundNumber = parseInt(select.dataset.round, 10);
            const durationSeconds = parseInt(select.value, 10);
            const targetDate = State.scheduleDate;

            // Check if another round currently has durationSeconds for this staff member
            const activeStaff = AttendanceManager.getActiveStaffForDate(targetDate);
            const currentSchedule = BreakCalculator.generateSchedule(activeStaff, targetDate);

            if (currentSchedule) {
              let oldDurationOfTarget = durationSeconds;
              let roundToSwap = null;

              currentSchedule.breaks.forEach(br => {
                const slot = br.slots.find(s => s.staffId === staffId);
                if (slot) {
                  if (br.roundNumber === roundNumber) {
                    oldDurationOfTarget = slot.chosenDuration;
                  } else if (slot.chosenDuration === durationSeconds) {
                    roundToSwap = br.roundNumber;
                  }
                }
              });

              if (roundToSwap) {
                BreakChoiceManager.setChoice(targetDate, staffId, roundToSwap, oldDurationOfTarget);
              }
            }

            BreakChoiceManager.setChoice(targetDate, staffId, roundNumber, durationSeconds);
            this.refreshSchedule();
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

        // Smart Tab Key & Enter Navigation across table inputs
        wrapper.addEventListener('keydown', (e) => {
          const currentInput = e.target.closest('.time-input, .duration-select');
          if (!currentInput) return;

          if (e.key === 'Enter') {
            e.preventDefault();
            currentInput.blur();
            return;
          }

          if (e.key === 'Tab') {
            const allNavigables = Array.from(wrapper.querySelectorAll('.time-input, .duration-select'));
            const currentIndex = allNavigables.indexOf(currentInput);

            if (currentIndex !== -1) {
              const nextIndex = e.shiftKey ? currentIndex - 1 : currentIndex + 1;
              if (nextIndex >= 0 && nextIndex < allNavigables.length) {
                e.preventDefault();
                const nextEl = allNavigables[nextIndex];

                State.focusTarget = {
                  staffId: nextEl.dataset.staffId,
                  round: nextEl.dataset.round,
                  type: nextEl.dataset.type || 'select'
                };

                nextEl.focus();
                if (typeof nextEl.select === 'function') nextEl.select();
              }
            }
          }
        });

        // Instant paste handling with focus preservation
        wrapper.addEventListener('paste', (e) => {
          const input = e.target.closest('.time-input');
          if (input) {
            State.focusTarget = {
              staffId: input.dataset.staffId,
              round: input.dataset.round,
              type: input.dataset.type
            };
            setTimeout(() => {
              handleTimeInput(input, false);
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
      const staffSearchInput = document.getElementById('staffSearchInput');

      if (staffSearchInput) {
        staffSearchInput.addEventListener('input', () => {
          const q = staffSearchInput.value.toLowerCase().trim();
          const items = list.querySelectorAll('.staff-item');
          items.forEach(item => {
            const text = item.querySelector('.staff-name').textContent.toLowerCase();
            item.style.display = (!q || text.includes(q)) ? 'flex' : 'none';
          });

          const sections = list.querySelectorAll('.staff-group-section');
          sections.forEach(sec => {
            const visibleItems = sec.querySelectorAll('.staff-item:not([style*="display: none"])');
            const emptyEl = sec.querySelector('.staff-group-empty');
            if (emptyEl) {
              emptyEl.style.display = (visibleItems.length === 0) ? 'block' : 'none';
            }
          });
        });
      }

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

      // Quick Sort buttons
      const azBtn = document.getElementById('sortAzBtn');
      const zaBtn = document.getElementById('sortZaBtn');
      const defaultBtn = document.getElementById('sortDefaultBtn');
      const presetNightBtn = document.getElementById('presetNightBtn');

      if (presetNightBtn) {
        presetNightBtn.addEventListener('click', () => {
          AuthManager.requireAuth(() => {
            StaffManager.applyNightPreset(['PAT', 'WIL', 'SUN', 'LID', 'WEN']);
            showToast('PAT, WIL, SUN, LID, WEN di-set ke Shift Malam 🌙');
            this.refreshStaff();
            this.refreshSchedule();
          });
        });
      }

      if (azBtn) {
        azBtn.addEventListener('click', () => {
          AuthManager.requireAuth(() => {
            StaffManager.sortAlphabetical(true);
            showToast('Urutan staff diubah (A ke Z) 🔤');
            this.refreshStaff();
            this.refreshSchedule();
          });
        });
      }

      if (zaBtn) {
        zaBtn.addEventListener('click', () => {
          AuthManager.requireAuth(() => {
            StaffManager.sortAlphabetical(false);
            showToast('Urutan staff diubah (Z ke A) 🔠');
            this.refreshStaff();
            this.refreshSchedule();
          });
        });
      }

      if (defaultBtn) {
        defaultBtn.addEventListener('click', () => {
          AuthManager.requireAuth(() => {
            StaffManager.resetOrderToDefault();
            showToast('Urutan staff dikembalikan ke default 🔄');
            this.refreshStaff();
            this.refreshSchedule();
          });
        });
      }

      // Drag and Drop reordering
      let draggedItem = null;

      list.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.staff-item');
        if (!item) return;
        draggedItem = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.id);
      });

      list.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const targetItem = e.target.closest('.staff-item');
        if (targetItem && targetItem !== draggedItem) {
          list.querySelectorAll('.staff-item').forEach(el => el.classList.remove('drag-over'));
          targetItem.classList.add('drag-over');
        }
      });

      list.addEventListener('dragleave', (e) => {
        const targetItem = e.target.closest('.staff-item');
        if (targetItem) targetItem.classList.remove('drag-over');
      });

      list.addEventListener('drop', (e) => {
        e.preventDefault();
        list.querySelectorAll('.staff-item').forEach(el => el.classList.remove('drag-over', 'dragging'));
        const targetItem = e.target.closest('.staff-item');
        if (!draggedItem || !targetItem || draggedItem === targetItem) return;

        AuthManager.requireAuth(() => {
          const items = Array.from(list.querySelectorAll('.staff-item'));
          const draggedIdx = items.indexOf(draggedItem);
          const targetIdx = items.indexOf(targetItem);

          if (draggedIdx !== -1 && targetIdx !== -1) {
            items.splice(draggedIdx, 1);
            items.splice(targetIdx, 0, draggedItem);

            const newIdOrder = items.map(el => el.dataset.id);
            StaffManager.reorderByIds(newIdOrder);
            showToast('Urutan staff berhasil diperbarui!');
            this.refreshStaff();
            this.refreshSchedule();
          }
        });
      });

      list.addEventListener('dragend', () => {
        list.querySelectorAll('.staff-item').forEach(el => el.classList.remove('drag-over', 'dragging'));
        draggedItem = null;
      });

      // Staff list actions (event delegation)
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const id = btn.dataset.id;

        AuthManager.requireAuth(() => {
          switch (action) {
            case 'set-status':
              {
                const targetStatus = btn.dataset.status;
                const activeDate = State.scheduleDate || new Date();
                AttendanceManager.setStatus(id, activeDate, targetStatus);
                const staffObj = StaffManager.getById(id);
                const statusLabel = targetStatus === 'masuk' ? 'Hadir' : (targetStatus === 'libur' ? 'Libur' : 'Cuti');
                showToast(`Status ${staffObj ? staffObj.name : ''} diubah ke ${statusLabel}`);
                this.refreshStaff();
                this.refreshSchedule();
              }
              break;
            case 'set-shift':
              {
                const targetShift = btn.dataset.shift;
                StaffManager.setShift(id, targetShift);
                const staffObj = StaffManager.getById(id);
                showToast(`Shift ${staffObj ? staffObj.name : ''} diubah ke ${targetShift === 'malam' ? 'Malam' : 'Pagi'}`);
                this.refreshStaff();
                this.refreshSchedule();
              }
              break;
            case 'toggle-shift':
              {
                const newShift = StaffManager.toggleShift(id);
                showToast(`Shift diubah ke ${newShift === 'malam' ? 'Malam' : 'Pagi'}`);
                this.refreshStaff();
                this.refreshSchedule();
              }
              break;
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
      const attendanceSearchInput = document.getElementById('attendanceSearchInput');

      if (attendanceSearchInput) {
        attendanceSearchInput.addEventListener('input', () => {
          const q = attendanceSearchInput.value.toLowerCase().trim();
          const table = document.querySelector('#attendanceTableWrapper table');
          if (!table) return;
          const trs = table.querySelectorAll('tbody tr');
          trs.forEach(tr => {
            const staffNameTd = tr.querySelector('.staff-name-col');
            if (staffNameTd) {
              const text = staffNameTd.textContent.toLowerCase();
              tr.style.display = (!q || text.includes(q)) ? '' : 'none';
            }
          });
        });
      }

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
      document.addEventListener('click', (e) => {
        const staffTh = e.target.closest('.clickable-staff');
        if (staffTh) {
          const staffId = staffTh.dataset.staffId;
          State.activeCauseStaffId = (State.activeCauseStaffId === staffId) ? null : staffId;
          this.refreshSchedule();
        }
      });

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

      // Duration tooltip on MASUK input hover
      let _durTooltip = document.getElementById('masuk-dur-tooltip');
      if (!_durTooltip) {
        _durTooltip = document.createElement('div');
        _durTooltip.id = 'masuk-dur-tooltip';
        document.body.appendChild(_durTooltip);
      }

      document.addEventListener('mouseover', (e) => {
        const input = e.target.closest('.masuk-input');
        if (!input) return;
        const td = input.closest('.masuk-cell');
        const dur = td ? td.getAttribute('data-duration') : null;
        if (!dur) return;

        _durTooltip.textContent = dur;
        _durTooltip.classList.add('show');

        const rect = input.getBoundingClientRect();
        const ttRect = _durTooltip.getBoundingClientRect();
        _durTooltip.style.left = (rect.left + rect.width / 2 - ttRect.width / 2 + window.scrollX) + 'px';
        _durTooltip.style.top = (rect.top - ttRect.height - 8 + window.scrollY) + 'px';
      });

      document.addEventListener('mouseout', (e) => {
        if (e.target.closest('.masuk-input')) {
          _durTooltip.classList.remove('show');
        }
      });
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
    },

  };

  /* ============================================
     Initialize on DOM Ready
     ============================================ */
  document.addEventListener('DOMContentLoaded', () => App.init());

})();
