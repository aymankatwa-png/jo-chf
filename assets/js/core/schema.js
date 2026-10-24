// Jo-CHF form definitions: every field, option list and rule in one place.
// The form renderer, the completeness check and the data dictionary all read this file.
import { INCLUSION, EXCLUSION, phenotype, bmi, ageAt, egfrCKDEPI2021, qrsCategory, kccqScores } from './logic.js';

const o = (...pairs) => pairs.map(p => (Array.isArray(p) ? p : [p, p]));
export const YNU = o(['yes', 'Yes'], ['no', 'No'], ['unk', 'Unknown']);
export const YN = o(['yes', 'Yes'], ['no', 'No']);

export const GOVERNORATES = o('Amman', 'Irbid', 'Zarqa', 'Balqa', 'Mafraq', 'Karak', 'Jerash', 'Ajloun', 'Madaba', 'Aqaba', 'Tafilah', "Ma'an", ['outside', 'Outside Jordan']);
export const EDUCATION = o(['none', 'No formal education'], ['primary', 'Primary'], ['secondary', 'Secondary'], ['diploma', 'Diploma'], ['university', 'University'], ['postgrad', 'Postgraduate'], ['unk', 'Unknown']);
export const COVERAGE = o(['moh', 'Ministry of Health'], ['rms', 'Royal Medical Services'], ['private', 'Private insurance'], ['unrwa', 'UNRWA'], ['self', 'Self-pay'], ['other', 'Other']);
export const SMOKING = o(['never', 'Never'], ['former', 'Former'], ['cigarettes', 'Current cigarettes'], ['waterpipe', 'Waterpipe (argileh)'], ['ecig', 'E-cigarette']);
export const SETTING = o(['inpatient', 'Inpatient'], ['outpatient', 'Outpatient']);
export const HF_TYPE = o(['new', 'New-onset HF'], ['decomp', 'Decompensated chronic HF'], ['stable', 'Chronic stable HF']);
export const STAGE = o(['C', 'C (symptomatic)'], ['D', 'D (advanced)']);
export const NYHA = o(['I', 'I'], ['II', 'II'], ['III', 'III'], ['IV', 'IV']);
export const RHYTHM = o(['sinus', 'Sinus'], ['af', 'Atrial fibrillation'], ['paced', 'Paced'], ['other', 'Other']);
export const ETIOLOGY = o(['ihd', 'Ischemic heart disease'], ['htn', 'Hypertensive'], ['dcm', 'Dilated cardiomyopathy'], ['hcm', 'Hypertrophic cardiomyopathy'], ['amyloid', 'Cardiac amyloidosis'], ['peripartum', 'Peripartum'], ['toxic', 'Toxic (alcohol, chemotherapy)'], ['tachy', 'Tachycardia-induced'], ['valvular', 'Valvular'], ['other', 'Other']);
export const IHD_DETAIL = o(['mi', 'Prior MI'], ['ccs', 'Chronic coronary syndrome'], ['pci', 'PCI'], ['cabg', 'CABG']);
export const TOXIC_DETAIL = o(['alcohol', 'Alcohol'], ['chemo', 'Chemotherapy'], ['other', 'Other']);
export const VALVE_TYPE = o(['rheumatic', 'Rheumatic'], ['degenerative', 'Degenerative'], ['other', 'Other']);
export const VALVES = o(['mitral', 'Mitral'], ['aortic', 'Aortic'], ['tricuspid', 'Tricuspid'], ['pulmonary', 'Pulmonary']);
export const ECHO_METHOD = o(['simpson', 'Biplane Simpson'], ['visual', 'Visual'], ['other', 'Other']);
export const DM_TYPE = o(['t1', 'Type 1'], ['t2', 'Type 2'], ['other', 'Other']);
export const AF_TYPE = o(['paroxysmal', 'Paroxysmal'], ['persistent', 'Persistent'], ['permanent', 'Permanent']);
export const REASONS = o(['hypotension', 'Hypotension'], ['bradycardia', 'Bradycardia'], ['hyperkalemia', 'Hyperkalemia'], ['renal', 'Worsening renal function'], ['contra', 'Contraindication'], ['intolerance', 'Previous intolerance or side effect'], ['cost', 'Cost or not available'], ['refusal', 'Patient refusal'], ['titrating', 'Titration in progress (planned)'], ['clinician', 'Clinician decision or not considered'], ['other', 'Other']);
export const CHANGE_TYPES = o(['start', 'Start'], ['increase', 'Increase'], ['decrease', 'Decrease'], ['stop', 'Stop'], ['switch', 'Switch']);
export const FREQS = o(['od', 'Once daily'], ['bd', 'Twice daily'], ['tds', 'Three times daily'], ['qds', 'Four times daily']);
export const ADHERENCE = o(['all', 'Taking all'], ['most', 'Most'], ['some', 'Some'], ['none', 'None']);
export const CONTACT_METHOD = o(['clinic', 'Clinic visit'], ['phone', 'Phone']);
export const VITAL = o(['alive', 'Alive'], ['dead', 'Dead'], ['unknown', 'Unknown']);
export const ADE = o(['hyperkalemia', 'Hyperkalemia'], ['wrf', 'Worsening renal function'], ['hypotension', 'Symptomatic hypotension'], ['genital', 'Genital infection'], ['angioedema', 'Angioedema'], ['other', 'Other']);
export const EVENT_REASON = o(['hf', 'Heart failure'], ['cv', 'Other cardiovascular'], ['noncv', 'Non-cardiovascular']);
export const CV_DETAIL = o(['acs', 'ACS'], ['arrhythmia', 'Arrhythmia'], ['stroke', 'Stroke'], ['other', 'Other']);
export const DEATH_PLACE = o(['hospital', 'Hospital'], ['home', 'Home'], ['other', 'Other']);
export const DEATH_SOURCE = o(['record', 'Hospital record'], ['family', 'Family'], ['other', 'Other']);
export const DEATH_CAUSE = o(
  ['scd', 'CV: sudden cardiac death'], ['pump', 'CV: pump failure / worsening HF'], ['mi', 'CV: myocardial infarction'], ['stroke', 'CV: stroke'], ['cv_other', 'CV: other'],
  ['infection', 'Non-CV: infection'], ['cancer', 'Non-CV: cancer'], ['renal', 'Non-CV: renal'], ['noncv_other', 'Non-CV: other'], ['unknown', 'Unknown']);
