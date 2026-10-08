import * as THREE from 'three';

export interface ExtraLight {
  id: number;
  color: string;
  intensity: number;
  position: THREE.Vector3;
}

export class LightingController {
  public ambient: THREE.AmbientLight;
  public main: THREE.DirectionalLight;
  public fill: THREE.DirectionalLight;
  public extras: { light: THREE.DirectionalLight; id: number }[] = [];

  private scene: THREE.Scene;
  private nextId = 1;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // ---------- AMBIENT ----------
    this.ambient = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(this.ambient);

    // ---------- MAIN (directional, casts shadows) ----------
    this.main = new THREE.DirectionalLight(0xffffff, 1.1);
    this.main.position.set(20, 30, 10);
    this.main.castShadow = true;
    this.main.shadow.mapSize.set(2048, 2048);
    this.main.shadow.camera.near = 1;
    this.main.shadow.camera.far = 500;
    this.main.shadow.camera.left = -100;
    this.main.shadow.camera.right = 100;
    this.main.shadow.camera.top = 100;
    this.main.shadow.camera.bottom = -100;
    scene.add(this.main);
    scene.add(this.main.target);

    // ---------- FILL (soft, no shadows) ----------
    this.fill = new THREE.DirectionalLight(0xffffff, 0.4);
    this.fill.position.set(-15, 10, -15);
    scene.add(this.fill);
  }

  // ============ PRESETS ============
  setAmbientIntensity(v: number) {
    this.ambient.intensity = v;
  }

  setMainIntensity(v: number) {
    this.main.intensity = v;
  }

  setFillIntensity(v: number) {
    this.fill.intensity = v;
  }

  setBackground(color: string) {
    if (this.scene.background instanceof THREE.Color) {
      (this.scene.background as THREE.Color).set(color);
    } else {
      this.scene.background = new THREE.Color(color);
    }
  }

  setMainDirection(which: string) {
    const distance = 40;
    switch (which) {
      case 'top':
        this.main.position.set(0, distance, 0);
        break;
      case 'front':
        this.main.position.set(0, 20, distance);
        break;
      case 'right':
        this.main.position.set(distance, 20, 0);
        break;
      case 'left':
        this.main.position.set(-distance, 20, 0);
        break;
      case 'back':
        this.main.position.set(0, 20, -distance);
        break;
      case 'reset':
        this.main.position.set(20, 30, 10);
        break;
    }
    this.main.target.position.set(0, 0, 0);
    this.main.target.updateMatrixWorld();
  }

  setShadowsEnabled(enabled: boolean) {
    this.main.castShadow = enabled;
  }

  // ============ EXTRA LIGHTS ============
  addExtraLight(): number {
    const id = this.nextId++;
    const light = new THREE.DirectionalLight(0xffffff, 0.6);
    // Place extra lights around the origin
    const angle = (this.extras.length * 90 * Math.PI) / 180;
    light.position.set(
      Math.cos(angle) * 30,
      25,
      Math.sin(angle) * 30
    );
    light.castShadow = false;
    this.scene.add(light);
    this.scene.add(light.target);
    this.extras.push({ light, id });
    return id;
  }

  removeExtraLight(id: number) {
    const idx = this.extras.findIndex((e) => e.id === id);
    if (idx === -1) return;
    const { light } = this.extras[idx];
    this.scene.remove(light);
    this.scene.remove(light.target);
    this.extras.splice(idx, 1);
  }

  setExtraIntensity(id: number, value: number) {
    const found = this.extras.find((e) => e.id === id);
    if (found) found.light.intensity = value;
  }

  setExtraColor(id: number, color: string) {
    const found = this.extras.find((e) => e.id === id);
    if (found) found.light.color.set(color);
  }

  // ============ RESET ============
  resetAll() {
    this.ambient.intensity = 0.9;
    this.main.intensity = 1.1;
    this.main.position.set(20, 30, 10);
    this.main.target.position.set(0, 0, 0);
    this.main.castShadow = true;
    this.fill.intensity = 0.4;

    // Remove all extras
    for (const { light } of this.extras) {
      this.scene.remove(light);
      this.scene.remove(light.target);
    }
    this.extras = [];
  }
}