// ==================== AUTH CHECK ====================
const TOKEN_KEY = 'ppp-token';
const USER_KEY = 'ppp-user';
const NOTIFICATION_ENABLED_KEY = 'ppp-notifications-enabled';

// XSS protection - escape HTML entities
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function getToken() {
  return '';
}

function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isAuthenticated() {
  return Boolean(getUser());
}

if (!isAuthenticated()) {
  window.location.href = '/';
}

let usersCache = [];
let currentSort = { col: 'index', dir: 'asc' };
let activeRecordDetailId = null;

function normalizeStatus(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'เข้า' || raw === 'in' || raw === 'entry') return 'in';
  if (raw === 'ออก' || raw === 'out' || raw === 'exit') return 'out';
  return null;
}

function getStatusClass(value) {
  const normalized = normalizeStatus(value);
  if (normalized === 'in') return 'status-in';
  if (normalized === 'out') return 'status-out';
  return '';
}

function getLocalizedStatus(value) {
  const normalized = normalizeStatus(value);
  if (normalized === 'in') return t('status_in');
  if (normalized === 'out') return t('status_out');
  return String(value || '');
}

function refreshOpenRecordDetailLanguage() {
  const modal = document.getElementById('recordDetailModal');
  if (!modal || !modal.classList.contains('active') || !activeRecordDetailId) return;
  openRecordDetail(activeRecordDetailId);
}

