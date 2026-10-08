import './styles.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { topics, type Topic } from './topics';
import {
  snapToScreenEndpoint,
  worldSizeForPixels,
  getCornerVertices
} from './snap';
import { LightingController } from './lights';

// ============ DOM ============
const selectorPage = document.getElementById('selector-page')!;
const viewerPage = document.getElementById('viewer-page')!;
const topicGrid = document.getElementById('topic-grid')!;
const topicTitle = document.getElementById('topic-title')!;
const viewport = document.getElementById('viewport')!;
const infoContent = document.getElementById('info-content')!;
const toastEl = document.getElementById('toast')!;

const lightsPanel = document.getElementById('lights-panel')!;
const btnLights = document.getElementById('btn-lights')!;
const btnCloseLights = document.getElementById('btn-close-lights')!;
const presetBg = document.getElementById('preset-bg') as HTMLSelectElement;
const sliderAmbient = document.getElementById('slider-ambient') as HTMLInputElement;
const sliderMain = document.getElementById('slider-main') as HTMLInputElement;
const sliderFill = document.getElementById('slider-fill') as HTMLInputElement;
const valAmbient = document.getElementById('val-ambient')!;
const valMain = document.getElementById('val-main')!;
const valFill = document.getElementById('val-fill')!;
const btnAddLight = document.getElementById('btn-add-light')!;
const extraLightsList = document.getElementById('extra-lights-list')!;
const chkShadows = document.getElementById('chk-shadows') as HTMLInputElement;
const btnResetLights = document.getElementById('btn-reset-lights')!;

// ============ TOAST ============
let toastTimeout: number | undefined;

function showToast(
  message: string,
  kind: 'info' | 'error' | 'success' = 'info'
) {
  toastEl.textContent = message;
  toastEl.className = `toast visible ${kind}`;
  if (toastTimeout) window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toastEl.classList.remove('visible');
  }, 4500);
}

// ============ FILE EXISTENCE CHECK ============
async function fileExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return false;
    const type = res.headers.get('content-type') || '';
    return !type.includes('text/html');
  } catch {
    return false;
  }
}

// ============ SELECTOR ============
function buildSelector() {
  topicGrid.innerHTML = '';
  for (const topic of topics) {
    const card = document.createElement('div');
    card.className = 'topic-card';
    card.innerHTML = `
      <div class="topic-thumb">
        <img
          src="${topic.thumbnailUrl}"
          alt="${topic.title} thumbnail"
          loading="lazy"
          onerror="this.style.display='none'; this.parentElement.insertAdjacentHTML('beforeend', '<div class=&quot;thumb-fallback&quot;>🏗️</div>');"
        />
      </div>
      <div class="topic-body">
        <h3>${topic.title}</h3>
        <p>${topic.description}</p>
        <span class="badge">${topic.sheetUrl ? 'Model + Sheet' : 'Model'}</span>
      </div>
    `;
    card.addEventListener('click', () => openTopic(topic));
    topicGrid.appendChild(card);
  }
}

// ============ VIEWER STATE ============
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let modelRoot: THREE.Group;
let loader: GLTFLoader;
let raycaster: THREE.Raycaster;
let mouse: THREE.Vector2;
let lighting: LightingController;

let measureMode = false;
let measurePoints: THREE.Vector3[] = [];
const measureMarkers: THREE.Object3D[] = [];
let snapIndicator: THREE.Mesh;
let previewLine: THREE.Line;
let currentTopic: Topic | null = null;

const SNAP_RADIUS_PX = 18;
const SNAP_DOT_PX = 10;
const ALLOW_VERTEX_FALLBACK = true;

let debugCornersOn = false;
let debugDotGroup: THREE.Group | null = null;

