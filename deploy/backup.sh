#!/bin/bash
# Faculytics database backup script
# Run via cron: 0 3 * * * /opt/faculytics/deploy/backup.sh

set -euo pipefail

BACKUP_DIR="/backups"
RETENTION_DAYS=7
DATE=$(date +%Y-%m-%d)
COMPOSE_FILE="/opt/faculytics/docker-compose.deploy.yml"
CONTAINER_NAME=$(docker compose -f "$COMPOSE_FILE" ps -q postgres)

mkdir -p "$BACKUP_DIR"

for DB in faculytics_staging faculytics_prod; do
  BACKUP_FILE="${BACKUP_DIR}/${DB}_${DATE}.sql.gz"

  if docker exec "$CONTAINER_NAME" pg_dump -U faculytics "$DB" | gzip > "$BACKUP_FILE"; then
    echo "[$(date)] Backup OK: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
  else
    echo "[$(date)] Backup FAILED: $DB" >&2
  fi
done

# Clean backups older than retention period
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "[$(date)] Cleanup: removed backups older than ${RETENTION_DAYS} days"
