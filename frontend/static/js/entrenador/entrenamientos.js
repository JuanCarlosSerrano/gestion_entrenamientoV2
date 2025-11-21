const API_BASE =
  window.API_BASE ||
  (window.location && window.location.origin ? window.location.origin : 'http://127.0.0.1:5000');
window.API_BASE = API_BASE;

// ===================== ENTRENAMIENTOS BASE =====================
const entrenamientosGrid = document.getElementById('entrenamientos-grid');
const builderStepsContainer = document.getElementById('builder-steps');
const previewList = document.getElementById('builder-preview-list');
const builderModeLabel = document.getElementById('builder-mode-label');
const formElement = document.getElementById('entrenamiento-form-element');
const addRootStepBtn = document.getElementById('add-root-step-btn');
const cancelBtn = document.getElementById('cancel-entrenamiento-btn');
const createBtn = document.getElementById('create-entrenamiento-btn');

const nombreInput = document.getElementById('nombre');
const objetivoInput = document.getElementById('objetivo');
const notasInput = document.getElementById('notas');
const listaColumn = document.getElementById('entrenamientos-column');
const builderColumn = document.getElementById('builder-column');
const mainTabButtons = document.querySelectorAll('[data-main-tab-btn]');
const mainTabPanels = document.querySelectorAll('[data-main-tab-panel]');

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

function renderBuilder() {
  if (!builderStepsContainer) return;
  builderStepsContainer.innerHTML = '';
  builderState.forEach((step, index) => {
    builderStepsContainer.appendChild(buildStepCard(step, builderState, index));
  });
  renderPreview();
  if (builderModeLabel) {
    builderModeLabel.textContent = currentEntrenamientoId ? `Editando #${currentEntrenamientoId}` : 'Nuevo';
    builderModeLabel.className = `badge ${currentEntrenamientoId ? 'text-bg-warning' : 'text-bg-secondary'}`;
  }
}

function toggleBuilder(show) {
  if (!listaColumn || !builderColumn) return;
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
      buildSelectField('Objetivo', OBJETIVO_TIPOS, step.objetivo_tipo || 'distancia', (value) => {
        step.objetivo_tipo = value;
        if (!value || value === 'libre') {
          step.unidad = null;
        } else if (value === 'distancia' && !step.unidad) {
          step.unidad = 'm';
        } else if (value === 'tiempo' && !step.unidad) {
          step.unidad = 'min';
        }
        renderBuilder();
      }, 'distancia', 'col-md-6')
    );
    body.appendChild(rowTop);

    const rowValues = document.createElement('div');
    rowValues.className = 'row g-2 builder-row';
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
    rowValues.appendChild(
      buildSelectField(
        'Unidad',
        UNIDADES.map((u) => ({ value: u, label: u || '-' })),
        step.unidad || '',
        (value) => {
          step.unidad = value || null;
        },
        'm',
        'col-md-3'
      )
    );
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

function collectPayload() {
  if (!nombreInput.value.trim()) {
    alert('El nombre del entrenamiento es obligatorio');
    return null;
  }
  if (builderState.length === 0) {
    alert('Añade al menos un bloque al entrenamiento');
    return null;
  }

  return {
    nombre: nombreInput.value.trim(),
    objetivo: objetivoInput.value.trim() || null,
    notas: notasInput.value.trim() || null,
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
    card.className = 'training-card';
    if (entrenamiento.id === currentEntrenamientoId) {
      card.classList.add('training-card--active');
    }

    const header = document.createElement('div');
    header.className = 'training-card__header';
    const title = document.createElement('h3');
    title.className = 'h6 mb-0';
    title.textContent = entrenamiento.nombre;
    header.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'training-card__meta';
    if (entrenamiento.objetivo) meta.innerHTML += `<span>🎯 ${entrenamiento.objetivo}</span>`;
    header.appendChild(meta);
    card.appendChild(header);

    const summary = document.createElement('div');
    summary.className = 'training-card__summary';
    const pasos = entrenamiento.pasos || [];
    summary.textContent = pasos.length
      ? pasos.map(describeStep).join(' · ')
      : (entrenamiento.bloque_principal || '-');
    card.appendChild(summary);

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

    actions.append(editBtn, duplicateBtn, deleteBtn);
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
    renderEntrenamientos();
    // cuando tengamos entrenamientos, refrescamos biblioteca de microciclos si existe
    renderMicroLibrary();
  } catch (error) {
    console.error(error);
    alert('Error al obtener la lista de entrenamientos');
  }
}