// ============ INIT ============
function initViewer() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f7fa);

  camera = new THREE.PerspectiveCamera(
    60,
    viewport.clientWidth / viewport.clientHeight,
    0.1,
    10000
  );
  camera.position.set(15, 12, 15);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewport.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  lighting = new LightingController(scene);

  scene.add(new THREE.GridHelper(200, 200, 0xcbd5e1, 0xe2e8f0));

  modelRoot = new THREE.Group();
  scene.add(modelRoot);

  loader = new GLTFLoader();
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  snapIndicator = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0x10b981,
      depthTest: false,
      transparent: true,
      opacity: 0.95
    })
  );
  snapIndicator.visible = false;
  snapIndicator.renderOrder = 999;
  scene.add(snapIndicator);

  const previewGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3()
  ]);
  previewLine = new THREE.Line(
    previewGeom,
    new THREE.LineDashedMaterial({
      color: 0xe94560,
      dashSize: 0.4,
      gapSize: 0.25,
      depthTest: false
    })
  );
  previewLine.visible = false;
  previewLine.renderOrder = 998;
  scene.add(previewLine);

  debugDotGroup = new THREE.Group();
  debugDotGroup.visible = false;
  scene.add(debugDotGroup);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  renderer.domElement.addEventListener('click', onPickClick);
  renderer.domElement.addEventListener('click', onMeasureClick);
  renderer.domElement.addEventListener('mousemove', onPointerMove);
  renderer.domElement.addEventListener('mouseleave', () => {
    snapIndicator.visible = false;
    previewLine.visible = false;
  });
}

// ============ OPEN TOPIC ============
async function openTopic(topic: Topic) {
  currentTopic = topic;
  topicTitle.textContent = topic.title;

  selectorPage.classList.add('hidden');
  viewerPage.classList.remove('hidden');

  if (!renderer) initViewer();

  requestAnimationFrame(() => {
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  clearModel();
  clearMeasurements();

  const modelOk = await fileExists(topic.modelUrl);
  if (!modelOk) {
    showToast(`Model missing: public${topic.modelUrl}`, 'error');
    infoContent.innerHTML = `
      <h3 style="margin-bottom:0.5rem;color:#e94560">Model not found</h3>
      <p class="hint">Expected file:</p>
      <code style="font-size:0.75rem;background:#f8fafc;padding:6px;display:block;border-radius:4px;margin-top:0.4rem;">public${topic.modelUrl}</code>
    `;
  } else {
    loader.load(
      topic.modelUrl,
      (gltf) => {
        const model = gltf.scene;
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.userData.displayName =
              child.name || (child.parent?.name ?? `Object ${child.id}`);
          }
        });
        modelRoot.add(model);

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const dist = maxDim * 1.8;

        controls.target.copy(center);
        camera.position.set(
          center.x + dist,
          center.y + dist * 0.7,
          center.z + dist
        );
        controls.update();

        lighting.main.target.position.copy(center);
        lighting.main.target.updateMatrixWorld();

        const half = maxDim * 1.2;
        lighting.main.shadow.camera.left = -half;
        lighting.main.shadow.camera.right = half;
        lighting.main.shadow.camera.top = half;
        lighting.main.shadow.camera.bottom = -half;
        lighting.main.shadow.camera.far = maxDim * 10;
        lighting.main.shadow.camera.updateProjectionMatrix();

        if (debugCornersOn) {
          debugCornersOn = false;
          toggleDebugCorners();
        }
      },
      undefined,
      () => showToast('Could not load model', 'error')
    );
  }

  infoContent.innerHTML =
    '<p class="hint">Click an object in the model to see its name.</p>';
}

// ============ CLEAR ============
function clearModel() {
  while (modelRoot.children.length) {
    const child = modelRoot.children[0];
    modelRoot.remove(child);
    child.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
  }
}

function clearMeasurements() {
  for (const m of measureMarkers) {
    scene.remove(m);
    const mesh = m as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat.dispose();
    }
  }
  measureMarkers.length = 0;
  measurePoints = [];
  previewLine.visible = false;
  snapIndicator.visible = false;
}

