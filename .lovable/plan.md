# Specifiche Funzionali — CFO/CEO Financial Dashboard

## 1. Scopo e contesto

Web app interna per la direzione (CEO/CFO) di un gruppo multi-business unit che opera nei settori **Equestrian, Events, Retail, Advisory**. Fornisce una vista unificata su **performance economica (P&L)** e **posizione di cassa**, con confronti **Actual vs Budget** (Base/Worst/Best) e **Actual vs Previous Year (PY)**, drill-down per Business Unit e per servizio.

Stack: React 18 + Vite + TypeScript, Tailwind, shadcn/ui, Recharts, React Router. Dati attualmente da mock (`src/data/financialDataV8.ts`, `mockData.ts`, `centralizedData.ts`); nessun backend.

## 2. Utenti e ruoli

- **CEO / CFO**: lettura sintetica KPI, navigazione tra sezioni, drill-down.
- **Controller / FP&A**: lettura analitica (waterfall, P&L matrix, drill-down OpEx/GM).
- Nessuna autenticazione attualmente prevista (single-tenant prototype).

## 3. Architettura informativa (navigazione)

Nav top fissa con 5 sezioni (route React Router):

| Route | Sezione | Stato |
|---|---|---|
| `/overview` | **Overview** (Performance + Cash) | Attiva |
| `/performance` | **Analysis** (Waterfall) | Attiva |
| `/cash` | **Recommendation** | Placeholder |
| `/ratios` | **Action** | Placeholder |
| `/statements` | **Communication** | Placeholder |

`/` redirect a `/overview`. Tema **dark mode di default**.

## 4. Filtri globali (presenti in Overview e Analysis)

