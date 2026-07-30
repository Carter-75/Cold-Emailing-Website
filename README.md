# Cold-Emailing-Website (Internal Automation Engine)

Carter's internal automation platform. This is **not** a customer-facing product — it's the engine behind Phoenix's autonomous outreach, lead management, and data intelligence pipeline.

> **Live at**: Private Vercel deployment (Carter-only access)  
> **Public portal**: Data intelligence portal lives on [phoenixwebsites.ai/data](https://phoenixwebsites.ai/data) (Phoenix-Business project)

---

## Architecture

```
Cold-Emailing-Website/
├── backend/                      # Node/Express API (Vercel Serverless)
│   ├── models/
│   │   ├── User.js               # User config, API keys, outreach settings
│   │   ├── Lead.js               # Lead pipeline (discovery → emailed → replied)
│   │   ├── SentEmail.js          # Email delivery log
│   │   └── DataRecord.js         # AI-enriched public records (shared w/ Phoenix)
│   ├── services/
│   │   ├── engine.service.js     # Core outreach engine (business-hours pacing)
│   │   ├── discovery.service.js  # SerpApi lead discovery (website clients)
│   │   ├── data-sales-discovery.service.js  # Data buyer discovery (construction, gov, B2B)
│   │   ├── email.service.js      # GPT-4o email generation + Reasons Why to Buy
│   │   ├── sequence.service.js   # 3-step follow-up sequences
│   │   ├── scheduler.service.js  # Cron orchestrator (lease-based MongoDB locks)
│   │   ├── data-pipeline.service.js  # Public data scraping + AI enrichment
│   │   ├── data-analyst.service.js   # GPT-4o structured extraction
│   │   ├── data-sources/         # Building permits + gov contracts scrapers
│   │   ├── lead-gen.service.js   # SerpApi Google Maps search
│   │   ├── enrichment.service.js # Apollo email finder
│   │   ├── verification.service.js   # Verifalia email validation
│   │   ├── validator.service.js  # ICP validation (website check)
│   │   └── city-rotator.js       # Round-robin city targeting
│   └── routes/
│       ├── billing.js            # Stripe outreach subscription (Carter-only)
│       ├── data-enrichment.js    # Data pipeline CRUD, CSV export, manual trigger
│       ├── inbox.js              # Reply detection + AI response drafting
│       ├── outreach.js           # Engine controls (start/stop/config)
│       └── leads.js              # Lead management + cross-app merge
├── frontend/                     # Angular 21 dashboard (Carter-only)
│   └── src/app/
│       ├── components/
│       │   ├── dashboard/        # Main dashboard with tabs
│       │   │   ├── data-intelligence/  # Data pipeline monitoring tab
│       │   │   └── ...           # Outreach, inbox, leads tabs
│       │   └── login/            # Auth
│       └── services/
│           ├── api.service.ts
│           └── data-enrichment.service.ts
└── vercel.json                   # Vercel config (no crons — uses cron-job.org)
```

## Core Systems

### Outreach Engine
- Discovers leads via SerpApi (Google Maps)
- Validates ICP (checks for existing website)
- Enriches with email (Apollo)
- GPT-4o generates personalized cold emails with 1 of 10 "Reasons Why to Buy"
- Sends via SMTP (Zoho) during business hours with natural pacing
- 3-step follow-up sequence (initial → 2-day bump → final)

### Data Intelligence Pipeline
- Scrapes building permits + government contracts (FOIA public data)
- GPT-4o extracts structured data (company, budget, contacts, summary)
- Stores as `DataRecord` in shared MongoDB
- Data buyer discovery finds companies who'd buy the data
- AI emails them with data-specific persona + Reasons Why to Buy

### Scheduling (Vercel Free Tier)
- 0 Vercel cron slots used (both used by Phoenix-Business)
- External triggers via **cron-job.org** hit `/api/cron/maintenance`
- `SchedulerService` uses MongoDB lease-based locking (no duplicate runs)
- Piggybacks data pipeline into maintenance sweep

## Environment Variables

```env
MONGODB_URI=               # Shared cluster with Phoenix-Business
JWT_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=           # Outreach subscription price
OPENAI_API_KEY=            # GPT-4o for email generation
EMAIL_USER=                # SMTP sender
EMAIL_PASS=                # SMTP password
SMTP_HOST=smtppro.zoho.com
SMTP_PORT=465
FRONTEND_URL=              # Dashboard URL
TEST_MODE=false
```

## Development

```bash
# Backend
cd backend && npm install && npm start

# Frontend
cd frontend && npm install && ng serve
```

## Deployment
```bash
vercel --prod
```
Cron triggers configured externally via [cron-job.org](https://cron-job.org).
