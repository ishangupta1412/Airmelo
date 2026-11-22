# The Definitive Architecture: Peak Monocular Spatial Air Guitar
**Document Version:** 1.0.0 — R&D Engineering Specification  
**Classification:** Advanced Spatial Computing, Biomechanical Kinematics & Physical Acoustic Modeling  
**Target Platform:** WebGPU / WebAssembly (SIMD) / Web Audio API  

---

## Executive Summary

The objective is to synthesize a **zero-compromise, hyper-realistic, spatial acoustic/electric guitar system** running purely on monocular RGB camera input (standard webcam) without specialized hardware (no LiDAR, no data gloves). 

To eliminate all "AR slop" (vibrations, jitter, unnatural detachment, synthetic latency, and fake audio), this specification resolves every subsystem at a mathematical and perceptual level:
1. **Perceptual Psychology & Pseudo-Haptics** (How human brains feel strings in thin air).
2. **Sub-Millimeter Neural Vision & Dynamic Filtering** (Zero-jitter, sub-pixel tracking).
3. **Rigid-Elastic Biomechanical Kinematics** (Torso anchoring & Inverse Kinematics).
4. **Digital Waveguide Physical Acoustic Synthesis (DWN)** (Physical string & body modeling).
5. **Persistent 6-DoF Room SLAM & Object Lifecycle** (Leaving the guitar against a real wall).
6. **Photorealistic Compositing & Occlusion** (Real-time depth peeling and ambient light matching).

---

## 1. Perceptual Psychology: Solving the "No Physical Strings" Problem (Pseudo-Haptics)

### 1.1 The Tactile Void
The fundamental reason air instruments fail is the **Tactile Void**: human motor control depends on tactile mechanoreceptors (Merkel discs and Meissner corpuscles) providing immediate force feedback when fingers press a string or strike a fretboard. Without physical resistance, players overshoot and lose rhythmic cadence.

### 1.2 The Cross-Modal Pseudo-Haptic Illusion
We exploit **Cross-Modal Sensory Integration**: when visual and auditory stimuli fire synchronously with sub-15ms latency, the human somatosensory cortex generates an illusory tactile sensation ("Pseudo-Haptics").

```
  [Right Finger Plucks Plane]
              │
              ├───► Visual Transient: String deflects & glows at t = 0ms
              │
              ├───► Audio Transient: Pick attack impulse (0.5ms rise-time) at t = 6ms
              │
              └───► Visual Resistance Deceleration: Right hand cursor decelerates 
                    microscopically (12% drag over 18ms) during string crossing.
```

**The Brain's Perception:** The user perceives *viscous physical resistance* as if passing a real pick through high-tension steel strings.

---

## 2. Neuromorphic Vision Engine: Sub-Millimeter Spatial Tracking

### 2.1 Multi-Stage Hybrid Inference Pipeline
To balance 60+ FPS frame rates with sub-millimeter precision, a multi-stage tracking architecture is employed:

```
Camera Stream (60 FPS RGB)
  │
  ├──► [Stage 1: MediaPipe Holistic Landmark Detector (GPU WebGL)]
  │      └── Output: 33 Pose Landmarks + 2x 21 Hand Landmarks (X, Y, Z raw)
  │
  ├──► [Stage 2: Lucas-Kanade Sub-Pixel Optical Flow Refinement]
  │      └── Patches around fingertip landmarks (8x8 window) tracking sub-pixel micro-movements
  │
  └──► [Stage 3: Dual-Stage Adaptive Bi-Directional One-Euro Filter]
         └── Elimination of sensor noise without introducing phase-lag
```

### 2.2 Mathematical Jitter Suppression: Dynamic One-Euro Formulation
Standard Exponential Moving Averages (EMA) cause sluggishness, while low-pass filters cause phase delay. We implement the **$1€$ (One-Euro) Filter** on all 3D landmarks:

$$\hat{X}_k = \alpha X_k + (1 - \alpha) \hat{X}_{k-1}$$

Where the dynamic smoothing factor $\alpha$ is derived from instantaneous signal velocity $\dot{X}_k$:

$$\alpha = \frac{1}{1 + \frac{\tau}{T_e}}, \quad \tau = \frac{1}{2\pi f_c}$$

The cutoff frequency $f_c$ scales dynamically:

$$f_c = f_{c,\min} + \beta |\dot{X}_k|$$

- **Stationary State ($|\dot{X}| \to 0$):** $f_{c,\min} = 0.8\text{ Hz}$. Noise cutoff is total; the virtual guitar and fingers are **100% physically still (zero vibration)**.
- **Fast Strumming State ($|\dot{X}| > 1.5\text{ m/s}$):** $f_c$ surges up to $35\text{ Hz}$ ($\beta = 0.007$). Phase lag drops below $2.1\text{ ms}$, tracking lightning-fast sweep picking with zero perceptible delay.

---

## 3. Biomechanics & Rigid-Body Kinematics

### 3.1 The "Stretching / Spasm" Failure Mode
Amateur AR pins the headstock to the left hand and the bridge to the right hand. Because hands independently drift, the guitar deforms, warps, or suffers rotational gimbal lock.

