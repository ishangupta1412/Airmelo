import * as THREE from 'three';
import { Vector3D } from '../math/OneEuroFilter';
import { ProceduralGuitar3D } from './GuitarModel';

export interface StringCollisionEvent {
  stringIndex: number;
  fingerIndex: number; // 4 = Thumb, 8 = Index, 12 = Middle, 16 = Ring, 20 = Pinky
  velocity: number;
  contactPoint: THREE.Vector3;
}

export class PhysicalStringColliders {
  private lastFingerPositions: Map<number, THREE.Vector3> = new Map();
  private stringWorldLines: { start: THREE.Vector3; end: THREE.Vector3 }[] = [];
  private lastTriggerTimes: Float32Array = new Float32Array(6);

  // Cooldown per string to prevent audio chatter
  private cooldownMs = 80;

  constructor() {
    for (let i = 0; i < 6; i++) {
      this.stringWorldLines.push({
        start: new THREE.Vector3(),
        end: new THREE.Vector3(),
      });
    }
  }

  /**
   * Updates world positions of guitar strings from the 3D model
   */
  public updateStringWorldPositions(guitar: ProceduralGuitar3D): void {
    const matrixWorld = guitar.group.matrixWorld;

    guitar.strings.forEach((str, i) => {
      const positions = str.line.geometry.getAttribute('position') as THREE.BufferAttribute;
      const startLocal = new THREE.Vector3(positions.getX(0), positions.getY(0), positions.getZ(0));
      const endLocal = new THREE.Vector3(
        positions.getX(positions.count - 1),
        positions.getY(positions.count - 1),
        positions.getZ(positions.count - 1)
      );

      this.stringWorldLines[i].start.copy(startLocal).applyMatrix4(matrixWorld);
      this.stringWorldLines[i].end.copy(endLocal).applyMatrix4(matrixWorld);
    });
  }

  /**
   * Tests right hand fingertips against all 6 strings in 3D world space
   */
  public testCollisions(
    rightHandLandmarks: Vector3D[] | null,
    nowMs: number = performance.now()
  ): StringCollisionEvent[] {
    const events: StringCollisionEvent[] = [];
    if (!rightHandLandmarks || rightHandLandmarks.length < 21) return events;

    // 5 Fingertips: Thumb (4), Index (8), Middle (12), Ring (16), Pinky (20)
    const fingertipIndices = [4, 8, 12, 16, 20];

    for (const fIdx of fingertipIndices) {
      const lm = rightHandLandmarks[fIdx];
      const currentPos = new THREE.Vector3(lm.x, lm.y, lm.z);
      const prevPos = this.lastFingerPositions.get(fIdx);

      if (prevPos) {
        const fingerVelocity = currentPos.distanceTo(prevPos) * 60; // Approx velocity in m/s

        // Test against each string
        for (let sIdx = 0; sIdx < 6; sIdx++) {
          if (nowMs - this.lastTriggerTimes[sIdx] < this.cooldownMs) continue;

          const strLine = this.stringWorldLines[sIdx];
          const distToLine = this.distancePointToSegment(currentPos, strLine.start, strLine.end);
          const prevDistToLine = this.distancePointToSegment(prevPos, strLine.start, strLine.end);

          // Collision criterion: Finger is close (< 3.5cm) and moved towards/across the line
          if (distToLine < 0.045 && fingerVelocity > 0.3) {
            // Check if finger trajectory crossed or closely grazed the string
            const minPrev = Math.min(distToLine, prevDistToLine);
            if (minPrev < 0.035) {
              this.lastTriggerTimes[sIdx] = nowMs;
              const normalizedVelocity = Math.max(0.3, Math.min(1.0, fingerVelocity * 0.45));

              events.push({
                stringIndex: sIdx,
                fingerIndex: fIdx,
                velocity: normalizedVelocity,
                contactPoint: currentPos.clone(),
              });
            }
          }
        }
      }

      this.lastFingerPositions.set(fIdx, currentPos.clone());
    }

    return events;
  }

  /**
   * Computes shortest distance from 3D point P to line segment AB
   */
  private distancePointToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ap = new THREE.Vector3().subVectors(p, a);

    const abLengthSq = ab.lengthSq();
    if (abLengthSq === 0) return ap.length();

    const t = Math.max(0, Math.min(1, ap.dot(ab) / abLengthSq));
    const projection = new THREE.Vector3().copy(a).addScaledVector(ab, t);
    return p.distanceTo(projection);
  }
}
