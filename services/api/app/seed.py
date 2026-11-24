from __future__ import annotations

from typing import Any


def build_default_sydney_scene_dict(city: str = "Sydney", orientation_deg: float = 0.0) -> dict[str, Any]:
    """
    Server-side canonical Australian residential starter scene (matches @kujiale/scene-schema).
    """
    city_coords: dict[str, tuple[float, float]] = {
        "Sydney": (-33.8688, 151.2093),
        "Melbourne": (-37.8136, 144.9631),
        "Brisbane": (-27.4705, 153.0260),
        "Perth": (-31.9505, 115.8605),
        "Adelaide": (-34.9285, 138.6007),
        "Canberra": (-35.2809, 149.1300),
        "Hobart": (-42.8821, 147.3272),
    }
    lat, lon = city_coords.get(city, (-33.8688, 151.2093))

    def rect(x0: float, z0: float, x1: float, z1: float) -> list[dict[str, float]]:
        return [
            {"x": x0, "z": z0},
            {"x": x1, "z": z0},
            {"x": x1, "z": z1},
            {"x": x0, "z": z1},
        ]

    return {
        "schemaVersion": "1.0",
        "unit": "m",
        "coordinateSystem": "Y_UP",
        "activeStyleId": "modern_coastal",
        "property": {
            "country": "AU",
            "city": city,
            "latitude": lat,
            "longitude": lon,
            "orientationDegrees": orientation_deg,
            "typology": "single_storey",
            "lotWidth": 22,
            "lotDepth": 30,
            "roofPitchDegrees": 21,
            "roofMaterialId": "roof-colorbond-monument",
            "exteriorWallMaterialId": "brick-sydney-sandstock",
        },
        "floors": [
            {
                "id": "ground",
                "name": "Ground Floor",
                "levelIndex": 0,
                "elevation": 0.16,
                "ceilingHeight": 2.85,
                "slabThickness": 0.16,
            }
        ],
        "rooms": [
            {"id": "room-living", "floorId": "ground", "name": "Living Room", "roomType": "living_room", "polygon": rect(-6.5, -6.0, -0.8, -1.5), "floorMaterialId": "timber-spotted-gum", "wallMaterialId": "plaster-coastal-white", "ceilingMaterialId": "paint-crisp-white", "isOutdoor": False, "elevationOffset": 0, "confidence": 0.99, "source": "preset"},
            {"id": "room-dining", "floorId": "ground", "name": "Dining Room", "roomType": "dining_room", "polygon": rect(-6.5, -1.5, -3.5, 2.2), "floorMaterialId": "timber-spotted-gum", "wallMaterialId": "plaster-coastal-white", "ceilingMaterialId": "paint-crisp-white", "isOutdoor": False, "elevationOffset": 0, "confidence": 0.98, "source": "preset"},
            {"id": "room-kitchen", "floorId": "ground", "name": "Kitchen", "roomType": "kitchen", "polygon": rect(-3.5, -1.5, -0.8, 2.2), "floorMaterialId": "timber-spotted-gum", "wallMaterialId": "plaster-coastal-white", "ceilingMaterialId": "paint-crisp-white", "isOutdoor": False, "elevationOffset": 0, "confidence": 0.98, "source": "preset"},
            {"id": "room-hallway", "floorId": "ground", "name": "Entry Hallway", "roomType": "hallway", "polygon": rect(-0.8, -2.5, 1.2, 8.0), "floorMaterialId": "timber-spotted-gum", "wallMaterialId": "plaster-coastal-white", "ceilingMaterialId": "paint-crisp-white", "isOutdoor": False, "elevationOffset": 0, "confidence": 0.99, "source": "preset"},
            {"id": "room-master", "floorId": "ground", "name": "Master Suite", "roomType": "master_bedroom", "polygon": rect(-0.8, -6.0, 7.0, -2.5), "floorMaterialId": "timber-coastal-oak", "wallMaterialId": "plaster-warm-sand", "ceilingMaterialId": "paint-crisp-white", "isOutdoor": False, "elevationOffset": 0, "confidence": 0.97, "source": "preset"},
            {"id": "room-bed2", "floorId": "ground", "name": "Bedroom 2", "roomType": "bedroom", "polygon": rect(-6.5, 2.2, -0.8, 5.2), "floorMaterialId": "timber-coastal-oak", "wallMaterialId": "plaster-coastal-white", "ceilingMaterialId": "paint-crisp-white", "isOutdoor": False, "elevationOffset": 0, "confidence": 0.97, "source": "preset"},
            {"id": "room-study", "floorId": "ground", "name": "Bedroom 3 / Study", "roomType": "study", "polygon": rect(-6.5, 5.2, -0.8, 8.0), "floorMaterialId": "timber-coastal-oak", "wallMaterialId": "plaster-sage-eucalyptus", "ceilingMaterialId": "paint-crisp-white", "isOutdoor": False, "elevationOffset": 0, "confidence": 0.96, "source": "preset"},
            {"id": "room-bathroom", "floorId": "ground", "name": "Main Bathroom", "roomType": "bathroom", "polygon": rect(1.2, -2.5, 7.0, 0.3), "floorMaterialId": "tile-porcelain-travertine", "wallMaterialId": "marble-carrara-honed", "ceilingMaterialId": "paint-crisp-white", "isOutdoor": False, "elevationOffset": 0, "confidence": 0.98, "source": "preset"},
            {"id": "room-laundry", "floorId": "ground", "name": "Laundry", "roomType": "laundry", "polygon": rect(1.2, 0.3, 7.0, 2.3), "floorMaterialId": "tile-terrazzo-coastal", "wallMaterialId": "plaster-coastal-white", "ceilingMaterialId": "paint-crisp-white", "isOutdoor": False, "elevationOffset": 0, "confidence": 0.96, "source": "preset"},
            {"id": "room-garage", "floorId": "ground", "name": "Double Garage", "roomType": "garage", "polygon": rect(1.2, 2.3, 7.0, 8.0), "floorMaterialId": "concrete-polished-architectural", "wallMaterialId": "plaster-coastal-white", "ceilingMaterialId": "paint-crisp-white", "isOutdoor": False, "elevationOffset": -0.08, "confidence": 0.99, "source": "preset"},
            {"id": "room-patio", "floorId": "ground", "name": "Alfresco Timber Deck", "roomType": "patio", "polygon": rect(-6.5, -9.8, -0.8, -6.0), "floorMaterialId": "timber-blackbutt-deck", "wallMaterialId": "brick-sydney-sandstock", "ceilingMaterialId": "timber-coastal-oak", "isOutdoor": True, "elevationOffset": -0.04, "confidence": 0.95, "source": "preset"},
            {"id": "room-porch", "floorId": "ground", "name": "Front Covered Porch", "roomType": "porch", "polygon": rect(-1.4, 8.0, 1.4, 9.6), "floorMaterialId": "tile-porcelain-travertine", "wallMaterialId": "brick-sydney-sandstock", "ceilingMaterialId": "paint-crisp-white", "isOutdoor": True, "elevationOffset": -0.05, "confidence": 0.95, "source": "preset"},
        ],
        "walls": [
            {"id": "wall-ext-north-west", "floorId": "ground", "start": {"x": -6.5, "z": -6.0}, "end": {"x": -0.8, "z": -6.0}, "thickness": 0.24, "height": 2.85, "isExterior": True, "interiorMaterialId": "plaster-coastal-white", "exteriorMaterialId": "brick-sydney-sandstock"},
            {"id": "wall-ext-north-east", "floorId": "ground", "start": {"x": -0.8, "z": -6.0}, "end": {"x": 7.0, "z": -6.0}, "thickness": 0.24, "height": 2.85, "isExterior": True, "interiorMaterialId": "plaster-warm-sand", "exteriorMaterialId": "brick-sydney-sandstock"},
            {"id": "wall-ext-east", "floorId": "ground", "start": {"x": 7.0, "z": -6.0}, "end": {"x": 7.0, "z": 8.0}, "thickness": 0.24, "height": 2.85, "isExterior": True, "interiorMaterialId": "plaster-coastal-white", "exteriorMaterialId": "brick-sydney-sandstock"},
            {"id": "wall-ext-south-east", "floorId": "ground", "start": {"x": 7.0, "z": 8.0}, "end": {"x": 1.2, "z": 8.0}, "thickness": 0.24, "height": 2.85, "isExterior": True, "interiorMaterialId": "plaster-coastal-white", "exteriorMaterialId": "brick-sydney-sandstock"},
            {"id": "wall-ext-south-entry", "floorId": "ground", "start": {"x": 1.2, "z": 8.0}, "end": {"x": -0.8, "z": 8.0}, "thickness": 0.24, "height": 2.85, "isExterior": True, "interiorMaterialId": "plaster-coastal-white", "exteriorMaterialId": "brick-sydney-sandstock"},
            {"id": "wall-ext-south-west", "floorId": "ground", "start": {"x": -0.8, "z": 8.0}, "end": {"x": -6.5, "z": 8.0}, "thickness": 0.24, "height": 2.85, "isExterior": True, "interiorMaterialId": "plaster-sage-eucalyptus", "exteriorMaterialId": "brick-sydney-sandstock"},
            {"id": "wall-ext-west", "floorId": "ground", "start": {"x": -6.5, "z": 8.0}, "end": {"x": -6.5, "z": -6.0}, "thickness": 0.24, "height": 2.85, "isExterior": True, "interiorMaterialId": "plaster-coastal-white", "exteriorMaterialId": "brick-sydney-sandstock"},
            {"id": "wall-int-hall-west-front", "floorId": "ground", "start": {"x": -0.8, "z": 8.0}, "end": {"x": -0.8, "z": 2.2}, "thickness": 0.12, "height": 2.85, "isExterior": False, "interiorMaterialId": "plaster-coastal-white", "exteriorMaterialId": "plaster-coastal-white"},
            {"id": "wall-int-hall-west-mid", "floorId": "ground", "start": {"x": -0.8, "z": 2.2}, "end": {"x": -0.8, "z": -2.5}, "thickness": 0.12, "height": 2.85, "isExterior": False, "interiorMaterialId": "plaster-coastal-white", "exteriorMaterialId": "plaster-coastal-white"},
            {"id": "wall-int-living-master", "floorId": "ground", "start": {"x": -0.8, "z": -2.5}, "end": {"x": -0.8, "z": -6.0}, "thickness": 0.12, "height": 2.85, "isExterior": False, "interiorMaterialId": "plaster-coastal-white", "exteriorMaterialId": "plaster-warm-sand"},
            {"id": "wall-int-kitchen-bed2", "floorId": "ground", "start": {"x": -6.5, "z": 2.2}, "end": {"x": -0.8, "z": 2.2}, "thickness": 0.12, "height": 2.85, "isExterior": False, "interiorMaterialId": "plaster-coastal-white", "exteriorMaterialId": "plaster-coastal-white"},
            {"id": "wall-int-bed2-study", "floorId": "ground", "start": {"x": -6.5, "z": 5.2}, "end": {"x": -0.8, "z": 5.2}, "thickness": 0.12, "height": 2.85, "isExterior": False, "interiorMaterialId": "plaster-coastal-white", "exteriorMaterialId": "plaster-sage-eucalyptus"},
            {"id": "wall-int-master-south", "floorId": "ground", "start": {"x": -0.8, "z": -2.5}, "end": {"x": 7.0, "z": -2.5}, "thickness": 0.12, "height": 2.85, "isExterior": False, "interiorMaterialId": "plaster-warm-sand", "exteriorMaterialId": "plaster-coastal-white"},
            {"id": "wall-int-hall-east", "floorId": "ground", "start": {"x": 1.2, "z": -2.5}, "end": {"x": 1.2, "z": 8.0}, "thickness": 0.12, "height": 2.85, "isExterior": False, "interiorMaterialId": "plaster-coastal-white", "exteriorMaterialId": "plaster-coastal-white"},
            {"id": "wall-int-bath-laundry", "floorId": "ground", "start": {"x": 1.2, "z": 0.3}, "end": {"x": 7.0, "z": 0.3}, "thickness": 0.12, "height": 2.85, "isExterior": False, "interiorMaterialId": "marble-carrara-honed", "exteriorMaterialId": "plaster-coastal-white"},
            {"id": "wall-int-laundry-garage", "floorId": "ground", "start": {"x": 1.2, "z": 2.3}, "end": {"x": 7.0, "z": 2.3}, "thickness": 0.12, "height": 2.85, "isExterior": False, "interiorMaterialId": "plaster-coastal-white", "exteriorMaterialId": "plaster-coastal-white"},
        ],
        "doors": [
            {"id": "door-front-entry", "floorId": "ground", "wallId": "wall-ext-south-entry", "positionAlongWall": 0.5, "width": 1.15, "height": 2.35, "doorType": "double_entry", "isOpen": True, "swingDirection": "left", "materialId": "timber-spotted-gum", "frameMaterialId": "metal-monument-matte"},
            {"id": "door-living-alfresco", "floorId": "ground", "wallId": "wall-ext-north-west", "positionAlongWall": 0.5, "width": 3.4, "height": 2.4, "doorType": "sliding_glass", "isOpen": True, "swingDirection": "left", "materialId": "glass-architectural-clear", "frameMaterialId": "metal-monument-matte"},
            {"id": "door-hall-kitchen", "floorId": "ground", "wallId": "wall-int-hall-west-mid", "positionAlongWall": 0.45, "width": 2.1, "height": 2.45, "doorType": "opening", "isOpen": True, "swingDirection": "left", "materialId": "plaster-coastal-white", "frameMaterialId": "plaster-coastal-white"},
            {"id": "door-master", "floorId": "ground", "wallId": "wall-int-master-south", "positionAlongWall": 0.13, "width": 0.92, "height": 2.15, "doorType": "hinged", "isOpen": True, "swingDirection": "right", "materialId": "timber-coastal-oak", "frameMaterialId": "paint-crisp-white"},
            {"id": "door-bed2", "floorId": "ground", "wallId": "wall-int-hall-west-front", "positionAlongWall": 0.74, "width": 0.86, "height": 2.15, "doorType": "hinged", "isOpen": True, "swingDirection": "left", "materialId": "timber-coastal-oak", "frameMaterialId": "paint-crisp-white"},
            {"id": "door-study", "floorId": "ground", "wallId": "wall-int-hall-west-front", "positionAlongWall": 0.24, "width": 0.86, "height": 2.15, "doorType": "hinged", "isOpen": True, "swingDirection": "left", "materialId": "timber-coastal-oak", "frameMaterialId": "paint-crisp-white"},
            {"id": "door-bath", "floorId": "ground", "wallId": "wall-int-hall-east", "positionAlongWall": 0.13, "width": 0.82, "height": 2.15, "doorType": "hinged", "isOpen": True, "swingDirection": "right", "materialId": "timber-coastal-oak", "frameMaterialId": "paint-crisp-white"},
            {"id": "door-garage-main", "floorId": "ground", "wallId": "wall-ext-south-east", "positionAlongWall": 0.5, "width": 4.6, "height": 2.25, "doorType": "garage_sectional", "isOpen": False, "swingDirection": "left", "materialId": "metal-monument-matte", "frameMaterialId": "metal-monument-matte"},
        ],
        "windows": [
            {"id": "win-living-west", "floorId": "ground", "wallId": "wall-ext-west", "positionAlongWall": 0.84, "width": 2.6, "height": 1.8, "sillHeight": 0.45, "panels": 3, "glassMaterialId": "glass-architectural-clear", "frameMaterialId": "metal-monument-matte"},
            {"id": "win-dining-west", "floorId": "ground", "wallId": "wall-ext-west", "positionAlongWall": 0.55, "width": 2.0, "height": 1.5, "sillHeight": 0.75, "panels": 2, "glassMaterialId": "glass-architectural-clear", "frameMaterialId": "metal-monument-matte"},
            {"id": "win-bed2-west", "floorId": "ground", "wallId": "wall-ext-west", "positionAlongWall": 0.31, "width": 1.8, "height": 1.35, "sillHeight": 0.85, "panels": 2, "glassMaterialId": "glass-architectural-clear", "frameMaterialId": "metal-monument-matte"},
            {"id": "win-study-south", "floorId": "ground", "wallId": "wall-ext-south-west", "positionAlongWall": 0.5, "width": 2.2, "height": 1.4, "sillHeight": 0.85, "panels": 2, "glassMaterialId": "glass-architectural-clear", "frameMaterialId": "metal-monument-matte"},
            {"id": "win-master-north", "floorId": "ground", "wallId": "wall-ext-north-east", "positionAlongWall": 0.58, "width": 2.8, "height": 1.65, "sillHeight": 0.6, "panels": 3, "glassMaterialId": "glass-architectural-clear", "frameMaterialId": "metal-monument-matte"},
            {"id": "win-bath-east", "floorId": "ground", "wallId": "wall-ext-east", "positionAlongWall": 0.35, "width": 1.4, "height": 0.85, "sillHeight": 1.5, "panels": 2, "glassMaterialId": "glass-frosted-privacy", "frameMaterialId": "metal-monument-matte"},
        ],
        "furniture": [
            {"id": "furn-living-sofa", "catalogId": "sofa-coastal-3seat", "name": "Byron 3-Seater Linen Sofa", "category": "seating", "floorId": "ground", "roomId": "room-living", "dimensions": {"x": 2.35, "y": 0.82, "z": 0.96}, "position": {"x": -3.7, "y": 0.16, "z": -2.35}, "rotationY": 3.14159, "scale": {"x": 1, "y": 1, "z": 1}, "primaryMaterialId": "fabric-coastal-linen", "secondaryMaterialId": "timber-coastal-oak", "priceAUD": 3290},
            {"id": "furn-living-armchair", "catalogId": "armchair-boucle", "name": "Noosa Occasional Armchair", "category": "seating", "floorId": "ground", "roomId": "room-living", "dimensions": {"x": 0.84, "y": 0.78, "z": 0.84}, "position": {"x": -5.55, "y": 0.16, "z": -3.65}, "rotationY": 1.5708, "scale": {"x": 1, "y": 1, "z": 1}, "primaryMaterialId": "fabric-charcoal-boucle", "secondaryMaterialId": "timber-spotted-gum", "priceAUD": 1190},
            {"id": "furn-living-coffee", "catalogId": "table-coastal-coffee", "name": "Spotted Gum Designer Coffee Table", "category": "table", "floorId": "ground", "roomId": "room-living", "glbUrl": "/models/modern_coffee_table_01.glb", "dimensions": {"x": 1.32, "y": 0.42, "z": 0.68}, "position": {"x": -3.7, "y": 0.16, "z": -3.65}, "rotationY": 0, "scale": {"x": 1, "y": 1, "z": 1}, "primaryMaterialId": "timber-spotted-gum", "secondaryMaterialId": "marble-travertine", "priceAUD": 980},
            {"id": "furn-living-plant", "catalogId": "decor-potted-plant", "name": "Indoor Ceramic Planter & Ficus", "category": "lighting_decor", "floorId": "ground", "roomId": "room-living", "glbUrl": "/models/potted_plant_02.glb", "dimensions": {"x": 0.68, "y": 0.82, "z": 0.68}, "position": {"x": -5.85, "y": 0.16, "z": -5.35}, "rotationY": 0.6, "scale": {"x": 1, "y": 1, "z": 1}, "primaryMaterialId": "tile-porcelain-travertine", "priceAUD": 260},
            {"id": "furn-living-tvunit", "catalogId": "storage-lowline-media", "name": "Lowline Timber Entertainment Unit", "category": "storage", "floorId": "ground", "roomId": "room-living", "dimensions": {"x": 2.1, "y": 0.54, "z": 0.46}, "position": {"x": -1.18, "y": 0.16, "z": -4.1}, "rotationY": -1.5708, "scale": {"x": 1, "y": 1, "z": 1}, "primaryMaterialId": "timber-spotted-gum", "secondaryMaterialId": "metal-monument-matte", "priceAUD": 1650},
            {"id": "furn-living-rug", "catalogId": "decor-jute-rug", "name": "Woven Jute & Wool Area Rug", "category": "lighting_decor", "floorId": "ground", "roomId": "room-living", "dimensions": {"x": 3.0, "y": 0.015, "z": 2.2}, "position": {"x": -3.75, "y": 0.16, "z": -3.55}, "rotationY": 0, "scale": {"x": 1, "y": 1, "z": 1}, "primaryMaterialId": "fabric-coastal-linen", "priceAUD": 790},
            {"id": "furn-dining-set", "catalogId": "table-dining-6seat", "name": "Australian Oak 6-Seater Dining Suite", "category": "table", "floorId": "ground", "roomId": "room-dining", "dimensions": {"x": 2.0, "y": 0.76, "z": 1.05}, "position": {"x": -5.0, "y": 0.16, "z": 0.35}, "rotationY": 1.5708, "scale": {"x": 1, "y": 1, "z": 1}, "primaryMaterialId": "timber-coastal-oak", "secondaryMaterialId": "fabric-coastal-linen", "priceAUD": 2850},
            {"id": "furn-kitchen-island", "catalogId": "kitchen-island-bench", "name": "Waterfall Stone Kitchen Island & Stools", "category": "kitchen", "floorId": "ground", "roomId": "room-kitchen", "dimensions": {"x": 2.0, "y": 0.92, "z": 0.9}, "position": {"x": -2.35, "y": 0.16, "z": -0.05}, "rotationY": 1.5708, "scale": {"x": 1, "y": 1, "z": 1}, "primaryMaterialId": "marble-carrara-honed", "secondaryMaterialId": "timber-coastal-oak", "priceAUD": 4800},
            {"id": "furn-kitchen-rear-joinery", "catalogId": "kitchen-wall-joinery", "name": "Cooktop & Integrated Cabinetry Run", "category": "kitchen", "floorId": "ground", "roomId": "room-kitchen", "dimensions": {"x": 2.4, "y": 2.2, "z": 0.65}, "position": {"x": -2.2, "y": 0.16, "z": 1.78}, "rotationY": 3.14159, "scale": {"x": 1, "y": 1, "z": 1}, "primaryMaterialId": "paint-crisp-white", "secondaryMaterialId": "marble-carrara-honed", "priceAUD": 6400},
            {"id": "furn-master-bed", "catalogId": "bed-queen-coastal", "name": "King Upholstered Timber Bed", "category": "bed", "floorId": "ground", "roomId": "room-master", "dimensions": {"x": 1.92, "y": 1.12, "z": 2.16}, "position": {"x": 3.6, "y": 0.16, "z": -3.72}, "rotationY": 3.14159, "scale": {"x": 1, "y": 1, "z": 1}, "primaryMaterialId": "fabric-coastal-linen", "secondaryMaterialId": "timber-coastal-oak", "priceAUD": 2690},
            {"id": "furn-bed2-bed", "catalogId": "bed-queen-coastal", "name": "Queen Coastal Linen Bed", "category": "bed", "floorId": "ground", "roomId": "room-bed2", "dimensions": {"x": 1.65, "y": 1.08, "z": 2.12}, "position": {"x": -4.1, "y": 0.16, "z": 3.4}, "rotationY": 0, "scale": {"x": 1, "y": 1, "z": 1}, "primaryMaterialId": "fabric-coastal-linen", "secondaryMaterialId": "timber-coastal-oak", "priceAUD": 1990},
            {"id": "furn-study-desk", "catalogId": "table-study-desk", "name": "Home Office Timber Workstation", "category": "table", "floorId": "ground", "roomId": "room-study", "dimensions": {"x": 1.55, "y": 0.75, "z": 0.72}, "position": {"x": -3.65, "y": 0.16, "z": 7.25}, "rotationY": 3.14159, "scale": {"x": 1, "y": 1, "z": 1}, "primaryMaterialId": "timber-spotted-gum", "secondaryMaterialId": "leather-tan-saddle", "priceAUD": 1290},
            {"id": "furn-bath-tub", "catalogId": "bath-freestanding-oval", "name": "Sculptural Matte Stone Freestanding Bath", "category": "bathroom", "floorId": "ground", "roomId": "room-bathroom", "dimensions": {"x": 1.72, "y": 0.6, "z": 0.82}, "position": {"x": 5.95, "y": 0.16, "z": -1.1}, "rotationY": -1.5708, "scale": {"x": 1, "y": 1, "z": 1}, "primaryMaterialId": "marble-carrara-honed", "secondaryMaterialId": "metal-brushed-nickel", "priceAUD": 2350},
            {"id": "furn-bath-vanity", "catalogId": "bath-vanity-double", "name": "Floating Fluted Oak Double Vanity", "category": "bathroom", "floorId": "ground", "roomId": "room-bathroom", "dimensions": {"x": 1.6, "y": 0.86, "z": 0.52}, "position": {"x": 3.6, "y": 0.16, "z": -2.12}, "rotationY": 0, "scale": {"x": 1, "y": 1, "z": 1}, "primaryMaterialId": "timber-coastal-oak", "secondaryMaterialId": "marble-carrara-honed", "priceAUD": 1890},
            {"id": "furn-patio-dining", "catalogId": "outdoor-alfresco-lounge", "name": "Alfresco Teak Outdoor Dining Setting", "category": "outdoor", "floorId": "ground", "roomId": "room-patio", "dimensions": {"x": 2.2, "y": 0.76, "z": 1.1}, "position": {"x": -3.7, "y": 0.12, "z": -8.0}, "rotationY": 0, "scale": {"x": 1, "y": 1, "z": 1}, "primaryMaterialId": "timber-blackbutt-deck", "secondaryMaterialId": "fabric-coastal-linen", "priceAUD": 2790},
        ],
        "materials": [],
        "landscape": [
            {"id": "land-lawn-lot", "type": "lawn", "name": "Sir Walter Buffalo Lawn", "polygon": rect(-11.0, -15.0, 11.0, 15.0), "scale": 1, "rotationY": 0, "materialId": "grass-buffalo-lawn"},
            {"id": "land-driveway", "type": "driveway", "name": "Exposed Aggregate Concrete Driveway", "polygon": rect(1.6, 8.0, 6.6, 15.0), "scale": 1, "rotationY": 0, "materialId": "concrete-driveway-aggregate"},
            {"id": "land-footpath", "type": "footpath", "name": "Front Entry Travertine Pavers", "polygon": rect(-0.6, 9.6, 0.9, 15.0), "scale": 1, "rotationY": 0, "materialId": "marble-travertine"},
            {"id": "land-pergola", "type": "pergola", "name": "Alfresco Spotted Gum Louvred Pergola", "polygon": rect(-6.5, -9.8, -0.8, -6.0), "scale": 1, "rotationY": 0, "height": 2.75, "materialId": "timber-spotted-gum"},
            {"id": "land-pool", "type": "swimming_pool", "name": "In-Ground Saltwater Plunge Pool", "polygon": rect(1.4, -10.8, 6.8, -6.9), "scale": 1, "rotationY": 0, "materialId": "tile-porcelain-travertine"},
            {"id": "land-fence-perimeter", "type": "fence", "name": "Colorbond & Hardwood Boundary Fence", "polygon": [{"x": -10.6, "z": 8.5}, {"x": -10.6, "z": -14.4}, {"x": 10.6, "z": -14.4}, {"x": 10.6, "z": 8.5}], "scale": 1, "rotationY": 0, "height": 1.85, "materialId": "metal-monument-matte"},
            {"id": "land-tree-1", "type": "tree_eucalyptus", "name": "Lemon-Scented Gum (Backyard West)", "position": {"x": -9.8, "z": -13.2}, "scale": 1.05, "rotationY": 0.4},
            {"id": "land-tree-2", "type": "tree_eucalyptus", "name": "Silver Dollar Eucalyptus (Backyard North-East)", "position": {"x": 8.8, "z": -12.4}, "scale": 1.0, "rotationY": 1.8},
            {"id": "land-tree-3", "type": "tree_eucalyptus", "name": "Coastal Banksia (Front Yard)", "position": {"x": -8.2, "z": 11.4}, "scale": 0.9, "rotationY": 2.5},
            {"id": "land-shrub-1", "type": "shrub_native", "name": "Kangaroo Paw & Lomandra Border", "position": {"x": -4.2, "z": 9.2}, "scale": 1, "rotationY": 0},
            {"id": "land-shrub-2", "type": "shrub_native", "name": "Poolside Coastal Planting", "position": {"x": 4.1, "z": -12.0}, "scale": 1.1, "rotationY": 0.8},
        ],
        "lighting": {
            "timeOfDay": "afternoon",
            "month": 11,
            "dayOfMonth": 25,
            "exposure": 1.08,
            "autoIndoorExposure": True,
            "shadowsEnabled": True,
            "environmentIntensity": 0.95,
            "interiorLightsOn": True,
        },
    }
