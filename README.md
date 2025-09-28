# TalentLix

## Environment configuration

The `/security-check` workflow relies on a dedicated runner service that is proxied by the Next.js API routes under `pages/api/security-check/*`. Configure the following environment variable in **all** environments (local development, preview, and production) so the page can communicate with the service:

- `SECURITY_CHECK_API_BASE_URL`: Base URL of the security check runner service (for example, `https://security-check.example.com`). The API routes append `/run`, `/status`, and `/report` to this value when calling the backend.

For local development you can add the variable to `.env.local`. Hosting providers usually expose a way to define environment variables for preview/staging and production deployments—make sure the same name and value is configured accordingly.
