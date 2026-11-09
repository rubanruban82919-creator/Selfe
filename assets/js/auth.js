window.RetinaAuth = (function () {
  'use strict';

  const state = { user: null, permissions: new Set(), ready: null };

  function can(permission) {
    return state.permissions.has(permission);
  }

  function applyChrome() {
    const user = state.user;
    document.querySelectorAll('[data-permission]').forEach(el => {
      el.hidden = !can(el.getAttribute('data-permission'));
    });
    const name = document.querySelector('.sidebar-user-name');
    const role = document.querySelector('.sidebar-user-role');
    const avatar = document.querySelector('.sidebar-user-avatar');
    const topName = document.querySelector('.topbar-user-name');
    const topAvatar = document.querySelector('.topbar-avatar');
    const status = document.querySelector('.topbar-user-status');
    const heading = document.getElementById('welcomeHeading');
    const welcomeRole = document.getElementById('welcomeRole');
    const label = user ? roleLabel(user.role) : '';
    if (name) name.textContent = user ? user.name : 'Signed in';
    if (role) role.textContent = label;
    const initials = user ? user.name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase() : 'RG';
    if (avatar) avatar.textContent = initials;
    if (topName) topName.textContent = user ? user.name : '';
    if (topAvatar) topAvatar.textContent = initials;
    if (status) {
      status.innerHTML = '<span class="status-dot green"></span> ' + label;
    }
    if (heading) heading.textContent = user ? 'Welcome back, ' + user.name : 'Welcome back';
    if (welcomeRole) welcomeRole.textContent = label;
    const clinician = document.getElementById('settingsClinician');
    if (clinician && user && !clinician.value) clinician.value = user.name;
    document.body.classList.toggle('signed-in', Boolean(user));
  }

  function roleLabel(role) {
    if (role === 'super_admin') return 'Super Admin';
    if (role === 'doctor') return 'Doctor';
    if (role === 'staff') return 'Staff';
    return role || '';
  }

  function showGate(needsSetup) {
    document.body.classList.remove('signed-in');
    const gate = document.getElementById('authGate');
    const setup = document.getElementById('setupPanel');
    const login = document.getElementById('loginPanel');
    if (gate) gate.hidden = false;
    if (setup) setup.hidden = !needsSetup;
    if (login) login.hidden = needsSetup;
  }

  async function enter(payload, onReady) {
    state.user = payload.user;
    state.permissions = new Set(payload.permissions || []);
    applyChrome();
    document.getElementById('authGate').hidden = true;
    const stored = localStorage.getItem('retinaguard_patients');
    if (stored && can('patients.write')) {
      try {
        const patients = JSON.parse(stored);
        if (Array.isArray(patients) && patients.length) {
          await window.RetinaApi.request('POST', '/api/patients/merge', { patients });
        }
        localStorage.removeItem('retinaguard_patients');
      } catch (error) {
        console.warn('Browser registry was left in place', error);
      }
    }
    if (onReady) await onReady();
  }

  async function start(onReady) {
    const setupForm = document.getElementById('setupForm');
    const loginForm = document.getElementById('loginForm');
    const message = document.getElementById('authMessage');
    const showError = (error) => {
      if (message) message.textContent = error.message || 'Sign-in failed';
    };
    if (setupForm) {
      setupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          const payload = await window.RetinaApi.request('POST', '/api/setup', {
            name: document.getElementById('setupName').value.trim(),
            email: document.getElementById('setupEmail').value.trim(),
            password: document.getElementById('setupPassword').value,
            confirmPassword: document.getElementById('setupConfirm').value
          });
          await enter(payload, onReady);
        } catch (error) {
          showError(error);
        }
      });
    }
    if (loginForm) {
      loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (loginForm.dataset.pending === '1') return;
        const button = loginForm.querySelector('button[type="submit"]');
        loginForm.dataset.pending = '1';
        if (button) button.disabled = true;
        try {
          const payload = await window.RetinaApi.request('POST', '/api/login', {
            email: document.getElementById('loginEmail').value.trim(),
            password: document.getElementById('loginPassword').value
          });
          await enter(payload, onReady);
        } catch (error) {
          if (error.needsSetup) showGate(true);
          showError(error);
        } finally {
          loginForm.dataset.pending = '0';
          if (button) button.disabled = false;
        }
      });
    }
    try {
      const health = await window.RetinaApi.request('GET', '/api/health');
      if (!health || health.ok !== true) throw new Error('This page is not connected to the RetinaGuard server.');
    } catch (error) {
      showGate(false);
      const setupPanel = document.getElementById('setupPanel');
      const loginPanel = document.getElementById('loginPanel');
      if (setupPanel) setupPanel.hidden = true;
      if (loginPanel) loginPanel.hidden = true;
      showError(error.status ? error : new Error('The RetinaGuard server is not running. Double-click start.bat, then open http://127.0.0.1:8080 in this browser. Do not open the HTML file directly.'));
      return;
    }
    try {
      const me = await window.RetinaApi.request('GET', '/api/me');
      await enter(me, onReady);
      return;
    } catch (error) {
      if (error.status !== 401) showError(error);
    }
    try {
      const status = await window.RetinaApi.request('GET', '/api/setup');
      showGate(Boolean(status.needsSetup));
      if (status.needsSetup && message) {
        message.textContent = 'No Super Admin exists yet. Create that owner account below. There is no default password.';
      }
    } catch (error) {
      showGate(false);
      const setupPanel = document.getElementById('setupPanel');
      const loginPanel = document.getElementById('loginPanel');
      if (setupPanel) setupPanel.hidden = true;
      if (loginPanel) loginPanel.hidden = true;
      showError(error);
    }
  }

  async function logout() {
    await window.RetinaApi.request('POST', '/api/logout');
    state.user = null;
    state.permissions = new Set();
    window.location.hash = 'dashboard';
    window.location.reload();
  }

  return { start, can, logout, roleLabel, get user() { return state.user; } };
})();
