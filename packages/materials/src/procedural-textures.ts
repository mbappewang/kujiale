import * as THREE from 'three';
import type { PbrMaterialSpec } from './catalog';

export interface SynthesizedTextureSet {
  albedoMap: THREE.DataTexture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
  aoMap: THREE.DataTexture;
}

function hash2D(ix: number, iy: number): number {
  const n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  const m = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((m ^ (m >>> 16)) >>> 0) / 4294967295;
}

function valueNoiseTileable(u: number, v: number, freq: number): number {
  const x = u * freq;
  const y = v * freq;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const fInt = Math.max(1, Math.round(freq));
  const x0 = ((ix % fInt) + fInt) % fInt;
  const x1 = (x0 + 1) % fInt;
  const y0 = ((iy % fInt) + fInt) % fInt;
  const y1 = (y0 + 1) % fInt;

  const n00 = hash2D(x0, y0);
  const n10 = hash2D(x1, y0);
  const n01 = hash2D(x0, y1);
  const n11 = hash2D(x1, y1);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function fbmTileable(u: number, v: number, baseFreq: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = baseFreq;
  for (let i = 0; i < 4; i++) {
    sum += amp * valueNoiseTileable(u, v, freq);
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function mixRgb(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number,
): [number, number, number] {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * k),
    Math.round(c1[1] + (c2[1] - c1[1]) * k),
    Math.round(c1[2] + (c2[2] - c1[2]) * k),
  ];
}

export function synthesizePbrTextures(
  spec: PbrMaterialSpec,
  resolution = 256,
): SynthesizedTextureSet {
  const size = Math.max(64, Math.min(1024, resolution));
  const totalPixels = size * size;
  const albedoBytes = new Uint8Array(totalPixels * 4);
  const roughnessBytes = new Uint8Array(totalPixels * 4);
  const aoBytes = new Uint8Array(totalPixels * 4);
  const normalBytes = new Uint8Array(totalPixels * 4);
  const heightField = new Float32Array(totalPixels);

  const c1 = hexToRgb(spec.baseColorHex);
  const c2 = hexToRgb(spec.secondaryColorHex);

  for (let py = 0; py < size; py++) {
    const v = py / size;
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const idx = py * size + px;

      let toneMix = 0.25;
      let height = 0.5;
      let roughMod = spec.roughness;
      let ao = 1.0;

      switch (spec.pattern) {
        case 'wood_planks': {
          const planksAcross = 8;
          const plankCol = Math.floor(u * planksAcross);
          const localU = (u * planksAcross) % 1;
          const stagger = hash2D(plankCol, 17) * 0.5;
          const localV = (v * 2 + stagger) % 1;
          const seam = localU < 0.025 || localU > 0.975 || localV < 0.012 || localV > 0.988;
          const plankTint = (hash2D(plankCol, Math.floor(v * 2 + stagger)) - 0.5) * 0.22;
          const grain =
            Math.sin((v * 22 + fbmTileable(u, v, 6) * 1.4) * Math.PI * 2) * 0.5 + 0.5;
          const fineGrain = valueNoiseTileable(u, v, 48);
          toneMix = Math.max(0, Math.min(1, grain * 0.55 + fineGrain * 0.2 + plankTint + 0.15));
          height = seam ? 0.08 : 0.65 + grain * 0.2 + fineGrain * 0.15;
          roughMod = seam ? 0.88 : spec.roughness + (1 - grain) * 0.08;
          ao = seam ? 0.55 : 0.98;
          break;
        }
        case 'ceramic_tiles': {
          const grid = 2;
          const lu = (u * grid) % 1;
          const lv = (v * grid) % 1;
          const grout = lu < 0.018 || lu > 0.982 || lv < 0.018 || lv > 0.982;
          const cloud = fbmTileable(u, v, 8);
          toneMix = grout ? 0.9 : cloud * 0.45;
          height = grout ? 0.12 : 0.82 + cloud * 0.12;
          roughMod = grout ? 0.92 : spec.roughness + cloud * 0.06;
          ao = grout ? 0.62 : 1.0;
          break;
        }
        case 'terrazzo': {
          const chipNoise = valueNoiseTileable(u, v, 28);
          const chip2 = valueNoiseTileable(u + 0.33, v + 0.71, 40);
          const isChip = chipNoise > 0.72 || chip2 > 0.78;
          toneMix = isChip ? 0.78 : fbmTileable(u, v, 6) * 0.2;
          height = isChip ? 0.56 : 0.52;
          roughMod = isChip ? spec.roughness * 0.8 : spec.roughness;
          ao = 0.98;
          break;
        }
        case 'marble_veins': {
          const warp = fbmTileable(u, v, 5);
          const vein = Math.pow(1 - Math.abs(Math.sin((u * 2 + v + warp * 1.8) * Math.PI)), 6);
          toneMix = vein * 0.85 + warp * 0.15;
          height = 0.6 - vein * 0.12;
          roughMod = spec.roughness + vein * 0.06;
          ao = 0.99;
          break;
        }
        case 'brick_bond': {
          const rows = 14;
          const cols = 5;
          const rowIdx = Math.floor(v * rows);
          const rowV = (v * rows) % 1;
          const offset = (rowIdx % 2) * 0.5;
          const colU = (u * cols + offset) % 1;
          const colIdx = Math.floor(u * cols + offset);
          const mortar = rowV < 0.12 || rowV > 0.92 || colU < 0.045 || colU > 0.955;
          const brickVar = (hash2D(colIdx, rowIdx) - 0.5) * 0.28;
          const roughTex = fbmTileable(u, v, 24);
          toneMix = mortar ? 0.95 : Math.max(0, Math.min(0.65, roughTex * 0.35 + brickVar + 0.2));
          height = mortar ? 0.1 : 0.75 + roughTex * 0.22;
          roughMod = mortar ? 0.95 : spec.roughness;
          ao = mortar ? 0.58 : 0.96;
          break;
        }
        case 'concrete_aggregate': {
          const macro = fbmTileable(u, v, 6);
          const micro = valueNoiseTileable(u, v, 42);
          toneMix = macro * 0.55 + micro * 0.3;
          height = 0.4 + macro * 0.25 + micro * 0.35;
          roughMod = spec.roughness + (micro - 0.5) * 0.12;
          ao = 0.9 + micro * 0.1;
          break;
        }
        case 'woven_fabric': {
          const threads = 48;
          const warpThread = Math.sin(u * threads * Math.PI * 2) * 0.5 + 0.5;
          const weftThread = Math.sin(v * threads * Math.PI * 2) * 0.5 + 0.5;
          const weave = (warpThread + weftThread) * 0.5;
          const mottling = fbmTileable(u, v, 8);
          toneMix = weave * 0.45 + mottling * 0.35;
          height = 0.35 + weave * 0.55;
          roughMod = spec.roughness;
          ao = 0.84 + weave * 0.16;
          break;
        }
        case 'pebble_leather': {
          const grain = valueNoiseTileable(u, v, 36);
          const crease = fbmTileable(u, v, 10);
          toneMix = grain * 0.4 + crease * 0.35;
          height = 0.4 + grain * 0.45;
          roughMod = spec.roughness + (1 - grain) * 0.1;
          ao = 0.9 + grain * 0.1;
          break;
        }
        case 'grass_turf': {
          const patch = fbmTileable(u, v, 6);
          const blades = valueNoiseTileable(u, v, 64);
          toneMix = patch * 0.5 + blades * 0.45;
          height = 0.2 + blades * 0.8;
          roughMod = spec.roughness;
          ao = 0.72 + blades * 0.28;
          break;
        }
        case 'corrugated_metal': {
          const ribs = 12;
          const wave = Math.sin(u * ribs * Math.PI * 2) * 0.5 + 0.5;
          toneMix = (1 - wave) * 0.35;
          height = wave;
          roughMod = spec.roughness + (1 - wave) * 0.06;
          ao = 0.75 + wave * 0.25;
          break;
        }
        case 'terracotta_tiles': {
          const cols = 8;
          const rows = 6;
          const cu = (u * cols) % 1;
          const rv = (v * rows) % 1;
          const arch = Math.sin(cu * Math.PI);
          const overlap = rv < 0.08 ? 0.2 : 1.0;
          toneMix = (1 - arch) * 0.4 + fbmTileable(u, v, 12) * 0.25;
          height = arch * 0.75 * overlap;
          roughMod = spec.roughness;
          ao = rv < 0.08 ? 0.55 : 0.8 + arch * 0.2;
          break;
        }
        case 'plaster_fine': {
          const stipple = fbmTileable(u, v, 18);
          toneMix = stipple * 0.32;
          height = 0.45 + stipple * 0.25;
          roughMod = spec.roughness + (stipple - 0.5) * 0.06;
          ao = 0.97 + stipple * 0.03;
          break;
        }
        default: {
          const subtle = fbmTileable(u, v, 8);
          toneMix = subtle * 0.12;
          height = 0.5 + subtle * 0.06;
          roughMod = spec.roughness;
          ao = 1.0;
          break;
        }
      }

      heightField[idx] = height;
      const rgb = mixRgb(c1, c2, toneMix);
      const p4 = idx * 4;

      albedoBytes[p4] = rgb[0];
      albedoBytes[p4 + 1] = rgb[1];
      albedoBytes[p4 + 2] = rgb[2];
      albedoBytes[p4 + 3] = 255;

      const rByte = Math.max(5, Math.min(255, Math.round(roughMod * 255)));
      roughnessBytes[p4] = rByte;
      roughnessBytes[p4 + 1] = rByte;
      roughnessBytes[p4 + 2] = rByte;
      roughnessBytes[p4 + 3] = 255;

      const aoByte = Math.max(40, Math.min(255, Math.round(ao * 255)));
      aoBytes[p4] = aoByte;
      aoBytes[p4 + 1] = aoByte;
      aoBytes[p4 + 2] = aoByte;
      aoBytes[p4 + 3] = 255;
    }
  }

  // Compute tangent-space Normal Map via wrapped central differences
  const strength = spec.bumpStrength * 2.6;
  for (let py = 0; py < size; py++) {
    const ym = (py - 1 + size) % size;
    const yp = (py + 1) % size;
    for (let px = 0; px < size; px++) {
      const xm = (px - 1 + size) % size;
      const xp = (px + 1) % size;

      const hL = heightField[py * size + xm]!;
      const hR = heightField[py * size + xp]!;
      const hD = heightField[ym * size + px]!;
      const hU = heightField[yp * size + px]!;

      const dx = (hL - hR) * strength;
      const dy = (hD - hU) * strength;
      const dz = 1.0;
      const invLen = 1 / Math.hypot(dx, dy, dz);

      const p4 = (py * size + px) * 4;
      normalBytes[p4] = Math.round(((dx * invLen) * 0.5 + 0.5) * 255);
      normalBytes[p4 + 1] = Math.round(((dy * invLen) * 0.5 + 0.5) * 255);
      normalBytes[p4 + 2] = Math.round(((dz * invLen) * 0.5 + 0.5) * 255);
      normalBytes[p4 + 3] = 255;
    }
  }

  const configureMap = (data: Uint8Array, isSrgb: boolean): THREE.DataTexture => {
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.colorSpace = isSrgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    tex.channel = 0;
    tex.needsUpdate = true;
    return tex;
  };

  return {
    albedoMap: configureMap(albedoBytes, true),
    normalMap: configureMap(normalBytes, false),
    roughnessMap: configureMap(roughnessBytes, false),
    aoMap: configureMap(aoBytes, false),
  };
}
