# Airmelo

> **Monocular Spatial Air Instruments Studio**  
> Hyper-realistic, zero-latency spatial instruments powered by WebGL/Three.js, MediaPipe 3D tracking, and Web Audio Digital Waveguide synthesis.

---

## Overview

Airmelo transforms any standard computer camera into a spatial musical instrument studio. Rather than simple 2D overlays, Airmelo treats virtual instruments as **persistent 3D physical objects in your physical room**:

- **Real-Time Kinematics & Grip:** Pick up instruments, hold them naturally with both hands, slide across fretboards, and strum with realistic dynamics.
- **Persistent Room Anchoring:** Lean your guitar against a real wall in your room, walk out of camera view, return, and pick it right back up.
- **Zero-Jitter Filtering:** Dual-stage adaptive One-Euro filtering ($1€$) guarantees rock-solid stability when stationary and zero lag during fast playing.
- **Physical Acoustic Synthesis:** Digital Waveguide Network (DWN) Karplus-Strong string synthesis with acoustic soundboard impulse responses, sub-15ms latency, and velocity-dependent harmonics.

---

## Core Architecture

```
                  ┌─────────────────────────────────────────┐
                  │          Monocular Camera Input         │
                  │              (720p @ 60 FPS)            │
                  └────────────────────┬────────────────────┘
                                       │
        ┌──────────────────────────────┴──────────────────────────────┐
        │                                                             │
┌───────▼─────────────────────────────┐             ┌─────────────────▼─────────────────┐
│     Spatial Perception Engine       │             │       Acoustic Synthesis Engine   │
│  ├─ MediaPipe 3D Pose & Hands       │             │  ├─ Web Audio AudioWorklet (<8ms) │
│  ├─ 1€ Adaptive Jitter Suppression  │             │  ├─ Digital Waveguide (DWN)       │
│  ├─ Single-Parent Torso Rigid IK    │             │  ├─ Dynamic Velocity Strum Engine │
│  └─ 6-DoF Room Persistence Anchor   │             │  └─ Martin D-28 Body Resonance IR │
└───────────────────────┬─────────────┘             └─────────────────┬─────────────────┘
                        │                                             │
                        └──────────────────────┬──────────────────────┘
                                               │
                                ┌──────────────▼──────────────┐
                                │   Three.js 3D PBR Canvas    │
                                │   & Real-time AR Compositor │
                                └─────────────────────────────┘
```

---

## Roadmap

- [x] Master System Architecture & Biomechanical Formulation
- [ ] Core Workspace & High-Performance WebGL/WebGPU Foundation
- [ ] 3D Acoustic & Electric Guitar Models with PBR Shading
- [ ] Dual-Stage One-Euro Filter & Rigid Torso IK Solver
- [ ] AudioWorklet Karplus-Strong Physical String Modeling
- [ ] Strum Plane Crossing & Chord Topology Recognition
- [ ] Persistent 6-DoF Wall/Floor Placement & Re-Grip State Machine
- [ ] Future Instruments: Air Drums, Air Piano, Air Violin

---

## License

Apache-2.0
