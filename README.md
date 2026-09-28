# CampaignMind

CampaignMind is the frontend for an AI influencer campaign management agent. It gives brands a focused workflow for creating campaigns, reviewing creator recommendations, approving outreach, and seeing how campaign outcomes become future learning through n8n and Hindsight.

## Current Phase 1 foundation

- React + Vite + TypeScript + Tailwind CSS
- Responsive dashboard shell with sidebar navigation
- Dashboard skeleton with campaign and memory surfaces
- Campaign brief form with validation and loading/error states
- Centralized typed n8n API adapter
- Placeholder recommendations UI with explicit mock data status
- n8n contract placeholder in `docs/n8n-api-contract.md`

The remaining product pages are represented in navigation and will be added after the n8n contracts are finalized.

## Run locally

```bash
npm install
npm run dev
```

The project starts in mock mode by default. Copy `.env.example` to `.env.local`, set `VITE_USE_MOCK_API=false`, and provide the final n8n webhook URLs when they are available.