function startNewEntrenamiento(showBuilder = true) {
  currentEntrenamientoId = null;
  if (nombreInput) nombreInput.value = '';
  if (objetivoInput) objetivoInput.value = '';
  if (notasInput) notasInput.value = '';
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
  resetBuilderState(entrenamiento.pasos || []);
  renderEntrenamientos();
  toggleBuilder(true);
}

// ===================== MICROCICLOS (plantillas) =====================

const WEEK_DAYS = [
  { dia: 1, label: 'Lun' },
  { dia: 2, label: 'Mar' },
  { dia: 3, label: 'Mié' },
  { dia: 4, label: 'Jue' },
  { dia: 5, label: 'Vie' },
  { dia: 6, label: 'Sáb' },
  { dia: 7, label: 'Dom' }
];

const microListEl = document.getElementById('micro-list');
const microListView = document.getElementById('micro-list-view');
const microBuilderView = document.getElementById('micro-builder-view');
const microCreateBtn = document.getElementById('micro-create-btn');
const microBuilderBackBtn = document.getElementById('micro-builder-back');
const microBuilderTitle = document.getElementById('micro-builder-title');
const microWeekGrid = document.getElementById('micro-week-grid');
const microForm = document.getElementById('form-micro');
const microIdField = document.getElementById('micro-id-field');
const microNombreInput = microForm?.elements['nombre'] || document.querySelector('#form-micro input[name="nombre"]');
const microObjetivoInput =
  microForm?.elements['objetivo'] || document.querySelector('#form-micro textarea[name="objetivo"]');

const microLibrary = document.getElementById('biblioteca-entrenamientos');
const inputBuscarEntrenamiento = document.getElementById('input-buscar-entrenamiento');
const btnLimpiarEntrenamiento = document.getElementById('btn-limpiar-entrenamiento');

let microPlantillas = [];
let microSemana = {}; // {1: [{entrenamiento_id, nombre}], ...}
let dragEntrenamientoId = null;
let dragOriginDay = null;
let dragOriginIndex = null;

function resetMicroSemana() {
  microSemana = {};
  WEEK_DAYS.forEach(({ dia }) => {
    microSemana[dia] = [];
  });
}

function renderMicroLibrary() {
  if (!microLibrary) return;
  microLibrary.innerHTML = '';

  if (!entrenamientosData || !entrenamientosData.length) {
    const empty = document.createElement('p');
    empty.className = 'text-muted small';
    empty.textContent = 'Primero crea entrenamientos en la pestaña principal.';
    microLibrary.appendChild(empty);
    return;
  }

  const filtro = (inputBuscarEntrenamiento?.value || '').toLowerCase();

  entrenamientosData
    .filter((e) => !filtro || e.nombre.toLowerCase().includes(filtro))
    .forEach((ent) => {
      const card = document.createElement('div');
      card.className = 'training-lib-card';
      card.draggable = true;
      card.dataset.entrenamientoId = String(ent.id);

      card.addEventListener('dragstart', (ev) => {
        dragEntrenamientoId = ent.id;
        dragOriginDay = null;
        dragOriginIndex = null;
        ev.dataTransfer?.setData('text/plain', String(ent.id));
      });

      const title = document.createElement('strong');
      title.textContent = ent.nombre;
      card.appendChild(title);

      if (ent.objetivo) {
        const p = document.createElement('div');
        p.className = 'small text-muted';
        p.textContent = ent.objetivo;
        card.appendChild(p);
      }

      microLibrary.appendChild(card);
    });
}

