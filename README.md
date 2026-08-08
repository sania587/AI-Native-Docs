# AI-Native Docs

Lightweight collaborative document editor built for the assignment.

## Setup

Requires Node 18+. From the project root:

```bash
npm install
npm run build
npm start
```

Then open http://localhost:3000.

For development with hot reload:

```bash
npm install
npm run dev
```

This starts the Express backend on port `3000` and the React/Vite frontend on port `5173`.

## Supported file types

- `.txt` and `.md` are supported for import into a new document.
- Unsupported file types return a clear on-screen error.

## Seeded users

- Alice (id 1)
- Bob (id 2)
- Carol (id 3)

## Quick flow

1. Select a user from the top-left dropdown.
2. Create or open a document.
3. Use the toolbar for bold/italic/underline/headings/lists.
4. Upload a `.txt` or `.md` file to create a new imported document.
5. Share a document with another seeded user.

## Docker

Build and run:

```bash
docker build -t ai-native-docs .
docker run -p 3000:3000 ai-native-docs
```

For local compose:

```bash
docker-compose up --build
```

## CI / Deployment

This repository includes a GitHub Actions workflow at `.github/workflows/ci.yml` that runs `npm ci`, builds the frontend, and runs tests.

The backend is now also deployable on Vercel using serverless API functions in the `api/` folder. The app is designed to use Vercel Postgres in production and a local SQLite fallback during development.

### Vercel deployment
- The `vercel.json` file routes `/api/*` to Vercel Node serverless functions and serves the built frontend.
- Make sure a Vercel Postgres database is configured and the `VERCEL_POSTGRES_URL` environment variable is set.
- If you prefer local Postgres, set `DATABASE_URL` instead.

To deploy from the repository root:

```bash
npm install
npm run build
vercel --prod
```

Then configure environment variables in Vercel:
- `VERCEL_POSTGRES_URL`
- optionally `DATABASE_URL` for local compatibility

### Environment variables
Use `.env.example` as a template. For local development, `DATABASE_URL` can point to a local Postgres instance, and the app will still work with SQLite if missing.

## Architecture
See ARCHITECTURE.md
