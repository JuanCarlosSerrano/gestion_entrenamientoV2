import { buildTreeFromFlat, renderPasos } from "../atleta/pasos.js";

const API_BASE =
  window.API_BASE ||
  (window.location && window.location.origin ? window.location.origin : 'http://127.0.0.1:5000');
window.API_BASE = API_BASE;

// date.toISOString() convierte a UTC: entre medianoche y ~1-2h de madrugada
// (según el huso horario del entrenador) puede devolver el día anterior.
// Formateamos en local para que la fecha coincida con la que ve el usuario.
const toLocalISODate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ===================== ENTRENAMIENTOS BASE =====================
const entrenamientosGrid = document.getElementById('entrenamientos-grid');
const builderStepsContainer = document.getElementById('builder-steps');
const previewList = document.getElementById('builder-preview-list');
const builderModeLabel = document.getElementById('builder-mode-label');
const formElement = document.getElementById('entrenamiento-form-element');
const addRootStepBtn = document.getElementById('add-root-step-btn');
const cancelBtn = document.getElementById('cancel-entrenamiento-btn');
const createBtn = document.getElementById('create-entrenamiento-btn');
const modalNuevoEntrenamientoEl = document.getElementById('modalNuevoEntrenamiento');
const modalGuiadoEl = document.getElementById('modalGuiadoEntrenamiento');
const btnNuevoGuiado = document.getElementById('btn-nuevo-guiado');
const btnNuevoAvanzado = document.getElementById('btn-nuevo-avanzado');
const guiadoTitle = document.getElementById('guiado-title');
const guiadoHelp = document.getElementById('guiado-help');
const guiadoContent = document.getElementById('guiado-content');
const guiadoPrev = document.getElementById('guiado-prev');
const guiadoNext = document.getElementById('guiado-next');
const guiadoSave = document.getElementById('guiado-save');
const builderModeAvanzadoBtn = document.getElementById('builder-mode-avanzado');
const builderModeGuiadoBtn = document.getElementById('builder-mode-guiado');
const builderInfo = document.getElementById('builder-info');
const builderBlocks = document.getElementById('builder-blocks');
const builderPreview = document.getElementById('builder-preview');
const builderWizard = document.getElementById('builder-wizard');
const wizardTitle = document.getElementById('wizard-title');
const wizardHelp = document.getElementById('wizard-help');
const wizardProgress = document.getElementById('wizard-progress');
const wizardContent = document.getElementById('wizard-step-content');
const wizardPrev = document.getElementById('wizard-prev');
const wizardNext = document.getElementById('wizard-next');

const nombreInput = document.getElementById('nombre');
const objetivoInput = document.getElementById('objetivo');
const notasInput = document.getElementById('notas');
const kmTotalesInput = document.getElementById('km_totales');
const listaColumn = document.getElementById('entrenamientos-column');
const builderColumn = document.getElementById('builder-column');
const entrenamientosLayout = document.getElementById('entrenamientos-layout');
const mainTabButtons = document.querySelectorAll('[data-main-tab-btn]');
const mainTabPanels = document.querySelectorAll('[data-main-tab-panel]');
const createFlow = document.getElementById('create-flow');
const createFlowTitle = document.getElementById('create-flow-title');
const createFlowHelp = document.getElementById('create-flow-help');
const createFlowScreens = document.querySelectorAll('[data-flow-screen]');
const createFlowIndicators = document.querySelectorAll('[data-flow-step-indicator]');
const flowStartButtons = document.querySelectorAll('[data-flow-start]');
const trainingTypeButtons = document.querySelectorAll('[data-training-type]');
const templatePreviewTitle = document.getElementById('template-preview-title');
const templatePreviewCopy = document.getElementById('template-preview-copy');
const templatePreviewBlocks = document.getElementById('template-preview-blocks');
const useTemplateBtn = document.getElementById('use-template-btn');
const flowBackButtons = document.querySelectorAll('[data-flow-back]');

const STEP_TYPES = [
  { value: 'warmup', label: 'Calentamiento' },
  { value: 'interval', label: 'Serie' },
  { value: 'rest', label: 'Recuperación' },
  { value: 'repeat', label: 'Bloque repetido' },
  { value: 'cooldown', label: 'Enfriamiento' },
  { value: 'custom', label: 'Libre' }
];

const OBJETIVO_TIPOS = [
  { value: 'distancia', label: 'Distancia' },
  { value: 'tiempo', label: 'Tiempo' },
  { value: 'ritmo', label: 'Ritmo' },
  { value: 'libre', label: 'Libre' }
];

const UNIDADES = ['', 'm', 'km', 'min', 's'];
const ZONA_OPTIONS = [
  { value: '', label: 'Sin zona' },
  { value: 'Z1', label: 'Z1' },
  { value: 'Z2', label: 'Z2' },
  { value: 'Z3', label: 'Z3' },
  { value: 'Z4', label: 'Z4' },
  { value: 'Z5', label: 'Z5' },
  { value: 'Z6', label: 'Z6' }
];

let entrenamientosData = [];
let builderState = [];
let currentEntrenamientoId = null;
let guidedMode = false;
let wizardStepIndex = 0;
let guiadoStepIndex = 0;
let guiadoSteps = [];
let guiadoData = { info: {}, bloques: { warmup: false, main: true, cooldown: false }, steps: { warmup: null, main: null, cooldown: null } };
let selectedTrainingType = 'rodaje';

// ===================== UTILS BÁSICOS =====================

function getIsoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function saludoPorHora() {
  const hora = new Date().getHours();
  if (hora < 14) return 'Buenos días';
  if (hora < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

function initTrainerShell() {
  const hoy = new Date();
  const fechaEl = document.getElementById('dashboard-date');
  const weekEl = document.getElementById('dashboard-week');
  const storedName =
    localStorage.getItem('userName') ||
    localStorage.getItem('userEmail') ||
    '';
  const readableName = storedName.includes('@') ? storedName.split('@')[0] : storedName;
  const displayName = !readableName || readableName.toLowerCase() === 'entrenador' ? 'Juan Carlos' : readableName;
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  if (fechaEl) {
    const weekday = hoy.toLocaleDateString('es-ES', { weekday: 'long' });
    const month = hoy.toLocaleDateString('es-ES', { month: 'long' });
    fechaEl.textContent = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${hoy.getDate()} ${month}`;
  }
  if (weekEl) weekEl.textContent = `Semana ${getIsoWeek(hoy)}`;

  const greeting = document.getElementById('trainer-greeting');
  const nameEl = document.getElementById('trainer-name');
  const initialsEl = document.getElementById('trainer-initials');
  const sidebarNameEl = document.getElementById('sidebar-trainer-name');
  const sidebarInitialsEl = document.getElementById('sidebar-trainer-initials');

  if (greeting) greeting.textContent = `${saludoPorHora()}, ${displayName}`;
  if (nameEl) nameEl.textContent = displayName;
  if (sidebarNameEl) sidebarNameEl.textContent = displayName;
  if (initialsEl) initialsEl.textContent = initials || 'MP';
  if (sidebarInitialsEl) sidebarInitialsEl.textContent = initials || 'MP';
}

function authHeader() {
  const email = localStorage.getItem('userEmail') || '';
  const password = localStorage.getItem('userPassword') || '';
  return 'Basic ' + btoa(`${email}:${password}`);
}

function generateLocalId() {
  if (window.crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `step-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function secondsToClock(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '';
  const total = Math.max(0, Math.round(seconds));
  const mins = String(Math.floor(total / 60)).padStart(2, '0');
  const secs = String(total % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function clockToSeconds(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  let mins = 0;
  let secs = 0;
  if (parts.length === 1) {
    secs = parseInt(parts[0], 10);
    if (!Number.isFinite(secs)) return null;
  } else {
    mins = parseInt(parts[0], 10);
    secs = parseInt(parts[1], 10);
    if (!Number.isFinite(mins) || !Number.isFinite(secs)) return null;
  }
  return mins * 60 + secs;
}

const fetchEntrenamientoDetalle = async (id) => {
  if (entrenamientoDetalleCache.has(id)) return entrenamientoDetalleCache.get(id);
  const res = await fetch(`${API_BASE}/entrenamientos/${id}`, {
    headers: { Authorization: authHeader() },
    credentials: 'include'
  });
  if (!res.ok) throw new Error(`No se pudo cargar entrenamiento ${id}`);
  const data = await res.json();
  entrenamientoDetalleCache.set(id, data);
  return data;
};

const fetchZonasAtleta = async (atletaId) => {
  const res = await fetch(`${API_BASE}/zonas_atleta/${atletaId}`, {
    headers: { Authorization: authHeader() },
    credentials: 'include'
  });
  if (!res.ok) return null;
  return await res.json();
};

const renderPreviewEntrenamiento = async (entrenamiento, atletaId) => {
  if (!asignacionPreviewContainer) return;
  if (!entrenamiento || !atletaId) {
    asignacionPreviewContainer.innerHTML = '<div class="text-muted small">Selecciona un atleta para ver la sesión personalizada.</div>';
    return;
  }
  asignacionPreviewContainer.innerHTML = '<div class="text-muted small">Generando previsualización...</div>';
  const zonas = await fetchZonasAtleta(atletaId).catch(() => null);
  let detalle = null;
  try {
    detalle = await fetchEntrenamientoDetalle(entrenamiento.id);
  } catch (_) {}
  const pasosRaw = Array.isArray(detalle?.pasos) ? detalle.pasos : [];
  const pasos = pasosRaw.length && pasosRaw[0].parent_id ? buildTreeFromFlat(pasosRaw) : pasosRaw;
  const bloques = renderPasos(pasos, zonas || {});
  const zonasNote = !zonas ? '<div class="text-muted small mb-2">Sin zonas/VDOT guardados para este atleta.</div>' : '';
  asignacionPreviewContainer.innerHTML = `${zonasNote}<div class="fw-semibold mb-2">${detalle?.nombre || entrenamiento.nombre}</div>${bloques}`;
};


const renderFechasIndividuales = () => {
  if (!asignacionFechasIndividuales || !asignacionAtletasSelect) return;
  const selected = Array.from(asignacionAtletasSelect.selectedOptions || []);
  if (!selected.length) {
    asignacionFechasIndividuales.innerHTML = '<div class="text-muted small">Selecciona atletas para asignar fechas individuales.</div>';
    return;
  }
  const fechaBase = asignacionFechaInput?.value || '';
  asignacionFechasIndividuales.innerHTML = '';
  selected.forEach((opt) => {
    const row = document.createElement('div');
    row.className = 'd-flex align-items-center gap-2 mb-2';
    const label = document.createElement('div');
    label.className = 'small';
    label.style.minWidth = '160px';
    label.textContent = opt.textContent || `Atleta ${opt.value}`;
    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'form-control form-control-sm';
    input.dataset.atletaId = opt.value;
    input.value = fechaBase;
    row.append(label, input);
    asignacionFechasIndividuales.appendChild(row);
  });
};

const cargarAtletasAsignacion = async () => {
  if (!asignacionAtletasSelect || !asignacionPreviewSelect) return;
  const res = await fetch(`${API_BASE}/atletas`, {
    headers: { Authorization: authHeader() },
    credentials: 'include'
  });
  if (!res.ok) return;
  atletasAsignacionCache = await res.json();
  asignacionAtletasSelect.innerHTML = '';
  asignacionPreviewSelect.innerHTML = '';
  atletasAsignacionCache.forEach((a) => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = `${a.nombre} ${a.apellidos || ''}`.trim();
    asignacionAtletasSelect.appendChild(opt);
    const opt2 = opt.cloneNode(true);
    asignacionPreviewSelect.appendChild(opt2);
  });
  if (asignacionPreviewSelect.options.length) {
    asignacionPreviewSelect.selectedIndex = 0;
  }
  if (asignacionFechaIndividualToggle?.checked) {
    renderFechasIndividuales();
  }
};

const openAsignarEntrenamiento = async (entrenamiento) => {
  entrenamientoAsignacionActual = entrenamiento;
  if (!modalAsignarAtletasInstance && modalAsignarAtletas && window.bootstrap?.Modal) {
    modalAsignarAtletasInstance = new bootstrap.Modal(modalAsignarAtletas);
  }
  const titleEl = modalAsignarAtletas?.querySelector('.modal-title');
  if (titleEl) {
    titleEl.textContent = entrenamiento?.nombre ? `Asignar entrenamiento: ${entrenamiento.nombre}` : 'Asignar entrenamiento';
  }
  await cargarAtletasAsignacion();
  if (asignacionAtletasSelect) {
    Array.from(asignacionAtletasSelect.options).forEach((opt) => {
      opt.selected = true;
    });
  }
  if (asignacionFechaIndividualToggle) {
    asignacionFechaIndividualToggle.checked = false;
  }
  if (asignacionFechasToolbar) {
    asignacionFechasToolbar.classList.add('d-none');
  }
  if (asignacionFechasIndividuales) {
    asignacionFechasIndividuales.classList.add('d-none');
  }
  if (asignacionFechaInput) {
    const hoy = new Date();
    const day = hoy.getDay();
    const diff = day === 0 ? 1 : 8 - day;
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() + (day === 1 ? 0 : diff));
    asignacionFechaInput.value = toLocalISODate(lunes);
  }
  if (asignacionPreviewSelect) {
    asignacionPreviewSelect.onchange = () => {
      const val = asignacionPreviewSelect.value;
      renderPreviewEntrenamiento(entrenamientoAsignacionActual, val);
    };
  }
  const previewId = asignacionPreviewSelect?.value;
  await renderPreviewEntrenamiento(entrenamientoAsignacionActual, previewId);
  modalAsignarAtletasInstance?.show();
};




function normalizeRecoveryValue(value, unidad) {
  if (value === null || value === undefined) return null;
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return null;
  if (!unidad || unidad === 's') {
    return num;
  }
  if (unidad === 'min') {
    return num * 60;
  }
  return num;
}

async function ensureCsrfToken() {
  if (window.CSRF?.ensureToken) {
    try {
      return await window.CSRF.ensureToken(true);
    } catch (err) {
      console.warn('No se pudo obtener token CSRF', err);
    }
  }
  return localStorage.getItem('csrfToken');
}

// ===================== CONSTRUCTOR DE ENTRENAMIENTOS =====================

function createStep(tipo = 'interval') {
  const base = {
    id: generateLocalId(),
    tipo_paso: tipo,
    repeticiones: tipo === 'repeat' ? 2 : null,
    objetivo_tipo: tipo === 'rest' ? 'tiempo' : 'distancia',
    objetivo_valor: null,
    unidad: tipo === 'rest' ? 'min' : 'm',
    zona: null,
    recuperacion_valor: null,
    recuperacion_unidad: null,
    intensidad: null,
    descripcion: null,
    subpasos: []
  };

  if (tipo === 'repeat') {
    base.objetivo_tipo = null;
    base.unidad = null;
    base.subpasos = [createStep('interval')];
  }

  if (tipo === 'cooldown') {
    base.objetivo_tipo = 'distancia';
    base.unidad = 'km';
  }

  return base;
}

function cloneStep(step) {
  const recSeconds = normalizeRecoveryValue(step.recuperacion_valor, step.recuperacion_unidad);
  return {
    id: step.id || generateLocalId(),
    tipo_paso: step.tipo_paso,
    repeticiones: step.repeticiones,
    objetivo_tipo: step.objetivo_tipo,
    objetivo_valor: step.objetivo_valor,
    unidad: step.unidad,
    zona: step.zona,
    recuperacion_valor: recSeconds,
    recuperacion_unidad: null,
    intensidad: step.intensidad ?? null,
    descripcion: step.descripcion ?? null,
    subpasos: Array.isArray(step.subpasos) ? step.subpasos.map(cloneStep) : []
  };
}

function stepWith(tipo, overrides = {}) {
  return { ...createStep(tipo), ...overrides };
}

function getTrainingTemplate(type) {
  const templates = {
    rodaje: {
      title: 'Rodaje',
      copy: 'Bloque principal único para editar volumen, tiempo o zona.',
      nombre: 'Rodaje',
      objetivo: 'Base aeróbica',
      pasos: [
        stepWith('interval', { objetivo_valor: 45, unidad: 'min', objetivo_tipo: 'tiempo', zona: 'Z2', descripcion: 'Bloque principal' })
      ]
    },
    series: {
      title: 'Series',
      copy: 'Estructura inicial para trabajo de calidad.',
      nombre: 'Series',
      objetivo: 'Trabajo de intensidad',
      pasos: [
        stepWith('warmup', { objetivo_valor: 15, unidad: 'min', objetivo_tipo: 'tiempo', zona: 'Z1' }),
        stepWith('repeat', {
          repeticiones: 6,
          subpasos: [
            stepWith('interval', { objetivo_valor: 800, unidad: 'm', objetivo_tipo: 'distancia', zona: 'Z4', descripcion: 'Serie' }),
            stepWith('rest', { objetivo_valor: 90, unidad: 's', objetivo_tipo: 'tiempo', zona: 'Z1', descripcion: 'Recuperación' })
          ]
        }),
        stepWith('cooldown', { objetivo_valor: 10, unidad: 'min', objetivo_tipo: 'tiempo', zona: 'Z1' })
      ]
    },
    cuestas: {
      title: 'Cuestas',
      copy: 'Plantilla para fuerza específica en subida.',
      nombre: 'Cuestas',
      objetivo: 'Fuerza específica',
      pasos: [
        stepWith('warmup', { objetivo_valor: 15, unidad: 'min', objetivo_tipo: 'tiempo', zona: 'Z1' }),
        stepWith('repeat', {
          repeticiones: 8,
          subpasos: [
            stepWith('interval', { objetivo_valor: 45, unidad: 's', objetivo_tipo: 'tiempo', zona: 'Z5', descripcion: 'Cuesta' }),
            stepWith('rest', { objetivo_valor: 90, unidad: 's', objetivo_tipo: 'tiempo', zona: 'Z1', descripcion: 'Recuperación' })
          ]
        }),
        stepWith('cooldown', { objetivo_valor: 10, unidad: 'min', objetivo_tipo: 'tiempo', zona: 'Z1' })
      ]
    },
    fartlek: {
      title: 'Fartlek',
      copy: 'Cambios de ritmo para una sesión variable.',
      nombre: 'Fartlek',
      objetivo: 'Cambios de ritmo',
      pasos: [
        stepWith('warmup', { objetivo_valor: 15, unidad: 'min', objetivo_tipo: 'tiempo', zona: 'Z1' }),
        stepWith('repeat', {
          repeticiones: 8,
          subpasos: [
            stepWith('interval', { objetivo_valor: 2, unidad: 'min', objetivo_tipo: 'tiempo', zona: 'Z4' }),
            stepWith('rest', { objetivo_valor: 1, unidad: 'min', objetivo_tipo: 'tiempo', zona: 'Z2' })
          ]
        }),
        stepWith('cooldown', { objetivo_valor: 10, unidad: 'min', objetivo_tipo: 'tiempo', zona: 'Z1' })
      ]
    },
    umbral: {
      title: 'Umbral',
      copy: 'Sesión controlada para sostener ritmo exigente.',
      nombre: 'Umbral',
      objetivo: 'Ritmo umbral',
      pasos: [
        stepWith('warmup', { objetivo_valor: 15, unidad: 'min', objetivo_tipo: 'tiempo', zona: 'Z1' }),
        stepWith('interval', { objetivo_valor: 20, unidad: 'min', objetivo_tipo: 'tiempo', zona: 'Z3' }),
        stepWith('cooldown', { objetivo_valor: 10, unidad: 'min', objetivo_tipo: 'tiempo', zona: 'Z1' })
      ]
    },
    competicion: {
      title: 'Competición',
      copy: 'Plantilla simple para día de carrera.',
      nombre: 'Competición',
      objetivo: 'Carrera',
      pasos: [
        stepWith('warmup', { objetivo_valor: 15, unidad: 'min', objetivo_tipo: 'tiempo', zona: 'Z1' }),
        stepWith('custom', { objetivo_tipo: 'libre', descripcion: 'Competición' }),
        stepWith('cooldown', { objetivo_valor: 10, unidad: 'min', objetivo_tipo: 'tiempo', zona: 'Z1' })
      ]
    },
    fuerza: {
      title: 'Fuerza',
      copy: 'Circuito inicial para trabajo complementario.',
      nombre: 'Fuerza',
      objetivo: 'Fuerza y estabilidad',
      pasos: [
        stepWith('custom', { objetivo_tipo: 'libre', descripcion: 'Movilidad' }),
        stepWith('repeat', { repeticiones: 3, subpasos: [stepWith('custom', { objetivo_tipo: 'libre', descripcion: 'Circuito principal' })] }),
        stepWith('custom', { objetivo_tipo: 'libre', descripcion: 'Core y estiramientos' })
      ]
    },
    tecnica: {
      title: 'Técnica',
      copy: 'Sesión breve para técnica y coordinación.',
      nombre: 'Técnica de carrera',
      objetivo: 'Técnica',
      pasos: [
        stepWith('warmup', { objetivo_valor: 10, unidad: 'min', objetivo_tipo: 'tiempo', zona: 'Z1' }),
        stepWith('custom', { objetivo_tipo: 'libre', descripcion: 'Técnica de carrera' }),
        stepWith('custom', { objetivo_tipo: 'libre', descripcion: 'Progresivos' })
      ]
    },
    recuperacion: {
      title: 'Recuperación',
      copy: 'Plantilla suave para regenerar.',
      nombre: 'Recuperación',
      objetivo: 'Regenerativo',
      pasos: [
        stepWith('warmup', { objetivo_valor: 5, unidad: 'min', objetivo_tipo: 'tiempo', zona: 'Z1' }),
        stepWith('interval', { objetivo_valor: 30, unidad: 'min', objetivo_tipo: 'tiempo', zona: 'Z1' }),
        stepWith('cooldown', { objetivo_valor: 5, unidad: 'min', objetivo_tipo: 'tiempo', zona: 'Z1' })
      ]
    },
    personalizado: {
      title: 'Personalizado',
      copy: 'Punto de partida mínimo, siempre editable.',
      nombre: 'Entrenamiento personalizado',
      objetivo: '',
      pasos: [stepWith('warmup'), stepWith('custom', { objetivo_tipo: 'libre', descripcion: 'Bloque principal' }), stepWith('cooldown')]
    }
  };
  return templates[type] || templates.rodaje;
}

function showCreateFlowScreen(screen) {
  createFlowScreens.forEach((el) => el.classList.toggle('is-active', el.dataset.flowScreen === screen));
  const indicatorMap = { start: 'start', library: 'start', type: 'type', template: 'template', editor: 'editor' };
  createFlowIndicators.forEach((el) => el.classList.toggle('is-active', el.dataset.flowStepIndicator === indicatorMap[screen]));
  entrenamientosLayout?.classList.toggle('d-none', !['library', 'editor'].includes(screen));
  if (!createFlowTitle || !createFlowHelp) return;
  const copy = {
    start: ['¿Cómo quieres empezar?', 'Diseña un entrenamiento nuevo o reutiliza una sesión guardada.'],
    library: ['Mis entrenamientos', 'Selecciona un entrenamiento guardado para editarlo, duplicarlo o asignarlo.'],
    type: ['Elige una plantilla de entrenamiento', 'Se abrirá directamente en el editor para ajustar los bloques.'],
    template: ['Plantilla inteligente', 'Revisa la estructura inicial. Podrás modificar cualquier bloque en el editor.'],
    editor: ['Editor de bloques', 'Ajusta la plantilla y guarda el entrenamiento en tu biblioteca.']
  };
  const [title, help] = copy[screen] || copy.start;
  createFlowTitle.textContent = title;
  createFlowHelp.textContent = help;
}

function renderTemplatePreview(type) {
  const template = getTrainingTemplate(type);
  if (templatePreviewTitle) templatePreviewTitle.textContent = template.title;
  if (templatePreviewCopy) templatePreviewCopy.textContent = template.copy;
  if (templatePreviewBlocks) {
    templatePreviewBlocks.innerHTML = template.pasos
      .map((paso, index) => `<span>${index + 1}. ${getStepLabel(paso.tipo_paso)}${paso.descripcion ? ` · ${paso.descripcion}` : ''}</span>`)
      .join('');
  }
}

function applyTemplate(type) {
  const template = getTrainingTemplate(type);
  currentEntrenamientoId = null;
  if (nombreInput) nombreInput.value = template.nombre || '';
  if (objetivoInput) objetivoInput.value = template.objetivo || '';
  if (notasInput) notasInput.value = '';
  if (kmTotalesInput) kmTotalesInput.value = '';
  resetBuilderState(template.pasos);
  wizardStepIndex = 0;
  setGuidedMode(false);
  toggleBuilder(true);
  showCreateFlowScreen('editor');
}

function resetBuilderState(pasos = null) {
  if (Array.isArray(pasos) && pasos.length > 0) {
    builderState = pasos.map(cloneStep);
  } else {
    builderState = [createStep('warmup'), createStep('repeat'), createStep('cooldown')];
  }
  renderBuilder();
}

function describeStep(step) {
  if (!step) return '';
  if (step.tipo_paso === 'repeat') {
    const inner = (step.subpasos || []).map(describeStep).filter(Boolean).join(' + ');
    const reps = step.repeticiones || 1;
    return `${reps}×(${inner})`;
  }

  const partes = [];
  const tipo = STEP_TYPES.find((t) => t.value === step.tipo_paso)?.label || step.tipo_paso;
  partes.push(tipo);

  if (step.objetivo_valor) {
    const unidad = step.unidad || '';
    partes.push(`${step.objetivo_valor}${unidad}`);
  }
  if (step.zona) {
    partes.push(`Zona ${step.zona}`);
  }
  if (step.recuperacion_valor) {
    partes.push(`Rec: ${secondsToClock(step.recuperacion_valor)}`);
  }
  return partes.join(' ');
}

function getStepLabel(tipo) {
  switch (tipo) {
    case 'warmup':
      return 'Calentamiento';
    case 'interval':
      return 'Intervalos';
    case 'rest':
      return 'Recuperación';
    case 'repeat':
      return 'Bloque repetido';
    case 'cooldown':
      return 'Enfriamiento';
    case 'custom':
      return 'Bloque libre';
    default:
      return 'Bloque';
  }
}

function getBlockClass(tipo) {
  switch (tipo) {
    case 'warmup':
      return 'training-block--warmup';
    case 'interval':
      return 'training-block--interval';
    case 'rest':
      return 'training-block--rest';
    case 'repeat':
      return 'training-block--repeat';
    case 'cooldown':
      return 'training-block--cooldown';
    case 'custom':
      return 'training-block--custom';
    default:
      return '';
  }
}

function renderStepContent(step) {
  // Reutilizamos la lógica de describeStep pero sin el tipo al principio
  const partes = [];

  if (step.tipo_paso === 'repeat') {
    const inner = (step.subpasos || [])
      .map((s) => describeStep(s))
      .filter(Boolean)
      .join(' + ');
    const reps = step.repeticiones || 1;
    partes.push(`${reps} × (${inner})`);
    return partes.join(' · ');
  }

  if (step.objetivo_valor) {
    const unidad = step.unidad || '';
    partes.push(`${step.objetivo_valor}${unidad}`);
  }
  if (step.zona) {
    partes.push(`Zona ${step.zona}`);
  }
  if (step.recuperacion_valor) {
    partes.push(`Rec: ${secondsToClock(step.recuperacion_valor)}`);
  }
  if (step.descripcion) {
    partes.push(step.descripcion);
  }

  return partes.join(' · ') || 'Sin detalles';
}

function createBlockElement(step, index) {
  const block = document.createElement('div');
  block.className = `training-block ${getBlockClass(step.tipo_paso)}`.trim();

  const header = document.createElement('div');
  header.className = 'training-block-header';

  const title = document.createElement('div');
  title.className = 'training-block-title';

  const label = getStepLabel(step.tipo_paso);
  title.textContent = label;

  header.appendChild(title);

  // Etiquetas auxiliares (ej. número de bloque, repeticiones)
  const meta = document.createElement('div');
  meta.className = 'training-block-meta';

  const numSpan = document.createElement('span');
  numSpan.className = 'training-pill training-pill--index';
  numSpan.textContent = `Bloque ${index + 1}`;
  meta.appendChild(numSpan);

  if (step.tipo_paso === 'repeat' && step.repeticiones) {
    const repSpan = document.createElement('span');
    repSpan.className = 'training-pill training-pill--repeat';
    repSpan.textContent = `${step.repeticiones} repeticiones`;
    meta.appendChild(repSpan);
  }

  header.appendChild(meta);
  block.appendChild(header);

  const body = document.createElement('div');
  body.className = 'training-block-body';

  const content = document.createElement('div');
  content.className = 'training-block-text';
  content.textContent = renderStepContent(step);
  body.appendChild(content);

  // Si es un bloque repetido, mostramos subpasos listados
  if (step.tipo_paso === 'repeat' && Array.isArray(step.subpasos) && step.subpasos.length) {
    const subList = document.createElement('ul');
    subList.className = 'training-substeps-list';
    step.subpasos.forEach((sub, idx) => {
      const li = document.createElement('li');
      li.textContent = `${idx + 1}. ${describeStep(sub)}`;
      subList.appendChild(li);
    });
    body.appendChild(subList);
  }

  block.appendChild(body);
  return block;
}

function renderPreview() {
  if (!previewList) return;
  previewList.innerHTML = '';
  if (!builderState.length) {
    const empty = document.createElement('div');
    empty.className = 'builder-preview-empty';
    empty.textContent = 'Agrega bloques para generar la vista previa.';
    previewList.appendChild(empty);
    return;
  }

  builderState.forEach((step, index) => {
    const item = document.createElement('div');
    item.className = 'builder-preview-item';
    const label = document.createElement('div');
    label.innerHTML = `<strong>${index + 1}.</strong> ${describeStep(step)}`;
    item.appendChild(label);
    previewList.appendChild(item);
  });
}

function buildSelectField(label, options, value, onChange, defaultValue = null, wrapperClass = '') {
  const wrapper = document.createElement('div');
  wrapper.className = ['mb-3', wrapperClass].filter(Boolean).join(' ').trim();
  const fieldLabel = document.createElement('label');
  fieldLabel.className = 'form-label';
  fieldLabel.textContent = label;
  wrapper.appendChild(fieldLabel);
  const select = document.createElement('select');
  select.className = 'form-select';
  options.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    if (
      option.value === value ||
      ((value === null || value === undefined || value === '') &&
        defaultValue !== null &&
        option.value === defaultValue)
    ) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
  select.addEventListener('change', (event) => onChange(event.target.value));
  wrapper.appendChild(select);
  return wrapper;
}


function buildNumberField(label, value, onChange, wrapperClass = '', options = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = ['mb-3', wrapperClass].filter(Boolean).join(' ').trim();
  const fieldLabel = document.createElement('label');
  fieldLabel.className = 'form-label';
  fieldLabel.textContent = label;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = options.step ?? '0.1';
  if (options.min !== undefined) {
    input.min = String(options.min);
  }
  if (options.max !== undefined) {
    input.max = String(options.max);
  }
  input.className = 'form-control';
  if (value !== null && value !== undefined) {
    input.value = value;
  }
  input.addEventListener('input', (event) => {
    const parsed = parseFloat(event.target.value);
    onChange(Number.isFinite(parsed) ? parsed : null);
  });
  wrapper.append(fieldLabel, input);
  return wrapper;
}

function buildTextField(label, value, onChange, wrapperClass = '') {
  const wrapper = document.createElement('div');
  wrapper.className = ['mb-3', wrapperClass].filter(Boolean).join(' ').trim();
  const fieldLabel = document.createElement('label');
  fieldLabel.className = 'form-label';
  fieldLabel.textContent = label;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-control';
  input.value = value || '';
  input.addEventListener('input', (event) => onChange(event.target.value));
  wrapper.append(fieldLabel, input);
  return wrapper;
}


const wizardSteps = [
  {
    key: 'info',
    title: 'Datos generales',
    help: 'Introduce nombre, objetivo, notas y km totales.'
  },
  {
    key: 'warmup',
    title: 'Calentamiento',
    help: 'Define el bloque de calentamiento.'
  },
  {
    key: 'repeat',
    title: 'Bloque repetido',
    help: 'Configura las series y repeticiones.'
  },
  {
    key: 'cooldown',
    title: 'Enfriamiento',
    help: 'Finaliza con el bloque de enfriamiento.'
  },
  {
    key: 'preview',
    title: 'Resumen',
    help: 'Revisa el entrenamiento antes de guardar.'
  }
];

const ensureWizardSteps = () => {
  const hasWarmup = builderState.some((s) => s.tipo_paso === 'warmup');
  const hasRepeat = builderState.some((s) => s.tipo_paso === 'repeat');
  const hasCooldown = builderState.some((s) => s.tipo_paso === 'cooldown');
  if (!hasWarmup) builderState.unshift(createStep('warmup'));
  if (!hasRepeat) builderState.splice(1, 0, createStep('repeat'));
  if (!hasCooldown) builderState.push(createStep('cooldown'));
};

const renderWizardStep = () => {
  if (!wizardContent || !builderWizard) return;
  const step = wizardSteps[wizardStepIndex];
  if (!step) return;
  if (wizardTitle) wizardTitle.textContent = step.title;
  if (wizardHelp) wizardHelp.textContent = step.help;
  if (wizardProgress) wizardProgress.textContent = `${wizardStepIndex + 1}/${wizardSteps.length}`;

  if (builderInfo) builderInfo.classList.toggle('d-none', step.key !== 'info');
  if (builderPreview) builderPreview.classList.toggle('d-none', step.key !== 'preview');
  if (builderBlocks) builderBlocks.classList.toggle('d-none', !['warmup', 'repeat', 'cooldown'].includes(step.key));

  wizardContent.innerHTML = '';
  if (step.key === 'info' || step.key === 'preview') return;

  const filtered = builderState.filter((s) => {
    if (step.key === 'warmup') return s.tipo_paso === 'warmup';
    if (step.key === 'repeat') return s.tipo_paso === 'repeat';
    if (step.key === 'cooldown') return s.tipo_paso === 'cooldown';
    return false;
  });
  filtered.forEach((s, idx) => {
    wizardContent.appendChild(buildStepCard(s, filtered, idx));
  });
};

const setGuidedMode = (enabled) => {
  guidedMode = enabled;
  if (builderWizard) builderWizard.classList.toggle('d-none', !enabled);
  if (builderBlocks) builderBlocks.classList.toggle('d-none', enabled);
  if (builderPreview) builderPreview.classList.toggle('d-none', enabled);
  if (builderInfo) builderInfo.classList.toggle('d-none', enabled ? wizardSteps[wizardStepIndex].key !== 'info' : false);
  if (addRootStepBtn) addRootStepBtn.classList.toggle('d-none', enabled);
  if (builderModeGuiadoBtn) builderModeGuiadoBtn.classList.toggle('btn-primary', enabled);
  if (builderModeAvanzadoBtn) builderModeAvanzadoBtn.classList.toggle('btn-primary', !enabled);
  if (enabled) {
    ensureWizardSteps();
    renderWizardStep();
  }
};


const initGuiadoSteps = () => {
  guiadoSteps = [
    { key: 'info', title: 'Datos generales', help: 'Nombre, objetivo, notas y km totales.' },
    { key: 'select', title: 'Bloques', help: 'Selecciona qué bloques quieres incluir.' }
  ];
  if (guiadoData.bloques.warmup) {
    guiadoSteps.push({ key: 'warmup', title: 'Calentamiento', help: 'Configura el bloque de calentamiento.' });
  }
  if (guiadoData.bloques.main) {
    guiadoSteps.push({ key: 'main', title: 'Bloque principal', help: 'Configura el bloque principal.' });
  }
  if (guiadoData.bloques.cooldown) {
    guiadoSteps.push({ key: 'cooldown', title: 'Enfriamiento', help: 'Configura el bloque de enfriamiento.' });
  }
  guiadoSteps.push({ key: 'preview', title: 'Resumen', help: 'Revisa el entrenamiento antes de guardarlo.' });
};

const renderGuiadoStep = () => {
  if (!guiadoContent) return;
  const step = guiadoSteps[guiadoStepIndex];
  if (!step) return;
  if (guiadoTitle) guiadoTitle.textContent = step.title;
  if (guiadoHelp) guiadoHelp.textContent = step.help;
  guiadoContent.innerHTML = '';
  if (guiadoPrev) guiadoPrev.disabled = guiadoStepIndex === 0;

  if (step.key === 'info') {
    guiadoContent.innerHTML = `
      <div class="row g-3">
        <div class="col-12">
          <label class="form-label">Nombre</label>
          <input type="text" class="form-control" id="guiado-nombre" value="${guiadoData.info.nombre || ''}" />
        </div>
        <div class="col-md-6">
          <label class="form-label">Objetivo</label>
          <input type="text" class="form-control" id="guiado-objetivo" value="${guiadoData.info.objetivo || ''}" />
        </div>
        <div class="col-md-6">
          <label class="form-label">Notas</label>
          <input type="text" class="form-control" id="guiado-notas" value="${guiadoData.info.notas || ''}" />
        </div>
      </div>
    `;
    return;
  }

  if (step.key === 'select') {
    guiadoContent.innerHTML = `
      <div class="d-flex flex-column gap-2">
        <label class="form-check">
          <input class="form-check-input" type="checkbox" id="guiado-warmup" ${guiadoData.bloques.warmup ? 'checked' : ''}> Calentamiento
        </label>
        <label class="form-check">
          <input class="form-check-input" type="checkbox" id="guiado-main" ${guiadoData.bloques.main ? 'checked' : ''}> Bloque principal
        </label>
        <label class="form-check">
          <input class="form-check-input" type="checkbox" id="guiado-cooldown" ${guiadoData.bloques.cooldown ? 'checked' : ''}> Enfriamiento
        </label>
        <small class="text-muted">Puedes dejar solo el bloque principal si es un rodaje.</small>
      </div>
    `;
    return;
  }

  if (['warmup', 'main', 'cooldown'].includes(step.key)) {
    const stepData = guiadoData.steps[step.key] || createStep(step.key === 'main' ? 'interval' : step.key);
    guiadoData.steps[step.key] = stepData;
    const wrapper = document.createElement('div');
    wrapper.appendChild(buildStepCard(stepData, [stepData], 0));
    guiadoContent.appendChild(wrapper);
    return;
  }

  if (step.key === 'preview') {
    const preview = document.createElement('div');
    preview.className = 'builder-preview-list';
    const steps = [];
    if (guiadoData.bloques.warmup && guiadoData.steps.warmup) steps.push(guiadoData.steps.warmup);
    if (guiadoData.bloques.main && guiadoData.steps.main) steps.push(guiadoData.steps.main);
    if (guiadoData.bloques.cooldown && guiadoData.steps.cooldown) steps.push(guiadoData.steps.cooldown);
    preview.innerHTML = renderPasos(steps, {});
    guiadoContent.appendChild(preview);
  }

  if (guiadoNext && guiadoSave) {
    const isLast = guiadoStepIndex === guiadoSteps.length - 1;
    guiadoNext.classList.toggle('d-none', isLast);
    guiadoSave.classList.toggle('d-none', !isLast);
  }
};

const collectGuiadoInfo = () => {
  const nombre = document.getElementById('guiado-nombre');
  const objetivo = document.getElementById('guiado-objetivo');
  const notas = document.getElementById('guiado-notas');
  if (nombre) guiadoData.info.nombre = nombre.value.trim();
  if (objetivo) guiadoData.info.objetivo = objetivo.value.trim();
  if (notas) guiadoData.info.notas = notas.value.trim();
};

const collectGuiadoBloques = () => {
  const warmup = document.getElementById('guiado-warmup');
  const main = document.getElementById('guiado-main');
  const cooldown = document.getElementById('guiado-cooldown');
  guiadoData.bloques.warmup = warmup?.checked || false;
  guiadoData.bloques.main = main?.checked || false;
  guiadoData.bloques.cooldown = cooldown?.checked || false;
  if (!guiadoData.bloques.main) guiadoData.bloques.main = true;
};

const openGuiadoModal = () => {
  guiadoData = { info: {}, bloques: { warmup: false, main: true, cooldown: false }, steps: { warmup: null, main: null, cooldown: null } };
  guiadoStepIndex = 0;
  initGuiadoSteps();
  renderGuiadoStep();
  const modal = modalGuiadoEl && window.bootstrap?.Modal ? bootstrap.Modal.getOrCreateInstance(modalGuiadoEl) : null;
  modal?.show();
};

// Suma los bloques por distancia del entrenamiento (mismo criterio que
// calcular_km_totales_desde_pasos en el backend: solo bloques con
// objetivo_tipo "distancia", "repeat" multiplica por repeticiones). Los
// bloques por tiempo no se pueden convertir a km sin el ritmo real de un
// atleta, así que aquí no cuentan -- esa conversión se hace al asignar.
function calcularKmTotalesDesdePasos(pasos) {
  let totalMetros = 0;
  const rec = (step, factor = 1) => {
    const tipo = (step.tipo_paso || '').toLowerCase();
    const reps = step.repeticiones || 1;
    const objetivoTipo = (step.objetivo_tipo || '').toLowerCase();
    const unidad = (step.unidad || '').toLowerCase();
    const valor = Number(step.objetivo_valor) || 0;
    if (objetivoTipo === 'distancia' && valor) {
      if (unidad === 'm') totalMetros += valor * factor;
      else if (unidad === 'km') totalMetros += valor * 1000 * factor;
    }
    const subpasos = step.subpasos || [];
    if (subpasos.length) {
      const nuevoFactor = factor * (tipo === 'repeat' ? reps : 1);
      subpasos.forEach((s) => rec(s, nuevoFactor));
    }
  };
  (pasos || []).forEach((s) => rec(s, 1));
  return Math.round((totalMetros / 1000) * 100) / 100;
}

function renderBuilder() {
  if (!builderStepsContainer) return;
  builderStepsContainer.innerHTML = '';
  builderState.forEach((step, index) => {
    builderStepsContainer.appendChild(buildStepCard(step, builderState, index));
  });
  if (kmTotalesInput) {
    const kmTotales = calcularKmTotalesDesdePasos(builderState);
    kmTotalesInput.value = kmTotales ? String(kmTotales) : '';
  }
  renderPreview();
  if (guidedMode) {
    ensureWizardSteps();
    renderWizardStep();
  }
  if (builderModeLabel) {
    builderModeLabel.textContent = currentEntrenamientoId ? `Editando #${currentEntrenamientoId}` : 'Nuevo';
    builderModeLabel.className = `badge ${currentEntrenamientoId ? 'text-bg-warning' : 'text-bg-secondary'}`;
  }
}

function buildStepCard(step, siblings, index) {
  const card = document.createElement('div');
  const tipoClase = step.tipo_paso ? `builder-step-card--${step.tipo_paso}` : '';
  card.className = `builder-step-card ${tipoClase}`.trim();
  card.dataset.stepType = step.tipo_paso;

  const header = document.createElement('div');
  header.className = 'builder-step-header';
  const title = document.createElement('strong');
  title.textContent = STEP_TYPES.find((t) => t.value === step.tipo_paso)?.label || 'Paso';
  header.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'builder-step-actions';

  const upBtn = document.createElement('button');
  upBtn.type = 'button';
  upBtn.title = 'Subir';
  upBtn.textContent = '↑';
  upBtn.disabled = index === 0;
  upBtn.addEventListener('click', () => {
    if (index === 0) return;
    [siblings[index - 1], siblings[index]] = [siblings[index], siblings[index - 1]];
    renderBuilder();
  });

  const downBtn = document.createElement('button');
  downBtn.type = 'button';
  downBtn.title = 'Bajar';
  downBtn.textContent = '↓';
  downBtn.disabled = index >= siblings.length - 1;
  downBtn.addEventListener('click', () => {
    if (index >= siblings.length - 1) return;
    [siblings[index + 1], siblings[index]] = [siblings[index], siblings[index + 1]];
    renderBuilder();
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.title = 'Eliminar';
  deleteBtn.textContent = '✕';
  deleteBtn.addEventListener('click', () => {
    siblings.splice(index, 1);
    renderBuilder();
  });

  actions.append(upBtn, downBtn, deleteBtn);
  header.appendChild(actions);
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'builder-step-body';

  const rowTop = document.createElement('div');
  rowTop.className = 'row g-2 builder-row';
  rowTop.appendChild(
    buildSelectField('Tipo de bloque', STEP_TYPES, step.tipo_paso, (value) => {
      step.tipo_paso = value;
      if (value === 'repeat') {
        step.repeticiones = step.repeticiones || 2;
        if (!step.subpasos?.length) {
          step.subpasos = [createStep('interval')];
        }
        step.objetivo_tipo = null;
        step.objetivo_valor = null;
        step.unidad = null;
      } else {
        step.subpasos = [];
      }
      renderBuilder();
    }, null, 'col-md-6')
  );

  if (step.tipo_paso === 'repeat') {
    rowTop.appendChild(
      buildNumberField('Repeticiones', step.repeticiones, (value) => {
        step.repeticiones = value || 1;
      }, 'col-md-6', { step: 1, min: 1 })
    );
    body.appendChild(rowTop);
  } else {
    rowTop.appendChild(
      buildSelectField(
        'Objetivo',
        OBJETIVO_TIPOS,
        step.objetivo_tipo || 'distancia',
        (value) => {
          step.objetivo_tipo = value;
          if (!value || value === 'libre') {
            step.unidad = null;
            step.objetivo_valor = null;
          } else if (value === 'distancia') {
            step.unidad = 'm';
            if (typeof step.objetivo_valor !== 'number') {
              step.objetivo_valor = null;
            }
          } else if (value === 'tiempo') {
            step.unidad = 'min';
            step.objetivo_valor = null;
          }
          renderBuilder();
        },
        'distancia',
        'col-md-6'
      )
    );
    body.appendChild(rowTop);

    const rowValues = document.createElement('div');
    rowValues.className = 'row g-2 builder-row';
    if (step.objetivo_tipo === 'distancia') {
      rowValues.appendChild(
        buildNumberField(
          'Valor',
          step.objetivo_valor ?? '',
          (value) => {
            step.objetivo_valor = value === null ? null : value;
          },
          'col-md-3',
          { step: 1, min: 0 }
        )
      );
    } else if (step.objetivo_tipo === 'tiempo') {
      // Campo numérico simple, igual que en "distancia": el valor se
      // interpreta en la unidad elegida al lado (min o s). Antes este
      // campo era de texto con autoformato "mm:ss", pero el backend
      // interpreta un valor con ":" como minutos:segundos y lo convierte
      // a segundos totales -- con una unidad "s" ya explícita, escribir
      // p.ej. "150" (150 segundos) se autoformateaba a "1:50" y se
      // guardaba como 110, no 150. El campo numérico evita esa doble
      // conversión.
      rowValues.appendChild(
        buildNumberField(
          'Valor',
          step.objetivo_valor ?? '',
          (value) => {
            step.objetivo_valor = value === null ? null : value;
          },
          'col-md-3',
          { step: 1, min: 0 }
        )
      );
    } else {
      rowValues.appendChild(
        buildTextField(
          'Valor',
          step.objetivo_valor ?? '',
          (value) => {
            const cleaned = (value || '').trim();
            step.objetivo_valor = cleaned || null;
          },
          'col-md-3'
        )
      );
    }
    // Las unidades disponibles dependen del tipo de objetivo: un bloque de
    // tiempo (calentamiento, recuperación dentro de series, etc.) puede
    // medirse en minutos o en segundos -- una recuperación de "90" suele
    // ser 90 segundos, no 90 minutos -- así que el selector debe permitir
    // elegir entre ambos en vez de forzar "min" y bloquearlo.
    const unidadesPorTipo = {
      tiempo: ['min', 's'],
      distancia: ['m', 'km'],
    };
    const unidadOpciones = unidadesPorTipo[step.objetivo_tipo] || UNIDADES;
    const unidadDefault = unidadOpciones[0] || 'm';
    const unidadField = buildSelectField(
      'Unidad',
      unidadOpciones.map((u) => ({ value: u, label: u || '-' })),
      step.unidad || '',
      (value) => {
        step.unidad = value || null;
      },
      unidadDefault,
      'col-md-3'
    );
    const unidadSelect = unidadField.querySelector('select');
    if (unidadSelect) {
      unidadSelect.disabled = step.objetivo_tipo === 'libre';
      if (!step.unidad && step.objetivo_tipo !== 'libre') {
        // Si el paso no traía unidad (p.ej. plantilla nueva), fijamos el
        // valor por defecto también en el modelo, no solo en el <select>.
        step.unidad = unidadDefault;
      }
    }
    rowValues.appendChild(unidadField);
    rowValues.appendChild(
      buildSelectField(
        'Zona objetivo',
        ZONA_OPTIONS,
        step.zona || '',
        (value) => {
          step.zona = value || null;
        },
        '',
        'col-md-3'
      )
    );
    if (step.tipo_paso === 'interval') {
      const recoveryField = buildTextField(
        'Recuperación (mm:ss)',
        secondsToClock(step.recuperacion_valor),
        (value) => {
          step.recuperacion_valor = clockToSeconds(value);
        },
        'col-md-3'
      );
      const input = recoveryField.querySelector('input');
      if (input) input.placeholder = 'mm:ss';
      rowValues.appendChild(recoveryField);
    }
    body.appendChild(rowValues);
  }

  card.appendChild(body);

  if (step.tipo_paso === 'repeat') {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'builder-step-children';
    (step.subpasos || []).forEach((child, childIndex) => {
      childrenContainer.appendChild(buildStepCard(child, step.subpasos, childIndex));
    });
    const addChild = document.createElement('button');
    addChild.type = 'button';
    addChild.className = 'btn btn-outline-secondary btn-sm builder-add-child';
    addChild.textContent = 'Añadir subpaso';
    addChild.addEventListener('click', () => {
      step.subpasos.push(createStep('interval'));
      renderBuilder();
    });
    childrenContainer.appendChild(addChild);
    card.appendChild(childrenContainer);
  }

  return card;
}

function normalizeSteps(steps) {
  return steps.map((step) => ({
    tipo_paso: step.tipo_paso,
    repeticiones: step.repeticiones,
    objetivo_tipo: step.objetivo_tipo,
    objetivo_valor:
      step.objetivo_valor !== undefined && step.objetivo_valor !== null && String(step.objetivo_valor).trim() !== ''
        ? step.objetivo_valor
        : null,
    unidad: step.unidad,
    zona: step.zona || null,
    recuperacion_valor: typeof step.recuperacion_valor === 'number' ? step.recuperacion_valor : null,
    recuperacion_unidad: null,
    intensidad: step.intensidad ?? null,
    descripcion: step.descripcion ?? null,
    subpasos: step.subpasos ? normalizeSteps(step.subpasos) : []
  }));
}

function collectPayload() {
  if (!nombreInput.value.trim()) {
    alert('El nombre del entrenamiento es obligatorio');
    return null;
  }
  if (builderState.length === 0) {
    alert('Añade al menos un bloque al entrenamiento');
    return null;
  }

  let kmTotales = kmTotalesInput ? parseFloat(kmTotalesInput.value) : null;
  if (kmTotales !== null && (!Number.isFinite(kmTotales) || kmTotales < 0)) {
    kmTotales = null;
  }

  return {
    nombre: nombreInput.value.trim(),
    objetivo: objetivoInput.value.trim() || null,
    notas: notasInput.value.trim() || null,
    km_totales: kmTotales,
    pasos: normalizeSteps(builderState)
  };
}

async function guardarEntrenamiento(event) {
  event?.preventDefault();
  const payload = collectPayload();
  if (!payload) return;

  const csrf = await ensureCsrfToken();

  const isEdit = Boolean(currentEntrenamientoId);
  const url = isEdit
    ? `${API_BASE}/entrenamientos/${currentEntrenamientoId}`
    : `${API_BASE}/entrenamientos`;
  const method = isEdit ? 'PUT' : 'POST';

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {})
    },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(data.error || 'No se pudo guardar el entrenamiento');
    return;
  }

  await fetchEntrenamientos();
  startNewEntrenamiento(false);
  alert('Entrenamiento guardado correctamente');
}

async function eliminarEntrenamiento(id) {
  if (!confirm('¿Eliminar este entrenamiento?')) return;
  const csrf = await ensureCsrfToken();
  const response = await fetch(`${API_BASE}/entrenamientos/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: authHeader(),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {})
    },
    credentials: 'include'
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(data.error || 'No se pudo eliminar el entrenamiento');
    return;
  }

  if (currentEntrenamientoId === id) {
    startNewEntrenamiento();
  }
  await fetchEntrenamientos();
}

function renderEntrenamientos() {
  if (!entrenamientosGrid) return;
  entrenamientosGrid.innerHTML = '';

  if (!entrenamientosData.length) {
    const empty = document.createElement('div');
    empty.className = 'text-muted small';
    empty.textContent = 'Todavía no hay entrenamientos creados.';
    entrenamientosGrid.appendChild(empty);
    return;
  }

  entrenamientosData.forEach((entrenamiento) => {
    const card = document.createElement('div');
    card.className = 'training-card training-card--blocks';
    if (entrenamiento.id === currentEntrenamientoId) {
      card.classList.add('training-card--active');
    }

    // HEADER
    const header = document.createElement('div');
    header.className = 'training-card__header';

    const titleBox = document.createElement('div');

    const title = document.createElement('h3');
    title.className = 'h6 mb-0';
    title.textContent = entrenamiento.nombre;
    titleBox.appendChild(title);

    if (entrenamiento.objetivo) {
      const obj = document.createElement('div');
      obj.className = 'training-card__objective';
      obj.textContent = entrenamiento.objetivo;
      titleBox.appendChild(obj);
    }

    if (entrenamiento.notas) {
      const notas = document.createElement('div');
      notas.className = 'training-card__notes';
      notas.textContent = entrenamiento.notas;
      titleBox.appendChild(notas);
    }

    header.appendChild(titleBox);

    card.appendChild(header);

    // BLOQUES
    const blocksWrapper = document.createElement('div');
    blocksWrapper.className = 'training-card-blocks';

    const pasos = entrenamiento.pasos || [];
    if (!pasos.length) {
      const emptySteps = document.createElement('div');
      emptySteps.className = 'text-muted small';
      emptySteps.textContent = 'Este entrenamiento aún no tiene bloques definidos.';
      blocksWrapper.appendChild(emptySteps);
    } else {
      pasos.forEach((step, index) => {
        blocksWrapper.appendChild(createBlockElement(step, index));
      });
    }

    card.appendChild(blocksWrapper);

    // ACCIONES
    const actions = document.createElement('div');
    actions.className = 'training-card__actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-outline-primary btn-sm';
    editBtn.textContent = 'Editar';
    editBtn.addEventListener('click', () => startEditing(entrenamiento.id));

    const duplicateBtn = document.createElement('button');
    duplicateBtn.type = 'button';
    duplicateBtn.className = 'btn btn-outline-secondary btn-sm';
    duplicateBtn.textContent = 'Duplicar';
    duplicateBtn.addEventListener('click', () => duplicarEntrenamiento(entrenamiento.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-outline-danger btn-sm';
    deleteBtn.textContent = 'Eliminar';
    deleteBtn.addEventListener('click', () => eliminarEntrenamiento(entrenamiento.id));

        const assignBtn = document.createElement('button');
    assignBtn.type = 'button';
    assignBtn.className = 'btn btn-outline-brand btn-sm';
    assignBtn.textContent = 'Asignar semana';
    assignBtn.addEventListener('click', () => openAsignarEntrenamiento(entrenamiento));

    actions.append(editBtn, duplicateBtn, assignBtn, deleteBtn);

    card.appendChild(actions);

    entrenamientosGrid.appendChild(card);
  });
}


function duplicarEntrenamiento(id) {
  const original = entrenamientosData.find((item) => item.id === id);
  if (!original) return;
  currentEntrenamientoId = null;
  nombreInput.value = `${original.nombre} (copia)`;
  objetivoInput.value = original.objetivo || '';
  notasInput.value = original.notas || '';
  resetBuilderState(original.pasos || []);
  toggleBuilder(true);
}

async function fetchEntrenamientos() {
  if (!entrenamientosGrid) return;
  try {
    const response = await fetch(`${API_BASE}/entrenamientos`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader()
      },
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('No se pudieron cargar los entrenamientos');
    }

    entrenamientosData = await response.json();

    // 🔹 NUEVO: cargar pasos completos de cada entrenamiento
    await hydrateEntrenamientosPasos();

    renderEntrenamientos();
  } catch (error) {
    console.error(error);
    alert('Error al obtener la lista de entrenamientos');
  }
}


async function hydrateEntrenamientosPasos() {
  if (!entrenamientosData || !entrenamientosData.length) return;

  const csrf = await ensureCsrfToken();

  const promises = entrenamientosData.map(async (ent) => {
    // Si ya tiene pasos cargados, no hacemos nada
    if (Array.isArray(ent.pasos) && ent.pasos.length) return;

    try {
      const res = await fetch(`${API_BASE}/entrenamientos/${ent.id}`, {
        headers: {
          Authorization: authHeader(),
          ...(csrf ? { 'X-CSRF-Token': csrf } : {})
        },
        credentials: 'include'
      });

      if (!res.ok) return;

      const data = await res.json().catch(() => null);
      if (!data) return;

      // Rellenamos pasos y, de paso, objetivo / notas por si vienen más completos
      ent.pasos = Array.isArray(data.pasos) ? data.pasos : [];
      if (data.objetivo !== undefined) ent.objetivo = data.objetivo;
      if (data.notas !== undefined) ent.notas = data.notas;
    } catch (err) {
      console.warn('No se pudieron hidratar pasos del entrenamiento', ent.id, err);
    }
  });

  await Promise.all(promises);
}

function toggleBuilder(show) {
  if (!listaColumn || !builderColumn) return;
  entrenamientosLayout?.classList.remove('d-none');
  if (show) {
    listaColumn.classList.add('d-none');
    listaColumn.classList.remove('col-lg-12');
    listaColumn.classList.add('col-lg-5');

    builderColumn.classList.remove('d-none');
    builderColumn.classList.remove('col-lg-7');
    builderColumn.classList.add('col-lg-12');
  } else {
    builderColumn.classList.add('d-none');
    builderColumn.classList.remove('col-lg-12');
    builderColumn.classList.add('col-lg-7');

    listaColumn.classList.remove('d-none');
    listaColumn.classList.remove('col-lg-5');
    listaColumn.classList.add('col-lg-12');
  }
}

function startNewEntrenamiento(showBuilder = true) {
  currentEntrenamientoId = null;
  if (nombreInput) nombreInput.value = '';
  if (objetivoInput) objetivoInput.value = '';
  if (notasInput) notasInput.value = '';
  if (kmTotalesInput) kmTotalesInput.value = '';
  resetBuilderState();
  if (showBuilder) {
    toggleBuilder(true);
  } else {
    toggleBuilder(false);
  }
}

function startEditing(id) {
  const entrenamiento = entrenamientosData.find((item) => item.id === id);
  if (!entrenamiento) return;
  currentEntrenamientoId = id;
  nombreInput.value = entrenamiento.nombre || '';
  objetivoInput.value = entrenamiento.objetivo || '';
  notasInput.value = entrenamiento.notas || '';
  // km_totales ya no se lee de entrenamiento.km_totales: resetBuilderState()
  // dispara renderBuilder(), que recalcula el campo sumando los bloques
  // por distancia que se acaban de cargar.
  resetBuilderState(entrenamiento.pasos || []);
  renderEntrenamientos();
  toggleBuilder(true);
}

// ===================== PESTAÑAS PRINCIPALES =====================

function activateMainTab(tab) {
  if (!mainTabButtons.length || !mainTabPanels.length) return;
  mainTabButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mainTabBtn === tab);
  });
  mainTabPanels.forEach((panel) => {
    const isActive = panel.dataset.mainTabPanel === tab;
    panel.classList.toggle('active', isActive);
    panel.toggleAttribute('hidden', !isActive);
  });
}

function setupMainTabs() {
  if (!mainTabButtons.length) return;
  mainTabButtons.forEach((btn) => {
    btn.addEventListener('click', () => activateMainTab(btn.dataset.mainTabBtn));
  });
  // pestaña inicial
  activateMainTab('entrenamientos');
}

const modalAsignarAtletas = document.getElementById('modalAsignarAtletas');
const formAsignarAtletas = document.getElementById('form-asignar-atletas-ciclo');
const asignacionFechaInput = document.getElementById('asignacion-fecha');
const asignacionFechaIndividualToggle = document.getElementById('asignacion-fecha-individual');
const asignacionFechasToolbar = document.getElementById('asignacion-fechas-toolbar');
const asignacionFechasAplicar = document.getElementById('asignacion-fechas-aplicar');
const asignacionFechasIndividuales = document.getElementById('asignacion-fechas-individuales');
const asignacionNotasInput = document.getElementById('asignacion-notas');
const asignacionAtletasSelect = document.getElementById('asignacion-atletas');
const asignacionPreviewSelect = document.getElementById('asignacion-preview-atleta');
const asignacionPreviewContainer = document.getElementById('asignacion-preview');

let modalAsignarAtletasInstance = null;
let atletasAsignacionCache = [];
let entrenamientoDetalleCache = new Map();
let entrenamientoAsignacionActual = null;

// ===================== INIT GLOBAL =====================

function init() {
  if (!entrenamientosGrid || !builderStepsContainer) {
    // no es la página de entrenamientos
    return;
  }

  initTrainerShell();
  setupMainTabs();

  formElement?.addEventListener('submit', guardarEntrenamiento);
  addRootStepBtn?.addEventListener('click', () => {
    builderState.push(createStep('interval'));
    renderBuilder();
  });
  cancelBtn?.addEventListener('click', () => {
    startNewEntrenamiento(false);
    showCreateFlowScreen('start');
  });
  createBtn?.addEventListener('click', () => {
    startNewEntrenamiento(false);
    showCreateFlowScreen('start');
    createFlow?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  flowStartButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.flowStart;
      if (mode === 'new') {
        showCreateFlowScreen('type');
      } else {
        showCreateFlowScreen('library');
        toggleBuilder(false);
        document.getElementById('entrenamientos-list-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
  trainingTypeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedTrainingType = btn.dataset.trainingType || 'rodaje';
      trainingTypeButtons.forEach((item) => item.classList.toggle('is-selected', item === btn));
      applyTemplate(selectedTrainingType);
      document.getElementById('entrenamiento-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  useTemplateBtn?.addEventListener('click', () => {
    applyTemplate(selectedTrainingType);
  });
  flowBackButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      showCreateFlowScreen(btn.dataset.flowBack || 'start');
    });
  });
  btnNuevoGuiado?.addEventListener('click', () => {
    if (modalNuevoEntrenamientoEl && window.bootstrap?.Modal) {
      bootstrap.Modal.getOrCreateInstance(modalNuevoEntrenamientoEl).hide();
    }
    openGuiadoModal();
  });
  btnNuevoAvanzado?.addEventListener('click', () => {
    if (modalNuevoEntrenamientoEl && window.bootstrap?.Modal) {
      bootstrap.Modal.getOrCreateInstance(modalNuevoEntrenamientoEl).hide();
    }
    startNewEntrenamiento();
  });
  builderModeGuiadoBtn?.addEventListener('click', () => {
    wizardStepIndex = 0;
    setGuidedMode(true);
  });
  builderModeAvanzadoBtn?.addEventListener('click', () => {
    setGuidedMode(false);
  });
  wizardPrev?.addEventListener('click', () => {
    if (wizardStepIndex > 0) {
      wizardStepIndex -= 1;
      renderWizardStep();
    }
  });
  wizardNext?.addEventListener('click', () => {
    if (wizardStepIndex < wizardSteps.length - 1) {
      wizardStepIndex += 1;
      renderWizardStep();
    }
  });

  guiadoPrev?.addEventListener('click', () => {
    if (guiadoStepIndex > 0) {
      guiadoStepIndex -= 1;
      renderGuiadoStep();
    }
  });
  guiadoNext?.addEventListener('click', () => {
    const step = guiadoSteps[guiadoStepIndex];
    if (step?.key === 'info') collectGuiadoInfo();
    if (step?.key === 'select') {
      collectGuiadoBloques();
      initGuiadoSteps();
    }
    if (guiadoStepIndex < guiadoSteps.length - 1) {
      guiadoStepIndex += 1;
      renderGuiadoStep();
    }
  });
  guiadoSave?.addEventListener('click', () => {
    collectGuiadoInfo();
    const steps = [];
    if (guiadoData.bloques.warmup && guiadoData.steps.warmup) steps.push(guiadoData.steps.warmup);
    if (guiadoData.bloques.main && guiadoData.steps.main) steps.push(guiadoData.steps.main);
    if (guiadoData.bloques.cooldown && guiadoData.steps.cooldown) steps.push(guiadoData.steps.cooldown);

    currentEntrenamientoId = null;
    if (nombreInput) nombreInput.value = guiadoData.info.nombre || '';
    if (objetivoInput) objetivoInput.value = guiadoData.info.objetivo || '';
    if (notasInput) notasInput.value = guiadoData.info.notas || '';

    setGuidedMode(false);
    resetBuilderState(steps);
    toggleBuilder(true);

    if (modalGuiadoEl && window.bootstrap?.Modal) {
      bootstrap.Modal.getOrCreateInstance(modalGuiadoEl).hide();
    }
  });

  startNewEntrenamiento(false);
  renderTemplatePreview(selectedTrainingType);
  showCreateFlowScreen('start');
  fetchEntrenamientos();
}

window.Entrenamientos = { init };