function renderMicroWeekGrid() {
  if (!microWeekGrid) return;
  microWeekGrid.innerHTML = '';

  WEEK_DAYS.forEach(({ dia, label }) => {
    const col = document.createElement('div');
    col.className = 'micro-day-column';
    col.dataset.diaSemana = String(dia);

    const header = document.createElement('div');
    header.className = 'micro-day-header';
    header.textContent = label;
    col.appendChild(header);

    const body = document.createElement('div');
    body.className = 'micro-day-body';

    body.addEventListener('dragover', (ev) => {
      ev.preventDefault();
    });

    body.addEventListener('drop', (ev) => {
      ev.preventDefault();
      const idFromData = ev.dataTransfer?.getData('text/plain');
      const entId = dragEntrenamientoId || (idFromData ? parseInt(idFromData, 10) : null);
      if (!entId) return;

      // si venía desde otro día, lo quitamos
      if (dragOriginDay !== null && dragOriginIndex !== null) {
        const arr = microSemana[dragOriginDay] || [];
        arr.splice(dragOriginIndex, 1);
      }

      const ent = entrenamientosData.find((e) => e.id === entId);
      microSemana[dia].push({
        entrenamiento_id: entId,
        nombre: ent ? ent.nombre : `Ent. #${entId}`
      });

      dragEntrenamientoId = null;
      dragOriginDay = null;
      dragOriginIndex = null;

      renderMicroWeekGrid();
    });

    const sesiones = microSemana[dia] || [];
    if (!sesiones.length) {
      const placeholder = document.createElement('div');
      placeholder.className = 'micro-day-placeholder text-muted';
      placeholder.textContent = 'Arrastra aquí entrenamientos';
      body.appendChild(placeholder);
    } else {
      sesiones.forEach((sesion, idx) => {
        const item = document.createElement('div');
        item.className = 'micro-session-card';
        item.draggable = true;
        item.dataset.entrenamientoId = String(sesion.entrenamiento_id);
        item.dataset.day = String(dia);
        item.dataset.index = String(idx);

        item.addEventListener('dragstart', (ev) => {
          dragEntrenamientoId = sesion.entrenamiento_id;
          dragOriginDay = dia;
          dragOriginIndex = idx;
          ev.dataTransfer?.setData('text/plain', String(sesion.entrenamiento_id));
        });

        const labelNode = document.createElement('span');
        labelNode.textContent = sesion.nombre;
        item.appendChild(labelNode);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn btn-sm btn-link text-danger micro-session-remove';
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', () => {
          microSemana[dia].splice(idx, 1);
          renderMicroWeekGrid();
        });
        item.appendChild(removeBtn);

        body.appendChild(item);
      });
    }

    col.appendChild(body);
    microWeekGrid.appendChild(col);
  });
}

function openMicroBuilder(micro = null) {
  if (!microListView || !microBuilderView) return;

  if (micro) {
    // Editar
    microIdField.value = micro.id;
    if (microNombreInput) microNombreInput.value = micro.nombre || '';
    if (microObjetivoInput) microObjetivoInput.value = micro.descripcion || '';
    if (microBuilderTitle) {
      microBuilderTitle.textContent = `Editar microciclo: ${micro.nombre}`;
    }
    resetMicroSemana();

    (micro.detalles || []).forEach((det) => {
      const dia = det.dia_semana || 1;
      if (!microSemana[dia]) microSemana[dia] = [];
      microSemana[dia].push({
        entrenamiento_id: det.entrenamiento_id,
        nombre: det.entrenamiento_nombre || `Ent. #${det.entrenamiento_id}`
      });
    });
  } else {
    // Nuevo
    microIdField.value = '';
    if (microNombreInput) microNombreInput.value = '';
    if (microObjetivoInput) microObjetivoInput.value = '';
    if (microBuilderTitle) {
      microBuilderTitle.textContent = 'Nuevo microciclo estándar';
    }
    resetMicroSemana();
  }

  renderMicroWeekGrid();
  renderMicroLibrary();

  microListView.classList.add('d-none');
  microBuilderView.classList.remove('d-none');
}

