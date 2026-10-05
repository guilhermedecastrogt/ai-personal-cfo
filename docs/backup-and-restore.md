# Backup and restore

The database is the only state the CFO has. Images are rebuilt from Git, configuration is one file, and receipts are never stored.

## What is backed up

A logical dump of the whole database, taken with `pg_dump` in PostgreSQL's custom format, which is compressed and can be restored selectively. It includes the table that records applied migrations, so a restored database matches a known schema version.

`.env` is not backed up by any script. Keep a copy of it in a password manager: without it the dump can be restored, but the system cannot be started.

## Where backups go

| Location                                 | Protects against                                         | Set up by           |
| ---------------------------------------- | -------------------------------------------------------- | ------------------- |
| `/var/backups/ai-personal-cfo` on the VM | A bad migration, a mistaken delete, a lost Docker volume | Default             |
| An Object Storage bucket                 | Losing the VM or its disk                                | Optional, see below |

The first location is outside the database's Docker volume but on the same disk. On its own it does not protect against losing the machine. The backup script says so in its output every time no upload is configured.

## How a backup is taken

```sh
cd /opt/ai-personal-cfo
./scripts/backup.sh
```

1. Runs `pg_dump` inside the `postgres` container and streams the result to a temporary file in the backup directory.
2. Asks `pg_restore` to list the file's contents and refuses to keep a dump that has no table data.
3. Renames it to `cfo-<UTC timestamp>.dump`, readable only by its owner.
4. Uploads it, if `BACKUP_UPLOAD_URL` is set. A failed upload is an error, and the local file is kept.
5. Deletes local dumps older than `BACKUP_RETENTION_DAYS`, 14 by default.

It does not stop the application. `pg_dump` reads a consistent snapshot while the system is in use.

A backup is also taken automatically at the start of every deployment after the first, before migrations run.

## Schedule

Install the timer once on the VM:

```sh
sudo cp systemd/cfo-backup.service systemd/cfo-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cfo-backup.timer
systemctl list-timers cfo-backup.timer
```

It runs daily at 03:30 UTC, at low CPU and disk priority so that it does not compete with Minecraft. If the VM was off at that time, it runs at the next start.

The unit runs as root by default. To run it as the deploy user, add `User=<deploy user>` to the `[Service]` section. The unit assumes the stack is in `/opt/ai-personal-cfo`.

Check the last run with `journalctl -u cfo-backup.service -n 20`.

## Off-machine copy

The upload uses a pre-authenticated request: a long random URL that allows writing objects into one bucket and nothing else. The VM holds no OCI credential, and the link cannot be used to read or delete backups.

1. In [Terraform](../infra/terraform/README.md), set `create_backup_bucket = true` and `backup_upload_expires_at`, then plan and apply.
2. Read the link with `terraform output -raw backup_upload_url`.
3. Put it in `.env` on the VM as `BACKUP_UPLOAD_URL`.
4. Run `./scripts/backup.sh` and check for `uploaded file=…`.

The link expires on the date you chose. Renew it before then by changing the variable and applying again, or uploads will start to fail, which the backup script reports as an error.

Set `backup_retention_days` to have Object Storage delete old backups. That needs a tenancy policy allowing the Object Storage service to manage objects in the compartment, which this project does not create. With it left at `0`, remove old objects by hand.

Any other destination works the same way if it accepts an HTTP `PUT` to a URL. To use a different tool, copy the files from the backup directory with it instead.

This upload path has not been exercised against a real bucket.

## Restore

There are two modes. Both read a dump file on the VM. To restore from the bucket, download the object to the VM first.

### Check that a backup restores

```sh
./scripts/restore.sh verify /var/backups/ai-personal-cfo/cfo-<timestamp>.dump
```

Restores the dump into a scratch database, prints how many tables, households and transactions it contains, and drops the scratch database. The live database is not touched and the application keeps running. Do this monthly: a backup that has never been restored is a hope, not a backup.

### Replace the live database

```sh
CONFIRM_RESTORE=<database name> ./scripts/restore.sh replace /var/backups/ai-personal-cfo/cfo-<timestamp>.dump
```

Without `CONFIRM_RESTORE` set to the database's name, the script refuses and changes nothing.

1. Takes a fresh backup of the current database, so the restore itself can be undone.
2. Stops `api` and `web`. The system is down from here.
3. Drops and recreates the database, and restores the dump in a single transaction. If the restore fails, the database is left empty and the safety backup from step 1 is what you restore next.
4. Starts `api` and `web` and waits for them to be healthy. Migrations newer than the dump are applied on the way up.

Everything recorded after the dump was taken is lost. Members will need to sign in again only if their sessions were created after the dump.

### Rebuilding on a new machine

1. Prepare the host and deploy as in [deployment.md](deployment.md#first-time-setup), with the saved `.env`. This creates an empty, migrated database.
2. Copy the latest dump to the machine.
3. Run the `replace` restore.
4. Point DNS at the new machine.

## What was tested

On a development machine, with the production stack: a backup was taken, verified into a scratch database, the live rows were then deleted, and the `replace` restore brought them back, with the application healthy afterwards. The refusal without `CONFIRM_RESTORE` was also exercised.

Not tested: the systemd timer, the upload, and a restore on the Oracle VM.

## Limitations

- Backups are daily. Up to a day of data can be lost, plus whatever was recorded since the last deployment backup.
- There is no point-in-time recovery.
- Backups are not encrypted by the script. The directory is private to its owner, and the bucket is private.
- Nothing alerts you when a backup fails. Check the timer's journal, or the bucket.
