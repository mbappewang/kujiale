import { deepClone, polygonBounds, polygonCentroid } from '@kujiale/shared';
import type {
  DesignCommand,
  FurnitureItemData,
  RoomData,
  SceneData,
  StylePresetId,
} from '@kujiale/scene-schema';
import { getFurnitureCatalogEntry } from './catalog';
import { constrainFurniturePositionToRoom, validateFurniturePlacement } from './spatial-validator';

export interface AustralianStylePreset {
  id: StylePresetId;
  name: string;
  tagline: string;
  description: string;
  livingFloorMaterialId: string;
  bedroomFloorMaterialId: string;
  wetAreaFloorMaterialId: string;
  primaryWallMaterialId: string;
  featureWallMaterialId: string;
  exteriorWallMaterialId: string;
  roofMaterialId: string;
  sofaCatalogId: string;
  sofaMaterialId: string;
  coffeeTableCatalogId: string;
  diningCatalogId: string;
  timberToneMaterialId: string;
}

export const AUSTRALIAN_STYLE_PRESETS: Record<StylePresetId, AustralianStylePreset> = {
  modern_coastal: {
    id: 'modern_coastal',
    name: 'Modern Australian Coastal',
    tagline: 'Byron Bay & Northern Beaches',
    description:
      'Sun-drenched NSW Spotted Gum & blonde oak floors, crisp white plaster, oatmeal Belgian linen upholstery, and honed Carrara stone.',
    livingFloorMaterialId: 'timber-spotted-gum',
    bedroomFloorMaterialId: 'timber-coastal-oak',
    wetAreaFloorMaterialId: 'tile-porcelain-travertine',
    primaryWallMaterialId: 'plaster-coastal-white',
    featureWallMaterialId: 'plaster-warm-sand',
    exteriorWallMaterialId: 'brick-sydney-sandstock',
    roofMaterialId: 'roof-colorbond-monument',
    sofaCatalogId: 'sofa-coastal-3seat',
    sofaMaterialId: 'fabric-coastal-linen',
    coffeeTableCatalogId: 'table-coastal-coffee',
    diningCatalogId: 'table-dining-6seat',
    timberToneMaterialId: 'timber-coastal-oak',
  },
  sydney_contemporary: {
    id: 'sydney_contemporary',
    name: 'Sydney Architectural Urban',
    tagline: 'Paddington & Mosman Pavilion',
    description:
      'Burnished architectural concrete floors, Colorbond Monument charcoal facade, slate wool bouclé & tan saddle leather accents.',
    livingFloorMaterialId: 'concrete-polished-architectural',
    bedroomFloorMaterialId: 'timber-spotted-gum',
    wetAreaFloorMaterialId: 'marble-carrara-honed',
    primaryWallMaterialId: 'paint-crisp-white',
    featureWallMaterialId: 'plaster-warm-sand',
    exteriorWallMaterialId: 'paint-charcoal-facade',
    roofMaterialId: 'roof-colorbond-monument',
    sofaCatalogId: 'sofa-leather-modular',
    sofaMaterialId: 'leather-tan-saddle',
    coffeeTableCatalogId: 'table-travertine-plinth',
    diningCatalogId: 'table-dining-marble',
    timberToneMaterialId: 'timber-blackbutt-deck',
  },
  melbourne_heritage: {
    id: 'melbourne_heritage',
    name: 'Melbourne Heritage Contemporary',
    tagline: 'Hawthorn & Fitzroy Terrace',
    description:
      'Rich Blackbutt & Spotted Gum timber, Hawthorn heritage red brickwork, Eucalyptus Mist feature plaster, and honed marble.',
    livingFloorMaterialId: 'timber-blackbutt-deck',
    bedroomFloorMaterialId: 'timber-spotted-gum',
    wetAreaFloorMaterialId: 'tile-terrazzo-coastal',
    primaryWallMaterialId: 'plaster-warm-sand',
    featureWallMaterialId: 'plaster-sage-eucalyptus',
    exteriorWallMaterialId: 'brick-melbourne-red',
    roofMaterialId: 'roof-terracotta-shingle',
    sofaCatalogId: 'sofa-coastal-3seat',
    sofaMaterialId: 'fabric-charcoal-boucle',
    coffeeTableCatalogId: 'table-coastal-coffee',
    diningCatalogId: 'table-dining-marble',
    timberToneMaterialId: 'timber-spotted-gum',
  },
  outback_minimalist: {
    id: 'outback_minimalist',
    name: 'Outback Earth Minimalist',
    tagline: 'Fremantle & Margaret River',
    description:
      'Silver vein-cut travertine stone floors, warm rammed-earth sand render, terracotta roof shingle tones, and aniline saddle leather.',
    livingFloorMaterialId: 'marble-travertine',
    bedroomFloorMaterialId: 'timber-coastal-oak',
    wetAreaFloorMaterialId: 'tile-porcelain-travertine',
    primaryWallMaterialId: 'plaster-warm-sand',
    featureWallMaterialId: 'plaster-sage-eucalyptus',
    exteriorWallMaterialId: 'plaster-warm-sand',
    roofMaterialId: 'roof-terracotta-shingle',
    sofaCatalogId: 'sofa-leather-modular',
    sofaMaterialId: 'leather-tan-saddle',
    coffeeTableCatalogId: 'table-travertine-plinth',
    diningCatalogId: 'table-dining-6seat',
    timberToneMaterialId: 'timber-blackbutt-deck',
  },
};

