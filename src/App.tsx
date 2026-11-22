import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SceneManager, GuitarState } from './three/SceneManager';
import { TrackingPipeline, TrackingData } from './vision/TrackingPipeline';
import { AcousticGuitarEngine } from './audio/KarplusStrong';
import { UIOverlay } from './components/UIOverlay';
import { GuitarTransform } from './math/Kinematics';
import { Play } from 'lucide-react';

export const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Engine instances
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const audioEngineRef = useRef<AcousticGuitarEngine | null>(null);
  const trackingPipelineRef = useRef<TrackingPipeline | null>(null);

  // UI state
  const [isAudioStarted, setIsAudioStarted] = useState(false);
  const [activeChord, setActiveChord] = useState('Em');
  const [guitarState, setGuitarState] = useState<GuitarState>('HOLDING');
  const [fps, setFps] = useState(60);
  const [lastStrum, setLastStrum] = useState<{ direction: 'down' | 'up'; velocity: number } | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // Transform received from tracking loop
  const latestTransformRef = useRef<GuitarTransform | null>(null);

  // Initialize Audio & 3D Scene
  useEffect(() => {
    if (!canvasRef.current) return;

    // 1. Create Three.js Scene
    const sceneManager = new SceneManager(canvasRef.current);
    sceneManagerRef.current = sceneManager;

    // 2. Create Acoustic Audio Engine
    const audioEngine = new AcousticGuitarEngine();
    audioEngineRef.current = audioEngine;

    // 3. Render Loop
    let animationFrameId: number;
    let lastTime = performance.now();

    const renderLoop = (time: number) => {
      const deltaTime = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;

      sceneManager.update(deltaTime, latestTransformRef.current);
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    animationFrameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      sceneManager.destroy();
      trackingPipelineRef.current?.stop();
    };
  }, []);

  // Handle tracking updates from MediaPipe
  const handleTrackingFrame = useCallback((data: TrackingData) => {
    setFps(data.fps);

    // 1. Update Active Chord
    if (data.activeChord && data.activeChord !== activeChord) {
      setActiveChord(data.activeChord);
      audioEngineRef.current?.setChord(data.activeChord);
    }

    // 2. Solve Kinematics if Pose is available
    if (data.pose && sceneManagerRef.current) {
      const transform = sceneManagerRef.current.kinematics.computeTransform(data.pose);
      latestTransformRef.current = transform;
    }

    // 3. Handle Strums
    if (data.strumDetected && sceneManagerRef.current && audioEngineRef.current) {
      const { direction, velocity } = data.strumDetected;
      setLastStrum({ direction, velocity });

      audioEngineRef.current.strum(direction, velocity, (strIndex) => {
        sceneManagerRef.current?.guitar.vibrateString(strIndex, velocity);
      });
    }

    // 4. Handle Spatial Gestures (Wall Placement vs Grip)
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

  // Start Camera & Audio on user click (browser security requirement)
  const handleStartExperience = async () => {
    try {
      if (audioEngineRef.current) {
        await audioEngineRef.current.init();
        setIsAudioStarted(true);
      }

      if (videoRef.current && !trackingPipelineRef.current) {
        const pipeline = new TrackingPipeline(videoRef.current);
        trackingPipelineRef.current = pipeline;
        await pipeline.start(handleTrackingFrame);
      }
    } catch (err) {
      console.error('Failed to start camera or audio:', err);
    }
  };

  // Manual strum testing
  const handleManualStrum = (direction: 'down' | 'up') => {
    if (audioEngineRef.current && sceneManagerRef.current) {
      const velocity = 0.85;
      setLastStrum({ direction, velocity });
      audioEngineRef.current.strum(direction, velocity, (strIndex) => {
        sceneManagerRef.current?.guitar.vibrateString(strIndex, velocity);
      });
    }
  };

  // Toggle Mute
  const handleToggleMute = () => {
    if (audioEngineRef.current) {
      const nextMuted = !isMuted;
      setIsMuted(nextMuted);
      audioEngineRef.current.setMasterVolume(nextMuted ? 0 : 0.7);
    }
  };

  // Direct State Change (from button)
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
        className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 opacity-80"
      />

      {/* 3D WebGL Overlay Canvas */}
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
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            onStateChange={handleStateChange}
            onManualStrum={handleManualStrum}
          />
        </div>
      )}

      {/* Initial Landing / Permission Screen */}
      {!isAudioStarted && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/90 backdrop-blur-xl p-6">
          <div className="max-w-md w-full bg-surface border border-white/10 rounded-2xl p-8 shadow-2xl flex flex-col items-center text-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Play className="w-8 h-8 ml-1" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">
                Welcome to Airmelo
              </h2>
              <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                Hyper-realistic spatial air guitar powered by MediaPipe 3D tracking, One-Euro jitter suppression, and Web Audio string physics.
              </p>
            </div>

            <div className="w-full bg-surface-highlight/50 border border-white/5 rounded-xl p-4 text-xs font-mono text-gray-300 text-left flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Zero-latency Web Audio API</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>One-Euro Zero-Jitter Filter</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>Persistent 6-DoF Room Anchoring</span>
              </div>
            </div>

            <button
              onClick={handleStartExperience}
              className="w-full py-3.5 px-6 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
            >
              <span>Enable Camera & Audio</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
