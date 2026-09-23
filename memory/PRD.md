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

## Implementato (2026-09-23, iterazione 8)
- Costo collaudo per veicolo (`costo_collaudo`) usato per stimare con precisione il risparmio in Strategia; incluso nello snapshot per l'annullamento.
- Piano sospensioni: da Strategia si salva un suggerimento come azione pianificata (planned/applied/cancelled). Endpoint `/api/strategy/plan` (create/list/apply/cancel/delete). "Applica" sospende la polizza dalla data suggerita.
- Simulatore risparmio: `/api/strategy?until=&need_auto=&need_furgone=&need_altro=` → `simulation{until,total_saving,count}`. Fabbisogno per tipo (auto/furgone/altro): l'eccedenza per tipo viene consigliata alla sospensione, tenendo i mezzi più necessari.
- Report Strategia PDF+Excel (`/api/reports/strategy/{excel,pdf}`).
- Avviso email Strategia in mese configurabile (`strategy_alert_month`) + `/api/strategy/alert/send-now` + cron `strategy-avviso` (crons.yml).
- Modulo Manutenzione: checklist controlli configurabile (`/api/maintenance/types` CRUD), overview per veicolo con stato/next_due, spunta controllo (`/api/maintenance/checks`, permesso `manage_maintenance`), interventi to-do con completamento+costo, statistiche e report PDF/Excel per periodo. Controlli scaduti/imminenti confluiscono nel campanello notifiche (type 'manutenzione').
- Nuovo permesso RBAC `manage_maintenance`. Nuove pagine /strategia (ampliata) e /manutenzione.
- Testato: backend 17/17 pytest (test_iteration8.py) + tutti i flussi frontend e2e OK.

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

## Implementato (2026-09-22, iterazione 3)
- Multi-utente con RBAC (organizzazione unica): admin crea utenti e assegna permessi (manage_vehicles, manage_policies, manage_payments, delete_operations, manage_users, export_reports, manage_settings); attiva/disattiva, reset password, elimina. Bottoni UI e API protetti dai permessi.
- Resoconto storico (audit log) di ogni operazione + scheda storica per veicolo (timeline con data effettiva e operatore).
- Annullamento operazioni con ripristino completo dello stato/contatori (snapshot-restore).
- Data di registrazione personalizzabile per ogni operazione (bollo, collaudo, polizza, sospensione, riattivazione).
- Numero polizza + rinnovo (nuova polizza) con archiviazione della precedente e azzeramento opzionale del contatore sospensioni (richiesto via checkbox); rinnovo annullabile.
- Archivio collaudi (storico) come per i bolli, con ricalcolo automatico scadenza.
- Promemoria email separati per bollo/collaudo/polizza.
- Grafici riepilogativi nel Monitor (torta circolabilità + barre scadenze per mese).
- Throttle anti-429 sull'invio digest.
- Testato: backend 52/52 pytest + flussi frontend e2e OK.

## Implementato (2026-09-22, iterazione 4)
- Export Storico: report completo delle operazioni in Excel e PDF, filtrabile per veicolo e periodo (/api/reports/audit/excel|pdf).
- Log accessi: ogni login viene registrato (utente, email, IP, data/ora); l'admin lo consulta in Impostazioni (/api/login-log).
- Notifiche in-app: campanello in intestazione con badge (scadute + in giornata) e popover con scadute/oggi/prossimi 7 giorni (/api/notifications/today).
- Filtri Storico: filtro per veicolo, tipo operazione e intervallo date sulla pagina Storico (/api/audit con parametri).
- Testato: backend 71/71 pytest + flussi frontend e2e OK.

## Implementato (2026-09-22, iterazione 5)
- Badge campanello personalizzabile: settings.bell_days definisce quanti giorni di anticipo mostrare nel campanello (/api/notifications/today usa bell_days).
- Filtro Storico per operatore: dropdown popolato da /api/audit/operators; /api/audit?user_email filtra chi ha fatto cosa.
- Scheda PDF veicolo: /api/reports/vehicle/{id}/pdf con dati generali, polizza, storico bolli/collaudi e timeline operazioni (pulsante nella scheda storica).
- Testato: backend 85/85 pytest + flussi frontend e2e OK.

## Implementato (2026-09-22, iterazione 6)
- Filtro rapido "Con scadenze scadute" nella Flotta (veicoli con almeno una scadenza già scaduta).
- Campanello a colori: conteggio separato rosso (scadute/oggi) e giallo (in arrivo) con doppio badge.
- Note libere per veicolo (max 2000 caratteri), visibili sulla card e nella scheda PDF del veicolo.
- Testato: backend 11/11 nuovi test (94/96 totali; 2 fallimenti solo per race su impostazione condivisa in parallelo, non bug di prodotto).

## Implementato (2026-09-23, iterazione 7)
- Ordina Flotta: menu "Ordina per" (scadenza più vicina [default], targa, modello, stato circolazione) valido per griglia e tabella.
- Duplica Veicolo: pulsante "Duplica" (card e tabella) che apre il form precompilato (marca/modello, tipo) con targa e immatricolazione vuote.
- Vista Tabella (stile Excel): interruttore griglia/tabella; una riga per veicolo con colonne targa/veicolo/circolazione/collaudo/polizza/bollo e azioni (polizza, collaudo, bollo, doc, storico, duplica, modifica, elimina).
- Campo "tipo" veicolo (auto/furgone/altro) su veicolo; incluso nello snapshot per l'annullamento.
- Tipologie polizza ristrutturate: rimossa "semestrale" come tipologia; le polizze Annuali hanno un campo separato "Frazionamento" (unica/semestrale/quadrimestrale/trimestrale/mensile) visibile solo per tipologia=annuale. Comporto 15gg automatico per le annuali, opzionale per le altre. Migrazione all'avvio: vecchie polizze semestrali → annuale + frazionamento semestrale.
- Stagione operativa configurabile in Impostazioni (mese apertura/chiusura, default apr–ott).
- Pagina Strategia (nav dedicata) + endpoint GET /api/strategy: per ogni veicolo calcola punteggio/opportunità di sospensione (combinazione pesata risparmio economico + tipo veicolo/domanda stagionale, picco lug–ago), motivazioni testuali, blocchi (comporto 15gg, limite 10 mesi, già sospesa), finestra suggerita e risparmio stimato; sospensione rapida dalla pagina con la data suggerita. Indicatore "opportunità" nella Dashboard che porta alla pagina Strategia.
- Testato: backend 11/11 pytest (test_iteration7.py) + tutti i flussi frontend e2e OK.

## Backlog
- P1: split di server.py in moduli; migrazione a lifespan handler; serializzare i test su bell_days.
- P2: caching notifications_today; TTL retention audit; restringere CORS a dominio esplicito.