function handleLogout() {
  document.getElementById('logoutModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLogoutModal() {
  document.getElementById('logoutModal').classList.remove('active');
  document.body.style.overflow = '';
}

async function confirmLogout() {
  try {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
  } catch (_) {}
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  window.location.href = '/';
}

let editProfilePhotoBlob = null;

async function openProfileModal() {
  // Fetch latest profile from server
  try {
    const res = await fetch('/api/v1/auth/me', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const data = await res.json();
    if (data.success && data.data) {
      const serverUser = data.data;
      const stored = getUser() || {};
      const merged = { ...stored, ...serverUser };
      localStorage.setItem(USER_KEY, JSON.stringify(merged));
    }
  } catch (_) {}

  const user = getUser();
  if (user) {
    const name = user.displayName || user.firstName || user.username || 'User';
    const initial = name[0].toUpperCase();
    document.getElementById('profileAvatar').textContent = initial;
    document.getElementById('profileName').textContent = name;
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.displayName || user.username || '-';
    document.getElementById('profileFullName').textContent = fullName;
    document.getElementById('profileEmail').textContent = user.email || '-';
    document.getElementById('profileRole').textContent = user.role === 'admin' ? 'Admin' : 'User';
    // Show profile photo if available
    const photoEl = document.getElementById('profilePhoto');
    const avatarEl = document.getElementById('profileAvatar');
    const photoUrl = user.photoUrl || localStorage.getItem('ppp-profile-photo-' + user.username);
    if (photoUrl && photoEl) {
      photoEl.src = photoUrl;
      photoEl.style.display = 'block';
      if (avatarEl) avatarEl.style.display = 'none';
    } else {
      if (photoEl) photoEl.style.display = 'none';
      if (avatarEl) avatarEl.style.display = 'flex';
    }
  }
  document.getElementById('profileModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function viewProfilePhoto() {
  const photoEl = document.getElementById('profilePhoto');
  if (photoEl && photoEl.src && photoEl.src !== window.location.href && photoEl.style.display !== 'none') {
    const lightboxImg = document.getElementById('lightboxImg');
    const lightbox = document.getElementById('lightbox');
    lightboxImg.src = photoEl.src;
    lightbox.classList.add('active');
  } else {
    showToast(t('no_profile_photo') || 'ยังไม่มีรูปโปรไฟล์', 'info');
  }
}

function openEditOwnProfile() {
  const user = getUser();
  if (!user) return;
  editProfilePhotoBlob = null;

  // Fill form with current data
  document.getElementById('editProfileFirstName').value = user.firstName || '';
  document.getElementById('editProfileLastName').value = user.lastName || '';
  document.getElementById('editProfileEmailDisplay').value = user.email || '';

  // Show current photo
  const photoUrl = user.photoUrl || localStorage.getItem('ppp-profile-photo-' + user.username);
  const imgEl = document.getElementById('editProfilePhotoImg');
  const initialEl = document.getElementById('editProfilePhotoInitial');
  if (photoUrl) {
    imgEl.src = photoUrl;
    imgEl.style.display = 'block';
    initialEl.style.display = 'none';
  } else {
    imgEl.style.display = 'none';
    initialEl.style.display = 'flex';
  }

  document.getElementById('editProfileModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeEditProfileModal() {
  document.getElementById('editProfileModal').classList.remove('active');
  document.body.style.overflow = '';
  editProfilePhotoBlob = null;
}

let editProfileCropMode = false;

function handleEditProfilePhotoSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    // Open crop modal
    editProfileCropMode = true;
    const cropImg = document.getElementById('cropImage');
    cropImg.src = e.target.result;
    document.getElementById('cropModal').classList.add('active');
    if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
    setTimeout(() => {
      cropperInstance = new Cropper(cropImg, {
        aspectRatio: 1,
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 0.9,
        cropBoxResizable: true,
        background: false,
      });
    }, 100);
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

async function handleEditProfileSubmit(event) {
  event.preventDefault();
  const btn = document.getElementById('editProfileSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const firstName = document.getElementById('editProfileFirstName').value.trim();
  const lastName = document.getElementById('editProfileLastName').value.trim();

  try {
    // Update profile info
    const res = await fetch('/api/v1/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify({ firstName, lastName, displayName: firstName })
    });
    const data = await res.json();

    // Upload photo if changed
    if (editProfilePhotoBlob) {
      const fd = new FormData();
      fd.append('photo', editProfilePhotoBlob, 'profile.jpg');
      try {
        const photoRes = await fetch('/api/v1/auth/profile/photo', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getToken()}` },
          body: fd
        });
        const photoData = await photoRes.json();
        if (photoData.success && photoData.data?.photoUrl) {
          const stored = getUser() || {};
          stored.photoUrl = photoData.data.photoUrl;
          localStorage.setItem(USER_KEY, JSON.stringify(stored));
        }
      } catch (_) {}
    }

    if (data.success) {
      // Update localStorage with latest data
      const stored = getUser() || {};
      const merged = { ...stored, ...data.data };
      localStorage.setItem(USER_KEY, JSON.stringify(merged));
      showToast(t('profile_updated') || 'Profile updated successfully', 'success');
      closeEditProfileModal();
      // Refresh profile modal & topbar
      setupUser();
      openProfileModal();
    } else {
      showToast(data.message || 'Failed to update', 'error');
    }
  } catch (err) {
    showToast('Failed to update profile', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = t('save') || 'Save';
  }
}

function closeProfileModal() {
  document.getElementById('profileModal').classList.remove('active');
  document.body.style.overflow = '';
}

function closeModal(event, modalId) {
  if (event.target === event.currentTarget) {
    document.getElementById(modalId).classList.remove('active');
    document.body.style.overflow = '';
  }
}

// ==================== STATE ====================
let allRecords = [];
let dailyChart = null;
let hourlyChart = null;
let searchQuery = '';
let notificationsEnabled = localStorage.getItem(NOTIFICATION_ENABLED_KEY) !== '0';
let notificationUnreadCount = 0;
let notificationAudioContext = null;
let notificationItems = [];
let languageToggleLocked = false;
let selectedRealtimeIds = new Set();
let selectedRecordIds = new Set();
let editingPlateRecordId = null;
let savingPlateRecordId = null;

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  applyTranslations();
  setupUser();
  setupAdminUI();
  updateNotificationUI();
  loadStats();
  loadRecords();
  connectSSE();
  updateSettingsPage();
  setInterval(loadStats, 60000);
});

function updateNotificationUI() {
  const bell = document.getElementById('notificationBell');
  const badge = document.getElementById('notificationBellBadge');
  const toggle = document.getElementById('notificationsToggleSwitch');
  const desc = document.getElementById('settingNotificationValue');

  if (toggle) {
    toggle.classList.toggle('active', notificationsEnabled);
  }

  if (desc) {
    const key = notificationsEnabled ? 'notifications_on' : 'notifications_off';
    desc.setAttribute('data-i18n', key);
    desc.textContent = t(key);
  }

  if (bell) {
    bell.classList.toggle('muted', !notificationsEnabled);
  }

  if (badge) {
    if (notificationUnreadCount > 0) {
      badge.style.display = 'inline-flex';
      badge.textContent = notificationUnreadCount > 99 ? '99+' : String(notificationUnreadCount);
    } else {
      badge.style.display = 'none';
      badge.textContent = '0';
    }
  }
}

function toggleNotifications() {
  notificationsEnabled = !notificationsEnabled;
  localStorage.setItem(NOTIFICATION_ENABLED_KEY, notificationsEnabled ? '1' : '0');
  if (!notificationsEnabled) {
    notificationUnreadCount = 0;
  } else if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }

  updateNotificationUI();
  showToast(t(notificationsEnabled ? 'notifications_enabled' : 'notifications_disabled'), 'info');
}

function openNotificationsCenter() {
  notificationUnreadCount = 0;
  updateNotificationUI();
  renderNotificationsList();
  const modal = document.getElementById('notificationModal');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeNotificationsModal() {
  const modal = document.getElementById('notificationModal');
  if (!modal) return;
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

function goToRealtimeFromNotifications() {
  closeNotificationsModal();
  switchPage('realtime', document.querySelector('[data-page=realtime]'));
}

function renderNotificationsList() {
  const list = document.getElementById('notificationList');
  if (!list) return;

  if (!notificationItems.length) {
    list.innerHTML = `<div class="notification-empty">${escapeHtml(t('no_notifications'))}</div>`;
    return;
  }

  list.innerHTML = notificationItems.map((item) => {
    const title = escapeHtml(item.title || t('new_data'));
    const body = escapeHtml(item.body || '-');
    const time = escapeHtml(item.time || '-');
    return `
      <div class="notification-item">
        <div class="notification-item-head">
          <span class="notification-item-title">${title}</span>
          <span class="notification-item-time">${time}</span>
        </div>
        <div class="notification-item-body">${body}</div>
      </div>`;
  }).join('');
}

function playNotificationSound() {
  if (!notificationsEnabled) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  try {
    if (!notificationAudioContext) {
      notificationAudioContext = new AudioCtx();
    }
    if (notificationAudioContext.state === 'suspended') {
      notificationAudioContext.resume().catch(() => {});
    }

    const osc = notificationAudioContext.createOscillator();
    const gain = notificationAudioContext.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, notificationAudioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, notificationAudioContext.currentTime + 0.16);

    gain.gain.setValueAtTime(0.0001, notificationAudioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.09, notificationAudioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, notificationAudioContext.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(notificationAudioContext.destination);
    osc.start();
    osc.stop(notificationAudioContext.currentTime + 0.22);
  } catch (_) {
    // Ignore autoplay/audio-context errors in restricted browsers.
  }
}

function triggerRealtimeNotification(record) {
  if (!notificationsEnabled) return;

  const payload = record?.payload || {};
  const plate = payload.licensePlate || payload.license_plate || '';
  const driver = payload.driverName || payload.driver_name || payload.driver || '';
  const locale = currentLang === 'th' ? 'th-TH' : 'en-US';
  const time = new Date().toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  notificationItems.unshift({
    title: t('new_data'),
    body: [plate, driver].filter(Boolean).join(' · ') || t('nav_realtime'),
    time
  });
  if (notificationItems.length > 40) {
    notificationItems.length = 40;
  }

  notificationUnreadCount += 1;
  updateNotificationUI();
  renderNotificationsList();

  const bell = document.getElementById('notificationBell');
  if (bell) {
    bell.classList.remove('ring');
    void bell.offsetWidth;
    bell.classList.add('ring');
  }

  playNotificationSound();
  showToast(t('new_data'), 'info');

  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    const bodyText = plate ? plate : t('new_data');
    try {
      new Notification(t('nav_realtime'), { body: bodyText, silent: true });
    } catch (_) {
      // Ignore notification construction errors.
    }
  }
}

function setupUser() {
  const user = getUser();
  if (user) {
    const name = user.displayName || user.firstName || user.username || 'User';
    const initial = name[0].toUpperCase();

    const topbarAvatar = document.getElementById('topbarAvatar');
    const topbarName = document.getElementById('topbarUserName');
    const topbarAvatarImg = document.getElementById('topbarAvatarImg');
    if (topbarName) topbarName.textContent = name;

    const photoUrl = user.photoUrl || localStorage.getItem('ppp-profile-photo-' + user.username);
    if (photoUrl && topbarAvatarImg) {
      topbarAvatarImg.src = photoUrl;
      topbarAvatarImg.style.display = 'block';
      if (topbarAvatar) topbarAvatar.childNodes[0].textContent = '';
    } else {
      if (topbarAvatarImg) topbarAvatarImg.style.display = 'none';
      if (topbarAvatar) topbarAvatar.childNodes[0].textContent = initial;
    }
  }

  updatePageSubtitle();
  updateLastUpdatedTime();
}

function updatePageSubtitle() {
  const now = new Date();
  const options = { weekday: 'long', month: 'long', day: 'numeric' };
  const locale = currentLang === 'th' ? 'th-TH' : 'en-US';
  const prefix = currentLang === 'th' ? 'ภาพรวม · ' : 'Overview · ';
  const text = prefix + now.toLocaleDateString(locale, options);
  document.querySelectorAll('.page-subtitle').forEach(el => {
    el.textContent = text;
  });
}

function updateLastUpdatedTime() {
  const el = document.getElementById('lastUpdatedTime');
  if (el) {
    el.textContent = new Date().toLocaleTimeString(currentLang === 'th' ? 'th-TH' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}

// ==================== SIDEBAR & NAVIGATION ====================
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function collapseSidebar() {
  const sidebar = document.getElementById('sidebar');
  const isCollapsed = sidebar.classList.toggle('collapsed');
  localStorage.setItem('sidebar-collapsed', isCollapsed ? '1' : '0');
}

// Restore sidebar collapsed state on load
(function restoreSidebarState() {
  if (window.innerWidth > 768 && localStorage.getItem('sidebar-collapsed') === '1') {
    document.getElementById('sidebar').classList.add('collapsed');
  }
})();

function switchPage(page, navEl) {
  // Update nav active
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  if (navEl) navEl.classList.add('active');

  // Switch page
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');

  // Update subtitle
  updatePageSubtitle();

  // Refresh specific page data
  if (page === 'gallery') renderGallery();
  if (page === 'overview') refreshCharts();
  if (page === 'settings') updateSettingsPage();
  if (page === 'users') loadUsers();
}

function updateSettingsPage() {
  const themeVal = document.getElementById('settingThemeValue');
  const langVal = document.getElementById('settingLangValue');
  const themeToggle = document.getElementById('themeToggleSwitch');
  const languageToggle = document.getElementById('languageToggleSwitch');
  const notificationToggle = document.getElementById('notificationsToggleSwitch');
  const notificationValue = document.getElementById('settingNotificationValue');
  if (themeVal) themeVal.textContent = getTheme() === 'dark' ? 'Dark' : 'Light';
  if (langVal) langVal.textContent = currentLang === 'th' ? 'ไทย' : 'English';
  if (themeToggle) {
    if (getTheme() === 'dark') {
      themeToggle.classList.add('active');
    } else {
      themeToggle.classList.remove('active');
    }
  }
  if (languageToggle) {
    languageToggle.classList.toggle('active', currentLang === 'en');
  }
  if (notificationToggle) {
    notificationToggle.classList.toggle('active', notificationsEnabled);
  }
  if (notificationValue) {
    notificationValue.textContent = t(notificationsEnabled ? 'notifications_on' : 'notifications_off');
  }
  updateNotificationUI();

  // Update settings profile banner
  const user = getUser();
  if (user) {
    const name = user.displayName || user.firstName || user.username || 'User';
    const initial = name[0].toUpperCase();
    const email = user.email || '';
    const role = user.role || 'user';

    const nameEl = document.getElementById('settingsProfileName');
    const emailEl = document.getElementById('settingsProfileEmail');
    const roleEl = document.getElementById('settingsProfileRole');
    const avatarInitial = document.getElementById('settingsAvatarInitial');
    const avatarImg = document.getElementById('settingsAvatarImg');

    if (nameEl) nameEl.textContent = name;
    if (emailEl) emailEl.textContent = email;
    if (roleEl) roleEl.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    if (avatarInitial) avatarInitial.textContent = initial;

    const photoUrl = user.photoUrl || localStorage.getItem('ppp-profile-photo-' + user.username);
    if (photoUrl && avatarImg) {
      avatarImg.src = photoUrl;
      avatarImg.style.display = 'block';
      if (avatarInitial) avatarInitial.textContent = '';
    } else if (avatarImg) {
      avatarImg.style.display = 'none';
    }
  }
}

function toggleLanguageSetting() {
  if (languageToggleLocked) return;
  languageToggleLocked = true;
  toggleLanguage();
  updateSettingsPage();
  window.setTimeout(() => {
    languageToggleLocked = false;
  }, 220);
}

function openChangePasswordModal() {
  document.getElementById('changePwCurrent').value = '';
  document.getElementById('changePwNew').value = '';
  document.getElementById('changePwConfirm').value = '';
  document.getElementById('changePwModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeChangePwModal() {
  document.getElementById('changePwModal').classList.remove('active');
  document.body.style.overflow = '';
}

async function handleChangePassword(event) {
  event.preventDefault();
  const currentPassword = document.getElementById('changePwCurrent').value;
  const newPassword = document.getElementById('changePwNew').value;
  const confirmPassword = document.getElementById('changePwConfirm').value;

  if (newPassword !== confirmPassword) {
    return showToast(currentLang === 'th' ? 'รหัสผ่านใหม่ไม่ตรงกัน' : 'New passwords do not match', 'error');
  }

  try {
    const res = await fetch('/api/v1/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || (currentLang === 'th' ? 'เปลี่ยนรหัสผ่านสำเร็จ' : 'Password changed successfully'), 'success');
      closeChangePwModal();
    } else {
      showToast(data.message || (currentLang === 'th' ? 'เปลี่ยนรหัสผ่านไม่สำเร็จ' : 'Failed to change password'), 'error');
    }
  } catch (err) {
    showToast(currentLang === 'th' ? 'เปลี่ยนรหัสผ่านไม่สำเร็จ' : 'Failed to change password', 'error');
  }
}

// ==================== STATS & CHARTS ====================
async function loadStats() {
  try {
    const res = await fetch('/api/v1/stats', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const result = await res.json();
    if (!result.success) return;

    const data = result.data;
    animateCounter('statTotal', data.totalRecords);
    animateCounter('statToday', data.todayRecords);
    animateCounter('statPhotos', data.withPhotos);
    animateCounter('statConnections', data.activeConnections);
    animateCounter('statReceived', data.totalDataReceived ?? data.totalRecords);

    const infoStorage = document.getElementById('infoStorage');
    if (infoStorage) infoStorage.textContent = data.storageType;
    const infoConnections = document.getElementById('infoConnections');
    if (infoConnections) infoConnections.textContent = data.activeConnections;

    // System overview cards on dashboard
    const sysStorage = document.getElementById('sysStorage');
    if (sysStorage) sysStorage.textContent = data.storageType || '-';
    const sysConnections = document.getElementById('sysConnections');
    if (sysConnections) sysConnections.textContent = data.activeConnections;
    const sysPhotos = document.getElementById('sysPhotos');
    if (sysPhotos) sysPhotos.textContent = data.withPhotos;

    updateLastUpdatedTime();

    renderDailyChart(data.dailyStats);
    renderHourlyChart(data.hourlyStats);

    const hourlyTotal = document.getElementById('chartHourlyTotal');
    if (hourlyTotal && data.hourlyStats) {
      hourlyTotal.textContent = data.hourlyStats.reduce((a, b) => a + b, 0);
    }

    // Render recent activity from records
    renderRecentActivity();
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

function animateCounter(elementId, targetValue) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const duration = 800;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(start + (targetValue - start) * eased);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function getChartColors() {
  const isDark = getTheme() === 'dark';
  return {
    grid: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    text: isDark ? '#8b8fa8' : '#7b7f95',
    gradient1Start: isDark ? 'rgba(106, 179, 68, 0.35)' : 'rgba(46, 166, 66, 0.25)',
    gradient1End: isDark ? 'rgba(106, 179, 68, 0.02)' : 'rgba(46, 166, 66, 0.02)',
    line1: isDark ? '#6ab344' : '#2ea642',
    bar: isDark ? '#6ab344' : '#2ea642',
    barHover: isDark ? '#8dc96f' : '#6ab344',
  };
}

function renderDailyChart(dailyStats) {
  const ctx = document.getElementById('dailyChart');
  if (!ctx) return;

  const labels = Object.keys(dailyStats).map(d => {
    const date = new Date(d + 'T00:00:00');
    return date.toLocaleDateString(currentLang === 'th' ? 'th-TH' : 'en-US', { weekday: 'short', day: 'numeric' });
  });
  const values = Object.values(dailyStats);
  const colors = getChartColors();

  if (dailyChart) dailyChart.destroy();

  const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 250);
  gradient.addColorStop(0, colors.gradient1Start);
  gradient.addColorStop(1, colors.gradient1End);

  dailyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: t('stat_total'),
        data: values,
        borderColor: colors.line1,
        backgroundColor: gradient,
        fill: true,
        tension: 0.4,
        borderWidth: 2.5,
        pointBackgroundColor: colors.line1,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          titleFont: { family: 'Poppins' },
          bodyFont: { family: 'Poppins' },
          padding: 12,
          cornerRadius: 8,
        }
      },
      scales: {
        x: {
          grid: { color: colors.grid },
          ticks: { color: colors.text, font: { size: 11 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: colors.grid },
          ticks: { color: colors.text, font: { size: 11 }, stepSize: 1 }
        }
      },
      interaction: { intersect: false, mode: 'index' }
    }
  });
}

function renderHourlyChart(hourlyStats) {
  const ctx = document.getElementById('hourlyChart');
  if (!ctx) return;

  const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  const colors = getChartColors();

  if (hourlyChart) hourlyChart.destroy();

  hourlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: t('stat_total'),
        data: hourlyStats,
        backgroundColor: colors.bar,
        hoverBackgroundColor: colors.barHover,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          titleFont: { family: 'Poppins' },
          bodyFont: { family: 'Poppins' },
          padding: 12,
          cornerRadius: 8,
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: colors.text,
            font: { size: 10 },
            maxRotation: 0,
            callback: function(val, index) {
              return index % 3 === 0 ? this.getLabelForValue(val) : '';
            }
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: colors.grid },
          ticks: { color: colors.text, font: { size: 11 }, stepSize: 1 }
        }
      }
    }
  });
}

function refreshCharts() {
  loadStats();
}

// ==================== RECORDS ====================
async function loadRecords() {
  try {
    const res = await fetch('/api/v1/android/data', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const result = await res.json();
    if (result.success) {
      allRecords = result.data || [];
      renderRecords();
      renderGallery();
    }
  } catch (err) {
    console.error('Failed to load records:', err);
  }
}

function refreshData() {
  const btn = document.querySelector('.refresh-btn');
  if (btn) btn.classList.add('spinning');
  loadRecords();
  loadStats().then(() => {
    if (btn) btn.classList.remove('spinning');
  }).catch(() => {
    if (btn) btn.classList.remove('spinning');
  });
  updateLastUpdatedTime();
  showToast(t('refresh') + ' ✓', 'success');
}

function renderRecords() {
  const container = document.getElementById('recordsList');
  const countEl = document.getElementById('recordCount');
  if (!container) return;

  let filtered = allRecords;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = allRecords.filter(r => {
      const text = JSON.stringify(r).toLowerCase();
      return text.includes(q);
    });
  }

  countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <p>${t('no_records')}</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map((record, index) => {
    const p = record.payload || {};
    const photoUrl = p.photoUrl;
    const safePhotoUrl = photoUrl ? escapeHtml(photoUrl) : '';
    const locale = currentLang === 'th' ? 'th-TH' : 'en-US';
    const time = record.receivedAt ? new Date(record.receivedAt).toLocaleString(locale, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', year: 'numeric' }) : '-';
    const safeTime = escapeHtml(time);
    const safeId = escapeHtml(String(record.id));
    const plate = escapeHtml(p.licensePlate || p.license_plate || '');
    const driver = escapeHtml(p.driverName || p.driver_name || p.driver || '');
    const vehicle = escapeHtml(p.vehicleType || p.vehicle_type || '');
    const province = escapeHtml(p.province || '');
    const weight = escapeHtml(p.weight || '');
    const destination = escapeHtml(p.destination || '');
    const status = p.status || '';
    const safeStatus = escapeHtml(getLocalizedStatus(status));
    const statusClass = getStatusClass(status);
    const isSelected = selectedRecordIds.has(String(record.id));

    return `
      <div class="record-card${isSelected ? ' selected' : ''}" data-record-id="${safeId}" style="animation-delay: ${Math.min(index * 0.05, 0.5)}s">
        <label class="record-card-select" onclick="event.stopPropagation()">
          <input type="checkbox" data-record-id="${safeId}" ${isSelected ? 'checked' : ''} onchange="toggleRecordSelection(this.dataset.recordId, this.checked)" />
        </label>
        <div class="record-card-main" onclick="openRecordDetail('${safeId}')">
          ${safePhotoUrl ? `<div class="record-thumb"><img src="${safePhotoUrl}" alt="" loading="lazy" /></div>` : `<div class="record-thumb record-thumb-empty"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`}
          <div class="record-card-body">
            <div class="record-card-top">
              <div class="record-card-title">${plate || '#' + safeId}</div>
              ${safeStatus ? `<span class="record-badge ${statusClass}">${safeStatus}</span>` : ''}
            </div>
            <div class="record-card-meta">
              ${driver ? `<span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${driver}</span>` : ''}
              ${vehicle ? `<span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> ${vehicle}</span>` : ''}
              ${province ? `<span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${province}</span>` : ''}
              ${weight ? `<span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0-6 6c0 6 6 12 6 12s6-6 6-12a6 6 0 0 0-6-6z"/></svg> ${weight}</span>` : ''}
            </div>
            <div class="record-card-bottom">
              <span class="record-card-time"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${safeTime}</span>
              ${destination ? `<span class="record-card-dest">${destination}</span>` : ''}
            </div>
          </div>
          <div class="record-card-arrow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
      </div>`;
  }).join('');

  updateRecordSelectionUI();
}

function updateRecordSelectionUI() {
  const container = document.getElementById('recordsList');
  const deleteBtn = document.getElementById('btnDeleteRecordsSelected');
  const selectAll = document.getElementById('recordsSelectAll');
  if (!container) return;

  const items = Array.from(container.querySelectorAll('.record-card[data-record-id]'));
  const itemCount = items.length;
  const selectedCount = items.filter(el => selectedRecordIds.has(String(el.dataset.recordId))).length;

  if (deleteBtn) deleteBtn.disabled = selectedCount === 0;

  if (selectAll) {
    selectAll.checked = itemCount > 0 && selectedCount === itemCount;
    selectAll.indeterminate = selectedCount > 0 && selectedCount < itemCount;
  }
}

function toggleRecordSelection(id, checked) {
  const safeId = String(id);
  if (checked) {
    selectedRecordIds.add(safeId);
  } else {
    selectedRecordIds.delete(safeId);
  }
  const card = document.querySelector(`.record-card[data-record-id="${CSS.escape(safeId)}"]`);
  if (card) card.classList.toggle('selected', checked);
  updateRecordSelectionUI();
}

function toggleRecordSelectAll(checked) {
  const container = document.getElementById('recordsList');
  if (!container) return;
  const inputs = container.querySelectorAll('.record-card-select input[type="checkbox"]');
  inputs.forEach(input => {
    input.checked = checked;
    const id = input.getAttribute('data-record-id');
    if (!id) return;
    if (checked) {
      selectedRecordIds.add(String(id));
    } else {
      selectedRecordIds.delete(String(id));
    }
    const card = input.closest('.record-card');
    if (card) card.classList.toggle('selected', checked);
  });
  updateRecordSelectionUI();
}

async function deleteSelectedRecords() {
  const ids = Array.from(selectedRecordIds);
  if (ids.length === 0) return;
  if (!window.confirm(t('delete_selected_confirm'))) return;

  let failCount = 0;
  for (const id of ids) {
    try {
      const res = await fetch(`/api/v1/android/data/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const result = await res.json();
      if (!result.success) { failCount += 1; continue; }
      allRecords = allRecords.filter(r => String(r.id) !== String(id));
      selectedRecordIds.delete(String(id));
    } catch (_) {
      failCount += 1;
    }
  }

  renderRecords();
  renderGallery();
  renderRecentActivity();
  loadStats();

  if (failCount > 0) {
    showToast(`${t('delete_selected_failed')} (${failCount})`, 'error');
  } else {
    showToast(t('deleted'), 'success');
  }
}

function formatPayload(payload) {
  const clean = { ...payload };
  delete clean.photoUrl;
  delete clean.photoOriginalName;

  const entries = Object.entries(clean);
  if (entries.length === 0) return '(no data)';

  return entries.map(([key, value]) => {
    const label = escapeHtml(t(key) !== key ? t(key) : key);
    const safeValue = escapeHtml(typeof value === 'object' ? JSON.stringify(value) : value);
    return `${label}: ${safeValue}`;
  }).join('\n');
}

let pendingDeleteId = null;

function deleteRecord(id) {
  pendingDeleteId = id;
  document.getElementById('deleteModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('active');
  document.body.style.overflow = '';
  pendingDeleteId = null;
}

async function confirmDelete() {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  closeDeleteModal();

  try {
    const res = await fetch(`/api/v1/android/data/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const result = await res.json();
    if (result.success) {
      allRecords = allRecords.filter(r => String(r.id) !== String(id));
      removeRealtimeItemById(id);
      renderRecords();
      renderGallery();
      loadStats();
      showToast(t('deleted'), 'success');
    } else {
      showToast(t('delete_failed'), 'error');
    }
  } catch (err) {
    showToast(t('delete_failed'), 'error');
  }
}

function handleSearch(query) {
  searchQuery = query;
  renderRecords();
}

function getRecordPlateValue(payload) {
  return String(payload?.licensePlate || payload?.license_plate || '').trim();
}

function updateRecordPlateInCache(updatedRecord) {
  allRecords = allRecords.map((record) => String(record.id) === String(updatedRecord.id) ? updatedRecord : record);
}

function updateRealtimeItem(record) {
  const item = document.querySelector(`.realtime-item[data-record-id="${CSS.escape(String(record.id))}"]`);
  if (!item) return;

  const plateEl = item.querySelector('.realtime-item-plate');
  if (plateEl) {
    plateEl.textContent = getRecordPlateValue(record.payload) || `#${record.id}`;
  }
}

function startEditPlateNumber(id) {
  const input = document.getElementById('editPlateNumberInput');
  if (input) { input.focus(); input.select(); }
}

function cancelEditPlateNumber() {
  editingPlateRecordId = null;
  savingPlateRecordId = null;
  closeRecordDetail();
}

async function savePlateNumber(id) {
  const input = document.getElementById('editPlateNumberInput');
  const plateNumber = input ? input.value.trim() : '';

  if (!plateNumber) {
    showToast(t('plate_number_required'), 'error');
    if (input) input.focus();
    return;
  }

  const saveBtn = document.getElementById('savePlateBtn');
  if (saveBtn) saveBtn.disabled = true;
  savingPlateRecordId = String(id);

  try {
    const res = await fetch(`/api/v1/android/data/${id}/plate-number`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ plateNumber })
    });
    const result = await res.json();

    if (!result.success || !result.data) {
      showToast(result.message || t('update_plate_failed'), 'error');
      savingPlateRecordId = null;
      if (saveBtn) saveBtn.disabled = false;
      return;
    }

    updateRecordPlateInCache(result.data);
    updateRealtimeItem(result.data);
    editingPlateRecordId = null;
    savingPlateRecordId = null;
    renderRecords();
    renderGallery();
    renderRecentActivity();

    const card = document.getElementById('plateFieldCard');
    const safeId = escapeHtml(String(id));
    const newPlate = getRecordPlateValue(result.data.payload || {});
    if (card) {
      card.innerHTML = `
        <div class="detail-field-header">
          <span class="detail-label">${escapeHtml(t('plate_number'))}</span>
          <div class="detail-inline-actions">
            <button class="btn btn-sm btn-outline" onclick="cancelEditPlateNumber()">${escapeHtml(t('cancel'))}</button>
            <button class="btn btn-sm btn-primary" id="savePlateBtn" onclick="savePlateNumber('${safeId}')">${escapeHtml(t('save'))}</button>
          </div>
        </div>
        <input id="editPlateNumberInput" class="detail-input" type="text" maxlength="100" value="${escapeHtml(newPlate)}" onkeydown="if (event.key === 'Enter') { event.preventDefault(); savePlateNumber('${safeId}'); }" />`;
    }
    showToast(t('plate_number_updated'), 'success');
  } catch (_error) {
    savingPlateRecordId = null;
    if (saveBtn) saveBtn.disabled = false;
    showToast(t('update_plate_failed'), 'error');
  }
}

// ==================== RECENT ACTIVITY ====================
function renderRecentActivity() {
  const container = document.getElementById('recentActivityList');
  if (!container) return;
  const recent = allRecords.slice(0, 5);
  if (recent.length === 0) return;

  container.innerHTML = recent.map((r, idx) => {
    const p = r.payload || {};
    const photoUrl = p.photoUrl;
    const safePhoto = photoUrl ? escapeHtml(photoUrl) : '';
    const plate = escapeHtml(p.licensePlate || p.license_plate || '');
    const driver = escapeHtml(p.driverName || p.driver_name || p.driver || '');
    const vehicle = escapeHtml(p.vehicleType || p.vehicle_type || '');
    const province = escapeHtml(p.province || '');
    const status = p.status || '';
    const safeStatus = escapeHtml(getLocalizedStatus(status));
    const statusClass = getStatusClass(status);
    const time = r.receivedAt ? new Date(r.receivedAt).toLocaleString(currentLang === 'th' ? 'th-TH' : 'en-US', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : '-';
    const safeTime = escapeHtml(time);
    const title = plate || escapeHtml(r.id || 'Record');
    const subtitle = driver ? driver + (province ? ' · ' + province : '') : (vehicle || safeTime);
    const safeId = escapeHtml(String(r.id));

    const thumbHtml = safePhoto
      ? `<div class="activity-thumb"><img src="${safePhoto}" alt="" loading="lazy" /></div>`
      : `<div class="activity-icon icon-blue"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>`;

    return `<div class="activity-item" onclick="openRecordDetail('${safeId}')" style="animation-delay:${idx * 0.05}s">
      ${thumbHtml}
      <div class="activity-info">
        <div class="activity-title">${title}</div>
        <div class="activity-sub">${subtitle}</div>
      </div>
      <div class="activity-right">
        ${safeStatus ? `<span class="activity-badge ${statusClass}">${safeStatus}</span>` : ''}
        <span class="activity-time">${safeTime}</span>
      </div>
    </div>`;
  }).join('');
}

function openRecordDetail(id) {
  const record = allRecords.find(r => String(r.id) === String(id));
  if (!record) return switchPage('records', document.querySelector('[data-page=records]'));
  activeRecordDetailId = String(id);
  const p = record.payload || {};
  const photoUrl = p.photoUrl ? escapeHtml(p.photoUrl) : '';
  const time = record.receivedAt ? new Date(record.receivedAt).toLocaleString(currentLang === 'th' ? 'th-TH' : 'en-US') : '-';
  const plateValue = getRecordPlateValue(p);

  const plateField = `<div id="plateFieldCard" class="detail-field detail-field-editing detail-field-wide">
     <div class="detail-field-header">
       <span class="detail-label">${escapeHtml(t('plate_number'))}</span>
       <div class="detail-inline-actions">
         <button class="btn btn-sm btn-outline" onclick="cancelEditPlateNumber()">${escapeHtml(t('cancel'))}</button>
         <button class="btn btn-sm btn-primary" id="savePlateBtn" onclick="savePlateNumber('${escapeHtml(String(id))}')">${escapeHtml(t('save'))}</button>
       </div>
     </div>
     <input id="editPlateNumberInput" class="detail-input" type="text" maxlength="100" value="${escapeHtml(plateValue)}" onkeydown="if (event.key === 'Enter') { event.preventDefault(); savePlateNumber('${escapeHtml(String(id))}'); }" />
   </div>`;

  const fields = Object.entries(p)
    .filter(([k]) => k !== 'photoUrl' && k !== 'photoOriginalName')
    .filter(([k], index, entries) => !(k === 'license_plate' && entries.some(([entryKey]) => entryKey === 'licensePlate')))
    .filter(([k]) => k !== 'licensePlate' && k !== 'license_plate')
    .map(([k, v]) => {
      const label = escapeHtml(t(k) !== k ? t(k) : k);
      const localizedValue = k === 'status' ? getLocalizedStatus(v) : v;
      const val = escapeHtml(typeof localizedValue === 'object' ? JSON.stringify(localizedValue) : String(localizedValue));
      return `<div class="detail-field"><span class="detail-label">${label}</span><span class="detail-value">${val}</span></div>`;
    }).join('');

  const safeId = escapeHtml(String(id));
  const html = `
    <div class="record-detail-content ${photoUrl ? '' : 'no-photo'}">
      ${photoUrl ? `<div class="record-detail-photo" onclick="openLightbox('${photoUrl}')"><img src="${photoUrl}" alt="" /><div class="record-detail-photo-overlay"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></div></div>` : ''}
      <div class="record-detail-fields">${plateField}${fields}</div>
      <div class="record-detail-footer">
        <div class="record-detail-time"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${escapeHtml(time)}</div>
        <div class="record-detail-footer-actions">
          <button class="btn btn-sm btn-danger" onclick="closeRecordDetail(); deleteRecord('${safeId}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            ${escapeHtml(t('delete_btn'))}
          </button>
        </div>
      </div>
    </div>`;

  const modal = document.getElementById('recordDetailModal');
  document.getElementById('recordDetailBody').innerHTML = html;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeRecordDetail() {
  document.getElementById('recordDetailModal').classList.remove('active');
  document.body.style.overflow = '';
  activeRecordDetailId = null;
  editingPlateRecordId = null;
  savingPlateRecordId = null;
}

// ==================== GALLERY ====================
function renderGallery() {
  const container = document.getElementById('galleryGrid');
  if (!container) return;

  const photos = allRecords.filter(r => r.payload?.photoUrl);

  if (photos.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <p>${t('no_photos')}</p>
      </div>`;
    return;
  }

  container.innerHTML = photos.map((record, index) => {
    const p = record.payload;
    const safeUrl = escapeHtml(p.photoUrl);
    const plate = escapeHtml(p.licensePlate || p.license_plate || '');
    const driver = escapeHtml(p.driverName || p.driver_name || p.driver || '');
    const status = p.status || '';
    const safeStatus = escapeHtml(getLocalizedStatus(status));
    const statusClass = getStatusClass(status);
    const time = record.receivedAt ? new Date(record.receivedAt).toLocaleString(currentLang === 'th' ? 'th-TH' : 'en-US', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : '-';
    const safeTime = escapeHtml(time);
    const safeId = escapeHtml(String(record.id));

    return `
      <div class="gallery-item" style="animation-delay: ${Math.min(index * 0.08, 0.8)}s" onclick="openRecordDetail('${safeId}')">
        <img src="${safeUrl}" alt="${plate}" loading="lazy" />
        <div class="gallery-overlay">
          <div class="gallery-overlay-top">
            ${safeStatus ? `<span class="gallery-badge ${statusClass}">${safeStatus}</span>` : ''}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </div>
          <div class="gallery-overlay-bottom">
            ${plate ? `<div class="gallery-plate">${plate}</div>` : ''}
            ${driver ? `<div class="gallery-driver">${driver}</div>` : ''}
          </div>
        </div>
        <div class="gallery-info">
          <span class="gallery-info-plate">${plate || t('photo')}</span>
          <span class="gallery-info-time">${safeTime}</span>
        </div>
      </div>`;
  }).join('');
}

// ==================== LIGHTBOX ====================
function openLightbox(url) {
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  img.src = url;
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox(event) {
  if (event && event.target !== event.currentTarget && event.target.id !== 'lightboxImg') return;
  const lightbox = document.getElementById('lightbox');
  lightbox.classList.remove('active');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLightbox();
});

// ==================== SSE (Real-time) ====================
function connectSSE() {
  const badge = document.getElementById('connectionBadge');
  const eventSource = new EventSource('/api/v1/android/data/stream');

  eventSource.addEventListener('connected', () => {
    badge.classList.remove('disconnected');
    badge.querySelector('span:last-child').textContent = t('connected');
  });

  eventSource.addEventListener('new-record', (event) => {
    const record = JSON.parse(event.data);
    allRecords.unshift(record);
    renderRecords();
    renderGallery();
    loadStats();
    addRealtimeItem(record);
    triggerRealtimeNotification(record);
  });

  eventSource.onerror = () => {
    badge.classList.add('disconnected');
    badge.querySelector('span:last-child').textContent = t('disconnected');
  };
}

function updateRealtimeSelectionUI() {
  const feed = document.getElementById('realtimeFeed');
  const countEl = document.querySelector('.realtime-count');
  const deleteBtn = document.getElementById('btnDeleteRealtimeSelected');
  const selectAll = document.getElementById('realtimeSelectAll');
  if (!feed) return;

  const items = Array.from(feed.querySelectorAll('.realtime-item[data-record-id]'));
  const itemCount = items.length;
  const selectedCount = items.filter((el) => selectedRealtimeIds.has(String(el.dataset.recordId))).length;

  if (countEl) {
    if (itemCount === 0) {
      countEl.textContent = t('waiting');
    } else if (selectedCount > 0) {
      countEl.textContent = `${itemCount} ${t('records')} · ${selectedCount} ${t('selected')}`;
    } else {
      countEl.textContent = `${itemCount} ${t('records')}`;
    }
  }

  if (deleteBtn) {
    deleteBtn.disabled = selectedCount === 0;
  }

  if (selectAll) {
    selectAll.checked = itemCount > 0 && selectedCount === itemCount;
    selectAll.indeterminate = selectedCount > 0 && selectedCount < itemCount;
  }
}

function toggleRealtimeSelection(id, checked) {
  const safeId = String(id);
  if (checked) {
    selectedRealtimeIds.add(safeId);
  } else {
    selectedRealtimeIds.delete(safeId);
  }

  const item = document.querySelector(`.realtime-item[data-record-id="${CSS.escape(safeId)}"]`);
  if (item) {
    item.classList.toggle('selected', checked);
  }

  updateRealtimeSelectionUI();
}

function toggleRealtimeSelectAll(checked) {
  const feed = document.getElementById('realtimeFeed');
  if (!feed) return;

  const inputs = feed.querySelectorAll('.realtime-item-select input[type="checkbox"]');
  inputs.forEach((input) => {
    input.checked = checked;
    const id = input.getAttribute('data-record-id');
    if (!id) return;
    if (checked) {
      selectedRealtimeIds.add(String(id));
    } else {
      selectedRealtimeIds.delete(String(id));
    }

    const item = input.closest('.realtime-item');
    if (item) item.classList.toggle('selected', checked);
  });

  updateRealtimeSelectionUI();
}

function removeRealtimeItemById(id) {
  const safeId = String(id);
  selectedRealtimeIds.delete(safeId);

  const node = document.querySelector(`.realtime-item[data-record-id="${CSS.escape(safeId)}"]`);
  if (node) {
    node.remove();
  }

  const feed = document.getElementById('realtimeFeed');
  if (feed && feed.querySelectorAll('.realtime-item').length === 0) {
    feed.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <p>${escapeHtml(t('realtime_empty'))}</p>
      </div>`;
  }

  updateRealtimeSelectionUI();
}

async function deleteSelectedRealtimeRecords() {
  const ids = Array.from(selectedRealtimeIds);
  if (ids.length === 0) return;

  if (!window.confirm(t('delete_selected_confirm'))) {
    return;
  }

  let failCount = 0;
  for (const id of ids) {
    try {
      const res = await fetch(`/api/v1/android/data/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const result = await res.json();
      if (!result.success) {
        failCount += 1;
        continue;
      }

      allRecords = allRecords.filter((r) => String(r.id) !== String(id));
      removeRealtimeItemById(id);
    } catch (_) {
      failCount += 1;
    }
  }

  renderRecords();
  renderGallery();
  loadStats();

  if (failCount > 0) {
    showToast(`${t('delete_selected_failed')} (${failCount})`, 'error');
  } else {
    showToast(t('deleted'), 'success');
  }
}

function addRealtimeItem(record) {
  const feed = document.getElementById('realtimeFeed');
  if (!feed) return;

  // Remove empty state
  const empty = feed.querySelector('.empty-state');
  if (empty) empty.remove();

  const p = record.payload || {};
  const time = record.receivedAt ? new Date(record.receivedAt).toLocaleString(currentLang === 'th' ? 'th-TH' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: 'numeric', month: 'short' }) : '-';
  const safeTime = escapeHtml(time);
  const safeId = escapeHtml(String(record.id));
  const safePhotoUrl = p.photoUrl ? escapeHtml(p.photoUrl) : '';
  const plate = escapeHtml(p.licensePlate || p.license_plate || '');
  const driver = escapeHtml(p.driverName || p.driver_name || p.driver || '');
  const vehicle = escapeHtml(p.vehicleType || p.vehicle_type || '');
  const province = escapeHtml(p.province || '');
  const weight = escapeHtml(p.weight || '');
  const status = p.status || '';
  const safeStatus = escapeHtml(getLocalizedStatus(status));
  const statusClass = getStatusClass(status);
  const selected = selectedRealtimeIds.has(String(record.id));

  const item = document.createElement('div');
  item.className = `realtime-item${selected ? ' selected' : ''}`;
  item.dataset.recordId = String(record.id);
  item.style.cursor = 'pointer';
  item.setAttribute('onclick', `openRecordDetail('${safeId}')`);
  item.innerHTML = `
    <div class="realtime-item-header">
      <label class="realtime-item-select" onclick="event.stopPropagation()">
        <input type="checkbox" data-record-id="${safeId}" ${selected ? 'checked' : ''} onchange="toggleRealtimeSelection(this.dataset.recordId, this.checked)" />
      </label>
      <div class="realtime-item-dot"></div>
      <span class="realtime-item-time">${safeTime}</span>
      ${safeStatus ? `<span class="activity-badge ${statusClass}">${safeStatus}</span>` : ''}
      <div class="realtime-item-actions" onclick="event.stopPropagation()">
        <button class="btn btn-sm btn-danger" data-record-id="${safeId}" onclick="deleteRecord(this.dataset.recordId)">
          ${escapeHtml(t('delete_btn'))}
        </button>
      </div>
    </div>
    <div class="realtime-item-body">
      ${safePhotoUrl ? `<div class="realtime-item-thumb"><img src="${safePhotoUrl}" alt="" loading="lazy" /></div>` : ''}
      <div class="realtime-item-info">
        ${plate ? `<div class="realtime-item-plate">${plate}</div>` : `<div class="realtime-item-plate">#${safeId}</div>`}
        ${driver ? `<div class="realtime-item-meta">${driver}${province ? ' · ' + province : ''}</div>` : ''}
        ${vehicle ? `<div class="realtime-item-meta">${vehicle}${weight ? ' · ' + weight : ''}</div>` : ''}
      </div>
    </div>`;

  feed.prepend(item);

  // Keep max 50 items
  while (feed.children.length > 50) {
    const removed = feed.lastChild;
    const removedId = removed?.dataset?.recordId;
    if (removedId) selectedRealtimeIds.delete(String(removedId));
    feed.removeChild(removed);
  }

  updateRealtimeSelectionUI();
}

// ==================== USER MANAGEMENT ====================
async function loadUsers() {
  try {
    const res = await fetch('/api/v1/users', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const data = await res.json();
    if (!data.success) return;
    usersCache = data.data;
    renderUsers(usersCache);
  } catch (err) {
    console.error('Failed to load users:', err);
  }
}

function renderUsers(users) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  
  // Apply Sort
  const sorted = [...users].sort((a, b) => {
    let valA, valB;
    if (currentSort.col === 'index') {
      valA = usersCache.indexOf(a);
      valB = usersCache.indexOf(b);
    } else {
      valA = (currentSort.col === 'name' ? `${a.firstName} ${a.lastName}` : a[currentSort.col] || '').toLowerCase();
      valB = (currentSort.col === 'name' ? `${b.firstName} ${b.lastName}` : b[currentSort.col] || '').toLowerCase();
    }
    if (valA < valB) return currentSort.dir === 'asc' ? -1 : 1;
    if (valA > valB) return currentSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  // Apply limit
  const usersToShow = sorted;

  updateSortIcons();

  if (!usersToShow || usersToShow.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No users found</td></tr>';
    return;
  }
  tbody.innerHTML = usersToShow.map((u, index) => {
    const safePhotoUrl = u.photoUrl ? escapeHtml(u.photoUrl) : '';
    const photoHtml = u.photoUrl 
      ? `<img src="${safePhotoUrl}" class="table-user-photo" alt="">`
      : `<div class="table-user-avatar">${escapeHtml((u.firstName || u.username || '?').charAt(0).toUpperCase())}</div>`;
    const safeId = escapeHtml(u.id);
    const safeFirstName = escapeHtml(u.firstName || '');
    const safeLastName = escapeHtml(u.lastName || '');
    const safeEmail = escapeHtml(u.email || '-');
    const safeRole = escapeHtml(u.role);
    const safeUsername = escapeHtml(u.username || u.email || '');
    const safeDisplayName = escapeHtml(u.firstName || u.email || '');
    
    return `
      <tr>
        <td class="text-center text-muted">${usersCache.indexOf(u) + 1}</td>
        <td>${photoHtml}</td>
        <td><strong>${safeFirstName} ${safeLastName}</strong></td>
        <td>${safeEmail}</td>
        <td><span class="role-badge ${safeRole}">${safeRole}</span></td>
        <td><span class="status-badge ${u.active ? 'active' : 'inactive'}"><span class="dot"></span>${u.active ? 'Active' : 'Inactive'}</span></td>
        <td>
          <div class="user-actions">
            <button class="btn-icon" title="Edit" data-user-id="${safeId}" onclick="openEditUserModal(this.dataset.userId)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            </button>
            <button class="btn-icon" title="Reset Password" data-user-id="${safeId}" data-user-name="${safeUsername}" onclick="openResetPwModal(this.dataset.userId, this.dataset.userName)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </button>
            <button class="btn-icon danger" title="Delete" data-user-id="${safeId}" data-user-name="${safeDisplayName}" onclick="confirmDeleteUser(this.dataset.userId, this.dataset.userName)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function sortUsers(col) {
  if (currentSort.col === col) {
    currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.col = col;
    currentSort.dir = 'asc';
  }
  handleUserSearch();
}

function updateSortIcons() {
  const icons = { index: 'idx', name: 'name', email: 'email', role: 'role' };
  Object.keys(icons).forEach(col => {
    const el = document.getElementById(`sort-${icons[col]}`);
    if (!el) return;
    if (currentSort.col === col) {
      el.innerHTML = currentSort.dir === 'asc' ? '▴' : '▾';
      el.style.opacity = '1';
    } else {
      el.innerHTML = '▴';
      el.style.opacity = '0.2';
    }
  });
}

function handleLimitChange() {
  handleUserSearch();
}

function handleUserSearch() {
  const query = document.getElementById('userSearchInput').value.toLowerCase();
  let results = usersCache;
  if (query) {
    results = usersCache.filter(u => {
      const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
      const email = (u.email || '').toLowerCase();
      return fullName.includes(query) || email.includes(query);
    });
  }
  renderUsers(results);
}


// ==================== PHOTO & CROP ====================
let cropperInstance = null;
let croppedPhotoBlob = null;

function handleUserPhotoSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  editProfileCropMode = false;
  const reader = new FileReader();
  reader.onload = function(e) {
    const cropImg = document.getElementById('cropImage');
    cropImg.src = e.target.result;
    document.getElementById('cropModal').classList.add('active');
    // Destroy old cropper
    if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
    setTimeout(() => {
      cropperInstance = new Cropper(cropImg, {
        aspectRatio: 1,
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 0.9,
        cropBoxResizable: true,
        background: false,
      });
    }, 100);
  };
  reader.readAsDataURL(file);
}

function closeCropModal() {
  document.getElementById('cropModal').classList.remove('active');
  if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
  if (editProfileCropMode) {
    document.getElementById('editProfilePhotoInput').value = '';
    editProfileCropMode = false;
  } else {
    document.getElementById('userPhotoInput').value = '';
  }
}

function applyCrop() {
  if (!cropperInstance) return;
  const canvas = cropperInstance.getCroppedCanvas({ width: 200, height: 200 });
  canvas.toBlob(function(blob) {
    if (editProfileCropMode) {
      editProfilePhotoBlob = blob;
      const url = URL.createObjectURL(blob);
      const imgEl = document.getElementById('editProfilePhotoImg');
      imgEl.src = url;
      imgEl.style.display = 'block';
      document.getElementById('editProfilePhotoInitial').style.display = 'none';
      editProfileCropMode = false;
      closeCropModal();
      return;
    }
    croppedPhotoBlob = blob;
    const url = URL.createObjectURL(blob);
    const imgEl = document.getElementById('userPhotoImg');
    imgEl.src = url;
    imgEl.style.display = 'block';
    document.getElementById('userPhotoInitial').style.display = 'none';
    closeCropModal();
  }, 'image/jpeg', 0.85);
}

function resetUserPhotoUI() {
  croppedPhotoBlob = null;
  const imgEl = document.getElementById('userPhotoImg');
  if (imgEl) { imgEl.src = ''; imgEl.style.display = 'none'; }
  const initEl = document.getElementById('userPhotoInitial');
  if (initEl) initEl.style.display = '';
  const input = document.getElementById('userPhotoInput');
  if (input) input.value = '';
}

function openAddUserModal() {
  document.getElementById('userModalTitle').textContent = t('add_user');
  document.getElementById('userFormId').value = '';
  document.getElementById('userFormFirstName').value = '';
  document.getElementById('userFormLastName').value = '';
  document.getElementById('userFormEmail').value = '';
  document.getElementById('userFormRole').value = 'user';
  document.getElementById('userFormPassword').value = '';
  document.getElementById('userFormPasswordGroup').style.display = '';
  document.getElementById('userFormPassword').required = true;
  resetUserPhotoUI();
  document.getElementById('userModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

async function openEditUserModal(id) {
  try {
    const res = await fetch('/api/v1/users', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const data = await res.json();
    const user = data.data?.find(u => u.id === id);
    if (!user) return showToast('User not found', 'error');

    document.getElementById('userModalTitle').textContent = t('edit_user') || 'Edit User';
    document.getElementById('userFormId').value = user.id;
    document.getElementById('userFormFirstName').value = user.firstName || '';
    document.getElementById('userFormLastName').value = user.lastName || '';
    document.getElementById('userFormEmail').value = user.email || '';
    document.getElementById('userFormRole').value = user.role;
    document.getElementById('userFormPasswordGroup').style.display = 'none';
    document.getElementById('userFormPassword').required = false;
    document.getElementById('userModal').classList.add('active');
    document.body.style.overflow = 'hidden';
  } catch (err) {
    showToast('Error loading user', 'error');
  }
}

function closeUserModal() {
  document.getElementById('userModal').classList.remove('active');
  document.body.style.overflow = '';
}

async function handleUserFormSubmit(event) {
  event.preventDefault();
  const id = document.getElementById('userFormId').value;
  const isEdit = !!id;

  const email = document.getElementById('userFormEmail').value;
  const firstName = document.getElementById('userFormFirstName').value;
  const body = {
    email: email,
    firstName: firstName,
    lastName: document.getElementById('userFormLastName').value,
    displayName: firstName, // Set First Name as Display Name
    role: document.getElementById('userFormRole').value,
  };

  if (!isEdit) {
    body.password = document.getElementById('userFormPassword').value;
    if (!body.password || body.password.length < 6) {
      return showToast('Password must be at least 6 characters', 'error');
    }
  }

  try {
    const url = isEdit ? `/api/v1/users/${id}` : '/api/v1/users';
    const method = isEdit ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success) {
      // Upload photo if cropped
      if (croppedPhotoBlob && data.data?.id) {
        const fd = new FormData();
        fd.append('photo', croppedPhotoBlob, 'profile.jpg');
        try {
          await fetch(`/api/v1/users/${data.data.id}/photo`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
            body: fd
          });
        } catch (_) {}
      }
      showToast(data.message, 'success');
      closeUserModal();
      loadUsers();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('Failed to save user', 'error');
  }
}

function openResetPwModal(id, username) {
  document.getElementById('resetPwUserId').value = id;
  document.getElementById('resetPwUserLabel').textContent = `User: ${username}`;
  document.getElementById('resetPwNew').value = '';
  document.getElementById('resetPwModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeResetPwModal() {
  document.getElementById('resetPwModal').classList.remove('active');
  document.body.style.overflow = '';
}

async function handleResetPassword(event) {
  event.preventDefault();
  const id = document.getElementById('resetPwUserId').value;
  const newPassword = document.getElementById('resetPwNew').value;
  try {
    const res = await fetch(`/api/v1/users/${id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify({ newPassword })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeResetPwModal();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('Failed to reset password', 'error');
  }
}

let deleteUserId = null;
function confirmDeleteUser(id, name) {
  deleteUserId = id;
  const modal = document.getElementById('userDeleteModal');
  const msgEl = modal.querySelector('[data-i18n="delete_user_confirm"]');
  if (msgEl) msgEl.textContent = `Are you sure you want to delete ${name}? This action cannot be undone.`;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeUserDeleteModal() {
  document.getElementById('userDeleteModal').classList.remove('active');
  document.body.style.overflow = '';
  deleteUserId = null;
}

async function confirmDeleteUserData() {
  if (!deleteUserId) return;
  try {
    const res = await fetch(`/api/v1/users/${deleteUserId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeUserDeleteModal();
      loadUsers();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('Failed to delete user', 'error');
  }
}

// Override confirmDelete for user deletion context
const originalConfirmDelete = typeof confirmDelete === 'function' ? confirmDelete : null;

function setupAdminUI() {
  const user = getUser();
  const isAdmin = user && user.role === 'admin';
  document.querySelectorAll('.admin-only').forEach(el => {
    if (isAdmin) {
      el.style.display = el.classList.contains('nav-item') ? 'flex' : '';
    } else {
      el.style.display = 'none';
    }
  });
}

// ==================== TOAST NOTIFICATIONS (MOVED TO utils.js) ====================

