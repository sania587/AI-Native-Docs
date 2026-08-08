# Submission Notes

## Included
- React + Quill frontend with document creation, editing, rich text formatting, file import, and sharing.
- Backend API with server-side access control and persistence to a local SQLite fallback.
- Vercel-compatible backend API functions with optional Vercel Postgres deployment.
- Dockerfile and GitHub Actions CI workflow.
- Improved validation and error handling for uploads, saves, and sharing.
- Automated API tests covering mock auth, access control, and invalid uploads.

## Working now
- Create and edit documents using a richer editor.
- Switch users via the dropdown and see owned/shared doc lists.
- Import `.txt` and `.md` content into new documents.
- Share documents between seeded users.
- Build the frontend and serve it from the Express backend.

## Remaining gaps
- No real-time multi-user collaboration.
- Authentication is mocked for simplicity.
- Live public deployment is not yet included, but the backend is now Vercel-compatible and can run on Vercel Postgres.

## Next 2-4 hours
- Add a production-grade database provider and full login flow.
- Flesh out copy and UI states for shared documents and permissions.
- Add additional front-end tests for editor persistence and user switching.
