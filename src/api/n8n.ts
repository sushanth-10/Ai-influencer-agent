import type {
  CampaignBrief,
  CampaignRequest,
  CampaignResponse,
  CreatorContactResult,
  CreatorRecommendation,
  DashboardData,
  MemoryInsight,
  SelectedCreator,
} from './types';

const env = import.meta.env;
export const isMockMode = env.VITE_USE_MOCK_API === 'true';

const config = {
  campaign: env.VITE_N8N_CAMPAIGN_WEBHOOK,
  recommendations: env.VITE_N8N_RECOMMENDATIONS_WEBHOOK,
  memory: env.VITE_N8N_MEMORY_WEBHOOK,
  outreach: env.VITE_N8N_OUTREACH_WEBHOOK,
  creatorContact: env.VITE_N8N_CREATOR_CONTACT_WEBHOOK_URL,
  chat:
    env.VITE_N8N_CHAT_WEBHOOK ||
    env.VITE_CHAT_WEBHOOK_URL ||
    env.VITE_N8N_CREATOR_CHATBOX_URL,
};

const errorMessages: Record<number, string> = {
  400: 'Campaign details are incomplete.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have access to this campaign.',
  404: 'No suitable creators were found.',
  408: 'The request took too long. Please try again.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Campaign intelligence is temporarily unavailable.',
  502: 'The campaign service is temporarily unavailable.',
  503: 'The campaign service is temporarily unavailable.',
};

export class N8nApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'N8nApiError';
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return undefined;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0
  );
}

function isDemoEmail(email: string): boolean {
  return email.toLowerCase().includes('demo.campaignmind.local');
}

function asEmail(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const email = value.trim();
  if (!email || isDemoEmail(email)) {
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }
  return email;
}

function isN8nItem(value: unknown): value is { json: Record<string, unknown> } {
  return isRecord(value) && isRecord(value.json);
}

function tryParseJson(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const candidates = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    candidates.push(fence[1].trim());
  }

  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(trimmed.slice(objectStart, objectEnd + 1));
  }

  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    candidates.push(trimmed.slice(arrayStart, arrayEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      continue;
    }
  }

  return undefined;
}

function unwrapPayload(data: unknown): unknown {
  let current = data;

  for (let i = 0; i < 8; i += 1) {
    if (Array.isArray(current) && current.length === 1) {
      current = current[0];
      continue;
    }

    if (
      isN8nItem(current) &&
      !Array.isArray((current as Record<string, unknown>).recommendations)
    ) {
      current = current.json;
      continue;
    }

    if (typeof current === 'string') {
      const parsed = tryParseJson(current);
      if (parsed !== undefined) {
        current = parsed;
        continue;
      }
    }

    if (isRecord(current)) {
      const nested =
        current.data ?? current.body ?? current.payload ?? current.result;
      if (nested && nested !== current && (isRecord(nested) || Array.isArray(nested))) {
        if (
          current.recommendations === undefined &&
          current.campaign_id === undefined &&
          current.reply === undefined
        ) {
          current = nested;
          continue;
        }
      }
    }

    break;
  }

  return current;
}

function looksLikeCreator(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const name = asString(value.name);
  const id =
    asString(value.creator_id) ||
    asString(value.source_url) ||
    asString(value.profile_url);
  return Boolean(name || id);
}

function collectRecommendationSource(data: unknown): unknown[] {
  const payload = unwrapPayload(data);

  if (Array.isArray(payload)) {
    const unwrapped = payload.map((item) =>
      isN8nItem(item) ? item.json : unwrapPayload(item)
    );

    if (unwrapped.some(looksLikeCreator)) {
      return unwrapped;
    }

    const nested = unwrapped.flatMap((item) => {
      if (isRecord(item) && Array.isArray(item.recommendations)) {
        return item.recommendations;
      }
      return [];
    });
    if (nested.length) {
      return nested;
    }
  }

  if (isRecord(payload)) {
    if (Array.isArray(payload.recommendations)) {
      return payload.recommendations;
    }

    const stringFields = [
      payload.output,
      payload.text,
      payload.reply,
      payload.response,
      payload.message,
    ];

    for (const field of stringFields) {
      if (typeof field !== 'string') continue;
      const parsed = unwrapPayload(tryParseJson(field));
      if (isRecord(parsed) && Array.isArray(parsed.recommendations)) {
        return parsed.recommendations;
      }
      if (Array.isArray(parsed) && parsed.some(looksLikeCreator)) {
        return parsed;
      }
    }
  }

  return [];
}

