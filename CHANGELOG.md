# Changelog

## 1.0.1 (2026-09-01)

### Parandatud
- Kriitiline: kitsal ekraanil (mobiil) näitas temperatuurigraafik kõige värskemaid lugemisi puudulikult/kuvast väljas — `useDataPointLimit` vähendas kitsal ekraanil kuvatavate punktide arvu 100-lt 10-le, jättes samas API päringu `limit` (päevavahemik) mõlemal juhul samaks (10 päeva). Tulemus: kitsas ekraan üritas sama 10-päevast akent katta 10× hõredama tihedusega, mistõttu enamik neist 10 punktist langes vanemasse, hõredamasse ajalukku ja viimaste tundide tihe andmestik surus kokku graafiku parema serva lähedale, kohati visuaalselt kaduma
- `useChartWindow` asendab `useDataPointLimit`-i: punktide arv (`pointLimit`) skaleerub nüüd pidevalt ekraani laiusega (~1 punkt / 12px, piirid 15–100), mitte binaarse 10/100 lülitina; kuvatav päevavahemik (`dayLimit`) tuletatakse sellest nii, et tihedus (punkte/päev) püsib ligikaudu konstantsena (~9–10,7 pkt/päev) kõigi laiuste vahel — kitsas ekraan näitab lühemat, aga sama tihedusega hiljutist akent, mitte sama laia akent hõredamalt
- `page` lähtestatakse 0-le, kui `dayLimit` resize'i tõttu muutub, vältimaks kuvatava vahemiku vaikset nihkumist

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
