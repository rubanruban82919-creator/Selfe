/**
 * RETINAGUARD AI – CLINICAL DATA REPOSITORY
 * Realistic longitudinal ophthalmology records, fundus imaging metadata,
 * diabetic retinopathy severity stages (ICDR scale), and progression trajectories.
 */

window.RetinaData = (function () {
  'use strict';

  // International Clinical Diabetic Retinopathy (ICDR) Disease Severity Scale
  const ICDR_STAGES = {
    0: {
      grade: 0,
      code: 'STAGE_0',
      label: 'No Apparent Retinopathy',
      shortLabel: 'No DR',
      riskTier: 'Low Risk',
      color: '#10B981',
      bg: '#ECFDF5',
      icd10: 'E11.9 / Z13.5',
      findings: 'No microaneurysms, hemorrhages, or exudates present.',
      actionPlan: 'Rescreen in 12 months with routine dilated fundus photography.',
      sampleImage: 'assets/images/samples/retina-stage0.svg'
    },
    1: {
      grade: 1,
      code: 'STAGE_1',
      label: 'Mild Non-Proliferative DR',
      shortLabel: 'Mild NPDR',
      riskTier: 'Low - Moderate Risk',
      color: '#06B6D4',
      bg: '#ECFEFF',
      icd10: 'E11.329',
      findings: 'Microaneurysms only (isolated punctate red lesions in temporal retina).',
      actionPlan: 'Strict glycemic and blood pressure optimization. Re-evaluate in 6–9 months.',
      sampleImage: 'assets/images/samples/retina-stage1.svg'
    },
    2: {
      grade: 2,
      code: 'STAGE_2',
      label: 'Moderate Non-Proliferative DR',
      shortLabel: 'Moderate NPDR',
      riskTier: 'Moderate Risk',
      color: '#F59E0B',
      bg: '#FFFBEB',
      icd10: 'E11.339',
      findings: 'Multiple microaneurysms, blot hemorrhages, hard lipid exudates rings.',
      actionPlan: 'Referral to comprehensive ophthalmologist. Repeat scan in 3–6 months; assess for DME.',
      sampleImage: 'assets/images/samples/retina-stage2.svg'
    },
    3: {
      grade: 3,
      code: 'STAGE_3',
      label: 'Severe Non-Proliferative DR',
      shortLabel: 'Severe NPDR',
      riskTier: 'High Risk',
      color: '#EA580C',
      bg: '#FFF7ED',
      icd10: 'E11.349',
      findings: '4-2-1 Criteria met: >20 intraretinal hemorrhages in 4 quadrants, venous beading, cotton wool spots.',
      actionPlan: 'Urgent vitreoretinal referral within 2–4 weeks. Evaluate for early panretinal photocoagulation (PRP).',
      sampleImage: 'assets/images/samples/retina-stage3.svg'
    },
    4: {
      grade: 4,
      code: 'STAGE_4',
      label: 'Proliferative Diabetic Retinopathy',
      shortLabel: 'Proliferative DR (PDR)',
      riskTier: 'Critical Risk',
      color: '#EF4444',
      bg: '#FEF2F2',
      icd10: 'E11.359',
      findings: 'Neovascularization of the disc (NVD) / elsewhere (NVE), preretinal/vitreous hemorrhage.',
      actionPlan: 'Immediate emergency vitreoretinal intervention: Anti-VEGF intravitreal therapy / urgent PRP / vitrectomy evaluation.',
      sampleImage: 'assets/images/samples/retina-stage4.svg'
    }
  };

  // Preloaded Clinical Patients with Longitudinal Trajectories
  const PATIENTS = [
    {
      id: 'DR-2026-8941',
      name: 'Robert Chen',
      age: 58,
      gender: 'Male',
      dob: '1968-04-12',
      diabetesType: 'Type 2 Diabetes Mellitus',
      diabetesDuration: '14 years',
      hba1c: '9.2%',
      visualAcuityOD: '20/40',
      visualAcuityOS: '20/25',
      primaryDoctor: 'Dr. Jonathan Davis, MD (Vitreoretinal)',
      lastVisitDate: '2026-10-18',
      clinicalNotes: 'Poor glycemic control (HbA1c 9.2%). Reports occasional blurred vision in Right Eye (OD). High risk of accelerated progression.',
      comparisonDefault: true,
      progressionType: 'worsened', // Worsened trajectory demonstration
      scans: [
        {
          id: 'SCN-8941-01',
          date: '2025-10-14',
          eye: 'OD',
          eyeLabel: 'Right Eye (OD)',
          stage: 1,
          stageData: ICDR_STAGES[1],
          confidence: 96.4,
          lesionCount: { microaneurysms: 6, hemorrhages: 1, exudates: 0, cottonWool: 0, neovascularization: 0 },
          image: 'assets/images/samples/retina-stage1.svg',
          label: 'Baseline Scan (12 Months Ago)'
        },
        {
          id: 'SCN-8941-02',
          date: '2026-04-10',
          eye: 'OD',
          eyeLabel: 'Right Eye (OD)',
          stage: 2,
          stageData: ICDR_STAGES[2],
          confidence: 97.1,
          lesionCount: { microaneurysms: 14, hemorrhages: 5, exudates: 8, cottonWool: 0, neovascularization: 0 },
          image: 'assets/images/samples/retina-stage2.svg',
          label: '6-Month Follow-Up'
        },
        {
          id: 'SCN-8941-03',
          date: '2026-10-18',
          eye: 'OD',
          eyeLabel: 'Right Eye (OD)',
          stage: 3,
          stageData: ICDR_STAGES[3],
          confidence: 98.7,
          lesionCount: { microaneurysms: 38, hemorrhages: 24, exudates: 12, cottonWool: 4, neovascularization: 0 },
          image: 'assets/images/samples/retina-stage3.svg',
          label: 'Current Scan (Most Recent)'
        }
      ]
    },
    {
      id: 'DR-2026-4412',
      name: 'Elena Rodriguez',
      age: 62,
      gender: 'Female',
      dob: '1964-08-25',
      diabetesType: 'Type 2 Diabetes Mellitus',
      diabetesDuration: '18 years',
      hba1c: '7.1%',
      visualAcuityOD: '20/30',
      visualAcuityOS: '20/30',
      primaryDoctor: 'Dr. Sarah Lin, MD (Endocrinology)',
      lastVisitDate: '2026-10-22',
      clinicalNotes: 'Excellent glycemic stability achieved over past 12 months through insulin pump optimization. Retinal lesions remain stable.',
      progressionType: 'stable', // Stable trajectory demonstration
      scans: [
        {
          id: 'SCN-4412-01',
          date: '2025-11-05',
          eye: 'OS',
          eyeLabel: 'Left Eye (OS)',
          stage: 2,
          stageData: ICDR_STAGES[2],
          confidence: 95.8,
          lesionCount: { microaneurysms: 12, hemorrhages: 4, exudates: 6, cottonWool: 0, neovascularization: 0 },
          image: 'assets/images/samples/retina-stage2.svg',
          label: 'Baseline Examination'
        },
        {
          id: 'SCN-4412-02',
          date: '2026-10-22',
          eye: 'OS',
          eyeLabel: 'Left Eye (OS)',
          stage: 2,
          stageData: ICDR_STAGES[2],
          confidence: 96.2,
          lesionCount: { microaneurysms: 11, hemorrhages: 4, exudates: 7, cottonWool: 0, neovascularization: 0 },
          image: 'assets/images/samples/retina-stage2.svg',
          label: 'Current Scan (Annual Review)'
        }
      ]
    },
    {
      id: 'DR-2026-3190',
      name: 'Marcus Vance',
      age: 51,
      gender: 'Male',
      dob: '1975-01-30',
      diabetesType: 'Type 1 Diabetes Mellitus',
      diabetesDuration: '22 years',
      hba1c: '6.8%',
      visualAcuityOD: '20/25',
      visualAcuityOS: '20/20',
      primaryDoctor: 'Dr. Jonathan Davis, MD (Vitreoretinal)',
      lastVisitDate: '2026-10-15',
      clinicalNotes: 'Patient underwent course of intravitreal Anti-VEGF (Aflibercept). Demonstrates notable regression of macular exudates and intraretinal hemorrhages.',
      progressionType: 'improved', // Improved trajectory demonstration
      scans: [
        {
          id: 'SCN-3190-01',
          date: '2026-02-14',
          eye: 'OD',
          eyeLabel: 'Right Eye (OD)',
          stage: 2,
          stageData: ICDR_STAGES[2],
          confidence: 96.9,
          lesionCount: { microaneurysms: 18, hemorrhages: 6, exudates: 9, cottonWool: 1, neovascularization: 0 },
          image: 'assets/images/samples/retina-stage2.svg',
          label: 'Pre-Treatment Baseline'
        },
        {
          id: 'SCN-3190-02',
          date: '2026-10-15',
          eye: 'OD',
          eyeLabel: 'Right Eye (OD)',
          stage: 1,
          stageData: ICDR_STAGES[1],
          confidence: 97.4,
          lesionCount: { microaneurysms: 5, hemorrhages: 0, exudates: 1, cottonWool: 0, neovascularization: 0 },
          image: 'assets/images/samples/retina-stage1.svg',
          label: 'Post-Therapy Follow-Up'
        }
      ]
    },
    {
      id: 'DR-2026-1028',
      name: 'Patricia Miller',
      age: 47,
      gender: 'Female',
      dob: '1979-09-14',
      diabetesType: 'Type 2 Diabetes Mellitus',
      diabetesDuration: '2 years (Newly Diagnosed)',
      hba1c: '8.4%',
      visualAcuityOD: '20/20',
      visualAcuityOS: '20/20',
      primaryDoctor: 'Dr. Emily Watson, MD (Primary Care)',
      lastVisitDate: '2026-11-02',
      clinicalNotes: 'Initial comprehensive diabetic retinal screening. Clear optic disc, normal macula and foveal reflex. First baseline fundus scan.',
      progressionType: 'baseline', // First-time scan demonstration
      scans: [
        {
          id: 'SCN-1028-01',
          date: '2026-11-02',
          eye: 'OD',
          eyeLabel: 'Right Eye (OD)',
          stage: 0,
          stageData: ICDR_STAGES[0],
          confidence: 99.1,
          lesionCount: { microaneurysms: 0, hemorrhages: 0, exudates: 0, cottonWool: 0, neovascularization: 0 },
          image: 'assets/images/samples/retina-stage0.svg',
          label: 'Initial Baseline Scan'
        }
      ]
    },
    {
      id: 'DR-2026-7734',
      name: 'David Kim',
      age: 66,
      gender: 'Male',
      dob: '1960-03-19',
      diabetesType: 'Type 2 Diabetes Mellitus',
      diabetesDuration: '11 years',
      hba1c: '7.6%',
      visualAcuityOD: '20/50',
      visualAcuityOS: '20/40',
      primaryDoctor: 'Dr. Jonathan Davis, MD',
      lastVisitDate: '2026-11-04',
      clinicalNotes: 'Advanced proliferative disease flagged in left eye. High risk of tractional retinal detachment. Laser photocoagulation scheduled.',
      progressionType: 'worsened',
      scans: [
        {
          id: 'SCN-7734-01',
          date: '2026-03-12',
          eye: 'OS',
          eyeLabel: 'Left Eye (OS)',
          stage: 3,
          stageData: ICDR_STAGES[3],
          confidence: 97.8,
          lesionCount: { microaneurysms: 32, hemorrhages: 19, exudates: 11, cottonWool: 3, neovascularization: 0 },
          image: 'assets/images/samples/retina-stage3.svg',
          label: 'Prior Scan'
        },
        {
          id: 'SCN-7734-02',
          date: '2026-11-04',
          eye: 'OS',
          eyeLabel: 'Left Eye (OS)',
          stage: 4,
          stageData: ICDR_STAGES[4],
          confidence: 99.3,
          lesionCount: { microaneurysms: 45, hemorrhages: 30, exudates: 16, cottonWool: 5, neovascularization: 1 },
          image: 'assets/images/samples/retina-stage4.svg',
          label: 'Current Scan (Proliferative Fronds Detected)'
        }
      ]
    }
  ];

  // Clinical Activity Feed
  const RECENT_ACTIVITIES = [
    {
      id: 'ACT-101',
      title: 'Scan Comparison Completed',
      desc: 'Dr. Jonathan Davis completed longitudinal scan comparison for Patient #DR-2026-8941 (Robert Chen). Progression confirmed (+2 grades).',
      time: '12 minutes ago',
      type: 'comparison',
      severity: 'high'
    },
    {
      id: 'ACT-102',
      title: 'Stage 4 PDR Alert Flagged',
      desc: 'AI Neural Classifier detected neovascularization fronds (NVD) for Patient #DR-2026-7734 (David Kim). Urgent laser referral queued.',
      time: '45 minutes ago',
      type: 'detection',
      severity: 'critical'
    },
    {
      id: 'ACT-103',
      title: 'Regression Confirmed Post-Therapy',
      desc: 'Follow-up analysis for Patient #DR-2026-3190 shows successful -1 grade regression following anti-VEGF course.',
      time: '2 hours ago',
      type: 'improvement',
      severity: 'positive'
    },
    {
      id: 'ACT-104',
      title: 'New Patient Baseline Registered',
      desc: 'Patricia Miller (#DR-2026-1028) added to active monitoring registry. Stage 0 baseline fundus verified.',
      time: '3 hours ago',
      type: 'patient',
      severity: 'info'
    }
  ];

  // Clinical Summary KPI Metrics
  const STATS = {
    totalPatients: 2845,
    patientsGrowth: '+12.4% vs last mo',
    totalScans: 7492,
    aiSensitivity: '99.2% Sensitivity',
    severeCases: 184,
    severeCasesTrend: '+4 urgent cases today',
    comparisonsTracked: 1930,
    comparisonRate: '68% follow-up rate',
    severityDistribution: {
      stage0: 1210, // 42.5%
      stage1: 740,  // 26.0%
      stage2: 520,  // 18.3%
      stage3: 250,  // 8.8%
      stage4: 125   // 4.4%
    }
  };

  let cache = [];

  function hydrate(patient) {
    const copy = Object.assign({}, patient);
    copy.scans = (patient.scans || []).map(scan => Object.assign({}, scan, {
      stageData: scan.stageData || ICDR_STAGES[scan.stage]
    }));
    return copy;
  }

  function getPatients() {
    return cache.map(hydrate);
  }

  async function pull() {
    const payload = await window.RetinaApi.request('GET', '/api/patients');
    cache = payload.patients || [];
    return getPatients();
  }

  function getPatientById(id) {
    return getPatients().find(patient => patient.id === id) || null;
  }

  async function addPatient(patient) {
    const payload = await window.RetinaApi.request('POST', '/api/patients', patient);
    await pull();
    return payload.patient;
  }

  async function updatePatient(id, patch) {
    const payload = await window.RetinaApi.request('PUT', '/api/patients/' + encodeURIComponent(id), patch);
    await pull();
    return payload.patient;
  }

  async function deletePatient(id) {
    await window.RetinaApi.request('DELETE', '/api/patients/' + encodeURIComponent(id));
    await pull();
  }

  async function addScanToPatient(patientId, scan) {
    const payload = await window.RetinaApi.request('POST', '/api/patients/' + encodeURIComponent(patientId) + '/scans', scan);
    await pull();
    return payload.patient;
  }

  async function deleteScan(patientId, scanId) {
    await window.RetinaApi.request('DELETE', '/api/patients/' + encodeURIComponent(patientId) + '/scans/' + encodeURIComponent(scanId));
    await pull();
  }

  return {
    ICDR_STAGES,
    STATS,
    RECENT_ACTIVITIES,
    PATIENTS,
    getPatients,
    getPatientById,
    pull,
    addPatient,
    updatePatient,
    deletePatient,
    addScanToPatient,
    deleteScan
  };
})();
