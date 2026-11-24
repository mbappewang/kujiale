import { z } from 'zod';

export const SCHEMA_VERSION = '1.0' as const;

export const Point2DSchema = z.object({
  x: z.number().finite(),
  z: z.number().finite(),
});

export const Vec3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

export const HouseTypologySchema = z.enum([
  'detached',
  'single_storey',
  'double_storey',
  'townhouse',
]);
export type HouseTypology = z.infer<typeof HouseTypologySchema>;

export const RoomTypeSchema = z.enum([
  'living_room',
  'dining_room',
  'kitchen',
  'master_bedroom',
  'bedroom',
  'bathroom',
  'laundry',
  'hallway',
  'garage',
  'staircase',
  'study',
  'patio',
  'porch',
]);
export type RoomType = z.infer<typeof RoomTypeSchema>;

export const MaterialCategorySchema = z.enum([
  'timber_floor',
  'ceramic_tile',
  'marble',
  'concrete',
  'brick',
  'plaster',
  'paint',
  'glass',
  'metal',
  'fabric',
  'leather',
  'grass',
  'roof_tile',
]);
export type MaterialCategory = z.infer<typeof MaterialCategorySchema>;

export const DataSourceKindSchema = z.enum(['manual', 'ai', 'assisted', 'preset']);
export type DataSourceKind = z.infer<typeof DataSourceKindSchema>;

export const PropertyMetaSchema = z.object({
  country: z.literal('AU').default('AU'),
  city: z.string().min(1).default('Sydney'),
  latitude: z.number().min(-45).max(-10).default(-33.8688),
  longitude: z.number().min(110).max(155).default(151.2093),
  orientationDegrees: z.number().min(-180).max(360).default(0),
  typology: HouseTypologySchema.default('single_storey'),
  lotWidth: z.number().positive().default(20),
  lotDepth: z.number().positive().default(28),
  roofPitchDegrees: z.number().min(5).max(45).default(22),
  roofMaterialId: z.string().default('roof-colorbond-monument'),
  exteriorWallMaterialId: z.string().default('brick-sydney-sandstock'),
});
export type PropertyMeta = z.infer<typeof PropertyMetaSchema>;

export const FloorLevelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  levelIndex: z.number().int().min(0),
  elevation: z.number().min(-5).max(50),
  ceilingHeight: z.number().min(2.1).max(6.0).default(2.85),
  slabThickness: z.number().min(0.05).max(1.0).default(0.18),
});
export type FloorLevel = z.infer<typeof FloorLevelSchema>;

export const RoomDataSchema = z.object({
  id: z.string().min(1),
  floorId: z.string().min(1),
  name: z.string().min(1),
  roomType: RoomTypeSchema,
  polygon: z.array(Point2DSchema).min(3),
  floorMaterialId: z.string().min(1),
  wallMaterialId: z.string().min(1),
  ceilingMaterialId: z.string().default('paint-crisp-white'),
  isOutdoor: z.boolean().default(false),
  elevationOffset: z.number().default(0),
  confidence: z.number().min(0).max(1).optional(),
  source: DataSourceKindSchema.optional(),
});
export type RoomData = z.infer<typeof RoomDataSchema>;

export const WallDataSchema = z.object({
  id: z.string().min(1),
  floorId: z.string().min(1),
  start: Point2DSchema,
  end: Point2DSchema,
  thickness: z.number().min(0.05).max(1.0).default(0.12),
  height: z.number().min(0.5).max(6.0).default(2.85),
  isExterior: z.boolean().default(false),
  interiorMaterialId: z.string().default('plaster-coastal-white'),
  exteriorMaterialId: z.string().default('brick-sydney-sandstock'),
  confidence: z.number().min(0).max(1).optional(),
  source: DataSourceKindSchema.optional(),
});
export type WallData = z.infer<typeof WallDataSchema>;

export const DoorTypeSchema = z.enum([
  'hinged',
  'sliding_glass',
  'double_entry',
  'garage_sectional',
  'opening',
]);
export type DoorType = z.infer<typeof DoorTypeSchema>;