export const CALL_OUTCOME = o(['noanswer', 'No answer'], ['off', 'Phone off / unreachable'], ['wrong', 'Wrong number'], ['callback', 'Asked to call back'], ['reached', 'Reached']);

export const AMT = [
  { k: 'loop', label: 'Loop diuretic', drugs: ['Furosemide', 'Torsemide', 'Bumetanide'], dose: true },
  { k: 'thiazide', label: 'Thiazide', drugs: ['Hydrochlorothiazide', 'Indapamide', 'Metolazone', 'Chlorthalidone'], dose: true },
  { k: 'vericiguat', label: 'Vericiguat', dose: true },
  { k: 'ivabradine', label: 'Ivabradine', dose: true },
  { k: 'digoxin', label: 'Digoxin', dose: true },
  { k: 'hisdn', label: 'Hydralazine / isosorbide dinitrate', dose: true },
  { k: 'finerenone', label: 'Finerenone', dose: true },
  { k: 'kbinder', label: 'Potassium binder', drugs: ['Patiromer', 'Sodium zirconium cyclosilicate', 'Other'] },
];
export const ETIO_SPECIFIC = [
  { k: 'tafamidis', label: 'Tafamidis or other amyloid therapy' },
  { k: 'mavacamten', label: 'Mavacamten' },
];
export const NON_HF = [
  { k: 'oac', label: 'Oral anticoagulant', drugs: ['Warfarin', 'Apixaban', 'Rivaroxaban', 'Dabigatran', 'Edoxaban'] },
  { k: 'antiplatelet', label: 'Antiplatelet therapy', drugs: ['Aspirin', 'Clopidogrel', 'Ticagrelor', 'Prasugrel', 'Dual (DAPT)'] },
  { k: 'statin', label: 'Statin' },
  { k: 'insulin', label: 'Insulin' },
  { k: 'glucose', label: 'Other glucose-lowering drugs' },
];
export const DEVICES = [
  { k: 'icd', label: 'ICD' }, { k: 'crtp', label: 'CRT-P' }, { k: 'crtd', label: 'CRT-D' }, { k: 'csp', label: 'Conduction system pacing' },
  { k: 'ccm', label: 'Cardiac contractility modulation' }, { k: 'teer', label: 'Transcatheter edge-to-edge repair (mitral or tricuspid)' },
  { k: 'valve', label: 'Surgical or transcatheter valve intervention' }, { k: 'revasc', label: 'Coronary revascularization' },
  { k: 'ablation', label: 'AF ablation' }, { k: 'lvad', label: 'Left ventricular assist device' }, { k: 'transplant', label: 'Heart transplant (listed or done)' },
];
export const DEVICE_STATUS = o(['present', 'Present at enrollment'], ['implanted', 'Done during follow-up'], ['indicated', 'Indicated, not done'], ['notind', 'Not indicated']);

