# Phase 11: Static Presets - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<vision>
## How This Should Work

Users see a preset gallery where they can browse available static presets. Each preset shows its title and description from a manifest file. When they find one they want, they can load it into their working state.

**Load behavior is protective:**
- If user has unsaved working changes → block loading, explain why
- If working state is clean (saved) → confirmation dialog suggesting they save their current config as a preset first before loading

Loading a preset puts the values into working state — user must still click Save to persist. This matches the existing workflow: edit freely, save explicitly.

</vision>

<essential>
## What Must Be Nailed

- **Preset gallery UI** — Visual browse experience, not just a dropdown
- **Title + description** — Each preset has manifest.json with metadata so users know what they're getting
- **Safe loading** — Don't let users accidentally blow away unsaved work
- **Discovery** — Easy to browse/filter/search to find the right preset

</essential>

<boundaries>
## What's Out of Scope

- Saving user presets — that's Phase 12
- Editing preset metadata — static presets are read-only
- Import/export — defer to Phase 13 polish
- Preview of actual config values — nice to have but not essential (description is the preview)

</boundaries>

<specifics>
## Specific Ideas

**File structure:**
```
Presets/
  Static/
    {preset_name}/
      manifest.json       # { title, description, ... }
      Weapon/
        Greatsword/
          General.json
          Strike.json
          ...
      Character/
        ...
```

- Presets mirror the database structure exactly
- Multiple static presets can ship with the app
- manifest.json in each preset folder contains title, description
- Can reuse existing database reading patterns since structure is identical

**User presets (Phase 12) will be:**
```
Presets/
  {user_preset_name}/
    manifest.json
    ...
```

</specifics>

<notes>
## Additional Context

- Quick preview of actual config values would be nice if there's a good way to generate it from the data, but not essential
- Clear naming/descriptions are up to preset authors
- Structure decision enables code reuse with existing database service

</notes>

---

*Phase: 11-static-presets*
*Context gathered: 2026-01-26*