function isBrokenWebhookEnvelope(data: unknown): boolean {
  const payload = unwrapPayload(data);
  if (!isRecord(payload)) return false;

  const keys = Object.keys(payload);
  const reply = payload.reply;
  const malformedReply =
    typeof reply === 'string' &&
    (reply.trim() === '=' ||
      /^=\s*\[object Object\]$/i.test(reply.trim()) ||
      /^=\s*\{\s*\[object Object\]/i.test(reply.trim()));
  return (
    keys.length <= 2 &&
    keys.includes('reply') &&
    (malformedReply || reply === '' || reply === null || reply === undefined)
  );
}

function campaignSearchQuery(campaign: CampaignRequest): string {
  return [
    campaign.product,
    campaign.category,
    campaign.target_audience,
    campaign.location,
    campaign.platform || 'Instagram',
    campaign.goal,
    campaign.description,
  ]
    .filter((part) => typeof part === 'string' && part.trim())
    .join(' ');
}

function creatorProfileUrl(raw: Record<string, unknown>, fallbackId?: string): string {
  return (
    asString(raw.source_url) ||
    asString(raw.profile_url) ||
    asString(raw.creator_id) ||
    fallbackId ||
    ''
  );
}

export function toCampaignBrief(campaign: CampaignRequest): CampaignBrief {
  return {
    product_name: campaign.product,
    category: campaign.category,
    target_audience: campaign.target_audience,
    location: campaign.location,
    budget: String(campaign.budget ?? ''),
    goal: campaign.goal,
    preferred_platform: campaign.platform || 'Instagram',
  };
}

export function toSelectedCreator(
  creator: CreatorRecommendation | SelectedCreator
): SelectedCreator {
  const sourceUrl =
    creator.source_url ||
    ('profile_url' in creator ? creator.profile_url : undefined) ||
    creator.creator_id;

  return {
    creator_id: sourceUrl,
    name: creator.name,
    platform: creator.platform,
    source_url: sourceUrl,
    followers: creator.followers ?? null,
    engagement_rate: creator.engagement_rate ?? null,
    location: creator.location ?? null,
    estimated_price:
      'estimated_price' in creator ? creator.estimated_price ?? null : null,
    match_score: creator.match_score,
    reasons: creator.reasons ?? [],
    contact: 'contact' in creator ? creator.contact ?? null : null,
    contactStatus: 'contactStatus' in creator ? creator.contactStatus : 'idle',
    contactError: 'contactError' in creator ? creator.contactError ?? null : null,
  };
}

function normalizeRecommendation(raw: unknown): CreatorRecommendation | null {
  const record = isN8nItem(raw) ? raw.json : unwrapPayload(raw);
  if (!isRecord(record)) {
    return null;
  }

  const name = asString(record.name);
  if (!name) {
    return null;
  }

  const sourceUrl = creatorProfileUrl(record, name);
  const platform = asString(record.platform) || 'Instagram';
  const matchScore = asNullableNumber(record.match_score);

  return {
    creator_id: sourceUrl || name,
    name,
    platform,
    profile_url: asString(record.profile_url) || sourceUrl || null,
    source_url: sourceUrl || null,
    followers: asNullableNumber(record.followers),
    engagement_rate: asNullableNumber(record.engagement_rate),
    location: asString(record.location) ?? null,
    category: asString(record.category) ?? null,
    estimated_price: asNullableNumber(record.estimated_price),
    match_score: matchScore,
    reasons: asStringArray(record.reasons),
    historical_evidence: asStringArray(record.historical_evidence),
    data_status:
      record.data_status === 'verified' ||
      record.data_status === 'estimated' ||
      record.data_status === 'mock' ||
      record.data_status === 'unavailable'
        ? record.data_status
        : undefined,
    email: asEmail(record.email),
  };
}

function normalizeCampaignResponse(data: unknown): CampaignResponse {
  if (isBrokenWebhookEnvelope(data)) {
    throw new N8nApiError(
      'Creator matching finished in n8n, but Respond to Webhook returned an invalid reply wrapper instead of the creator list. In ERAYA - Influencer Matching, set the JSON response body to ={{ JSON.stringify($json) }} and publish the workflow. Do not wrap the creator object in a reply string.',
      502
    );
  }

  const payload = unwrapPayload(data);
  const record = isRecord(payload) ? payload : {};
  const recommendations = collectRecommendationSource(data)
    .map(normalizeRecommendation)
    .filter((item): item is CreatorRecommendation => item !== null);

  let memoryRecord = isRecord(record.memory) ? record.memory : undefined;
  if (!memoryRecord && Array.isArray(record.memories)) {
    memoryRecord = { found: record.memories.length > 0, insights: record.memories };
  }

  return {
    campaign_id:
      asString(record.campaign_id) || `campaign-${Date.now()}`,
    recommendations,
    memory: memoryRecord
      ? {
          found: Boolean(memoryRecord.found ?? true),
          insights: Array.isArray(memoryRecord.insights)
            ? (memoryRecord.insights as MemoryInsight[])
            : [],
        }
      : undefined,
  };
}

function pickContactFromUnknown(data: unknown): CreatorContactResult {
  const payload = unwrapPayload(data);
  const record = isRecord(payload) ? payload : {};

  const nestedContact = isRecord(record.contact) ? record.contact : null;
  const firstContact = Array.isArray(record.contacts)
    ? record.contacts.find((item) => isRecord(item))
    : undefined;
  const contactRecord = nestedContact || (isRecord(firstContact) ? firstContact : record);

  const email =
    asEmail(contactRecord.email) ||
    asEmail(contactRecord.contact_email) ||
    asEmail(contactRecord.business_email) ||
    asEmail(record.email);

  const foundFlag =
    record.found === true ||
    record.email_found === true ||
    record.status === 'found';

  const notFoundFlag =
    record.found === false ||
    record.email_found === false ||
    record.status === 'not_found' ||
    record.status === 'no_email';

  if (email) {
    return {
      found: true,
      contact: {
        email,
        sourceUrl:
          asString(contactRecord.sourceUrl) ||
          asString(contactRecord.source_url) ||
          asString(record.source_url) ||
          null,
        sourceType:
          asString(contactRecord.sourceType) ||
          asString(contactRecord.source_type) ||
          asString(record.source_type) ||
          null,
      },
      message: asString(record.message),
    };
  }

  if (foundFlag && !email) {
    return {
      found: false,
      contact: null,
      message: 'No public business email found.',
    };
  }

  if (notFoundFlag || record.success === true) {
    return {
      found: false,
      contact: null,
      message: asString(record.message) || 'No public business email found.',
    };
  }

  return {
    found: false,
    contact: null,
    message: asString(record.message) || 'No public business email found.',
  };
}

function isOutreachSuccess(data: unknown): boolean {
  if (!isRecord(data)) {
    return false;
  }

  if (data.success === false || data.ok === false) {
    return false;
  }

  const status = asString(data.status)?.toLowerCase();
  if (status === 'error' || status === 'failed' || status === 'failure') {
    return false;
  }

  if (typeof data.error === 'string' && data.error.trim()) {
    return false;
  }

  if (data.success === true || data.ok === true) {
    return true;
  }

  const successStatus = asString(data.status)?.toLowerCase();
  if (
    successStatus === 'sent' ||
    successStatus === 'success' ||
    successStatus === 'succeeded'
  ) {
    return true;
  }

  const message = asString(data.message)?.toLowerCase() || '';
  return /email|message/.test(message) && /sent|success|delivered/.test(message);
}

async function post<TResponse>(
  url: string | undefined,
  payload: unknown,
  timeoutMs = 180_000
): Promise<TResponse> {
  if (!url) {
    throw new N8nApiError('The n8n webhook is not configured yet.');
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed: unknown = {};

    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = { raw: text };
      }
    }

    if (!response.ok) {
      throw new N8nApiError(
        errorMessages[response.status] ?? 'Something went wrong. Please try again.',
        response.status
      );
    }

    return parsed as TResponse;
  } catch (error) {
    if (error instanceof N8nApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new N8nApiError(errorMessages[408], 408);
    }
    throw new N8nApiError(
      'We could not reach CampaignMind. Check your connection and try again.'
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function createCampaign(payload: CampaignRequest): Promise<CampaignResponse> {
  const query = campaignSearchQuery(payload);
  const data = await post<unknown>(
    config.campaign,
    {
      ...payload,
      query,
      chatInput: query,
      message: query,
      sessionId: payload.product
        ? `campaign-${payload.product}-${payload.location}`
        : undefined,
    },
    180_000
  );
  return normalizeCampaignResponse(data);
}

export async function fetchRecommendations(campaignId: string): Promise<CampaignResponse> {
  const data = await post<unknown>(config.recommendations, { campaign_id: campaignId });
  return normalizeCampaignResponse(data);
}

export async function findCreatorContact(
  creator: SelectedCreator,
  campaign: CampaignRequest | CampaignBrief
): Promise<CreatorContactResult> {
  const brief: CampaignBrief =
    'product_name' in campaign ? campaign : toCampaignBrief(campaign);

  try {
    const data = await post<unknown>(
      config.creatorContact,
      {
        creator: {
          creator_id: creator.creator_id,
          name: creator.name,
          platform: creator.platform,
          source_url: creator.source_url,
          followers: creator.followers ?? null,
          location: creator.location ?? null,
        },
        campaign: brief,
      },
      90_000
    );

    const payload = unwrapPayload(data);

    if (isRecord(payload)) {
      const errorText = asString(payload.error);
      if (errorText && !/not found|no email|no public/i.test(errorText)) {
        throw new N8nApiError(errorText, 502);
      }
    }

    return pickContactFromUnknown(data);
  } catch (error) {
    if (error instanceof N8nApiError) {
      if (error.status === 408) throw error;
      if (error.message === 'The n8n webhook is not configured yet.') {
        throw new N8nApiError(
          'Creator contact discovery is not configured yet.',
          error.status
        );
      }
      throw new N8nApiError(
        'Contact search failed. Please try again.',
        error.status
      );
    }
    throw new N8nApiError('Contact search failed. Please try again.');
  }
}

export interface OutreachRequest {
  campaign_id?: string;
  creator_id: string;
  creator_name: string;
  creator_email: string;
  subject: string;
  body: string;
}

export interface OutreachResponse {
  success: boolean;
  message?: string;
  status?: string;
}

export async function sendOutreach(
  payload: OutreachRequest
): Promise<OutreachResponse> {
  if (!payload.creator_email || isDemoEmail(payload.creator_email)) {
    throw new N8nApiError(
      'Outreach requires a discovered public business email.',
      400
    );
  }

  const data = await post<unknown>(config.outreach, {
    ...payload,
    to: payload.creator_email,
  });

  if (!isOutreachSuccess(data)) {
    const record = isRecord(data) ? data : {};
    throw new N8nApiError(
      asString(record.message) || asString(record.error) || 'Email failed to send.',
      502
    );
  }

  const record = isRecord(data) ? data : {};

  return {
    success: true,
    status: asString(record.status) || 'sent',
    message: asString(record.message) || 'Email sent',
  };
}

export async function getCampaignMemory(campaignId: string): Promise<MemoryInsight[]> {
  if (isMockMode) return [];
  return post<MemoryInsight[]>(config.memory, { campaign_id: campaignId });
}

export async function getDashboardData(): Promise<DashboardData> {
  return {
    total_campaigns: 12,
    active_campaigns: 3,
    creators_contacted: 48,
    average_engagement: 7.8,
    conversions: 216,
    latest_learning: {
      id: 'demo-learning',
      label: 'LATEST CAMPAIGN LEARNING',
      statement: 'Hyderabad fitness micro-creators generated stronger engagement for this brand.',
      source_campaign: 'Campaign #1',
      status: 'retained',
    },
    recent_campaigns: [
      { campaign_id: 'campaign-12', name: 'Summer Hydration', product: 'Electrolyte Mix', location: 'Hyderabad', budget: 50000, status: 'Active', creators_count: 8, created_at: '2026-09-18', memory_status: 'recalled' },
      { campaign_id: 'campaign-11', name: 'Everyday Strength', product: 'Protein Powder', location: 'Hyderabad', budget: 20000, status: 'Completed', creators_count: 5, created_at: '2026-08-21', memory_status: 'retained' },
    ],
  };
}

export interface ChatResponse {
  reply: string;
  memories?: string[];
  suggestions?: string[];
}

function pickChatText(
  payload: Record<string, unknown>,
  inputMessage: string,
  depth = 0
): string | undefined {
  if (depth > 5) return undefined;

  const accept = (value: unknown) => {
    const text = asString(value);
    return text && text !== '=' && text !== inputMessage.trim()
      ? text
      : undefined;
  };

  const direct = accept(payload.reply) || accept(payload.response);
  if (direct) return direct;

  // AI Agent nodes commonly return `output` alongside the original `message`.
  // Parse structured output before considering text fields that may echo input.
  for (const candidate of [payload.output, payload.text]) {
    if (isRecord(candidate)) {
      const nested = pickChatText(candidate, inputMessage, depth + 1);
      if (nested) return nested;
      continue;
    }
    if (typeof candidate === 'string') {
      const parsed = tryParseJson(candidate);
      if (isRecord(parsed)) {
        const nested = pickChatText(parsed, inputMessage, depth + 1);
        if (nested) return nested;
      }
      const text = accept(candidate);
      if (text) return text;
    }
  }

  return accept(payload.message);
}

function pickChatMemories(payload: Record<string, unknown>): string[] {
  const rawMemories = Array.isArray(payload.memories)
    ? payload.memories
    : Array.isArray(payload.memory)
      ? payload.memory
      : Array.isArray(payload.recalled)
        ? payload.recalled
        : Array.isArray(payload.results)
          ? payload.results
          : [];

  return rawMemories
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (isRecord(item)) {
        return (
          asString(item.text) ||
          asString(item.statement) ||
          asString(item.content) ||
          asString(item.memory) ||
          asString(item.query) ||
          ''
        );
      }
      return '';
    })
    .filter(Boolean);
}

