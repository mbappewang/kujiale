import type { Vec3 } from '@kujiale/shared';
import type { FurnitureCategory, RoomType } from '@kujiale/scene-schema';

export interface FurnitureCatalogEntry {
  catalogId: string;
  name: string;
  category: FurnitureCategory;
  dimensions: Vec3; // { x: width, y: height, z: depth } in metres
  defaultPrimaryMaterialId: string;
  defaultSecondaryMaterialId: string;
  priceAUD: number;
  glbUrl?: string;
  suitableRooms: RoomType[];
  isWalkableUnderOrOver?: boolean; // e.g. flat floor rugs
}

export const FURNITURE_CATALOG: readonly FurnitureCatalogEntry[] = [
  {
    catalogId: 'sofa-coastal-3seat',
    name: 'Byron 3-Seater Linen Sofa',
    category: 'seating',
    dimensions: { x: 2.35, y: 0.82, z: 0.96 },
    defaultPrimaryMaterialId: 'fabric-coastal-linen',
    defaultSecondaryMaterialId: 'timber-coastal-oak',
    priceAUD: 3290,
    suitableRooms: ['living_room'],
  },
  {
    catalogId: 'sofa-leather-modular',
    name: 'Paddington Tan Leather Lounge',
    category: 'seating',
    dimensions: { x: 2.45, y: 0.8, z: 0.98 },
    defaultPrimaryMaterialId: 'leather-tan-saddle',
    defaultSecondaryMaterialId: 'metal-monument-matte',
    priceAUD: 4490,
    suitableRooms: ['living_room'],
  },
  {
    catalogId: 'armchair-boucle',
    name: 'Noosa Occasional Armchair',
    category: 'seating',
    dimensions: { x: 0.84, y: 0.78, z: 0.84 },
    defaultPrimaryMaterialId: 'fabric-charcoal-boucle',
    defaultSecondaryMaterialId: 'timber-spotted-gum',
    priceAUD: 1190,
    suitableRooms: ['living_room', 'master_bedroom', 'study'],
  },
  {
    catalogId: 'table-coastal-coffee',
    name: 'Spotted Gum Oval Coffee Table',
    category: 'table',
    dimensions: { x: 1.35, y: 0.4, z: 0.72 },
    defaultPrimaryMaterialId: 'timber-spotted-gum',
    defaultSecondaryMaterialId: 'marble-travertine',
    priceAUD: 980,
    glbUrl: '/models/coastal-coffee-table.glb',
    suitableRooms: ['living_room'],
  },
  {
    catalogId: 'table-travertine-plinth',
    name: 'Sculpted Travertine Plinth Coffee Table',
    category: 'table',
    dimensions: { x: 1.2, y: 0.38, z: 0.8 },
    defaultPrimaryMaterialId: 'marble-travertine',
    defaultSecondaryMaterialId: 'marble-carrara-honed',
    priceAUD: 1450,
    suitableRooms: ['living_room'],
  },
  {
    catalogId: 'storage-lowline-media',
    name: 'Lowline Timber Entertainment Unit',
    category: 'storage',
    dimensions: { x: 2.1, y: 0.54, z: 0.46 },
    defaultPrimaryMaterialId: 'timber-spotted-gum',
    defaultSecondaryMaterialId: 'metal-monument-matte',
    priceAUD: 1650,
    suitableRooms: ['living_room'],
  },
  {
    catalogId: 'decor-jute-rug',
    name: 'Woven Jute & Wool Area Rug',
    category: 'lighting_decor',
    dimensions: { x: 3.0, y: 0.015, z: 2.2 },
    defaultPrimaryMaterialId: 'fabric-coastal-linen',
    defaultSecondaryMaterialId: 'fabric-coastal-linen',
    priceAUD: 790,
    suitableRooms: ['living_room', 'master_bedroom', 'dining_room'],
    isWalkableUnderOrOver: true,
  },
  {
    catalogId: 'table-dining-6seat',
    name: 'Australian Oak 6-Seater Dining Suite',
    category: 'table',
    dimensions: { x: 2.0, y: 0.76, z: 1.05 },
    defaultPrimaryMaterialId: 'timber-coastal-oak',
    defaultSecondaryMaterialId: 'fabric-coastal-linen',
    priceAUD: 2850,
    suitableRooms: ['dining_room'],
  },
  {
    catalogId: 'table-dining-marble',
    name: 'Fitzroy Marble & Monument Dining Suite',
    category: 'table',
    dimensions: { x: 2.05, y: 0.76, z: 1.05 },
    defaultPrimaryMaterialId: 'marble-carrara-honed',
    defaultSecondaryMaterialId: 'fabric-charcoal-boucle',
    priceAUD: 3690,
    suitableRooms: ['dining_room'],
  },
  {
    catalogId: 'kitchen-island-bench',
    name: 'Waterfall Stone Kitchen Island & Stools',
    category: 'kitchen',
    dimensions: { x: 2.1, y: 0.92, z: 0.92 },
    defaultPrimaryMaterialId: 'marble-carrara-honed',
    defaultSecondaryMaterialId: 'timber-coastal-oak',
    priceAUD: 4800,
    suitableRooms: ['kitchen'],
  },
  {
    catalogId: 'kitchen-wall-joinery',
    name: 'Cooktop & Integrated Cabinetry Run',
    category: 'kitchen',
    dimensions: { x: 2.4, y: 2.2, z: 0.65 },
    defaultPrimaryMaterialId: 'paint-crisp-white',
    defaultSecondaryMaterialId: 'marble-carrara-honed',
    priceAUD: 6400,
    suitableRooms: ['kitchen'],
  },
  {
    catalogId: 'bed-queen-coastal',
    name: 'Upholstered Coastal Timber Bed',
    category: 'bed',
    dimensions: { x: 1.75, y: 1.1, z: 2.14 },
    defaultPrimaryMaterialId: 'fabric-coastal-linen',
    defaultSecondaryMaterialId: 'timber-coastal-oak',
    priceAUD: 2390,
    suitableRooms: ['master_bedroom', 'bedroom'],
  },
  {
    catalogId: 'storage-robe-double',
    name: 'Built-In Timber Veneer Wardrobe',
    category: 'storage',
    dimensions: { x: 2.1, y: 2.35, z: 0.6 },
    defaultPrimaryMaterialId: 'timber-coastal-oak',
    defaultSecondaryMaterialId: 'metal-brushed-nickel',
    priceAUD: 2400,
    suitableRooms: ['master_bedroom', 'bedroom'],
  },
  {
    catalogId: 'table-study-desk',
    name: 'Home Office Timber Workstation',
    category: 'table',
    dimensions: { x: 1.55, y: 0.75, z: 0.72 },
    defaultPrimaryMaterialId: 'timber-spotted-gum',
    defaultSecondaryMaterialId: 'leather-tan-saddle',
    priceAUD: 1290,
    suitableRooms: ['study', 'bedroom'],
  },
  {
    catalogId: 'bath-freestanding-oval',
    name: 'Sculptural Matte Stone Freestanding Bath',
    category: 'bathroom',
    dimensions: { x: 1.72, y: 0.6, z: 0.82 },
    defaultPrimaryMaterialId: 'marble-carrara-honed',
    defaultSecondaryMaterialId: 'metal-brushed-nickel',
    priceAUD: 2350,
    suitableRooms: ['bathroom'],
  },
  {
    catalogId: 'bath-vanity-double',
    name: 'Floating Fluted Oak Double Vanity',
    category: 'bathroom',
    dimensions: { x: 1.6, y: 0.86, z: 0.52 },
    defaultPrimaryMaterialId: 'timber-coastal-oak',
    defaultSecondaryMaterialId: 'marble-carrara-honed',
    priceAUD: 1890,
    suitableRooms: ['bathroom'],
  },
  {
    catalogId: 'laundry-cabinet-washer',
    name: 'Laundry Trough & Front-Loader Joinery',
    category: 'laundry',
    dimensions: { x: 1.5, y: 0.9, z: 0.65 },
    defaultPrimaryMaterialId: 'paint-crisp-white',
    defaultSecondaryMaterialId: 'marble-travertine',
    priceAUD: 1750,
    suitableRooms: ['laundry'],
  },
  {
    catalogId: 'outdoor-alfresco-lounge',
    name: 'Alfresco Teak Outdoor Dining Setting',
    category: 'outdoor',
    dimensions: { x: 2.2, y: 0.76, z: 1.1 },
    defaultPrimaryMaterialId: 'timber-blackbutt-deck',
    defaultSecondaryMaterialId: 'fabric-coastal-linen',
    priceAUD: 2790,
    suitableRooms: ['patio'],
  },
];

export function getFurnitureCatalogEntry(catalogId: string): FurnitureCatalogEntry | undefined {
  return FURNITURE_CATALOG.find((c) => c.catalogId === catalogId);
}
