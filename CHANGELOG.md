# Changelog

## 1.0.0 (2026-08-29)

Esmane release — API-server ja frontend koduautomaatika süsteemile.

### Lisatud
- Fastify 5 HTTPS server (HTTP fallback kui TLS sertifikaadid puuduvad)
- SSE broadcaster — reaalajas andmete edastamine brauseri klientidele
- current_state poller — hardware-agent'i andmete lugemine DB-st iga 2s
- Staleness detection — `stale: true` märge kui hardware-agent ei uuenda 15s jooksul
- REST API: `/api/temps`, `/api/periods`, `/api/health` päevavahemiku paginatsiooniga
- OpenAPI/Swagger dokumentatsioon (`/api/docs`)
- React 18 + MUI 5 frontend (dark theme)
- Reaalajas temperatuuritabel SSE andmetega
- Recharts temperatuurigraafik 4 ruumi joontega, paginatsioon, responsive
- MUI DataGrid kütteperioodide tabel sorteerimise ja filtreerimisega
- Uptime header (Node.js + OS uptime, 1s uuendus)
- Shared-types pakett (zero runtime deps)
- Mälujälgimine (512 MB limiit)
- Vitest testid (backend: 125, frontend: 4)
- Systemd service fail
- SQL migratsioon `current_state` tabeli jaoks
