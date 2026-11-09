window.RetinaAdmin = (function () {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  async function renderAdminHome() {
    const host = document.getElementById('adminSummary');
    if (!host || !window.RetinaAuth.can('analytics.read')) return;
    const stats = await window.RetinaApi.request('GET', '/api/analytics');
    host.innerHTML = `
      <div class="kpi-grid">
        <div class="stat-card"><span class="stat-card-label">Accounts</span><div class="stat-value">${stats.users}</div><div class="stat-trend">${stats.activeUsers} active</div></div>
        <div class="stat-card"><span class="stat-card-label">Patients</span><div class="stat-value">${stats.patients}</div><div class="stat-trend">Stored in the server registry</div></div>
        <div class="stat-card"><span class="stat-card-label">Scans</span><div class="stat-value">${stats.scans}</div><div class="stat-trend">Includes comparison source images</div></div>
        <div class="stat-card"><span class="stat-card-label">Saved reports</span><div class="stat-value">${stats.reports}</div><div class="stat-trend">Generated from stored records</div></div>
      </div>
      <p class="model-notice">Signed in as ${escapeHtml(window.RetinaAuth.user.name)} · ${escapeHtml(window.RetinaAuth.roleLabel(window.RetinaAuth.user.role))}. Staff accounts can view records. Doctors can change patients and scans. Only a Super Admin can manage accounts and the audit log.</p>
    `;
  }

  async function renderUsers() {
    const body = document.getElementById('userTableBody');
    if (!body) return;
    const payload = await window.RetinaApi.request('GET', '/api/users');
    body.innerHTML = payload.users.map(user => `
      <tr>
        <td>${escapeHtml(user.name)}<div class="muted-id">${escapeHtml(user.email)}</div></td>
        <td>
          <select class="form-control form-select user-role" data-id="${escapeHtml(user.id)}">
            ${['super_admin', 'doctor', 'staff'].map(role => `<option value="${role}" ${role === user.role ? 'selected' : ''}>${escapeHtml(window.RetinaAuth.roleLabel(role))}</option>`).join('')}
          </select>
        </td>
        <td>${user.active ? 'Active' : 'Inactive'}</td>
        <td style="text-align:right;">
          <button type="button" class="btn btn-outline btn-sm user-toggle" data-id="${escapeHtml(user.id)}" data-active="${user.active ? '1' : '0'}">${user.active ? 'Deactivate' : 'Activate'}</button>
        </td>
      </tr>
    `).join('');
    body.querySelectorAll('.user-role').forEach(select => {
      select.addEventListener('change', async () => {
        try {
          await window.RetinaApi.request('PATCH', '/api/users/' + encodeURIComponent(select.dataset.id), { role: select.value });
          await renderUsers();
        } catch (error) {
          window.alert(error.message);
          await renderUsers();
        }
      });
    });
    body.querySelectorAll('.user-toggle').forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await window.RetinaApi.request('PATCH', '/api/users/' + encodeURIComponent(button.dataset.id), { active: button.dataset.active !== '1' });
          await renderUsers();
        } catch (error) {
          window.alert(error.message);
        }
      });
    });
  }

  async function renderAudit() {
    const body = document.getElementById('auditTableBody');
    if (!body) return;
    const payload = await window.RetinaApi.request('GET', '/api/audit');
    body.innerHTML = payload.events.length ? payload.events.map(event => `
      <tr>
        <td>${escapeHtml(event.created_at)}</td>
        <td>${escapeHtml(event.actor_email || 'system')}</td>
        <td>${escapeHtml(event.action)}</td>
        <td>${escapeHtml(event.detail)}</td>
      </tr>
    `).join('') : '<tr><td colspan="4">No administrative activity is recorded yet.</td></tr>';
  }

  async function renderPredictions() {
    const body = document.getElementById('predictionTableBody');
    if (!body) return;
    const payload = await window.RetinaApi.request('GET', '/api/predictions');
    const canDelete = window.RetinaAuth.can('scans.delete');
    body.innerHTML = payload.predictions.length ? payload.predictions.map(row => `
      <tr>
        <td>${escapeHtml(row.patientName)}<div class="muted-id">${escapeHtml(row.patientId)}</div></td>
        <td>${escapeHtml(row.date)}</td>
        <td>${escapeHtml(row.eye)}</td>
        <td>Stage ${escapeHtml(row.stage)}</td>
        <td>${row.confidence == null ? '—' : escapeHtml(row.confidence) + '%'}</td>
        <td style="text-align:right;">
          ${canDelete ? `<button type="button" class="btn btn-outline btn-sm prediction-delete" data-patient="${escapeHtml(row.patientId)}" data-scan="${escapeHtml(row.scanId)}">Delete scan</button>` : ''}
        </td>
      </tr>
    `).join('') : '<tr><td colspan="6">No stored predictions.</td></tr>';
    body.querySelectorAll('.prediction-delete').forEach(button => {
      button.addEventListener('click', async () => {
        if (!window.confirm('Delete this scan from the patient record? Comparison for that eye will use the remaining images.')) return;
        await window.RetinaData.deleteScan(button.dataset.patient, button.dataset.scan);
        await renderPredictions();
      });
    });
  }

  async function renderReports() {
    const host = document.getElementById('savedReports');
    if (!host) return;
    const payload = await window.RetinaApi.request('GET', '/api/reports');
    const canDelete = window.RetinaAuth.can('reports.delete');
    host.innerHTML = payload.reports.length ? payload.reports.map(report => `
      <article class="med-card" style="margin-bottom:12px;">
        <div class="med-card-header">
          <div>
            <h3 class="med-card-title">${escapeHtml(report.title)}</h3>
            <p class="med-card-subtitle">${escapeHtml(report.patient_id)} · ${escapeHtml(report.created_at)}</p>
          </div>
          ${canDelete ? `<button type="button" class="btn btn-outline btn-sm report-delete" data-id="${escapeHtml(report.id)}">Delete</button>` : ''}
        </div>
        <p>${escapeHtml(report.body)}</p>
      </article>
    `).join('') : '<p class="chart-empty">No reports have been saved on the server yet.</p>';
    host.querySelectorAll('.report-delete').forEach(button => {
      button.addEventListener('click', async () => {
        await window.RetinaApi.request('DELETE', '/api/reports/' + encodeURIComponent(button.dataset.id));
        await renderReports();
      });
    });
  }

  function init() {
    const form = document.getElementById('createUserForm');
    if (form) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = document.getElementById('userFormMessage');
        try {
          await window.RetinaApi.request('POST', '/api/users', {
            name: document.getElementById('userName').value.trim(),
            email: document.getElementById('userEmail').value.trim(),
            role: document.getElementById('userRole').value,
            password: document.getElementById('userPassword').value,
            active: document.getElementById('userActive').checked
          });
          form.reset();
          document.getElementById('userActive').checked = true;
          if (message) message.textContent = 'Account created. The password is not shown again.';
          await renderUsers();
        } catch (error) {
          if (message) message.textContent = error.message;
        }
      });
    }
    window.addEventListener('hashchange', refreshRoute);
  }

  async function refreshRoute() {
    const route = (window.location.hash || '#dashboard').replace('#', '');
    try {
      if (route === 'admin') await renderAdminHome();
      if (route === 'users') await renderUsers();
      if (route === 'audit') await renderAudit();
      if (route === 'predictions') await renderPredictions();
      if (route === 'reports') await renderReports();
    } catch (error) {
      console.warn(error);
    }
  }

  return { init, refreshRoute, renderReports };
})();
