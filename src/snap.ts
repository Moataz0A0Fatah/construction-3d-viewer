import * as THREE from 'three';

export interface SnapResult {
  point: THREE.Vector3;
  screenDistancePx: number;
  isCorner: boolean;
}

const cornerCache = new WeakMap<THREE.Mesh, THREE.Vector3[]>();
const allVertexCache = new WeakMap<THREE.Mesh, THREE.Vector3[]>();

function makeKeyFn(quant: number) {
  return (x: number, y: number, z: number) =>
    `${Math.round(x / quant)}|${Math.round(y / quant)}|${Math.round(z / quant)}`;
}

function analyzeMesh(mesh: THREE.Mesh): {
  corners: THREE.Vector3[];
  allVerts: THREE.Vector3[];
} {
  const geom = mesh.geometry as THREE.BufferGeometry;
  const posAttr = geom.attributes.position as THREE.BufferAttribute;
  if (!posAttr) return { corners: [], allVerts: [] };

  const bbox = new THREE.Box3().setFromBufferAttribute(posAttr);
  const size = bbox.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
  const quant = maxDim * 1e-5;

  const keyFn = makeKeyFn(quant);

  const uniquePositions = new Map<string, THREE.Vector3>();
  const posNormals = new Map<string, THREE.Vector3[]>();

  const index = geom.index;
  const triCount = index ? index.count / 3 : posAttr.count / 3;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3 + 0) : t * 3 + 0;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

    a.fromBufferAttribute(posAttr, i0);
    b.fromBufferAttribute(posAttr, i1);
    c.fromBufferAttribute(posAttr, i2);

    ab.subVectors(b, a);
    ac.subVectors(c, a);
    n.crossVectors(ab, ac);
    if (n.lengthSq() < 1e-16) continue;
    n.normalize();

    for (const v of [a, b, c]) {
      const k = keyFn(v.x, v.y, v.z);
      if (!uniquePositions.has(k)) uniquePositions.set(k, v.clone());
      let arr = posNormals.get(k);
      if (!arr) {
        arr = [];
        posNormals.set(k, arr);
      }
      let dup = false;
      for (const existing of arr) {
        if (existing.dot(n) > 0.9999) {
          dup = true;
          break;
        }
      }
      if (!dup) arr.push(n.clone());
    }
  }

  const cosThreshold = Math.cos(THREE.MathUtils.degToRad(30));
  const corners: THREE.Vector3[] = [];
  const allVerts: THREE.Vector3[] = [];

  for (const [k, pos] of uniquePositions) {
    allVerts.push(pos.clone());
    const normals = posNormals.get(k)!;
    if (normals.length < 2) continue;

    outer: for (let i = 0; i < normals.length; i++) {
      for (let j = i + 1; j < normals.length; j++) {
        if (normals[i].dot(normals[j]) < cosThreshold) {
          corners.push(pos.clone());
          break outer;
        }
      }
    }
  }

  return { corners, allVerts };
}

export function getCornerVertices(mesh: THREE.Mesh): THREE.Vector3[] {
  const cached = cornerCache.get(mesh);
  if (cached) return cached;
  const { corners, allVerts } = analyzeMesh(mesh);
  cornerCache.set(mesh, corners);
  allVertexCache.set(mesh, allVerts);
  return corners;
}

export function getAllVertices(mesh: THREE.Mesh): THREE.Vector3[] {
  const cached = allVertexCache.get(mesh);
  if (cached) return cached;
  const { corners, allVerts } = analyzeMesh(mesh);
  cornerCache.set(mesh, corners);
  allVertexCache.set(mesh, allVerts);
  return allVerts;
}

export function snapToScreenEndpoint(
  renderer: THREE.WebGLRenderer,
  camera: THREE.Camera,
  mesh: THREE.Mesh,
  clientX: number,
  clientY: number,
  radiusPx: number,
  allowFallbackToAnyVertex: boolean
): SnapResult | null {
  mesh.updateWorldMatrix(true, false);

  const corners = getCornerVertices(mesh);
  const candidates =
    corners.length > 0
      ? corners
      : allowFallbackToAnyVertex
        ? getAllVertices(mesh)
        : [];
  if (candidates.length === 0) return null;

  const rect = renderer.domElement.getBoundingClientRect();
  const world = new THREE.Vector3();
  const proj = new THREE.Vector3();

  let best: THREE.Vector3 | null = null;
  let bestDistSq = radiusPx * radiusPx;
  let bestIsCorner = corners.length > 0;

  for (const local of candidates) {
    world.copy(local).applyMatrix4(mesh.matrixWorld);
    proj.copy(world).project(camera);
    if (proj.z > 1) continue;

    const sx = rect.left + (proj.x + 1) * 0.5 * rect.width;
    const sy = rect.top + (1 - proj.y) * 0.5 * rect.height;

    const dx = sx - clientX;
    const dy = sy - clientY;
    const d2 = dx * dx + dy * dy;

    if (d2 < bestDistSq) {
      bestDistSq = d2;
      best = world.clone();
    }
  }

  if (!best) return null;
  return {
    point: best,
    screenDistancePx: Math.sqrt(bestDistSq),
    isCorner: bestIsCorner
  };
}

export function worldSizeForPixels(
  pixelSize: number,
  distanceFromCamera: number,
  camera: THREE.PerspectiveCamera,
  canvasHeight: number
): number {
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  return (pixelSize * distanceFromCamera * 2 * Math.tan(fovRad / 2)) / canvasHeight;
}