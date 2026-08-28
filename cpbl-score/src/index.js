const CPBL_API_URL = "https://project.r567tw.cc/api/cpbl";
const DEFAULT_TIMEOUT = 10_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}

function getDefaultDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function fetchWithTimeout(resource, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    return await fetch(resource, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`請求逾時（${DEFAULT_TIMEOUT / 1000} 秒）`);
    }
    const cause = error.cause ? ` (${error.cause.message})` : "";
    throw new Error(`${error.message}${cause}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGames(targetDate, location = "", kindCode = "A") {
  const params = new URLSearchParams({ date: targetDate, location, kindCode });
  const response = await fetchWithTimeout(`${CPBL_API_URL}?${params}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; cpbl-score-worker/1.0)",
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`CPBL API returned ${response.status}`);
  }

  const payload = await response.json();
  if (!payload?.success || !Array.isArray(payload.data)) {
    throw new Error("CPBL API 回傳資料格式無效");
  }
  return payload.data;
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== "GET") {
      return json({ error: "只支援 GET 請求" }, { status: 405 });
    }

    const url = new URL(request.url);
    const date = url.searchParams.get("date") || getDefaultDate();
    const location = url.searchParams.get("location") || "";
    const kindCode = url.searchParams.get("kindCode") || "A";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json({ error: "date 必須是 YYYY-MM-DD 格式" }, { status: 400 });
    }

    try {
      const games = await fetchGames(date, location, kindCode);
      return json({ date, location, kindCode, count: games.length, games });
    } catch (error) {
      console.error(error);
      return json({ error: "無法取得 CPBL 賽況", detail: error.message }, { status: 502 });
    }
  },
};