/**
 * Deterministic rule-based furniture layout generator for newly recognized/edited floor plans.
 * Respects room dimensions, floor elevation, wall setbacks, and doorway clearances!
 */
export function generateRuleBasedFurnitureForScene(
  scene: SceneData,
  styleId: StylePresetId = 'modern_coastal',
): FurnitureItemData[] {
  const preset = AUSTRALIAN_STYLE_PRESETS[styleId];
  const generated: FurnitureItemData[] = [];
  const floorById = new Map(scene.floors.map((f) => [f.id, f]));

  let seq = 1;
  const tryPlace = (
    room: RoomData,
    catalogId: string,
    x: number,
    z: number,
    rotationY: number,
    primaryMat?: string,
    secondaryMat?: string,
  ) => {
    const entry = getFurnitureCatalogEntry(catalogId);
    if (!entry) return;
    const floor = floorById.get(room.floorId);
    const y = (floor?.elevation ?? 0.16) + room.elevationOffset;
    const rawItem: FurnitureItemData = {
      id: `auto-furn-${seq++}`,
      catalogId: entry.catalogId,
      name: entry.name,
      category: entry.category,
      floorId: room.floorId,
      roomId: room.id,
      glbUrl: entry.glbUrl,
      dimensions: { ...entry.dimensions },
      position: { x, y, z },
      rotationY,
      scale: { x: 1, y: 1, z: 1 },
      primaryMaterialId: primaryMat ?? entry.defaultPrimaryMaterialId,
      secondaryMaterialId: secondaryMat ?? entry.defaultSecondaryMaterialId,
      priceAUD: entry.priceAUD,
    };

    const constrained = constrainFurniturePositionToRoom(rawItem, { x, z }, scene);
    rawItem.position.x = constrained.position.x;
    rawItem.position.z = constrained.position.z;

    const testScene: SceneData = { ...scene, furniture: generated };
    const check = validateFurniturePlacement(rawItem, testScene);
    if (check.valid) {
      generated.push(rawItem);
    }
  };

  for (const room of scene.rooms) {
    const b = polygonBounds(room.polygon);
    const c = polygonCentroid(room.polygon);
    if (b.width < 1.8 || b.depth < 1.8) continue;

    switch (room.roomType) {
      case 'living_room': {
        tryPlace(room, 'decor-jute-rug', c.x, c.z, 0, 'fabric-coastal-linen');
        tryPlace(
          room,
          preset.sofaCatalogId,
          c.x,
          b.maxZ - 0.95,
          Math.PI,
          preset.sofaMaterialId,
          preset.timberToneMaterialId,
        );
        tryPlace(room, preset.coffeeTableCatalogId, c.x, c.z, 0, preset.timberToneMaterialId);
        if (b.width >= 4.2) {
          tryPlace(
            room,
            'armchair-boucle',
            b.minX + 0.85,
            c.z,
            Math.PI * 0.5,
            'fabric-charcoal-boucle',
            preset.timberToneMaterialId,
          );
        }
        break;
      }
      case 'dining_room': {
        if (b.width >= 2.5 && b.depth >= 2.5) {
          const rot = b.depth > b.width ? Math.PI * 0.5 : 0;
          tryPlace(room, preset.diningCatalogId, c.x, c.z, rot, preset.timberToneMaterialId);
        }
        break;
      }
      case 'kitchen': {
        if (b.width >= 2.4 && b.depth >= 2.8) {
          tryPlace(
            room,
            'kitchen-island-bench',
            c.x,
            c.z - 0.25,
            0,
            'marble-carrara-honed',
            preset.timberToneMaterialId,
          );
        }
        break;
      }
      case 'master_bedroom':
      case 'bedroom': {
        if (b.width >= 2.6 && b.depth >= 2.8) {
          tryPlace(
            room,
            'bed-queen-coastal',
            c.x,
            b.minZ + 1.25,
            0,
            preset.sofaMaterialId === 'leather-tan-saddle'
              ? 'fabric-coastal-linen'
              : preset.sofaMaterialId,
            preset.timberToneMaterialId,
          );
        }
        break;
      }
      case 'study': {
        tryPlace(room, 'table-study-desk', c.x, b.maxZ - 0.65, Math.PI, preset.timberToneMaterialId);
        break;
      }
      case 'bathroom': {
        if (b.width >= 2.8) {
          tryPlace(
            room,
            'bath-freestanding-oval',
            b.maxX - 0.75,
            c.z,
            -Math.PI * 0.5,
            'marble-carrara-honed',
          );
          tryPlace(room, 'bath-vanity-double', c.x - 0.3, b.minZ + 0.42, 0, preset.timberToneMaterialId);
        }
        break;
      }
      case 'patio': {
        if (b.width >= 3.0 && b.depth >= 2.5) {
          tryPlace(room, 'outdoor-alfresco-lounge', c.x, c.z, 0, 'timber-blackbutt-deck');
        }
        break;
      }
      default:
        break;
    }
  }

  return generated;
}

