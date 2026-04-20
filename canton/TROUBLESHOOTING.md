# Canton Railway Deployment - Troubleshooting

## Issue: Download Failed (Connection Reset)

**Error Message:**
```
curl: (56) OpenSSL SSL_read: Connection reset by peer, errno 104
```

**Root Cause:**
- Canton release tarball is 223MB
- Railway's build infrastructure sometimes has network interruptions during large downloads
- GitHub's CDN may throttle or reset connections

**Solution Applied:**
✅ Added retry logic with:
- `--retry 5` - Retry up to 5 times on transient errors
- `--retry-delay 3` - Wait 3 seconds between retries
- `--retry-max-time 300` - Maximum 5 minutes for all retries
- `--connect-timeout 30` - 30 second connection timeout
- `--max-time 600` - 10 minute maximum per attempt
- Manual retry loop (3 attempts total)

**Next Steps:**
1. Railway will auto-redeploy with the new Dockerfile
2. Monitor the build logs - you should see "Download attempt 1 of 3..."
3. If download succeeds, you'll see "Canton installation complete"

## Alternative Solutions (If Still Failing)

### Option 1: Use Pre-built Canton Image (Fastest)

Create a custom base image with Canton pre-installed:

```dockerfile
# Build this separately and push to Docker Hub
FROM eclipse-temurin:17-jre-jammy
WORKDIR /canton
RUN apt-get update && apt-get install -y curl postgresql-client && \
    curl -L "https://github.com/digital-asset/canton/releases/download/v2.9.3/canton-open-source-2.9.3.tar.gz" -o canton.tar.gz && \
    tar -xzf canton.tar.gz && mv canton-2.9.3/* . && rm -rf canton.tar.gz
```

Then use: `FROM yourusername/canton-base:2.9.3`

### Option 2: Use Smaller Canton Version

Try Canton 2.8.x which may have a smaller download:

```dockerfile
ARG CANTON_VERSION=2.8.0
```

### Option 3: Download from Mirror

Use a different CDN or mirror if available.

### Option 4: Multi-stage Build with Caching

Split the download into a separate stage:

```dockerfile
FROM eclipse-temurin:17-jre-jammy as downloader
WORKDIR /tmp
RUN curl -L --retry 10 "..." -o canton.tar.gz && tar -xzf canton.tar.gz

FROM eclipse-temurin:17-jre-jammy
COPY --from=downloader /tmp/canton-2.9.3 /canton
```

## Monitoring the Build

1. **Go to Railway Dashboard**:
   - Open your Canton service
   - Click **Deployments** tab
   - Select the latest deployment
   - Click **View Logs**

2. **Look for these indicators**:
   - ✅ `Download attempt 1 of 3...` - Download starting
   - ✅ `Extracting Canton...` - Download succeeded
   - ✅ `Canton installation complete` - Build layer complete
   - ❌ `Download failed, retrying...` - Retry in progress
   - ❌ `Failed to download Canton after 3 attempts` - All retries exhausted

## Common Build Errors

### Error: "tar: Unexpected EOF"
**Cause:** Partial download (file corrupted)
**Solution:** Retry logic will automatically retry

### Error: "curl: (28) Operation timed out"
**Cause:** Network too slow
**Solution:** Increase `--max-time` to 900 (15 minutes)

### Error: "No space left on device"
**Cause:** Railway build container out of space
**Solution:** Clean up in same RUN command (already done)

## Runtime Errors (After Build Succeeds)

### Canton Won't Start

**Check PostgreSQL Connection:**
```bash
# In Railway Canton service logs, look for:
"Waiting for PostgreSQL..."
"PostgreSQL is ready!"
```

**If stuck on "Waiting for PostgreSQL":**
1. Verify `DATABASE_URL` is set in Canton service
2. Check PostgreSQL service is running
3. Verify both services are in same Railway project

### Canton Starts But Backend Can't Connect

**Check Internal Networking:**
```bash
# Backend should use:
CANTON_SANDBOX_URL=http://canton-sandbox.railway.internal:7575

# NOT:
CANTON_SANDBOX_URL=http://localhost:7575
CANTON_SANDBOX_URL=https://canton-sandbox-production.up.railway.app
```

**Verify Service Name:**
- Railway service name must match URL
- Use lowercase with hyphens
- Check in Railway dashboard → Service Settings → Name

## Performance Optimization

### Build Time
- Current: ~2-3 minutes (with successful download)
- With retries: Up to 10 minutes (if network issues)

### Reduce Build Time:
1. Use pre-built base image (Option 1 above)
2. Enable Railway build caching
3. Use smaller Canton version

## Getting Help

If issues persist:

1. **Check Railway Status**: https://status.railway.app/
2. **Railway Discord**: https://discord.gg/railway
3. **Canton Docs**: https://docs.canton.network/
4. **GitHub Issues**: https://github.com/digital-asset/canton/issues

## Success Indicators

After successful deployment, you should see:

```
===================================
Canton Sandbox Starting on Railway
===================================
Waiting for PostgreSQL...
PostgreSQL is ready!
Canton Configuration:
  DB Host: postgres.railway.internal
  DB Port: 5432
  DB Name: railway
  DB User: postgres
Starting Canton daemon...
[INFO] Canton participant1 is running
[INFO] Canton domain local is running
[INFO] Ledger API listening on 0.0.0.0:7575
```

Then verify from backend:
```bash
curl https://canton-ginie-production.up.railway.app/api/v1/system/status
# Should show: "canton_connected": true
```