export const COMORBIDITIES = [
  { k: 'htn', label: 'Hypertension', sub: [{ k: 'htnYears', label: 'Duration', type: 'number', unit: 'years' }] },
  { k: 'dm', label: 'Diabetes', sub: [{ k: 'dmType', label: 'Type', type: 'select', opts: DM_TYPE }, { k: 'dmYears', label: 'Duration', type: 'number', unit: 'years' }] },
  { k: 'ckd', label: 'Chronic kidney disease' },
  { k: 'af', label: 'Atrial fibrillation', sub: [{ k: 'afType', label: 'Type', type: 'select', opts: AF_TYPE }] },
  { k: 'stroke', label: 'Prior stroke or TIA' },
  { k: 'copd', label: 'COPD or asthma' },
  { k: 'obesity', label: 'Obesity (BMI ≥ 30)' },
  { k: 'osa', label: 'Obstructive sleep apnea' },
  { k: 'anemia', label: 'Anemia' },
  { k: 'irondef', label: 'Iron deficiency' },
  { k: 'cancer', label: 'Cancer', sub: [{ k: 'cancerType', label: 'Type', type: 'text' }] },
  { k: 'thyroid', label: 'Thyroid disease' },
  { k: 'depression', label: 'Depression' },
  { k: 'pad', label: 'Peripheral arterial disease' },
  { k: 'liver', label: 'Liver disease' },
];

