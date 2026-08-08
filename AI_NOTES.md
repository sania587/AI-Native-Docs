AI-Native workflow notes

- Tools used: Github Copilot for scaffolding, code suggestions, and small snippets. Glaude for verification and error handling checks.
- Where AI helped: Initial project structure, endpoint design, and testcases.
- What I changed/rejected: Adjusted server design to use SQLite file-based DB instead of Postgres suggested by AI to keep setup minimal initially. Later added Vercel Postgres deployment support for the production backend while keeping local SQLite fallback for development.
- Verification: Ran local tests and manual UI checks to ensure flows worked. Ensured upload/import parses `.md` and `.txt` correctly, and verified build plus API routes compile cleanly.