// ============ SNAP HELPERS ============
function getHitAndSnap(event: MouseEvent) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(modelRoot.children, true);
  if (hits.length === 0) return null;

  const hit = hits[0];
  const mesh = hit.object as THREE.Mesh;
  if (!mesh.isMesh) return null;

  const snap = snapToScreenEndpoint(
    renderer,
    camera,
    mesh,
    event.clientX,
    event.clientY,
    SNAP_RADIUS_PX,
    ALLOW_VERTEX_FALLBACK
  );

  return { hit, mesh, snap };
}

function updateSnapDotScale() {
  const dist = camera.position.distanceTo(snapIndicator.position);
  const worldSize = worldSizeForPixels(
    SNAP_DOT_PX,
    dist,
    camera,
    renderer.domElement.clientHeight
  );
  snapIndicator.scale.setScalar(worldSize / 2);
}

// ============ POINTER MOVE ============
function onPointerMove(event: MouseEvent) {
  if (!measureMode || !renderer) return;

  const result = getHitAndSnap(event);

  if (!result || !result.snap) {
    snapIndicator.visible = false;
    previewLine.visible = false;
    return;
  }

  const point = result.snap.point;
  snapIndicator.position.copy(point);
  snapIndicator.visible = true;
  snapIndicator.material.color.set(
    result.snap.isCorner ? 0x10b981 : 0xf59e0b
  );
  updateSnapDotScale();

  if (measurePoints.length === 1) {
    const positions = previewLine.geometry.attributes
      .position as THREE.BufferAttribute;
    positions.setXYZ(
      0,
      measurePoints[0].x,
      measurePoints[0].y,
      measurePoints[0].z
    );
    positions.setXYZ(1, point.x, point.y, point.z);
    positions.needsUpdate = true;
    previewLine.geometry.computeBoundingSphere();
    previewLine.computeLineDistances();
    previewLine.visible = true;
  }
}

// ============ MEASURE CLICK ============
function onMeasureClick(event: MouseEvent) {
  if (!measureMode) return;

  const result = getHitAndSnap(event);
  if (!result || !result.snap) return;

  const point = result.snap.point;
  measurePoints.push(point);

  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xe94560, depthTest: false })
  );
  dot.renderOrder = 998;
  dot.position.copy(point);
  scene.add(dot);
  measureMarkers.push(dot);

  const dToCam = camera.position.distanceTo(point);
  const worldSize = worldSizeForPixels(
    SNAP_DOT_PX,
    dToCam,
    camera,
    renderer.domElement.clientHeight
  );
  dot.scale.setScalar(worldSize / 2);

  if (measurePoints.length === 2) {
    const [a, b] = measurePoints;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([a, b]),
      new THREE.LineBasicMaterial({ color: 0xe94560, depthTest: false })
    );
    line.renderOrder = 997;
    scene.add(line);
    measureMarkers.push(line);

    const d = a.distanceTo(b);
    infoContent.innerHTML = `
      <h3 style="margin-bottom:0.5rem;color:#e94560">📏 Measurement</h3>
      <div class="prop-row"><span class="prop-key">Distance</span><span>${d.toFixed(3)} m</span></div>
      <p class="hint" style="margin-top:0.5rem">Both endpoints snapped to corners.</p>
    `;

    measurePoints = [];
    previewLine.visible = false;
  }
}

// ============ OBJECT PICKING ============
function onPickClick(event: MouseEvent) {
  if (measureMode) return;

  const result = getHitAndSnap(event);
  if (!result) {
    infoContent.innerHTML =
      '<p class="hint">Click an object in the model to see its name.</p>';
    return;
  }

  const obj = result.mesh;
  const name = (obj.userData.displayName as string) || obj.name || 'Unnamed';
  const geometry = obj.geometry as THREE.BufferGeometry;
  const verts = geometry?.attributes.position?.count ?? 0;
  const tris = geometry?.index ? geometry.index.count / 3 : 0;

  infoContent.innerHTML = `
    <h3 style="margin-bottom:0.5rem;color:#e94560">${name}</h3>
    <div class="prop-row"><span class="prop-key">Vertices</span><span>${verts}</span></div>
    <div class="prop-row"><span class="prop-key">Triangles</span><span>${tris}</span></div>
    <div class="prop-row"><span class="prop-key">Position X</span><span>${obj.position.x.toFixed(2)}</span></div>
    <div class="prop-row"><span class="prop-key">Position Y</span><span>${obj.position.y.toFixed(2)}</span></div>
    <div class="prop-row"><span class="prop-key">Position Z</span><span>${obj.position.z.toFixed(2)}</span></div>
  `;
}