export const DoorDataSchema = z.object({
  id: z.string().min(1),
  floorId: z.string().min(1),
  wallId: z.string().min(1),
  /** Normalized position [0..1] of door centre along wall start->end */
  positionAlongWall: z.number().min(0.02).max(0.98),
  width: z.number().min(0.5).max(6.0).default(0.86),
  height: z.number().min(1.8).max(3.0).default(2.15),
  doorType: DoorTypeSchema.default('hinged'),
  isOpen: z.boolean().default(true),
  swingDirection: z.enum(['left', 'right']).default('left'),
  materialId: z.string().default('timber-coastal-oak'),
  frameMaterialId: z.string().default('metal-monument-matte'),
  confidence: z.number().min(0).max(1).optional(),
});
export type DoorData = z.infer<typeof DoorDataSchema>;

export const WindowDataSchema = z.object({
  id: z.string().min(1),
  floorId: z.string().min(1),
  wallId: z.string().min(1),
  /** Normalized position [0..1] of window centre along wall start->end */
  positionAlongWall: z.number().min(0.05).max(0.95),
  width: z.number().min(0.4).max(6.0).default(1.8),
  height: z.number().min(0.4).max(2.6).default(1.35),
  sillHeight: z.number().min(0.0).max(2.2).default(0.85),
  panels: z.number().int().min(1).max(4).default(2),
  glassMaterialId: z.string().default('glass-architectural-clear'),
  frameMaterialId: z.string().default('metal-monument-matte'),
  confidence: z.number().min(0).max(1).optional(),
});
export type WindowData = z.infer<typeof WindowDataSchema>;

export const FurnitureCategorySchema = z.enum([
  'seating',
  'table',
  'bed',
  'storage',
  'kitchen',
  'bathroom',
  'laundry',
  'lighting_decor',
  'outdoor',
]);
export type FurnitureCategory = z.infer<typeof FurnitureCategorySchema>;

export const FurnitureItemDataSchema = z.object({
  id: z.string().min(1),
  catalogId: z.string().min(1),
  name: z.string().min(1),
  category: FurnitureCategorySchema,
  floorId: z.string().min(1),
  roomId: z.string().optional(),
  glbUrl: z.string().optional(),
  dimensions: Vec3Schema, // { x: width, y: height, z: depth } in metres
  position: Vec3Schema, // floor base centre { x, y, z } in metres
  rotationY: z.number().finite().default(0), // radians
  scale: Vec3Schema.default({ x: 1, y: 1, z: 1 }),
  primaryMaterialId: z.string().optional(),
  secondaryMaterialId: z.string().optional(),
  priceAUD: z.number().nonnegative().default(0),
});
export type FurnitureItemData = z.infer<typeof FurnitureItemDataSchema>;

export const MaterialOverrideSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: MaterialCategorySchema,
  baseColorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  roughness: z.number().min(0).max(1),
  metalness: z.number().min(0).max(1),
  tileSizeMeters: z.number().min(0.05).max(10).default(1.5),
});
export type MaterialOverride = z.infer<typeof MaterialOverrideSchema>;

export const LandscapeElementTypeSchema = z.enum([
  'lawn',
  'driveway',
  'footpath',
  'fence',
  'pergola',
  'swimming_pool',
  'tree_eucalyptus',
  'shrub_native',
  'garden_bed',
]);
export type LandscapeElementType = z.infer<typeof LandscapeElementTypeSchema>;

export const LandscapeElementDataSchema = z.object({
  id: z.string().min(1),
  type: LandscapeElementTypeSchema,
  name: z.string().min(1),
  polygon: z.array(Point2DSchema).optional(),
  position: Point2DSchema.optional(),
  scale: z.number().positive().default(1),
  rotationY: z.number().default(0),
  height: z.number().positive().optional(),
  materialId: z.string().optional(),
});
export type LandscapeElementData = z.infer<typeof LandscapeElementDataSchema>;

