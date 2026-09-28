export type DataStatus = 'verified' | 'estimated' | 'mock' | 'unavailable';

export interface CampaignRequest {
  product: string;
  description: string;
  category: string;
  target_audience: string;
  target_age?: string;
  target_gender?: string;
  location: string;
  budget: number;
  goal: string;
  platform?: string;
  additional_requirements?: string;
}

export interface CampaignBrief {
  product_name: string;
  category: string;
  target_audience: string;
  location: string;
  budget: string;
  goal: string;
  preferred_platform: string;
}

export interface CampaignSummary {
  campaign_id: string;
  name: string;
  product: string;
  location: string;
  budget: number;
  status: string;
  creators_count: number;
  created_at: string;
  memory_status: 'retained' | 'recalled' | 'unavailable';
}

export interface CreatorContact {
  email: string;
  sourceUrl?: string | null;
  sourceType?: string | null;
}

export type ContactDiscoveryStatus =
  | 'idle'
  | 'found'
  | 'not_found'
  | 'failed';

export interface CreatorRecommendation {
  creator_id: string;
  name: string;
  email?: string | null;
  profile_image_url?: string;
  outreach_status?:
    | 'not_contacted'
    | 'draft'
    | 'sent'
    | 'replied'
    | 'accepted'
    | 'negotiating'
    | 'declined';
  response_text?: string;
  response_summary?: string;
  response_at?: string;
  platform: string;
  profile_url?: string | null;
  source_url?: string | null;
  followers?: number | null;
  engagement_rate?: number | null;
  location?: string | null;
  category?: string | null;
  estimated_price?: number | null;
  match_score: number | null;
  reasons: string[];
  historical_evidence?: string[];
  data_status?: DataStatus;
}

export interface SelectedCreator {
  creator_id: string;
  name: string;
  platform: string;
  source_url: string;
  followers?: number | null;
  engagement_rate?: number | null;
  location?: string | null;
  estimated_price?: number | null;
  match_score: number | null;
  reasons: string[];
  contact?: CreatorContact | null;
  contactStatus?: ContactDiscoveryStatus;
  contactError?: string | null;
}

export interface MemoryInsight {
  id: string;
  label: string;
  statement: string;
  source_campaign?: string;
  status: 'recalled' | 'retained';
}

export interface CampaignResponse {
  campaign_id: string;
  recommendations: CreatorRecommendation[];
  memory?: {
    found: boolean;
    insights: MemoryInsight[];
    before_after?: {
      before: Array<{ creator_id: string; name: string; score: number }>;
      after: Array<{ creator_id: string; name: string; score: number }>;
      explanation: string;
    };
  };
}

export interface DashboardData {
  total_campaigns: number;
  active_campaigns: number;
  creators_contacted: number;
  average_engagement?: number;
  conversions?: number;
  latest_learning?: MemoryInsight;
  recent_campaigns: CampaignSummary[];
}

export interface ApiErrorShape {
  message: string;
  status?: number;
}

export interface CreatorContactResult {
  found: boolean;
  contact: CreatorContact | null;
  message?: string;
}
