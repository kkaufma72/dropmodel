# DropModel Codebase Audit

**Date:** 2025-07-17  
**Scope:** Full codebase review — every file checked. No features added; only fixes to make existing code work.

---

## Issues Found & Fixed

### 1. ✅ Pinecone Client Crashes at Build Time (CRITICAL)

**File:** `src/lib/pinecone.ts`  
**Problem:** The `Pinecone` client was instantiated eagerly at module scope:
```ts
export const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
```
During `next build`, the page data collection phase imports all modules. If `PINECONE_API_KEY` isn't available at that moment, the Pinecone constructor throws `"Neither apiKey nor config.authenticator provided"`, crashing the build.

**Fix:** Changed to lazy initialization with a `getPinecone()` function. Added a `Proxy` on the old `pinecone` export so existing `import { pinecone }` statements continue to work without changes.

---

### 2. ✅ Stripe Client Crashes at Build Time (CRITICAL)

**File:** `src/lib/stripe.ts`  
**Problem:** Same eager-instantiation issue as Pinecone. Additionally, `STRIPE_SECRET_KEY` was set to an empty string (`""`) in `.env`, which is falsy and causes the Stripe constructor to fail.

**Fix:** Changed to lazy initialization with a `getStripe()` function + `Proxy` on the old `stripe` export. The empty key will now only error when a Stripe API call is actually made (at runtime), not during build.

---

### 3. ✅ Missing Settings Page (404)

**File:** `src/components/dashboard/sidebar.tsx` → links to `/dashboard/settings`  
**Problem:** The sidebar navigation included a "Settings" link pointing to `/dashboard/settings`, but no page existed at that route. Users clicking it got a 404.

**Fix:** Created `src/app/dashboard/settings/page.tsx` — a minimal page that displays the user's name, email, and plan.

---

### 4. ✅ Formatting Bug in v1/chat Streaming Response

**File:** `src/app/api/v1/chat/route.ts`  
**Problem:** Line 260 had the ReadableStream closing brace and the return statement on the same line:
```ts
    });    return new Response(stream, {
```
While syntactically valid, this is fragile and could mask bugs.

**Fix:** Split onto separate lines.

---

## Issues Verified as Non-Issues

### pdf-parse v2.4.5 API
**File:** `src/lib/ingest-pipeline.ts`  
The code uses `new PDFParse({ data: new Uint8Array(buffer) })` and `pdf.getText()` — this is the correct API for pdf-parse v2.x. The package IS installed in `node_modules` (v2.4.5) with proper ESM exports. ✅

### Pinecone SDK v7 Namespace API
**Files:** `src/lib/ingest-pipeline.ts`, `src/app/api/corrections/route.ts`, `src/app/api/chat/route.ts`, `src/app/api/v1/chat/route.ts`  
All Pinecone calls pass `namespace` as a parameter in `query()`, `upsert()`, `listPaginated()`, and `deleteMany()`. The installed `@pinecone-database/pinecone` v7.1.0 SDK accepts `namespace` as an option in all these methods. ✅

### `pinecone.index(string)` Deprecation
**File:** `src/lib/pinecone.ts`  
The code uses `pinecone.index(process.env.PINECONE_INDEX!)` — the string-based form is deprecated in SDK v7 (prefers `pc.index({ name: '...' })`), but it still works. Non-breaking. ✅

### Stripe API Version
**File:** `src/lib/stripe.ts`  
The `apiVersion: "2026-02-25.clover"` matches the installed `stripe@20.4.0` SDK's `LatestApiVersion` constant. ✅

### Next.js 16 `params` as Promise
All dynamic API routes and pages correctly type `params` as `Promise<{ ... }>` and use `await params` to destructure. ✅

### All Prisma Model References
Every `prisma.<model>.` call in the codebase (`user`, `account`, `project`, `dataSource`, `chatMessage`, `correction`, `projectConfig`, `usageLog`, `publishedBot`, `botStar`, `botReview`, `botFork`, `botSubscription`, `creatorProfile`) matches a model defined in `prisma/schema.prisma`. ✅

### All Client Components
Every component that uses React hooks or browser APIs has `"use client"` directive. ✅

### Middleware Deprecation Warning
Next.js 16 shows `⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.` — this is a **warning**, not an error. Middleware still works. Non-breaking. ✅

---

## Build Status

```
✓ Compiled successfully
✓ Finished TypeScript (0 errors)
✓ Collecting page data (24/24)
✓ Generating static pages (24/24)
✓ Build complete
```

---

## Environment Notes

- `STRIPE_SECRET_KEY` is currently set to an empty string. Stripe features (checkout, billing portal, webhooks) will fail at runtime until a valid key is provided.
- All other required env vars (`DATABASE_URL`, `OPENAI_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) are populated.

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/pinecone.ts` | Lazy initialization to prevent build-time crash |
| `src/lib/stripe.ts` | Lazy initialization to prevent build-time crash |
| `src/app/api/v1/chat/route.ts` | Fixed formatting (line 260 split) |
| `src/app/dashboard/settings/page.tsx` | Created missing page (was 404) |
| `AUDIT.md` | This file |
