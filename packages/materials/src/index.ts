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

export class MaterialSystem {
  private readonly specs = new Map<string, PbrMaterialSpec>();
  private readonly textureCache = new Map<string, SynthesizedTextureSet>();
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

  private getOrCreateTextures(spec: PbrMaterialSpec): SynthesizedTextureSet {
    const texKey = `${spec.id}::${this.qualityTier}::${spec.baseColorHex}`;
    const existing = this.textureCache.get(texKey);
    if (existing) return existing;

    const created = synthesizePbrTextures(spec, TIER_RESOLUTION[this.qualityTier]);
    this.textureCache.set(texKey, created);
    return created;
  }

  /**
   * Returns a cached, physically-scaled PBR Material instance.
   * Geometries using world-space metre UVs (1 UV = 1m) will automatically repeat every `tileSizeMeters`.
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
        opacity: spec.opacity ?? 0.35,
        transmission: this.qualityTier === 'low' ? 0 : (spec.transmission ?? 0.78),
        ior: 1.5,
        reflectivity: 0.9,
        envMapIntensity: spec.envMapIntensity ?? 1.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.materialCache.set(cacheKey, glassMat);
      return glassMat;
    }

    const baseTextures = this.getOrCreateTextures(spec);
    const invTile = worldUv ? 1 / Math.max(0.1, spec.tileSizeMeters) : 1;

    const cloneScaledTex = (src: THREE.DataTexture): THREE.DataTexture => {
      if (Math.abs(invTile - 1) < 1e-4) return src;
      const cloned = src.clone();
      cloned.repeat.set(invTile, invTile);
      cloned.needsUpdate = true;
      return cloned;
    };

    const mat = new THREE.MeshStandardMaterial({
      name: spec.id,
      color: new THREE.Color(0xffffff),
      map: cloneScaledTex(baseTextures.albedoMap),
      normalMap: cloneScaledTex(baseTextures.normalMap),
      normalScale: new THREE.Vector2(spec.bumpStrength, spec.bumpStrength),
      roughnessMap: cloneScaledTex(baseTextures.roughnessMap),
      roughness: 1.0, // Driven accurately by roughnessMap bytes
      metalness: spec.metalness,
      aoMap: cloneScaledTex(baseTextures.aoMap),
      aoMapIntensity: 0.75,
      envMapIntensity: spec.envMapIntensity ?? 0.85,
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });

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
    this.materialCache.clear();
    this.textureCache.clear();
  }
}
