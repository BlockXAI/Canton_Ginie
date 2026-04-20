# Canton Sandbox on Railway

This directory contains the configuration to deploy Canton sandbox on Railway.

## Architecture

- **Canton Participant**: Ledger API on port 7575, Admin API on port 7576
- **Canton Domain**: Public API on port 7577, Admin API on port 7578
- **Storage**: PostgreSQL (shared with main app or separate database)

## Deployment Steps

### 1. Push Canton Files to GitHub

```bash
git add canton/
git commit -m "Add Canton sandbox Railway deployment"
git push
```

### 2. Create Canton Service in Railway

1. Go to your Railway project: https://railway.app/project/4d7c89d1-99cc-4520-9aa5-5868e269f449
2. Click **"+ New"** → **"GitHub Repo"**
3. Select your `Canton_Ginie` repository
4. Set **Root Directory** to `canton`
5. Railway will auto-detect the Dockerfile

### 3. Link PostgreSQL Database

In the Canton service settings:
1. Go to **Variables** tab
2. Click **"+ New Variable"** → **"Add Reference"**
3. Select your **Postgres** service
4. Add these references:
   - `DATABASE_URL` → Postgres `DATABASE_URL`
   - Or individually:
     - `DATABASE_HOST` → Postgres `PGHOST`
     - `DATABASE_PORT` → Postgres `PGPORT`
     - `DATABASE_NAME` → Postgres `PGDATABASE`
     - `DATABASE_USER` → Postgres `PGUSER`
     - `DATABASE_PASSWORD` → Postgres `PGPASSWORD`

### 4. Update Backend Environment Variables

In your **Canton-Ginie** (backend) service:
1. Go to **Variables** tab
2. Update `CANTON_SANDBOX_URL`:
   ```
   CANTON_SANDBOX_URL=http://canton-sandbox.railway.internal:7575
   ```
   (Replace `canton-sandbox` with your actual Canton service name)

3. Update `REDIS_URL` to point to your Redis service:
   ```
   REDIS_URL=redis://redis.railway.internal:6379
   ```

### 5. Deploy

Railway will automatically deploy Canton. Monitor the logs to ensure:
- PostgreSQL connection succeeds
- Canton participant and domain start successfully
- Ports 7575 and 7576 are listening

## Testing Canton Connection

Once deployed, test from your backend:

```bash
# From your local machine, test the Railway backend
curl https://canton-ginie-production.up.railway.app/api/v1/system/status
```

Should show `"canton_connected": true`

## Environment Variables

Canton service uses these variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/db` |
| `DATABASE_HOST` | PostgreSQL host | `postgres.railway.internal` |
| `DATABASE_PORT` | PostgreSQL port | `5432` |
| `DATABASE_NAME` | Database name | `railway` |
| `DATABASE_USER` | Database user | `postgres` |
| `DATABASE_PASSWORD` | Database password | `***` |

## Troubleshooting

### Canton won't start
- Check PostgreSQL is accessible
- Verify environment variables are set correctly
- Check logs for Java errors

### Backend can't connect to Canton
- Verify `CANTON_SANDBOX_URL` uses Railway internal networking
- Format: `http://<service-name>.railway.internal:7575`
- Check both services are in the same Railway project

### Port conflicts
- Ensure no other service is using ports 7575-7578
- Railway handles port mapping automatically

## Production Considerations

For production deployment:
1. Enable TLS in `canton-railway.conf`
2. Use separate PostgreSQL database for Canton
3. Configure proper resource limits
4. Set up monitoring and alerting
5. Enable Canton's authentication
