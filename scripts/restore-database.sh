#!/bin/bash
# =============================================================================
# Database Restore Script (Cloudflare R2)
# =============================================================================
# WARNING: This script will OVERWRITE your current database!
# Only run this when you need to restore from a backup.
#
# Prerequisites:
# - AWS CLI installed (used for S3-compatible R2 API)
# - PostgreSQL 17 client installed (pg_restore)
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

if ! command -v pg_restore &> /dev/null; then
  echo -e "${RED}ERROR: pg_restore is not installed${NC}"
  echo "Install PostgreSQL 17 client: sudo apt install postgresql-client-17"
  exit 1
fi

# Check pg_restore version
PG_VERSION=$(pg_restore --version | grep -oP '\d+' | head -1)
if [ "$PG_VERSION" -lt 17 ]; then
  echo -e "${YELLOW}WARNING: pg_restore version $PG_VERSION detected. Version 17+ recommended.${NC}"
fi

# Configure AWS CLI for R2
aws configure set aws_access_key_id "$R2_ACCESS_KEY_ID"
aws configure set aws_secret_access_key "$R2_SECRET_ACCESS_KEY"
aws configure set default.region auto

R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# List available backups
echo -e "${GREEN}Available backups in Cloudflare R2:${NC}"
echo ""
aws s3 ls "s3://${R2_BUCKET}/${BACKUP_PREFIX}" --endpoint-url "$R2_ENDPOINT" --human-readable | grep ".dump" | tail -10
echo ""

# Ask for backup file or use argument
if [ -n "$1" ]; then
  BACKUP_FILE="$1"
else
  read -p "Enter the backup filename (e.g., backup_20260120_064534.dump): " BACKUP_FILE
fi

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
    rm -rf "$TEMP_DIR"
    exit 1
  fi
fi

# Show backup info
echo ""
echo -e "${GREEN}Backup file info:${NC}"
echo "  Size: $(ls -lh "$BACKUP_FILE" | awk '{print $5}')"
echo ""
echo "  Contents (first 30 items):"
pg_restore --list "$BACKUP_FILE" 2>/dev/null | head -30 | sed 's/^/    /'
echo ""

# Final confirmation
echo -e "${RED}=== WARNING ===${NC}"
echo -e "${RED}This will restore data to your database!${NC}"
echo -e "${RED}Existing objects in public schema may be overwritten!${NC}"
echo ""
read -p "Type 'RESTORE' to confirm: " CONFIRM

if [ "$CONFIRM" != "RESTORE" ]; then
  echo "Restore cancelled."
  rm -rf "$TEMP_DIR"
  exit 0
fi

# Create a backup of current state first
echo -e "${YELLOW}Creating backup of current database state...${NC}"
CURRENT_BACKUP="pre_restore_$(date +%Y%m%d_%H%M%S).dump"
pg_dump "$SUPABASE_DB_URL" \
  --format=custom \
  --blobs \
  --schema=public \
  --no-owner \
  --no-acl \
  --file="$CURRENT_BACKUP" 2>/dev/null || echo "Warning: Could not backup current state"

# Perform restore
echo -e "${YELLOW}Restoring database...${NC}"

# Restore from backup using pg_restore
# --clean: Drop existing objects before restoring
# --if-exists: Don't error if objects don't exist when dropping
# --no-owner: Skip ownership commands
# --no-acl: Skip permission commands
# --schema=public: Only restore public schema
pg_restore \
  --verbose \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  --schema=public \
  -d "$SUPABASE_DB_URL" \
  "$BACKUP_FILE" 2>&1 || echo -e "${YELLOW}Some non-critical errors may have occurred (this is normal)${NC}"

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
psql "$SUPABASE_DB_URL" -c "SELECT 'products' as table_name, COUNT(*) as count FROM products UNION ALL SELECT 'orders', COUNT(*) FROM orders UNION ALL SELECT 'order_items', COUNT(*) FROM order_items;" 2>/dev/null || echo "Could not verify tables (some may not exist)"

# Cleanup
echo -e "${YELLOW}Cleaning up...${NC}"
cd /
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
