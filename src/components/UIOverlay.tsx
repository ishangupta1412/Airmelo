import React from 'react';
import { Volume2, VolumeX, Sparkles, Activity, Disc3, Eye, ShieldCheck, Crosshair } from 'lucide-react';
import { GuitarState } from '../three/SceneManager';
import { CHORDS } from '../audio/KarplusStrong';
import { BiomechanicalTelemetry } from '../vision/HolisticPipeline';

interface UIOverlayProps {
  activeChord: string;
  guitarState: GuitarState;
  fps: number;
  lastStrum: { direction: 'down' | 'up'; velocity: number } | null;
  lastPhysicalHitString: number | null;
  telemetry: BiomechanicalTelemetry;
  showSkeleton: boolean;
  isMuted: boolean;
  onToggleSkeleton: () => void;
  onToggleMute: () => void;
  onStateChange: (state: GuitarState) => void;
  onManualStrum: (direction: 'down' | 'up') => void;
}

export const UIOverlay: React.FC<UIOverlayProps> = ({
  activeChord,
  guitarState,
  fps,
  lastStrum,
  lastPhysicalHitString,
  telemetry,
  showSkeleton,
  isMuted,
  onToggleSkeleton,
  onToggleMute,
  onStateChange,
  onManualStrum,
}) => {
  const currentChordData = CHORDS[activeChord] || CHORDS.Em;

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
      {/* Top Header Bar */}
      <header className="flex items-center justify-between pointer-events-auto">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3 bg-surface/85 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-lg">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
            <Disc3 className="w-4 h-4 animate-spin-slow" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-wide text-white flex items-center gap-2">
              Airmelo <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">MoCap 3D</span>
            </h1>
            <p className="text-[11px] text-gray-400 font-mono">Full-Body 75-Joint Tracking</p>
          </div>
        </div>

        {/* State Badge & Room Persistence Controls */}
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-medium flex items-center gap-2 backdrop-blur-md transition-all duration-300 ${
            guitarState === 'HOLDING'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              guitarState === 'HOLDING' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`} />
            {guitarState === 'HOLDING' ? 'IN HANDS (ACTIVE)' : 'RESTING ON WALL (PERSISTENT)'}
          </div>

          <button
            onClick={() => onStateChange(guitarState === 'HOLDING' ? 'PLACED_RESTING' : 'HOLDING')}
            className="px-3 py-1.5 bg-surface/80 hover:bg-surface-highlight border border-white/10 rounded-lg text-xs font-medium text-gray-300 hover:text-white transition-colors backdrop-blur-md shadow-sm"
          >
            {guitarState === 'HOLDING' ? 'Place on Wall' : 'Pick Up Guitar'}
          </button>

          <button
            onClick={onToggleSkeleton}
            className={`px-3 py-1.5 border rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors backdrop-blur-md ${
              showSkeleton
                ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                : 'bg-surface/80 border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{showSkeleton ? 'Hide Skeleton' : 'Show Skeleton'}</span>
          </button>
        </div>

        {/* Telemetry HUD */}
        <div className="flex items-center gap-3 bg-surface/85 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/10 text-xs font-mono text-gray-300">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>{fps} FPS</span>
          </div>
          <span className="text-white/20">|</span>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>{telemetry.jointsTrackedCount}/75 Joints</span>
          </div>
          <span className="text-white/20">|</span>
          <button
            onClick={onToggleMute}
            className="p-1 hover:text-white transition-colors"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-gray-300" />}
          </button>
        </div>
      </header>

      {/* Center Left: Live Chord HUD & Biomechanical Joint Angles */}
      <div className="pointer-events-auto flex flex-col gap-3 w-fit">
        {/* Chord Card */}
        <div className="bg-surface/85 backdrop-blur-lg p-4 rounded-2xl border border-white/10 shadow-2xl flex flex-col gap-3 min-w-[200px]">
          <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
            <span>ACTIVE CHORD</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-white tracking-tight font-sans">
              {activeChord}
            </span>
            <span className="text-xs font-mono text-gray-400">
              {currentChordData.name}
            </span>
          </div>

          {/* Fret indicator pins */}
          <div className="flex items-center justify-between pt-2 border-t border-white/10 font-mono text-[11px] text-gray-400">
            {currentChordData.frets.map((fret, idx) => (
              <div key={idx} className="flex flex-col items-center gap-1">
                <span className={`text-[9px] ${lastPhysicalHitString === idx ? 'text-amber-400 font-bold' : 'text-gray-500'}`}>
                  {['E', 'A', 'D', 'G', 'B', 'e'][idx]}
                </span>
                <span className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] transition-all duration-150 ${
                  lastPhysicalHitString === idx
                    ? 'bg-amber-400 text-black scale-110 shadow-md shadow-amber-400/50'
                    : fret === -1
                    ? 'text-red-400/80 bg-red-400/10'
                    : fret === 0
                    ? 'text-emerald-400 bg-emerald-400/10'
                    : 'text-amber-400 bg-amber-400/10'
                }`}>
                  {fret === -1 ? 'X' : fret}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Real-time Biomechanical Joint Inspector */}
        <div className="bg-surface/80 backdrop-blur-md p-3 rounded-xl border border-white/10 shadow-lg text-[11px] font-mono text-gray-400 flex flex-col gap-1.5 min-w-[200px]">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <Crosshair className="w-3 h-3 text-cyan-400" />
            <span>Biomechanical Kinematics</span>
          </div>
          <div className="flex justify-between">
            <span>Left Elbow Flexion:</span>
            <span className="text-cyan-300 font-semibold">{telemetry.leftElbowAngleDeg}°</span>
          </div>
          <div className="flex justify-between">
            <span>Right Elbow Flexion:</span>
            <span className="text-cyan-300 font-semibold">{telemetry.rightElbowAngleDeg}°</span>
          </div>
          <div className="flex justify-between">
            <span>Spine Alignment:</span>
            <span className="text-emerald-300 font-semibold">{telemetry.spineTiltDeg}°</span>
          </div>
        </div>
      </div>

      {/* Bottom Center: Strum Feedback & Quick Controls */}
      <footer className="flex items-end justify-between pointer-events-auto">
        {/* Quick Gesture Guide */}
        <div className="bg-surface/80 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/10 text-xs font-mono text-gray-400 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span><strong className="text-gray-200">Left Hand:</strong> Real-time Fret Chords</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span><strong className="text-gray-200">Right Fingers:</strong> Physical 3D String Contact</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span><strong className="text-gray-200">Open Palms:</strong> Wall Placement</span>
          </div>
        </div>

        {/* Dynamic Strum Visualizer & Manual Strum Buttons */}
        <div className="flex items-center gap-2">
          {lastStrum && (
            <div className="bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 rounded-lg text-amber-300 font-mono text-xs flex items-center gap-2 animate-bounce">
              <span>{lastStrum.direction.toUpperCase()}STRUM</span>
              <span className="text-[10px] opacity-75">
                {(lastStrum.velocity * 100).toFixed(0)}% vel
              </span>
            </div>
          )}

          <div className="flex gap-1.5 bg-surface/80 backdrop-blur-md p-1.5 rounded-xl border border-white/10">
            <button
              onClick={() => onManualStrum('down')}
              className="px-3 py-1.5 bg-surface-highlight hover:bg-amber-500/20 hover:text-amber-300 border border-white/5 rounded-lg text-xs font-mono text-gray-300 transition-colors"
            >
              Downstrum ↓
            </button>
            <button
              onClick={() => onManualStrum('up')}
              className="px-3 py-1.5 bg-surface-highlight hover:bg-amber-500/20 hover:text-amber-300 border border-white/5 rounded-lg text-xs font-mono text-gray-300 transition-colors"
            >
              Upstrum ↑
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
