# Roadmap Item Workflow

**MANDATORY** — follow these steps for every roadmap item (referenced by `#number` from [game-design.md](game-design.md)).

## Steps

1. **Summarize scope** — before writing any code, give the user a short summary of what you'll build and ask clarifying questions if anything is ambiguous (e.g. placement, behavior edge cases, integration points).

2. **Implement** — code the feature with:
   - Editor integration (palette entry, preview, placement support)
   - Codex integration (see step 2b)
   - Sandbox level placement (place a few instances in level 1 for testing)

2b. **Update Codex** — every new entity/mechanic needs all three:
   - `CODEX_DATA` entry in `game.js` (category, preview key, i18n key, tag)
   - i18n codex text in `locales/en.json` AND `locales/hu.json` (`codex.<key>.name`, `.tagLabel`, `.desc`, `.tip`)
   - Preview thumbnail in `codex-renderer.js` (`generateCodexPreviews`) — build the model, render to dataURL

3. **Write Vitest tests** where meaningful — test logic, not pixels:
   - Entity extraction (new tile IDs parsed correctly, cleared from TILES)
   - Data invariants (positions within bounds, no overlap with merged terrain)
   - Fix any existing tests broken by the new tile range or entity list

4. **Run tests** — `npx vitest run` must pass before committing.

5. **Summarize results** — tell the user what was done, what to test manually, and any follow-up ideas.

6. **Update docs** — keep these in sync with code changes:
   - `CLAUDE.md` (tile table, architecture notes)
   - `.claude/docs/game-design.md` (roadmap status)
   - `.claude/docs/nape-physics-setup.md` (CbTypes, body types, listeners)
   - `.claude/docs/voxel-renderer.md` (textures, meshes, particles)

7. **Commit + push** to the designated branch.
