import * as THREE from 'three';
import { ProceduralGuitar3D } from './GuitarModel';
import { GuitarKinematics, GuitarTransform } from '../math/Kinematics';
import { SkeletonRig, FullBodySkeletonData } from './SkeletonRig';
import { PhysicalStringColliders, StringCollisionEvent } from './PhysicalColliders';
import { Vector3D } from '../math/OneEuroFilter';

export type GuitarState = 'HOLDING' | 'PLACED_RESTING' | 'PROXIMITY_HOVER';

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public guitar: ProceduralGuitar3D;
  public kinematics: GuitarKinematics;
  public skeletonRig: SkeletonRig;
  public colliders: PhysicalStringColliders;

  // State management
  private currentState: GuitarState = 'HOLDING';
  private targetPosition = new THREE.Vector3();
  private targetQuaternion = new THREE.Quaternion();

  // Persistent Room Anchor (when placed on wall/floor)
  public roomAnchorPosition = new THREE.Vector3(0.65, -0.2, -1.2);
  public roomAnchorQuaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0.2, -0.4, 1.35)
  );

  // Studio Lighting
  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;

  // Shadow Catcher Plane & Room Spatial Grid
  private shadowPlane: THREE.Mesh;
  private roomGrid: THREE.GridHelper;

  // Transition smoothing
  private transitionAlpha = 1.0;
  private transitionDuration = 0.15;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = null;

    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(54, width / height, 0.05, 50);
    this.camera.position.set(0, 0, 1.6);

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

    // 1. Initialize 3D Guitar Model
    this.guitar = new ProceduralGuitar3D();
    this.scene.add(this.guitar.group);

    // 2. Initialize Biomechanical MoCap Skeleton Rig (75 joints)
    this.skeletonRig = new SkeletonRig();
    this.scene.add(this.skeletonRig.group);

    // 3. Initialize Physical Colliders
    this.colliders = new PhysicalStringColliders();

    // 4. Kinematics
    this.kinematics = new GuitarKinematics();

    // 5. Lighting
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(this.ambientLight);

    this.keyLight = new THREE.DirectionalLight(0xfffaed, 2.4);
    this.keyLight.position.set(1.5, 2.5, 2.0);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.width = 1024;
    this.keyLight.shadow.mapSize.height = 1024;
    this.keyLight.shadow.bias = -0.0005;
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.DirectionalLight(0xe0f2fe, 1.1);
    this.fillLight.position.set(-2.0, 1.0, 1.0);
    this.scene.add(this.fillLight);

    this.rimLight = new THREE.DirectionalLight(0xffffff, 1.6);
    this.rimLight.position.set(0, -1.5, -1.0);
    this.scene.add(this.rimLight);

    // 6. Shadow Plane & Spatial Room Floor Grid
    const planeGeo = new THREE.PlaneGeometry(10, 10);
    const planeMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    this.shadowPlane = new THREE.Mesh(planeGeo, planeMat);
    this.shadowPlane.position.set(0, -0.85, -0.5);
    this.shadowPlane.rotation.x = -Math.PI / 2;
    this.shadowPlane.receiveShadow = true;
    this.scene.add(this.shadowPlane);

    // Laser Room Spatial Grid (Visualizes room tracking)
    this.roomGrid = new THREE.GridHelper(6, 24, 0x06b6d4, 0x1e293b);
    this.roomGrid.position.set(0, -0.84, -0.5);
    this.roomGrid.material.transparent = true;
    this.roomGrid.material.opacity = 0.25;
    this.scene.add(this.roomGrid);

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
      this.transitionAlpha = 0.0;
    }
  }

  public setFloorLevel(floorY: number): void {
    this.shadowPlane.position.y = floorY;
    this.roomGrid.position.y = floorY + 0.001;
  }

  /**
   * Updates per frame: updates skeleton rig, checks physical string collisions, animates guitar
   */
  public update(
    deltaTime: number,
    skeletonData: FullBodySkeletonData,
    playerTransform?: GuitarTransform | null,
    rightHandLandmarks?: Vector3D[] | null
  ): StringCollisionEvent[] {
    // 1. Update Full-Body MoCap Skeleton
    this.skeletonRig.update(skeletonData);

    // 2. Update Guitar String Oscillation
    this.guitar.update(deltaTime);

    // 3. State-based positioning
    if (this.currentState === 'HOLDING' && playerTransform) {
      this.targetPosition.copy(playerTransform.position);
      this.targetQuaternion.copy(playerTransform.quaternion);
      this.guitar.group.scale.setScalar(playerTransform.scale);
    } else {
      this.targetPosition.copy(this.roomAnchorPosition);
      this.targetQuaternion.copy(this.roomAnchorQuaternion);
      this.guitar.group.scale.setScalar(1.0);
    }

    // 4. Smooth Hermite interpolation
    if (this.transitionAlpha < 1.0) {
      this.transitionAlpha = Math.min(1.0, this.transitionAlpha + deltaTime / this.transitionDuration);
      const t = this.transitionAlpha * this.transitionAlpha * (3 - 2 * this.transitionAlpha);
      this.guitar.group.position.lerp(this.targetPosition, t);
      this.guitar.group.quaternion.slerp(this.targetQuaternion, t);
    } else {
      const followSpeed = this.currentState === 'HOLDING' ? 0.38 : 0.15;
      this.guitar.group.position.lerp(this.targetPosition, followSpeed);
      this.guitar.group.quaternion.slerp(this.targetQuaternion, followSpeed);
    }

    // 5. Test Physical Fingertip Collisions against 3D Strings
    this.guitar.group.updateMatrixWorld(true);
    this.colliders.updateStringWorldPositions(this.guitar);
    const collisions = this.colliders.testCollisions(rightHandLandmarks ?? null);

    // Trigger visual deflection on struck strings
    for (const hit of collisions) {
      this.guitar.vibrateString(hit.stringIndex, hit.velocity);
    }

    // 6. Render
    this.renderer.render(this.scene, this.camera);

    return collisions;
  }

  public toggleSkeleton(visible: boolean): void {
    this.skeletonRig.setVisibility(visible);
  }

  public destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
