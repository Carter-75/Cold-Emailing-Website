# How it Works: Cold Outreach Autonomous System

This system is a high-end, self-optimizing engine designed to autonomously find local businesses that need websites and initiate a personalized sales cycle.

## 1. Architectural Overview
The project follows a **Decoupled MEAN Stack** architecture:
- **Frontend**: Angular 21+ using Signals for reactive state and Standalone components.
- **Backend**: Node.js/Express with MongoDB/Mongoose.
- **Orchestration**: `Agenda.js` for background job scheduling.
- **Real-time**: `Socket.io` for live dashboard updates and "Heartbeat" monitoring.

---

## 2. The Outreach Lifecycle

### Phase A: Discovery & ICP Validation
1. **City Rotation**: The `city-rotator.js` cycles through major US cities to ensure a diverse lead pool.
2. **Lead Discovery**: `lead-gen.service.js` uses **SerpAPI** (Google Maps) to find businesses in the target city.
3. **ICP Validation**: The `validator.service.js` checks the business website. If they have **no website** or it merely redirects to a social media page (Facebook/Instagram), they are marked as a "Valid ICP" (Ideal Customer Profile).

### Phase B: Enrichment & Verification
1. **Email Finding**: `enrichment.service.js` uses **Apollo.io** to retrieve the actual email address of the business owner or decision-maker.
2. **Verification**: `verification.service.js` uses **Verifalia** to confirm the email is deliverable. This protects your email account's reputation and prevents bounces.

### Phase C: Autonomous Sending (The Engine)
1. **Heartbeat Check**: The engine only runs if it detects an **Active Dashboard** (via `socket.service.js`). This ensures you are in control when the system is active.
2. **AI Personalization**: `email.service.js` uses **OpenAI (GPT-4o)** to write a unique, 4-6 sentence pitch. It references the specific business name and the fact that they are currently relying on social media rather than a professional website.
3. **Jitter Delay**: To avoid SPAM filters, the engine waits a random "jitter" time (60-120 seconds) between each send.

### Phase D: Sequencing & Reply Tracking
1. **Multi-Step Sequences**: If there is no reply, `sequence.service.js` (triggered by Agenda) automatically sends follow-ups on **Day 7** and **Day 14**.
2. **Reply Detection (IMAP)**: `imap.service.js` logs into your inbox via **IMAP** to check for incoming replies. If a prospect replies, the system **instantly kills the sequence** for that lead, ensuring you don't send an automated "Day 7" follow-up to someone who already responded.

---

## 3. Self-Optimization (The "Brain")
The `optimizer.service.js` looks at which cities and email variants are getting the most replies. It can autonomously adjust its messaging strategy to favor higher-performing subject lines or value propositions.

## 4. Safety Features
- **Strict Configuration**: The app will not start without a `MONGODB_URI` and critical API keys.
- **Unsubscribe Handling**: Every email includes a 1-click unsubscribe link that instantly adds the recipient to a suppression list.
- **Kill Switch**: If the email service encounters a fatal error (e.g., Gmail password changed), the engine shuts down immediately to prevent damage.

---

## 🚀 Production Deployment Checklist

Before you scale your outreach on Vercel, ensure the following are configured in your Production Environment Variables:

1.  **Absolute URLs**: Set `PROD_BACKEND_URL` and `PROD_FRONTEND_URL` to your Vercel domain (e.g., `https://cold-emailing-website.vercel.app`). This is required for Google OAuth and Unsubscribe links.
2.  **Database**: Point `MONGODB_URI` to your production MongoDB Atlas cluster.
3.  **API Keys**: Ensure `OPENAI_API_KEY`, `SERPAPI_KEY`, `APOLLO_KEY`, and `VERFALIA_KEY` are all present.
4.  **Gmail Security**: Use a **Google App Password** for `config.appPassword` (NOT your standard Gmail password).

> **Wait for the Engine**: The engine has a built-in "Jitter Delay" of 1-2 minutes between emails. If you click Initiate and don't see an email instantly, check the "Autonomous Stream" logs for the countdown.

---

## 📬 Contact & Support
For any questions regarding the outreach engine or technical issues, please contact:
**Email:** [help@carter-portfolio.fyi](mailto:help@carter-portfolio.fyi)
**Website:** [carter-portfolio.fyi](https://carter-portfolio.fyi)