function normalizeChatResponse(data: unknown, inputMessage: string): ChatResponse {
  const payload = unwrapPayload(data);

  if (typeof payload === 'string') {
    const parsed = tryParseJson(payload);
    if (parsed !== undefined) {
      return normalizeChatResponse(parsed, inputMessage);
    }
    if (payload.trim() && payload.trim() !== inputMessage.trim()) {
      return { reply: payload };
    }
    throw new N8nApiError(
      'The chatbot workflow returned the user message without an assistant reply. Check the AI Agent output and Respond to Webhook response mapping.',
      502
    );
  }

  if (isRecord(payload)) {
    const reply = pickChatText(payload, inputMessage);
    if (!reply) {
      throw new N8nApiError(
        'The chatbot workflow returned no assistant reply. Check that the Hindsight node preserves the chat input and the Respond to Webhook node returns the AI Agent output.',
        502
      );
    }
    const memories = pickChatMemories(payload);
    const suggestions = Array.isArray(payload.suggestions)
      ? payload.suggestions.filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0
        )
      : [];

    return {
      reply,
      memories: memories.length ? memories : undefined,
      suggestions: suggestions.length ? suggestions : undefined,
    };
  }

  throw new N8nApiError(
    'The chatbot workflow returned an unsupported response. Return JSON with a reply, response, output, or text field.',
    502
  );
}

export async function sendChatMessage(
  message: string,
  conversationId: string,
  campaign?: CampaignRequest | null
): Promise<ChatResponse> {
  const query = campaign
    ? `${message} Campaign context: ${campaignSearchQuery(campaign)}.`
    : message;

  const data = await post<unknown>(
    config.chat,
    {
      message,
      chatInput: message,
      query,
      text: message,
      sessionId: conversationId,
      conversation_id: conversationId,
      campaign: campaign ?? null,
    },
    180_000
  );

  return normalizeChatResponse(data, message);
}