function closeMicroBuilder() {
  if (!microListView || !microBuilderView) return;
  microBuilderView.classList.add('d-none');
  microListView.classList.remove('d-none');
  // por si acaso
  resetMicroSemana();
}

async function loadMicroList() {
  if (!microListEl) return;
  microListEl.innerHTML = '<p class="text-muted">Cargando microciclos...</p>';

  try {
    const res = await fetch(`${API_BASE}/plantillas/microciclos`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader()
      },
      credentials: 'include'
    });

    // Si el endpoint no existe aún, no lo tratamos como error grave
    if (res.status === 404) {
      console.info('Endpoint /plantillas/microciclos no existe todavía. Microciclos desactivados.');
      microPlantillas = [];
      renderMicroList(); // mostrará el mensaje "Todavía no hay microciclos estándar creados."
      return;
    }

    if (!res.ok) throw new Error('Error al cargar microciclos');

    microPlantillas = await res.json();
    renderMicroList();
  } catch (err) {
    console.warn('loadMicroList warning', err);
    microListEl.innerHTML =
      '<p class="text-muted small">Los microciclos aún no están disponibles (ruta backend pendiente).</p>';
  }
}


function renderMicroList() {
  if (!microListEl) return;
  microListEl.innerHTML = '';

  if (!microPlantillas.length) {
    const empty = document.createElement('p');
    empty.className = 'text-muted small';
    empty.textContent = 'Todavía no hay microciclos estándar creados.';
    microListEl.appendChild(empty);
    return;
  }

  microPlantillas.forEach((micro) => {
    const card = document.createElement('div');
    card.className = 'micro-card';

    const header = document.createElement('div');
    header.className = 'micro-card-header d-flex justify-content-between align-items-center';

    const title = document.createElement('strong');
    title.textContent = micro.nombre;
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'micro-card-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-sm btn-outline-primary';
    editBtn.textContent = 'Editar';
    editBtn.addEventListener('click', () => openMicroBuilder(micro));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-sm btn-outline-danger';
    delBtn.textContent = 'Borrar';
    delBtn.addEventListener('click', () => deleteMicro(micro.id));

    actions.append(editBtn, delBtn);
    header.appendChild(actions);
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'micro-card-body';

    if (micro.descripcion) {
      const p = document.createElement('div');
      p.className = 'small text-muted mb-1';
      p.textContent = micro.descripcion;
      body.appendChild(p);
    }

    const summary = document.createElement('div');
    summary.className = 'small';
    const byDay = {};
    (micro.detalles || []).forEach((d) => {
      const dia = d.dia_semana || 1;
      byDay[dia] = (byDay[dia] || 0) + 1;
    });
    const parts = WEEK_DAYS.map(({ dia, label }) => {
      const n = byDay[dia] || 0;
      return `${label}:${n}`;
    });
    summary.textContent = parts.join(' · ');
    body.appendChild(summary);

    card.appendChild(body);
    microListEl.appendChild(card);
  });
}

