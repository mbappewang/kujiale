import { clamp, degToRad, pointInPolygon, radToDeg, type Vec3 } from '@kujiale/shared';
import type { LightingConfig, PropertyMeta, RoomData, TimeOfDayPreset } from '@kujiale/scene-schema';
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export interface SolarPositionResult {
  elevationDegrees: number;
  azimuthDegrees: number;
  directionToSun: Vec3;
  solarHour: number;
}

const PRESET_SOLAR_HOURS: Record<TimeOfDayPreset, number> = {
  morning: 8.5,
  noon: 12.25,
  afternoon: 15.85,
  evening: 18.85,
};

const DAYS_BEFORE_MONTH = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export function computeAustralianSolarPosition(
  property: Pick<PropertyMeta, 'latitude' | 'longitude' | 'orientationDegrees'>,
  config: Pick<LightingConfig, 'timeOfDay' | 'month' | 'dayOfMonth'>,
): SolarPositionResult {
  const solarHour = PRESET_SOLAR_HOURS[config.timeOfDay] ?? 15.85;
  const dayOfYear = (DAYS_BEFORE_MONTH[clamp(config.month, 1, 12)] ?? 304) + clamp(config.dayOfMonth, 1, 31);

  const declination = degToRad(-23.44 * Math.cos(degToRad((360 / 365) * (dayOfYear + 10))));
  const latRad = degToRad(property.latitude);
  const hourAngle = degToRad(15 * (solarHour - 12));

  const sinAlt =
    Math.sin(latRad) * Math.sin(declination) +
    Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle);
  const clampedSinAlt = clamp(sinAlt, -1, 1);
  const elevationRad = Math.asin(clampedSinAlt);

  const northComp =
    Math.cos(latRad) * Math.sin(declination) -
    Math.sin(latRad) * Math.cos(declination) * Math.cos(hourAngle);
  const eastComp = -Math.cos(declination) * Math.sin(hourAngle);

  let azimuthDeg = radToDeg(Math.atan2(eastComp, northComp));
  if (azimuthDeg < 0) azimuthDeg += 360;

  const worldAzimuthRad = degToRad(azimuthDeg - property.orientationDegrees);
  const cosAlt = Math.max(0.05, Math.cos(elevationRad));
  const y = Math.max(0.06, Math.sin(elevationRad));
  const x = Math.sin(worldAzimuthRad) * cosAlt;
  const z = -Math.cos(worldAzimuthRad) * cosAlt;
  const len = Math.hypot(x, y, z);

  return {
    elevationDegrees: Number(radToDeg(elevationRad).toFixed(2)),
    azimuthDegrees: Number(azimuthDeg.toFixed(2)),
    directionToSun: { x: x / len, y: y / len, z: z / len },
    solarHour,
  };
}

export type IlluminationPipelineKind =
  | 'realtime_direct_plus_ibl'
  | 'precomputed_lightmap_hybrid'
  | 'offline_pathtracing_export';

export interface LightmapSlotBinding {
  meshId: string;
  lightMapTexture: THREE.Texture;
  intensity: number;
}

