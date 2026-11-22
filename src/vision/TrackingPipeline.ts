import { Hands, Results as HandResults } from '@mediapipe/hands';
import { Pose, Results as PoseResults } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { OneEuroFilter3D, Vector3D } from '../math/OneEuroFilter';
import { PoseLandmarks } from '../math/Kinematics';

export interface TrackingData {
  pose: PoseLandmarks | null;
  leftHandLandmarks: Vector3D[] | null;
  rightHandLandmarks: Vector3D[] | null;
  activeChord: string;
  strumDetected: {
    direction: 'down' | 'up';
    velocity: number;
  } | null;
  placeGestureDetected: boolean;
  grabGestureDetected: boolean;
  fps: number;
}

export class TrackingPipeline {
  private videoElement: HTMLVideoElement;
  private hands: Hands;
  private pose: Pose;
  private camera: Camera | null = null;

  // Jitter filters for key landmarks
  private leftShoulderFilter = new OneEuroFilter3D();
  private rightShoulderFilter = new OneEuroFilter3D();
  private leftWristFilter = new OneEuroFilter3D();
  private rightWristFilter = new OneEuroFilter3D();
  private rightIndexFilter = new OneEuroFilter3D();

  // Strumming state
  private lastRightIndexPos: Vector3D | null = null;
  private lastStrumTime = 0;
  private strumDebounceMs = 120; // 120ms debounce avoids double-triggers

  // Performance telemetry
  private frameCount = 0;
  private lastFpsTime = performance.now();
  private currentFps = 60;

  // Callbacks
  private onFrameCallback: ((data: TrackingData) => void) | null = null;

  // Stored state between async callback updates
  private latestPoseLandmarks: PoseLandmarks | null = null;
  private latestLeftHand: Vector3D[] | null = null;
  private latestRightHand: Vector3D[] | null = null;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;

