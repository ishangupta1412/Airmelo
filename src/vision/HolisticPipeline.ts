import { Holistic, Results as HolisticResults } from '@mediapipe/holistic';
import { Camera } from '@mediapipe/camera_utils';
import { OneEuroFilter3D, Vector3D } from '../math/OneEuroFilter';
import { PoseLandmarks } from '../math/Kinematics';

export interface BiomechanicalTelemetry {
  leftElbowAngleDeg: number;
  rightElbowAngleDeg: number;
  leftShoulderAngleDeg: number;
  spineTiltDeg: number;
  jointsTrackedCount: number;
  estimatedFloorLevelY: number;
}

export interface HolisticFrameData {
  poseLandmarks: Vector3D[] | null;
  leftHandLandmarks: Vector3D[] | null;
  rightHandLandmarks: Vector3D[] | null;
  kinematicsPose: PoseLandmarks | null;
  activeChord: string;
  telemetry: BiomechanicalTelemetry;
  fps: number;
  placeGestureDetected: boolean;
  grabGestureDetected: boolean;
}

export class HolisticPipeline {
  private videoElement: HTMLVideoElement;
  private holistic: Holistic;
  private camera: Camera | null = null;

  // Jitter filters for all 33 pose joints + 42 hand joints (75 total!)
  private poseFilters: OneEuroFilter3D[] = [];
  private leftHandFilters: OneEuroFilter3D[] = [];
  private rightHandFilters: OneEuroFilter3D[] = [];

  // Performance telemetry
  private frameCount = 0;
  private lastFpsTime = performance.now();
  private currentFps = 60;

  private onFrameCallback: ((data: HolisticFrameData) => void) | null = null;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;

    // Initialize 75 filters
    for (let i = 0; i < 33; i++) this.poseFilters.push(new OneEuroFilter3D({ minCutoff: 0.8, beta: 0.007 }));
    for (let i = 0; i < 21; i++) this.leftHandFilters.push(new OneEuroFilter3D({ minCutoff: 0.8, beta: 0.007 }));
    for (let i = 0; i < 21; i++) this.rightHandFilters.push(new OneEuroFilter3D({ minCutoff: 0.8, beta: 0.007 }));

    this.holistic = new Holistic({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
    });

