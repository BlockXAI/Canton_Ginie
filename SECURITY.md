# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately:

- **Email**: security@blockxai.org
- **Do not** open a public GitHub issue for security vulnerabilities.

We will acknowledge receipt within 48 hours and provide a timeline for a fix.

## Supported Versions

| Version | Supported |
|---------|-----------|
| main    | Yes       |

## Security Considerations

- **API keys**: Never commit API keys. Use `backend/.env.ginie` (gitignored). See `.env.ginie.example` for the template.
- **JWT secrets**: Auto-generated in sandbox mode. A strong unique `JWT_SECRET` is required for devnet/mainnet.
- **Canton tokens**: Static tokens and OAuth2 credentials must be set via environment variables, never hardcoded.
- **CORS**: Restricted to localhost in development. Tighten `CORS_ORIGINS` for production deployments.
- **Subprocess execution**: Daml SDK compilation runs in sandboxed job directories with UUID-based paths.
