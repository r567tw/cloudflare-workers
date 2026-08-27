const CPBL_API_URL = 'https://project.r567tw.cc/api/cpbl';
const DEFAULT_TIMEOUT_MS = 10_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      ...corsHeaders,
      'Cache-Control': 'no-store',
      ...(init.headers || {})
    }
  });
}

async function fetchWithTimeout(resource, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGames(date, location, kindCode) {
  const params = new URLSearchParams({ date, location, kindCode });
  const response = await fetchWithTimeout(`${CPBL_API_URL}?${params}`);
  if (!response.ok) throw new Error(`CPBL API returned ${response.status}`);

  const payload = await response.json();
  if (!payload.success || !Array.isArray(payload.data)) {
    throw new Error('CPBL API 回傳資料格式無效');
  }
  return payload.data;
}

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`));
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    if (request.method !== 'GET') return json({ error: '只支援 GET 請求' }, { status: 405 });

    const url = new URL(request.url);
    const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const location = url.searchParams.get('location') || '';
    const kindCode = url.searchParams.get('kindCode') || 'A';
    if (!isValidDate(date)) {
      return json({ error: 'date 必須是 YYYY-MM-DD 格式' }, { status: 400 });
    }

    try {
      const games = await fetchGames(date, location, kindCode);
      return json({ date, location, kindCode, count: games.length, games });
    } catch (error) {
      console.error(error);
      return json({ error: '無法取得 CPBL 賽況', detail: error.message }, { status: 502 });
    }
  }
};
