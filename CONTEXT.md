# EZConfig platform

The hosted service where server owners manage EZConfig configuration for their
Mordhau servers. Config-contract terms (config key, database, category,
feature, command batch) are defined in the mod's `CONTEXT.md`
(`C:\Program Files\Epic Games\MORDHAUEditor\Mordhau\Mods\EZConfig\CONTEXT.md`).

## Language

### Game servers

**Game server**:
A Mordhau dedicated server that a server owner has registered on the platform.
_Avoid_: server (alone), instance, host

**Draft**:
A game server's auto-saved working configuration: the Character and Weapon
config values its owner is editing, which have not gone live.
_Avoid_: staged config, working copy, pending changes

**Live configuration**:
The configuration last applied to a game server, which the platform treats as
what that server should run.
_Avoid_: applied configuration, server config, current config

**Apply**:
Making a game server's Draft its Live configuration. Not the mod's **Apply**,
where one EZ instance writes its config values onto itself.
_Avoid_: push, deploy, publish, sync

**Confirmed**:
A Live configuration the game server has acknowledged processing.
_Avoid_: delivered, synced

**Pending**:
A Live configuration the game server has not yet confirmed.
_Avoid_: queued, unsynced

**Supported build**:
The one EZConfig build, named by its build stamp, that the platform sends
configuration to. Set by the platform operator.
_Avoid_: expected version, compatible version, minimum build

### Rulesets

**Ruleset**:
A named, owned collection of Ruleset versions that a server owner refines over
time, such as a competitive ruleset. A config package, never the EZConfig pak.
_Avoid_: mod, preset, profile

**Ruleset version**:
One immutable, numbered set of Character and Weapon config values within a
Ruleset.
_Avoid_: mod version, snapshot, revision

**Origin**:
The Ruleset version a Draft or Live configuration was last loaded from or
saved as. A configuration whose values differ from its origin's is modified.
_Avoid_: source, base, parent

### Notes

**Note**:
A comment on a config key that every server owner on the platform can read.
Never part of a Draft, Live configuration or Ruleset version.
_Avoid_: comment, annotation, version note
