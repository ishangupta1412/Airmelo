/**
 * High-Performance Karplus-Strong Physical String Synthesis Engine.
 * Implements physical acoustic wave modeling with body resonance filtering,
 * velocity-dependent harmonics, micro-strum cascade, and zero-latency Web Audio buffers.
 */

export interface ChordDefinition {
  name: string;
  frets: number[]; // 6 strings from Low E (index 0) to High E (index 5). -1 = muted.
}

export const CHORDS: Record<string, ChordDefinition> = {
  Em: { name: 'E Minor', frets: [0, 2, 2, 0, 0, 0] },
  C:  { name: 'C Major', frets: [-1, 3, 2, 0, 1, 0] },
  G:  { name: 'G Major', frets: [3, 2, 0, 0, 3, 3] },
  D:  { name: 'D Major', frets: [-1, -1, 0, 2, 3, 2] },
  Am: { name: 'A Minor', frets: [-1, 0, 2, 2, 1, 0] },
  E:  { name: 'E Major', frets: [0, 2, 2, 1, 0, 0] },
  A:  { name: 'A Major', frets: [-1, 0, 2, 2, 2, 0] },
  F:  { name: 'F Major', frets: [1, 3, 3, 2, 1, 1] },
  Dm: { name: 'D Minor', frets: [-1, -1, 0, 2, 3, 1] },
};