// ============ DEBUG CORNERS ============
function toggleDebugCorners() {
  if (!debugDotGroup) return;
  debugCornersOn = !debugCornersOn;
  debugDotGroup.visible = debugCornersOn;

  while (debugDotGroup.children.length) {
    const c = debugDotGroup.children[0];
    debugDotGroup.remove(c);
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    (m.material as THREE.Material)?.dispose();
  }

  if (!debugCornersOn) return;

  let totalCorners = 0;
  const sharedGeom = new THREE.SphereGeometry(1, 8, 8);
  const sharedMat = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    depthTest: false
  });

  modelRoot.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    const corners = getCornerVertices(mesh);
    totalCorners += corners.length;

    for (const local of corners) {
      const world = local.clone().applyMatrix4(mesh.matrixWorld);
      const dot = new THREE.Mesh(sharedGeom, sharedMat);
      dot.renderOrder = 900;
      dot.position.copy(world);
      const d = camera.position.distanceTo(world);
      const ws = worldSizeForPixels(
        6,
        d,
        camera,
        renderer.domElement.clientHeight
      );
      dot.scale.setScalar(ws / 2);
      debugDotGroup.add(dot);
    }
  });

  console.log(`[DEBUG] Total corners detected: ${totalCorners}`);
}

// ============ DOWNLOAD HELPER ============
async function downloadFileAsBlob(
  url: string,
  fallbackName: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, message: `Server returned ${response.status}` };
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      return {
        ok: false,
        message: `File not found — place it at public${url}`
      };
    }

    const blob = await response.blob();
    if (blob.size === 0) {
      return { ok: false, message: `File at ${url} is empty` };
    }

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = url.split('/').pop() || fallbackName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);

    return {
      ok: true,
      message: `Downloaded ${link.download} (${(blob.size / 1024).toFixed(1)} KB)`
    };
  } catch (err) {
    return { ok: false, message: `Network error: ${(err as Error).message}` };
  }
}

// ============ LIGHTS PANEL ============
function renderExtraLights() {
  if (lighting.extras.length === 0) {
    extraLightsList.innerHTML =
      '<p class="hint">No extra lights. Click "+ Add" to create one.</p>';
    return;
  }

  extraLightsList.innerHTML = '';
  lighting.extras.forEach((entry, index) => {
    const item = document.createElement('div');
    item.className = 'extra-light-item';
    item.innerHTML = `
      <div class="extra-light-head">
        <span class="extra-light-name">Light ${index + 1}</span>
        <button class="remove-light-btn" data-id="${entry.id}">Remove</button>
      </div>
      <input
        type="range"
        class="light-slider"
        min="0"
        max="3"
        step="0.05"
        value="${entry.light.intensity}"
        data-id="${entry.id}"
      />
    `;
    extraLightsList.appendChild(item);
  });

  extraLightsList.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((slider) => {
    slider.addEventListener('input', () => {
      const id = Number(slider.dataset.id);
      lighting.setExtraIntensity(id, Number(slider.value));
    });
  });

  extraLightsList.querySelectorAll<HTMLButtonElement>('.remove-light-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      lighting.removeExtraLight(id);
      renderExtraLights();
    });
  });
}

