/**
 * RETINAGUARD AI – CLINICAL DATA VISUALIZATION ENGINE
 * Custom high-performance, crisp SVG/Canvas charting designed for healthcare dashboards.
 * Renders disease severity distributions, longitudinal progression trajectories,
 * and clinical risk trends with smooth animations and tooltips.
 */

window.RetinaCharts = (function () {
  'use strict';

  /**
   * Render Disease Severity Distribution Donut Chart
   * @param {HTMLElement} container - Target container
   * @param {Object} data - Counts for stages 0..4
   */
  function renderSeverityDonut(container, data, centerLabel) {
    if (!container) return;
    const stages = [
      { key: 'stage0', label: 'No DR', count: data.stage0 || 0, color: '#22D3A6', grade: 0 },
      { key: 'stage1', label: 'Mild NPDR', count: data.stage1 || 0, color: '#00CFFF', grade: 1 },
      { key: 'stage2', label: 'Moderate NPDR', count: data.stage2 || 0, color: '#FFB547', grade: 2 },
      { key: 'stage3', label: 'Severe NPDR', count: data.stage3 || 0, color: '#FF8A3D', grade: 3 },
      { key: 'stage4', label: 'Proliferative DR', count: data.stage4 || 0, color: '#FF5263', grade: 4 }
    ];

    const total = stages.reduce((acc, s) => acc + s.count, 0);
    if (!total) {
      container.innerHTML = '<p class="chart-empty">No graded patients in the registry yet.</p>';
      return;
    }
    const size = 220;
    const center = size / 2;
    const radius = 80;
    const strokeWidth = 24;

    let cumulativeAngle = -Math.PI / 2;
    let paths = '';

    stages.forEach(s => {
      const fraction = s.count / total;
      if (fraction <= 0) return;
      if (fraction >= 0.999) {
        paths += `
          <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${s.color}" stroke-width="${strokeWidth}">
            <title>${s.label}: ${s.count} patients</title>
          </circle>
        `;
        return;
      }
      const angle = fraction * 2 * Math.PI;
      const startAngle = cumulativeAngle;
      const endAngle = cumulativeAngle + angle;
      cumulativeAngle = endAngle;

      const x1 = center + radius * Math.cos(startAngle);
      const y1 = center + radius * Math.sin(startAngle);
      const x2 = center + radius * Math.cos(endAngle);
      const y2 = center + radius * Math.sin(endAngle);

      const largeArc = fraction > 0.5 ? 1 : 0;
      const d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;

      const pct = (fraction * 100).toFixed(1);
      paths += `
        <path d="${d}" fill="none" stroke="${s.color}" stroke-width="${strokeWidth}" 
              stroke-linecap="round" class="donut-slice" data-label="${s.label}: ${s.count} (${pct}%)"
              style="transition: stroke-width 0.2s ease; cursor: pointer;">
          <title>${s.label}: ${s.count} patients (${pct}%)</title>
        </path>
      `;
    });

    // Build Legend
    let legendHtml = '<div style="display: flex; flex-direction: column; gap: 8px; flex: 1; padding-left: 12px;">';
    stages.forEach(s => {
      const pct = ((s.count / total) * 100).toFixed(1);
      legendHtml += `
        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="width: 10px; height: 10px; border-radius: 50%; background: ${s.color}; display: inline-block;"></span>
            <span style="font-weight: 600; color: var(--color-deep-navy);">${s.label}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-weight: 700; color: var(--slate-800);">${s.count}</span>
            <span style="color: var(--slate-400); font-size: 0.75rem;">(${pct}%)</span>
          </div>
        </div>
      `;
    });
    legendHtml += '</div>';

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
        <div style="position: relative; width: ${size}px; height: ${size}px; margin: 0 auto;">
          <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            ${paths}
          </svg>
          <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">
            <span style="font-size: 1.6rem; font-weight: 800; color: var(--color-deep-navy); line-height: 1;">${total.toLocaleString()}</span>
            <span style="font-size: 0.72rem; color: var(--slate-500); text-transform: uppercase; font-weight: 600; margin-top: 4px;">${centerLabel || 'Patients'}</span>
          </div>
        </div>
        ${legendHtml}
      </div>
    `;
  }

  /**
   * Render Longitudinal Progression Trajectory Graph
   * @param {HTMLElement} container - Target container
   * @param {Array} scans - Array of scan records sorted chronologically
   */
  function renderProgressionTrajectory(container, scans) {
    if (!container) return;
    if (!scans || scans.length === 0) {
      container.innerHTML = '<p class="text-muted" style="text-align: center; padding: 20px;">No longitudinal scan history recorded yet.</p>';
      return;
    }

    const width = 640;
    const height = 220;
    const padX = 70;
    const padY = 40;
    const plotWidth = width - padX * 2;
    const plotHeight = height - padY * 2;

    const stageColors = ['#22D3A6', '#00CFFF', '#FFB547', '#FF8A3D', '#FF5263'];
    const stageLabels = ['Stage 0 (No DR)', 'Stage 1 (Mild)', 'Stage 2 (Mod)', 'Stage 3 (Sev)', 'Stage 4 (PDR)'];

    // Y Axis Grid lines (0 to 4)
    let gridLines = '';
    for (let g = 0; g <= 4; g++) {
      const y = height - padY - (g / 4) * plotHeight;
      gridLines += `
        <line x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}" stroke="#20314A" stroke-width="1" stroke-dasharray="3 3"/>
        <text x="${padX - 10}" y="${y + 4}" font-size="10" font-family="'Plus Jakarta Sans', sans-serif" fill="#94A3B8" text-anchor="end" font-weight="600">${g}</text>
      `;
    }

    // Points calculation
    const points = scans.map((s, idx) => {
      const x = scans.length === 1 
        ? padX + plotWidth / 2 
        : padX + (idx / (scans.length - 1)) * plotWidth;
      const y = height - padY - (s.stage / 4) * plotHeight;
      return { x, y, scan: s, color: stageColors[s.stage] };
    });

    // Trajectory path line
    let pathD = '';
    if (points.length > 1) {
      pathD = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        pathD += ` L ${points[i].x} ${points[i].y}`;
      }
    }

    // Circles and date labels
    let nodesHtml = '';
    points.forEach(pt => {
      nodesHtml += `
        <g class="trajectory-node" style="cursor: pointer;">
          <circle cx="${pt.x}" cy="${pt.y}" r="8" fill="#111C2E" stroke="${pt.color}" stroke-width="4" filter="drop-shadow(0 0 6px rgba(0,245,212,0.25))"/>
          <circle cx="${pt.x}" cy="${pt.y}" r="3" fill="${pt.color}"/>
          <text x="${pt.x}" y="${height - 12}" font-size="10.5" font-family="'Plus Jakarta Sans', sans-serif" fill="#94A3B8" text-anchor="middle" font-weight="600">${pt.scan.date}</text>
          <text x="${pt.x}" y="${pt.y - 14}" font-size="11" font-family="'Plus Jakarta Sans', sans-serif" fill="${pt.color}" text-anchor="middle" font-weight="800">Grade ${pt.scan.stage}</text>
          <title>${pt.scan.label}: Grade ${pt.scan.stage} (${pt.scan.stageData.shortLabel}) on ${pt.scan.date}</title>
        </g>
      `;
    });

    container.innerHTML = `
      <div style="width: 100%; overflow-x: auto;">
        <svg viewBox="0 0 ${width} ${height}" style="width: 100%; max-width: ${width}px; height: auto; display: block; margin: 0 auto;">
          <!-- Shaded Risk Zones -->
          <rect x="${padX}" y="${padY}" width="${plotWidth}" height="${plotHeight * 0.5}" fill="rgba(239, 68, 68, 0.04)" rx="4"/>
          <rect x="${padX}" y="${padY + plotHeight * 0.5}" width="${plotWidth}" height="${plotHeight * 0.5}" fill="rgba(16, 185, 129, 0.04)" rx="4"/>
          
          ${gridLines}
          
          ${pathD ? `<path d="${pathD}" fill="none" stroke="#00F5D4" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
          
          ${nodesHtml}
        </svg>
      </div>
    `;
  }

  /**
   * Render Population Monthly Early Screening Volume
   * @param {HTMLElement} container
   */
  function renderScreeningTrends(container, scans) {
    if (!container) return;
    const buckets = new Map();
    (scans || []).forEach(scan => {
      const date = new Date(scan.date);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleString('en', { month: 'short', year: '2-digit' });
      const current = buckets.get(key) || { key, label, count: 0 };
      current.count += 1;
      buckets.set(key, current);
    });
    const months = Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
    if (!months.length) {
      container.innerHTML = '<p class="chart-empty">No dated scans are stored yet.</p>';
      return;
    }
    const max = Math.max(...months.map(item => item.count), 1);
    const barsHtml = months.map(item => {
      const totalH = Math.max(8, (item.count / max) * 100);
      return `
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; height: 160px; justify-content: flex-end;">
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--color-deep-navy);">${item.count}</div>
          <div style="width: 28px; height: ${totalH}%; background: linear-gradient(180deg, var(--color-royal-blue), var(--color-cyan)); border-radius: 6px 6px 0 0; transition: height 0.4s ease;"></div>
          <div style="font-size: 0.72rem; font-weight: 600; color: var(--slate-500);">${item.label}</div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; height: 180px; padding: 10px 10px 0;">
        ${barsHtml}
      </div>
    `;
  }

  function renderProgressionMix(container, counts) {
    if (!container) return;
    const items = [
      { label: 'Improved', count: counts.improved || 0, color: '#22D3A6' },
      { label: 'Stable', count: counts.stable || 0, color: '#287BFF' },
      { label: 'Worsened', count: counts.worsened || 0, color: '#FF5263' },
      { label: 'First-time', count: counts.baseline || 0, color: '#A78BFA' }
    ];
    const max = Math.max(...items.map(item => item.count), 1);
    container.innerHTML = `
      <div class="mix-chart">
        ${items.map(item => `
          <div class="mix-row">
            <span class="mix-label">${item.label}</span>
            <div class="mix-track">
              <div class="mix-bar" style="width: ${(item.count / max) * 100}%; background: ${item.color};"></div>
            </div>
            <span class="mix-count">${item.count}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  return {
    renderSeverityDonut,
    renderProgressionTrajectory,
    renderScreeningTrends,
    renderProgressionMix
  };
})();
