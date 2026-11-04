# EZConfig platform

The hosted service where server owners manage EZConfig configuration for their
Mordhau servers. Config-contract terms (config key, database, category,
feature, command batch) are defined in the mod's `CONTEXT.md`
(`C:\Program Files\Epic Games\MORDHAUEditor\Mordhau\Mods\EZConfig\CONTEXT.md`).

## Language

### People

**Server owner**:
A person signed in to the platform with their Discord account. Owns the game
servers and Rulesets they create; nobody else edits them.
_Avoid_: user, customer, account, admin

**Platform operator**:
A server owner named in the instance's own settings as the person who runs it.
Not a role granted from inside the platform.
_Avoid_: admin, moderator, superuser

**Invite**:
A single-use link the platform operator makes so that one new Discord account
can become a server owner.
_Avoid_: invite code, allowlist, referral

### Game servers

**Game server**:
A Mordhau dedicated server that a server owner has registered on the platform.
_Avoid_: server (alone), instance, host

**Game server key**:
The secret a game server presents to the platform to receive its Live
configuration and report processing it. One per game server.
_Avoid_: client key, API key, token, RCON password

**Connected**:
A game server that is waiting on the platform for its Live configuration, or
was within the last few seconds. A change reaches only connected game servers
within about 5 s.
_Avoid_: online, live, up

**Draft**:
A game server's auto-saved working configuration: the Character and Weapon
config values its owner is editing, which have not gone live.
_Avoid_: staged config, working copy, pending changes

**Unapplied changes**:
A Draft whose values differ from its game server's Live configuration. Not the
same as modified, which compares a configuration with its origin.
_Avoid_: pending changes, unsaved changes

**Live configuration**:
The configuration last applied to a game server, which the platform treats as
what that server should run.
_Avoid_: applied configuration, server config, current config

**Apply**:
Making a game server's Draft its Live configuration. Not the mod's **Apply**,
where one EZ instance writes its config values onto itself.
_Avoid_: push, deploy, publish, sync

**Confirmed**:
A Live configuration the game server has reported processing successfully.
_Avoid_: delivered, synced

**Failed**:
A Live configuration whose processing on the game server stopped at a failed
command, so the server runs only the part before it.
_Avoid_: rejected, incomplete, error

**Pending**:
A Live configuration the game server has not yet reported processing.
_Avoid_: queued, unsynced

**Blocked**:
A Live configuration the platform cannot send because the current schema
refuses some of its values, as after a deploy that tightened a key. It is
never sent in part. Fixing those values in the Draft and Apply sends the new
one.
_Avoid_: refused, unsendable, stuck

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

**Ruleset file**:
One Ruleset version as a file, with the Ruleset's name and the version's
description and values, which its owner exports and sends to someone. Importing
one makes version 1 of a new Ruleset of the importer's. The Ruleset itself stays
private on the platform.
_Avoid_: share link, shared Ruleset, preset file, backup

**Origin**:
The Ruleset version a Draft or Live configuration was last loaded from or
saved as. A configuration whose values differ from its origin's is modified.
_Avoid_: source, base, parent

### Config editing

**Starter shape**:
A ready-made release curve the editor offers as a starting point. Choosing one
copies its points into the value being edited; nothing remembers which one was
chosen.
_Avoid_: preset, template, named curve

### Notes

**Note**:
A comment on a config key that every server owner on the platform can read.
Never part of a Draft, Live configuration or Ruleset version.
_Avoid_: comment, annotation, version note