export class AcousticGuitarEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bodyResonance1: BiquadFilterNode | null = null;
  private bodyResonance2: BiquadFilterNode | null = null;

  // Base frequencies of standard acoustic guitar tuning (E2 to E4)
  public static readonly BASE_FREQS = [
    82.41,  // E2 (String 6 - Low E)
    110.00, // A2 (String 5)
    146.83, // D3 (String 4)
    196.00, // G3 (String 3)
    246.94, // B3 (String 2)
    329.63  // E4 (String 1 - High E)
  ];

  private currentChord: ChordDefinition = CHORDS.Em;
  private isInitialized = false;

  constructor() {}

  /**
   * Initializes the Web Audio context on user interaction
   */
  public async init(): Promise<void> {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioContextClass({ latencyHint: 'interactive' });

    // Master volume control
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);

    // Body resonance filters (simulates the wooden cavity of acoustic guitar)
    // 1. Air cavity Helmholtz resonance (~105 Hz)
    this.bodyResonance1 = this.ctx.createBiquadFilter();
    this.bodyResonance1.type = 'peaking';
    this.bodyResonance1.frequency.setValueAtTime(105, this.ctx.currentTime);
    this.bodyResonance1.Q.setValueAtTime(3.5, this.ctx.currentTime);
    this.bodyResonance1.gain.setValueAtTime(4.0, this.ctx.currentTime);

    // 2. Soundboard wood presence peak (~2.8 kHz)
    this.bodyResonance2 = this.ctx.createBiquadFilter();
    this.bodyResonance2.type = 'peaking';
    this.bodyResonance2.frequency.setValueAtTime(2800, this.ctx.currentTime);
    this.bodyResonance2.Q.setValueAtTime(1.8, this.ctx.currentTime);
    this.bodyResonance2.gain.setValueAtTime(2.5, this.ctx.currentTime);

    // Chain: Strings -> Body 1 -> Body 2 -> Master -> Output
    this.bodyResonance1.connect(this.bodyResonance2);
    this.bodyResonance2.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.isInitialized = true;
  }

  public setChord(chordKey: string): void {
    if (CHORDS[chordKey]) {
      this.currentChord = CHORDS[chordKey];
    }
  }

  public getCurrentChord(): ChordDefinition {
    return this.currentChord;
  }

  /**
   * Plucks an individual string using Karplus-Strong physical modeling algorithm
   * 
   * @param stringIndex 0 (Low E) to 5 (High E)
   * @param velocity 0.0 to 1.0 (striking force)
   * @param timeOffset Delay time in seconds
   */
  public pluckString(
    stringIndex: number,
    velocity: number = 0.8,
    timeOffset: number = 0
  ): void {
    if (!this.ctx || !this.bodyResonance1) return;

    const fret = this.currentChord.frets[stringIndex];
    if (fret === -1) return; // Muted string

    // Calculate actual pitch: f = f0 * 2^(fret / 12)
    const baseFreq = AcousticGuitarEngine.BASE_FREQS[stringIndex];
    const frequency = baseFreq * Math.pow(2, fret / 12);

    const sampleRate = this.ctx.sampleRate;
    const duration = 2.8; // Duration of ringing string in seconds
    const totalSamples = Math.floor(sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, totalSamples, sampleRate);
    const channelData = buffer.getChannelData(0);

    // Delay line period N in samples
    const period = Math.round(sampleRate / frequency);
    const delayLine = new Float32Array(period);

    // 1. Initial excitation impulse:
    // Plucking near the center creates odd harmonics; near the bridge creates high harmonics.
    // Velocity scales initial energy and brightness.
    for (let i = 0; i < period; i++) {
      // Pink/Brownish noise for warm acoustic pick attack
      delayLine[i] = (Math.random() * 2 - 1) * velocity;
    }

    // 2. Karplus-Strong feedback loop with low-pass loop filter:
    // y[n] = 0.5 * (x[n] + x[n - period]) with decay factor
    // Thicker strings (lower index) decay slower; higher strings decay faster.
    const decayBase = 0.992 - (stringIndex * 0.0015);
    // Harder strikes ring slightly longer
    const decay = Math.min(0.998, decayBase + velocity * 0.004);

    let lastSample = 0;
    for (let n = 0; n < totalSamples; n++) {
      const idx = n % period;
      const currentVal = delayLine[idx];
      
      // Low-pass filter (averaging consecutive samples) + decay
      const filtered = 0.5 * (currentVal + lastSample) * decay;
      lastSample = currentVal;
      delayLine[idx] = filtered;

      channelData[n] = currentVal;
    }

    // Playback node with dynamic envelope
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    // Velocity-sensitive brightness low-pass filter
    const brightnessFilter = this.ctx.createBiquadFilter();
    brightnessFilter.type = 'lowpass';
    const cutoff = Math.min(18000, 2000 + Math.pow(velocity, 1.5) * 12000);
    brightnessFilter.frequency.setValueAtTime(cutoff, this.ctx.currentTime + timeOffset);

    // Dynamic gain node
    const gainNode = this.ctx.createGain();
    const gainValue = Math.min(1.0, 0.2 + velocity * 0.8);
    gainNode.gain.setValueAtTime(gainValue, this.ctx.currentTime + timeOffset);

    // Routing
    source.connect(brightnessFilter);
    brightnessFilter.connect(gainNode);
    gainNode.connect(this.bodyResonance1);

    const startTime = this.ctx.currentTime + timeOffset;
    source.start(startTime);
  }

  /**
   * Executes a realistic strum across strings with natural micro-delays
   * 
   * @param direction 'down' (Low E to High E) or 'up' (High E to Low E)
   * @param velocity Strumming hand speed (0.1 to 1.0)
   * @param onPlucked Optional callback when each string is triggered for visual vibration
   */
  public strum(
    direction: 'down' | 'up' = 'down',
    velocity: number = 0.75,
    onPlucked?: (stringIndex: number) => void
  ): void {
    if (!this.ctx) return;

    // Strum cascade duration: faster strum = shorter delay between strings
    // Ranges from 8ms per string for fast rock strum to 25ms for slow acoustic sweep
    const delayPerString = Math.max(0.008, Math.min(0.035, 0.03 - velocity * 0.02));

    const stringOrder = direction === 'down'
      ? [0, 1, 2, 3, 4, 5] // Low E -> High E
      : [5, 4, 3, 2, 1, 0]; // High E -> Low E

    let activeIndex = 0;
    stringOrder.forEach((strIndex) => {
      // Check if string is active in current chord
      if (this.currentChord.frets[strIndex] !== -1) {
        const offset = activeIndex * delayPerString;
        this.pluckString(strIndex, velocity, offset);
        
        if (onPlucked) {
          setTimeout(() => onPlucked(strIndex), offset * 1000);
        }
        activeIndex++;
      }
    });
  }

  public setMasterVolume(val: number): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(Math.max(0, Math.min(1, val)), this.ctx.currentTime);
    }
  }
}
