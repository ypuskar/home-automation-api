# Home Automation API

Koduautomaatika API-server ja veebiliides. Teenindab HTTPS API-t, edastab reaalajas andmeid SSE kaudu ja serveerib React frontend'i.

## Arhitektuur

See on kahe-teenuse süsteemi teine pool. API-server jookseb uuel Pi masinal (192.168.1.50, Node 22, aarch64) samal masinal kus PostgreSQL. Loeb `current_state` tabelist andmeid mida hardware-agent (192.168.1.43) kirjutab.

- **Backend**: Fastify 5 HTTPS server, SSE broadcaster, ajalooliste andmete API
- **Frontend**: React 18 + MUI 5 SPA, Recharts graafikud, reaalajas tabel
- **Shared types**: TypeScript tüübid mida jagavad backend ja frontend

## Eeldused

- Raspberry Pi (aarch64, Raspbian 12)
- Node.js 22.x
- pnpm paketihaldur
- PostgreSQL andmebaas (localhost)
- Let's Encrypt sertifikaat HTTPS jaoks (valikuline — ilma käivitub HTTP-na)

## Seadistamine

```bash
# .env faili loomine backend'ile
cp packages/backend/.env.example packages/backend/.env
# Lisa tegelikud DB credentials ja TLS teed

# Sõltuvuste paigaldamine (Pi-l)
ssh pi@192.168.1.50 "cd /home/pi/projects/home-automation-api && pnpm install"
```

## Arendus

```bash
# Backend arendus (tsx, hot-reload)
pnpm dev:backend

# Frontend arendus (Vite dev server)
pnpm dev:frontend

# Kõik testid
pnpm test

# Backend testid
pnpm test:backend

# Frontend testid
pnpm test:frontend
```

## Build ja deploy

```bash
# Frontend build
pnpm build:frontend

# Backend build (tsc)
pnpm --filter @home-automation/backend build

# Teenuse restart
pnpm restart:remote
```

## Production

```bash
# Systemd service paigaldamine
sudo cp systemd/home-automation-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable home-automation-api
sudo systemctl start home-automation-api
```

Systemd käivitab `node --env-file=.env dist/index.js` — üks protsess, ~67 MB mälu.
Frontend on eelnevalt builditud (`packages/frontend/dist/`) ja serveeritakse @fastify/static kaudu.

## Projekti struktuur

```
packages/
├── shared-types/           # TypeScript tüübid (zero runtime deps)
│   └── src/index.ts
├── backend/
│   ├── src/
│   │   ├── index.ts          # Entry point
│   │   ├── server.ts         # Fastify setup (HTTPS/HTTP, CORS, static)
│   │   ├── config.ts         # .env laadimine
│   │   ├── services/
│   │   │   ├── db.service.ts           # PostgreSQL päringud
│   │   │   ├── current-state-poller.service.ts  # current_state pollimine
│   │   │   ├── sse.service.ts          # SSE broadcaster
│   │   │   └── memory.service.ts       # Mälujälgimine
│   │   ├── routes/
│   │   │   ├── sse.route.ts    # GET /sse
│   │   │   ├── temps.route.ts  # GET /api/temps
│   │   │   ├── periods.route.ts # GET /api/periods
│   │   │   └── health.route.ts # GET /api/health
│   │   └── plugins/
│   │       └── swagger.ts      # OpenAPI docs
│   └── test/unit/
└── frontend/
    ├── src/
    │   ├── App.tsx, main.tsx
    │   ├── components/         # Dashboard, tabelid, graafik
    │   ├── hooks/              # useSSE, useApi
    │   └── utils/              # timeConversion
    └── dist/                   # Vite build output
migrations/                     # SQL migratsioonid
systemd/                        # Systemd service fail
```

## API endpointid

| Endpoint | Kirjeldus |
|----------|-----------|
| `GET /` | Frontend SPA |
| `GET /sse` | Server-Sent Events (reaalajas andmed) |
| `GET /api/temps?page=0&limit=10` | Temperatuuri ajalugu (päevavahemike kaupa) |
| `GET /api/periods?page=0&limit=10` | Kütteperioodid (päevavahemike kaupa) |
| `GET /api/health` | Terviseseisund (uptime, staleness) |
| `GET /api/docs` | Swagger UI |

## Arendusdokumendid

Spec-failid on hardware-agent repos (seal loodi kogu disain):
- `hardware-agent/.kiro/specs/home-automation-rewrite/requirements.md`
- `hardware-agent/.kiro/specs/home-automation-rewrite/design.md`
- `hardware-agent/.kiro/specs/home-automation-rewrite/tasks.md`

## Seotud projekt

- **hardware-agent** (192.168.1.43) — anduri lugemine, GPIO juhtimine. Eraldi repo, eraldi masin.

## Reeglid

### Arendus
- pnpm workspace (backend + frontend + shared-types)
- `tsx` arenduseks, `tsc` + `node dist/` productioniks
- SMB-mountitud ketas — muudatused kohe Pi-l
- TLS sertifikaadita käivitub HTTP mode'is

### Testimine
- `pnpm test` käivitab kõik testid mõlemas paketis (vitest)
- Backend: 125 testi (9 faili), Frontend: 4 testi (1 fail)
- Testid käivitada Pi-l SSH kaudu

### Dokumenteerimine
- Backend ruute documenteerib @fastify/swagger automaatselt
- Shared-types on kanoonilne tüübiallikas
