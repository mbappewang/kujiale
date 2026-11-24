import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface AssetStats {
  cachedTemplates: number;
  trackedGeometries: number;
  trackedMaterials: number;
  trackedTextures: number;
}

export class AssetLoadAbortedError extends Error {
  constructor(url: string) {
    super(`Asset load aborted for: ${url}`);
    this.name = 'AssetLoadAbortedError';
  }
}

export class AssetLoadError extends Error {
  public readonly url: string;
  constructor(url: string, causeMessage: string) {
    super(`Failed to load 3D asset "${url}": ${causeMessage}`);
    this.name = 'AssetLoadError';
    this.url = url;
  }
}

export class AssetManager {
  private readonly glbCache = new Map<string, THREE.Group>();
  private readonly inflightLoads = new Map<string, Promise<THREE.Group>>();
  private readonly trackedGeometries = new Set<THREE.BufferGeometry>();
  private readonly trackedMaterials = new Set<THREE.Material>();
  private readonly trackedTextures = new Set<THREE.Texture>();
  private readonly loader: GLTFLoader;
  private customFetch?: typeof fetch;

  constructor(options?: { customFetch?: typeof fetch }) {
    this.loader = new GLTFLoader();
    this.customFetch = options?.customFetch;
  }

  public trackGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.trackedGeometries.add(geometry);
    return geometry;
  }

  public trackMaterial<T extends THREE.Material>(material: T): T {
    this.trackedMaterials.add(material);
    return material;
  }

  public trackTexture<T extends THREE.Texture>(texture: T): T {
    this.trackedTextures.add(texture);
    return texture;
  }

  /**
   * Load a GLB/GLTF model with AbortSignal cancellation and template caching.
   */
  public async loadGlbModel(url: string, signal?: AbortSignal): Promise<THREE.Group> {
    if (!url || (!url.startsWith('/') && !url.startsWith('http://') && !url.startsWith('https://'))) {
      throw new AssetLoadError(url, 'Invalid or disallowed asset path');
    }
    if (signal?.aborted) {
      throw new AssetLoadAbortedError(url);
    }

    const cached = this.glbCache.get(url);
    if (cached) {
      return cached.clone(true);
    }

    let pending = this.inflightLoads.get(url);
    if (!pending) {
      pending = this.fetchAndParseGlb(url, signal);
      this.inflightLoads.set(url, pending);
    }

    try {
      const template = await pending;
      if (signal?.aborted) {
        throw new AssetLoadAbortedError(url);
      }
      return template.clone(true);
    } finally {
      this.inflightLoads.delete(url);
    }
  }

  private async fetchAndParseGlb(url: string, signal?: AbortSignal): Promise<THREE.Group> {
    const fetchFn = this.customFetch ?? globalThis.fetch;
    if (typeof fetchFn !== 'function') {
      throw new AssetLoadError(url, 'Fetch API unavailable in current runtime');
    }

    let response: Response;
    try {
      response = await fetchFn(url, { signal });
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        throw new AssetLoadAbortedError(url);
      }
      throw new AssetLoadError(url, err instanceof Error ? err.message : String(err));
    }

    if (!response.ok) {
      throw new AssetLoadError(url, `HTTP ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    if (signal?.aborted) {
      throw new AssetLoadAbortedError(url);
    }

    return new Promise<THREE.Group>((resolve, reject) => {
      this.loader.parse(
        buffer,
        '',
        (gltf: GLTF) => {
          gltf.scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
              if (obj.geometry) this.trackGeometry(obj.geometry);
              if (Array.isArray(obj.material)) {
                obj.material.forEach((m) => this.trackMaterial(m));
              } else if (obj.material) {
                this.trackMaterial(obj.material);
              }
            }
          });
          this.glbCache.set(url, gltf.scene);
          resolve(gltf.scene);
        },
        (err: unknown) => {
          reject(new AssetLoadError(url, err instanceof Error ? err.message : String(err)));
        },
      );
    });
  }

  /**
   * Dispose geometries (and optionally unshared materials) on a detached Scene Graph subtree.
   */
  public static disposeSubtreeGeometries(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        child.geometry.dispose();
      }
      if (child instanceof THREE.Line && child.geometry) {
        child.geometry.dispose();
      }
    });
  }

  public getStats(): AssetStats {
    return {
      cachedTemplates: this.glbCache.size,
      trackedGeometries: this.trackedGeometries.size,
      trackedMaterials: this.trackedMaterials.size,
      trackedTextures: this.trackedTextures.size,
    };
  }

  public disposeAll(): void {
    for (const geo of this.trackedGeometries) {
      geo.dispose();
    }
    for (const mat of this.trackedMaterials) {
      mat.dispose();
    }
    for (const tex of this.trackedTextures) {
      tex.dispose();
    }
    this.trackedGeometries.clear();
    this.trackedMaterials.clear();
    this.trackedTextures.clear();
    this.glbCache.clear();
    this.inflightLoads.clear();
  }
}
