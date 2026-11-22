import React from 'react';
import { Volume2, VolumeX, Sparkles, Activity, Disc3 } from 'lucide-react';
import { GuitarState } from '../three/SceneManager';
import { CHORDS } from '../audio/KarplusStrong';

interface UIOverlayProps {
  activeChord: string;
  guitarState: GuitarState;
  fps: number;
  lastStrum: { direction: 'down' | 'up'; velocity: number } | null;
  isMuted: boolean;
  onToggleMute: () => void;
  onStateChange: (state: GuitarState) => void;
  onManualStrum: (direction: 'down' | 'up') => void;
}

export const UIOverlay: React.FC<UIOverlayProps> = ({
  activeChord,
  guitarState,
  fps,
  lastStrum,
  isMuted,
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
        <div className="flex items-center gap-3 bg-surface/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-lg">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
            <Disc3 className="w-4 h-4 animate-spin-slow" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-wide text-white flex items-center gap-2">
              Airmelo <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Studio AR</span>
            </h1>
            <p className="text-[11px] text-gray-400 font-mono">Dreadnought Acoustic 6-String</p>
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
            {guitarState === 'HOLDING' ? 'IN HANDS (PLAYING)' : 'RESTING ON WALL (PERSISTENT)'}
          </div>

          <button
            onClick={() => onStateChange(guitarState === 'HOLDING' ? 'PLACED_RESTING' : 'HOLDING')}
            className="px-3 py-1.5 bg-surface/80 hover:bg-surface-highlight border border-white/10 rounded-lg text-xs font-medium text-gray-300 hover:text-white transition-colors backdrop-blur-md shadow-sm"
          >
            {guitarState === 'HOLDING' ? 'Place Against Wall' : 'Pick Up Guitar'}
          </button>
        </div>

        {/* Telemetry HUD */}
        <div className="flex items-center gap-3 bg-surface/80 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/10 text-xs font-mono text-gray-300">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>{fps} FPS</span>
          </div>
          <span className="text-white/20">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">Latency:</span>
            <span className="text-amber-400">~9.2ms</span>
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

      {/* Center Left: Live Chord HUD */}
      <div className="pointer-events-auto w-fit">
        <div className="bg-surface/85 backdrop-blur-lg p-4 rounded-2xl border border-white/10 shadow-2xl flex flex-col gap-3 min-w-[180px]">
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
                <span className="text-[9px] text-gray-500">
                  {['E', 'A', 'D', 'G', 'B', 'e'][idx]}
                </span>
                <span className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] ${
                  fret === -1
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
      </div>

      {/* Bottom Center: Strum Feedback & Quick Guide */}
      <footer className="flex items-end justify-between pointer-events-auto">
        {/* Quick Gesture Guide */}
        <div className="bg-surface/75 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/10 text-xs font-mono text-gray-400 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span><strong className="text-gray-200">Left Hand:</strong> Shape Chords</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span><strong className="text-gray-200">Right Hand:</strong> Strum Up/Down</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span><strong className="text-gray-200">Open Palms:</strong> Place on Wall</span>
          </div>
        </div>

        {/* Dynamic Strum Visualizer & Manual Strum Buttons for testing */}
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
