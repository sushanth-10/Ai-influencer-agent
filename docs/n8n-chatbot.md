# CampaignMind chatbot + n8n/Hindsight

The frontend now includes a floating CampaignMind AI chat interface.

## Frontend environment

Add this to `.env.local`:

```env
VITE_N8N_CHAT_WEBHOOK=https://YOUR-N8N-DOMAIN/webhook/campaignmind-chat
```

Restart Vite after changing `.env.local`.

## n8n workflow

Create a separate Webhook workflow for chat:

```text
Webhook
  ↓
Hindsight Recall
  ↓
AI Agent
  ↓
Respond to Webhook
```

The frontend sends:

```json
{
  "message": "Which influencers fit my current campaign?",
  "conversation_id": "browser-session-id",
  "campaign": {
    "product": "protein powder",
    "description": "fitness",
    "category": "fitness",
    "target_audience": "students",
    "target_age": "25",
    "target_gender": "male",
    "location": "hyderabad",
    "budget": 50000,
    "goal": "sales",
    "platform": "Instagram",
    "additional_requirements": ""
  }
}
```

### Hindsight Recall query

Use the incoming message and campaign context. For example:

```json
{
  "query": "{{$json.body.message}} Campaign context: {{$json.body.campaign.product}}, {{$json.body.campaign.category}}, target {{$json.body.campaign.target_audience}} in {{$json.body.campaign.location}} on {{$json.body.campaign.platform}}."
}
```

For the AI Agent, instruct it to:
- answer the user's question using recalled Hindsight context;
- use the campaign object when relevant;
- never invent creator facts;
- explain when information is unavailable.

### Respond to Webhook

Return JSON in this shape:

```json
{
  "reply": "Your answer here",
  "memories": [
    "Relevant recalled memory 1",
    "Relevant recalled memory 2"
  ]
}
```

The frontend also accepts `response`, `message`, `text`, or `output` as the reply field.

## Important

The existing campaign webhook and the chat webhook serve different payloads. Keeping chat on its own webhook avoids breaking the existing campaign matching workflow.
