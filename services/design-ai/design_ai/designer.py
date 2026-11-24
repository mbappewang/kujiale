from __future__ import annotations

import json
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass
class DesignIntentResult:
    provider_mode: str  # "gemini_llm" | "deterministic_rules"
    summary: str
    detected_style: str
    target_room_id: str | None
    commands: list[dict[str, Any]]


ROOM_KEYWORDS: list[tuple[str, list[str]]] = [
    ("living_room", ["living", "lounge", "family room"]),
    ("kitchen", ["kitchen", "island", "cook"]),
    ("dining_room", ["dining", "dinner"]),
    ("master_bedroom", ["master", "main bedroom", "primary bedroom"]),
    ("bedroom", ["bedroom", "guest room", "kids"]),
    ("bathroom", ["bathroom", "bath", "ensuite"]),
    ("study", ["study", "office"]),
    ("patio", ["patio", "alfresco", "deck", "outdoor", "backyard"]),
]

STYLE_KEYWORDS: list[tuple[str, list[str]]] = [
    ("modern_coastal", ["coastal", "beach", "byron", "noosa", "linen", "blonde", "light oak", "airy"]),
    ("sydney_contemporary", ["urban", "contemporary", "modern", "concrete", "sleek", "charcoal", "monument", "sydney"]),
    ("melbourne_heritage", ["heritage", "melbourne", "terrace", "red brick", "sage", "eucalyptus", "classic", "warm"]),
    ("outback_minimalist", ["outback", "minimalist", "earth", "travertine", "sand", "leather", "terracotta", "natural"]),
]


def _resolve_target_room_id(prompt_lower: str, rooms: list[dict[str, Any]]) -> str | None:
    for r in rooms:
        if r.get("name", "").lower() in prompt_lower:
            return str(r["id"])
    for room_type, words in ROOM_KEYWORDS:
        if any(w in prompt_lower for w in words):
            for r in rooms:
                if r.get("roomType") == room_type:
                    return str(r["id"])
    return None


def _deterministic_parse(prompt: str, scene: dict[str, Any]) -> DesignIntentResult:
    p = prompt.lower()
    rooms = scene.get("rooms", [])
    target_room_id = _resolve_target_room_id(p, rooms)

    detected_style = "modern_coastal"
    for style_id, words in STYLE_KEYWORDS:
        if any(w in p for w in words):
            detected_style = style_id
            break

    commands: list[dict[str, Any]] = []

    # Apply overall or room-scoped Australian style preset
    commands.append(
        {
            "type": "apply_style_preset",
            "styleId": detected_style,
            **({"targetRoomId": target_room_id} if target_room_id else {}),
        }
    )

    # Specific material overrides mentioned in natural language
    effective_room = target_room_id or (rooms[0]["id"] if rooms else "room-living")
    if "marble" in p or "carrara" in p:
        commands.append(
            {
                "type": "update_room_material",
                "roomId": effective_room,
                "target": "floor",
                "materialId": "marble-carrara-honed",
            }
        )
    elif "travertine" in p:
        commands.append(
            {
                "type": "update_room_material",
                "roomId": effective_room,
                "target": "floor",
                "materialId": "marble-travertine",
            }
        )
    elif "concrete" in p:
        commands.append(
            {
                "type": "update_room_material",
                "roomId": effective_room,
                "target": "floor",
                "materialId": "concrete-polished-architectural",
            }
        )
    elif "blackbutt" in p or "dark timber" in p:
        commands.append(
            {
                "type": "update_room_material",
                "roomId": effective_room,
                "target": "floor",
                "materialId": "timber-blackbutt-deck",
            }
        )
    elif "spotted gum" in p:
        commands.append(
            {
                "type": "update_room_material",
                "roomId": effective_room,
                "target": "floor",
                "materialId": "timber-spotted-gum",
            }
        )

    if "sage" in p or "green" in p or "eucalyptus" in p:
        commands.append(
            {
                "type": "update_room_material",
                "roomId": effective_room,
                "target": "wall",
                "materialId": "plaster-sage-eucalyptus",
            }
        )
    elif "sand" in p or "warm wall" in p:
        commands.append(
            {
                "type": "update_room_material",
                "roomId": effective_room,
                "target": "wall",
                "materialId": "plaster-warm-sand",
            }
        )

    if "evening" in p or "sunset" in p or "night" in p:
        commands.append({"type": "update_lighting", "timeOfDay": "evening", "interiorLightsOn": True})
    elif "morning" in p or "sunrise" in p:
        commands.append({"type": "update_lighting", "timeOfDay": "morning"})
    elif "noon" in p or "midday" in p:
        commands.append({"type": "update_lighting", "timeOfDay": "noon"})

    scope_label = f"room '{target_room_id}'" if target_room_id else "entire residence"
    summary = (
        f"Parsed design intent for {scope_label} using style '{detected_style}' "
        f"into {len(commands)} schema-validated command(s)."
    )
    return DesignIntentResult(
        provider_mode="deterministic_rules",
        summary=summary,
        detected_style=detected_style,
        target_room_id=target_room_id,
        commands=commands,
    )


def interpret_natural_language_design(
    prompt: str,
    scene: dict[str, Any],
    api_key: str | None = None,
    model: str = "gemini-2.5-flash",
) -> DesignIntentResult:
    """
    Converts natural language renovation prompts into validated DesignCommand dicts.
    Uses Gemini when GEMINI_API_KEY is configured, with deterministic rule fallback.
    """
    if not api_key or not api_key.strip():
        return _deterministic_parse(prompt, scene)

    try:
        room_list = [
            {"id": r.get("id"), "name": r.get("name"), "roomType": r.get("roomType")}
            for r in scene.get("rooms", [])
        ]
        sys_prompt = (
            "You are an Australian AI Interior Designer. Convert the user's request into structured JSON "
            "matching: {\"summary\": string, \"detectedStyle\": \"modern_coastal\"|\"sydney_contemporary\"|"
            "\"melbourne_heritage\"|\"outback_minimalist\", \"targetRoomId\": string|null, "
            "\"commands\": [{\"type\": \"apply_style_preset\", \"styleId\": ...} | "
            "{\"type\": \"update_room_material\", \"roomId\": ..., \"target\": \"floor\"|\"wall\", \"materialId\": ...}]}. "
            f"Available rooms: {json.dumps(room_list)}. "
            f"User request: {prompt}"
        )
        payload = {
            "contents": [{"parts": [{"text": sys_prompt}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
        }
        endpoint = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            f"?key={api_key.strip()}"
        )
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        text_out = (
            body.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "{}")
        )
        parsed = json.loads(text_out)
        cmds = parsed.get("commands") or []
        if not cmds:
            return _deterministic_parse(prompt, scene)
        return DesignIntentResult(
            provider_mode="gemini_llm",
            summary=str(parsed.get("summary") or "Generated via Gemini Interior Designer"),
            detected_style=str(parsed.get("detectedStyle") or "modern_coastal"),
            target_room_id=parsed.get("targetRoomId"),
            commands=cmds,
        )
    except Exception:
        return _deterministic_parse(prompt, scene)
