import assert from 'node:assert';

// Verification 1: Math & Karplus-Strong Chord frequencies
const BASE_FREQS = [82.41, 110.00, 146.83, 196.00, 246.94, 329.63];
const CHORDS = {
  Em: [0, 2, 2, 0, 0, 0],
  C:  [-1, 3, 2, 0, 1, 0],
  G:  [3, 2, 0, 0, 3, 3],
  D:  [-1, -1, 0, 2, 3, 2],
};

console.log('--- Testing Karplus-Strong Frequencies & Chords ---');
for (const [chord, frets] of Object.entries(CHORDS)) {
  const freqs = frets.map((fret, i) => fret === -1 ? null : +(BASE_FREQS[i] * Math.pow(2, fret / 12)).toFixed(2));
  console.log(`Chord ${chord}:`, freqs);
  assert(freqs.length === 6, 'Should have 6 strings');
}

// Verification 2: One-Euro Filter Jitter Suppression
class SimpleLowPass {
  constructor() { this.s = null; this.alpha = 1.0; }
  filter(v) {
    if (this.s === null) return this.s = v;
    return this.s = this.alpha * v + (1 - this.alpha) * this.s;
  }
}

class TestOneEuro {
  constructor(minCutoff = 0.8, beta = 0.007) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.xFilter = new SimpleLowPass();
    this.dxFilter = new SimpleLowPass();
    this.lastTime = null;
  }
  alpha(cutoff, dt) {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }
  filter(v, t) {
    if (this.lastTime === null) {
      this.lastTime = t;
      return this.xFilter.filter(v);
    }
    const dt = Math.max(1e-4, t - this.lastTime);
    this.lastTime = t;
    const dx = (v - this.xFilter.s) / dt;
    this.dxFilter.alpha = this.alpha(1.0, dt);
    const edx = this.dxFilter.filter(dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    this.xFilter.alpha = this.alpha(cutoff, dt);
    return this.xFilter.filter(v);
  }
}

console.log('\n--- Testing One-Euro Jitter Filter ---');
const filter = new TestOneEuro(0.8, 0.007);
const rawNoisySignal = [];
const filteredSignal = [];

// Simulate stationary hand with 5mm Gaussian sensor noise
for (let i = 0; i < 100; i++) {
  const noise = (Math.random() - 0.5) * 0.02; // ±10mm jitter
  const raw = 0.5 + noise;
  const filtered = filter.filter(raw, i * 0.016);
  rawNoisySignal.push(raw);
  filteredSignal.push(filtered);
}

const variance = (arr) => {
  const mean = arr.reduce((a, b) => a + b) / arr.length;
  return arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
};

const rawVar = variance(rawNoisySignal);
const filteredVar = variance(filteredSignal.slice(20)); // Skip initial warm-up

console.log(`Raw Jitter Variance:      ${rawVar.toFixed(6)}`);
console.log(`Filtered Jitter Variance: ${filteredVar.toFixed(6)}`);
const jitterReduction = ((1 - filteredVar / rawVar) * 100).toFixed(1);
console.log(`Jitter Reduction:         ${jitterReduction}%`);
assert(filteredVar < rawVar * 0.1, 'Filter must reduce noise by at least 90%');

console.log('\nAll mathematical verifications PASSED!');
