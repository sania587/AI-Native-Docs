Architecture notes

- Backend: Express API for local development with SQLite fallback, plus Vercel-compatible serverless API functions in `api/`.
- Persistence: Local SQLite file used for quick setup; Vercel Postgres is the preferred production datastore for deployed backend.
- Frontend: React + Quill for structured rich-text editing and a cohesive document editing experience.
- Sharing: `shares` table maps `doc_id` to `user_id`; document owners can grant `view` or `edit` access to seeded users.
- Deployment: Dockerfile for local/container deployment, GitHub Actions CI, and Vercel-ready backend/routes.

Priorities:
- Deliver a usable rich-text editing product with document creation, save, reopen, sharing, and upload import.
- Keep the backend simple while enforcing access control and permissions server-side.
- Support both quick local setup (SQLite) and a deployable production backend (Vercel Postgres).
- Ensure `.md` and `.txt` uploads are handled clearly and safely.

Tradeoffs:
- No real-time collaboration; the focus is single-user editing plus basic sharing flows.
- Authentication is mocked with a user dropdown rather than a full login system.
- For speed, the original preferred architecture would have been a dedicated backend service with a single database and direct Express/API hosting. Due to time limitations, the project opted for Vercel deployment compatibility with a Postgres-backed serverless API and a local SQLite fallback.

Notes on deployment:
- Local development: `server.js` runs the Express backend and serves the React app.
- Vercel deployment: `vercel.json` routes `/api/*` to serverless functions and serves the built frontend, with Postgres as the production persistence layer.
