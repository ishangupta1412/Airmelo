/**
 * 1€ (One-Euro) Filter implementation for 1D and 3D signals.
 * Dynamically adjusts cutoff frequency based on derivative (velocity),
 * ensuring zero jitter when stationary and zero lag during fast motion.
 * 
 * References:
 * Casiez, G., Roussel, N., & Vogel, D. (2012). 1€ Filter: A simple speed-based low-pass filter
 * for noisy input in interactive systems. CHI 2012.
 */

export interface OneEuroConfig {
  minCutoff: number; // Minimum cutoff frequency in Hz (handles stationary jitter)
  beta: number;      // Speed coefficient (handles responsiveness during fast motion)
  dCutoff: number;   // Cutoff frequency for the derivative filter in Hz
}

export const DEFAULT_ONE_EURO_CONFIG: OneEuroConfig = {
  minCutoff: 0.8,    // 0.8 Hz produces rock-solid stability when stationary
  beta: 0.007,       // Smooth acceleration response without phase lag
  dCutoff: 1.0,      // Derivative filter cutoff
};

class LowPassFilter {
  private alpha: number = 1.0;
  private s: number | null = null;

  setAlpha(alpha: number): void {
    this.alpha = Math.max(0.0, Math.min(1.0, alpha));
  }

  filter(value: number): number {
    if (this.s === null) {
      this.s = value;
      return value;
    }
    this.s = this.alpha * value + (1.0 - this.alpha) * this.s;
    return this.s;
  }

  hasLast(): boolean {
    return this.s !== null;
  }

  last(): number {
    return this.s ?? 0;
  }

  reset(): void {
    this.s = null;
  }
}

export class OneEuroFilter1D {
  private config: OneEuroConfig;
  private xFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private lastTime: number | null = null;

  constructor(config: Partial<OneEuroConfig> = {}) {
    this.config = { ...DEFAULT_ONE_EURO_CONFIG, ...config };
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(value: number, timestamp: number = performance.now() / 1000): number {
    if (this.lastTime === null) {
      this.lastTime = timestamp;
      return this.xFilter.filter(value);
    }

    const dt = Math.max(1e-4, timestamp - this.lastTime);
    this.lastTime = timestamp;

    // Estimate derivative (velocity)
    const dx = this.xFilter.hasLast() ? (value - this.xFilter.last()) / dt : 0;
    this.dxFilter.setAlpha(this.alpha(this.config.dCutoff, dt));
    const edx = this.dxFilter.filter(dx);

    // Dynamic cutoff calculation
    const cutoff = this.config.minCutoff + this.config.beta * Math.abs(edx);
    this.xFilter.setAlpha(this.alpha(cutoff, dt));
    return this.xFilter.filter(value);
  }

  reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export class OneEuroFilter3D {
  private fx: OneEuroFilter1D;
  private fy: OneEuroFilter1D;
  private fz: OneEuroFilter1D;

  constructor(config: Partial<OneEuroConfig> = {}) {
    this.fx = new OneEuroFilter1D(config);
    this.fy = new OneEuroFilter1D(config);
    this.fz = new OneEuroFilter1D(config);
  }

  filter(vec: Vector3D, timestamp: number = performance.now() / 1000): Vector3D {
    return {
      x: this.fx.filter(vec.x, timestamp),
      y: this.fy.filter(vec.y, timestamp),
      z: this.fz.filter(vec.z, timestamp),
    };
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
  }
}
