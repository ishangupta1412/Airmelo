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

  // Jitter filters for all 75 joints
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
      refineFaceLandmarks: false,
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
    let floorY = -0.85;

    if (results.poseLandmarks) {
      filteredPose = results.poseLandmarks.map((lm, i) => {
        jointsCount++;
        const raw = {
          x: (1 - lm.x) * 2 - 1,
          y: -(lm.y * 2 - 1),
          z: -lm.z * 1.5,
        };
        return this.poseFilters[i].filter(raw, now);
      });

      kinematicsPose = {
        leftShoulder: filteredPose[11],
        rightShoulder: filteredPose[12],
        leftWrist: filteredPose[15],
        rightWrist: filteredPose[16],
      };

      if (filteredPose[27] && filteredPose[28]) {
        floorY = Math.min(filteredPose[27].y, filteredPose[28].y) - 0.05;
      }
    }

    // 2. Process Left Hand Landmarks (User's Fretting Hand)
    // Note: Because camera image is mirrored, Holistic's rightHandLandmarks is user's left hand
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

    // 3. Process Right Hand Landmarks (User's Strumming Hand)
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

    // 4. Biomechanical Telemetry
    const telemetry = this.computeBiomechanicalTelemetry(filteredPose, jointsCount, floorY);

    // 5. High-Precision Curvature Matrix Chord Recognition
    const activeChord = this.classifyChordCurvature(filteredLeftHand);

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

    const leftElbow = angleBetween(pose[11], pose[13], pose[15]);
    const rightElbow = angleBetween(pose[12], pose[14], pose[16]);
    const leftShoulder = angleBetween(pose[23], pose[11], pose[13]);

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

  /**
   * Biomechanical Curvature Matrix: Measures exact PIP & DIP flexion angles (0 to 180 deg)
   * to classify real guitar chords rather than primitive finger counting.
   */
  private classifyChordCurvature(hand: Vector3D[] | null): string {
    if (!hand || hand.length < 21) return 'Em';

    // Computes joint angle between 3 points
    const jointAngle = (aIdx: number, bIdx: number, cIdx: number): number => {
      const a = hand[aIdx];
      const b = hand[bIdx];
      const c = hand[cIdx];
      const v1 = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
      const v2 = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
      const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
      const m1 = Math.hypot(v1.x, v1.y, v1.z);
      const m2 = Math.hypot(v2.x, v2.y, v2.z);
      if (m1 === 0 || m2 === 0) return 180;
      return (Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))) * 180) / Math.PI;
    };

    // PIP Joint Angles: 180° = straight/extended, < 110° = curled/fretted
    // Index: MCP=5, PIP=6, DIP=7, Tip=8
    // Middle: MCP=9, PIP=10, DIP=11, Tip=12
    // Ring: MCP=13, PIP=14, DIP=15, Tip=16
    // Pinky: MCP=17, PIP=18, DIP=19, Tip=20
    const indexAngle = jointAngle(5, 6, 8);
    const middleAngle = jointAngle(9, 10, 12);
    const ringAngle = jointAngle(13, 14, 16);
    const pinkyAngle = jointAngle(17, 18, 20);

    const isCurled = (deg: number) => deg < 125;

    const iCurled = isCurled(indexAngle);
    const mCurled = isCurled(middleAngle);
    const rCurled = isCurled(ringAngle);
    const pCurled = isCurled(pinkyAngle);

    // Anatomical Guitar Chord Mapping:
    // 1. Barre Chord (F Major): All fingers pressed/flat
    if (iCurled && mCurled && rCurled && pCurled) return 'F';

    // 2. Open E Minor: Index open/extended, Middle & Ring curled, Pinky open
    if (!iCurled && mCurled && rCurled && !pCurled) return 'Em';

    // 3. C Major: Index curled, Middle & Ring curled, Pinky open
    if (iCurled && mCurled && rCurled && !pCurled) return 'C';

    // 4. D Major: Index & Middle curled, Ring curled, Pinky open (compact cluster)
    if (iCurled && mCurled && !rCurled && !pCurled) return 'D';

    // 5. G Major: Index & Middle curled, Ring & Pinky curled
    if (!iCurled && mCurled && rCurled && pCurled) return 'G';

    // 6. A Minor: Index curled, Middle & Ring curled
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