async function saveMicro(event) {
  event?.preventDefault();
  if (!microForm) return;

  const nombre = (microNombreInput?.value || '').trim();
  const objetivo = (microObjetivoInput?.value || '').trim();

  if (!nombre) {
    alert('El nombre del microciclo es obligatorio');
    return;
  }

  const detalles = [];
  let ordenGlobal = 1;
  WEEK_DAYS.forEach(({ dia }) => {
    (microSemana[dia] || []).forEach((sesion, idx) => {
      if (!sesion.entrenamiento_id) return;
      detalles.push({
        entrenamiento_id: sesion.entrenamiento_id,
        dia_semana: dia,
        sesion: 1, // por ahora 1 sesión por día, el orden va aparte
        orden: ordenGlobal++
      });
    });
  });

  if (!detalles.length) {
    alert('Añade al menos un entrenamiento en la semana');
    return;
  }

  const payload = {
    nombre,
    descripcion: objetivo || null,
    tipo_semana: null,
    detalles
  };

  const csrf = await ensureCsrfToken();
  const id = microIdField?.value;
  const isEdit = !!id;

  const url = isEdit
    ? `${API_BASE}/plantillas/microciclos/${id}`
    : `${API_BASE}/plantillas/microciclos`;
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader(),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {})
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'No se pudo guardar el microciclo');
    }

    alert(isEdit ? 'Microciclo actualizado' : 'Microciclo creado');
    await loadMicroList();
    closeMicroBuilder();
  } catch (err) {
    console.error('saveMicro error', err);
    alert(err.message || 'Error al guardar el microciclo');
  }
}

