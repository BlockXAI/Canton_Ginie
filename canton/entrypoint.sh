#!/bin/bash
set -euo pipefail

echo "==================================="
echo "Canton Sandbox Starting on Railway"
echo "==================================="

# Parse DATABASE_URL if available
if [ -n "${DATABASE_URL:-}" ]; then
  echo "Parsing DATABASE_URL..."
  echo "Raw DATABASE_URL: ${DATABASE_URL:0:50}..."
  
  # Normalize postgresql:// to postgres:// for consistent parsing
  NORMALIZED_URL=$(echo "$DATABASE_URL" | sed 's|^postgresql://|postgres://|')

  export DATABASE_USER=$(echo "$NORMALIZED_URL" | sed -n 's|postgres://\([^:]*\):.*|\1|p')
  export DATABASE_PASSWORD=$(echo "$NORMALIZED_URL" | sed -n 's|postgres://[^:]*:\([^@]*\)@.*|\1|p')
  export DATABASE_HOST=$(echo "$NORMALIZED_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
  export DATABASE_PORT=$(echo "$NORMALIZED_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
  export DATABASE_NAME=$(echo "$NORMALIZED_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')
  
  echo "Parsed values:"
  echo "  User: $DATABASE_USER"
  echo "  Host: $DATABASE_HOST"
  echo "  Port: $DATABASE_PORT"
  echo "  Database: $DATABASE_NAME"
fi

# Set Canton environment variables with defaults
export CANTON_DB_HOST="${DATABASE_HOST:-localhost}"
export CANTON_DB_PORT="${DATABASE_PORT:-5432}"
export CANTON_DB_NAME="${DATABASE_NAME:-railway}"
export CANTON_DB_USER="${DATABASE_USER:-postgres}"
export CANTON_DB_PASSWORD="${DATABASE_PASSWORD:-}"

echo "Canton Configuration:"
echo "  DB Host: $CANTON_DB_HOST"
echo "  DB Port: $CANTON_DB_PORT"
echo "  DB Name: $CANTON_DB_NAME"
echo "  DB User: $CANTON_DB_USER"

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
MAX_RETRIES=30
RETRY_COUNT=0
until pg_isready -h "$CANTON_DB_HOST" -p "$CANTON_DB_PORT" -U "$CANTON_DB_USER" 2>/dev/null; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "ERROR: PostgreSQL not ready after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "PostgreSQL is unavailable (attempt $RETRY_COUNT/$MAX_RETRIES) - sleeping"
  sleep 2
done

echo "PostgreSQL is ready!"

# The local domain uses memory storage so its identity (domain ID) changes on
# every restart, while the participant persists its domain registrations in
# Postgres. This mismatch causes DOMAIN_ALIAS_DUPLICATION on reconnect.
#
# Additionally, the domain's in-memory topology manager still writes objects
# (sequences, types) into the public schema. When Flyway later tries to run
# participant migrations it sees a non-empty schema without a schema history
# table and fails with:
#   "Found non-empty schema(s) public but no schema history table"
#
# Fix: DROP and recreate the entire public schema so it is truly empty.
# Canton will recreate everything via Flyway on startup.
# This is safe for a sandbox — no production state needs to survive restarts.
echo "Resetting ALL database schemas to prevent Flyway / participant-ID-mismatch errors..."
PGPASSWORD="$CANTON_DB_PASSWORD" psql -h "$CANTON_DB_HOST" -p "$CANTON_DB_PORT" \
  -U "$CANTON_DB_USER" -d "$CANTON_DB_NAME" -c "
    DO \$\$
    DECLARE s TEXT;
    BEGIN
      FOR s IN
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
      LOOP
        EXECUTE 'DROP SCHEMA IF EXISTS ' || quote_ident(s) || ' CASCADE';
      END LOOP;
    END \$\$;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
  " \
  && echo "  Database fully reset" \
  || echo "  Database reset skipped (may not have permission — continuing)"

# Verify Canton binary exists
if [ ! -f "/canton/bin/canton" ]; then
  echo "ERROR: Canton binary not found at /canton/bin/canton"
  ls -la /canton/bin/ || echo "bin directory does not exist"
  exit 1
fi

# Start Canton daemon in background with bootstrap script
echo "Starting Canton daemon with bootstrap script..."
echo "Command: /canton/bin/canton daemon -c /canton/config/canton-railway.conf --bootstrap /canton/config/bootstrap.canton"
/canton/bin/canton daemon \
  -c /canton/config/canton-railway.conf \
  --bootstrap /canton/config/bootstrap.canton \
  --log-level-root=INFO \
  --log-level-canton=INFO \
  --log-level-stdout=INFO &

CANTON_PID=$!
echo "Canton daemon started (PID: $CANTON_PID)"

# Wait for Canton gRPC Ledger API to be ready on port 6865
echo "Waiting for Canton Ledger API on port 6865..."
LEDGER_RETRIES=0
LEDGER_MAX_RETRIES=60
until nc -z localhost 6865 2>/dev/null; do
  LEDGER_RETRIES=$((LEDGER_RETRIES + 1))
  if [ $LEDGER_RETRIES -ge $LEDGER_MAX_RETRIES ]; then
    echo "ERROR: Canton Ledger API not ready after $LEDGER_MAX_RETRIES attempts"
    kill $CANTON_PID 2>/dev/null
    exit 1
  fi
  # Check if Canton is still running
  if ! kill -0 $CANTON_PID 2>/dev/null; then
    echo "ERROR: Canton daemon exited unexpectedly"
    exit 1
  fi
  echo "Ledger API not ready yet (attempt $LEDGER_RETRIES/$LEDGER_MAX_RETRIES) - sleeping"
  sleep 3
done
echo "Canton Ledger API is ready on port 6865!"

# Start the HTTP JSON API bridge on port 7575
echo "Starting HTTP JSON API bridge on 0.0.0.0:7575 -> gRPC localhost:6865..."
java -jar /canton/http-json.jar --config /canton/config/json-api.conf &

JSON_API_PID=$!
echo "JSON API bridge started (PID: $JSON_API_PID)"

# Wait for JSON API to be ready
echo "Waiting for JSON API on port 7575..."
JSON_RETRIES=0
JSON_MAX_RETRIES=30
until nc -z localhost 7575 2>/dev/null; do
  JSON_RETRIES=$((JSON_RETRIES + 1))
  if [ $JSON_RETRIES -ge $JSON_MAX_RETRIES ]; then
    echo "ERROR: JSON API not ready after $JSON_MAX_RETRIES attempts"
    kill $CANTON_PID $JSON_API_PID 2>/dev/null
    exit 1
  fi
  if ! kill -0 $JSON_API_PID 2>/dev/null; then
    echo "ERROR: JSON API process exited unexpectedly"
    kill $CANTON_PID 2>/dev/null
    exit 1
  fi
  sleep 2
done
echo "HTTP JSON API is ready on port 7575!"
echo "==================================="
echo "Canton + JSON API fully started"
echo "  gRPC Ledger API: localhost:6865"
echo "  HTTP JSON API:   localhost:7575"
echo "  Admin API:       localhost:7576"
echo "==================================="

# Wait for either process to exit
wait -n $CANTON_PID $JSON_API_PID
EXIT_CODE=$?
echo "A process exited with code $EXIT_CODE, shutting down..."
kill $CANTON_PID $JSON_API_PID 2>/dev/null
wait
exit $EXIT_CODE
