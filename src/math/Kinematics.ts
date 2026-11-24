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
  public static readonly SCALE_LENGTH = 0.65; // 650mm standard scale length
  public static readonly TOTAL_LENGTH = 1.02; // 1020mm overall length

  private currentQuaternion = new THREE.Quaternion();
  private currentPosition = new THREE.Vector3();
  private targetQuaternion = new THREE.Quaternion();
  private targetPosition = new THREE.Vector3();

  // Smoothing parameter for Hermite / Slerp blend
  private slerpFactor = 0.32;

  /**
   * Dual-Anchor Kinematic Solver:
   * Rigorously locks the guitar between the Left Hand (Neck Grip)
   * and the Right Forearm/Torso (Body Rest Pivot).
   */
  computeTransform(
    pose: PoseLandmarks,
    deltaTime: number = 0.016
  ): GuitarTransform {
    const rightShoulder = new THREE.Vector3(pose.rightShoulder.x, pose.rightShoulder.y, pose.rightShoulder.z);
    const leftShoulder = new THREE.Vector3(pose.leftShoulder.x, pose.leftShoulder.y, pose.leftShoulder.z);
    const leftWrist = new THREE.Vector3(pose.leftWrist.x, pose.leftWrist.y, pose.leftWrist.z);

    // 1. Biometric scale normalization based on shoulder span
    const shoulderWidth = Math.max(0.25, Math.min(0.65, leftShoulder.distanceTo(rightShoulder)));
    const normalizedScale = Math.max(0.75, Math.min(1.25, shoulderWidth * 2.4));

    // 2. Body Anchor (Right Ribcage / Forearm Rest):
    // Guitar body rests against player's right ribcage, slightly below shoulder
    const bodyPivot = new THREE.Vector3()
      .copy(rightShoulder)
      .addScaledVector(new THREE.Vector3(0, -1, 0), 0.28 * normalizedScale)
      .addScaledVector(new THREE.Vector3(0.08, 0, 0), normalizedScale);
    bodyPivot.z += 0.08; // Slightly forward of chest plane

    // 3. Neck Grip Vector:
    // Direction vector from Body Pivot pointing directly towards Left Wrist
    const neckVector = new THREE.Vector3().subVectors(leftWrist, bodyPivot);
    const reachDistance = neckVector.length();

    // Prevent extreme inversion or unnatural backward bending
    neckVector.normalize();
    neckVector.y = Math.max(-0.2, Math.min(0.75, neckVector.y)); // Natural neck elevation angle
    neckVector.normalize();

    // 4. Position: Guitar body origin is centered near the soundhole
    // The soundhole sits between the body pivot and the left hand
    this.targetPosition.copy(bodyPivot).addScaledVector(neckVector, 0.12 * normalizedScale);

    // 5. Orientation (Quaternion Slerp):
    // Standard model points along +X axis
    const defaultForward = new THREE.Vector3(1, 0, 0);
    this.targetQuaternion.setFromUnitVectors(defaultForward, neckVector);

    // Natural Playing Pitch: Guitar soundboard tilted ~18 degrees towards player's eyes
    const playerTilt = new THREE.Quaternion().setFromAxisAngle(neckVector, -0.28);
    this.targetQuaternion.premultiply(playerTilt);

    // 6. Smooth Hermite/Slerp Blend (eliminates jitter and sudden flips)
    const lerpSpeed = Math.min(1.0, this.slerpFactor * (deltaTime / 0.016));
    this.currentPosition.lerp(this.targetPosition, lerpSpeed);
    this.currentQuaternion.slerp(this.targetQuaternion, lerpSpeed);

    // 7. Left Hand Fretboard Slide (Normalized 0.0 Nut to 1.0 Bridge)
    const fretSlide = Math.max(0.0, Math.min(1.0, (reachDistance - 0.25) / (GuitarKinematics.SCALE_LENGTH * normalizedScale)));

    return {
      position: this.currentPosition.clone(),
      quaternion: this.currentQuaternion.clone(),
      fretSlide,
      scale: normalizedScale,
    };
  }

  public reset(pos?: THREE.Vector3, quat?: THREE.Quaternion): void {
    if (pos) this.currentPosition.copy(pos);
    if (quat) this.currentQuaternion.copy(quat);
  }
}
