#!/bin/bash
set -e

echo "Waiting for database to be ready..."
until pg_isready -h "${DB_HOST:-postgres}" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}"; do
  echo "Database is unavailable - sleeping"
  sleep 1
done

echo "Database is ready! Running migrations..."
alembic upgrade head

echo "Starting application..."
exec "$@"

