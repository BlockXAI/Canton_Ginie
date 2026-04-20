# Railway Environment Variables Setup

## Canton Sandbox Service Variables

### Required Variables

#### 1. Database Connection (Choose ONE method)

**Method A: Single DATABASE_URL (Recommended)**
```
DATABASE_URL
```
- **Source**: Reference from Postgres service
- **How to add**: 
  1. Go to Canton_Sandbox service → Variables
  2. Click "+ New Variable" → "Add Reference"
  3. Select "Postgres" service
  4. Select "DATABASE_URL" variable
- **Example value**: `postgres://postgres:password@postgres.railway.internal:5432/railway`

**Method B: Individual Variables (Alternative)**
```
DATABASE_HOST
DATABASE_PORT
DATABASE_NAME
DATABASE_USER
DATABASE_PASSWORD
```
- **Source**: Reference from Postgres service
- **Mapping**:
  - `DATABASE_HOST` → Postgres `PGHOST`
  - `DATABASE_PORT` → Postgres `PGPORT`
  - `DATABASE_NAME` → Postgres `PGDATABASE`
  - `DATABASE_USER` → Postgres `PGUSER`
  - `DATABASE_PASSWORD` → Postgres `PGPASSWORD`

### Optional Variables

None required for basic deployment.

---

## Backend (Canton-Ginie) Service Variables

### Required Variables

#### 1. Canton Connection
```
CANTON_SANDBOX_URL=http://canton-sandbox.railway.internal:7575
```
- **Important**: Use Railway's internal networking (`.railway.internal`)
- **Replace** `canton-sandbox` with your actual Canton service name
- **Port**: Always `7575` (Canton Ledger API)

#### 2. Redis Connection
```
REDIS_URL
```
- **Source**: Reference from Redis service
- **How to add**:
  1. Go to Canton-Ginie service → Variables
  2. Click "+ New Variable" → "Add Reference"
  3. Select "Redis" service
  4. Select "REDIS_URL" variable
- **Example value**: `redis://default:password@redis.railway.internal:6379`

#### 3. Database Connection
```
DATABASE_URL
```
- **Source**: Reference from Postgres service
- **Already set** (you should have this from initial deployment)

#### 4. RAG Initialization
```
SKIP_RAG_INIT=true
```
- **Purpose**: Skip RAG initialization on startup for faster healthcheck
- **Value**: `true` (already set)

#### 5. OpenAI API Key
```
OPENAI_API_KEY=sk-...
```
- **Source**: Manual entry
- **Get from**: https://platform.openai.com/api-keys
- **Required for**: LLM-based contract generation

### Optional Variables

#### 6. CORS Origins
```
CORS_ORIGINS=http://localhost:3000,https://your-frontend.vercel.app
```
- **Purpose**: Allow frontend to access API
- **Default**: `http://localhost:3000`
- **Update**: Add your production frontend URL

#### 7. JWT Secret
```
JWT_SECRET=your-random-secret-here
```
- **Purpose**: Secure authentication tokens
- **Generate**: `openssl rand -hex 32`
- **Note**: Auto-generated for sandbox, but set for production

#### 8. Canton Environment
```
CANTON_ENVIRONMENT=sandbox
```
- **Default**: `sandbox`
- **Options**: `sandbox`, `devnet`, `mainnet`

---

## Complete Setup Checklist

### Step 1: Canton_Sandbox Service

- [ ] Add `DATABASE_URL` reference from Postgres
- [ ] Verify service is named correctly (e.g., `Canton_Sandbox`)
- [ ] Deploy and check logs for "Canton daemon starting..."

### Step 2: Canton-Ginie (Backend) Service

- [ ] Update `CANTON_SANDBOX_URL` to match Canton service name
- [ ] Add `REDIS_URL` reference from Redis
- [ ] Verify `DATABASE_URL` is still set
- [ ] Verify `SKIP_RAG_INIT=true` is set
- [ ] Add `OPENAI_API_KEY` (your actual key)
- [ ] Update `CORS_ORIGINS` if deploying frontend
- [ ] Redeploy service

### Step 3: Verification

- [ ] Check Canton logs: "Participant participant1 is running"
- [ ] Check backend logs: "Canton connected"
- [ ] Test: `curl https://canton-ginie-production.up.railway.app/api/v1/system/status`
- [ ] Should show: `"canton_connected": true`

---

## Variable Reference Table

| Service | Variable | Type | Value/Source |
|---------|----------|------|--------------|
| **Canton_Sandbox** | `DATABASE_URL` | Reference | Postgres → `DATABASE_URL` |
| **Canton-Ginie** | `CANTON_SANDBOX_URL` | Manual | `http://canton-sandbox.railway.internal:7575` |
| **Canton-Ginie** | `REDIS_URL` | Reference | Redis → `REDIS_URL` |
| **Canton-Ginie** | `DATABASE_URL` | Reference | Postgres → `DATABASE_URL` |
| **Canton-Ginie** | `SKIP_RAG_INIT` | Manual | `true` |
| **Canton-Ginie** | `OPENAI_API_KEY` | Manual | `sk-...` |
| **Canton-Ginie** | `CORS_ORIGINS` | Manual | `http://localhost:3000` |

---

## How to Find Your Canton Service Name

1. Go to Railway dashboard
2. Look at your Canton service card
3. The name is shown at the top (e.g., "Canton_Sandbox")
4. Convert to lowercase with hyphens for internal URL:
   - `Canton_Sandbox` → `canton-sandbox`
   - `Canton Sandbox` → `canton-sandbox`
   - `CantonSandbox` → `cantonsandbox`

Then use: `http://[service-name].railway.internal:7575`

---

## Troubleshooting Variables

### Canton can't connect to database
**Check**: `DATABASE_URL` is set in Canton_Sandbox service
**Fix**: Add reference from Postgres service

### Backend can't connect to Canton
**Check**: `CANTON_SANDBOX_URL` format
**Fix**: Use `.railway.internal` domain, not localhost or public URL

### Backend can't connect to Redis
**Check**: `REDIS_URL` is set in Canton-Ginie service
**Fix**: Add reference from Redis service

### Contract generation fails
**Check**: `OPENAI_API_KEY` is set and valid
**Fix**: Get new key from OpenAI dashboard

### CORS errors in frontend
**Check**: `CORS_ORIGINS` includes your frontend URL
**Fix**: Add frontend URL to comma-separated list

---

## Security Best Practices

1. **Never commit secrets to Git**
   - Use Railway's environment variables
   - Don't hardcode API keys

2. **Use strong JWT secret in production**
   - Generate: `openssl rand -hex 32`
   - Set `JWT_SECRET` variable

3. **Restrict CORS origins**
   - Only allow your actual frontend domains
   - Don't use `*` wildcard

4. **Rotate API keys regularly**
   - Update `OPENAI_API_KEY` periodically
   - Monitor usage in OpenAI dashboard

---

## Next Steps After Variables Are Set

1. **Test the full pipeline**:
   ```bash
   curl -X POST https://canton-ginie-production.up.railway.app/api/v1/generate \
     -H "Content-Type: application/json" \
     -d '{
       "description": "Create a simple asset transfer contract",
       "user_id": "test-user"
     }'
   ```

2. **Monitor logs**:
   - Canton: Should show participant and domain running
   - Backend: Should show Canton connected, Redis connected

3. **Deploy frontend**:
   - Update `CORS_ORIGINS` with frontend URL
   - Test end-to-end flow
