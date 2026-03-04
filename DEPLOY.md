# DropModel — Vercel Deployment Guide

## Prerequisites

- GitHub account
- [Vercel](https://vercel.com) account (free tier works, Pro recommended for 60s function timeout)
- [Supabase](https://supabase.com) project (free tier)
- [Pinecone](https://www.pinecone.io) account (free tier)
- [OpenAI](https://platform.openai.com) API key
- [Stripe](https://stripe.com) account (test mode to start)
- [Google Cloud Console](https://console.cloud.google.com) project for OAuth

---

## Step 1: Push Code to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USER/dropmodel.git
git push -u origin main
```

---

## Step 2: Set Up Supabase

### Database
1. Create a new Supabase project at https://supabase.com/dashboard
2. Go to **Settings → Database → Connection string → URI**
3. Copy the connection string — this is your `DATABASE_URL`
4. For serverless (Vercel), use the **connection pooler** URL (port 6543) and append `?pgbouncer=true&connection_limit=1`

   Example:
   ```
   postgresql://postgres.xxxx:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
   ```

### Storage
1. In Supabase dashboard, go to **Storage**
2. Click **New bucket**, name it `datasources`
3. Set access to **Private** (files are accessed server-side only)
4. Note your project URL and service role key:
   - `SUPABASE_URL` → Settings → API → Project URL (e.g., `https://xxxx.supabase.co`)
   - `SUPABASE_SERVICE_KEY` → Settings → API → `service_role` key (the secret one, not `anon`)

---

## Step 3: Set Up Pinecone

1. Create a Pinecone account at https://www.pinecone.io
2. Create a new index:
   - **Name**: `dropmodel` (or whatever you prefer)
   - **Dimensions**: `1536`
   - **Metric**: `cosine`
   - **Cloud/Region**: Choose the closest to your Vercel region
3. Note your API key from the Pinecone dashboard

---

## Step 4: Set Up OpenAI

1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Make sure you have credits / billing set up
4. Models used: `text-embedding-3-small` (embeddings), `gpt-4o-mini` (chat)

---

## Step 5: Set Up Google OAuth

1. Go to https://console.cloud.google.com
2. Create a new project (or use existing)
3. Go to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Add to **Authorized JavaScript origins**:
   - `https://your-app.vercel.app`
   - `http://localhost:3000` (for local dev)
7. Add to **Authorized redirect URIs**:
   - `https://your-app.vercel.app/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` (for local dev)
8. Copy the Client ID and Client Secret

---

## Step 6: Set Up Stripe

### Products & Prices
1. Go to https://dashboard.stripe.com/products
2. Create two products:
   - **Pro** — $29/month recurring
   - **Team** — $99/month recurring
3. Copy the **Price ID** for each (starts with `price_`)

### Webhook
1. Go to https://dashboard.stripe.com/webhooks
2. Click **Add endpoint**
3. URL: `https://your-app.vercel.app/api/stripe/webhook`
4. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copy the **Webhook signing secret** (starts with `whsec_`)

---

## Step 7: Connect to Vercel & Add Environment Variables

1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Framework: **Next.js** (auto-detected)
4. Add all environment variables in the Vercel dashboard:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://...?pgbouncer=true&connection_limit=1` | Supabase connection pooler URL |
| `AUTH_SECRET` | *(generate with `openssl rand -base64 32`)* | NextAuth session encryption |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` | Your Vercel deployment URL |
| `GOOGLE_CLIENT_ID` | `xxxx.apps.googleusercontent.com` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxxx` | From Google Cloud Console |
| `OPENAI_API_KEY` | `sk-xxxx` | From OpenAI dashboard |
| `PINECONE_API_KEY` | `pcsk_xxxx` | From Pinecone dashboard |
| `PINECONE_INDEX` | `dropmodel` | The index name you created |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | `eyJhbGci...` | Supabase `service_role` key |
| `STRIPE_SECRET_KEY` | `sk_live_xxxx` or `sk_test_xxxx` | From Stripe dashboard |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_xxxx` or `pk_test_xxxx` | From Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | `whsec_xxxx` | From Stripe webhook settings |
| `STRIPE_PRO_PRICE_ID` | `price_xxxx` | Pro plan price ID |
| `STRIPE_TEAM_PRICE_ID` | `price_xxxx` | Team plan price ID |

---

## Step 8: Deploy

1. Click **Deploy** in Vercel
2. Wait for the build to complete
3. Once deployed, run Prisma migrations against your production database:

```bash
DATABASE_URL="your-supabase-direct-connection-string" npx prisma db push
```

> **Important**: Use the **direct connection string** (port 5432, NOT the pooler)
> for `prisma db push`. The pooler URL is only for runtime queries.

---

## Step 9: Post-Deploy Checklist

- [ ] Visit `https://your-app.vercel.app` — landing page loads
- [ ] Click "Login" → Google OAuth works and redirects back
- [ ] Create a project → upload a file → ingestion completes
- [ ] Chat with the project → AI responds with context from your docs
- [ ] Test the embed widget → script loads, chat works cross-origin
- [ ] Test Stripe checkout (use test mode first)
- [ ] Stripe webhook receives events (check Stripe dashboard → Webhooks → Recent events)

---

## Important Notes

### Serverless Function Timeouts
- **Vercel Hobby (free)**: 10-second function timeout. Small files (~1MB) work fine. Larger files will timeout during ingestion.
- **Vercel Pro ($20/mo)**: 60-second function timeout. Files up to ~5MB process reliably. The `maxDuration = 60` is set on ingest routes.
- For very large files (>5MB), consider upgrading to Vercel Pro or processing files asynchronously with a queue (future enhancement).

### File Storage
- Files are stored in **Supabase Storage** (the `datasources` bucket), not on disk.
- The Vercel filesystem is ephemeral — files written to disk are lost between invocations.

### Database Connection Pooling
- Always use the Supabase **connection pooler** URL (port 6543) with `?pgbouncer=true&connection_limit=1` for your `DATABASE_URL` on Vercel.
- Use the **direct connection** (port 5432) only for migrations (`prisma db push`).

### Custom Domain
1. In Vercel, go to **Settings → Domains**
2. Add your domain and follow DNS instructions
3. Update `NEXTAUTH_URL` to your custom domain
4. Update Google OAuth authorized origins/redirects
5. Update Stripe webhook URL
