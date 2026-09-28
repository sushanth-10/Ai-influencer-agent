# n8n API contract

This document is the integration placeholder for the n8n team. The frontend currently runs in explicit mock mode because the production webhook URLs and final contracts have not been supplied.

## Required decisions

Before switching `VITE_USE_MOCK_API=false`, confirm:

- Webhook URL and HTTP method for each operation
- Request and response JSON for campaign creation, recommendations, outreach, approval, performance, and memory
- Error response shape and authentication requirements
- Timeout expectations
- Campaign ID and creator ID formats
- Memory response format, including any before/after ranking evidence

## Campaign creation

`POST ${VITE_N8N_CAMPAIGN_WEBHOOK}`

Request currently modeled as:

```json
{
  "product": "Protein Powder",
  "description": "High protein supplement",
  "category": "Fitness",
  "target_audience": "College students interested in fitness",
  "target_age": "",
  "target_gender": "",
  "location": "Hyderabad",
  "budget": 50000,
  "goal": "Brand awareness + sales",
  "platform": "Instagram",
  "additional_requirements": ""
}
```

Expected normalized frontend response:

```json
{
  "campaign_id": "campaign-id",
  "recommendations": [
    {
      "creator_id": "creator-id",
      "name": "Creator Name",
      "platform": "Instagram",
      "profile_url": "https://example.com/profile",
      "followers": 85000,
      "engagement_rate": 8.1,
      "location": "Hyderabad",
      "category": "Fitness",
      "estimated_price": 12000,
      "match_score": 92,
      "reasons": ["Location match"],
      "historical_evidence": [],
      "data_status": "verified"
    }
  ],
  "memory": {
    "found": true,
    "insights": [],
    "before_after": null
  }
}
```

The adapter in `src/api/n8n.ts` is intentionally the only place that knows webhook URLs. If the n8n response uses different names, add normalization there rather than changing components.

## Environment variables

See `.env.example`. Production webhook URLs must be supplied through environment variables and must not be committed.