export const TimeOfDayPresetSchema = z.enum(['morning', 'noon', 'afternoon', 'evening']);
export type TimeOfDayPreset = z.infer<typeof TimeOfDayPresetSchema>;

export const LightingConfigSchema = z.object({
  timeOfDay: TimeOfDayPresetSchema.default('afternoon'),
  month: z.number().int().min(1).max(12).default(11), // November (Australian late spring/summer)
  dayOfMonth: z.number().int().min(1).max(31).default(25),
  exposure: z.number().min(0.3).max(2.5).default(1.08),
  autoIndoorExposure: z.boolean().default(true),
  shadowsEnabled: z.boolean().default(true),
  environmentIntensity: z.number().min(0.1).max(3.0).default(0.95),
  interiorLightsOn: z.boolean().default(true),
});
export type LightingConfig = z.infer<typeof LightingConfigSchema>;

export const FloorplanOverlaySchema = z.object({
  floorplanId: z.string().optional(),
  imageUrl: z.string().optional(),
  pixelsPerMeter: z.number().positive().default(50),
  opacity: z.number().min(0).max(1).default(0.45),
  offsetX: z.number().default(0),
  offsetZ: z.number().default(0),
  calibrated: z.boolean().default(true),
});
export type FloorplanOverlay = z.infer<typeof FloorplanOverlaySchema>;

export const StylePresetIdSchema = z.enum([
  'modern_coastal',
  'sydney_contemporary',
  'melbourne_heritage',
  'outback_minimalist',
]);
export type StylePresetId = z.infer<typeof StylePresetIdSchema>;

export const SceneDataSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  unit: z.literal('m').default('m'),
  coordinateSystem: z.literal('Y_UP').default('Y_UP'),
  activeStyleId: StylePresetIdSchema.default('modern_coastal'),
  property: PropertyMetaSchema,
  floors: z.array(FloorLevelSchema).min(1),
  rooms: z.array(RoomDataSchema),
  walls: z.array(WallDataSchema),
  doors: z.array(DoorDataSchema),
  windows: z.array(WindowDataSchema),
  furniture: z.array(FurnitureItemDataSchema),
  materials: z.array(MaterialOverrideSchema).default([]),
  landscape: z.array(LandscapeElementDataSchema),
  lighting: LightingConfigSchema,
  floorplanOverlay: FloorplanOverlaySchema.optional(),
});
export type SceneData = z.infer<typeof SceneDataSchema>;

// ============================================================================
// Structured Design Commands (AI Interior Designer -> Validated Scene Updates)
// ============================================================================

export const DesignCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('update_room_material'),
    roomId: z.string().min(1),
    target: z.enum(['floor', 'wall', 'ceiling']),
    materialId: z.string().min(1),
  }),
  z.object({
    type: z.literal('update_exterior_material'),
    target: z.enum(['exterior_wall', 'roof']),
    materialId: z.string().min(1),
  }),
  z.object({
    type: z.literal('replace_furniture'),
    furnitureId: z.string().min(1),
    newCatalogId: z.string().min(1),
    primaryMaterialId: z.string().optional(),
  }),
  z.object({
    type: z.literal('add_furniture'),
    roomId: z.string().min(1),
    catalogId: z.string().min(1),
    position: Vec3Schema.optional(),
    rotationY: z.number().optional(),
    primaryMaterialId: z.string().optional(),
  }),
  z.object({
    type: z.literal('remove_furniture'),
    furnitureId: z.string().min(1),
  }),
  z.object({
    type: z.literal('apply_style_preset'),
    styleId: StylePresetIdSchema,
    targetRoomId: z.string().optional(),
  }),
  z.object({
    type: z.literal('update_lighting'),
    timeOfDay: TimeOfDayPresetSchema.optional(),
    exposure: z.number().min(0.3).max(2.5).optional(),
    interiorLightsOn: z.boolean().optional(),
  }),
]);
export type DesignCommand = z.infer<typeof DesignCommandSchema>;
