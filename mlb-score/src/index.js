const SCHEDULE_URL = 'https://statsapi.mlb.com/api/v1/schedule';
const DEFAULT_TIMEOUT = 20_000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      'Cache-Control': 'no-store',
      ...(init.headers ?? {}),
    },
  });
}

function getDefaultDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function fetchWithTimeout(resource, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`請求逾時（${DEFAULT_TIMEOUT / 1000} 秒）`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGames(targetDate) {
  const params = new URLSearchParams({
    sportId: '1',
    date: targetDate,
    hydrate: 'venue,team,linescore',
  });
  const response = await fetchWithTimeout(`${SCHEDULE_URL}?${params}`, {
    headers: {
      'User-Agent': 'mlb-score-worker/1.0',
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`MLB API returned ${response.status}`);

  const payload = await response.json();
  return (payload.dates ?? []).flatMap((scheduleDate) => scheduleDate.games ?? []);
}

function teamName(game, side) {
  return String(game.teams?.[side]?.team?.name ?? '');
}

function teamScore(game, side) {
  const score = game.teams?.[side]?.score;
  return score === null || score === undefined ? '-' : String(score);
}

function gameTime(game) {
  const parsedTime = new Date(String(game.gameDate ?? ''));
  if (Number.isNaN(parsedTime.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(parsedTime);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second} Taipei`;
}

function inningStatus(game) {
  const gameStatus = game.status?.abstractGameState;
  if (gameStatus === 'Preview') return 'Not started';
  if (gameStatus === 'Final') return 'Final';

  const linescore = game.linescore ?? {};
  if (!linescore.currentInningOrdinal) return 'Unknown';
  return `${linescore.currentInningOrdinal} ${linescore.isTopInning ? 'Top' : 'Bottom'}`;
}

function simplifyGame(game) {
  const status = game.status ?? {};
  return {
    gameNumber: String(game.gamePk ?? ''),
    time: gameTime(game),
    awayTeam: teamName(game, 'away'),
    homeTeam: teamName(game, 'home'),
    awayScore: teamScore(game, 'away'),
    homeScore: teamScore(game, 'home'),
    venue: String(game.venue?.name ?? ''),
    inning: inningStatus(game),
    status: String(status.detailedState ?? status.abstractGameState ?? 'Unknown'),
  };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
    if (request.method !== 'GET') return json({ error: '只支援 GET 請求' }, { status: 405 });

    const url = new URL(request.url);
    const date = url.searchParams.get('date') || getDefaultDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json({ error: 'date 必須是 YYYY-MM-DD 格式' }, { status: 400 });
    }

    try {
      const games = (await fetchGames(date)).map(simplifyGame);
      return json({ date, count: games.length, games });
    } catch (error) {
      console.error(error);
      return json({ error: '無法取得 MLB 賽況', detail: error.message }, { status: 502 });
    }
  },
};