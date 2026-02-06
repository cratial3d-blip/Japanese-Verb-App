# GitHub Pages Deploy (Testing)

This project is configured for GitHub Pages via GitHub Actions:

- Workflow file: `.github/workflows/deploy-pages.yml`
- Trigger: push to `main` (or manual run)
- Published content:
  - `index.html`
  - `src/`
  - `data/`
  - `public/`

Notes:

- `temp/` and `mockups/` are not published by this workflow.
- Local app data uses browser storage. Progress is per browser/device.

## One-time repo setup

1. Create/confirm the GitHub repo.
2. Push this project to `main`.
3. In GitHub: `Settings -> Pages`, set Source to `GitHub Actions` (if not already set).
4. After workflow succeeds, open:
   - `https://<your-user>.github.io/<repo>/`

