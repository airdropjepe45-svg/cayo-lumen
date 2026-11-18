// Rendering setup for Cayo Lumen: the WebGL renderer, the golden-hour lights,
// the camera, and the smoothed third-person chase rig the player and the cars use.
import * as THREE from 'three';
import { CONFIG } from './config.js';

/** WebGL renderer: antialiased, soft shadows, filmic sunset tones. */
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

/**
 * Golden-hour lighting: a warm low sun from the west (-x) with shadows, plus a
 * peach sky / mauve ground hemisphere fill. Returns { sun, hemi }.
 * At most four small point lights exist (the hero street lamps in world.js),
 * so the sun + hemisphere carry the whole scene.
 */
export function createLights(scene) {
  const C = CONFIG.colors;
  const sun = new THREE.DirectionalLight(C.sun, 2.2);
  sun.position.set(-320, 130, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -400;
  sun.shadow.camera.right = 400;
  sun.shadow.camera.top = 400;
  sun.shadow.camera.bottom = -400;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(C.hemiSky, C.hemiGround, 0.85);
  scene.add(hemi);
  return { sun, hemi };
}

/** The one camera: 70° fov, near/far sized for a 900 m city and a 1400 m sky. */
export function createCamera() {
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 3200);
  camera.position.set(0, 8, 14);
  return camera;
}

/**
 * Keep the renderer and camera matched to the window. Call on resize.
 */
export function resizeRenderer(renderer, camera) {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

/**
 * A barely-there drift of the sun, so the golden hour never looks frozen:
 * the sun sinks a few degrees over a long session and the light warms with it.
 */
export function updateSunRig(lights, t) {
  const sink = Math.min(t / 900, 1) * 0.22;
  lights.sun.position.y = 130 - sink * 60;
  lights.sun.intensity = 2.2 - sink * 0.5;
}

/**
 * Smoothed third-person camera. `targetPos` is what we follow, `yaw`/`pitch`
 * the orbit angles, `dist` how far back, `dt` the frame step. The camera
 * eases toward its ideal spot instead of snapping, and always looks slightly
 * ahead of the target so driving feels fast.
 */
export function followCamera(camera, targetPos, yaw, pitch, dist, dt) {
  const ideal = new THREE.Vector3(
    targetPos.x - Math.sin(yaw) * Math.cos(pitch) * dist,
    targetPos.y + Math.sin(pitch) * dist + 1.6,
    targetPos.z - Math.cos(yaw) * Math.cos(pitch) * dist,
  );
  const k = 1 - Math.exp(-dt * 7);
  camera.position.lerp(ideal, k);
  const look = new THREE.Vector3(
    targetPos.x + Math.sin(yaw) * 2.2,
    targetPos.y + 1.4,
    targetPos.z + Math.cos(yaw) * 2.2,
  );
  camera.lookAt(look);
}
