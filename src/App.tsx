import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SceneManager, GuitarState } from './three/SceneManager';
import { HolisticPipeline, HolisticFrameData, BiomechanicalTelemetry } from './vision/HolisticPipeline';
import { AcousticGuitarEngine } from './audio/KarplusStrong';
import { UIOverlay } from './components/UIOverlay';
import { GuitarTransform } from './math/Kinematics';
import { FullBodySkeletonData } from './three/SkeletonRig';
import { Play } from 'lucide-react';
import { Vector3D } from './math/OneEuroFilter';

export const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Engines
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const audioEngineRef = useRef<AcousticGuitarEngine | null>(null);
  const holisticPipelineRef = useRef<HolisticPipeline | null>(null);

  // UI state
  const [isAudioStarted, setIsAudioStarted] = useState(false);
  const [activeChord, setActiveChord] = useState('Em');
  const [guitarState, setGuitarState] = useState<GuitarState>('HOLDING');
  const [fps, setFps] = useState(60);
  const [lastStrum, setLastStrum] = useState<{ direction: 'down' | 'up'; velocity: number } | null>(null);
  const [lastPhysicalHitString, setLastPhysicalHitString] = useState<number | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [telemetry, setTelemetry] = useState<BiomechanicalTelemetry>({
    leftElbowAngleDeg: 90,
    rightElbowAngleDeg: 90,
    leftShoulderAngleDeg: 45,
    spineTiltDeg: 0,
    jointsTrackedCount: 0,
    estimatedFloorLevelY: -0.85,
  });

  // State shared with render loop
  const latestTransformRef = useRef<GuitarTransform | null>(null);
  const latestSkeletonRef = useRef<FullBodySkeletonData>({
    poseLandmarks: null,
    leftHandLandmarks: null,
    rightHandLandmarks: null,
  });
  const latestRightHandRef = useRef<Vector3D[] | null>(null);

  // Initialize Three.js scene & Audio
  useEffect(() => {
    if (!canvasRef.current) return;

    const sceneManager = new SceneManager(canvasRef.current);
    sceneManagerRef.current = sceneManager;

    const audioEngine = new AcousticGuitarEngine();
    audioEngineRef.current = audioEngine;

    let animationFrameId: number;
    let lastTime = performance.now();

    const renderLoop = (time: number) => {
      const deltaTime = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;

      // Update scene with 75-joint skeleton & check physical string collisions
      const collisions = sceneManager.update(
        deltaTime,
        latestSkeletonRef.current,
        latestTransformRef.current,
        latestRightHandRef.current
      );

      // Trigger Karplus-Strong string sound on physical collision
      if (collisions.length > 0 && audioEngineRef.current) {
        for (const hit of collisions) {
          audioEngineRef.current.pluckString(hit.stringIndex, hit.velocity);
          setLastPhysicalHitString(hit.stringIndex);
          setTimeout(() => setLastPhysicalHitString(null), 150);
        }
      }

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    animationFrameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      sceneManager.destroy();
      holisticPipelineRef.current?.stop();
    };
  }, []);

  // Handle Holistic 75-joint frames
  const handleHolisticFrame = useCallback((data: HolisticFrameData) => {
    setFps(data.fps);
    setTelemetry(data.telemetry);

    // 1. Store full skeleton data for 3D render loop
    latestSkeletonRef.current = {
      poseLandmarks: data.poseLandmarks,
      leftHandLandmarks: data.leftHandLandmarks,
      rightHandLandmarks: data.rightHandLandmarks,
    };
    latestRightHandRef.current = data.rightHandLandmarks;

    // 2. Update Floor Level
    if (sceneManagerRef.current && data.telemetry.estimatedFloorLevelY) {
      sceneManagerRef.current.setFloorLevel(data.telemetry.estimatedFloorLevelY);
    }

    // 3. Update Active Chord
    if (data.activeChord && data.activeChord !== activeChord) {
      setActiveChord(data.activeChord);
      audioEngineRef.current?.setChord(data.activeChord);
    }

    // 4. Solve Kinematics
    if (data.kinematicsPose && sceneManagerRef.current) {
      const transform = sceneManagerRef.current.kinematics.computeTransform(data.kinematicsPose);
      latestTransformRef.current = transform;
    }

    // 5. Handle Gestures
    if (sceneManagerRef.current) {
      const currentState = sceneManagerRef.current.getState();
      if (data.placeGestureDetected && currentState === 'HOLDING') {
        sceneManagerRef.current.setState('PLACED_RESTING');
        setGuitarState('PLACED_RESTING');
      } else if (data.grabGestureDetected && currentState === 'PLACED_RESTING') {
        sceneManagerRef.current.setState('HOLDING');
        setGuitarState('HOLDING');
      }
    }
  }, [activeChord]);

  const handleStartExperience = async () => {
    try {
      if (audioEngineRef.current) {
        await audioEngineRef.current.init();
        setIsAudioStarted(true);
      }

      if (videoRef.current && !holisticPipelineRef.current) {
        const pipeline = new HolisticPipeline(videoRef.current);
        holisticPipelineRef.current = pipeline;
        await pipeline.start(handleHolisticFrame);
      }
    } catch (err) {
      console.error('Failed to start camera or audio:', err);
    }
  };

  const handleManualStrum = (direction: 'down' | 'up') => {
    if (audioEngineRef.current && sceneManagerRef.current) {
      const velocity = 0.85;
      setLastStrum({ direction, velocity });
      audioEngineRef.current.strum(direction, velocity, (strIndex) => {
        sceneManagerRef.current?.guitar.vibrateString(strIndex, velocity);
      });
    }
  };

  const handleToggleSkeleton = () => {
    const nextVal = !showSkeleton;
    setShowSkeleton(nextVal);
    sceneManagerRef.current?.toggleSkeleton(nextVal);
  };

  const handleToggleMute = () => {
    if (audioEngineRef.current) {
      const nextMuted = !isMuted;
      setIsMuted(nextMuted);
      audioEngineRef.current.setMasterVolume(nextMuted ? 0 : 0.7);
    }
  };

  const handleStateChange = (newState: GuitarState) => {
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setState(newState);
      setGuitarState(newState);
    }
  };

  return (
    <div className="relative w-screen h-screen bg-background overflow-hidden select-none font-sans">
      {/* Background Webcam Feed */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 opacity-75"
      />

      {/* 3D WebGL Overlay Canvas (Guitar + 75-Joint MoCap Skeleton + Room Spatial Grid) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full z-10 pointer-events-none"
      />

      {/* Studio UI HUD Overlay */}
      {isAudioStarted && (
        <div className="relative z-20 w-full h-full">
          <UIOverlay
            activeChord={activeChord}
            guitarState={guitarState}
            fps={fps}
            lastStrum={lastStrum}
            lastPhysicalHitString={lastPhysicalHitString}
            telemetry={telemetry}
            showSkeleton={showSkeleton}
            isMuted={isMuted}
            onToggleSkeleton={handleToggleSkeleton}
            onToggleMute={handleToggleMute}
            onStateChange={handleStateChange}
            onManualStrum={handleManualStrum}
          />
        </div>
      )}

      {/* Landing / Permission Screen */}
      {!isAudioStarted && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/90 backdrop-blur-xl p-6">
          <div className="max-w-md w-full bg-surface border border-white/10 rounded-2xl p-8 shadow-2xl flex flex-col items-center text-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Play className="w-8 h-8 ml-1" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">
                Airmelo MoCap Studio
              </h2>
              <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                Full-body 75-joint biomechanical tracking with real-time 3D finger-to-string physical colliders and Karplus-Strong acoustic physics.
              </p>
            </div>

            <div className="w-full bg-surface-highlight/50 border border-white/5 rounded-xl p-4 text-xs font-mono text-gray-300 text-left flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>Full-Body Holistic 75-Joint Rigging</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>3D Physical Finger-String Colliders</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Real-Time Biomechanical Telemetry & Room Grid</span>
              </div>
            </div>

            <button
              onClick={handleStartExperience}
              className="w-full py-3.5 px-6 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2"
            >
              <span>Launch MoCap Air Studio</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