    this.holistic.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
      refineFaceLandmarks: false, // Keep FPS high
    });

    this.holistic.onResults(this.handleHolisticResults);
  }

  public async start(onFrame: (data: HolisticFrameData) => void): Promise<void> {
    this.onFrameCallback = onFrame;

    this.camera = new Camera(this.videoElement, {
      onFrame: async () => {
        const now = performance.now();
        this.frameCount++;
        if (now - this.lastFpsTime >= 1000) {
          this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
          this.frameCount = 0;
          this.lastFpsTime = now;
        }

        await this.holistic.send({ image: this.videoElement });
      },
      width: 1280,
      height: 720,
    });

    await this.camera.start();
  }

  private handleHolisticResults = (results: HolisticResults): void => {
    if (!this.onFrameCallback) return;

    const now = performance.now() / 1000;
    let jointsCount = 0;

    // 1. Process 33 Pose Landmarks
    let filteredPose: Vector3D[] | null = null;
    let kinematicsPose: PoseLandmarks | null = null;
    let floorY = -0.8;

    if (results.poseLandmarks) {
      filteredPose = results.poseLandmarks.map((lm, i) => {
        jointsCount++;
        // Mirrored coordinate space: X mirrored, Y inverted for Three.js
        const raw = {
          x: (1 - lm.x) * 2 - 1,
          y: -(lm.y * 2 - 1),
          z: -lm.z * 1.5,
        };
        return this.poseFilters[i].filter(raw, now);
      });

      // Kinematics pose for guitar anchoring
      kinematicsPose = {
        leftShoulder: filteredPose[11],
        rightShoulder: filteredPose[12],
        leftWrist: filteredPose[15],
        rightWrist: filteredPose[16],
      };

      // Floor estimation from ankles (landmarks 27 & 28)
      if (filteredPose[27] && filteredPose[28]) {
        floorY = Math.min(filteredPose[27].y, filteredPose[28].y) - 0.05;
      }
    }

    // 2. Process Left Hand Landmarks (21 joints)
    // Note: Due to camera mirroring, Holistic's rightHandLandmarks is user's left hand
    let filteredLeftHand: Vector3D[] | null = null;
    if (results.rightHandLandmarks) {
      filteredLeftHand = results.rightHandLandmarks.map((lm, i) => {
        jointsCount++;
        const raw = {
          x: (1 - lm.x) * 2 - 1,
          y: -(lm.y * 2 - 1),
          z: -lm.z * 1.5,
        };
        return this.leftHandFilters[i].filter(raw, now);
      });
    }

    // 3. Process Right Hand Landmarks (21 joints)
    let filteredRightHand: Vector3D[] | null = null;
    if (results.leftHandLandmarks) {
      filteredRightHand = results.leftHandLandmarks.map((lm, i) => {
        jointsCount++;
        const raw = {
          x: (1 - lm.x) * 2 - 1,
          y: -(lm.y * 2 - 1),
          z: -lm.z * 1.5,
        };
        return this.rightHandFilters[i].filter(raw, now);
      });
    }

    // 4. Compute Biomechanical Joint Angles
    const telemetry = this.computeBiomechanicalTelemetry(filteredPose, jointsCount, floorY);

    // 5. Chord Recognition from Left Hand
    const activeChord = this.classifyChord(filteredLeftHand);

    // 6. Spatial Placement Gestures
    const placeGesture = this.detectPlaceGesture(filteredLeftHand, filteredRightHand);
    const grabGesture = this.detectGrabGesture(filteredRightHand || filteredLeftHand);

    this.onFrameCallback({
      poseLandmarks: filteredPose,
      leftHandLandmarks: filteredLeftHand,
      rightHandLandmarks: filteredRightHand,
      kinematicsPose,
      activeChord,
      telemetry,
      fps: this.currentFps,
      placeGestureDetected: placeGesture,
      grabGestureDetected: grabGesture,
    });
  };

  private computeBiomechanicalTelemetry(
    pose: Vector3D[] | null,
    jointsCount: number,
    floorY: number
  ): BiomechanicalTelemetry {
    if (!pose || pose.length < 33) {
      return {
        leftElbowAngleDeg: 90,
        rightElbowAngleDeg: 90,
        leftShoulderAngleDeg: 45,
        spineTiltDeg: 0,
        jointsTrackedCount: jointsCount,
        estimatedFloorLevelY: floorY,
      };
    }

    // Helper to calculate 3D angle between vector BA and BC
    const angleBetween = (a: Vector3D, b: Vector3D, c: Vector3D): number => {
      const v1 = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
      const v2 = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
      const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
      const mag1 = Math.hypot(v1.x, v1.y, v1.z);
      const mag2 = Math.hypot(v2.x, v2.y, v2.z);
      if (mag1 === 0 || mag2 === 0) return 0;
      const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
      return Math.round((Math.acos(cosTheta) * 180) / Math.PI);
    };

    // Left Elbow: Shoulder(11) -> Elbow(13) -> Wrist(15)
    const leftElbow = angleBetween(pose[11], pose[13], pose[15]);
    // Right Elbow: Shoulder(12) -> Elbow(14) -> Wrist(16)
    const rightElbow = angleBetween(pose[12], pose[14], pose[16]);
    // Left Shoulder: Hip(23) -> Shoulder(11) -> Elbow(13)
    const leftShoulder = angleBetween(pose[23], pose[11], pose[13]);

    // Spine tilt: Angle of shoulder-center to hip-center relative to vertical
    const spineDx = (pose[11].x + pose[12].x) / 2 - (pose[23].x + pose[24].x) / 2;
    const spineDy = (pose[11].y + pose[12].y) / 2 - (pose[23].y + pose[24].y) / 2;
    const spineTilt = Math.round((Math.atan2(spineDx, spineDy) * 180) / Math.PI);

    return {
      leftElbowAngleDeg: leftElbow,
      rightElbowAngleDeg: rightElbow,
      leftShoulderAngleDeg: leftShoulder,
      spineTiltDeg: spineTilt,
      jointsTrackedCount: jointsCount,
      estimatedFloorLevelY: floorY,
    };
  }

  private classifyChord(hand: Vector3D[] | null): string {
    if (!hand || hand.length < 21) return 'Em';

    const isCurled = (tip: number, mcp: number): boolean => {
      const dTip = Math.hypot(hand[tip].x - hand[0].x, hand[tip].y - hand[0].y);
      const dMcp = Math.hypot(hand[mcp].x - hand[0].x, hand[mcp].y - hand[0].y);
      return dTip < dMcp * 1.15;
    };

    const iCurled = isCurled(8, 5);
    const mCurled = isCurled(12, 9);
    const rCurled = isCurled(16, 13);
    const pCurled = isCurled(20, 17);

    if (iCurled && mCurled && rCurled && pCurled) return 'F';
    if (!iCurled && mCurled && rCurled && !pCurled) return 'Em';
    if (iCurled && mCurled && rCurled && !pCurled) return 'C';
    if (iCurled && mCurled && !rCurled && !pCurled) return 'D';
    if (!iCurled && mCurled && rCurled && pCurled) return 'G';
    if (iCurled && mCurled && !rCurled) return 'Am';

    return 'Em';
  }

  private detectPlaceGesture(left: Vector3D[] | null, right: Vector3D[] | null): boolean {
    if (!left || !right) return false;
    const isOpen = (lm: Vector3D[]): boolean => {
      const dTip = Math.hypot(lm[12].x - lm[0].x, lm[12].y - lm[0].y);
      const dMcp = Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y);
      return dTip > dMcp * 1.6;
    };
    return isOpen(left) && isOpen(right);
  }

  private detectGrabGesture(hand: Vector3D[] | null): boolean {
    if (!hand) return false;
    const dTip = Math.hypot(hand[8].x - hand[0].x, hand[8].y - hand[0].y);
    const dMcp = Math.hypot(hand[5].x - hand[0].x, hand[5].y - hand[0].y);
    return dTip < dMcp * 0.9;
  }

  public stop(): void {
    if (this.camera) this.camera.stop();
  }
}
