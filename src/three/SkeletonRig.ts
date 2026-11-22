import * as THREE from 'three';
import { Vector3D } from '../math/OneEuroFilter';

export interface FullBodySkeletonData {
  poseLandmarks: Vector3D[] | null;      // 33 3D Pose landmarks
  leftHandLandmarks: Vector3D[] | null;  // 21 3D Left Hand landmarks
  rightHandLandmarks: Vector3D[] | null; // 21 3D Right Hand landmarks
}

// Landmark connectivity definitions
const POSE_CONNECTIONS: [number, number][] = [
  // Torso & Spine
  [11, 12], // Left shoulder to Right shoulder
  [11, 23], // Left shoulder to Left hip
  [12, 24], // Right shoulder to Right hip
  [23, 24], // Left hip to Right hip

  // Left Arm
  [11, 13], // Shoulder to Elbow
  [13, 15], // Elbow to Wrist

  // Right Arm
  [12, 14], // Shoulder to Elbow
  [14, 16], // Elbow to Wrist

  // Legs
  [23, 25], // Left hip to Knee
  [25, 27], // Left knee to Ankle
  [24, 26], // Right hip to Knee
  [26, 28], // Right knee to Ankle
];

const HAND_CONNECTIONS: [number, number][] = [
  // Wrist to base of fingers
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [0, 13], [13, 14], [14, 15], [15, 16],// Ring
  [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
  // Palm knuckle arch
  [5, 9], [9, 13], [13, 17],
];

export class SkeletonRig {
  public group: THREE.Group = new THREE.Group();

  // Joint spheres
  private poseJointMeshes: THREE.Mesh[] = [];
  private leftHandJointMeshes: THREE.Mesh[] = [];
  private rightHandJointMeshes: THREE.Mesh[] = [];

  // Bone lines
  private poseBoneLines: THREE.Line[] = [];
  private leftHandBoneLines: THREE.Line[] = [];
  private rightHandBoneLines: THREE.Line[] = [];

  // Materials
  private poseJointMaterial = new THREE.MeshBasicMaterial({ color: 0x06b6d4 }); // Cyan
  private handJointMaterial = new THREE.MeshBasicMaterial({ color: 0xf59e0b }); // Amber
  private fingertipMaterial = new THREE.MeshBasicMaterial({ color: 0x10b981 }); // Emerald
  private boneMaterial = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65, linewidth: 2 });
  private handBoneMaterial = new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.7, linewidth: 2 });

  public visible: boolean = true;

  constructor() {
    this.initPoseRig();
    this.initHandRigs();
  }

  private initPoseRig(): void {
    const jointGeo = new THREE.SphereGeometry(0.014, 12, 12);

    // 33 Pose joints
    for (let i = 0; i < 33; i++) {
      const mesh = new THREE.Mesh(jointGeo, this.poseJointMaterial);
      mesh.visible = false;
      this.group.add(mesh);
      this.poseJointMeshes.push(mesh);
    }

    // Pose bone lines
    for (let i = 0; i < POSE_CONNECTIONS.length; i++) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]);
      const line = new THREE.Line(lineGeo, this.boneMaterial);
      line.visible = false;
      this.group.add(line);
      this.poseBoneLines.push(line);
    }
  }

  private initHandRigs(): void {
    const handJointGeo = new THREE.SphereGeometry(0.007, 10, 10);
    const fingertipGeo = new THREE.SphereGeometry(0.010, 12, 12);

    // 21 Left hand joints + 21 Right hand joints
    const createHandJoints = (targetArray: THREE.Mesh[]) => {
      for (let i = 0; i < 21; i++) {
        const isTip = [4, 8, 12, 16, 20].includes(i);
        const mesh = new THREE.Mesh(
          isTip ? fingertipGeo : handJointGeo,
          isTip ? this.fingertipMaterial : this.handJointMaterial
        );
        mesh.visible = false;
        this.group.add(mesh);
        targetArray.push(mesh);
      }
    };

    createHandJoints(this.leftHandJointMeshes);
    createHandJoints(this.rightHandJointMeshes);

    // Hand bone lines
    const createHandBones = (targetArray: THREE.Line[]) => {
      for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(),
          new THREE.Vector3(),
        ]);
        const line = new THREE.Line(lineGeo, this.handBoneMaterial);
        line.visible = false;
        this.group.add(line);
        targetArray.push(line);
      }
    };

    createHandBones(this.leftHandBoneLines);
    createHandBones(this.rightHandBoneLines);
  }

  public update(data: FullBodySkeletonData): void {
    if (!this.visible) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    // 1. Update Pose Skeleton
    if (data.poseLandmarks && data.poseLandmarks.length >= 33) {
      for (let i = 0; i < 33; i++) {
        const lm = data.poseLandmarks[i];
        const mesh = this.poseJointMeshes[i];
        if (lm) {
          mesh.position.set(lm.x, lm.y, lm.z);
          mesh.visible = true;
        } else {
          mesh.visible = false;
        }
      }

      // Update Pose Bone Lines
      for (let i = 0; i < POSE_CONNECTIONS.length; i++) {
        const [idxA, idxB] = POSE_CONNECTIONS[i];
        const a = data.poseLandmarks[idxA];
        const b = data.poseLandmarks[idxB];
        const line = this.poseBoneLines[i];

        if (a && b) {
          const positions = line.geometry.getAttribute('position') as THREE.BufferAttribute;
          positions.setXYZ(0, a.x, a.y, a.z);
          positions.setXYZ(1, b.x, b.y, b.z);
          positions.needsUpdate = true;
          line.visible = true;
        } else {
          line.visible = false;
        }
      }
    } else {
      this.poseJointMeshes.forEach(m => m.visible = false);
      this.poseBoneLines.forEach(l => l.visible = false);
    }

    // 2. Update Left Hand Skeleton
    this.updateHandSkeleton(data.leftHandLandmarks, this.leftHandJointMeshes, this.leftHandBoneLines);

    // 3. Update Right Hand Skeleton
    this.updateHandSkeleton(data.rightHandLandmarks, this.rightHandJointMeshes, this.rightHandBoneLines);
  }

  private updateHandSkeleton(
    landmarks: Vector3D[] | null,
    jointMeshes: THREE.Mesh[],
    boneLines: THREE.Line[]
  ): void {
    if (landmarks && landmarks.length >= 21) {
      for (let i = 0; i < 21; i++) {
        const lm = landmarks[i];
        const mesh = jointMeshes[i];
        mesh.position.set(lm.x, lm.y, lm.z);
        mesh.visible = true;
      }

      for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
        const [idxA, idxB] = HAND_CONNECTIONS[i];
        const a = landmarks[idxA];
        const b = landmarks[idxB];
        const line = boneLines[i];

        const positions = line.geometry.getAttribute('position') as THREE.BufferAttribute;
        positions.setXYZ(0, a.x, a.y, a.z);
        positions.setXYZ(1, b.x, b.y, b.z);
        positions.needsUpdate = true;
        line.visible = true;
      }
    } else {
      jointMeshes.forEach(m => m.visible = false);
      boneLines.forEach(l => l.visible = false);
    }
  }

  public setVisibility(visible: boolean): void {
    this.visible = visible;
    this.group.visible = visible;
  }
}
