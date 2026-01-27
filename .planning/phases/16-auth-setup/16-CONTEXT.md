# Phase 16: Auth Setup - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<vision>
## How This Should Work

Simple, file-based authentication system. Users stored in a local JSON file with username, password (plain text for now - this is a crude first implementation), and role.

When a user visits the app:
1. If not logged in → show login screen
2. If logged in → show main app with role-based permissions

Initial admin user bootstrapped from environment variables on first run.

</vision>

<essential>
## What Must Be Nailed

- **Login gate**: Unauthenticated users cannot access the app
- **Simple token in localStorage**: Maintains session across page refreshes
- **Env-based bootstrap**: `ADMIN_USERNAME` and `ADMIN_PASSWORD` create first user if users.json empty
- **Role stored with user**: Each user has one of 4 roles

</essential>

<boundaries>
## What's Out of Scope

- Password hashing (crude first implementation)
- Password reset / forgot password
- Multiple sessions per user tracking
- Session expiry (tokens live until logout or localStorage clear)
- OAuth / external auth providers
- User Management UI (Phase 17)
- Role enforcement in UI (Phase 18)

</boundaries>

<specifics>
## Specific Implementation Details

**Users file format:**
```json
[
  { "username": "admin", "password": "admin123", "role": "global_admin" },
  { "username": "viewer1", "password": "view123", "role": "viewer" }
]
```

**Roles (hierarchy):**
1. `viewer` - View only, no actions
2. `preset_creator` - Can create new presets only
3. `config_editor` - Full config control except user management
4. `global_admin` - Full access including user management

**Environment variables for bootstrap:**
- `ADMIN_USERNAME` - Initial admin username
- `ADMIN_PASSWORD` - Initial admin password

**Auth token:**
- Simple token stored in localStorage
- Token checked on API calls via middleware

</specifics>

<notes>
## Additional Context

Priority is role enforcement - ensuring the role system works correctly is more important than polish.

This is intentionally crude/simple. No need for:
- bcrypt password hashing
- JWT with expiry
- Refresh tokens
- Complex session management

Just get login working and store the role.

</notes>

---

*Phase: 16-auth-setup*
*Context gathered: 2026-01-26*
