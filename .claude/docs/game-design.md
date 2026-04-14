# Game Design Document — "The Call of the Deep"

Underwater fish platformer with a curiosity-driven story, escalating mechanics, and a premium-quality mobile experience.

---

## Story

### Premise

A small clownfish living on a coral reef spots a mysterious glow coming from far below. Driven by curiosity, it ventures beyond the reef's edge — deeper than any fish it knows has ever gone. Each world takes it further down, into stranger, more beautiful, more dangerous waters. The glow is always ahead, always deeper.

### Storytelling Method

- **No dialogue, no NPC conversations, no text cutscenes**
- Story is told through **environment, progression, and bottle messages**
- Opening: 3–4 illustrated frames (no words or 1 sentence per frame) showing the fish noticing the glow
- World intros: single sentence displayed on a title card before the first level
- Ending: the fish reaches the source — an ancient place where the water itself glows. Other names are scratched on the wall: explorers who came before. The fish adds its own. Camera zooms out — the ocean is a little brighter now

### Bottle Messages (Hidden Micro-Story)

25 hidden messages in bottles scattered across all worlds (1–2 per level). Swim over to read. Collectible — viewable in the Codex under "Explorer's Notes."

**Funny (majority):**
- *"Day 47. Still no idea what the glow is. Brought snacks though."*
- *"Note to self: do NOT dash into a pufferfish. Ow."*
- *"This crab won't stop pushing me. I'm starting to think it's personal."*
- *"If you're reading this, turn back. ...Just kidding. Keep going. It's worth it."*
- *"Lost my favorite rock somewhere in the caves. It was grey and round. If found, please return."*
- *"I tried riding the current. 10/10 would recommend. 0/10 would recommend the wall at the end."*
- *"The armored fish bumped into me. My dash bounced right off. My pride did not bounce back."*
- *"Broke a crate. Nothing inside. Broke another. Nothing. Broke a third — pearl! Broke 50 more. Nothing."*

**Guiding (1 per world, near the start):**
- *"The current pulls east here. Swim with it, not against."*
- *"Dark ahead. Wish I could see better."*
- *"The switches here are old but they still work. Some need weight to stay pressed."*

**Emotional (World 5 only, 1–2):**
- *"I saw the light too. Keep going."*
- *"Made it to the heart. It's beautiful. No need to go back — everything I was looking for was down here all along."*

---

## World Structure

5 worlds. Each world = 3–4 levels + 1 boss. Each introduces 1–2 new mechanics that subsequent worlds build on.

> **Note:** World 1 is the existing Coral Reef level, kept as-is. It serves as the playable tutorial and the live testing ground for new mechanics during development.

### World 1 — Coral Shallows

*"Home waters. The glow came from beyond the reef's edge."*

**Mood:** Warm, sunny, colorful. The safe home the fish is about to leave.

**Levels:**
1. **Home Waters** — Tutorial. Swimming, dash, first pearls. Very easy (current level 1)
2. **Reef's Edge** — Piranhas, first boulders (grab/throw). Underwater crates as breakable obstacles
3. **Into the Blue** — Key-chest puzzle intro, seagrass hiding from sharks
4. **Boss: Giant Crab** — Guards the reef's exit. Throws rocks, shoves the player. Hit with boulders 3 times to defeat

**Introduced mechanics:** Core movement, dash, grab/throw, seagrass stealth, underwater crates
**Introduced enemies:** Piranha, Shark, Crab

---

### World 2 — The Open Blue

*"No reef to hide behind. Just you and the current."*

**Mood:** Vast open water. Fewer hiding spots. The water moves — currents appear.

**Levels:**
1. **Driftway** — Water currents (physics zones that push the fish). Learn to ride and fight them
2. **Wreck Field** — Sunken ship debris. Breakable walls (cracked stone, dash to shatter). Hidden rooms behind them
3. **The Shadow** — Armored Fish introduction. First enemy that can't be dashed — must throw boulders or avoid
4. **Boss: Giant Jellyfish** — Slowly fills the arena with electric tentacles. Dash through gaps, throw boulders at its core

**Introduced mechanics:**
- **Water currents** — visible flow zones that push the fish in a direction
- **Breakable walls** — cracked stone texture, destroyed by dashing through, revealing hidden areas
- **Moving physical elements** — floating logs (drift in currents, rideable), swinging anchors (pendulum platforms)

**Introduced enemies:**
- **Armored Fish** — patrols left-right like a piranha, but dash bounces off (small knockback to player). Killed by boulder/key throw only. Dark metallic scales, smaller fins. *Codex: "Its scales are harder than stone. Your dash just makes it angry. Hit it with something heavier — or learn to sneak past."*

---

### World 3 — Twilight Forest

*"The light fades here. Trust your instincts."*

**Mood:** Dim kelp forests, bioluminescent accents. Limited visibility introduced.

