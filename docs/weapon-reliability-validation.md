# Weapon reliability validation

Initial validation passed by user report on 2026-09-08.
Associated mod build: **20260908-214617**.

The user accepted the completed five-ticket Weapon reliability group and
requested commits in both repositories. Its mod changes repair bounded reset,
logical attack categories, knockback/rearing dispatch and the two missing
weapon replacements. The UI correction emits FloatArray RCON values as bare
comma-separated numbers, matching the existing mod parser. Stored arrays and
the separate Game.ini format are unchanged.

Engineering validation passed 50 UI tests across 15 files and TypeScript,
including real isolated persistence, review/selection and captured transport.
Actual captured commands also passed replay through the mod's parser in PIE.
The mod retains 170 Character keys and 63 Weapon keys (177 weapon routes).

The user's initial pass does not enumerate individual live cases or installed
pak identities. Detailed community/multiplayer testing remains deferred.
The mod repository's Weapon reliability closeout retains the full evidence.
