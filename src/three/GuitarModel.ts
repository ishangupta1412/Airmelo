import * as THREE from 'three';

export interface GuitarStringMesh {
  index: number;
  line: THREE.Line;
  originalPositions: Float32Array;
  vibrationPhase: number;
  vibrationAmplitude: number;
  decayRate: number;
}

export class ProceduralGuitar3D {
  public group: THREE.Group = new THREE.Group();
  public strings: GuitarStringMesh[] = [];
  public soundholePosition: THREE.Vector3 = new THREE.Vector3();
  public bridgePosition: THREE.Vector3 = new THREE.Vector3();
  public nutPosition: THREE.Vector3 = new THREE.Vector3();

  // PBR Materials
  private woodTopMaterial!: THREE.MeshStandardMaterial;
  private woodBackMaterial!: THREE.MeshStandardMaterial;
  private neckMaterial!: THREE.MeshStandardMaterial;
  private fretboardMaterial!: THREE.MeshStandardMaterial;
  private metalMaterial!: THREE.MeshStandardMaterial;
  private goldTunerMaterial!: THREE.MeshStandardMaterial;
  private pickguardMaterial!: THREE.MeshStandardMaterial;

  constructor() {
    this.initMaterials();
    this.buildGuitar();
  }

  private initMaterials(): void {
    // Acoustic Spruce Top (Warm natural satin lacquer)
    this.woodTopMaterial = new THREE.MeshStandardMaterial({
      color: 0xd9b382,
      roughness: 0.35,
      metalness: 0.05,
    });

    // Mahogany Back & Sides (Deep rich red-brown)
    this.woodBackMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a2411,
      roughness: 0.4,
      metalness: 0.05,
    });

    // Mahogany Neck
    this.neckMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a2d18,
      roughness: 0.45,
      metalness: 0.02,
    });

    // Rosewood / Ebony Fretboard
    this.fretboardMaterial = new THREE.MeshStandardMaterial({
      color: 0x1f1916,
      roughness: 0.7,
      metalness: 0.0,
    });

    // Nickel / Chrome Frets
    this.metalMaterial = new THREE.MeshStandardMaterial({
      color: 0xdddddd,
      roughness: 0.2,
      metalness: 0.9,
    });

    // Gold / Chrome Tuning Pegs
    this.goldTunerMaterial = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.15,
      metalness: 0.95,
    });

    // Tortoise / Black Pickguard
    this.pickguardMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.2,
      metalness: 0.1,
    });
  }

  private buildGuitar(): void {
    // Standard scale dimensions:
    // Scale length: 650mm = 0.65m.
    // Guitar orientation: Body at origin (0,0,0), Neck extends along +X axis towards (+0.65, 0, 0).
    
    // 1. Build Acoustic Dreadnought Body
    this.buildBody();

    // 2. Build Neck & Fretboard
    this.buildNeckAndFretboard();

    // 3. Build Headstock & Tuning Pegs
    this.buildHeadstock();

    // 4. Build Bridge, Saddle & Soundhole
    this.buildBridgeAndSoundhole();

    // 5. Build 6 Individual Strings
    this.buildStrings();

    // Center pivot naturally at the soundhole / right forearm area
    this.group.position.set(0, 0, 0);
  }

  private buildBody(): void {
    // Classic Acoustic Figure-8 Body Shape using ExtrudeGeometry
    const shape = new THREE.Shape();
    
    // Contoured acoustic outline: Lower bout, waist, upper bout
    // Measurements normalized around 0.48m long, 0.38m wide
    shape.moveTo(-0.25, 0);
    shape.bezierCurveTo(-0.25, 0.18, -0.12, 0.20, 0.0, 0.13);  // Lower bout to waist
    shape.bezierCurveTo(0.08, 0.10, 0.15, 0.15, 0.22, 0.11);   // Waist to upper bout
    shape.bezierCurveTo(0.26, 0.08, 0.26, -0.08, 0.22, -0.11); // Top edge to other side
    shape.bezierCurveTo(0.15, -0.15, 0.08, -0.10, 0.0, -0.13); // Upper bout to waist
    shape.bezierCurveTo(-0.12, -0.20, -0.25, -0.18, -0.25, 0); // Waist to lower bout

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      steps: 2,
      depth: 0.11, // 11cm body depth
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 4,
    };

    const bodyGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Center depth so Z=0 is the top soundboard surface
    bodyGeometry.translate(0, 0, -0.118);

    const bodyMesh = new THREE.Mesh(bodyGeometry, [this.woodTopMaterial, this.woodBackMaterial]);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.group.add(bodyMesh);

    // Pickguard
    const pgShape = new THREE.Shape();
    pgShape.moveTo(0.02, -0.02);
    pgShape.bezierCurveTo(0.04, -0.08, 0.12, -0.09, 0.14, -0.03);
    pgShape.bezierCurveTo(0.12, -0.01, 0.06, -0.01, 0.02, -0.02);
    const pgGeom = new THREE.ShapeGeometry(pgShape);
    const pgMesh = new THREE.Mesh(pgGeom, this.pickguardMaterial);
    pgMesh.position.set(0, 0, 0.001);
    this.group.add(pgMesh);
  }

  private buildBridgeAndSoundhole(): void {
    // Soundhole (Rosette ring + dark recessed cavity)
    this.soundholePosition.set(0.07, 0, 0);

    // Rosette decorative rings
    const rosetteGeom = new THREE.RingGeometry(0.042, 0.052, 48);
    const rosetteMat = new THREE.MeshStandardMaterial({
      color: 0x221711,
      roughness: 0.5,
    });
    const rosetteMesh = new THREE.Mesh(rosetteGeom, rosetteMat);
    rosetteMesh.position.copy(this.soundholePosition);
    rosetteMesh.position.z += 0.0008;
    this.group.add(rosetteMesh);

    // Inner dark soundhole cavity
    const soundholeGeom = new THREE.CircleGeometry(0.042, 48);
    const soundholeMat = new THREE.MeshBasicMaterial({ color: 0x050403 });
    const soundholeMesh = new THREE.Mesh(soundholeGeom, soundholeMat);
    soundholeMesh.position.copy(this.soundholePosition);
    soundholeMesh.position.z += 0.0005;
    this.group.add(soundholeMesh);

    // Wooden Bridge
    this.bridgePosition.set(-0.11, 0, 0.005);
    const bridgeGeom = new THREE.BoxGeometry(0.035, 0.13, 0.012);
    const bridgeMesh = new THREE.Mesh(bridgeGeom, this.fretboardMaterial);
    bridgeMesh.position.copy(this.bridgePosition);
    bridgeMesh.castShadow = true;
    this.group.add(bridgeMesh);

    // White Bone Saddle
    const saddleGeom = new THREE.BoxGeometry(0.006, 0.09, 0.014);
    const saddleMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.3 });
    const saddleMesh = new THREE.Mesh(saddleGeom, saddleMat);
    saddleMesh.position.set(this.bridgePosition.x + 0.005, 0, 0.008);
    this.group.add(saddleMesh);
  }

  private buildNeckAndFretboard(): void {
    const neckLength = 0.44;
    const neckStartX = 0.22; // Joins body at 14th fret
    const nutX = neckStartX + neckLength; // Nut position
    this.nutPosition.set(nutX, 0, 0.01);

    // Rounded Neck Profile (C-Shape)
    const neckGeom = new THREE.CylinderGeometry(0.024, 0.028, neckLength, 16, 1, false, 0, Math.PI);
    neckGeom.rotateZ(-Math.PI / 2);
    neckGeom.rotateX(Math.PI);
    const neckMesh = new THREE.Mesh(neckGeom, this.neckMaterial);
    neckMesh.position.set(neckStartX + neckLength / 2, 0, -0.008);
    neckMesh.castShadow = true;
    this.group.add(neckMesh);

    // Rosewood Fretboard slab
    const fbGeom = new THREE.BoxGeometry(neckLength, 0.052, 0.006);
    const fbMesh = new THREE.Mesh(fbGeom, this.fretboardMaterial);
    fbMesh.position.set(neckStartX + neckLength / 2, 0, 0.003);
    fbMesh.castShadow = true;
    this.group.add(fbMesh);

    // Nickel Frets (21 Frets with logarithmic spacing)
    // Scale length = 0.65m. Fret d = L - (L / 2^(n/12))
    const scaleLength = 0.65;
    for (let n = 1; n <= 21; n++) {
      const distFromNut = scaleLength * (1 - Math.pow(2, -n / 12));
      const fretX = nutX - distFromNut;

      if (fretX >= neckStartX - 0.05) {
        const fretGeom = new THREE.BoxGeometry(0.0016, 0.05, 0.002);
        const fretMesh = new THREE.Mesh(fretGeom, this.metalMaterial);
        fretMesh.position.set(fretX, 0, 0.007);
        this.group.add(fretMesh);

        // Fret Position Inlay Dots (3, 5, 7, 9, 12, 15, 17, 19)
        if ([3, 5, 7, 9, 15, 17, 19].includes(n)) {
          this.createInlayDot(fretX + 0.012, 0);
        } else if (n === 12) {
          // Double dots at 12th fret
          this.createInlayDot(fretX + 0.012, 0.012);
          this.createInlayDot(fretX + 0.012, -0.012);
        }
      }
    }

    // Bone Nut
    const nutGeom = new THREE.BoxGeometry(0.008, 0.052, 0.01);
    const nutMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.3 });
    const nutMesh = new THREE.Mesh(nutGeom, nutMat);
    nutMesh.position.set(nutX, 0, 0.008);
    this.group.add(nutMesh);
  }

  private createInlayDot(x: number, y: number): void {
    const dotGeom = new THREE.CircleGeometry(0.003, 16);
    const dotMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.2 });
    const dotMesh = new THREE.Mesh(dotGeom, dotMat);
    dotMesh.position.set(x, y, 0.0065);
    this.group.add(dotMesh);
  }

  private buildHeadstock(): void {
    const headstockLength = 0.16;
    const nutX = this.nutPosition.x;

    // Angled Headstock (14 degree backward pitch for string break angle)
    const hsGeom = new THREE.BoxGeometry(headstockLength, 0.065, 0.015);
    const hsMesh = new THREE.Mesh(hsGeom, this.woodTopMaterial);
    hsMesh.position.set(nutX + headstockLength / 2, 0, -0.006);
    hsMesh.rotation.y = 0.18; // ~10-14 degree break angle
    hsMesh.castShadow = true;
    this.group.add(hsMesh);

    // 6 Chrome Tuning Pegs (3 per side)
    for (let i = 0; i < 3; i++) {
      const pegX = nutX + 0.04 + i * 0.045;
      
      // Top row (+Y)
      this.createTuner(pegX, 0.038, hsMesh.rotation.y);
      // Bottom row (-Y)
      this.createTuner(pegX, -0.038, hsMesh.rotation.y);
    }
  }

  private createTuner(x: number, y: number, angleY: number): void {
    const postGeom = new THREE.CylinderGeometry(0.003, 0.003, 0.02, 12);
    postGeom.rotateX(Math.PI / 2);
    const postMesh = new THREE.Mesh(postGeom, this.goldTunerMaterial);
    postMesh.position.set(x, y, 0.004);
    postMesh.rotation.y = angleY;
    this.group.add(postMesh);

    // Peg Button
    const btnGeom = new THREE.BoxGeometry(0.006, 0.016, 0.006);
    const btnMesh = new THREE.Mesh(btnGeom, this.goldTunerMaterial);
    btnMesh.position.set(x, y > 0 ? y + 0.015 : y - 0.015, 0.004);
    btnMesh.rotation.y = angleY;
    this.group.add(btnMesh);
  }

  private buildStrings(): void {
    const bridgeX = this.bridgePosition.x + 0.005;
    const nutX = this.nutPosition.x;
    const bridgeZ = 0.013;
    const nutZ = 0.011;

    // 6 Strings: String 0 = Low E (-Y or +Y depending on orientation, standard guitar 35mm spread at bridge)
    const bridgeWidth = 0.052;
    const nutWidth = 0.038;

    this.strings = [];

    for (let i = 0; i < 6; i++) {
      const t = i / 5.0; // 0.0 (Low E) to 1.0 (High E)
      const startY = (t - 0.5) * bridgeWidth;
      const endY = (t - 0.5) * nutWidth;

      // 64-segment Line for smooth sinusoidal vibration deformation
      const segments = 48;
      const positions = new Float32Array(segments * 3);

      for (let s = 0; s < segments; s++) {
        const u = s / (segments - 1);
        const x = bridgeX + u * (nutX - bridgeX);
        const y = startY + u * (endY - startY);
        const z = bridgeZ + u * (nutZ - bridgeZ);

        positions[s * 3 + 0] = x;
        positions[s * 3 + 1] = y;
        positions[s * 3 + 2] = z;
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      // Color/Glint: Thicker wound strings look warmer gold/brass; thinner strings look silver
      const stringColor = i < 3 ? 0xd4af37 : 0xe8e8e8;
      const lineMat = new THREE.LineBasicMaterial({
        color: stringColor,
        linewidth: 1.5,
      });

      const line = new THREE.Line(geom, lineMat);
      this.group.add(line);

      this.strings.push({
        index: i,
        line,
        originalPositions: positions.slice(),
        vibrationPhase: 0,
        vibrationAmplitude: 0,
        decayRate: 0.94 - i * 0.01,
      });
    }
  }

  /**
   * Triggers visual harmonic vibration when a string is plucked
   */
  public vibrateString(stringIndex: number, velocity: number = 0.8): void {
    if (this.strings[stringIndex]) {
      // Max amplitude in virtual meters (~3mm max visual deflection)
      this.strings[stringIndex].vibrationAmplitude = Math.min(0.005, 0.0015 + velocity * 0.0035);
      this.strings[stringIndex].vibrationPhase = 0;
    }
  }

  /**
   * Updates string vibration animations per frame
   */
  public update(deltaTime: number): void {
    for (const str of this.strings) {
      if (str.vibrationAmplitude > 0.0001) {
        str.vibrationPhase += deltaTime * 120.0; // Oscillation speed
        str.vibrationAmplitude *= Math.pow(str.decayRate, deltaTime * 60);

        const posAttr = str.line.geometry.getAttribute('position') as THREE.BufferAttribute;
        const positions = posAttr.array as Float32Array;
        const segments = positions.length / 3;

        for (let s = 0; s < segments; s++) {
          const u = s / (segments - 1);
          // Fundamental standing wave: sin(pi * u)
          const standingWave = Math.sin(Math.PI * u);
          // High harmonic: sin(2 * pi * u)
          const harmonic = Math.sin(2 * Math.PI * u + str.vibrationPhase * 1.5) * 0.25;

          const deflection = (standingWave + harmonic) * Math.sin(str.vibrationPhase) * str.vibrationAmplitude;

          // Deflect along Y and Z axis
          positions[s * 3 + 1] = str.originalPositions[s * 3 + 1] + deflection;
          positions[s * 3 + 2] = str.originalPositions[s * 3 + 2] + deflection * 0.5;
        }

        posAttr.needsUpdate = true;
      }
    }
  }
}
