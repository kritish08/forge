#!/bin/bash
set -e

# Configuration
# Required Environment Variables:
# - MONGO_URL (Connection string, e.g., mongodb+srv://...)
# - S3_BUCKET (S3 bucket name, e.g., s3://forge-backups)
# - AWS_REGION (e.g., us-east-1)

if [ -z "$MONGO_URL" ] || [ -z "$S3_BUCKET" ] || [ -z "$AWS_REGION" ]; then
    echo "Error: Missing required environment variables."
    exit 1
fi

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILENAME="forge_backup_$TIMESTAMP.archive.gz"
BACKUP_PATH="/tmp/$BACKUP_FILENAME"

echo "Running backup at $(date)..."

# 1. Dump Database and compress directly
mongodump --uri="$MONGO_URL" --archive="$BACKUP_PATH" --gzip

if [ ! -f "$BACKUP_PATH" ]; then
    echo "Error: Backup failed, file not created."
    exit 1
fi

echo "Backup size: $(du -sh $BACKUP_PATH | cut -f1)"

# 2. Upload to S3
echo "Uploading to S3 Bucket: $S3_BUCKET..."
aws s3 cp "$BACKUP_PATH" "$S3_BUCKET/$BACKUP_FILENAME" --region "$AWS_REGION"

# 3. Clean up container /tmp space
rm "$BACKUP_PATH"

echo "Backup and upload completed successfully!"
exit 0
