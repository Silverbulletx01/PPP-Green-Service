// Auth management
const TOKEN_KEY = 'ppp-token';
const USER_KEY = 'ppp-user';
const REMEMBER_KEY = 'ppp-remember';

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

function setAuth(token, user, remember) {
  const store = remember ? localStorage : sessionStorage;
  store.setItem(USER_KEY, JSON.stringify(user));
  if (remember) {
    localStorage.setItem(REMEMBER_KEY, user.username || '');
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

function isAuthenticated() {
  const token = getToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

// Redirect if already logged in (on login page)
if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
  if (isAuthenticated()) {
    window.location.href = '/dashboard.html';
  }
}

// Toggle password visibility
function togglePasswordVisibility() {
  const input = document.getElementById('password');
  const eyeOpen = document.querySelector('.eye-open');
  const eyeClosed = document.querySelector('.eye-closed');

  if (input.type === 'password') {
    input.type = 'text';
    eyeOpen.style.display = 'none';
    eyeClosed.style.display = 'block';
  } else {
    input.type = 'password';
    eyeOpen.style.display = 'block';
    eyeClosed.style.display = 'none';
  }
}

// Handle login
async function handleLogin(event) {
  event.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const btnEl = document.getElementById('loginBtn');

  btnEl.classList.add('loading');
  btnEl.querySelector('span').textContent = t('loading');

  try {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: username, password, remember: document.getElementById('rememberMe')?.checked || false })
    });

    const result = await res.json();

    if (!result.success) {
      showAlert(t('toast_error') || 'Error', t('login_error') || 'Invalid username or password', 'error');
      btnEl.classList.remove('loading');
      btnEl.querySelector('span').textContent = t('sign_in');
      return;
    }

    const remember = document.getElementById('rememberMe')?.checked || false;
    setAuth(result.data.token, result.data.user, remember);
    
    // Smooth transition
    document.querySelector('.login-card').style.transform = 'scale(0.95)';
    document.querySelector('.login-card').style.opacity = '0';
    setTimeout(() => {
      window.location.href = '/dashboard.html';
    }, 300);

  } catch (err) {
    showAlert(t('toast_error') || 'Error', t('login_error') || 'Login failed', 'error');
    btnEl.classList.remove('loading');
    btnEl.querySelector('span').textContent = t('sign_in');
  }
}

// Restore remembered username on login page
function restoreRemembered() {
  const remembered = localStorage.getItem(REMEMBER_KEY);
  if (remembered) {
    const usernameInput = document.getElementById('username');
    const rememberCheck = document.getElementById('rememberMe');
    if (usernameInput) usernameInput.value = remembered;
    if (rememberCheck) rememberCheck.checked = true;
  }
}

if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
  document.addEventListener('DOMContentLoaded', restoreRemembered);
}

function showForgotPassword(event) {
  event.preventDefault();
  document.getElementById('loginForm').style.display = 'none';
  document.querySelector('.forgot-password').style.display = 'none';
  document.getElementById('forgotPasswordForm').style.display = 'block';
}

function hideForgotPassword() {
  document.getElementById('loginForm').style.display = '';
  document.querySelector('.forgot-password').style.display = '';
  document.getElementById('forgotPasswordForm').style.display = 'none';
}