/**
 * Applies a validated DesignCommand immutably to SceneData.
 * Used identically by UI actions and AI Interior Designer outputs.
 */
export function applyDesignCommand(scene: SceneData, command: DesignCommand): SceneData {
  const next = deepClone(scene);

  switch (command.type) {
    case 'update_room_material': {
      const room = next.rooms.find((r) => r.id === command.roomId);
      if (room) {
        if (command.target === 'floor') room.floorMaterialId = command.materialId;
        if (command.target === 'wall') room.wallMaterialId = command.materialId;
        if (command.target === 'ceiling') room.ceilingMaterialId = command.materialId;
      }
      break;
    }
    case 'update_exterior_material': {
      if (command.target === 'exterior_wall') {
        next.property.exteriorWallMaterialId = command.materialId;
        for (const w of next.walls) {
          if (w.isExterior) w.exteriorMaterialId = command.materialId;
        }
      } else if (command.target === 'roof') {
        next.property.roofMaterialId = command.materialId;
      }
      break;
    }
    case 'replace_furniture': {
      const idx = next.furniture.findIndex((f) => f.id === command.furnitureId);
      const entry = getFurnitureCatalogEntry(command.newCatalogId);
      if (idx >= 0 && entry) {
        const current = next.furniture[idx]!;
        const updated: FurnitureItemData = {
          ...current,
          catalogId: entry.catalogId,
          name: entry.name,
          category: entry.category,
          glbUrl: entry.glbUrl,
          dimensions: { ...entry.dimensions },
          primaryMaterialId: command.primaryMaterialId ?? entry.defaultPrimaryMaterialId,
          secondaryMaterialId: entry.defaultSecondaryMaterialId,
          priceAUD: entry.priceAUD,
        };
        const constrained = constrainFurniturePositionToRoom(
          updated,
          { x: updated.position.x, z: updated.position.z },
          next,
        );
        updated.position.x = constrained.position.x;
        updated.position.z = constrained.position.z;
        next.furniture[idx] = updated;
      }
      break;
    }
    case 'add_furniture': {
      const room = next.rooms.find((r) => r.id === command.roomId);
      const entry = getFurnitureCatalogEntry(command.catalogId);
      if (room && entry) {
        const floor = next.floors.find((f) => f.id === room.floorId);
        const centroid = polygonCentroid(room.polygon);
        const y = (floor?.elevation ?? 0.16) + room.elevationOffset;
        const desired = command.position ?? { x: centroid.x, y, z: centroid.z };
        const candidate: FurnitureItemData = {
          id: `furn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          catalogId: entry.catalogId,
          name: entry.name,
          category: entry.category,
          floorId: room.floorId,
          roomId: room.id,
          glbUrl: entry.glbUrl,
          dimensions: { ...entry.dimensions },
          position: { x: desired.x, y, z: desired.z },
          rotationY: command.rotationY ?? 0,
          scale: { x: 1, y: 1, z: 1 },
          primaryMaterialId: command.primaryMaterialId ?? entry.defaultPrimaryMaterialId,
          secondaryMaterialId: entry.defaultSecondaryMaterialId,
          priceAUD: entry.priceAUD,
        };
        const constrained = constrainFurniturePositionToRoom(
          candidate,
          { x: candidate.position.x, z: candidate.position.z },
          next,
        );
        candidate.position.x = constrained.position.x;
        candidate.position.z = constrained.position.z;
        next.furniture.push(candidate);
      }
      break;
    }
    case 'remove_furniture': {
      next.furniture = next.furniture.filter((f) => f.id !== command.furnitureId);
      break;
    }
    case 'apply_style_preset': {
      const preset = AUSTRALIAN_STYLE_PRESETS[command.styleId];
      next.activeStyleId = command.styleId;
      if (!command.targetRoomId) {
        next.property.exteriorWallMaterialId = preset.exteriorWallMaterialId;
        next.property.roofMaterialId = preset.roofMaterialId;
      }
      for (const room of next.rooms) {
        if (command.targetRoomId && room.id !== command.targetRoomId) continue;
        if (room.isOutdoor) continue;
        if (room.roomType === 'bathroom' || room.roomType === 'laundry') {
          room.floorMaterialId = preset.wetAreaFloorMaterialId;
        } else if (
          room.roomType === 'master_bedroom' ||
          room.roomType === 'bedroom' ||
          room.roomType === 'study'
        ) {
          room.floorMaterialId = preset.bedroomFloorMaterialId;
          room.wallMaterialId =
            room.roomType === 'master_bedroom'
              ? preset.featureWallMaterialId
              : preset.primaryWallMaterialId;
        } else if (room.roomType !== 'garage') {
          room.floorMaterialId = preset.livingFloorMaterialId;
          room.wallMaterialId = preset.primaryWallMaterialId;
        }
      }
      // Refresh key living/dining furniture finishes to match chosen Australian style
      for (let i = 0; i < next.furniture.length; i++) {
        const f = next.furniture[i]!;
        if (command.targetRoomId && f.roomId !== command.targetRoomId) continue;
        if (f.catalogId.startsWith('sofa-')) {
          const entry = getFurnitureCatalogEntry(preset.sofaCatalogId);
          if (entry) {
            next.furniture[i] = {
              ...f,
              catalogId: entry.catalogId,
              name: entry.name,
              dimensions: { ...entry.dimensions },
              primaryMaterialId: preset.sofaMaterialId,
              secondaryMaterialId: preset.timberToneMaterialId,
              priceAUD: entry.priceAUD,
            };
          }
        } else if (
          f.catalogId === 'table-coastal-coffee' ||
          f.catalogId === 'table-travertine-plinth'
        ) {
          const entry = getFurnitureCatalogEntry(preset.coffeeTableCatalogId);
          if (entry) {
            next.furniture[i] = {
              ...f,
              catalogId: entry.catalogId,
              name: entry.name,
              glbUrl: entry.glbUrl,
              dimensions: { ...entry.dimensions },
              primaryMaterialId: entry.defaultPrimaryMaterialId,
              secondaryMaterialId: entry.defaultSecondaryMaterialId,
              priceAUD: entry.priceAUD,
            };
          }
        } else if (f.catalogId.startsWith('table-dining-')) {
          const entry = getFurnitureCatalogEntry(preset.diningCatalogId);
          if (entry) {
            next.furniture[i] = {
              ...f,
              catalogId: entry.catalogId,
              name: entry.name,
              dimensions: { ...entry.dimensions },
              primaryMaterialId: entry.defaultPrimaryMaterialId,
              secondaryMaterialId: entry.defaultSecondaryMaterialId,
              priceAUD: entry.priceAUD,
            };
          }
        }
      }
      break;
    }
    case 'update_lighting': {
      if (command.timeOfDay) next.lighting.timeOfDay = command.timeOfDay;
      if (command.exposure !== undefined) next.lighting.exposure = command.exposure;
      if (command.interiorLightsOn !== undefined) {
        next.lighting.interiorLightsOn = command.interiorLightsOn;
      }
      break;
    }
  }

  return next;
}
