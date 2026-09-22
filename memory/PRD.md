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

## Implementato (2026-09-22, iterazione 2)
- Avvisi email (Resend gestito) a destinatari configurabili + cron giornaliero 07:00 Europe/Rome (`.emergent/crons.yml`, endpoint protetto da WEBHOOK_CRON_SECRET). Invio manuale "Invia riepilogo ora".
- Documenti veicolo (libretto/carta circolazione/polizza) PDF+immagini su object storage; upload/visualizza/elimina.
- Calendario scadenze mensile (chip colorati per stato, navigazione mesi).
- Monitor flotta: heatmap tabellare per veicolo/tipo scadenza colorata per stato.
- Storico pagamenti bollo per veicolo + aggiornamento scadenza.
- Personalizzazione logo (header + report Excel/PDF) e nome azienda.
- Importi polizza (premio totale, importo rata).
- Periodo di comporto assicurativo 15 gg: automatico per annuale/semestrale, opzionale (checkbox) per le altre tipologie; estende la circolabilità effettiva.
- Hardening report PDF/Excel contro logo corrotti (validazione PIL).
- Testato: backend 18/18 pytest + flussi frontend e2e OK.

## Backlog
- P1: grafici riepilogativi (torta/barre) nel monitor, ordinamento avanzato.
- P2: multi-utente/ruoli, notifiche in-app, archiviazione storica scadenze.
- Nota tecnica: CORS attualmente '*'; migrare a lifespan handlers (deprecato on_event).
