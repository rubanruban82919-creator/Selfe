/**
 * RETINAGUARD AI – CORE APPLICATION CONTROLLER
 * Routing, View Management, State Orchestration, Drag-and-Drop,
 * Comparison Controller, Patient Management, and Print/PDF Generator.
 */

(function () {
  'use strict';

  // Application State
  const state = {
    currentRoute: 'dashboard',
    selectedComparisonPatientId: 'DR-2026-8941', // Default: Robert Chen (Worsened trajectory)
    selectedComparisonEye: null,
    activeComparisonView: 'side-by-side', // 'side-by-side' | 'curtain'
    currentProfilePatientId: 'DR-2026-8941',
    detection: {
      selectedPatientId: 'DR-2026-8941',
      selectedEye: 'OD',
      imageSrc: 'assets/images/samples/retina-stage3.svg',
      forcedStage: 3,
      isAnalyzing: false,
      lastResult: null,
      showHeatmap: true
    }
  };

  let refreshComparisonSelector = function () {};
  let toastTimer = 0;

  function showToast(message) {
    const toast = document.getElementById('appToast');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 4200);
  }

  function eyeSeries(patient, eye) {
    return (patient.scans || [])
      .filter(scan => (scan.eye || 'OD') === eye)
      .slice()
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  function latestEye(patient) {
    const scans = (patient.scans || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    return scans[0] ? (scans[0].eye || 'OD') : 'OD';
  }

  function availableEyes(patient) {
    const eyes = [];
    (patient.scans || []).forEach(scan => {
      const eye = scan.eye || 'OD';
      if (!eyes.includes(eye)) eyes.push(eye);
    });
    return eyes.length ? eyes : ['OD'];
  }

  function classifyPatient(patient, eye) {
    const chosen = eye || latestEye(patient);
    const series = eyeSeries(patient, chosen);
    const curr = series.length ? series[series.length - 1] : null;
    const prev = series.length > 1 ? series[series.length - 2] : null;
    const prog = curr
      ? window.RetinaComparison.evaluateProgression(prev, curr)
      : { status: 'baseline', shortTitle: 'First-time', badgeClass: 'baseline', differenceText: 'No scan', summary: 'No retinal scan is stored for this patient.', actionAlert: '' };
    return { eye: chosen, series, prev, curr, prog };
  }

  function computeCohortMetrics() {
    const patients = window.RetinaData.getPatients();
    const metrics = {
      patients: patients.length,
      scans: 0,
      improved: 0,
      stable: 0,
      worsened: 0,
      baseline: 0,
      stages: { stage0: 0, stage1: 0, stage2: 0, stage3: 0, stage4: 0 },
      confidences: [],
      referable: 0,
      allScans: []
    };
    patients.forEach(patient => {
      (patient.scans || []).forEach(scan => {
        metrics.scans += 1;
        metrics.allScans.push(scan);
        if (typeof scan.confidence === 'number') metrics.confidences.push(scan.confidence);
      });
      const classified = classifyPatient(patient);
      if (classified.curr) {
        metrics.stages['stage' + classified.curr.stage] += 1;
        if (classified.curr.stage >= 2) metrics.referable += 1;
      }
      if (classified.prog.status === 'improved') metrics.improved += 1;
      else if (classified.prog.status === 'worsened') metrics.worsened += 1;
      else if (classified.prog.status === 'stable') metrics.stable += 1;
      else metrics.baseline += 1;
    });
    return metrics;
  }

  function progressionColor(status) {
    if (status === 'improved') return '#22D3A6';
    if (status === 'worsened') return '#FF5263';
    if (status === 'stable') return '#287BFF';
    return '#A78BFA';
  }

  function collectScanRows() {
    const rows = [];
    window.RetinaData.getPatients().forEach(patient => {
      (patient.scans || []).forEach(scan => {
        const series = eyeSeries(patient, scan.eye || 'OD');
        const index = series.findIndex(item => item.id === scan.id);
        const previous = index > 0 ? series[index - 1] : null;
        rows.push({
          patient,
          scan,
          progression: window.RetinaComparison.evaluateProgression(previous, scan)
        });
      });
    });
    rows.sort((a, b) => new Date(b.scan.date) - new Date(a.scan.date));
    return rows;
  }

  function renderNotifications() {
    const list = document.getElementById('notificationList');
    const heading = document.getElementById('notificationHeading');
    if (!list) return;
    const rows = collectScanRows().slice(0, 4);
    if (heading) heading.textContent = rows.length ? 'Latest stored scans' : 'No scans yet';
    list.innerHTML = rows.length ? rows.map(row => `
      <div class="notification-item">
        <span class="notif-dot" style="background: ${progressionColor(row.progression.status)};"></span>
        <div class="notification-content">
          <h5>${row.patient.name} · ${row.progression.shortTitle}</h5>
          <p>${row.patient.id} · ${row.scan.eyeLabel || row.scan.eye || 'OD'} · Stage ${row.scan.stage} on ${row.scan.date}</p>
        </div>
      </div>
    `).join('') : '<p class="chart-empty">Alerts appear after a scan is saved.</p>';
  }

  async function paintRegistryMetrics() {
    const metrics = computeCohortMetrics();
    if (window.RetinaAuth.can('analytics.read')) {
      try {
        const stats = await window.RetinaApi.request('GET', '/api/analytics');
        metrics.patients = stats.patients;
        metrics.scans = stats.scans;
        ['improved', 'stable', 'worsened', 'baseline', 'referable'].forEach(key => {
          if (typeof stats[key] === 'number') metrics[key] = stats[key];
        });
        if (stats.stages) metrics.stages = stats.stages;
      } catch (error) {
        console.warn('Dashboard counts stayed on the loaded patient records', error);
      }
    }
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    setText('kpiPatients', metrics.patients);
    setText('kpiScans', metrics.scans);
    setText('kpiImproved', metrics.improved);
    setText('kpiStable', metrics.stable);
    setText('kpiWorsened', metrics.worsened);
    setText('navPatientCount', metrics.patients);
    setText('severityCohortBadge', `N = ${metrics.patients}`);
    setText('welcomeSummary', `The registry holds ${metrics.patients} patients and ${metrics.scans} retinal scans. ${metrics.worsened} ${metrics.worsened === 1 ? 'case shows' : 'cases show'} a higher grade than the previous scan of the same eye.`);
    setText('analyticsScanCount', metrics.scans);
    setText('analyticsReferable', metrics.referable);
    const mean = metrics.confidences.length
      ? (metrics.confidences.reduce((sum, value) => sum + value, 0) / metrics.confidences.length).toFixed(1) + '%'
      : '—';
    setText('analyticsMeanConfidence', mean);
    return metrics;
  }

  // DOM Content Loaded Handler
  document.addEventListener('DOMContentLoaded', () => {
    window.RetinaAuth.start(async () => {
      await window.RetinaData.pull();
      initNavigation();
      initSidebar();
      initTopBar();
      initModals();
      initDashboard();
      initDetection();
      initComparison();
      initPatients();
      initProfile();
      initAnalytics();
      initReports();
      initHistoryFilters();
      window.RetinaAdmin.init();
      renderNotifications();
      window.addEventListener('hashchange', handleRouting);
      handleRouting();
      window.RetinaAdmin.refreshRoute();
    });
  });

  /* --------------------------------------------------------------------------
     ROUTING & NAVIGATION
     -------------------------------------------------------------------------- */
  function handleRouting() {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    navigateTo(hash);
  }

  function navigateTo(routeId) {
    const validRoutes = ['dashboard', 'patients', 'detection', 'comparison', 'history', 'profile', 'analytics', 'reports', 'settings', 'admin', 'users', 'audit', 'predictions'];
    if (!validRoutes.includes(routeId)) routeId = 'dashboard';
    const routePermission = {
      detection: 'detection.run',
      admin: 'users.manage',
      users: 'users.manage',
      audit: 'audit.read'
    };
    if (routePermission[routeId] && !window.RetinaAuth.can(routePermission[routeId])) routeId = 'dashboard';

    state.currentRoute = routeId;

    // Update Sidebar Active Class
    document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
      const linkRoute = link.getAttribute('data-route');
      if (linkRoute === routeId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Update Views Visibility
    document.querySelectorAll('.view-section').forEach(section => {
      if (section.id === `view-${routeId}`) {
        section.classList.add('active');
      } else {
        section.classList.remove('active');
      }
    });

    // Update Page Header Title
    const headerTitleEl = document.getElementById('pageHeaderTitle');
    const headerSubtitleEl = document.getElementById('pageHeaderSubtitle');
    if (headerTitleEl) {
      const titles = {
        dashboard: { title: 'Clinical Dashboard', sub: 'Longitudinal Diabetic Retinopathy Surveillance & AI Decision Support' },
        patients: { title: 'Patient Registry', sub: 'Records stored by the RetinaGuard server' },
        history: { title: 'Scan History', sub: 'Every stored examination, with same-eye progression' },
        detection: { title: 'AI Retinal Analysis', sub: 'Deep convolutional feature extraction and ICDR grading engine' },
        comparison: { title: 'Longitudinal Scan Comparison', sub: 'Side-by-side comparative progression tracking and lesion delta matrix' },
        profile: { title: 'Patient Profile & Longitudinal History', sub: 'Comprehensive ophthalmic timeline and therapeutic response' },
        analytics: { title: 'Clinical Analytics & Epidemiology', sub: 'Population-level disease staging, risk distributions, and clinic throughput' },
        reports: { title: 'Diagnostic Reports & Referrals', sub: 'Generate accredited ophthalmology referral letters and clinical summaries' },
        settings: { title: 'Platform & AI Model Configuration', sub: 'Classifier thresholds, DICOM settings, and clinical credentials' },
        admin: { title: 'Admin Dashboard', sub: 'Accounts, registry size, and role boundaries' },
        users: { title: 'Users and roles', sub: 'Create doctor and staff accounts, or change access' },
        audit: { title: 'Audit log', sub: 'Server record of sign-ins and record changes' },
        predictions: { title: 'AI prediction results', sub: 'Grades saved with each retinal scan' }
      };
      if (titles[routeId]) {
        headerTitleEl.textContent = titles[routeId].title;
        headerSubtitleEl.textContent = titles[routeId].sub;
      }
    }

    // Refresh specific view data if needed
    document.querySelector('.app-container')?.classList.remove('sidebar-open');

    if (routeId === 'dashboard') renderDashboardWidgets();
    if (routeId === 'comparison') updateComparisonView();
    if (routeId === 'patients') renderPatientsTable();
    if (routeId === 'history') renderScanHistory();
    if (routeId === 'profile') renderPatientProfile(state.currentProfilePatientId);
    if (routeId === 'analytics') renderAnalyticsWidgets();
    if (routeId === 'reports') renderClinicalReport();
    if (window.RetinaAdmin) window.RetinaAdmin.refreshRoute();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function initNavigation() {
    document.querySelectorAll('[data-route]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const route = el.getAttribute('data-route');
        window.location.hash = route;
      });
    });
  }

  /* --------------------------------------------------------------------------
     SIDEBAR TOGGLE
     -------------------------------------------------------------------------- */
  function initSidebar() {
    const appContainer = document.querySelector('.app-container');
    const toggleBtn = document.getElementById('sidebarToggleBtn');
    if (toggleBtn && appContainer) {
      toggleBtn.addEventListener('click', () => {
        if (window.innerWidth <= 992) {
          appContainer.classList.toggle('sidebar-open');
        } else {
          appContainer.classList.toggle('sidebar-collapsed');
        }
      });
    }

    const mobileBtn = document.getElementById('mobileNavBtn');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (mobileBtn && appContainer) {
      mobileBtn.addEventListener('click', () => appContainer.classList.toggle('sidebar-open'));
    }
    if (backdrop && appContainer) {
      backdrop.addEventListener('click', () => appContainer.classList.remove('sidebar-open'));
    }

    const logoutBtn = document.getElementById('sidebarLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (event) => {
        event.preventDefault();
        window.RetinaAuth.logout();
      });
    }
  }

  /* --------------------------------------------------------------------------
     TOPBAR SEARCH & NOTIFICATIONS
     -------------------------------------------------------------------------- */
  function initTopBar() {
    // Notification Popover Toggle
    const notifBtn = document.getElementById('notifBtn');
    const notifPopover = document.getElementById('notificationPopover');
    if (notifBtn && notifPopover) {
      notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notifPopover.classList.toggle('active');
      });

      document.addEventListener('click', (e) => {
        if (!notifPopover.contains(e.target) && !notifBtn.contains(e.target)) {
          notifPopover.classList.remove('active');
        }
      });
    }

    // Live Search
    const searchInput = document.getElementById('globalSearchInput');
    const searchResults = document.getElementById('searchResults');
    const profileChip = document.getElementById('topbarProfile');
    if (profileChip) {
      profileChip.addEventListener('click', () => {
        const account = window.RetinaAuth.user;
        showToast(account ? `${account.name} · ${window.RetinaAuth.roleLabel(account.role)}` : 'Not signed in');
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (state.currentRoute === 'patients') {
          renderPatientsTable(query);
        }
        if (!searchResults) return;
        if (!query) {
          searchResults.hidden = true;
          searchResults.innerHTML = '';
          return;
        }
        const matches = window.RetinaData.getPatients().filter(patient =>
          patient.name.toLowerCase().includes(query) || patient.id.toLowerCase().includes(query)
        ).slice(0, 6);
        searchResults.hidden = false;
        searchResults.innerHTML = matches.length
          ? matches.map(patient => `
              <button type="button" class="search-result" data-id="${patient.id}">
                <strong>${patient.name}</strong>
                <span>${patient.id}</span>
              </button>
            `).join('')
          : '<div class="search-empty">No matching patient in the registry.</div>';
        searchResults.querySelectorAll('.search-result').forEach(button => {
          button.addEventListener('click', () => {
            state.currentProfilePatientId = button.getAttribute('data-id');
            searchInput.value = '';
            searchResults.hidden = true;
            window.location.hash = 'profile';
          });
        });
      });
    }
  }

  /* --------------------------------------------------------------------------
     DASHBOARD VIEW
     -------------------------------------------------------------------------- */
  function initDashboard() {
    renderDashboardWidgets();
  }

  async function renderDashboardWidgets() {
    const metrics = await paintRegistryMetrics();
    const donutContainer = document.getElementById('severityDonutContainer');
    if (donutContainer) {
      window.RetinaCharts.renderSeverityDonut(donutContainer, metrics.stages, 'Patients');
    }

    const progressionContainer = document.getElementById('dashboardProgressionContainer');
    if (progressionContainer) {
      window.RetinaCharts.renderProgressionMix(progressionContainer, metrics);
    }

    const volumeContainer = document.getElementById('dashboardVolumeContainer');
    if (volumeContainer) {
      window.RetinaCharts.renderScreeningTrends(volumeContainer, metrics.allScans);
    }

    const activityContainer = document.getElementById('recentActivityFeed');
    if (activityContainer) {
      const events = collectScanRows().slice(0, 6);
      activityContainer.innerHTML = events.length ? events.map(row => `
        <div style="display: flex; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--slate-100);">
          <div style="width: 10px; height: 10px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; background: ${progressionColor(row.progression.status)}; box-shadow: 0 0 8px ${progressionColor(row.progression.status)};"></div>
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 2px;">
              <h5 style="font-size: 0.85rem; font-weight: 700; color: var(--color-deep-navy);">${row.progression.shortTitle}</h5>
              <span style="font-size: 0.72rem; color: var(--slate-400);">${row.scan.date}</span>
            </div>
            <p style="font-size: 0.8rem; color: var(--slate-600); line-height: 1.35;">${row.patient.name} (${row.patient.id}) · ${row.scan.eyeLabel || row.scan.eye || 'OD'} · Stage ${row.scan.stage}</p>
          </div>
        </div>
      `).join('') : '<p class="chart-empty">No stored scans yet.</p>';
    }
    renderNotifications();

    // Render Recent Scans Table on Dashboard
    const recentScansTbody = document.getElementById('dashboardRecentScansTbody');
    if (recentScansTbody) {
      const patients = window.RetinaData.getPatients();
      const allScans = [];
      patients.forEach(p => {
        p.scans.forEach(s => {
          allScans.push({ patient: p, scan: s });
        });
      });
      // Sort newest first
      allScans.sort((a, b) => new Date(b.scan.date) - new Date(a.scan.date));

      recentScansTbody.innerHTML = allScans.slice(0, 5).map(item => `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 34px; height: 34px; border-radius: 50%; background: var(--color-soft-blue); color: var(--color-royal-blue); font-weight: 700; display: flex; align-items: center; justify-content: center; font-size: 0.8rem;">
                ${item.patient.name.split(' ').map(n=>n[0]).join('')}
              </div>
              <div>
                <a href="#profile" class="patient-link" data-id="${item.patient.id}" style="font-weight: 700; color: var(--color-deep-navy); text-decoration: none; font-size: 0.875rem;">
                  ${item.patient.name}
                </a>
                <div style="font-size: 0.75rem; color: var(--slate-400);">${item.patient.id}</div>
              </div>
            </div>
          </td>
          <td>
            <span style="font-weight: 600; font-size: 0.825rem; color: var(--slate-700);">${item.scan.eyeLabel}</span>
          </td>
          <td>
            <span class="badge badge-stage-${item.scan.stage}">
              Stage ${item.scan.stage}: ${item.scan.stageData.shortLabel}
            </span>
          </td>
          <td>
            <span style="font-family: var(--font-mono); font-size: 0.825rem; font-weight: 600; color: var(--color-royal-blue);">
              ${item.scan.confidence}%
            </span>
          </td>
          <td>
            <span style="font-size: 0.825rem; color: var(--slate-500);">${item.scan.date}</span>
          </td>
          <td style="text-align: right;">
            <button class="btn btn-secondary btn-sm action-compare-btn" data-patient-id="${item.patient.id}" data-eye="${item.scan.eye || 'OD'}">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 21v-4"/><path d="m9 8 3-3 3 3"/><path d="M21 16v5h-5"/><path d="M3 16v5h5"/></svg>
              Compare
            </button>
          </td>
        </tr>
      `).join('');

      // Attach Compare Button Click Handlers
      recentScansTbody.querySelectorAll('.action-compare-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const pid = btn.getAttribute('data-patient-id');
          state.selectedComparisonPatientId = pid;
          state.selectedComparisonEye = btn.getAttribute('data-eye') || null;
          window.location.hash = 'comparison';
        });
      });

      // Attach Patient Profile Click Handlers
      recentScansTbody.querySelectorAll('.patient-link').forEach(link => {
        link.addEventListener('click', () => {
          const pid = link.getAttribute('data-id');
          state.currentProfilePatientId = pid;
          window.location.hash = 'profile';
        });
      });
    }
  }

  /* --------------------------------------------------------------------------
     AI DETECTION VIEW
     -------------------------------------------------------------------------- */
  function initDetection() {
    const scanDateField = document.getElementById('detectionScanDate');
    if (scanDateField) scanDateField.value = new Date().toISOString().split('T')[0];

    const dropzone = document.getElementById('retinaDropzone');
    const fileInput = document.getElementById('retinaFileInput');
    const previewImg = document.getElementById('detectionPreviewImage');
    const heatmapCanvas = document.getElementById('detectionHeatmapCanvas');
    const analyzeBtn = document.getElementById('startAnalysisBtn');
    const stepperContainer = document.getElementById('analysisStepperContainer');
    const resultsContainer = document.getElementById('analysisResultsContainer');
    const toggleHeatmapBtn = document.getElementById('toggleHeatmapBtn');
    const patientSelect = document.getElementById('detectionPatientSelect');

    // Populate patient select options
    function refreshPatientSelect() {
      if (!patientSelect) return;
      const patients = window.RetinaData.getPatients();
      patientSelect.innerHTML = patients.map(p => `
        <option value="${p.id}" ${p.id === state.detection.selectedPatientId ? 'selected' : ''}>
          ${p.name} (${p.id}) - ${p.diabetesType}
        </option>
      `).join('');
    }
    refreshPatientSelect();

    if (patientSelect) {
      patientSelect.addEventListener('change', (e) => {
        state.detection.selectedPatientId = e.target.value;
      });
    }

    // Eye Selector Pills (OD / OS)
    document.querySelectorAll('.eye-btn-detect').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.eye-btn-detect').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.detection.selectedEye = btn.getAttribute('data-eye');
      });
    });

    // Sample Thumbnail Presets Click Handlers
    document.querySelectorAll('.sample-thumbnail-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.sample-thumbnail-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const imgPath = pill.getAttribute('data-img');
        const stageVal = parseInt(pill.getAttribute('data-stage'), 10);
        state.detection.imageSrc = imgPath;
        state.detection.forcedStage = stageVal;
        if (previewImg) previewImg.src = imgPath;
        if (resultsContainer) resultsContainer.style.display = 'none';
        if (stepperContainer) stepperContainer.style.display = 'none';
      });
    });

    // Dropzone Click & Drag Events
    if (dropzone && fileInput) {
      dropzone.addEventListener('click', (e) => {
        if (!e.target.closest('.sample-retina-strip')) {
          fileInput.click();
        }
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          dropzone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          dropzone.classList.remove('dragover');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files && files[0]) {
          handleUploadedFile(files[0]);
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          handleUploadedFile(e.target.files[0]);
        }
      });
    }

    function handleUploadedFile(file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        state.detection.imageSrc = event.target.result;
        state.detection.forcedStage = undefined;
        if (previewImg) previewImg.src = event.target.result;
        if (resultsContainer) resultsContainer.style.display = 'none';
        if (stepperContainer) stepperContainer.style.display = 'none';
      };
      reader.readAsDataURL(file);
    }

    // Heatmap Toggle Button
    if (toggleHeatmapBtn && heatmapCanvas) {
      toggleHeatmapBtn.addEventListener('click', () => {
        state.detection.showHeatmap = !state.detection.showHeatmap;
        heatmapCanvas.style.display = state.detection.showHeatmap ? 'block' : 'none';
        toggleHeatmapBtn.classList.toggle('active', state.detection.showHeatmap);
      });
    }

    // Run AI Analysis Button
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', async () => {
        if (state.detection.isAnalyzing) return;
        state.detection.isAnalyzing = true;
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = `
          <svg class="spin-loader" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          Analyzing Retinal Fundus...
        `;

        if (resultsContainer) resultsContainer.style.display = 'none';
        const viewport = document.getElementById('detectionViewport');
        const progress = document.getElementById('analysisProgress');
        const progressBar = document.getElementById('analysisProgressBar');
        const progressLabel = document.getElementById('analysisProgressLabel');
        if (viewport) viewport.classList.add('scanning');
        if (progress) progress.hidden = false;
        if (progressBar) progressBar.style.width = '8%';
        if (progressLabel) progressLabel.textContent = 'Starting local analysis';
        if (stepperContainer) {
          stepperContainer.style.display = 'flex';
          stepperContainer.querySelectorAll('.step-item').forEach(s => {
            s.classList.remove('active', 'completed');
          });
        }

        const scanDateInput = document.getElementById('detectionScanDate');
        const scanDate = scanDateInput ? scanDateInput.value : new Date().toISOString().split('T')[0];

        try {
          const result = await window.RetinaAI.analyzeFundusScan({
            imageSrc: state.detection.imageSrc,
            patientId: state.detection.selectedPatientId,
            eye: state.detection.selectedEye,
            scanDate: scanDate,
            forcedStage: state.detection.forcedStage
          }, (stepIndex) => {
            if (progressBar) progressBar.style.width = `${Math.min(100, (stepIndex / 5) * 100)}%`;
            if (progressLabel) progressLabel.textContent = `Analysis step ${stepIndex} of 5`;
            if (stepperContainer) {
              const currentStep = stepperContainer.querySelector(`.step-item[data-step="${stepIndex}"]`);
              if (currentStep) currentStep.classList.add('active');
              for (let j = 1; j < stepIndex; j++) {
                const prevStep = stepperContainer.querySelector(`.step-item[data-step="${j}"]`);
                if (prevStep) {
                  prevStep.classList.remove('active');
                  prevStep.classList.add('completed');
                }
              }
            }
          });

          state.detection.lastResult = result;
          renderDetectionResults(result);

          // Draw Grad-CAM overlay on canvas
          if (heatmapCanvas) {
            heatmapCanvas.width = 600;
            heatmapCanvas.height = 600;
            window.RetinaAI.renderGradCamOverlay(heatmapCanvas, result.stage);
            heatmapCanvas.style.display = state.detection.showHeatmap ? 'block' : 'none';
          }
        } catch (err) {
          console.error('Detection analysis error:', err);
          showToast('The local classifier could not finish this image.');
        } finally {
          state.detection.isAnalyzing = false;
          document.getElementById('detectionViewport')?.classList.remove('scanning');
          const progress = document.getElementById('analysisProgress');
          if (progress) progress.hidden = true;
          analyzeBtn.disabled = false;
          analyzeBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m10 15 5-3-5-3v6Z"/></svg>
            Analyze Retinal Fundus Scan
          `;
        }
      });
    }

    // Save To Patient Record Button
    const saveToPatientBtn = document.getElementById('saveScanToPatientBtn');
    if (saveToPatientBtn) {
      saveToPatientBtn.addEventListener('click', () => {
        if (!state.detection.lastResult) return;
        const res = state.detection.lastResult;
        const newScan = {
          id: res.scanId,
          date: res.date,
          eye: res.eye,
          eyeLabel: res.eyeLabel,
          stage: res.stage,
          stageData: res.stageData,
          confidence: res.confidence,
          lesionCount: res.lesionCount,
          image: res.image,
          label: `AI Scan (${res.stageData.shortLabel})`
        };
        window.RetinaData.addScanToPatient(res.patientId, newScan).then(() => {
          showToast(`Scan saved to ${res.patientId}. Opening the same-eye comparison.`);
          state.selectedComparisonPatientId = res.patientId;
          state.selectedComparisonEye = res.eye;
          refreshComparisonSelector();
          window.location.hash = 'comparison';
        }).catch(error => showToast(error.message));
      });
    }

    // Quick Compare with Prior Scan Button
    const quickCompareBtn = document.getElementById('quickCompareBtn');
    if (quickCompareBtn) {
      quickCompareBtn.addEventListener('click', () => {
        if (state.detection.lastResult) {
          state.selectedComparisonPatientId = state.detection.lastResult.patientId;
          state.selectedComparisonEye = state.detection.lastResult.eye;
        }
        window.location.hash = 'comparison';
      });
    }
  }

  function renderDetectionResults(result) {
    const resultsContainer = document.getElementById('analysisResultsContainer');
    if (!resultsContainer) return;
    resultsContainer.style.display = 'block';
    const engineNote = document.getElementById('resultEngineNote');
    if (engineNote) {
      engineNote.textContent = result.image && String(result.image).includes('stage')
        ? 'Sample image grade comes from the built-in stage preset, not a loaded neural network.'
        : 'Uploaded images are graded by the in-browser demonstration routine. No model file is loaded, so this is not a clinical prediction.';
    }

    const stageData = result.stageData;
    document.getElementById('resultStageBadge').innerHTML = `
      <span class="badge badge-stage-${result.stage}" style="font-size: 0.95rem; padding: 6px 14px;">
        Stage ${result.stage}: ${stageData.label}
      </span>
    `;
    document.getElementById('resultConfidenceVal').textContent = `${result.confidence}%`;
    document.getElementById('resultConfidenceBar').style.width = `${result.confidence}%`;
    document.getElementById('resultRiskTier').textContent = stageData.riskTier;
    document.getElementById('resultIcdCode').textContent = stageData.icd10;
    document.getElementById('resultFindingsText').textContent = stageData.findings;
    document.getElementById('resultActionPlanText').textContent = stageData.actionPlan;

    // Lesion Counts
    document.getElementById('metricMicroaneurysms').textContent = result.lesionCount.microaneurysms;
    document.getElementById('metricHemorrhages').textContent = result.lesionCount.hemorrhages;
    document.getElementById('metricExudates').textContent = result.lesionCount.exudates;
    document.getElementById('metricCottonWool').textContent = result.lesionCount.cottonWool;
    document.getElementById('metricNeovascular').textContent = result.lesionCount.neovascularization > 0 ? 'Detected (NVD/NVE)' : 'None';
  }

  /* --------------------------------------------------------------------------
     SCAN COMPARISON VIEW (THE CORE MODULE)
     -------------------------------------------------------------------------- */
  function initComparison() {
    const patientSelector = document.getElementById('comparisonPatientSelect');
    const viewSideBySideBtn = document.getElementById('toggleSideBySideBtn');
    const viewCurtainBtn = document.getElementById('toggleCurtainBtn');

    // Populate comparison patient dropdown
    refreshComparisonSelector = function () {
      if (!patientSelector) return;
      const patients = window.RetinaData.getPatients();
      if (!patients.some(patient => patient.id === state.selectedComparisonPatientId) && patients[0]) {
        state.selectedComparisonPatientId = patients[0].id;
      }
      patientSelector.innerHTML = patients.map(p => `
        <option value="${p.id}" ${p.id === state.selectedComparisonPatientId ? 'selected' : ''}>
          ${p.name} (${p.id})
        </option>
      `).join('');
    };
    refreshComparisonSelector();

    if (patientSelector) {
      patientSelector.addEventListener('change', (e) => {
        state.selectedComparisonPatientId = e.target.value;
        state.selectedComparisonEye = null;
        updateComparisonView();
      });
    }

    const eyeSelector = document.getElementById('comparisonEyeSelect');
    if (eyeSelector) {
      eyeSelector.addEventListener('change', (event) => {
        state.selectedComparisonEye = event.target.value;
        updateComparisonView();
      });
    }

    if (viewSideBySideBtn && viewCurtainBtn) {
      viewSideBySideBtn.addEventListener('click', () => {
        state.activeComparisonView = 'side-by-side';
        viewSideBySideBtn.classList.add('active');
        viewCurtainBtn.classList.remove('active');
        updateComparisonLayout();
      });

      viewCurtainBtn.addEventListener('click', () => {
        state.activeComparisonView = 'curtain';
        viewCurtainBtn.classList.add('active');
        viewSideBySideBtn.classList.remove('active');
        updateComparisonLayout();
      });
    }

    // Initialize the curtain slider
    const curtainContainer = document.getElementById('interactiveCurtainContainer');
    if (curtainContainer) {
      window.RetinaComparison.initCurtainSlider(curtainContainer);
    }
  }

  function updateComparisonLayout() {
    const sideBySideWrapper = document.getElementById('comparisonSideBySideWrapper');
    const curtainWrapper = document.getElementById('comparisonCurtainWrapper');

    if (state.activeComparisonView === 'side-by-side') {
      if (sideBySideWrapper) sideBySideWrapper.style.display = 'grid';
      if (curtainWrapper) curtainWrapper.style.display = 'none';
    } else {
      if (sideBySideWrapper) sideBySideWrapper.style.display = 'none';
      if (curtainWrapper) curtainWrapper.style.display = 'block';
    }
  }

  function updateComparisonView() {
    const patient = window.RetinaData.getPatientById(state.selectedComparisonPatientId);
    if (!patient) return;

    const eyes = availableEyes(patient);
    if (!state.selectedComparisonEye || !eyes.includes(state.selectedComparisonEye)) {
      state.selectedComparisonEye = latestEye(patient);
    }
    const eyeSelect = document.getElementById('comparisonEyeSelect');
    if (eyeSelect) {
      eyeSelect.innerHTML = eyes.map(eye => `
        <option value="${eye}">${eye === 'OS' ? 'Left eye (OS)' : 'Right eye (OD)'}</option>
      `).join('');
      eyeSelect.value = state.selectedComparisonEye;
    }
    const classified = classifyPatient(patient, state.selectedComparisonEye);
    const scans = classified.series;
    const prevScan = classified.prev;
    const currScan = classified.curr;
    const otherEyeCount = (patient.scans || []).filter(scan => (scan.eye || 'OD') !== classified.eye).length;
    const eyeNote = document.getElementById('compEyeNote');
    if (eyeNote) {
      eyeNote.textContent = otherEyeCount
        ? `${otherEyeCount} scan${otherEyeCount === 1 ? '' : 's'} of the other eye stay out of this comparison.`
        : 'Only scans of this patient and this eye are compared.';
    }

    // Patient Meta in Banner
    document.getElementById('compPatientName').textContent = patient.name;
    document.getElementById('compPatientId').textContent = `${patient.id} • ${patient.age}y / ${patient.gender} • ${patient.diabetesType}`;
    document.getElementById('compPatientHbA1c').textContent = `HbA1c: ${patient.hba1c} • Duration: ${patient.diabetesDuration}`;

    // Evaluate Progression
    const prog = classified.prog;

    // Update Progression Banner (TEXT + ICON, NOT COLOR ALONE)
    const progBadgeEl = document.getElementById('compProgressionBadge');
    if (progBadgeEl) {
      progBadgeEl.className = `comparison-progression-pill ${prog.badgeClass}`;
      progBadgeEl.innerHTML = `
        ${prog.iconSvg}
        <span>${prog.title}</span>
      `;
    }

    document.getElementById('compSeverityDiffText').textContent = prog.differenceText;
    document.getElementById('compTimeElapsedText').textContent = prog.elapsedText || 'Baseline examination';
    document.getElementById('compProgressionSummary').textContent = prog.summary;
    document.getElementById('compClinicalActionAlert').textContent = prog.actionAlert;

    // Update Prior Scan Card
    if (prevScan) {
      document.getElementById('prevScanImage').src = prevScan.image;
      document.getElementById('prevScanDate').textContent = prevScan.date;
      document.getElementById('prevScanEye').textContent = prevScan.eyeLabel;
      document.getElementById('prevScanGradeBadge').innerHTML = `
        <span class="badge badge-stage-${prevScan.stage}">Stage ${prevScan.stage}: ${prevScan.stageData.shortLabel}</span>
      `;
      document.getElementById('prevScanMicroaneurysms').textContent = prevScan.lesionCount.microaneurysms;
      document.getElementById('prevScanHemorrhages').textContent = prevScan.lesionCount.hemorrhages;
      document.getElementById('prevScanExudates').textContent = prevScan.lesionCount.exudates;
    } else {
      document.getElementById('prevScanImage').src = 'assets/images/samples/retina-stage0.svg';
      document.getElementById('prevScanDate').textContent = 'N/A';
      document.getElementById('prevScanEye').textContent = 'N/A';
      document.getElementById('prevScanGradeBadge').innerHTML = `
        <span class="badge" style="background:#F1F5F9; color:#64748B;">No Prior Scan</span>
      `;
      document.getElementById('prevScanMicroaneurysms').textContent = '0';
      document.getElementById('prevScanHemorrhages').textContent = '0';
      document.getElementById('prevScanExudates').textContent = '0';
    }

    // Update Current Scan Card
    if (currScan) {
      document.getElementById('currScanImage').src = currScan.image;
      document.getElementById('currScanDate').textContent = currScan.date;
      document.getElementById('currScanEye').textContent = currScan.eyeLabel;
      document.getElementById('currScanGradeBadge').innerHTML = `
        <span class="badge badge-stage-${currScan.stage}">Stage ${currScan.stage}: ${currScan.stageData.shortLabel}</span>
      `;
      document.getElementById('currScanMicroaneurysms').textContent = currScan.lesionCount.microaneurysms;
      document.getElementById('currScanHemorrhages').textContent = currScan.lesionCount.hemorrhages;
      document.getElementById('currScanExudates').textContent = currScan.lesionCount.exudates;
    }

    // Update Curtain Split Images
    const curtainBeforeImg = document.getElementById('curtainBeforeImage');
    const curtainAfterImg = document.getElementById('curtainAfterImage');
    if (curtainBeforeImg && curtainAfterImg) {
      curtainBeforeImg.src = (prevScan || currScan)?.image || 'assets/images/samples/retina-stage0.svg';
      curtainAfterImg.src = currScan?.image || 'assets/images/samples/retina-stage0.svg';
    }

    // Render Longitudinal Progression Trajectory Graph
    const compTrajectoryContainer = document.getElementById('compTrajectoryChartContainer');
    if (compTrajectoryContainer) {
      window.RetinaCharts.renderProgressionTrajectory(compTrajectoryContainer, scans);
    }

    updateComparisonLayout();
  }

  /* --------------------------------------------------------------------------
     PATIENTS DIRECTORY VIEW
     -------------------------------------------------------------------------- */
  function openEditPatient(id) {
    const patient = window.RetinaData.getPatientById(id);
    if (!patient) return;
    document.getElementById('editPatientId').value = patient.id;
    document.getElementById('editPatientName').value = patient.name || '';
    document.getElementById('editPatientAge').value = patient.age || '';
    document.getElementById('editPatientGender').value = patient.gender || 'Female';
    document.getElementById('editPatientHbA1c').value = patient.hba1c || '';
    document.getElementById('editPatientNotes').value = patient.clinicalNotes || '';
    document.getElementById('editPatientModal').classList.add('active');
  }

  function initPatients() {
    renderPatientsTable();

    // Add Patient Form Submit
    const addPatientForm = document.getElementById('addPatientForm');
    if (addPatientForm) {
      addPatientForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!window.RetinaAuth.can('patients.write')) return;
        const name = document.getElementById('newPatientName').value.trim();
        const age = parseInt(document.getElementById('newPatientAge').value, 10);
        const gender = document.getElementById('newPatientGender').value;
        const diabetesType = document.getElementById('newPatientDiabetesType').value;
        const hba1c = document.getElementById('newPatientHbA1c').value.trim() || '7.5%';
        const notes = document.getElementById('newPatientNotes').value.trim();

        const newPatient = {
          id: 'DR-2026-' + Math.floor(1000 + Math.random() * 9000),
          name: name,
          age: age,
          gender: gender,
          dob: '1970-01-01',
          diabetesType: diabetesType,
          diabetesDuration: '3 years',
          hba1c: hba1c,
          visualAcuityOD: '20/25',
          visualAcuityOS: '20/20',
          primaryDoctor: (window.RetinaAuth.user && window.RetinaAuth.user.name) || 'Unassigned',
          lastVisitDate: '—',
          clinicalNotes: notes || 'Registered without a retinal scan.',
          progressionType: 'baseline',
          scans: []
        };

        try {
          const saved = await window.RetinaData.addPatient(newPatient);
          closeAllModals();
          addPatientForm.reset();
          renderPatientsTable();
          paintRegistryMetrics();
          refreshComparisonSelector();
          showToast(`${saved.name} registered as ${saved.id}. No scan was created. Use AI Detection to store the first image.`);
          window.location.hash = 'patients';
        } catch (error) {
          showToast(error.message);
        }
      });
    }
    const editForm = document.getElementById('editPatientForm');
    if (editForm) {
      editForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          const id = document.getElementById('editPatientId').value;
          await window.RetinaData.updatePatient(id, {
            name: document.getElementById('editPatientName').value.trim(),
            age: Number(document.getElementById('editPatientAge').value),
            gender: document.getElementById('editPatientGender').value,
            hba1c: document.getElementById('editPatientHbA1c').value.trim(),
            clinicalNotes: document.getElementById('editPatientNotes').value.trim()
          });
          closeAllModals();
          renderPatientsTable();
          showToast('Patient record updated.');
        } catch (error) {
          showToast(error.message);
        }
      });
    }
  }

  function renderPatientsTable(filterQuery = '') {
    const tbody = document.getElementById('patientsTableBody');
    if (!tbody) return;

    let patients = window.RetinaData.getPatients();
    if (filterQuery) {
      patients = patients.filter(p => 
        p.name.toLowerCase().includes(filterQuery) ||
        p.id.toLowerCase().includes(filterQuery) ||
        p.diabetesType.toLowerCase().includes(filterQuery)
      );
    }

    tbody.innerHTML = patients.map(p => {
      const classified = classifyPatient(p);
      const latestScan = classified.curr;
      const stageData = latestScan ? (latestScan.stageData || window.RetinaData.ICDR_STAGES[latestScan.stage]) : null;

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, var(--color-royal-blue), var(--color-cyan)); color: #fff; font-weight: 800; display: flex; align-items: center; justify-content: center; font-size: 0.85rem;">
                ${p.name.split(' ').map(n=>n[0]).join('')}
              </div>
              <div>
                <a href="#profile" class="patient-profile-link" data-id="${p.id}" style="font-weight: 700; color: var(--color-deep-navy); text-decoration: none;">
                  ${p.name}
                </a>
                <div style="font-size: 0.75rem; color: var(--slate-400);">${p.id}</div>
              </div>
            </div>
          </td>
          <td>
            <span style="font-weight: 600; color: var(--slate-700);">${p.age}y / ${p.gender}</span>
          </td>
          <td>
            <span style="font-size: 0.825rem; color: var(--slate-600);">${p.diabetesType}</span>
            <div style="font-size: 0.72rem; color: var(--slate-400);">HbA1c: ${p.hba1c}</div>
          </td>
          <td>
            ${latestScan ? `<span class="badge badge-stage-${latestScan.stage}">Stage ${latestScan.stage}: ${stageData.shortLabel}</span>` : '<span class="badge">No scan</span>'}
          </td>
          <td>
            <span class="badge-progression ${classified.prog.badgeClass || 'baseline'}" style="font-size: 0.75rem;">
              ${latestScan ? classified.prog.shortTitle : 'No scan'}
            </span>
          </td>
          <td>
            <span style="font-size: 0.825rem; color: var(--slate-500);">${p.lastVisitDate}</span>
          </td>
          <td style="text-align: right;">
            <div style="display: inline-flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end;">
              <button class="btn btn-secondary btn-sm table-view-profile" data-id="${p.id}">Profile</button>
              <button class="btn btn-outline btn-sm table-compare-btn" data-id="${p.id}">Compare</button>
              ${window.RetinaAuth.can('patients.write') ? `<button class="btn btn-outline btn-sm table-edit-patient" data-id="${p.id}">Edit</button>` : ''}
              ${window.RetinaAuth.can('patients.delete') ? `<button class="btn btn-outline btn-sm table-delete-patient" data-id="${p.id}">Delete</button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach listeners
    tbody.querySelectorAll('.table-view-profile, .patient-profile-link').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        state.currentProfilePatientId = btn.getAttribute('data-id');
        window.location.hash = 'profile';
      });
    });

    tbody.querySelectorAll('.table-edit-patient').forEach(btn => {
      btn.addEventListener('click', () => openEditPatient(btn.getAttribute('data-id')));
    });
    tbody.querySelectorAll('.table-delete-patient').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!window.confirm('Delete this patient and their scans from the server?')) return;
        try {
          await window.RetinaData.deletePatient(id);
          renderPatientsTable();
          paintRegistryMetrics();
          showToast(`${id} was deleted.`);
        } catch (error) {
          showToast(error.message);
        }
      });
    });
    tbody.querySelectorAll('.table-compare-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedComparisonPatientId = btn.getAttribute('data-id');
        state.selectedComparisonEye = null;
        window.location.hash = 'comparison';
      });
    });
  }

  /* --------------------------------------------------------------------------
     PATIENT PROFILE VIEW
     -------------------------------------------------------------------------- */
  function initProfile() {
    // Download Report Button
    const downloadReportBtn = document.getElementById('downloadPatientReportBtn');
    if (downloadReportBtn) {
      downloadReportBtn.addEventListener('click', () => {
        window.print();
      });
    }

    // New Scan for this patient button
    const newScanForPatientBtn = document.getElementById('newScanForPatientBtn');
    if (newScanForPatientBtn) {
      newScanForPatientBtn.addEventListener('click', () => {
        state.detection.selectedPatientId = state.currentProfilePatientId;
        window.location.hash = 'detection';
      });
    }
  }

  function renderPatientProfile(patientId) {
    const patient = window.RetinaData.getPatientById(patientId);
    if (!patient) return;

    document.getElementById('profilePatientName').textContent = patient.name;
    document.getElementById('profilePatientId').textContent = patient.id;
    document.getElementById('profilePatientMeta').textContent = `${patient.age} years old • ${patient.gender} • DOB: ${patient.dob}`;
    document.getElementById('profileDiabetesType').textContent = patient.diabetesType;
    document.getElementById('profileDiabetesDuration').textContent = patient.diabetesDuration;
    document.getElementById('profileHbA1c').textContent = patient.hba1c;
    document.getElementById('profileVisualAcuityOD').textContent = patient.visualAcuityOD;
    document.getElementById('profileVisualAcuityOS').textContent = patient.visualAcuityOS;
    document.getElementById('profileDoctor').textContent = patient.primaryDoctor;
    document.getElementById('profileClinicalNotes').textContent = patient.clinicalNotes;

    // Render Scans Gallery
    const galleryContainer = document.getElementById('profileScansGallery');
    if (galleryContainer) {
      galleryContainer.innerHTML = (patient.scans || []).map((scan, i) => `
        <div class="med-card" style="padding: 14px; display: flex; flex-direction: column; gap: 10px;">
          <div style="position: relative; background: #000; border-radius: var(--radius-sm); overflow: hidden; height: 180px; display: flex; align-items: center; justify-content: center;">
            <img src="${scan.image}" style="max-height: 100%; max-width: 100%; object-fit: contain;">
            <span class="badge badge-stage-${scan.stage}" style="position: absolute; top: 8px; right: 8px;">
              Stage ${scan.stage}
            </span>
          </div>
          <div>
            <div style="font-weight: 700; font-size: 0.85rem; color: var(--color-deep-navy);">${scan.label || 'Retinal Scan'}</div>
            <div style="font-size: 0.75rem; color: var(--slate-400);">${scan.date} • ${scan.eyeLabel}</div>
          </div>
          <div style="font-size: 0.75rem; color: var(--slate-600); line-height: 1.3;">
            MA: ${scan.lesionCount.microaneurysms} | Hemo: ${scan.lesionCount.hemorrhages} | Exudates: ${scan.lesionCount.exudates}
          </div>
        </div>
      `).join('');
    }

    // Render AI Prediction History Table
    const historyTbody = document.getElementById('profileHistoryTbody');
    if (historyTbody) {
      historyTbody.innerHTML = (patient.scans || []).map(s => `
        <tr>
          <td><span style="font-family: var(--font-mono); font-weight: 600;">${s.id}</span></td>
          <td>${s.date}</td>
          <td>${s.eyeLabel}</td>
          <td><span class="badge badge-stage-${s.stage}">Stage ${s.stage}: ${s.stageData.shortLabel}</span></td>
          <td><span style="font-family: var(--font-mono); font-weight: 700; color: var(--color-royal-blue);">${s.confidence}%</span></td>
          <td>${s.lesionCount.neovascularization > 0 ? 'High Risk' : 'Standard'}</td>
        </tr>
      `).join('');
    }

    // Render Progression Graph
    const profileTrajectoryContainer = document.getElementById('profileTrajectoryContainer');
    if (profileTrajectoryContainer) {
      window.RetinaCharts.renderProgressionTrajectory(profileTrajectoryContainer, patient.scans || []);
    }
  }

  /* --------------------------------------------------------------------------
     ANALYTICS & REPORTS VIEWS
     -------------------------------------------------------------------------- */
  function initAnalytics() {
    renderAnalyticsWidgets();
  }

  async function renderAnalyticsWidgets() {
    const metrics = await paintRegistryMetrics();
    const analyticsDonut = document.getElementById('analyticsDonutContainer');
    if (analyticsDonut) {
      window.RetinaCharts.renderSeverityDonut(analyticsDonut, metrics.stages, 'Patients');
    }

    const analyticsScreening = document.getElementById('analyticsScreeningContainer');
    if (analyticsScreening) {
      window.RetinaCharts.renderScreeningTrends(analyticsScreening, metrics.allScans);
    }
  }

  function renderClinicalReport() {
    const sheet = document.getElementById('clinicalReportSheet');
    if (!sheet) return;
    const patient = window.RetinaData.getPatientById(state.currentProfilePatientId) || window.RetinaData.getPatients()[0];
    const printButton = document.getElementById('printReferralReportBtn');
    if (!patient) {
      sheet.innerHTML = '<p>No patient record is available for a report.</p>';
      return;
    }
    const classified = classifyPatient(patient);
    const curr = classified.curr;
    const stageLabel = curr && curr.stageData ? curr.stageData.label : 'No scan stored';
    const stage = curr ? curr.stage : '—';
    const eye = curr ? (curr.eyeLabel || curr.eye || classified.eye) : '—';
    const generated = new Date().toISOString().slice(0, 10);
    sheet.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; border-bottom:1px solid var(--cc-border, #20314A); padding-bottom:16px; margin-bottom:20px;">
        <div>
          <p class="report-kicker">RetinaGuard AI</p>
          <h2 style="font-size:1.35rem;">Clinical summary</h2>
          <p>Built from the record stored in this browser. This is not a signed or accredited medical document.</p>
        </div>
        <div style="text-align:right; font-size:0.8rem; color:var(--cc-muted, #94A3B8);">
          <div>Prepared ${generated}</div>
          <div>Ref ${patient.id}</div>
        </div>
      </div>
      <div class="report-meta" style="margin-bottom:18px; font-size:0.88rem;">
        <div><strong>Patient</strong><br>${patient.name}</div>
        <div><strong>Patient ID</strong><br>${patient.id}</div>
        <div><strong>DOB</strong><br>${patient.dob || '—'} (${patient.age} yrs)</div>
        <div><strong>Diabetes</strong><br>${patient.diabetesType || '—'} · ${patient.diabetesDuration || '—'}</div>
        <div><strong>HbA1c</strong><br>${patient.hba1c || '—'}</div>
        <div><strong>Latest eye</strong><br>${eye}</div>
      </div>
      <div style="margin-bottom:16px;">
        <span class="badge badge-stage-${curr ? curr.stage : 0}">Stage ${stage}: ${stageLabel}</span>
        <span class="badge-progression ${classified.prog.badgeClass}" style="margin-left:8px;">${classified.prog.shortTitle}</span>
      </div>
      <div class="report-findings">
        <h4 style="margin-bottom:6px;">Same-eye progression</h4>
        <p style="margin-bottom:12px;">${classified.prog.summary || 'No comparison is available.'}</p>
        <h4 style="margin-bottom:6px;">Follow-up note from the stored grade</h4>
        <p>${classified.prog.actionAlert || (curr && curr.stageData ? curr.stageData.actionPlan : 'Add a scan before printing a summary.')}</p>
      </div>
      <p style="margin-top:18px; font-size:0.8rem;">Assigned clinician on record: ${patient.primaryDoctor || 'Not recorded'}.</p>
    `;
    const actions = document.createElement('div');
    actions.className = 'report-actions';
    actions.style.cssText = 'margin-top:30px; text-align:center; display:flex; gap:12px; justify-content:center; flex-wrap:wrap;';
    if (window.RetinaAuth.can('reports.write')) {
      const saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.className = 'btn btn-secondary btn-lg';
      saveButton.textContent = 'Save report to server';
      saveButton.addEventListener('click', async () => {
        try {
          await window.RetinaApi.request('POST', '/api/reports', {
            patientId: patient.id,
            title: `Clinical summary · ${patient.name}`,
            body: `${classified.prog.summary || ''} ${classified.prog.actionAlert || ''}`.trim()
          });
          showToast('Report saved.');
          window.RetinaAdmin.renderReports();
        } catch (error) {
          showToast(error.message);
        }
      });
      actions.appendChild(saveButton);
    }
    if (printButton) actions.appendChild(printButton);
    sheet.appendChild(actions);
  }

  function initReports() {
    const printReportBtn = document.getElementById('printReferralReportBtn');
    if (printReportBtn) {
      printReportBtn.addEventListener('click', () => {
        window.print();
      });
    }
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
      settingsForm.addEventListener('submit', (event) => {
        event.preventDefault();
        showToast('Saved in this browser tab only. There is no settings server.');
      });
    }
  }

  function initHistoryFilters() {
    ['historySearch', 'historyDateFrom', 'historyDateTo', 'historySeverity'].forEach(id => {
      const field = document.getElementById(id);
      if (!field) return;
      field.addEventListener('input', renderScanHistory);
      field.addEventListener('change', renderScanHistory);
    });
  }

  function renderScanHistory() {
    const tbody = document.getElementById('scanHistoryBody');
    if (!tbody) return;
    const query = (document.getElementById('historySearch')?.value || '').trim().toLowerCase();
    const from = document.getElementById('historyDateFrom')?.value || '';
    const to = document.getElementById('historyDateTo')?.value || '';
    const severity = document.getElementById('historySeverity')?.value || '';
    const rows = collectScanRows().filter(row => {
      const haystack = `${row.patient.name} ${row.patient.id}`.toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (from && row.scan.date < from) return false;
      if (to && row.scan.date > to) return false;
      if (severity !== '' && String(row.scan.stage) !== severity) return false;
      return true;
    });
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7">No scans match these filters.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(row => `
      <tr>
        <td>
          <button type="button" class="patient-link history-profile" data-id="${row.patient.id}">${row.patient.name}</button>
          <div class="muted-id">${row.patient.id}</div>
        </td>
        <td>${row.scan.eyeLabel || row.scan.eye || 'OD'}</td>
        <td>${row.scan.date}</td>
        <td><span class="badge badge-stage-${row.scan.stage}">Stage ${row.scan.stage}: ${(row.scan.stageData || window.RetinaData.ICDR_STAGES[row.scan.stage]).shortLabel}</span></td>
        <td>${typeof row.scan.confidence === 'number' ? row.scan.confidence + '%' : '—'}</td>
        <td><span class="badge-progression ${row.progression.badgeClass}">${row.progression.shortTitle}</span></td>
        <td style="text-align: right;">
          <button type="button" class="btn btn-outline btn-sm history-profile" data-id="${row.patient.id}">Details</button>
          <button type="button" class="btn btn-secondary btn-sm history-compare" data-id="${row.patient.id}" data-eye="${row.scan.eye || 'OD'}">Compare</button>
          ${window.RetinaAuth.can('scans.delete') ? `<button type="button" class="btn btn-outline btn-sm history-delete" data-patient="${row.patient.id}" data-scan="${row.scan.id}">Delete</button>` : ''}
        </td>
      </tr>
    `).join('');
    tbody.querySelectorAll('.history-profile').forEach(button => {
      button.addEventListener('click', () => {
        state.currentProfilePatientId = button.getAttribute('data-id');
        window.location.hash = 'profile';
      });
    });
    tbody.querySelectorAll('.history-delete').forEach(button => {
      button.addEventListener('click', async () => {
        if (!window.confirm('Delete this scan? Same-eye comparison will use the scans that remain.')) return;
        try {
          await window.RetinaData.deleteScan(button.getAttribute('data-patient'), button.getAttribute('data-scan'));
          renderScanHistory();
          showToast('Scan deleted.');
        } catch (error) {
          showToast(error.message);
        }
      });
    });
    tbody.querySelectorAll('.history-compare').forEach(button => {
      button.addEventListener('click', () => {
        state.selectedComparisonPatientId = button.getAttribute('data-id');
        state.selectedComparisonEye = button.getAttribute('data-eye');
        window.location.hash = 'comparison';
      });
    });
  }

  /* --------------------------------------------------------------------------
     MODALS
     -------------------------------------------------------------------------- */
  function initModals() {
    // Open Add Patient Modal
    document.querySelectorAll('[data-modal="addPatientModal"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = document.getElementById('addPatientModal');
        if (modal) modal.classList.add('active');
      });
    });

    // Close Modal Buttons
    document.querySelectorAll('.modal-close-btn, .modal-cancel-btn').forEach(btn => {
      btn.addEventListener('click', closeAllModals);
    });

    // Close on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeAllModals();
      });
    });
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
  }

})();
