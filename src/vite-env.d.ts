/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK_API?: string;
  readonly VITE_N8N_BASE_URL?: string;
  readonly VITE_N8N_CAMPAIGN_WEBHOOK?: string;
  readonly VITE_N8N_RECOMMENDATIONS_WEBHOOK?: string;
  readonly VITE_N8N_OUTREACH_WEBHOOK?: string;
  readonly VITE_N8N_APPROVAL_WEBHOOK?: string;
  readonly VITE_N8N_PERFORMANCE_WEBHOOK?: string;
  readonly VITE_N8N_MEMORY_WEBHOOK?: string;
  readonly VITE_N8N_CREATOR_CONTACT_WEBHOOK?: string;
  readonly VITE_N8N_CREATOR_CHATBOX_URL?: string;
  readonly VITE_N8N_CHAT_WEBHOOK?: string;
  readonly VITE_CHAT_WEBHOOK_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
