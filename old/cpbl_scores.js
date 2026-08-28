/**
 * 抓取中華職棒大聯盟（CPBL）賽程與比賽比分。
 *
 * 使用方式：
 *   node cpbl_scores.js
 *   node cpbl_scores.js --date 2026-08-26
 *   node cpbl_scores.js --json
 *
 * 資料來源：CPBL 官方賽程頁面的 getgamedatas API。
 */

const BASE_URL = "https://www.cpbl.com.tw";
const SCHEDULE_URL = `${BASE_URL}/schedule`;
const GAME_DATA_URL = `${BASE_URL}/schedule/getgamedatas/`;
const DEFAULT_TIMEOUT = 20_000;

function getDefaultDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function request(url, options = {}, cookies = new Map(), redirects = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const headers = new Headers(options.headers);
    if (cookies.size > 0) {
      headers.set(
        "Cookie",
        [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      );
    }
    const response = await fetch(url, {
      ...options,
      headers,
      redirect: "manual",
      signal: controller.signal,
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const [cookie] = setCookie.split(";", 1);
      const separator = cookie.indexOf("=");
      if (separator > 0) {
        cookies.set(cookie.slice(0, separator), cookie.slice(separator + 1));
      }
    }
    if (response.status >= 300 && response.status < 400) {
      if (redirects >= 5) {
        throw new Error("重導向次數超過上限");
      }
      const location = response.headers.get("location");
      if (!location) throw new Error(`HTTP ${response.status} 缺少重導向位置`);
      return request(new URL(location, url), options, cookies, redirects + 1);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response;
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

async function getVerificationToken(cookies) {
  const response = await request(SCHEDULE_URL, {
    headers: {
      "User-Agent": "cpbl-scores/1.0 (+https://www.cpbl.com.tw/)",
      Accept: "application/json, text/javascript, */*; q=0.01",
    },
  }, cookies);
  const html = await response.text();
  const endpointStart = html.indexOf("/schedule/getgamedatas");
  if (endpointStart === -1) {
    throw new Error("找不到官方 API 驗證 token，可能是網站格式已變更。");
  }

  const endpointBlock = html.slice(endpointStart, endpointStart + 5000);
  const match = endpointBlock.match(/RequestVerificationToken:\s*["']([^"']+)["']/);
  if (!match) {
    throw new Error("官方 API 驗證 token 格式無法解析。");
  }
  return match[1];
}

async function fetchGames(targetDate, location = "", kindCode = "A") {
  const cookies = new Map();
  const token = await getVerificationToken(cookies);
  const body = new URLSearchParams({
    calendar: `${targetDate.slice(0, 4)}/01/01`,
    location,
    kindCode,
  }, cookies);
  const response = await request(GAME_DATA_URL, {
    method: "POST",
    body,
    headers: {
      "User-Agent": "cpbl-scores/1.0 (+https://www.cpbl.com.tw/)",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      RequestVerificationToken: token,
      Referer: SCHEDULE_URL,
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  const payload = await response.json();

  if (!payload?.Success) {
    throw new Error(`CPBL API 回傳失敗：${JSON.stringify(payload)}`);
  }

  const games = typeof payload.GameDatas === "string"
    ? JSON.parse(payload.GameDatas)
    : payload.GameDatas ?? [];
  if (!Array.isArray(games)) {
    throw new Error("CPBL API 回傳的比賽資料格式無效。");
  }
  return games.filter((game) => String(game.GameDate ?? "").startsWith(targetDate));
}

function value(game, ...names) {
  let defaultValue = "";
  if (names.at(-1)?.default !== undefined) {
    defaultValue = names.pop().default;
  }
  for (const name of names) {
    const item = game[name];
    if (item !== null && item !== undefined && String(item).trim()) {
      return String(item).trim();
    }
  }
  return defaultValue;
}

function simplifyGame(game) {
  const result = value(game, "GameResult");
  let status = {
    "": "未開賽／進行中",
    "0": "已結束",
    "1": "延賽",
    "2": "保留",
    "4": "取消",
  }[result] ?? `未知狀態（${result}）`;

  if (result === "" && value(game, "GameDateTimeE")) status = "已結束";
  if (result === "" && value(game, "IsPlayBall") === "N") status = "未開賽";
  if (result === "" && value(game, "IsPlayBall") === "Y") status = "進行中";

  return {
    比賽編號: value(game, "GameSno", "GameNo"),
    時間: value(game, "PreExeDate", "GameDateTimeS"),
    客隊: value(game, "VisitingTeamName", "VisitingTeam"),
    主隊: value(game, "HomeTeamName", "HomeTeam"),
    客隊比分: value(game, "VisitingScore", "VisitingTeamScore", { default: "-" }),
    主隊比分: value(game, "HomeScore", "HomeTeamScore", { default: "-" }),
    球場: value(game, "FieldAbbe", "FieldName"),
    狀態: status,
  };
}

function parseArgs(argv) {
  const args = {
    date: getDefaultDate(),
    location: "",
    kindCode: "A",
    json: false,
  };
  const optionNames = new Map([
    ["--date", "date"],
    ["--location", "location"],
    ["--kind-code", "kindCode"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      args.json = true;
      continue;
    }
    const [name, inlineValue] = argument.split("=", 2);
    const option = optionNames.get(name);
    if (option) {
      const value = inlineValue ?? argv[++index];
      if (value === undefined) throw new Error(`${name} 需要一個值`);
      args[option] = value;
      continue;
    }
    throw new Error(`未知參數：${argument}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const games = await fetchGames(args.date, args.location, args.kindCode);
  const output = games.map(simplifyGame);

  if (args.json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(`CPBL ${args.date} 比賽：${output.length} 場`);
  if (output.length === 0) {
    console.log("當天沒有比賽資料。");
    return;
  }
  for (const game of output) {
    console.log(
      `${game.時間} | ${game.客隊} ${game.客隊比分} - `
      + `${game.主隊} ${game.主隊比分} | ${game.狀態} | ${game.球場}`,
    );
  }
}

main().catch((error) => {
  console.error(`抓取失敗：${error.message}`);
  process.exitCode = 1;
});
