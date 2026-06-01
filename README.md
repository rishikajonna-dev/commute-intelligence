#  Commute Intelligence Platform

A B2B SaaS proof of concept that gives Indian enterprise transport coordinators forward visibility into tomorrow's route risk — so they can dispatch on time, every time.

---

## The Problem

Indian transport operators add 30–45 minutes of buffer to every trip because no tool tells them what tomorrow's traffic will look like on their specific routes. This costs them in idle vehicle time, excess driver hours, and in some cases, revenue from bookings they decline during peak hours.

> *"We add buffer to be safe"* — every operator interviewed

Google Maps tells you what's happening right now. This product tells you what to expect tomorrow.

---

## What It Does

Every evening, the dashboard shows coordinators:

- **Leave by [time] tomorrow** — a specific departure recommendation per route
- **Risk level** — Normal / Elevated / High based on real signals
- **Why** — which signals drove the score (rain, Friday pattern, month-end traffic)
- **30-day route scorecard** — which routes are consistently problematic

---

## Live Demo

**Routes covered (Hyderabad):**
- Vanasthalipuram → Madhapur
- Miyapur → Gachibowli
- LB Nagar → Secunderabad

**Scenario selector:**
- Live Data — real API calls
- Rainy Friday — simulated high-risk conditions
- Month-end Rush — simulated elevated conditions

---

## How It Works

### Scoring Engine

Each route is scored every evening using 8 signals:

| Signal | Weight | Source |
|---|---|---|
| Travel time >30% above baseline | +30 | OpenRouteService API |
| Rain probability >60% | +25 | OpenWeatherMap API |
| Tomorrow is Friday | +15 | System date |
| Month-end / payday period | +10 | System date |
| Evening peak hours | +15 | Shift start time |

**Score 0–35 → Normal 🟢**
**Score 35–65 → Elevated 🟡**
**Score 65+ → High 🔴**

### Departure Recommendation

```
Recommended Departure = Shift Start − Predicted Travel Time − 10 min buffer
```

Rounded to nearest 5 minutes. Always shown — never hidden behind a status label.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TailwindCSS |
| Travel time | OpenRouteService API |
| Weather | OpenWeatherMap API |
| Scoring | Rules-based weighted engine |
| Build tool | Vite |

---

## Project Context

This POC is part of a larger PM portfolio project including:

- Market analysis of Indian enterprise transport software
- 8 primary user research interviews with transport operators
- Full PRD with problem statement, feature specs, and technical architecture
- Buy vs Build analysis for the prediction model layer
- Secondary research validation against TomTom, Routematic, and MoveInSync data

---

## Getting Started

### Prerequisites

- Node.js 18+
- OpenRouteService API key — [openrouteservice.org](https://openrouteservice.org)
- OpenWeatherMap API key — [openweathermap.org](https://openweathermap.org/api)

### Installation

```bash
git clone https://github.com/rishikajonna-dev/commute-intelligence.git
cd commute-intelligence
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```
REACT_APP_ORS_KEY=your_openrouteservice_key_here
REACT_APP_OWM_KEY=your_openweathermap_key_here
```

See `.env.example` for reference.

### Run Locally

```bash
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173)

---

## Known Limitations

- **OpenRouteService accuracy** — ORS uses OpenStreetMap data which underestimates Indian road travel times. A 1.6x correction multiplier is applied. Production would use Mappls API for India-specific accuracy.
- **Static routes** — 3 routes hardcoded for POC. Production onboarding allows coordinators to define their own routes via a Mappls-powered dropdown.
- **Mocked scorecard** — 30-day route performance table uses mock data. Production populates from operator GPS trip history.
- **No backend** — all API calls made client-side. Production uses a server-side 6pm pipeline with cached results.

---

## Roadmap

| Phase | Scope |
|---|---|
| V1 (this POC) | Rules-based scoring, 3 fixed routes, live weather + traffic signals |
| V2 | Operator onboarding, custom routes, Mappls API, WhatsApp alerts via Twilio |
| V3 | ML model trained on operator GPS outcome data, city expansion to Bangalore |

---

## Author

Built by Rishika Jonna as a PM portfolio project — June 2026

*Research → PRD → POC. End to end.*

---

*POC v1.0 · Hyderabad · June 2026*