**Levels:**
1. **Dusk** — Gradual darkening within the level. Small light radius around the fish. Slower, more cautious gameplay
2. **Spore Fields** — Spitting Coral introduction + switch-gate puzzles. Hit switch to open gate, plan routes
3. **Hidden Paths** — Dark level. Breakable walls hide side paths. Bottle messages hint at routes
4. **Heart of the Forest** — Full combination: darkness + switches + Armored Fish + currents
5. **Boss: Eel Queen** — Long serpentine boss in a dark arena. Electric pulses telegraph with bioluminescent flashes. Dash glowing weak points along her body

**Introduced mechanics:**
- **Limited visibility** — dark levels, small light circle around the fish
- **Switches & gates** — glowing buttons on walls/floor, activate by swimming into them OR throwing a boulder
  - Toggle type (swim over = open, again = close)
  - Pressure type (needs a boulder placed on it to stay open)
  - Timed type (opens for ~5 seconds, then closes)
- **Skill: Light Pulse** — briefly expands visibility radius (larger light circle for ~3s, ~15s cooldown). Earned as a story event: a bioluminescent creature touches the fish. The ocean's first gift

**Introduced enemies:**
- **Spitting Coral** — fixed on the ground, does not move or turn. Fires 3 projectiles upward in a fan pattern (left-up, straight up, right-up) every ~2.5s with ~1.5s pause. Slower projectiles than toxic fish. Destroyed by boulder throw. *Codex: "A crusty polyp that spits venom in a triple fan. Every. Few. Seconds. Stand to the side and wait — or shut it up with a boulder."*

---

### World 4 — The Abyss

*"The pressure builds. The glow grows brighter."*

**Mood:** Tight cave systems, dark base color, but bioluminescent crystals and plants provide spots of light. Oppressive yet beautiful.

**Levels:**
1. **Descent** — Vertical level, moving downward. Pufferfish, downward-pulling currents, moving rocks
2. **Crystal Cavern** — Complex switch-gate puzzles. Open 2–3 gates in correct sequence. Place boulders on pressure switches for permanent holds
3. **Toxic Depths** — Poison water zones (green-tinted, damage over time). Stun skill introduced here — stun enemies to pass through tight corridors with Armored Fish
4. **The Rift** — All mechanics combined: dark + moving platforms + switches + poison zones
5. **Boss: Anglerfish** — Massive deep-sea predator. Uses its light lure to pull the fish toward it (attraction physics). Use currents and darkness to flank. Destroy lure nodes in phases

**Introduced mechanics:**
- **Poison water zones** — green-tinted water areas, damage over time while inside
- **Complex switch puzzles** — boulder placement for permanent activation, multi-gate sequences
- **Skill: Stun Pulse** — small radius pulse, stuns nearby enemies for ~3s (~20s cooldown). Earned as story event: a deep-sea crystal resonates near the fish. The ocean's second gift

---

### World 5 — The Sunken Heart

*"You're here. The glow is everywhere now."*

**Mood:** Ancient ruins. The water itself glows faintly. Beautiful, serene moments mixed with intense challenges. Carvings on the walls tell of a civilization that revered the ocean.

**Levels:**
1. **The Threshold** — Monumental gates, ancient mechanisms. Requires all skills: light pulse in darkness, stun for Armored Fish, dash for breakable walls. First emotional bottle message: *"I saw the light too. Keep going."*
2. **The Labyrinth** — Hardest puzzle level. Moving walls, timed gates, current direction changes. Speed skill introduced here for tight time windows
3. **The Heart Chamber** — Platforming gauntlet: every mechanic, every enemy type, beautifully composed. The glow is close
4. **Final Boss: The Guardian** — Not a monster but an ancient, enormous fish protecting the sanctuary. It tests, not destroys. 3 phases:
   - Phase 1: Physical — dash and dodge patterns
   - Phase 2: Puzzle — activate switches during the fight
   - Phase 3: Skill test — darkness + stun + speed required
   - Defeat: it steps aside and lets you in

**Introduced mechanics:**
- **Skill: Speed Surge** — short sprint boost (~4s, ~25s cooldown), works against currents. Earned as story event: an ancient inscription glows as the fish passes. The ocean's final gift
- **Combination puzzles** — all prior mechanics woven together

---

## Skill System — "Gifts of the Ocean"

Skills are **not purchased, not chosen from a tree**. They are **story events** — the ocean recognizes the fish's bravery and grants abilities as it goes deeper.

| Skill | World | How Earned | Duration | Cooldown | Input |
|-------|-------|-----------|----------|----------|-------|
| Light Pulse | 3 (start) | A bioluminescent creature touches the fish | ~3s | ~15s | Q / left trigger |
| Stun Pulse | 4 (start) | A deep-sea crystal resonates nearby | ~3s effect | ~20s | W / right trigger |
| Speed Surge | 5 (level 2) | Ancient wall inscription glows | ~4s | ~25s | E / extra button |

Design principles:
- No monetization hook — skills come from the story, not a shop
- Each world introduces one, subsequent worlds require it
- Light Pulse is exploration (not combat), Stun is defensive, Speed is traversal — distinct roles

---

## New Entities

