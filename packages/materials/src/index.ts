import * as THREE from 'three';
import type { MaterialCategory, MaterialOverride } from '@kujiale/scene-schema';
import { AUSTRALIAN_MATERIAL_CATALOG, type PbrMaterialSpec } from './catalog';
import { synthesizePbrTextures, type SynthesizedTextureSet } from './procedural-textures';

export * from './catalog';
export * from './procedural-textures';

export type TextureQualityTier = 'low' | 'medium' | 'high' | 'ultra';

const TIER_RESOLUTION: Record<TextureQualityTier, number> = {
  low: 128,
  medium: 256,
  high: 384,
  ultra: 512,
};

interface ScannedPackTextures {
  diff: THREE.Texture;
  nor: THREE.Texture;
  arm: THREE.Texture;
}

export class MaterialSystem {
  private readonly specs = new Map<string, PbrMaterialSpec>();
  private readonly textureCache = new Map<string, SynthesizedTextureSet>();
  private readonly scannedPackCache = new Map<string, Promise<ScannedPackTextures | null>>();
  private readonly clonedScannedTextures: THREE.Texture[] = [];
  private readonly materialCache = new Map<string, THREE.Material>();
  private qualityTier: TextureQualityTier;

  constructor(qualityTier: TextureQualityTier = 'high') {
    this.qualityTier = qualityTier;
    for (const item of AUSTRALIAN_MATERIAL_CATALOG) {
      this.specs.set(item.id, { ...item });
    }
  }

  public getAllSpecs(): PbrMaterialSpec[] {
    return Array.from(this.specs.values());
  }

  public getSpecsByCategory(category: MaterialCategory): PbrMaterialSpec[] {
    return this.getAllSpecs().filter((s) => s.category === category);
  }

  public getSpecsForSurface(
    surface: 'floor' | 'wall' | 'exterior_wall' | 'roof' | 'furniture',
  ): PbrMaterialSpec[] {
    return this.getAllSpecs().filter((s) => s.recommendedFor.includes(surface));
  }

  public getSpec(materialId: string): PbrMaterialSpec {
    return (
      this.specs.get(materialId) ??
      this.specs.get('plaster-coastal-white') ??
      AUSTRALIAN_MATERIAL_CATALOG[0]!
    );
  }

  public applyOverrides(overrides: readonly MaterialOverride[]): void {
    for (const ov of overrides) {
      const existing = this.specs.get(ov.id);
      if (existing) {
        this.specs.set(ov.id, {
          ...existing,
          name: ov.name,
          baseColorHex: ov.baseColorHex,
          roughness: ov.roughness,
          metalness: ov.metalness,
          tileSizeMeters: ov.tileSizeMeters,
        });
      } else {
        this.specs.set(ov.id, {
          id: ov.id,
          name: ov.name,
          category: ov.category,
          pattern: 'plaster_fine',
          baseColorHex: ov.baseColorHex,
          secondaryColorHex: ov.baseColorHex,
          roughness: ov.roughness,
          metalness: ov.metalness,
          bumpStrength: 0.25,
          tileSizeMeters: ov.tileSizeMeters,
          recommendedFor: ['floor', 'wall', 'furniture'],
        });
      }
      this.invalidateMaterial(ov.id);
    }
  }

  public setQualityTier(tier: TextureQualityTier): void {
    if (this.qualityTier === tier) return;
    this.qualityTier = tier;
  }

  private getOrCreateProceduralTextures(spec: PbrMaterialSpec): SynthesizedTextureSet {
    const texKey = `${spec.id}::${this.qualityTier}::${spec.baseColorHex}`;
    const existing = this.textureCache.get(texKey);
    if (existing) return existing;

    const created = synthesizePbrTextures(spec, TIER_RESOLUTION[this.qualityTier]);
    this.textureCache.set(texKey, created);
    return created;
  }

  private loadScannedPack(packId: string): Promise<ScannedPackTextures | null> {
    const existing = this.scannedPackCache.get(packId);
    if (existing) return existing;

    // Only attempt browser image loading when DOM Image is available
    if (typeof window === 'undefined' || typeof Image === 'undefined') {
      const none = Promise.resolve(null);
      this.scannedPackCache.set(packId, none);
      return none;
    }

    const loader = new THREE.TextureLoader();
    const loadOne = (url: string, srgb: boolean): Promise<THREE.Texture> =>
      new Promise((resolve, reject) => {
        loader.load(
          url,
          (tex) => {
            tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.anisotropy = this.qualityTier === 'low' ? 2 : 8;
            tex.channel = 0;
            tex.needsUpdate = true;
            resolve(tex);
          },
          undefined,
          (err) => reject(err),
        );
      });

    const promise = Promise.all([
      loadOne(`/textures/${packId}/diff.jpg`, true),
      loadOne(`/textures/${packId}/nor_gl.jpg`, false),
      loadOne(`/textures/${packId}/arm.jpg`, false),
    ])
      .then(([diff, nor, arm]) => ({ diff, nor, arm }))
      .catch(() => null);

    this.scannedPackCache.set(packId, promise);
    return promise;
  }

