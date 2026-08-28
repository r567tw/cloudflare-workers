/**
 * 抓取 MLB 賽程與比賽比分。
 *
 * 使用方式：
 *   node mlb_scores.js
 *   node mlb_scores.js --date 2026-08-26
 *   node mlb_scores.js --json
 *
 * 資料來源：MLB Stats API（公開使用，不需要 API key）。
 */

const SCHEDULE_URL = "https://statsapi.mlb.com/api/v1/schedule";
const DEFAULT_TIMEOUT = 20_000;

function getDefaultDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function fetchGames(targetDate) {
  const params = new URLSearchParams({
    sportId: "1",
    date: targetDate,
    hydrate: "venue,team,linescore",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const response = await fetch(`${SCHEDULE_URL}?${params}`, {
      headers: { "User-Agent": "mlb-scores/1.0" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const payload = await response.json();
    return (payload.dates ?? []).flatMap((scheduleDate) => scheduleDate.games ?? []);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`請求逾時（${DEFAULT_TIMEOUT / 1000} 秒）`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function teamName(game, side) {
  return String(game.teams?.[side]?.team?.name ?? "");
}

function teamScore(game, side) {
  const score = game.teams?.[side]?.score;
  return score === null || score === undefined ? "-" : String(score);
}

function gameTime(game) {
  const rawTime = String(game.gameDate ?? "");
  if (!rawTime) return "";

  const parsedTime = new Date(rawTime);
  if (Number.isNaN(parsedTime.getTime())) {
    throw new Error(`無效的比賽時間：${rawTime}`);
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsedTime);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second} Taipei`;
}

function inningStatus(game) {
  const gameStatus = game.status?.abstractGameState;
  if (gameStatus === "Preview") return "Not started";
  if (gameStatus === "Final") return "Final";

  const linescore = game.linescore ?? {};
  const ordinal = linescore.currentInningOrdinal;
  if (!ordinal) return "Unknown";
  const half = linescore.isTopInning ? "Top" : "Bottom";
  return `${ordinal} ${half}`;
}

function simplifyGame(game) {
  const status = game.status ?? {};
  return {
    比賽編號: String(game.gamePk ?? ""),
    時間: gameTime(game),
    客隊: teamName(game, "away"),
    主隊: teamName(game, "home"),
    客隊比分: teamScore(game, "away"),
    主隊比分: teamScore(game, "home"),
    球場: String(game.venue?.name ?? ""),
    局數: inningStatus(game),
    狀態: String(status.detailedState ?? status.abstractGameState ?? "未知"),
  };
}

function parseArgs(argv) {
  const args = { date: getDefaultDate(), json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      args.json = true;
      continue;
    }
    const [name, inlineValue] = argument.split("=", 2);
    if (name === "--date") {
      const value = inlineValue ?? argv[++index];
      if (value === undefined) throw new Error("--date 需要一個值");
      args.date = value;
      continue;
    }
    throw new Error(`未知參數：${argument}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const games = await fetchGames(args.date);
  const output = games.map(simplifyGame);

  if (args.json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(`MLB ${args.date} 比賽：${output.length} 場`);
  if (output.length === 0) {
    console.log("當天沒有比賽資料。");
    return;
  }
  for (const game of output) {
    console.log(
      `${game.時間} | ${game.客隊} ${game.客隊比分} - `
      + `${game.主隊} ${game.主隊比分} | ${game.局數} | ${game.狀態} | `
      + `${game.球場}`,
    );
  }
}

main().catch((error) => {
  console.error(`抓取失敗：${error.message}`);
  process.exitCode = 1;
});
