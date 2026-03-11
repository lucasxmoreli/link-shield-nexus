export const mockCampaigns = [
  { id: '1', hash: 'aB3kL9mNpQ', name: 'TikTok BR - Nutra Offer', traffic_source: 'tiktok' as const, safe_url: 'https://blog.example.com/health', offer_url: 'https://offer.example.com/nutra1', is_active: true, created_at: '2025-03-01T10:00:00Z', domain: 'track.mysite.com' },
  { id: '2', hash: 'xY7wR2tFhJ', name: 'Facebook US - Finance', traffic_source: 'facebook' as const, safe_url: 'https://blog.example.com/finance', offer_url: 'https://offer.example.com/fin1', is_active: true, created_at: '2025-03-03T14:30:00Z', domain: 'go.campaigns.io' },
  { id: '3', hash: 'pQ4sD8gKlM', name: 'Google BR - E-commerce', traffic_source: 'google' as const, safe_url: 'https://store.example.com', offer_url: 'https://offer.example.com/ecom1', is_active: false, created_at: '2025-03-05T09:15:00Z', domain: 'track.mysite.com' },
  { id: '4', hash: 'vN6bC1eWzX', name: 'TikTok US - Sweepstakes', traffic_source: 'tiktok' as const, safe_url: 'https://blog.example.com/win', offer_url: 'https://offer.example.com/sweep1', is_active: true, created_at: '2025-03-07T16:45:00Z', domain: 'go.campaigns.io' },
];

export const mockDomains = [
  { id: '1', url: 'track.mysite.com', is_verified: true, created_at: '2025-02-15T08:00:00Z' },
  { id: '2', url: 'go.campaigns.io', is_verified: true, created_at: '2025-02-20T12:00:00Z' },
  { id: '3', url: 'link.newdomain.xyz', is_verified: false, created_at: '2025-03-08T10:00:00Z' },
];

export const mockRequestsLog = [
  { id: '1', campaign_name: 'TikTok BR - Nutra Offer', hash: 'aB3kL9mNpQ', ip_address: '189.45.123.67', country_code: 'BR', device_type: 'mobile' as const, user_agent: 'Mozilla/5.0 (iPhone; CPU...)', action_taken: 'offer_page' as const, created_at: '2025-03-10T18:32:00Z' },
  { id: '2', campaign_name: 'Facebook US - Finance', hash: 'xY7wR2tFhJ', ip_address: '34.120.55.12', country_code: 'US', device_type: 'desktop' as const, user_agent: 'facebookexternalhit/1.1', action_taken: 'bot_blocked' as const, created_at: '2025-03-10T18:30:00Z' },
  { id: '3', campaign_name: 'TikTok BR - Nutra Offer', hash: 'aB3kL9mNpQ', ip_address: '177.88.201.44', country_code: 'BR', device_type: 'mobile' as const, user_agent: 'Mozilla/5.0 (Linux; Android...)', action_taken: 'offer_page' as const, created_at: '2025-03-10T18:28:00Z' },
  { id: '4', campaign_name: 'Google BR - E-commerce', hash: 'pQ4sD8gKlM', ip_address: '52.14.99.203', country_code: 'US', device_type: 'desktop' as const, user_agent: 'Googlebot/2.1', action_taken: 'bot_blocked' as const, created_at: '2025-03-10T18:25:00Z' },
  { id: '5', campaign_name: 'TikTok US - Sweepstakes', hash: 'vN6bC1eWzX', ip_address: '72.134.56.78', country_code: 'US', device_type: 'mobile' as const, user_agent: 'Mozilla/5.0 (iPhone; CPU...)', action_taken: 'safe_page' as const, created_at: '2025-03-10T18:20:00Z' },
  { id: '6', campaign_name: 'Facebook US - Finance', hash: 'xY7wR2tFhJ', ip_address: '191.32.100.5', country_code: 'BR', device_type: 'mobile' as const, user_agent: 'Mozilla/5.0 (Linux; Android...)', action_taken: 'offer_page' as const, created_at: '2025-03-10T18:15:00Z' },
  { id: '7', campaign_name: 'TikTok BR - Nutra Offer', hash: 'aB3kL9mNpQ', ip_address: '10.0.0.1', country_code: 'DE', device_type: 'desktop' as const, user_agent: 'Bytespider', action_taken: 'bot_blocked' as const, created_at: '2025-03-10T18:10:00Z' },
  { id: '8', campaign_name: 'Google BR - E-commerce', hash: 'pQ4sD8gKlM', ip_address: '200.45.67.89', country_code: 'BR', device_type: 'mobile' as const, user_agent: 'Mozilla/5.0 (Linux; Android...)', action_taken: 'offer_page' as const, created_at: '2025-03-10T18:05:00Z' },
];

export const mockChartData = [
  { day: 'Seg', offer_page: 120, bot_blocked: 45 },
  { day: 'Ter', offer_page: 185, bot_blocked: 62 },
  { day: 'Qua', offer_page: 210, bot_blocked: 38 },
  { day: 'Qui', offer_page: 165, bot_blocked: 71 },
  { day: 'Sex', offer_page: 290, bot_blocked: 55 },
  { day: 'Sáb', offer_page: 340, bot_blocked: 89 },
  { day: 'Dom', offer_page: 195, bot_blocked: 42 },
];

export const mockProfile = {
  email: 'gestor@trafficpro.com',
  plan_name: 'Pro',
  max_clicks: 100000,
  current_clicks: 34520,
  subscription_status: 'active',
};

export const mockStats = {
  total_requests: 1505,
  safe_page: 402,
  offer_page: 965,
  bot_blocked: 138,
};