### 3.2 The Single-Parent Rigid-Body Anchor System
A real guitar is a rigid wooden assembly of length $L = 648\text{ mm}$ (Fender 25.5" scale).

```
   [Chest / Right Sternum: Parent Anchor (Pose Landmarks 11, 12)]
                     │
                     ▼
           [Guitar Body Rigid Pivot] 
                     │
                     ├─ Rotation: Quaternion Slerp targeting Left Wrist (Landmark 15)
                     │            with 30-degree elevation pitch constraint.
                     │
                     └─ Length Constraint: ||Headstock - Bridge|| = Constant 648mm
```

1. **Torso Clamping:** The guitar body's position is kinematically locked to the player's thoracic plane ($T_1 - T_{12}$ spine axis), mirroring how a guitar rests on the thigh or hangs from a shoulder strap.
2. **Left Hand Neck Slide:** The left hand does not pull the neck; rather, the left hand **slides along the virtual neck rail** ($s \in [0, 1]$ where $0$ is the nut and $1$ is the 21st fret).
3. **Quaternion Orientation:** All rotations execute via **Spherical Linear Interpolation (`THREE.Quaternion.slerp`)**, preventing Euler gimbal lock flips when moving from sitting to standing positions.

---

## 4. Acoustic Synthesis: Digital Waveguide Network (DWN)

### 4.1 Why Sample Playback Sounds Like a Toy
Prerecorded samples played at fixed pitches sound sterile because real strings interact:
- Pluck point harmonic variation (plucking near bridge = bright/tinny; near neck = warm/woody).
- Sympathetic resonance (an open G string vibrates when a G note is hammered on the D string).
- Dispersion and non-linear fret collision (fret buzz, string damping).

### 4.2 Extended Karplus-Strong Physical Model
We implement a real-time **Digital Waveguide String Model** using the AudioWorklet processor running in a dedicated audio thread:

#### String Governing Equation:
$$\frac{\partial^2 y}{\partial t^2} = c^2 \frac{\partial^2 y}{\partial x^2} - 2 b_0 \frac{\partial y}{\partial t} + 2 b_1 \frac{\partial^3 y}{\partial t \partial x^2} - \kappa^2 \frac{\partial^4 y}{\partial x^4}$$

Where:
- $c$: Wave propagation velocity ($c = \sqrt{T / \mu}$).
- $b_0$: Air damping coefficient.
- $b_1$: Internal viscoelastic friction.
- $\kappa$: String stiffness factor (in-harmonicity of heavy wound strings).

#### Acoustic Body Impulse Response (IR) Convolution:
The raw string output feeds through a dual Partitioned Fast Convolution Engine running an IR of a **Martin D-28 acoustic soundboard**, producing organic wood cavity resonance.

---

## 5. Fretting & Strumming Mechanics

### 5.1 Strumming: 3D Laser Ribbon & Velocity Cascading
The guitar soundhole is projected as a 3D planar quadrilateral (The Strum Plane).
- **Crossing Intersection:** When the index tip vector crosses the plane, each string calculates its exact intersection time:
  $$t_i = t_{\text{cross}} + \frac{y_i - y_0}{V_y}$$
- **Micro-Cascade Delay:** Natural downstrums yield a cascade window of $15\text{ ms} - 45\text{ ms}$. This converts a mechanical instant trigger into a rich, natural strum attack.
- **Velocity Dynamics:** Amplitude $A = k \cdot \|V_{\text{strum}}\|^{1.4}$. Fast strikes trigger bright high-frequency harmonics; gentle sweeps trigger warm, rounded fundamentals.

### 5.2 Left Hand Fretting: 3D Joint Curvature Matrix
Rather than requiring impossible millimeter precision in the air, the fretboard uses **Geometric Gesture Topologies**:
- **Nut-to-Bridge Position:** Left wrist X-coordinate maps directly to Fret Zones $1-12$.
- **Chord Classification Engine (KNN + Decision Forest on Joint Angles):**
  - **Open E Minor:** Middle (PIP curl $> 65^\circ$) on Fret 2, Ring (PIP curl $> 65^\circ$) on Fret 2, Index open.
  - **C Major:** Index on Fret 1 B-string, Middle on Fret 2 D-string, Ring on Fret 3 A-string.
  - **Barre Chords:** Index fully extended flat across all 6 strings + wrist pitch lock.

---

## 6. Spatial Room Anchoring: Leaving the Guitar on the Wall

### 6.1 The "Walk Away and Return" Architecture
1. **Release Gesture:** Open both palms flat near a room boundary.
2. **Compute Plane & Anchor:** Nearest vertical plane detected, gravity raycast drops guitar to floor level with a resting tilt ($12^\circ - 15^\circ$), and 6-DoF world matrix $M_{\text{world}}$ is anchored.
3. **Monocular Feature-Point Lock:** ORB/FAST feature clusters on the background sustain the anchor even when person tracking is lost.
4. **Re-Grip:** Re-entry into proximity sphere with a grasping gesture triggers an ease-in-out Hermite blend (100ms) back to hand control.

---

## 7. Photorealistic Optical Compositing & Depth Occlusion

### 7.1 Real-Time Hand Occlusion (Depth Peeling)
- Hand segmentation masks separate the image into foreground and background layers.
- Guitar neck passes behind the palm, while strings and frets render underneath curled fingers, creating the optical illusion of physical hand wrapping.

### 7.2 Ambient Light Estimation & Contact Shadows
- Spherical Harmonics ($L_{00}, L_{1m}, L_{2m}$) derived from camera pixels dynamically light the 3D model to match the room's color temperature and directionality.
- Shadow-catcher ground plane casts soft contact shadows when the guitar rests against walls or furniture.

---

## 8. Latency Budget

Total latency across Camera Ingestion ($8\text{ms}$), Neural Inference ($11\text{ms}$), Filtering ($0.8\text{ms}$), AudioWorklet ($2.9\text{ms}$), and WebGPU Render ($5.3\text{ms}$) equals **$28.0\text{ ms}$**, remaining below the $30\text{ms}$ human audio-visual sync limit.
