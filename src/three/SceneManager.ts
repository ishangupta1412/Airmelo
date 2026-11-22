import * as THREE from 'three';
import { ProceduralGuitar3D } from './GuitarModel';
import { GuitarKinematics, GuitarTransform } from '../math/Kinematics';

export type GuitarState = 'HOLDING' | 'PLACED_RESTING' | 'PROXIMITY_HOVER';

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public guitar: ProceduralGuitar3D;
  public kinematics: GuitarKinematics;

  // State management
  private currentState: GuitarState = 'HOLDING';
  private targetPosition = new THREE.Vector3();
  private targetQuaternion = new THREE.Quaternion();

  // Persistent Room Anchor (when placed on wall/floor)
  public roomAnchorPosition = new THREE.Vector3(0.6, -0.2, -1.2);
  public roomAnchorQuaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0.2, -0.4, 1.35) // Leaning at a natural angle against the wall
  );

  // Studio Lighting
  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;

  // Shadow Catcher Plane
  private shadowPlane: THREE.Mesh;

  // Transition smoothing
  private transitionAlpha = 1.0;
  private transitionDuration = 0.15; // 150ms smooth Hermite transition

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    
    // Transparent scene background to cleanly composite over the webcam video
    this.scene.background = null;

    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;

    // Field of view matched closely to standard 720p/1080p webcam optics (~55-60 deg)
    this.camera = new THREE.PerspectiveCamera(54, width / height, 0.05, 50);
    this.camera.position.set(0, 0, 1.5);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Initialize 3D Guitar Model
    this.guitar = new ProceduralGuitar3D();
    this.scene.add(this.guitar.group);

    // Initialize Kinematics Solver
    this.kinematics = new GuitarKinematics();

    // Studio Lighting Rig
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(this.ambientLight);

    // Warm Key Light (mimics desk/room lamp)
    this.keyLight = new THREE.DirectionalLight(0xfffaed, 2.2);
    this.keyLight.position.set(1.5, 2.5, 2.0);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.width = 1024;
    this.keyLight.shadow.mapSize.height = 1024;
    this.keyLight.shadow.bias = -0.0005;
    this.scene.add(this.keyLight);

    // Cool Fill Light (balances shadows)
    this.fillLight = new THREE.DirectionalLight(0xe0f2fe, 1.0);
    this.fillLight.position.set(-2.0, 1.0, 1.0);
    this.scene.add(this.fillLight);

    // Rim Light (highlights contours & chrome frets)
    this.rimLight = new THREE.DirectionalLight(0xffffff, 1.5);
    this.rimLight.position.set(0, -1.5, -1.0);
    this.scene.add(this.rimLight);

    // Shadow Catcher (Ground / Wall plane)
    const planeGeo = new THREE.PlaneGeometry(8, 8);
    const planeMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    this.shadowPlane = new THREE.Mesh(planeGeo, planeMat);
    this.shadowPlane.position.set(0, -0.8, -0.5);
    this.shadowPlane.rotation.x = -Math.PI / 2;
    this.shadowPlane.receiveShadow = true;
    this.scene.add(this.shadowPlane);

    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => {
    const canvas = this.renderer.domElement;
    const width = canvas.parentElement?.clientWidth || window.innerWidth;
    const height = canvas.parentElement?.clientHeight || window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public getState(): GuitarState {
    return this.currentState;
  }

  public setState(newState: GuitarState): void {
    if (this.currentState !== newState) {
      this.currentState = newState;
      this.transitionAlpha = 0.0; // Trigger smooth Hermite blend
    }
  }

  /**
   * Sets the 3D room coordinates where the guitar is placed against a wall
   */
  public setRoomAnchor(pos: THREE.Vector3, quat: THREE.Quaternion): void {
    this.roomAnchorPosition.copy(pos);
    this.roomAnchorQuaternion.copy(quat);
  }

  /**
   * Update called every frame
   */
  public update(deltaTime: number, playerTransform?: GuitarTransform | null): void {
    // 1. Update Guitar String Oscillation
    this.guitar.update(deltaTime);

    // 2. Handle State Transitions
    if (this.currentState === 'HOLDING' && playerTransform) {
      this.targetPosition.copy(playerTransform.position);
      this.targetQuaternion.copy(playerTransform.quaternion);
      this.guitar.group.scale.setScalar(playerTransform.scale);
    } else if (this.currentState === 'PLACED_RESTING' || this.currentState === 'PROXIMITY_HOVER') {
      this.targetPosition.copy(this.roomAnchorPosition);
      this.targetQuaternion.copy(this.roomAnchorQuaternion);
      this.guitar.group.scale.setScalar(1.0);
    }

    // 3. Smooth Hermite interpolation to target pose
    if (this.transitionAlpha < 1.0) {
      this.transitionAlpha = Math.min(1.0, this.transitionAlpha + deltaTime / this.transitionDuration);
      // Smoothstep curve: 3x^2 - 2x^3
      const t = this.transitionAlpha * this.transitionAlpha * (3 - 2 * this.transitionAlpha);
      this.guitar.group.position.lerp(this.targetPosition, t);
      this.guitar.group.quaternion.slerp(this.targetQuaternion, t);
    } else {
      // Direct smooth follow
      const followSpeed = this.currentState === 'HOLDING' ? 0.35 : 0.15;
      this.guitar.group.position.lerp(this.targetPosition, followSpeed);
      this.guitar.group.quaternion.slerp(this.targetQuaternion, followSpeed);
    }

    // 4. Render
    this.renderer.render(this.scene, this.camera);
  }

  public destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