async function deleteMicro(id) {
  if (!confirm('¿Eliminar este microciclo estándar?')) return;
  const csrf = await ensureCsrfToken();
  try {
    const res = await fetch(`${API_BASE}/plantillas/microciclos/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: authHeader(),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {})
      },
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'No se pudo eliminar el microciclo');
    }
    await loadMicroList();
  } catch (err) {
    console.error('deleteMicro error', err);
    alert(err.message || 'Error al eliminar el microciclo');
  }
}

function initMicroUI() {
  if (!microListEl) return; // no estamos en esa página

  loadMicroList();
  renderMicroLibrary();

  microCreateBtn?.addEventListener('click', () => openMicroBuilder(null));
  microBuilderBackBtn?.addEventListener('click', () => closeMicroBuilder());
  microForm?.addEventListener('submit', saveMicro);

  inputBuscarEntrenamiento?.addEventListener('input', () => renderMicroLibrary());
  btnLimpiarEntrenamiento?.addEventListener('click', () => {
    if (inputBuscarEntrenamiento) inputBuscarEntrenamiento.value = '';
    renderMicroLibrary();
  });
}

// ===================== MESOCICLOS / MACROCICLOS (esqueleto básico) =====================

const mesoListEl = document.getElementById('meso-list');
const mesoCreateBtn = document.getElementById('meso-create-btn');
const macroListEl = document.getElementById('macro-list');
const macroCreateBtn = document.getElementById('macro-create-btn');

let mesoPlantillas = [];
let macroPlantillas = [];

async function loadMesoList() {
  if (!mesoListEl) return;
  mesoListEl.innerHTML = '<p class="text-muted">Cargando mesociclos...</p>';

  try {
    const res = await fetch(`${API_BASE}/plantillas/mesociclos`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader()
      },
      credentials: 'include'
    });

    if (res.status === 404) {
      console.info('Endpoint /plantillas/mesociclos no existe todavía. Mesociclos desactivados.');
      mesoPlantillas = [];
      renderMesoList(); // mostrará "Todavía no hay mesociclos creados."
      return;
    }

    if (!res.ok) throw new Error('Error al cargar mesociclos');

    mesoPlantillas = await res.json();
    renderMesoList();
  } catch (err) {
    console.warn('loadMesoList warning', err);
    mesoListEl.innerHTML =
      '<p class="text-muted small">Los mesociclos aún no están disponibles (ruta backend pendiente).</p>';
  }
}


function renderMesoList() {
  if (!mesoListEl) return;
  mesoListEl.innerHTML = '';

  if (!mesoPlantillas.length) {
    const empty = document.createElement('p');
    empty.className = 'text-muted small';
    empty.textContent = 'Todavía no hay mesociclos creados.';
    mesoListEl.appendChild(empty);
    return;
  }

  mesoPlantillas.forEach((meso) => {
    const card = document.createElement('div');
    card.className = 'meso-card';

    const header = document.createElement('div');
    header.className = 'd-flex justify-content-between align-items-center';
    const title = document.createElement('strong');
    title.textContent = meso.nombre;
    header.appendChild(title);

    const count = document.createElement('span');
    count.className = 'badge text-bg-secondary';
    count.textContent = `${(meso.microciclos || []).length} semanas`;
    header.appendChild(count);

    card.appendChild(header);

    if (meso.descripcion) {
      const p = document.createElement('div');
      p.className = 'small text-muted mt-1';
      p.textContent = meso.descripcion;
      card.appendChild(p);
    }

    mesoListEl.appendChild(card);
  });
}

async function loadMacroList() {
  if (!macroListEl) return;
  macroListEl.innerHTML = '<p class="text-muted">Cargando macrociclos...</p>';

  try {
    const res = await fetch(`${API_BASE}/plantillas/macrociclos`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader()
      },
      credentials: 'include'
    });

    if (res.status === 404) {
      console.info('Endpoint /plantillas/macrociclos no existe todavía. Macrociclos desactivados.');
      macroPlantillas = [];
      renderMacroList(); // mostrará "Todavía no hay macrociclos creados."
      return;
    }

    if (!res.ok) throw new Error('Error al cargar macrociclos');

    macroPlantillas = await res.json();
    renderMacroList();
  } catch (err) {
    console.warn('loadMacroList warning', err);
    macroListEl.innerHTML =
      '<p class="text-muted small">Los macrociclos aún no están disponibles (ruta backend pendiente).</p>';
  }
}

function renderMacroList() {
  if (!macroListEl) return;
  macroListEl.innerHTML = '';

  if (!macroPlantillas.length) {
    const empty = document.createElement('p');
    empty.className = 'text-muted small';
    empty.textContent = 'Todavía no hay macrociclos creados.';
    macroListEl.appendChild(empty);
    return;
  }

  macroPlantillas.forEach((macro) => {
    const card = document.createElement('div');
    card.className = 'macro-card';

    const header = document.createElement('div');
    header.className = 'd-flex justify-content-between align-items-center';
    const title = document.createElement('strong');
    title.textContent = macro.nombre;
    header.appendChild(title);

    const weeks = macro.duracion_semanas || (macro.mesociclos || []).length * 4 || '?';
    const badge = document.createElement('span');
    badge.className = 'badge text-bg-secondary';
    badge.textContent = `${weeks} semanas`;
    header.appendChild(badge);

    card.appendChild(header);

    if (macro.descripcion) {
      const p = document.createElement('div');
      p.className = 'small text-muted mt-1';
      p.textContent = macro.descripcion;
      card.appendChild(p);
    }

    macroListEl.appendChild(card);
  });
}

function initMesoMacroUI() {
  if (mesoListEl) {
    loadMesoList();
  }
  if (macroListEl) {
    loadMacroList();
  }

  mesoCreateBtn?.addEventListener('click', () => {
    alert('La creación/edición visual de mesociclos se añadirá después. De momento sólo está el listado.');
  });

  macroCreateBtn?.addEventListener('click', () => {
    alert('La creación/edición visual de macrociclos se añadirá después. De momento sólo está el listado.');
  });
}

// ===================== INIT GLOBAL =====================

function init() {
  if (!entrenamientosGrid || !builderStepsContainer) {
    // no es la página de entrenamientos
    return;
  }

  setupMainTabs();

  formElement?.addEventListener('submit', guardarEntrenamiento);
  addRootStepBtn?.addEventListener('click', () => {
    builderState.push(createStep('interval'));
    renderBuilder();
  });
  cancelBtn?.addEventListener('click', () => {
    startNewEntrenamiento(false);
  });
  createBtn?.addEventListener('click', () => startNewEntrenamiento());

  startNewEntrenamiento(false);
  fetchEntrenamientos();

  // pestañas de ciclos
  initMicroUI();
  initMesoMacroUI();
}

export { init };