1. **Periodo**: 12 mesi specifici (Gen–Dic 2025 + Dic '24) + `MTD`, `QTD`, `YTD`.
   - MTD = dal 1° del mese corrente alla data corrente dinamica.
   - QTD = dal 1° ottobre alla data corrente.
   - YTD = anno fiscale: 1° novembre 2024 → data corrente.
   - Mese specifico = full month range.
2. **Scenario di confronto**:
   - `Actual vs Budget Base`
   - `Actual vs Budget Worst`
   - `Actual vs Budget Best`
   - `Actual vs PY` (stesso periodo dell'anno precedente, shift -12 mesi)
3. **Business Unit**: `All Company`, `Equestrian`, `Events`, `Retail`, `Advisory`.
   - Quando ≠ All Company, le viste cross-BU (es. BU Performance Chart) si nascondono.

**Data corrente dinamica**: `new Date().toISOString().split('T')[0]`. Tutti i calcoli "TO DATE" e i confronti PY ne dipendono.

## 5. Sezione Overview

Tab pill centrato con due viste: **Performance** (default) e **Cash**.

### 5.1 Overview → Performance

- Filtri: Periodo, Scenario, BU.
- **4 KPI Card** con Actual / Comparison / Variance assoluta / Variance %:
  1. Revenue
  2. Gross Margin
  3. OpEx (in valore assoluto)
  4. EBITDA
- Logica varianza: se Actual e Comparison hanno segni opposti, KPI viene marcato `isOppositeSigns` (visualizzazione speciale).
- **Revenue Trend Chart**: trend mensile Actual vs Budget/PY, filtrato per BU.
- **BU Performance Chart**: barre comparate per BU su Revenue, GM, OpEx, EBITDA. Visibile solo se BU = All Company. Click → naviga a `/performance`.
- KPI cliccabili: navigazione contestuale (Revenue/EBITDA/OpEx → Analysis; Cash → tab Cash).

### 5.2 Overview → Cash

- Filtri: Scenario, BU (no Periodo: il calcolo è sempre TO DATE alla data corrente).
- **4 KPI Card**:
  1. **Cash Balance TO DATE** — saldo cassa calcolato come somma flussi storici fino alla data corrente (non valore di chiusura mese).
  2. **Cash Flow MTD** — burn/flow del mese in corso.
  3. **Payables TO DATE** — debiti fornitori aperti.
  4. **Receivables TO DATE** — crediti clienti aperti.
- Confronto:
  - Scenario Budget_* → vs scenario di budget alla stessa data.
  - Scenario PY → vs Actual alla data shiftata di -12 mesi.
- **Cash Trend Chart**: andamento mensile saldo di cassa (Dec '24 → Dec '25), calcolato TO DATE per ogni mese tramite `getCashBalance()` (non valore `close`). Rispetta scenario e BU. Senza legenda.

## 6. Sezione Analysis (`/performance`)

- Stessi filtri globali.
- **Performance Waterfall**: scomposizione varianza Revenue → EBITDA con effetti incrementali. Drill-down su singolo bar via `WaterfallDrilldownDrawer`.
- Componenti supplementari disponibili: `PLMatrix`, `OpExDrawer`, `GrossMarginDrawer`, `BUMarginComparison`, `CostStructureChart`, `ServiceMixTreemap`, `FinancialRatiosChart`, `CashFlowWaterfall`, `RunwayScenarios` (alcuni non tutti montati nella vista corrente).

## 7. Sezioni placeholder

`Recommendation` (`/cash`), `Action` (`/ratios`), `Communication` (`/statements`): card con messaggio "under construction". Da definire come fasi successive del workflow CFO (analizza → raccomanda → agisci → comunica).

## 8. Modello dati (mock)

- **Business Units**: `BU1_Equestrian`, `BU2_Events`, `BU3_Retail`, `BU4_Advisory` con label leggibili.
- **P&L per periodo** (`getPLDataForPeriod(startDate, endDate, scenario, bu?)`): ritorna `{ actual, budget, previousYear }` con campi `revenue, cogs, grossMargin, opex, ebitda`.
- **Cassa** (`financialDataV8.ts`):
  - `getCashBalance(scenario, date, bu?)` — somma flussi fino a `date`.
  - `getMonthlyBurn(start, end, scenario, bu?)`.
  - `getPayables` / `getReceivables` (ritornano `{ amount, ... }`).
  - `getMonthlyCashBalances(scenario, bu?)` — array {month, actual, budget} con calcolo TO DATE.
  - Helper temporali: `getPYDate`, `getMonthStart`, `CURRENT_DATE`.

## 9. Regole di calcolo chiave

- **TO DATE**: filtro `date <= currentDate` su tutte le metriche cassa e relativo PY (`pyDate = currentDate - 12 mesi`).
- **OpEx** mostrato in valore assoluto in KPI Card.
- **Variance %** = `(Actual − Comparison) / |Comparison| * 100` (0 se Comparison = 0).
- **PY scenario**: `Actual_currentYear` vs `Actual_previousYear` (mai vs Budget).

## 10. UX e visual

- Dark mode forzato in `App.tsx`.
- Componenti shadcn/ui: Card, Select, Tabs (variante pill custom), Drawer.
- Animazioni: `animate-fade-in` sui contenuti delle pagine.
- Layout responsive: KPI grid 1/2/4 colonne (mobile/tablet/desktop).
- Currency/percentuali formattate centralmente in `KPICard`.
- Colori varianza tramite `lib/varianceColors.ts` (gestione segno + opposite signs).

## 11. Routing & stato

- Stato locale in `Index.tsx`: `currentPage`, `selectedMonth`, `selectedScenario`, `selectedBU`, drawer open/breakdown, `currentView` (economics/cash).
- Sync stato ↔ URL via `useLocation` su change pathname.
- Drawer (OpEx, GM, Waterfall, Concentration) montati a livello pagina, aperti via callback.

## 12. Limitazioni note / non-funzionali

- Dati 100% mock, nessuna persistenza.
- Nessun export (PDF/CSV) né forecasting.
- Sezioni Recommendation/Action/Communication non implementate.
- Nessuna autenticazione, multi-tenant, ruoli o audit log.
- Performance: dataset piccolo, calcoli sincroni client-side accettabili.

## 13. Estensioni candidate (non in scope attuale)

- Cash Forecast a 13 settimane.
- Cash Bridge chart e drilldown transazioni.
- Export dashboard (PDF) e snapshot mensile.
- Integrazione backend (Lovable Cloud) per dati reali, autenticazione, ruoli (CEO/CFO/Controller).
- Pagine Recommendation / Action / Communication con workflow collaborativo.

---

Vuoi che produca questo documento anche come **PDF** o **DOCX scaricabile** in `/mnt/documents/`, oppure preferisci tenerlo solo qui in chat?