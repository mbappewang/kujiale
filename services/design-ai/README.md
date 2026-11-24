# `design-ai` Module

Natural Language Australian Interior Designer & Command Parser.

- Converts natural language renovation prompts (e.g. *"Make my living room look like a modern Australian coastal home"*) into schema-validated `DesignCommand` operations.
- Never mutates Three.js objects directly; enforces `Natural Language -> Validated Design Commands -> Scene State Update -> Three.js Rendering`.
