# ai-qms

AI-assisted queue management platform for service-oriented organizations — hospitals, banks, universities, and government offices. Real-time queue tracking, ML-based wait-time prediction, and a WhatsApp channel for customer notifications.


## Quick start

Requires Docker + Docker Compose. Brings up Postgres, the FastAPI backend, and the Next.js frontend.

```bash
cp .env.example content to a new .env file (for now, since there is no production level secrets right now)   # optional — sensible defaults are built into docker-compose.yml
docker compose up --build
```

- Backend health check: http://localhost:8000/health
- Frontend landing page: http://localhost:3000

Local ports: Postgres `5432`, backend `8000`, frontend `3000`.

While testing frontend, try to use two (or three) browsers to test staff, admin, and token workflows (for realtime updates). 