    // 1. Initialize MediaPipe Hands
    this.hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.65,
      minTrackingConfidence: 0.65,
    });
    this.hands.onResults(this.handleHandResults);

    // 2. Initialize MediaPipe Pose
    this.pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });
    this.pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
    this.pose.onResults(this.handlePoseResults);
  }

  public async start(onFrame: (data: TrackingData) => void): Promise<void> {
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

        // Send frame sequentially to Pose and Hands
        await this.pose.send({ image: this.videoElement });
        await this.hands.send({ image: this.videoElement });

        this.processCombinedFrame();
      },
      width: 1280,
      height: 720,
    });

    await this.camera.start();
  }

  private handlePoseResults = (results: PoseResults): void => {
    if (!results.poseLandmarks) {
      this.latestPoseLandmarks = null;
      return;
    }

    const lm = results.poseLandmarks;
    const now = performance.now() / 1000;

    // Filter key upper body landmarks
    // MediaPipe Pose landmarks:
    // 11 = Left Shoulder, 12 = Right Shoulder
    // 15 = Left Wrist, 16 = Right Wrist
    // Mirroring note: Webcam is mirrored, so we map left/right to natural playing stance
    const ls = this.leftShoulderFilter.filter({ x: (1 - lm[11].x) * 2 - 1, y: -(lm[11].y * 2 - 1), z: lm[11].z }, now);
    const rs = this.rightShoulderFilter.filter({ x: (1 - lm[12].x) * 2 - 1, y: -(lm[12].y * 2 - 1), z: lm[12].z }, now);
    const lw = this.leftWristFilter.filter({ x: (1 - lm[15].x) * 2 - 1, y: -(lm[15].y * 2 - 1), z: lm[15].z }, now);
    const rw = this.rightWristFilter.filter({ x: (1 - lm[16].x) * 2 - 1, y: -(lm[16].y * 2 - 1), z: lm[16].z }, now);

    this.latestPoseLandmarks = {
      leftShoulder: ls,
      rightShoulder: rs,
      leftWrist: lw,
      rightWrist: rw,
    };
  };

  private handleHandResults = (results: HandResults): void => {
    this.latestLeftHand = null;
    this.latestRightHand = null;

    if (!results.multiHandLandmarks || !results.multiHandedness) return;

    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
      const label = results.multiHandedness[i].label; // "Left" or "Right"
      const landmarks = results.multiHandLandmarks[i].map((pt) => ({
        x: (1 - pt.x) * 2 - 1, // Mirroring
        y: -(pt.y * 2 - 1),
        z: pt.z,
      }));

      // Because webcam is mirrored:
      if (label === 'Left') {
        this.latestRightHand = landmarks;
      } else {
        this.latestLeftHand = landmarks;
      }
    }
  };

  private processCombinedFrame(): void {
    if (!this.onFrameCallback) return;

    // 1. Detect Active Chord from Left Hand
    const activeChord = this.classifyLeftHandChord(this.latestLeftHand);

    // 2. Detect Right Hand Strumming Dynamics
    const strum = this.detectRightHandStrum(this.latestRightHand);

    // 3. Detect Spatial Gestures (Place on Wall vs Grab)
    const placeGesture = this.detectPlaceGesture(this.latestLeftHand, this.latestRightHand);
    const grabGesture = this.detectGrabGesture(this.latestRightHand || this.latestLeftHand);

    this.onFrameCallback({
      pose: this.latestPoseLandmarks,
      leftHandLandmarks: this.latestLeftHand,
      rightHandLandmarks: this.latestRightHand,
      activeChord,
      strumDetected: strum,
      placeGestureDetected: placeGesture,
      grabGestureDetected: grabGesture,
      fps: this.currentFps,
    });
  }

  /**
   * Recognizes left hand chord topology based on finger curls and spread
   */
  private classifyLeftHandChord(landmarks: Vector3D[] | null): string {
    if (!landmarks || landmarks.length < 21) return 'Em'; // Default rich acoustic chord

    // Key hand landmark indices:
    // Wrist = 0
    // Index: MCP=5, PIP=6, DIP=7, Tip=8
    // Middle: MCP=9, PIP=10, DIP=11, Tip=12
    // Ring: MCP=13, PIP=14, DIP=15, Tip=16
    // Pinky: MCP=17, PIP=18, DIP=19, Tip=20

    const isCurled = (tipIdx: number, mcpIdx: number): boolean => {
      // Euclidean distance from tip to wrist vs MCP to wrist
      const dTip = Math.hypot(landmarks[tipIdx].x - landmarks[0].x, landmarks[tipIdx].y - landmarks[0].y);
      const dMcp = Math.hypot(landmarks[mcpIdx].x - landmarks[0].x, landmarks[mcpIdx].y - landmarks[0].y);
      return dTip < dMcp * 1.15;
    };

    const indexCurled = isCurled(8, 5);
    const middleCurled = isCurled(12, 9);
    const ringCurled = isCurled(16, 13);
    const pinkyCurled = isCurled(20, 17);

    // High-precision Chord Logic:
    // 1. All fingers curled = Barre / F Major
    if (indexCurled && middleCurled && ringCurled && pinkyCurled) {
      return 'F';
    }

    // 2. Index open, Middle & Ring curled = Em (Classic open chord)
    if (!indexCurled && middleCurled && ringCurled && !pinkyCurled) {
      return 'Em';
    }

    // 3. Index curled, Middle & Ring curled, Pinky open = C Major
    if (indexCurled && middleCurled && ringCurled && !pinkyCurled) {
      return 'C';
    }

    // 4. Index curled, Middle curled, Ring & Pinky open = D Major
    if (indexCurled && middleCurled && !ringCurled && !pinkyCurled) {
      return 'D';
    }

    // 5. Index open, Pinky curled, Middle & Ring curled = G Major
    if (!indexCurled && middleCurled && ringCurled && pinkyCurled) {
      return 'G';
    }

    // 6. Index & Middle curled together, Ring open = Am
    if (indexCurled && middleCurled && !ringCurled) {
      return 'Am';
    }

    // Default fallback
    return 'Em';
  }

  /**
   * Tracks right hand vertical trajectory across virtual soundhole to trigger strums
   */
  private detectRightHandStrum(landmarks: Vector3D[] | null): { direction: 'down' | 'up'; velocity: number } | null {
    if (!landmarks || landmarks.length < 21) {
      this.lastRightIndexPos = null;
      return null;
    }

    const now = performance.now();
    const indexTip = this.rightIndexFilter.filter(landmarks[8], now / 1000);

    if (!this.lastRightIndexPos) {
      this.lastRightIndexPos = { ...indexTip };
      return null;
    }

    const dy = indexTip.y - this.lastRightIndexPos.y;
    const dt = Math.max(1, now - this.lastStrumTime);
    this.lastRightIndexPos = { ...indexTip };

    // Threshold for strum strike
    const velocityMagnitude = Math.abs(dy) * 1000 / dt;

    if (velocityMagnitude > 1.2 && now - this.lastStrumTime > this.strumDebounceMs) {
      this.lastStrumTime = now;
      const normalizedVelocity = Math.min(1.0, 0.35 + velocityMagnitude * 0.15);
      return {
        direction: dy < 0 ? 'down' : 'up',
        velocity: normalizedVelocity,
      };
    }

    return null;
  }

  /**
   * Detects "Put down on wall" gesture: both palms open flat facing forward
   */
  private detectPlaceGesture(left: Vector3D[] | null, right: Vector3D[] | null): boolean {
    if (!left || !right) return false;

    // Both hands must have open fingers
    const isOpenHand = (lm: Vector3D[]): boolean => {
      const d8 = Math.hypot(lm[8].x - lm[0].x, lm[8].y - lm[0].y);
      const d12 = Math.hypot(lm[12].x - lm[0].x, lm[12].y - lm[0].y);
      const d16 = Math.hypot(lm[16].x - lm[0].x, lm[16].y - lm[0].y);
      const d20 = Math.hypot(lm[20].x - lm[0].x, lm[20].y - lm[0].y);
      const dMcp = Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y);
      return d8 > dMcp * 1.5 && d12 > dMcp * 1.5 && d16 > dMcp * 1.5 && d20 > dMcp * 1.5;
    };

    return isOpenHand(left) && isOpenHand(right);
  }

  /**
   * Detects "Grab/Pick up" gesture: hand forms a closed fist near guitar
   */
  private detectGrabGesture(hand: Vector3D[] | null): boolean {
    if (!hand) return false;
    const dTip = Math.hypot(hand[8].x - hand[0].x, hand[8].y - hand[0].y);
    const dMcp = Math.hypot(hand[5].x - hand[0].x, hand[5].y - hand[0].y);
    return dTip < dMcp * 0.95; // Closed fist
  }

  public stop(): void {
    if (this.camera) {
      this.camera.stop();
    }
  }
}
