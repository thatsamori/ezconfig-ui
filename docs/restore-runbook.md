# Restoring the platform from its backup

Use this when the platform instance is lost: it fails to boot, its disk is gone,
or it cannot be trusted. It builds a fresh Lightsail instance, restores the
database from the bucket, starts the app and signs in. What runs where is in
[hosting.md](hosting.md); this page refers to it rather than repeating it.

While the platform is down, game servers keep their last applied values and
poll again by themselves. Once the restored platform answers, they reconnect
with the keys in the restored database. Nothing needs doing on any game server.

Litestream ships each change within a second or two, so a restore of the latest
backup loses at most the last few seconds. A game server that applied something
in those seconds reports a Live configuration the restored platform does not
know, and gets the restored one again.

The [drill](#the-drill) at the end runs the same steps beside the live instance,
before launch and after any change to backups.

## What you need

- From the owner's password manager: the three settings files
  (`platform.env`, `caddy.env`, `litestream.yml`) and the instance's SSH key.
- The AWS console for the project, in its selected Region (us-east-2).
- This repo, at or after the commit the platform ran. The Status page shows
  it; so does the newest folder name in `/srv/ezconfig-platform/releases`.

## 1. Stop the old instance

Two Litestream processes streaming to the same bucket path would ruin the
backup. Before anything else, make sure the old instance cannot run:

- If it still answers SSH: `ssh ezconfig-platform sudo systemctl stop ezconfig-platform litestream`.
- Either way, stop it in Lightsail (Instances > the instance > Stop). Keep it
  stopped, not deleted, until the new instance has run for a day.

## 2. Build a fresh instance

In Lightsail, Create instance, matching the old one (the
[hosting ticket](../.scratch/online-platform/issues/22-hosting-walking-skeleton.md)
lists its settings):

1. Region us-east-2, Linux/Unix, OS only, Ubuntu 24.04 LTS, the $12 bundle,
   the same SSH key pair (the Region's default key pair). Any name, such as
   `ezconfig-platform-2`.
2. Networking, firewall: 80 and 443 from anywhere, on IPv4 and IPv6; 22 only
   from the owner's IPv4 address, plus Lightsail's browser SSH. DNS has A
   records only, so the instance's IPv6 address, which changes with the
   instance, is in none.
3. Networking: detach the static IP from the old instance and attach it to the
   new one. Both hostnames' A records point at the static IP, so DNS stays as
   it is.
4. Automatic snapshots on, at 11:00 UTC. Instance metadata: IMDSv2 required.
5. Metrics: the alarm is per instance. Add the status-check alarm again
   (`StatusCheckFailed`, at least 1 in one period, email on ALARM and OK).

The static IP now leads to a new host key. On the PC, forget the old one, then
connect once to accept the new one:

```bash
ssh-keygen -R <the static IP>
ssh ezconfig-platform true
```

## 3. Provision

From the repo root on the PC (hosting.md, "Setting up an instance"):

```bash
ssh ezconfig-platform rm -rf ezconfig-deploy
scp -r deploy ezconfig-platform:ezconfig-deploy
ssh ezconfig-platform sudo bash ezconfig-deploy/provision.sh
```

The settings files are empty, so nothing starts yet.

## 4. Fill the settings files

On the instance (`ssh ezconfig-platform`), paste each file from the password
manager with `sudo nano <file>`:

- `/etc/ezconfig-platform/platform.env`
- `/etc/ezconfig-platform/caddy.env`
- `/etc/litestream.yml`

Do not provision again yet. Provisioning starts Litestream, and the database
must be restored before Litestream ever runs beside it.

## 5. Restore the database

Still on the instance:

```bash
sudo litestream restore -config /etc/litestream.yml /var/lib/ezconfig-platform/platform.db
sudo chown ezconfig:ezconfig /var/lib/ezconfig-platform/platform.db*
sudo -u ezconfig sqlite3 -readonly /var/lib/ezconfig-platform/platform.db 'PRAGMA integrity_check; PRAGMA user_version; SELECT count(*) FROM users; SELECT count(*) FROM game_servers;'
```

`litestream restore` writes the latest backup to the database path in its
config, and refuses if a database is already there. The last command should
print `ok`, the schema version (the number of migrations applied), and the
counts of server owners and game servers you expect.

To restore to an earlier moment instead, add `-timestamp 2026-11-10T09:30:00Z`
(UTC). Point-in-time restores reach back 14 days; the drill does not cover
them.

## 6. Start Litestream, Caddy and the app

From the PC:

```bash
ssh ezconfig-platform sudo bash ezconfig-deploy/provision.sh
bun run deploy <commit>
```

Provisioning starts Caddy, which gets certificates for both hostnames, and
Litestream. Litestream reads the bucket's position before it streams, and
continues the backup the old instance left. The deploy builds and starts the
app; startup migrates the restored database if the commit is newer.

Check that nothing failed:

```bash
ssh ezconfig-platform 'systemctl is-active caddy litestream ezconfig-platform; journalctl -u litestream --since -10min -p warning --no-pager'
```

## 7. Sign in and check

1. Open `https://<public hostname>` and sign in with Discord as the platform
   operator.
2. On the Status page:
   - the release commit is the one you deployed;
   - game servers registered is the count from step 5. Connected now rises as
     game servers poll, within a minute or so of the app starting;
   - "Backup: last confirmed" is under 2 minutes old.
3. On the instance, run the restore check. A pass shows that the new
   instance's backup restores, and matches its database:

   ```bash
   ssh ezconfig-platform sudo systemctl start ezconfig-restore-check
   ```

   The Status page then shows "passed" for the restore check.
4. After a day without problems, delete the old instance in Lightsail. Its
   automatic snapshots go with it.

## The drill

Run the steps above on a second instance while the live one keeps serving.
The live instance, its static IP, its hostnames and its backup are never
touched. Before launch, and after any change to backups. Record the result
under the ticket that called for it, then remove the drill instance.

What changes:

| Step | In the drill |
|---|---|
| 1. Stop the old instance | Skip it: the live instance keeps running. |
| 2. Build | Name it `ezconfig-platform-drill`. Same bundle, image, key pair and firewall, but no static IP: use its own public IP. Skip the snapshots and the alarm. Add an SSH alias `ezconfig-drill` with that IP. |
| Hostnames | Two drill hostnames with A records to the drill's IP, such as `drill.modhau.com` (public) and `drill-platform.modhau.com`. Add `https://drill.modhau.com/api/auth/discord/callback` to the Discord application's Redirects. |
| 3. Provision | With `ezconfig-drill` in place of `ezconfig-platform`. |
| 4. Settings | `platform.env` as live, but `PUBLIC_URL=https://drill.modhau.com`. `caddy.env` with the drill hostnames. **Leave `/etc/litestream.yml` empty**: Litestream on the drill would stream the drill's database into the live backup. With it empty, Litestream and the restore check never start there. |
| 5. Restore | Use a root-only copy of the live config instead: `sudo install -m 600 /dev/null /root/restore.yml`, fill it with `sudo nano /root/restore.yml`, restore with `-config /root/restore.yml`, then `sudo rm /root/restore.yml`. |
| 6. Start | Provision again (Caddy starts; Litestream stays off). Deploy the commit the live instance runs: `DEPLOY_SSH_HOST=ezconfig-drill bun run deploy <commit>`. |
| 7. Check | Sign in at the drill hostname. Game servers keep polling the live instance, so none stays Connected on the drill. The backup heartbeat warns, and the restore check reads never checked: both are right for an instance without Litestream. Instead of the restore check, compare the drill's counts from step 5 with the live Status page. |
| Afterwards | Delete the drill instance, the two A records and the Discord redirect. |

What the drill does not cover:

- Litestream continuing the live backup from a restored database (step 6). It
  can only be tried where the old instance no longer streams. Litestream reads
  the bucket's position before it streams a restored database (fixed in
  0.5.1). After a real restore, the restore check in step 7 is the proof.
- Moving the static IP and adding the alarm again (step 2).
- A point-in-time restore.
