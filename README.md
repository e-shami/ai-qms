# ai-qms

AI-assisted queue management platform for service-oriented organizations — hospitals, banks, universities, and government offices. Real-time queue tracking, ML-based wait-time prediction, and a WhatsApp channel for customer notifications.

See `prd.md`, `architecture.md`, `phases.md`, and `memory.md` in the repo root for the full spec and progress.

## Quick start (Phase 0 scaffold)

Requires Docker + Docker Compose. Brings up Postgres, the FastAPI backend, and the Next.js frontend.

```bash
cp .env.example .env   # optional — sensible defaults are built into docker-compose.yml
docker compose up --build
```

- Backend health check: http://localhost:8000/health
- Frontend landing page: http://localhost:3000

Local ports: Postgres `5432`, backend `8000`, frontend `3000`.

## Repository layout

ai-qms/
├── README.md
├── LICENSE
├── .gitignore
├── .env.example
├── docker-compose.yml
│
├── backend/                              # FastAPI backend
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── alembic.ini
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                       # FastAPI entry point
│   │   ├── config.py                     # Pydantic Settings
│   │   ├── database.py                   # DB connection (SQLAlchemy)
│   │   ├── models/                       # ORM models
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── institution.py
│   │   │   ├── counter.py
│   │   │   ├── personnel.py
│   │   │   └── token.py
│   │   ├── schemas/                      # Pydantic schemas
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── institution.py
│   │   │   ├── token.py
│   │   │   └── queue.py
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── v1/
│   │   │       ├── __init__.py
│   │   │       ├── auth.py
│   │   │       ├── institutions.py
│   │   │       ├── counters.py
│   │   │       ├── tokens.py
│   │   │       ├── queue.py
│   │   │       └── whatsapp.py
│   │   ├── services/                     # Business logic
│   │   │   ├── __init__.py
│   │   │   ├── queue_service.py
│   │   │   ├── token_service.py
│   │   │   ├── whatsapp_service.py
│   │   │   └── notification_service.py
│   │   ├── ml/                           # AI/ML logic
│   │   │   ├── __init__.py
│   │   │   ├── predictor.py              # Wait time prediction
│   │   │   ├── optimizer.py              # Counter allocation
│   │   │   └── models/                   # Trained model artifacts
│   │   ├── websocket/                    # Real-time queue updates
│   │   │   ├── __init__.py
│   │   │   └── manager.py
│   │   └── utils/
│   │       ├── __init__.py
│   │       └── helpers.py
│   ├── migrations/                       # Alembic migrations
│   └── tests/
│       ├── __init__.py
│       ├── test_api/
│       ├── test_services/
│       └── test_ml/
│
├── frontend/                             # Next.js dashboard
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── Dockerfile
│   ├── public/
│   │   ├── favicon.ico
│   │   └── images/
│   ├── src/
│   │   ├── app/                          # App Router pages
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                  # Landing page
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── register/page.tsx
│   │   │   └── (dashboard)/              # Protected routes
│   │   │       ├── layout.tsx
│   │   │       ├── overview/page.tsx
│   │   │       ├── tokens/page.tsx
│   │   │       ├── counters/page.tsx
│   │   │       ├── personnel/page.tsx
│   │   │       ├── live-queue/page.tsx
│   │   │       └── analytics/page.tsx
│   │   ├── components/
│   │   │   ├── ui/                       # shadcn/ui primitives
│   │   │   ├── layout/                   # Sidebar, navbar, etc.
│   │   │   ├── queue/                    # Queue display widgets
│   │   │   └── tokens/                   # Token management UI
│   │   ├── lib/
│   │   │   ├── api-client.ts             # Axios/fetch wrapper
│   │   │   ├── socket.ts                 # WebSocket client
│   │   │   └── utils.ts
│   │   ├── hooks/
│   │   ├── store/                        # State (zustand)
│   │   └── types/                        # TypeScript interfaces
│   └── __tests__/
│
├── whatsapp-bot/                         # WhatsApp integration
│   ├── package.json                      # (Node.js) or requirements.txt (Python)
│   ├── Dockerfile
│   └── src/
│       ├── index.ts                      # Entry point
│       ├── whatsapp-client.ts            # Twilio / Cloud API / BaaS wrapper
│       ├── message-handler.ts            # NLP intent parsing
│       ├── conversation.ts               # Multi-turn flow (token gen)
│       └── templates.ts                  # Message templates
│
├── ml-notebooks/                         # Data science & experimentation
│   ├── eda.ipynb
│   ├── wait-time-prediction.ipynb
│   └── data/                             # Sample datasets
│
├── infrastructure/                       # Deployment
│   ├── k8s/
│   │   ├── backend-deployment.yaml
│   │   ├── frontend-deployment.yaml
│   │   └── whatsapp-bot-deployment.yaml
│   └── nginx/
│       └── default.conf
│
└── docs/
    ├── api/
    ├── architecture.md
    └── setup.md