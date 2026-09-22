# FleetCare Autonoleggio — PRD

## Problema originale
Titolare di autonoleggio deve controllare le scadenze della flotta: bollo, collaudo (con regole specifiche), polizze assicurative (con sospensioni cumulative fino a 10 mesi), export report ed evidenza visiva immediata dei veicoli che possono/non possono circolare (bollo escluso dalla verifica).

## Architettura
- Backend: FastAPI + MongoDB (motor). Auth JWT (bearer + cookie httpOnly). server.py monolitico.
- Frontend: React (CRA/craco) + Tailwind + shadcn/ui + lucide-react + sonner.
- Report: openpyxl (Excel) + reportlab (PDF).

## Persona
Titolare/operatore autonoleggio (single admin: sertrani@gmail.com).

## Regole di business (core, statiche)
- Collaudo: 1° a fine mese del 4° anno dall'immatricolazione; successivi a fine mese ogni 2 anni dall'ultimo collaudo.
- Polizza: compagnia, tipologia (annuale/semestrale/quadrimestrale/trimestrale/mensile/a_data_fissa), data stipula, scadenza rata intermedia, scadenza contratto.
- Sospensione: giorni cumulativi tra sospensioni/riattivazioni multiple; max 10 mesi = 304 giorni; auto-riattivazione al raggiungimento del limite e blocco di ulteriori sospensioni.
- Circolabilità: bloccata SOLO da collaudo scaduto O polizza scaduta/sospesa. Bollo scaduto NON blocca (solo avviso).

## Implementato (2026-09-22)
- Auth JWT email/password, seeding admin.
- CRUD veicoli (targa, marca/modello, immatricolazione, bollo, ultimo collaudo).
- Calcolo automatico scadenza collaudo (regole fine mese) + registrazione collaudo.
- Gestione polizza + motore sospensione/riattivazione con contatore cumulativo, progress bar, registro storico, cap 304gg e auto-riattivazione.
- Dashboard KPI, filtri (tutti/può/non può/sospese/bollo scaduto), ricerca, badge circolabilità verde/rosso.
- Export Excel (.xlsx) e PDF (scadenziario).
- Testato: backend 13/13 pytest, frontend e2e OK.

## Backlog
- P1: notifiche email scadenze (Resend), viste/ordinamento avanzato, storico bolli.
- P2: multi-utente/ruoli, allegati documenti (object storage), grafici scadenziario.
