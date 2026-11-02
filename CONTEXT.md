# EZConfig platform

The hosted service where server owners manage EZConfig configuration for their
Mordhau servers. Config-contract terms (config key, database, category,
feature, command batch) are defined in the mod's `CONTEXT.md`
(`C:\Program Files\Epic Games\MORDHAUEditor\Mordhau\Mods\EZConfig\CONTEXT.md`).

## Language

**Ruleset**:
A named, owned collection of Ruleset versions that a server owner refines over
time, such as a competitive ruleset. A config package, never the EZConfig pak.
_Avoid_: mod, preset, profile

**Ruleset version**:
One immutable saved set of Character and Weapon config values within a
Ruleset, recorded against the key contract it was written for.
_Avoid_: mod version, snapshot, revision