// KCCQ-12: item topics are paraphrased. Paste the licensed Arabic item text in Admin → Settings once the license is confirmed.
const LIMIT = o(['1', '1 · Extremely limited'], ['2', '2 · Quite a bit limited'], ['3', '3 · Moderately limited'], ['4', '4 · Slightly limited'], ['5', '5 · Not at all limited'], ['6', '6 · Limited for other reasons / did not do']);
export const KCCQ_FORM = [
  { k: 'q1a', topic: 'Physical limitation: showering / bathing', opts: LIMIT },
  { k: 'q1b', topic: 'Physical limitation: walking one block on level ground', opts: LIMIT },
  { k: 'q1c', topic: 'Physical limitation: hurrying or jogging', opts: LIMIT },
  { k: 'q2', topic: 'Swelling of feet / ankles / legs on waking (past 2 weeks)', opts: o(['1', '1 · Every morning'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5 · Never']) },
  { k: 'q3', topic: 'Fatigue limiting what the patient wants to do (past 2 weeks)', opts: o(['1', '1 · All of the time'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'], ['7', '7 · Never']) },
  { k: 'q4', topic: 'Shortness of breath limiting activity (past 2 weeks)', opts: o(['1', '1 · All of the time'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'], ['7', '7 · Never']) },
  { k: 'q5', topic: 'Sleeping sitting up because of breathlessness (past 2 weeks)', opts: o(['1', '1 · Every night'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5 · Never']) },
  { k: 'q6', topic: 'How much HF limited enjoyment of life (past 2 weeks)', opts: o(['1', '1 · Extremely'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5 · Not at all']) },
  { k: 'q7', topic: 'Feeling about spending the rest of life with HF as it is now', opts: o(['1', '1 · Not at all satisfied'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5 · Completely satisfied']) },
  { k: 'q8a', topic: 'Social limitation: hobbies, recreational activities', opts: LIMIT },
  { k: 'q8b', topic: 'Social limitation: working or household chores', opts: LIMIT },
  { k: 'q8c', topic: 'Social limitation: visiting family or friends', opts: LIMIT },
];

// ---------- patient record tabs ----------
const isIn = p => p.clinical?.setting === 'inpatient';
export const TABS = [
  {
    id: 'enrollment', label: 'Enrollment', icon: 'clipboard',
    sections: [
      {
        title: 'Dates', fields: [
          { k: 'enrollment.visitDate', label: 'Date of admission or clinic visit', type: 'date', req: true },
          { k: 'enrollment.enrollmentDate', label: 'Date of enrollment', type: 'date', req: true },
          { k: 'enrollment.consentDate', label: 'Date of written informed consent', type: 'date', req: true, help: 'Enrollment is blocked without signed consent.' },
          { k: 'enrollment.investigator', label: 'Enrolling investigator', type: 'readonly', help: 'Filled from the login.' },
        ]
      },
      { title: 'Inclusion criteria', help: 'All must be ticked.', fields: INCLUSION.map(i => ({ k: 'enrollment.inclusion.' + i.k, label: i.label, type: 'check', req: true })) },
      { title: 'Exclusion criteria', help: 'If any is ticked the patient cannot be enrolled.', tone: 'danger', fields: EXCLUSION.map(i => ({ k: 'enrollment.exclusion.' + i.k, label: i.label, type: 'check' })) },
    ]
  },
  {
    id: 'demographics', label: 'Demographics', icon: 'user',
    sections: [
      {
        title: 'Person', fields: [
          { k: 'demographics.dob', label: 'Date of birth', type: 'date', req: true, nd: true },
          { k: 'derived.age', label: 'Age at enrollment', type: 'computed', calc: p => { const a = ageAt(p.demographics?.dob, p.enrollment?.enrollmentDate); return a == null ? '' : a + ' years'; } },
          { k: 'demographics.sex', label: 'Sex', type: 'seg', opts: o(['M', 'Male'], ['F', 'Female']), req: true },
          { k: 'demographics.governorate', label: 'Governorate of residence', type: 'select', opts: GOVERNORATES, req: true, nd: true },
          { k: 'demographics.education', label: 'Education level', type: 'select', opts: EDUCATION },
          { k: 'demographics.coverage', label: 'Health coverage', type: 'select', opts: COVERAGE, req: true, nd: true },
          { k: 'demographics.coverageOther', label: 'Other coverage', type: 'text', show: p => p.demographics?.coverage === 'other' },
          { k: 'demographics.smoking', label: 'Smoking (multiple allowed)', type: 'multi', opts: SMOKING, req: true, nd: true, full: true },
        ]
      },
      {
        title: 'Body measurements', fields: [
          { k: 'demographics.weight', label: 'Weight', type: 'number', unit: 'kg', step: 0.1, req: true, nd: true },
          { k: 'demographics.height', label: 'Height', type: 'number', unit: 'cm', req: true, nd: true },
          { k: 'derived.bmi', label: 'BMI', type: 'computed', calc: p => { const b = bmi(p.demographics?.weight, p.demographics?.height); return b == null ? '' : b + ' kg/m²'; } },
        ]
      },
    ]
  },
  {
    id: 'clinical', label: 'Presentation', icon: 'pulse',
    sections: [
      {
        title: 'Heart failure', fields: [
          { k: 'clinical.setting', label: 'Setting', type: 'seg', opts: SETTING, req: true },
          { k: 'clinical.hfType', label: 'HF type', type: 'seg', opts: HF_TYPE, req: true, full: true },
          { k: 'clinical.firstDxDate', label: 'First HF diagnosis (month/year)', type: 'month' },
          { k: 'clinical.stage', label: 'HF stage', type: 'seg', opts: STAGE, req: true },
          { k: 'clinical.nyha', label: 'NYHA class', type: 'seg', opts: NYHA, req: true },
          { k: 'clinical.hfHosp12m', label: 'HF hospitalizations in previous 12 months', type: 'number', unit: 'times', min: 0, step: 1, req: true, nd: true },
        ]
      },
      {
        title: 'Vital signs', fields: [
          { k: 'clinical.sbp', label: 'Systolic BP', type: 'number', unit: 'mmHg', req: true, nd: true },
          { k: 'clinical.dbp', label: 'Diastolic BP', type: 'number', unit: 'mmHg', req: true, nd: true },
          { k: 'clinical.hr', label: 'Heart rate', type: 'number', unit: 'bpm', req: true, nd: true },
          { k: 'clinical.rhythm', label: 'Rhythm', type: 'select', opts: RHYTHM },
        ]
      },
      {
        title: 'Signs of congestion', fields: [
          { k: 'clinical.edema', label: 'Peripheral edema', type: 'seg', opts: YN },
          { k: 'clinical.jvp', label: 'Raised JVP', type: 'seg', opts: YN },
          { k: 'clinical.rales', label: 'Pulmonary rales', type: 'seg', opts: YN },
        ]
      },
    ]
  },
  {
    id: 'etiology', label: 'Etiology', icon: 'branch',
    sections: [
      {
        title: 'Etiology', fields: [
          { k: 'etiology.primary', label: 'Primary etiology (one)', type: 'select', opts: ETIOLOGY, req: true, nd: true },
          { k: 'etiology.contributing', label: 'Contributing etiologies (multiple)', type: 'multi', opts: ETIOLOGY, full: true },
          { k: 'etiology.ihd', label: 'Ischemic details', type: 'multi', opts: IHD_DETAIL, full: true, show: p => p.etiology?.primary === 'ihd' || p.etiology?.contributing?.includes('ihd') },
          { k: 'etiology.toxic', label: 'Toxic cause', type: 'multi', opts: TOXIC_DETAIL, show: p => p.etiology?.primary === 'toxic' || p.etiology?.contributing?.includes('toxic') },
          { k: 'etiology.valveType', label: 'Valvular type', type: 'seg', opts: VALVE_TYPE, show: p => p.etiology?.primary === 'valvular' || p.etiology?.contributing?.includes('valvular') },
          { k: 'etiology.valves', label: 'Valve affected', type: 'multi', opts: VALVES, show: p => p.etiology?.primary === 'valvular' || p.etiology?.contributing?.includes('valvular') },
          { k: 'etiology.other', label: 'Other etiology (specify)', type: 'text', show: p => p.etiology?.primary === 'other' || p.etiology?.contributing?.includes('other') },
        ]
      },
      { title: 'Comorbidities', type: 'comorbidities' },
    ]
  },
  {
    id: 'investigations', label: 'Investigations', icon: 'flask',
    sections: [
      {
        title: 'Echocardiography', fields: [
          { k: 'echo.date', label: 'Echo date', type: 'date', req: true, nd: true },
          { k: 'echo.lvef', label: 'LVEF', type: 'number', unit: '%', req: true, nd: true },
          { k: 'echo.method', label: 'Method', type: 'seg', opts: ECHO_METHOD, req: true },
          { k: 'derived.phenotype', label: 'HF phenotype (automatic)', type: 'computed', calc: p => phenotype(p.echo?.lvef) || '', badge: true },
          { k: 'echo.prevLvef', label: 'Previous LVEF (if known)', type: 'number', unit: '%' },
          { k: 'echo.prevDate', label: 'Previous LVEF date', type: 'date' },
          { k: 'echo.lvedd', label: 'LV end-diastolic diameter', type: 'number', unit: 'mm' },
          { k: 'echo.tapse', label: 'TAPSE', type: 'number', unit: 'mm' },
          { k: 'echo.pasp', label: 'PASP', type: 'number', unit: 'mmHg' },
          { k: 'echo.valveDisease', label: 'Significant valve disease', type: 'multi', opts: o(['ms', 'Mitral stenosis'], ['mr', 'Mitral regurgitation'], ['as', 'Aortic stenosis'], ['ar', 'Aortic regurgitation'], ['tr', 'Tricuspid regurgitation']), full: true },
        ]
      },
      {
        title: 'Laboratory', help: 'Pick the unit your lab uses. Values are converted and stored in one standard unit.', fields: [
          { k: 'labs.date', label: 'Date of sample', type: 'date', req: true, nd: true },
          { k: 'labs.ntprobnp', label: 'NT-proBNP', type: 'lab', lab: 'ntprobnp' },
          { k: 'labs.bnp', label: 'BNP', type: 'lab', lab: 'bnp', help: 'NT-proBNP or BNP is required.' },
          { k: 'labs.creat', label: 'Creatinine', type: 'lab', lab: 'creat', req: true, nd: true },
          { k: 'derived.egfr', label: 'eGFR (CKD-EPI 2021)', type: 'computed', calc: p => { const e = egfrCKDEPI2021(p.labs?.creat, ageAt(p.demographics?.dob, p.enrollment?.enrollmentDate), p.demographics?.sex); return e == null ? '' : e + ' mL/min/1.73m²'; } },
          { k: 'labs.urea', label: 'Urea', type: 'lab', lab: 'urea' },
          { k: 'labs.na', label: 'Sodium', type: 'lab', lab: 'na', req: true, nd: true },
          { k: 'labs.k', label: 'Potassium', type: 'lab', lab: 'k', req: true, nd: true },
          { k: 'labs.hb', label: 'Hemoglobin', type: 'lab', lab: 'hb', req: true, nd: true },
          { k: 'labs.iron', label: 'Serum iron', type: 'lab', lab: 'iron' },
          { k: 'labs.ferritin', label: 'Ferritin', type: 'lab', lab: 'ferritin' },
          { k: 'labs.tsat', label: 'TSAT', type: 'lab', lab: 'tsat' },
          { k: 'labs.uacr', label: 'UACR', type: 'lab', lab: 'uacr' },
          { k: 'labs.hba1c', label: 'HbA1c', type: 'lab', lab: 'hba1c' },
          { k: 'labs.tsh', label: 'TSH (optional)', type: 'lab', lab: 'tsh' },
        ]
      },
      {
        title: 'ECG', fields: [
          { k: 'ecg.rhythm', label: 'Rhythm', type: 'seg', opts: RHYTHM, req: true, nd: true, full: true },
          { k: 'ecg.lbbb', label: 'LBBB', type: 'check' },
          { k: 'ecg.qrs', label: 'QRS duration', type: 'number', unit: 'ms', req: true, nd: true },
          { k: 'derived.qrsCat', label: 'QRS category (automatic)', type: 'computed', calc: p => qrsCategory(p.ecg?.qrs) ? qrsCategory(p.ecg?.qrs) + ' ms' : '' },
        ]
      },
    ]
  },
  { id: 'kccq', label: 'KCCQ-12', icon: 'heart', sections: [{ title: 'Quality of life (baseline)', type: 'kccq', path: 'kccq' }] },
  {
    id: 'meds', label: 'Medications', icon: 'pill',
    sections: [
      { title: 'Foundational medical therapy', type: 'meds', path: 'baselineMeds', reasons: 'baselineReasons', reviewed: 'baselineMedsReviewed', dynamicTitle: p => isIn(p) ? 'Foundational therapy on admission' : 'Foundational therapy at enrollment' },
      { title: 'Titration log', type: 'titration' },
      { title: 'Additional medical therapy', type: 'drugGroup', path: 'amt', items: AMT, ivIron: true },
      { title: 'Etiology-specific therapy', type: 'drugGroup', path: 'etioRx', items: ETIO_SPECIFIC, free: true },
      { title: 'Non-HF drugs', type: 'drugGroup', path: 'nonHf', items: NON_HF, free: true },
    ]
  },
  { id: 'devices', label: 'Devices', icon: 'chip', sections: [{ title: 'Devices and interventions', type: 'devices' }] },
  {
    id: 'hosp', label: 'Index admission', icon: 'bed', show: isIn,
    sections: [
      {
        title: 'Hospital stay', fields: [
          { k: 'hosp.admitDate', label: 'Admission date', type: 'date', req: true },
          { k: 'hosp.dischargeDate', label: 'Discharge date', type: 'date', req: true },
          { k: 'derived.los', label: 'Length of stay', type: 'computed', calc: p => { const a = p.hosp?.admitDate, b = p.hosp?.dischargeDate; if (!a || !b) return ''; const d = Math.round((new Date(b) - new Date(a)) / 864e5); return d + ' days'; } },
          { k: 'hosp.icu', label: 'ICU or CCU stay', type: 'seg', opts: YN },
          { k: 'hosp.ivDiuretics', label: 'Intravenous diuretics', type: 'seg', opts: YN },
          { k: 'hosp.inotropes', label: 'Inotropes or vasopressors', type: 'seg', opts: YN },
          { k: 'hosp.mcs', label: 'Mechanical circulatory support', type: 'seg', opts: YN },
          { k: 'hosp.ventilation', label: 'Mechanical ventilation', type: 'seg', opts: YN },
          { k: 'hosp.death', label: 'In-hospital death', type: 'seg', opts: YN, help: 'Choosing Yes opens the death form.' },
        ]
      },
      {
        title: 'At discharge', fields: [
          { k: 'hosp.dWeight', label: 'Discharge weight', type: 'number', unit: 'kg', step: 0.1 },
          { k: 'hosp.dNtprobnp', label: 'NT-proBNP', type: 'lab', lab: 'ntprobnp' },
          { k: 'hosp.dBnp', label: 'BNP', type: 'lab', lab: 'bnp' },
          { k: 'hosp.dCreat', label: 'Creatinine', type: 'lab', lab: 'creat' },
          { k: 'hosp.dK', label: 'Potassium', type: 'lab', lab: 'k' },
        ]
      },
      { title: 'Foundational therapy at discharge', type: 'meds', path: 'hosp.dischargeMeds', reasons: 'hosp.dischargeReasons', prefillFrom: 'baselineMeds' },
      {
        title: 'Discharge plan', fields: [
          { k: 'hosp.planClinic', label: 'Follow-up clinic booked', type: 'check' },
          { k: 'hosp.planNurse', label: 'HF nurse or education provided', type: 'check' },
          { k: 'hosp.planRehab', label: 'Cardiac rehabilitation referral', type: 'check' },
        ]
      },
    ]
  },
];

// Follow-up visit form (30 days, 6 months, 12 months)
export const VISIT_FIELDS = [
  { k: 'date', label: 'Date of contact', type: 'date', req: true },
  { k: 'method', label: 'Method', type: 'seg', opts: CONTACT_METHOD, req: true },
  { k: 'vital', label: 'Vital status', type: 'seg', opts: VITAL, req: true },
  { k: 'nyha', label: 'NYHA class', type: 'seg', opts: NYHA, show: v => v.vital === 'alive' },
  { k: 'sbp', label: 'Systolic BP', type: 'number', unit: 'mmHg', show: v => v.method === 'clinic' && v.vital === 'alive' },
  { k: 'dbp', label: 'Diastolic BP', type: 'number', unit: 'mmHg', show: v => v.method === 'clinic' && v.vital === 'alive' },
  { k: 'hr', label: 'Heart rate', type: 'number', unit: 'bpm', show: v => v.method === 'clinic' && v.vital === 'alive' },
  { k: 'weight', label: 'Weight', type: 'number', unit: 'kg', step: 0.1, show: v => v.method === 'clinic' && v.vital === 'alive' },
];
export const VISIT_LAB_FIELDS = [
  { k: 'labs.date', label: 'Date of sample', type: 'date' },
  { k: 'labs.creat', label: 'Creatinine', type: 'lab', lab: 'creat' },
  { k: 'labs.k', label: 'Potassium', type: 'lab', lab: 'k' },
  { k: 'labs.na', label: 'Sodium', type: 'lab', lab: 'na' },
  { k: 'labs.ntprobnp', label: 'NT-proBNP', type: 'lab', lab: 'ntprobnp' },
  { k: 'labs.bnp', label: 'BNP', type: 'lab', lab: 'bnp' },
  { k: 'labs.hb', label: 'Hemoglobin', type: 'lab', lab: 'hb' },
  { k: 'labs.ferritin', label: 'Ferritin', type: 'lab', lab: 'ferritin' },
  { k: 'labs.tsat', label: 'TSAT', type: 'lab', lab: 'tsat' },
];

export const EVENT_FIELDS = [
  { k: 'type', label: 'Event type', type: 'seg', opts: o(['admission', 'Hospital admission'], ['urgent', 'Urgent / ED visit for worsening HF (IV diuretics, no admission)']), req: true, full: true },
  { k: 'admitDate', label: 'Admission / visit date', type: 'date', req: true },
  { k: 'dischargeDate', label: 'Discharge date', type: 'date', show: e => e.type === 'admission' },
  { k: 'hospital', label: 'Hospital', type: 'seg', opts: o(['same', 'Same hospital'], ['other', 'Other hospital']) },
  { k: 'reason', label: 'Primary reason', type: 'seg', opts: EVENT_REASON, req: true, show: e => e.type === 'admission' },
  { k: 'cvDetail', label: 'Cardiovascular reason', type: 'select', opts: CV_DETAIL, show: e => e.reason === 'cv' },
  { k: 'detail', label: 'Specify', type: 'text', show: e => e.reason === 'noncv' || e.cvDetail === 'other' },
  { k: 'planned', label: 'Planned (elective) admission', type: 'check', show: e => e.type === 'admission' },
  { k: 'stay24h', label: 'Stay of 24 hours or longer', type: 'check', show: e => e.type === 'admission' },
  { k: 'ivDiuretics', label: 'IV diuretics', type: 'check' },
  { k: 'vasoactive', label: 'Vasoactive therapy', type: 'check', show: e => e.type === 'admission' },
  { k: 'mcs', label: 'Mechanical support', type: 'check', show: e => e.type === 'admission' },
  { k: 'treatments', label: 'Other treatments given', type: 'text', full: true },
  { k: 'medChanges', label: 'Medication changes at discharge', type: 'text', full: true },
  { k: 'death', label: 'In-hospital death', type: 'check', show: e => e.type === 'admission', help: 'Ticking this opens the death form.' },
];

export const DEATH_FIELDS = [
  { k: 'date', label: 'Date of death', type: 'date', req: true },
  { k: 'place', label: 'Place', type: 'seg', opts: DEATH_PLACE, req: true },
  { k: 'source', label: 'Source of information', type: 'seg', opts: DEATH_SOURCE, req: true },
  { k: 'cause', label: 'Cause of death (investigator)', type: 'select', opts: DEATH_CAUSE, req: true },
  { k: 'causeText', label: 'Details', type: 'text', full: true },
];

export const REGISTRATION_ROLES = o(['site', 'Site investigator / recruiter'], ['admin', 'Administrator (study leadership)']);

// Flat list of every field for the data dictionary and exports.
export function allFields() {
  const out = [];
  for (const t of TABS) for (const s of t.sections) {
    for (const f of s.fields || []) if (!['readonly'].includes(f.type)) out.push({ ...f, tab: t.label, section: s.title });
  }
  return out;
}
export function optionLabel(opts, v) { const x = (opts || []).find(p => p[0] === v); return x ? x[1] : v; }
export { kccqScores };
