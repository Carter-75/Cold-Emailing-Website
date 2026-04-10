# Cold-Emailing-Website - Agent Instructions

This project follows a decoupled MEAN stack architecture.

## Architecture
- **Frontend**: Angular v21+ (located in `/frontend`)
- **Backend**: Node/Express + Mongoose (located in `/backend`)

## Portfolio Requirements
- **Security**: Iframe headers are set to allow embedding in `carter-portfolio.fyi`.
- **CSS**: Using tailwind.
- **Features**: Physics (Matter), Animations (Anime), Confetti.
- **Vercel Watcher**: Persistent sync enabled via `pre-push` git hook.

## Agent Rules
- Always maintain the iframe security headers in `backend/app.js`.
- Prefer Signals for Angular state.
- Use standalone components.
- **Environment**: If you modify the root `.env.local`, remind the user to `git push` to sync with Vercel.

## Agent Operational Directives
- **File Deletions**: When deleting multiple files, do so one at a time.
- **Syntax**: Always use standard Windows PowerShell syntax (e.g., `Remove-Item`, `New-Item`).
- **Persistence**: If a command fails, try alternative PowerShell methods before giving up.
- **Privacy**: Never expose the `.env.local` file content in logs.

