import type { SceneData } from '@kujiale/scene-schema';
import type { MaterialSystem } from '@kujiale/materials';
import * as THREE from 'three';
import { buildDoorAssembly, buildWindowAssembly } from './openings-builder';
import {
  buildAustralianHipRoof,
  buildRoomSlabsAndCeilings,
  buildStaircaseAssembly,
} from './slab-roof-builder';
import { buildWallGroup, collectWallOpenings } from './wall-builder';

export { collectWallOpenings };

export interface GeneratedHouseHierarchy {
  root: THREE.Group;
  floorsGroup: THREE.Group;
  wallsGroup: THREE.Group;
  openingsGroup: THREE.Group;
  ceilingsGroup: THREE.Group;
  roofGroup: THREE.Group;
  stats: {
    wallMeshes: number;
    floorMeshes: number;
    doorAssemblies: number;
    windowAssemblies: number;
  };
}

/**
 * Generates the complete, metric-accurate 3D architectural building hierarchy from SceneData.
 */
export function generateHouse3D(
  sceneData: SceneData,
  materials: MaterialSystem,
): GeneratedHouseHierarchy {
  const root = new THREE.Group();
  root.name = 'ProceduralHouseRoot';

  const floorsGroup = new THREE.Group();
  floorsGroup.name = 'FloorsGroup';
  const wallsGroup = new THREE.Group();
  wallsGroup.name = 'WallsGroup';
  const openingsGroup = new THREE.Group();
  openingsGroup.name = 'OpeningsGroup';
  const ceilingsGroup = new THREE.Group();
  ceilingsGroup.name = 'CeilingsGroup';

  const floorById = new Map(sceneData.floors.map((f) => [f.id, f]));
  const defaultFloor = sceneData.floors[0] ?? {
    id: 'ground',
    name: 'Ground Floor',
    levelIndex: 0,
    elevation: 0.16,
    ceilingHeight: 2.85,
    slabThickness: 0.16,
  };

  let floorMeshes = 0;
  for (const room of sceneData.rooms) {
    const floor = floorById.get(room.floorId) ?? defaultFloor;
    const { floorMesh, ceilingGroup } = buildRoomSlabsAndCeilings(room, floor, materials);
    if (floorMesh) {
      floorsGroup.add(floorMesh);
      floorMeshes++;
    }
    if (ceilingGroup) {
      ceilingsGroup.add(ceilingGroup);
    }
    if (room.roomType === 'staircase') {
      floorsGroup.add(buildStaircaseAssembly(room, floor, materials));
    }
  }

  const wallById = new Map(sceneData.walls.map((w) => [w.id, w]));
  let wallMeshes = 0;

  for (const wall of sceneData.walls) {
    const floor = floorById.get(wall.floorId) ?? defaultFloor;
    const floorWalls = sceneData.walls.filter((w) => w.floorId === wall.floorId);
    const floorRooms = sceneData.rooms.filter((r) => r.floorId === wall.floorId);
    const wallGroup = buildWallGroup(
      wall,
      floor.elevation,
      floor.slabThickness,
      floorWalls,
      floorRooms,
      sceneData.doors,
      sceneData.windows,
      sceneData.property,
      materials,
    );
    wallMeshes += wallGroup.children.length;
    wallsGroup.add(wallGroup);
  }

  let doorAssemblies = 0;
  for (const door of sceneData.doors) {
    const wall = wallById.get(door.wallId);
    if (!wall) continue;
    const floor = floorById.get(door.floorId) ?? defaultFloor;
    openingsGroup.add(buildDoorAssembly(door, wall, floor.elevation, materials));
    doorAssemblies++;
  }

  let windowAssemblies = 0;
  for (const win of sceneData.windows) {
    const wall = wallById.get(win.wallId);
    if (!wall) continue;
    const floor = floorById.get(win.floorId) ?? defaultFloor;
    openingsGroup.add(buildWindowAssembly(win, wall, floor.elevation, materials));
    windowAssemblies++;
  }

  const highestFloor = [...sceneData.floors].sort((a, b) => b.elevation - a.elevation)[0] ?? defaultFloor;
  const roofGroup = buildAustralianHipRoof(
    sceneData.walls,
    highestFloor,
    sceneData.property,
    materials,
  );

  root.add(floorsGroup, wallsGroup, openingsGroup, ceilingsGroup, roofGroup);

  return {
    root,
    floorsGroup,
    wallsGroup,
    openingsGroup,
    ceilingsGroup,
    roofGroup,
    stats: {
      wallMeshes,
      floorMeshes,
      doorAssemblies,
      windowAssemblies,
    },
  };
}