### Underwater Crates
- Wooden box texture, floating slightly in water
- Breakable by dashing into them — wood plank particle burst
- ~30% chance contains a pearl, otherwise just satisfying debris
- Sometimes block passages (3–4 crates = breakable wall corridor)
- *Codex: "Old wooden crates from who knows where. Smash them for fun — sometimes there's a pearl inside. Mostly just splinters."*

### Breakable Walls
- Stone wall with visible crack texture (lighter lines/fractures, distinct from regular stone)
- Destroyed only by dashing — rock debris particle effect
- Behind them: hidden rooms, shortcuts, bottle messages, bonus pearls
- *Codex: "Cracked stone that can't take a hit. One good dash and it crumbles — revealing whatever's behind."*

### Switches & Gates
- **Switch:** Glowing button on wall/floor. Activate by swimming into it or throwing a boulder at it
- **Gate:** Metal grate blocking passage
- **Types:**
  - Toggle — swim over to open, again to close
  - Pressure — needs a boulder resting on it to stay open
  - Timed — opens for ~5 seconds, then closes (requires Speed Surge in later levels)
- *Codex: "Ancient mechanisms still working after centuries. Press the switch and the gate obeys — for a while."*

### Moving Physical Elements
- **Floating logs:** Drift in currents, can stand on or push against. Solid physics bodies
- **Swinging anchors:** Pendulum motion, usable as platforms. Timed jumps needed
- **Drifting debris:** Smaller pieces that bump the fish, environmental flavor

### Bottle Messages
- Small corked bottle half-buried in sand or wedged in rocks
- Swim over to read — text appears in a bubble overlay for 3–4 seconds
- Collectible — tracked in Codex under "Explorer's Notes"
- ~25 total across all worlds

### Armored Fish (New Enemy)
- Patrols left-right like piranha, similar size but thicker
- Dash bounces off — small knockback to player, fish takes no damage
- Killed only by boulder/key throw (1 hit) or stunned to pass
- Dark grey/metallic scale texture, smaller fins
- *Codex: "Its scales are harder than stone. Your dash just makes it angry. Hit it with something heavier — or learn to sneak past."*

### Spitting Coral (New Enemy)
- Fixed on the ground, does not move or rotate
- Fires 3 projectiles upward in a fan pattern (left-up, straight up, right-up)
- Fire cycle: ~2.5s firing, ~1.5s pause, repeat
- Projectiles are slower than toxic fish projectiles, purple/green bubbles
- Destroyed by boulder throw
- *Codex: "A crusty polyp that spits venom in a triple fan. Every. Few. Seconds. Stand to the side and wait — or shut it up with a boulder."*

---

## Boss Fights

| World | Boss | Core Mechanic | How to Win |
|-------|------|--------------|------------|
| 1 | Giant Crab | Push + boulder throw | Dodge shoves, throw 3 boulders at it |
| 2 | Giant Jellyfish | Tentacle maze + dash | Dash through tentacle gaps, hit core with boulders |
| 3 | Eel Queen | Dark arena + pattern reading | Read bioluminescent telegraph, dash weak points |
| 4 | Anglerfish | Light-lure attraction + flanking | Resist pull, use currents to get behind, destroy lure nodes |
| 5 | The Guardian | 3-phase test (combat/puzzle/skills) | Prove mastery of all mechanics |

---

## Star System & Progression

### Per-Level Stars

| Stars | Condition |
|-------|-----------|
| 1 | Complete the level |
| 2 | Collect all pearls (including crates and hidden ones) |
| 3 | Complete under time limit + 0 deaths |

### World Unlock
- Next world unlocks when all levels in current world are completed (1 star each is enough)
- Boss level unlocks at ~60% of available stars in that world

---

## Monetization — Fair Model

**Structure: Premium with optional unlock**

| Element | Model |
|---------|-------|
| World 1 (full, 4 levels + boss) | **Free** — complete, not gutted |
| World 2–5 | **One-time purchase** (full game ~$3.99) OR per-world $1.29 |
| Extra life on death | **Rewarded ad** — optional, 1x per level, 30s video = +1 life |
| Fish skins | **Cosmetic IAP** — $0.99 each, purely visual, zero gameplay advantage |
| Bottle message hint | Free — faint sparkle near hidden bottles if you're close |

**What's NOT in the game:**
- No energy/heart system (play as much as you want)
- No paid power-ups
- No pay-to-win anything
- No loot boxes
- No subscriptions
- No mandatory ads

---

## Level Count Summary

| World | Levels | Boss | Total |
|-------|--------|------|-------|
| 1 — Coral Shallows | 3 | 1 | 4 |
| 2 — The Open Blue | 3 | 1 | 4 |
| 3 — Twilight Forest | 4 | 1 | 5 |
| 4 — The Abyss | 4 | 1 | 5 |
| 5 — The Sunken Heart | 3 | 1 | 4 |
| **Total** | **17** | **5** | **22** |

Plus ~25 hidden bottle messages and the Codex encyclopedia.

---

## One-Sentence Summary

> A small fish sees a glow in the deep, follows it down through five worlds of wonder and danger, and discovers that the ocean rewards those brave enough to keep going.
