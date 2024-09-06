#!/bin/bash

# Define the volume name
VOLUME_NAME="db-data"

# Check if the volume already exists
if ! docker volume inspect $VOLUME_NAME > /dev/null 2>&1; then
  # Create the volume if it doesn't exist
  echo "Creating Docker volume $VOLUME_NAME..."
  docker volume create $VOLUME_NAME
else
  echo "Volume $VOLUME_NAME already exists."
fi

# Run PostgreSQL container
echo "Starting PostgreSQL container..."

docker run -d \
  --name postgres-db \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=video_db \
  -p 5432:5432 \
  -v $VOLUME_NAME:/var/lib/postgresql/data \
  postgres:13

# Verify the container is running
if [ $? -eq 0 ]; then
  echo "PostgreSQL container started successfully."
else
  echo "Failed to start PostgreSQL container."
  exit 1
fi