function wireLightsPanel() {
  btnLights.addEventListener('click', () => {
    lightsPanel.classList.toggle('hidden');
  });

  btnCloseLights.addEventListener('click', () => {
    lightsPanel.classList.add('hidden');
  });

  presetBg.addEventListener('change', () => {
    lighting.setBackground(presetBg.value);
  });

  sliderAmbient.addEventListener('input', () => {
    const v = Number(sliderAmbient.value);
    lighting.setAmbientIntensity(v);
    valAmbient.textContent = v.toFixed(2);
  });

  sliderMain.addEventListener('input', () => {
    const v = Number(sliderMain.value);
    lighting.setMainIntensity(v);
    valMain.textContent = v.toFixed(2);
  });

  sliderFill.addEventListener('input', () => {
    const v = Number(sliderFill.value);
    lighting.setFillIntensity(v);
    valFill.textContent = v.toFixed(2);
  });

  document.querySelectorAll<HTMLButtonElement>('.direction-grid button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dir = btn.dataset.dir || 'reset';
      lighting.setMainDirection(dir);
    });
  });

  btnAddLight.addEventListener('click', () => {
    if (lighting.extras.length >= 6) {
      showToast('Maximum 6 extra lights', 'error');
      return;
    }
    lighting.addExtraLight();
    renderExtraLights();
  });

  chkShadows.addEventListener('change', () => {
    lighting.setShadowsEnabled(chkShadows.checked);
    renderer.shadowMap.needsUpdate = true;
  });

  btnResetLights.addEventListener('click', () => {
    lighting.resetAll();
    sliderAmbient.value = '0.9';
    sliderMain.value = '1.1';
    sliderFill.value = '0.4';
    valAmbient.textContent = '0.90';
    valMain.textContent = '1.10';
    valFill.textContent = '0.40';
    presetBg.value = '#f5f7fa';
    chkShadows.checked = true;
    renderExtraLights();
    showToast('Lights reset to default', 'success');
  });
}

// ============ TOOLBAR ============
const btnBack = document.getElementById('btn-back')!;
const btnMeasure = document.getElementById('btn-measure')!;
const btnClear = document.getElementById('btn-clear')!;
const btnDebug = document.getElementById('btn-debug')!;
const btnDwg = document.getElementById('btn-dwg')!;
const btnOpenPdf = document.getElementById('btn-open-pdf')!;

btnBack.addEventListener('click', () => {
  clearMeasurements();
  clearModel();
  measureMode = false;
  btnMeasure.classList.remove('active');
  lightsPanel.classList.add('hidden');
  viewerPage.classList.add('hidden');
  selectorPage.classList.remove('hidden');
});

btnMeasure.addEventListener('click', () => {
  measureMode = !measureMode;
  btnMeasure.classList.toggle('active', measureMode);
  renderer.domElement.style.cursor = measureMode ? 'crosshair' : 'default';
  if (!measureMode) {
    snapIndicator.visible = false;
    previewLine.visible = false;
    measurePoints = [];
  }
});

btnClear.addEventListener('click', clearMeasurements);

btnDebug.addEventListener('click', toggleDebugCorners);

btnOpenPdf.addEventListener('click', async () => {
  if (!currentTopic?.sheetUrl) {
    showToast('No sheet attached to this topic', 'error');
    return;
  }

  const ok = await fileExists(currentTopic.sheetUrl);
  if (!ok) {
    showToast(`PDF not found at public${currentTopic.sheetUrl}`, 'error');
    return;
  }

  const newTab = window.open(
    currentTopic.sheetUrl,
    '_blank',
    'noopener,noreferrer'
  );
  if (!newTab) {
    showToast('Popup blocked — allow popups for this site', 'error');
    return;
  }
  showToast('PDF opened in a new tab', 'success');
});

btnDwg.addEventListener('click', async () => {
  if (!currentTopic?.dwgUrl) {
    showToast('No DWG attached to this topic', 'error');
    return;
  }

  showToast('Checking file…', 'info');
  const result = await downloadFileAsBlob(currentTopic.dwgUrl, 'drawing.dwg');

  if (result.ok) {
    showToast(result.message, 'success');
  } else {
    showToast(result.message, 'error');
  }
});

// ============ BOOT ============
buildSelector();
wireLightsPanel();