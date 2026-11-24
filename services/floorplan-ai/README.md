# `floorplan-ai` Module

Modular Floor Plan Recognition Provider for AussieHome 3D.

- `GeminiFloorplanProvider`: Multimodal Gemini Vision structured JSON parser (activates when `GEMINI_API_KEY` is configured in backend environment).
- `AssistedBlueprintAnalyzer`: Transparent local assisted parser (extracts PNG/JPEG/PDF dimensions, generates aspect-calibrated editable walls/rooms/openings with confidence flags and scale calibration warnings when no cloud API key is present).
