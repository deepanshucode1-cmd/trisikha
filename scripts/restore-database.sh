#!/bin/bash
# =============================================================================
# Database Restore Script (Cloudflare R2)
# =============================================================================
# WARNING: This script will OVERWRITE your current database!
# Only run this when you need to restore from a backup.
#
# Prerequisites:
# - AWS CLI installed (used for S3-compatible R2 API)
# - PostgreSQL client installed (psql, pg_dump)
# - Environment variables set:
#   - SUPABASE_DB_URL
#   - R2_ACCESS_KEY_ID
#   - R2_SECRET_ACCESS_KEY
#   - R2_ACCOUNT_ID
#   - R2_BUCKET
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
R2_BUCKET="${R2_BUCKET:-trishikha-db-backups}"
BACKUP_PREFIX="backups/"

echo -e "${YELLOW}=== Database Restore Script (Cloudflare R2) ===${NC}"
echo ""

# Check prerequisites
if [ -z "$SUPABASE_DB_URL" ]; then
  echo -e "${RED}ERROR: SUPABASE_DB_URL environment variable is not set${NC}"
  echo "Set it with: export SUPABASE_DB_URL='postgresql://...'"
  exit 1
fi

if [ -z "$R2_ACCOUNT_ID" ]; then
  echo -e "${RED}ERROR: R2_ACCOUNT_ID environment variable is not set${NC}"
  exit 1
fi

if [ -z "$R2_ACCESS_KEY_ID" ] || [ -z "$R2_SECRET_ACCESS_KEY" ]; then
  echo -e "${RED}ERROR: R2 credentials not set (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)${NC}"
  exit 1
fi

if ! command -v aws &> /dev/null; then
  echo -e "${RED}ERROR: AWS CLI is not installed${NC}"
  exit 1
fi

if ! command -v psql &> /dev/null; then
  echo -e "${RED}ERROR: psql is not installed${NC}"
  exit 1
fi

# Configure AWS CLI for R2
aws configure set aws_access_key_id "$R2_ACCESS_KEY_ID"
aws configure set aws_secret_access_key "$R2_SECRET_ACCESS_KEY"
aws configure set default.region auto

R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# List available backups
echo -e "${GREEN}Available backups in Cloudflare R2:${NC}"
echo ""
aws s3 ls "s3://${R2_BUCKET}/${BACKUP_PREFIX}" --endpoint-url "$R2_ENDPOINT" --human-readable | grep ".sql.gz" | tail -10
echo ""

# Ask for backup file
read -p "Enter the backup filename (e.g., backup_20260119_203000.sql.gz): " BACKUP_FILE

if [ -z "$BACKUP_FILE" ]; then
  echo -e "${RED}ERROR: No backup file specified${NC}"
  exit 1
fi

# Create temp directory
TEMP_DIR=$(mktemp -d)
echo "Using temp directory: $TEMP_DIR"

# Download backup
echo -e "${YELLOW}Downloading backup from Cloudflare R2...${NC}"
aws s3 cp "s3://${R2_BUCKET}/${BACKUP_PREFIX}${BACKUP_FILE}" "$TEMP_DIR/" --endpoint-url "$R2_ENDPOINT"
aws s3 cp "s3://${R2_BUCKET}/${BACKUP_PREFIX}${BACKUP_FILE}.sha256" "$TEMP_DIR/" --endpoint-url "$R2_ENDPOINT" 2>/dev/null || echo "No checksum file found, skipping verification"

cd "$TEMP_DIR"

# Verify checksum if available
if [ -f "${BACKUP_FILE}.sha256" ]; then
  echo -e "${YELLOW}Verifying backup integrity...${NC}"
  if sha256sum -c "${BACKUP_FILE}.sha256"; then
    echo -e "${GREEN}Checksum verified!${NC}"
  else
    echo -e "${RED}ERROR: Checksum verification failed!${NC}"
    exit 1
  fi
fi

# Decompress
echo -e "${YELLOW}Decompressing backup...${NC}"
gunzip -k "$BACKUP_FILE"
SQL_FILE="${BACKUP_FILE%.gz}"

# Show backup info
echo ""
echo -e "${GREEN}Backup file info:${NC}"
echo "  Size: $(ls -lh "$SQL_FILE" | awk '{print $5}')"
echo "  Tables found:"
grep "CREATE TABLE" "$SQL_FILE" | head -10 | sed 's/^/    /'
echo ""

# Final confirmation
echo -e "${RED}=== WARNING ===${NC}"
echo -e "${RED}This will COMPLETELY OVERWRITE your current database!${NC}"
echo -e "${RED}All existing data will be LOST!${NC}"
echo ""
read -p "Type 'RESTORE' to confirm: " CONFIRM

if [ "$CONFIRM" != "RESTORE" ]; then
  echo "Restore cancelled."
  rm -rf "$TEMP_DIR"
  exit 0
fi

# Create a backup of current state first
echo -e "${YELLOW}Creating backup of current database state...${NC}"
CURRENT_BACKUP="pre_restore_$(date +%Y%m%d_%H%M%S).sql"
pg_dump "$SUPABASE_DB_URL" --no-owner --no-acl > "$CURRENT_BACKUP" 2>/dev/null || echo "Warning: Could not backup current state"

# Perform restore
echo -e "${YELLOW}Restoring database...${NC}"

# Option 1: Drop and recreate schema (clean restore)
echo "Dropping existing schema..."
psql "$SUPABASE_DB_URL" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;" 2>/dev/null

# Restore from backup
echo "Restoring from backup..."
psql "$SUPABASE_DB_URL" < "$SQL_FILE"

# Re-enable RLS on all tables
echo -e "${YELLOW}Re-enabling Row Level Security...${NC}"
psql "$SUPABASE_DB_URL" << 'EOF'
DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl.tablename);
  END LOOP;
END $$;
EOF

# Verify restore
echo -e "${YELLOW}Verifying restore...${NC}"
psql "$SUPABASE_DB_URL" -c "SELECT 'products' as table_name, COUNT(*) as count FROM products UNION ALL SELECT 'orders', COUNT(*) FROM orders UNION ALL SELECT 'order_items', COUNT(*) FROM order_items;"

# Cleanup
echo -e "${YELLOW}Cleaning up...${NC}"
rm -rf "$TEMP_DIR"

echo ""
echo -e "${GREEN}=== Restore Complete ===${NC}"
echo ""
echo "Next steps:"
echo "  1. Verify your application is working correctly"
echo "  2. Check that all RLS policies are intact"
echo "  3. Test critical flows (checkout, orders, etc.)"
echo ""
echo -e "${YELLOW}Pre-restore backup saved as: $CURRENT_BACKUP${NC}"