  /**
   * Returns a cached, physically-scaled MeshPhysicalMaterial instance with Clearcoat, Sheen,
   * and progressive upgrade to real CC0 1K Photogrammetry Scanned PBR textures.
   */
  public getMaterial(
    materialId: string,
    options?: { worldSpaceUv?: boolean; doubleSide?: boolean },
  ): THREE.Material {
    const spec = this.getSpec(materialId);
    const worldUv = options?.worldSpaceUv ?? true;
    const doubleSide = options?.doubleSide ?? false;
    const cacheKey = `${spec.id}|${this.qualityTier}|${worldUv ? 'w' : 'l'}|${doubleSide ? '2' : '1'}`;

    const cached = this.materialCache.get(cacheKey);
    if (cached) return cached;

    if (spec.category === 'glass') {
      const glassMat = new THREE.MeshPhysicalMaterial({
        name: spec.id,
        color: new THREE.Color(spec.baseColorHex),
        roughness: spec.roughness,
        metalness: spec.metalness,
        transparent: true,
        opacity: spec.opacity ?? 0.34,
        transmission: this.qualityTier === 'low' ? 0 : (spec.transmission ?? 0.85),
        ior: 1.52,
        reflectivity: 0.95,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        envMapIntensity: spec.envMapIntensity ?? 2.0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.materialCache.set(cacheKey, glassMat);
      return glassMat;
    }

    const baseTextures = this.getOrCreateProceduralTextures(spec);
    const invTile = worldUv ? 1 / Math.max(0.1, spec.tileSizeMeters) : 1;

    const cloneScaledDataTex = (src: THREE.DataTexture): THREE.DataTexture => {
      if (Math.abs(invTile - 1) < 1e-4) return src;
      const cloned = src.clone();
      cloned.repeat.set(invTile, invTile);
      cloned.needsUpdate = true;
      return cloned;
    };

    const mat = new THREE.MeshPhysicalMaterial({
      name: spec.id,
      color: new THREE.Color(0xffffff),
      map: cloneScaledDataTex(baseTextures.albedoMap),
      normalMap: cloneScaledDataTex(baseTextures.normalMap),
      normalScale: new THREE.Vector2(spec.bumpStrength, spec.bumpStrength),
      roughnessMap: cloneScaledDataTex(baseTextures.roughnessMap),
      roughness: 1.0,
      metalness: spec.metalness,
      aoMap: cloneScaledDataTex(baseTextures.aoMap),
      aoMapIntensity: 0.85,
      clearcoat: this.qualityTier === 'low' ? 0 : (spec.clearcoat ?? 0),
      clearcoatRoughness: spec.clearcoatRoughness ?? 0.3,
      sheen: this.qualityTier === 'low' ? 0 : (spec.sheen ?? 0),
      sheenRoughness: spec.sheenRoughness ?? 0.55,
      sheenColor: spec.sheenColorHex ? new THREE.Color(spec.sheenColorHex) : new THREE.Color(0xffffff),
      envMapIntensity: spec.envMapIntensity ?? 1.0,
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });

    // Seamlessly upgrade to scanned 1K photogrammetry PBR maps in browser runtime
    if (spec.texturePackId) {
      this.loadScannedPack(spec.texturePackId).then((scanned) => {
        if (!scanned || !this.materialCache.has(cacheKey)) return;

        const cloneScanned = (tex: THREE.Texture): THREE.Texture => {
          const c = tex.clone();
          c.repeat.set(invTile, invTile);
          c.wrapS = THREE.RepeatWrapping;
          c.wrapT = THREE.RepeatWrapping;
          c.colorSpace = tex.colorSpace;
          c.anisotropy = tex.anisotropy;
          c.channel = 0;
          c.needsUpdate = true;
          this.clonedScannedTextures.push(c);
          return c;
        };

        const diffClone = cloneScanned(scanned.diff);
        const norClone = cloneScanned(scanned.nor);
        const armClone = cloneScanned(scanned.arm);

        const tint = new THREE.Color(spec.tintHex ?? '#ffffff');
        if (spec.albedoGain && spec.albedoGain !== 1) {
          tint.multiplyScalar(spec.albedoGain);
        }
        mat.color = tint;
        mat.map = diffClone;
        mat.normalMap = norClone;
        // Poly Haven ARM packs: R = Ambient Occlusion, G = Roughness, B = Metalness
        mat.aoMap = armClone;
        mat.roughnessMap = armClone;
        mat.roughness = Math.min(1.0, spec.roughness * 1.45 + 0.25);
        mat.aoMapIntensity = 0.95;
        mat.needsUpdate = true;
      });
    }

    this.materialCache.set(cacheKey, mat);
    return mat;
  }

  private invalidateMaterial(materialId: string): void {
    for (const [key, mat] of this.materialCache.entries()) {
      if (key.startsWith(`${materialId}|`)) {
        mat.dispose();
        this.materialCache.delete(key);
      }
    }
    for (const [key, set] of this.textureCache.entries()) {
      if (key.startsWith(`${materialId}::`)) {
        set.albedoMap.dispose();
        set.normalMap.dispose();
        set.roughnessMap.dispose();
        set.aoMap.dispose();
        this.textureCache.delete(key);
      }
    }
  }

  public dispose(): void {
    for (const mat of this.materialCache.values()) {
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.map?.dispose();
        mat.normalMap?.dispose();
        mat.roughnessMap?.dispose();
        mat.aoMap?.dispose();
      }
      mat.dispose();
    }
    for (const set of this.textureCache.values()) {
      set.albedoMap.dispose();
      set.normalMap.dispose();
      set.roughnessMap.dispose();
      set.aoMap.dispose();
    }
    for (const tex of this.clonedScannedTextures) {
      tex.dispose();
    }
    this.clonedScannedTextures.length = 0;
    this.materialCache.clear();
    this.textureCache.clear();
  }
}
