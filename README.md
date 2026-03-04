# DropModel

**Drop your data. Get an AI chatbot. Embed it anywhere.**

DropModel is a SaaS platform that lets users upload documents (PDF, TXT, CSV, Markdown), automatically chunks and embeds them into a vector database, and provides a RAG-powered chatbot that can be embedded on any website with a single `<script>` tag.

---

## Features

- **Drag-and-drop file upload** — PDF, TXT, CSV, Markdown support with automatic text extraction
- **URL import** — Scrape and ingest web pages alongside file uploads
- **RAG pipeline** — Automatic chunking → OpenAI embedding → Pinecone vector storage → contextual retrieval
- **Embeddable chat widget** — Copy a `<script>` tag and add an AI chatbot to any site
- **Project dashboard** — Manage multiple chatbot projects with chat preview, data sources, settings, analytics, and deploy tabs
- **Usage analytics** — Track query counts, token usage, average latency, and daily trends with interactive charts
- **Customization** — Configure system prompt, temperature, model, chatbot color, welcome message, and logo
- **Stripe billing** — Free / Pro / Team plans with metered query limits and self-service upgrade/portal
- **Auth** — Google OAuth via NextAuth v5 with JWT sessions
- **Rate limiting** — In-memory sliding-window rate limiter on public API routes (60 req/min per API key)
- **Daily query reset** — Query counts automatically reset at the start of each new day

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org) (App Router) |
| Language | TypeScript (strict) |
| UI | React 19, Tailwind CSS v4, [Lucide Icons](https://lucide.dev), [Recharts](https://recharts.org) |
| Auth | [NextAuth v5](https://authjs.dev) (beta) — Google OAuth, JWT strategy |
| Database | PostgreSQL via [Prisma 7](https://www.prisma.io) (PrismaPg adapter) |
| Vector DB | [Pinecone](https://www.pinecone.io) |
| AI | [OpenAI](https://platform.openai.com) (text-embedding-3-small, gpt-4o-mini) |
| File Storage | AWS S3 |
| Payments | [Stripe](https://stripe.com) (Checkout, Customer Portal, Webhooks) |
| Rate Limiting | Custom in-memory sliding-window middleware |

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── login/page.tsx              # Login page
│   ├── layout.tsx                  # Root layout (AuthProvider, ToastProvider)
│   ├── not-found.tsx               # Global 404
│   ├── dashboard/
│   │   ├── page.tsx                # Project list
│   │   ├── layout.tsx              # Dashboard shell (navbar, Suspense)
│   │   ├── loading.tsx             # Skeleton loader
│   │   ├── error.tsx               # Error boundary
│   │   ├── new/page.tsx            # New project (upload flow)
│   │   └── [projectId]/
│   │       ├── page.tsx            # Project detail (tabs)
│   │       ├── loading.tsx         # Skeleton loader
│   │       └── error.tsx           # Error boundary
│   ├── api/
│   │   ├── auth/[...nextauth]/     # NextAuth route handler
│   │   ├── projects/               # CRUD for projects
│   │   ├── datasources/            # List data sources
│   │   ├── ingest/                 # File upload + S3 + chunking + embedding
│   │   ├── chat/                   # Dashboard chat (session auth)
│   │   ├── v1/chat/                # Public chat API (API key auth, streaming)
│   │   └── stripe/                 # Checkout + portal + webhook
│   └── embed/
│       └── [projectId]/widget.js/  # Embeddable chat widget script
├── components/
│   ├── project-chat.tsx            # Chat tab component
│   ├── project-data.tsx            # Data sources tab
│   ├── project-settings.tsx        # Settings tab
│   ├── project-deploy.tsx          # Deploy tab (embed code, API key)
│   ├── project-analytics.tsx       # Analytics tab (charts)
│   ├── upgrade-modal.tsx           # Plan upgrade modal
│   └── toast.tsx                   # Toast notification system
├── lib/
│   ├── auth.ts                     # NextAuth configuration
│   ├── db.ts                       # Prisma client singleton
│   ├── openai.ts                   # OpenAI client
│   ├── pinecone.ts                 # Pinecone client + index helper
│   └── s3.ts                       # S3 client + upload helper
├── middleware.ts                   # Auth protection + rate limiting
└── generated/prisma/               # Prisma generated client
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Accounts / API keys for: **OpenAI**, **Pinecone**, **AWS S3**, **Google Cloud** (OAuth), **Stripe**

### 1. Clone and install

```bash
git clone <repo-url> dropmodel
cd dropmodel
npm install
```

### 2. Environment variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env.local
```

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Random secret for NextAuth JWT signing (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | App URL, e.g. `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `OPENAI_API_KEY` | OpenAI API key |
| `PINECONE_API_KEY` | Pinecone API key |
| `PINECONE_INDEX` | Pinecone index name (e.g. `dropmodel`) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRO_PRICE_ID` | Stripe Price ID for Pro plan |
| `STRIPE_TEAM_PRICE_ID` | Stripe Price ID for Team plan |
| `S3_BUCKET` | S3 bucket name |
| `S3_REGION` | S3 region (e.g. `us-east-1`) |
| `S3_ACCESS_KEY` | AWS access key ID |
| `S3_SECRET_KEY` | AWS secret access key |

### 3. Set up the database

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 4. Set up Pinecone

Create a Pinecone index with the following settings:

- **Index name**: must match your `PINECONE_INDEX` env var
- **Dimensions**: `1536` (matches OpenAI `text-embedding-3-small`)
- **Metric**: `cosine`

### 5. Set up Stripe

1. Create two Products in the Stripe Dashboard (Pro and Team)
2. Add a recurring Price to each product
3. Copy the Price IDs into `STRIPE_PRO_PRICE_ID` and `STRIPE_TEAM_PRICE_ID`
4. Set up a webhook endpoint pointing to `https://your-domain/api/stripe/webhook` listening for `checkout.session.completed` events

### 6. Set up Google OAuth

1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (Web application)
3. Add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI
4. Copy the Client ID and Client Secret into your env file

### 7. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npx prisma studio` | Open Prisma Studio (database GUI) |
| `npx prisma migrate dev` | Run database migrations |
| `npx prisma generate` | Regenerate Prisma client |

---

## API Reference

### Dashboard API (session auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List user's projects |
| POST | `/api/projects` | Create a new project |
| GET | `/api/projects/[id]` | Get project details |
| PATCH | `/api/projects/[id]` | Update project settings |
| GET | `/api/projects/[id]/analytics` | Get project analytics |
| GET | `/api/datasources?projectId=` | List data sources |
| POST | `/api/ingest` | Upload and ingest a file |
| POST | `/api/chat` | Send a chat message |

### Public API (API key auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/chat` | Send a chat message (streaming response) |

**Authentication**: Pass your project API key as a Bearer token:

```bash
curl -X POST https://your-domain/api/v1/chat \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is this document about?"}'
```

**Rate limit**: 60 requests per minute per API key.

---

## Embedding the Widget

Add this script tag to any HTML page:

```html
<script
  src="https://your-domain/embed/YOUR_PROJECT_ID/widget.js"
  data-project-id="YOUR_PROJECT_ID"
  defer
></script>
```

A floating chat button will appear in the bottom-right corner.

---

## Plans & Limits

| Feature | Free | Pro | Team |
|---------|------|-----|------|
| Projects | 3 | 25 | 100 |
| Queries / day | 50 | 1,000 | 10,000 |
| File size | 5 MB | 25 MB | 100 MB |
| Data sources / project | 5 | 50 | 200 |

---

## License

Private — All rights reserved.
