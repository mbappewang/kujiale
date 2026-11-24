import { AssetLoadAbortedError, AssetLoadError, AssetManager } from '@kujiale/asset-manager';
import {
  addWallToScene,
  applyMeasuredScaleCalibration,
  moveSharedWallVertex,
} from '@kujiale/floorplan-editor';
import {
  applyDesignCommand,
  generateRuleBasedFurnitureForScene,
  validateFurniturePlacement,
} from '@kujiale/furniture';
import { collectWallOpenings, generateHouse3D } from '@kujiale/house-generator';
import { computeAustralianSolarPosition, LightingSystem } from '@kujiale/lighting';
import { MaterialSystem } from '@kujiale/materials';
import { createSydneyCoastalDemoScene, MaterialCategorySchema } from '@kujiale/scene-schema';
import { HouseSceneEngine } from '@kujiale/three-engine';
import {
  buildWalkthroughColliders,
  resolveWalkthroughPosition,
  sampleWalkableGroundElevation,
} from '@kujiale/walkthrough';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

describe('3D Engine, Geometry, PBR, Solar Lighting, Walkthrough & Asset Tests', () => {
  it('computes accurate Southern Hemisphere solar trajectory for Sydney, Australia', () => {
    const scene = createSydneyCoastalDemoScene();
    const noon = computeAustralianSolarPosition(scene.property, {
      timeOfDay: 'noon',
      month: 11,
      dayOfMonth: 25,
    });
    const morning = computeAustralianSolarPosition(scene.property, {
      timeOfDay: 'morning',
      month: 11,
      dayOfMonth: 25,
    });
    const afternoon = computeAustralianSolarPosition(scene.property, {
      timeOfDay: 'afternoon',
      month: 11,
      dayOfMonth: 25,
    });

    // In Sydney (-33.87° lat), solar noon sun is high in the NORTHERN sky (-Z)
    expect(noon.elevationDegrees).toBeGreaterThan(60);
    expect(noon.directionToSun.z).toBeLessThan(0);

    // Morning sun rises in the East (+X); afternoon sun moves to the West (-X)
    expect(morning.directionToSun.x).toBeGreaterThan(0.2);
    expect(afternoon.directionToSun.x).toBeLessThan(-0.2);
  });

  it('provides all 13 required PBR material categories with Albedo, Normal, Roughness & AO maps', () => {
    const materials = new MaterialSystem('medium');
    for (const cat of MaterialCategorySchema.options) {
      const specs = materials.getSpecsByCategory(cat);
      expect(specs.length, `Missing category: ${cat}`).toBeGreaterThanOrEqual(1);
    }

    const spottedGum = materials.getMaterial('timber-spotted-gum') as THREE.MeshStandardMaterial;
    expect(spottedGum).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(spottedGum.map).toBeTruthy();
    expect(spottedGum.normalMap).toBeTruthy();
    expect(spottedGum.roughnessMap).toBeTruthy();
    expect(spottedGum.aoMap).toBeTruthy();

    // Verify instance caching reuses identical material requests
    const cachedAgain = materials.getMaterial('timber-spotted-gum');
    expect(cachedAgain).toBe(spottedGum);
    materials.dispose();
  });

  it('generates procedural 3D house geometry with wall openings and syncs 2D wall edits', () => {
    const materials = new MaterialSystem('low');
    const scene = createSydneyCoastalDemoScene();
    const house = generateHouse3D(scene, materials);

    expect(house.stats.floorMeshes).toBe(12);
    expect(house.stats.wallMeshes).toBeGreaterThanOrEqual(32);
    expect(house.stats.doorAssemblies).toBe(scene.doors.length);
    expect(house.stats.windowAssemblies).toBe(scene.windows.length);

    // Verify Living North wall carves exact opening span for the 3.4m Alfresco glass door
    const livingNorthWall = scene.walls.find((w) => w.id === 'wall-ext-north-west')!;
    const spans = collectWallOpenings(livingNorthWall, 5.7, scene.doors, scene.windows);
    expect(spans.length).toBe(1);
    expect(spans[0]!.uEnd - spans[0]!.uStart).toBeCloseTo(3.4, 2);

    // Phase 2 requirement: edit shared corner in 2D and regenerate 3D cleanly
    const edited = moveSharedWallVertex(
      scene,
      { x: -6.5, z: -6.0 },
      { x: -7.0, z: -6.0 },
      0.05,
    );
    const withExtraWall = addWallToScene(edited, { x: -5.0, z: -3.0 }, { x: -3.5, z: -3.0 });
    const calibrated = applyMeasuredScaleCalibration(withExtraWall, 5.0, 5.0);
    const rebuiltHouse = generateHouse3D(calibrated, materials);
    expect(rebuiltHouse.stats.wallMeshes).toBeGreaterThan(house.stats.wallMeshes);

    materials.dispose();
  });

  it('validates canonical & auto-generated furniture schemes without wall penetration or door blocking', () => {
    const baseScene = createSydneyCoastalDemoScene();
    for (const item of baseScene.furniture) {
      const check = validateFurniturePlacement(item, baseScene);
      expect(check.valid, `${item.id}: ${JSON.stringify(check.issues)}`).toBe(true);
    }

    // Generate two distinct Australian interior schemes on the same floor plan
    const coastalItems = generateRuleBasedFurnitureForScene(baseScene, 'modern_coastal');
    const urbanItems = generateRuleBasedFurnitureForScene(baseScene, 'sydney_contemporary');
    expect(coastalItems.length).toBeGreaterThanOrEqual(6);
    expect(urbanItems.length).toBeGreaterThanOrEqual(6);

    const coastalScene = applyDesignCommand(
      { ...baseScene, furniture: coastalItems },
      { type: 'apply_style_preset', styleId: 'modern_coastal' },
    );
    const urbanScene = applyDesignCommand(
      { ...baseScene, furniture: urbanItems },
      { type: 'apply_style_preset', styleId: 'sydney_contemporary' },
    );
    expect(coastalScene.rooms[0]!.floorMaterialId).not.toBe(urbanScene.rooms[0]!.floorMaterialId);

    for (const item of urbanScene.furniture) {
      const res = validateFurniturePlacement(item, urbanScene);
      expect(res.valid, `${item.id}: ${JSON.stringify(res.issues)}`).toBe(true);
    }
  });

  it('supports continuous walkthrough from Front Yard through Hallway & Living out to Backyard Patio while blocking solid walls', () => {
    const scene = createSydneyCoastalDemoScene();
    const colliders = buildWalkthroughColliders(scene, 'ground');

    // 1. Open front door (x=0.2, z=8.0) allows walking North from porch into hallway
    const throughFrontDoor = resolveWalkthroughPosition({ x: 0.2, z: 7.95 }, scene, colliders);
    expect(throughFrontDoor.z).toBeCloseTo(7.95, 2);

    // 2. Open Alfresco sliding stacker door (x=-3.65, z=-6.0) allows walking from Living onto Timber Deck!
    const throughAlfrescoDoor = resolveWalkthroughPosition(
      { x: -3.65, z: -6.05 },
      scene,
      colliders,
    );
    expect(throughAlfrescoDoor.z).toBeCloseTo(-6.05, 2);

    // 3. Solid exterior wall (x=4.0, z=-6.0) pushes player back cleanly!
    const blockedBySolidWall = resolveWalkthroughPosition({ x: 4.0, z: -5.9 }, scene, colliders);
    expect(blockedBySolidWall.z).not.toBeCloseTo(-5.9, 3);

    // 4. Ground elevation transitions smoothly from Front Lawn (0.0m) -> Indoor Slab (0.16m) -> Alfresco Deck (0.12m)
    expect(sampleWalkableGroundElevation({ x: -5.0, z: 12.0 }, scene)).toBeCloseTo(0.0, 3);
    expect(sampleWalkableGroundElevation({ x: -3.5, z: -3.0 }, scene)).toBeCloseTo(0.16, 3);
    expect(sampleWalkableGroundElevation({ x: -3.5, z: -8.0 }, scene)).toBeCloseTo(0.12, 3);
  });

  it('handles headless HouseSceneEngine load/dispose and AssetManager load errors & cancellation cleanly', async () => {
    const engine = new HouseSceneEngine({ quality: 'low' });
    const scene = createSydneyCoastalDemoScene();
    engine.loadScene(scene);
    expect(engine.getSolarPosition()).not.toBeNull();
    engine.setNavigationMode('top_down');
    engine.setRoofCutaway(true);
    expect(engine.getRoofCutaway()).toBe(true);
    engine.dispose();

    // Lighting auto-exposure increases exposure indoors vs sunny outdoors
    const lighting = new LightingSystem(512);
    const outdoorExp = lighting.updateExposure(
      { x: 0, y: 1.7, z: 12 },
      scene.rooms,
      scene.lighting,
      1.0,
    );
    const indoorExp = lighting.updateExposure(
      { x: -3.5, y: 1.7, z: -3.5 },
      scene.rooms,
      scene.lighting,
      2.0,
    );
    expect(indoorExp).toBeGreaterThan(outdoorExp);
    lighting.dispose();

    // AssetManager error & cancellation tests
    const failingManager = new AssetManager({
      customFetch: async () => new Response('Not Found', { status: 404, statusText: 'Not Found' }),
    });
    await expect(failingManager.loadGlbModel('relative/unsafe/path.glb')).rejects.toBeInstanceOf(
      AssetLoadError,
    );
    await expect(failingManager.loadGlbModel('/models/missing.glb')).rejects.toBeInstanceOf(
      AssetLoadError,
    );

    const abortController = new AbortController();
    abortController.abort();
    await expect(
      failingManager.loadGlbModel('/models/cancelled.glb', abortController.signal),
    ).rejects.toBeInstanceOf(AssetLoadAbortedError);
  });
});
