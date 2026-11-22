import * as THREE from 'three';
import { Vector3D } from './OneEuroFilter';

export interface PoseLandmarks {
  leftShoulder: Vector3D;
  rightShoulder: Vector3D;
  leftElbow?: Vector3D;
  rightElbow?: Vector3D;
  leftWrist: Vector3D;
  rightWrist: Vector3D;
  leftHip?: Vector3D;
  rightHip?: Vector3D;
}

export interface GuitarTransform {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  fretSlide: number; // 0.0 (nut) to 1.0 (body/bridge)
  scale: number;
}

export class GuitarKinematics {
  // Constant scale of standard dreadnought guitar (in virtual meters)
  public static readonly GUITAR_LENGTH = 1.0; 
  public static readonly SCALE_LENGTH = 0.65; // 650mm standard scale length

  private currentQuaternion = new THREE.Quaternion();
  private currentPosition = new THREE.Vector3();
  private targetQuaternion = new THREE.Quaternion();
  private targetPosition = new THREE.Vector3();

  // Smoothing parameter for Hermite / Slerp blend
  private slerpFactor = 0.25;

  /**
   * Computes the 3D position and orientation of the guitar
   * based on the player's torso anchor and left hand fretboard position.
   */
  computeTransform(
    pose: PoseLandmarks,
    deltaTime: number = 0.016
  ): GuitarTransform {
    // 1. Calculate Torso Anchor Point:
    // Right chest / sternum area where guitar body rests against player
    const rightShoulder = new THREE.Vector3(pose.rightShoulder.x, pose.rightShoulder.y, pose.rightShoulder.z);
    const leftShoulder = new THREE.Vector3(pose.leftShoulder.x, pose.leftShoulder.y, pose.leftShoulder.z);
    const leftWrist = new THREE.Vector3(pose.leftWrist.x, pose.leftWrist.y, pose.leftWrist.z);

    // Mid-chest point
    const chestCenter = new THREE.Vector3()
      .addVectors(leftShoulder, rightShoulder)
      .multiplyScalar(0.5);

    // Shoulder width provides biometric scale normalization
    const shoulderWidth = leftShoulder.distanceTo(rightShoulder);
    const normalizedScale = Math.max(0.6, Math.min(1.4, shoulderWidth * 2.2));

    // Body rest pivot: slightly below sternum and shifted towards right hip
    this.targetPosition.copy(chestCenter);
    this.targetPosition.y -= 0.18 * normalizedScale; // lower on torso
    this.targetPosition.x += 0.06 * normalizedScale; // slightly right of center
    this.targetPosition.z -= 0.05; // slightly forward

    // 2. Compute Neck Direction Vector:
    // Vector pointing from guitar body pivot toward the left wrist
    const neckDirection = new THREE.Vector3().subVectors(leftWrist, this.targetPosition).normalize();

    // Natural playing angle constraints:
    // Guitars are played at an upward neck angle of 15 to 45 degrees
    neckDirection.y = Math.max(0.1, Math.min(0.65, neckDirection.y));
    neckDirection.normalize();

    // 3. Compute Orientation via Quaternion:
    // Default guitar points along +X axis in local coordinates
    const defaultAxis = new THREE.Vector3(1, 0, 0);
    this.targetQuaternion.setFromUnitVectors(defaultAxis, neckDirection);

    // Add natural body tilt (guitar face slightly tilted upward toward player's eyes)
    const tiltQuaternion = new THREE.Quaternion().setFromAxisAngle(
      neckDirection,
      -0.25 // ~15 degree upward face tilt
    );
    this.targetQuaternion.premultiply(tiltQuaternion);

    // 4. Smooth Slerp and Position Lerp (eliminates any micro-jitter):
    const dynamicLerp = Math.min(1.0, this.slerpFactor * (deltaTime / 0.016));
    this.currentPosition.lerp(this.targetPosition, dynamicLerp);
    this.currentQuaternion.slerp(this.targetQuaternion, dynamicLerp);

    // 5. Calculate Left Hand Fret Position along the Neck (0.0 = Headstock, 1.0 = Body)
    const guitarToLeftWrist = new THREE.Vector3().subVectors(leftWrist, this.currentPosition);
    const projectedDistance = guitarToLeftWrist.dot(neckDirection);
    const fretSlide = Math.max(0.0, Math.min(1.0, 1.0 - (projectedDistance / GuitarKinematics.SCALE_LENGTH)));

    return {
      position: this.currentPosition.clone(),
      quaternion: this.currentQuaternion.clone(),
      fretSlide,
      scale: normalizedScale,
    };
  }

  /**
   * Resets position and orientation to avoid jumps upon re-tracking
   */
  reset(pos?: THREE.Vector3, quat?: THREE.Quaternion): void {
    if (pos) this.currentPosition.copy(pos);
    if (quat) this.currentQuaternion.copy(quat);
  }
}