export function createProceduralEnvironmentTexture(timeOfDay: TimeOfDayPreset): THREE.DataTexture {
  const width = 128;
  const height = 64;
  const data = new Uint8Array(width * height * 4);

  const palettes: Record<
    TimeOfDayPreset,
    { zenith: [number, number, number]; horizon: [number, number, number]; ground: [number, number, number] }
  > = {
    morning: { zenith: [95, 162, 232], horizon: [248, 224, 194], ground: [152, 138, 118] },
    noon: { zenith: [68, 142, 228], horizon: [212, 232, 248], ground: [160, 152, 136] },
    afternoon: { zenith: [84, 148, 218], horizon: [250, 214, 172], ground: [156, 138, 114] },
    evening: { zenith: [36, 52, 88], horizon: [218, 128, 86], ground: [68, 60, 54] },
  };

  const pal = palettes[timeOfDay];
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    let r: number;
    let g: number;
    let b: number;
    if (v >= 0.5) {
      const t = Math.pow((v - 0.5) * 2, 0.65);
      r = pal.horizon[0] + (pal.zenith[0] - pal.horizon[0]) * t;
      g = pal.horizon[1] + (pal.zenith[1] - pal.horizon[1]) * t;
      b = pal.horizon[2] + (pal.zenith[2] - pal.horizon[2]) * t;
    } else {
      const t = Math.pow((0.5 - v) * 2, 0.55);
      r = pal.horizon[0] + (pal.ground[0] - pal.horizon[0]) * t;
      g = pal.horizon[1] + (pal.ground[1] - pal.horizon[1]) * t;
      b = pal.horizon[2] + (pal.ground[2] - pal.horizon[2]) * t;
    }
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = Math.round(clamp(r, 0, 255));
      data[idx + 1] = Math.round(clamp(g, 0, 255));
      data[idx + 2] = Math.round(clamp(b, 0, 255));
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export class LightingSystem {
  public readonly pipelineKind: IlluminationPipelineKind = 'realtime_direct_plus_ibl';
  public readonly root = new THREE.Group();
  public readonly sunLight: THREE.DirectionalLight;
  public readonly hemiLight: THREE.HemisphereLight;
  public readonly interiorLightsGroup = new THREE.Group();

  private skyMesh: THREE.Mesh;
  private rawEnvTexture: THREE.DataTexture | null = null;
  private pmremTarget: THREE.WebGLRenderTarget | null = null;
  private readonly hdriCache = new Map<string, Promise<THREE.DataTexture | null>>();
  private readonly loadedHdrTextures: THREE.DataTexture[] = [];
  private activeApplyToken = 0;
  private currentExposure = 1.02;
  private lastSolarResult: SolarPositionResult | null = null;

  constructor(shadowMapSize = 3072) {
    this.root.name = 'LightingSystem';

    this.sunLight = new THREE.DirectionalLight(0xfff4e2, 2.4);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 58;
    // Tight 14m architectural shadow frustum gives ~7mm crisp contact shadow precision!
    const extent = 14.0;
    this.sunLight.shadow.camera.left = -extent;
    this.sunLight.shadow.camera.right = extent;
    this.sunLight.shadow.camera.top = extent;
    this.sunLight.shadow.camera.bottom = -extent;
    this.sunLight.shadow.bias = -0.00025;
    this.sunLight.shadow.normalBias = 0.018;
    this.sunLight.shadow.radius = 2.0;

    this.hemiLight = new THREE.HemisphereLight(0xdceeff, 0xa8967c, 0.38);
    this.hemiLight.position.set(0, 20, 0);

    const skyGeo = new THREE.SphereGeometry(95, 32, 20);
    const skyMat = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.skyMesh.name = 'AustralianSkyDome';

    this.root.add(this.sunLight);
    this.root.add(this.sunLight.target);
    this.root.add(this.hemiLight);
    this.root.add(this.skyMesh);
    this.root.add(this.interiorLightsGroup);
  }

  public getSolarPosition(): SolarPositionResult | null {
    return this.lastSolarResult;
  }

  public setShadowMapResolution(size: number, enabled: boolean): void {
    this.sunLight.castShadow = enabled;
    if (this.sunLight.shadow.mapSize.x !== size) {
      this.sunLight.shadow.mapSize.set(size, size);
      this.sunLight.shadow.map?.dispose();
      this.sunLight.shadow.map = null;
    }
  }

  private loadRealHdri(url: string): Promise<THREE.DataTexture | null> {
    const cached = this.hdriCache.get(url);
    if (cached) return cached;
    if (typeof window === 'undefined' || typeof fetch === 'undefined') {
      return Promise.resolve(null);
    }

    const loader = new RGBELoader();
    const promise = new Promise<THREE.DataTexture | null>((resolve) => {
      loader.load(
        url,
        (tex) => {
          tex.mapping = THREE.EquirectangularReflectionMapping;
          this.loadedHdrTextures.push(tex);
          resolve(tex);
        },
        undefined,
        () => resolve(null),
      );
    });
    this.hdriCache.set(url, promise);
    return promise;
  }

  public applyConfig(
    scene: THREE.Scene,
    property: PropertyMeta,
    config: LightingConfig,
    rooms: readonly RoomData[],
    renderer?: THREE.WebGLRenderer,
  ): SolarPositionResult {
    const applyToken = ++this.activeApplyToken;
    const solar = computeAustralianSolarPosition(property, config);
    this.lastSolarResult = solar;

    const sunDist = 26;
    this.sunLight.position.set(
      solar.directionToSun.x * sunDist,
      solar.directionToSun.y * sunDist,
      solar.directionToSun.z * sunDist,
    );
    this.sunLight.target.position.set(0, 0.5, -1.5);
    this.sunLight.castShadow = config.shadowsEnabled;

    const sunPresets: Record<
      TimeOfDayPreset,
      { sunColor: number; sunIntensity: number; hemiIntensity: number; bgIntensity: number; envBoost: number }
    > = {
      morning: { sunColor: 0xffe6c4, sunIntensity: 2.25, hemiIntensity: 0.34, bgIntensity: 0.88, envBoost: 0.9 },
      noon: { sunColor: 0xfffaf2, sunIntensity: 2.85, hemiIntensity: 0.4, bgIntensity: 1.0, envBoost: 1.0 },
      afternoon: { sunColor: 0xffdfb8, sunIntensity: 2.45, hemiIntensity: 0.35, bgIntensity: 0.92, envBoost: 0.95 },
      evening: { sunColor: 0xff9458, sunIntensity: 0.8, hemiIntensity: 0.22, bgIntensity: 0.72, envBoost: 0.65 },
    };
    const preset = sunPresets[config.timeOfDay];
    this.sunLight.color.setHex(preset.sunColor);
    this.sunLight.intensity = preset.sunIntensity;
    this.hemiLight.intensity = preset.hemiIntensity;

    // Immediate fallback procedural environment while 32-bit .hdr streams in
    this.rawEnvTexture?.dispose();
    this.rawEnvTexture = createProceduralEnvironmentTexture(config.timeOfDay);
    const skyMat = this.skyMesh.material as THREE.MeshBasicMaterial;
    skyMat.map = this.rawEnvTexture;
    skyMat.needsUpdate = true;

    if (renderer) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      const nextTarget = pmrem.fromEquirectangular(this.rawEnvTexture);
      this.pmremTarget?.dispose();
      this.pmremTarget = nextTarget;
      scene.environment = nextTarget.texture;
      pmrem.dispose();

      // Upgrade to real 32-bit Poly Haven CC0 Southern-Hemisphere HDRI sky!
      const hdriUrl =
        config.timeOfDay === 'evening' ? '/hdri/sunsky_evening.hdr' : '/hdri/sunsky_day.hdr';
      this.loadRealHdri(hdriUrl).then((hdrTex) => {
        if (!hdrTex || applyToken !== this.activeApplyToken) return;
        const hdrPmrem = new THREE.PMREMGenerator(renderer);
        hdrPmrem.compileEquirectangularShader();
        const hdrTarget = hdrPmrem.fromEquirectangular(hdrTex);
        this.pmremTarget?.dispose();
        this.pmremTarget = hdrTarget;
        scene.environment = hdrTarget.texture;
        scene.background = hdrTex;
        scene.backgroundIntensity = preset.bgIntensity;
        scene.environmentIntensity = config.environmentIntensity * preset.envBoost;
        this.skyMesh.visible = false;
        hdrPmrem.dispose();
      });
    } else {
      scene.environment = this.rawEnvTexture;
    }
    scene.environmentIntensity = config.environmentIntensity * preset.envBoost;

    this.rebuildInteriorLights(rooms, config);
    this.currentExposure = config.exposure;

    return solar;
  }

  private rebuildInteriorLights(rooms: readonly RoomData[], config: LightingConfig): void {
    while (this.interiorLightsGroup.children.length > 0) {
      const child = this.interiorLightsGroup.children[0]!;
      this.interiorLightsGroup.remove(child);
    }
    if (!config.interiorLightsOn) return;

    const baseIntensity = config.timeOfDay === 'evening' ? 4.8 : 1.35;
    const priorityTypes = new Set([
      'living_room',
      'kitchen',
      'dining_room',
      'master_bedroom',
      'bathroom',
      'hallway',
    ]);

    for (const room of rooms) {
      if (room.isOutdoor || !priorityTypes.has(room.roomType)) continue;
      let cx = 0;
      let cz = 0;
      for (const p of room.polygon) {
        cx += p.x;
        cz += p.z;
      }
      cx /= room.polygon.length;
      cz /= room.polygon.length;

      const light = new THREE.PointLight(0xffeeda, baseIntensity, 9.5, 1.8);
      light.position.set(cx, 2.7, cz);
      light.castShadow = false;
      this.interiorLightsGroup.add(light);
    }
  }

  public bindLightmaps(sceneRoot: THREE.Object3D, bindings: readonly LightmapSlotBinding[]): number {
    let boundCount = 0;
    const byId = new Map(bindings.map((b) => [b.meshId, b]));
    sceneRoot.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
        const slot = byId.get(obj.name);
        if (slot) {
          obj.material.lightMap = slot.lightMapTexture;
          obj.material.lightMapIntensity = slot.intensity;
          obj.material.needsUpdate = true;
          boundCount++;
        }
      }
    });
    return boundCount;
  }

  public updateExposure(
    cameraPosition: Vec3,
    rooms: readonly RoomData[],
    config: LightingConfig,
    deltaSeconds: number,
  ): number {
    if (!config.autoIndoorExposure) {
      this.currentExposure = config.exposure;
      return this.currentExposure;
    }

    const pt = { x: cameraPosition.x, z: cameraPosition.z };
    const isIndoors =
      cameraPosition.y < 3.5 &&
      rooms.some((r) => !r.isOutdoor && pointInPolygon(pt, r.polygon));

    const indoorBoost = config.timeOfDay === 'evening' ? 1.15 : 1.22;
    const target = isIndoors ? config.exposure * indoorBoost : config.exposure * 0.94;
    const speed = clamp(deltaSeconds * 3.2, 0.01, 1);
    this.currentExposure = this.currentExposure + (target - this.currentExposure) * speed;
    return this.currentExposure;
  }

  public dispose(): void {
    this.activeApplyToken++;
    this.sunLight.shadow.map?.dispose();
    this.rawEnvTexture?.dispose();
    this.pmremTarget?.dispose();
    for (const tex of this.loadedHdrTextures) {
      tex.dispose();
    }
    this.loadedHdrTextures.length = 0;
    this.skyMesh.geometry.dispose();
    (this.skyMesh.material as THREE.Material).dispose();
  }
}
