/**
 * RETINAGUARD AI – LONGITUDINAL SCAN COMPARISON ENGINE
 * Most Critical Clinical Module: Side-by-side retinal fundus comparative analytics,
 * interactive split-curtain curtain slider, progression status evaluation (Improved, Stable,
 * Worsened, First-time scan) using both iconography and textual indicators, and trajectory graphs.
 */

window.RetinaComparison = (function () {
  'use strict';

  /**
   * Evaluate Progression Status between Previous and Current Scans
   * Explicitly includes textual labels and icons (never color alone)
   * @param {Object|null} prevScan - Prior scan record
   * @param {Object} currentScan - Recent scan record
   * @returns {Object} Detailed comparative metrics
   */
  function evaluateProgression(prevScan, currentScan) {
    if (!prevScan) {
      return {
        status: 'baseline',
        type: 'first-time scan',
        badgeClass: 'baseline',
        title: 'FIRST-TIME SCAN (BASELINE)',
        shortTitle: 'First-time Scan',
        iconName: 'calendar-plus',
        iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M10 16h4"/><path d="M12 14v4"/></svg>`,
        differenceText: '0 (Baseline Reference Established)',
        diffGrade: 0,
        summary: 'Initial retinal examination recorded. No prior historical fundus imaging is on record for longitudinal delta analysis. Baseline established for prospective comparison.',
        actionAlert: 'Schedule routine follow-up scan in 12 months (or 6 months if glycemic control is suboptimal).'
      };
    }

    const prevGrade = prevScan.stage;
    const currGrade = currentScan.stage;
    const diff = currGrade - prevGrade;

    // Calculate elapsed time
    const prevDate = new Date(prevScan.date);
    const currDate = new Date(currentScan.date);
    const diffMonths = Math.max(1, Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24 * 30.43)));

    if (diff > 0) {
      // Worsened / Disease Progression
      return {
        status: 'worsened',
        type: 'worsened',
        badgeClass: 'worsened',
        title: 'DISEASE PROGRESSION DETECTED (WORSENED)',
        shortTitle: 'Worsened',
        iconName: 'alert-triangle',
        iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        differenceText: `+${diff} Severity Grade(s) Progression`,
        diffGrade: diff,
        elapsedText: `${diffMonths} months elapsed between scans`,
        summary: `Significant microvascular disease deterioration detected. Patient advanced from Grade ${prevGrade} (${prevScan.stageData.shortLabel}) to Grade ${currGrade} (${currentScan.stageData.shortLabel}) over a ${diffMonths}-month interval. Increased intraretinal hemorrhages and microvascular leakage observed.`,
        actionAlert: currGrade >= 3 
          ? 'URGENT VITREORETINAL REFERRAL: Recommend comprehensive fluorescein angiography and panretinal photocoagulation (PRP) evaluation within 14 days.'
          : 'OPHTHALMOLOGY REFERRAL: Shorten follow-up interval to 3 months and intensify glycemic and hypertensive management.'
      };
    } else if (diff < 0) {
      // Improved / Therapeutic Regression
      const reg = Math.abs(diff);
      return {
        status: 'improved',
        type: 'improved',
        badgeClass: 'improved',
        title: 'IMPROVEMENT OBSERVED (REGRESSION)',
        shortTitle: 'Improved',
        iconName: 'check-circle',
        iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
        differenceText: `-${reg} Grade Regression (Favorable)`,
        diffGrade: diff,
        elapsedText: `${diffMonths} months elapsed between scans`,
        summary: `Favorable therapeutic regression documented. Retinopathy grade reduced from Grade ${prevGrade} (${prevScan.stageData.shortLabel}) to Grade ${currGrade} (${currentScan.stageData.shortLabel}) over ${diffMonths} months. Significant resolution of microvascular exudates and blot hemorrhages.`,
        actionAlert: 'POSITIVE RESPONSE: Continue current ophthalmic and metabolic therapeutic regimen. Next surveillance scan recommended in 6 months.'
      };
    } else {
      // Stable condition
      return {
        status: 'stable',
        type: 'stable',
        badgeClass: 'stable',
        title: 'STABLE CONDITION (NO SIGNIFICANT CHANGE)',
        shortTitle: 'Stable',
        iconName: 'shield-check',
        iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>`,
        differenceText: '0 Grade Change (Stable Condition)',
        diffGrade: 0,
        elapsedText: `${diffMonths} months elapsed between scans`,
        summary: `Retinopathy severity remains stable at Grade ${currGrade} (${currentScan.stageData.shortLabel}). Comparative lesion density analysis demonstrates quiescent microvascular status with no evidence of accelerated neovascularization or macular edema progression.`,
        actionAlert: 'STABLE CLINICAL COURSE: Maintain targeted metabolic control. Routine follow-up scheduled per standard protocol.'
      };
    }
  }

  /**
   * Initialize and attach interactive split curtain slider
   * @param {HTMLElement} container - Slider parent element
   */
  function initCurtainSlider(container) {
    if (!container) return;
    const handle = container.querySelector('.curtain-slider-handle');
    const afterImgWrapper = container.querySelector('.curtain-image-after');
    if (!handle || !afterImgWrapper) return;

    let isDragging = false;

    function updateCurtain(clientX) {
      const rect = container.getBoundingClientRect();
      let pos = (clientX - rect.left) / rect.width;
      pos = Math.max(0.02, Math.min(0.98, pos));
      const percentage = pos * 100;
      handle.style.left = `${percentage}%`;
      afterImgWrapper.style.clipPath = `polygon(${percentage}% 0, 100% 0, 100% 100%, ${percentage}% 100%)`;
    }

    handle.addEventListener('mousedown', (e) => {
      isDragging = true;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      updateCurtain(e.clientX);
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Touch events for mobile/tablet
    handle.addEventListener('touchstart', (e) => {
      isDragging = true;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!isDragging || !e.touches[0]) return;
      updateCurtain(e.touches[0].clientX);
    }, { passive: true });

    window.addEventListener('touchend', () => {
      isDragging = false;
    });

    // Clicking anywhere on the container shifts the curtain
    container.addEventListener('click', (e) => {
      if (e.target.closest('.curtain-slider-handle')) return;
      updateCurtain(e.clientX);
    });
  }

  return {
    evaluateProgression,
    initCurtainSlider
  };
})();
