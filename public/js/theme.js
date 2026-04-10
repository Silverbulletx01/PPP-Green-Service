// Theme management
const savedTheme = localStorage.getItem('ppp-theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ppp-theme', next);

  // Update charts if they exist
  if (typeof refreshCharts === 'function') {
    setTimeout(refreshCharts, 100);
  }

  // Update settings page value if visible
  if (typeof updateSettingsPage === 'function') {
    updateSettingsPage();
  }
}

function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}
