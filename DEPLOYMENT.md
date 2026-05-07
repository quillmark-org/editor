# Deployment Quick Reference

**For comprehensive deployment documentation, see [`deployment/README.md`](./deployment/README.md)**

---

## Quick Start

### Standard Self-Hosted

```bash
cd deployment
docker-compose up --build
```

[→ Full Guide](./deployment/standard/README.md)

---

### USAF OIDC Deployment

```bash
cd deployment/dod
docker-compose up --build
```

[→ Full Guide](./deployment/dod/README.md)

---

## Quick Commands

**Standard**:

```bash
cd deployment && docker-compose up -d      # Start
cd deployment && docker-compose logs -f    # Logs
cd deployment && docker-compose down       # Stop
```

**USAF**:

```bash
cd deployment/dod && docker-compose up -d      # Start
cd deployment/dod && docker-compose logs -f    # Logs
cd deployment/dod && docker-compose down       # Stop
```

---

## Before Production

- [ ] Create `deployment/dod/.env.dod` from `env.dod.example`
- [ ] Generate `AUTH_SECRET` (`openssl rand -base64 32`)
- [ ] Configure `ORIGIN` to match your domain
- [ ] Add USAF OIDC credentials
- [ ] Set up HTTPS with valid SSL certificate
- [ ] Test USAF OIDC authentication flow

---

**📚 See [`deployment/README.md`](./deployment/README.md) for detailed guides, architecture comparison, and troubleshooting.**
