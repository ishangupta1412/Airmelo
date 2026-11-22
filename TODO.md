# Airmelo Engineering Checklist (Ralph Loop)

## Phase 1: Foundation & Project Scaffolding
- [x] Create GitHub repository (`ishangupta1412/Airmelo`) and sync local git
- [x] Initialize Vite + React + TypeScript + Three.js + Lucide-react project
- [x] Configure Tailwind CSS & Anti-Slop Studio Dark Theme UI (Studio Design Taste)
- [x] Set up audio engine infrastructure (Web Audio API + Karplus-Strong string synthesis)

## Phase 2: Mathematics & Filter Engine (Zero Jitter)
- [x] Implement robust 3D One-Euro Filter (`OneEuroFilter3D`) with dynamic velocity cutoff
- [x] Implement Rigid-Body Kinematics & Quaternion Slerp orientator (`GuitarKinematics`)
- [x] Write automated unit tests for filter stability and quaternion interpolation (95.9% jitter reduction verified)

## Phase 3: 3D AR Scene & High-Fidelity Guitar Rendering
- [x] Build procedural 3D Acoustic Dreadnought Guitar model in Three.js (Body, Soundhole, Rosette, Neck, Frets, Inlays, 6 Individual Strings, Tuning Pegs, PBR Materials)
- [x] Implement real-time string vibration deformation (standing sine-wave harmonic deflection)
- [x] Configure studio PBR lighting, soft contact shadow-catcher plane, and camera backdrop

## Phase 4: Vision & Gesture Pipeline (MediaPipe 3D Hands + Pose)
- [x] Integrate webcam feed with MediaPipe Tasks Vision / Hands + Pose
- [x] Implement Torso Anchor binding (Chest pivot) and Left Hand Fret sliding rail
- [x] Implement Left Hand Chord recognition (Em, C, G, D, Am, F)
- [x] Implement Right Hand 3D Strumming Plane with velocity calculation & micro-strum cascade

## Phase 5: Spatial Room Persistence (The "Leave against Wall" Feature)
- [x] Build 3-State Machine: `HOLDING` -> `PLACED_RESTING` -> `PROXIMITY_HOVER`
- [x] Implement Grab & Release gesture triggers with smooth 150ms Hermite interpolation
- [x] Background feature anchor for room persistence when user exits camera frame

## Phase 6: Testing, Polish & Git Push
- [x] End-to-end testing of camera stream, audio latency, tracking stability, and visual performance
- [x] Production build verification (`npm run build` passing cleanly)
- [x] Commit and push clean milestone to GitHub repository
