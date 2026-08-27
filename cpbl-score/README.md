# CPBL Score Worker

查詢中華職棒官方賽程與賽況的 Cloudflare Worker。

## API

```text
GET /?date=2026-08-26&location=&kindCode=A
```

- `date`: 日期，格式為 `YYYY-MM-DD`，省略時使用目前日期。
- `location`: 場地篩選，可省略。
- `kindCode`: 賽事類型，預設為 `A`。

回應包含 `date`、`count` 與 `games`。每場比賽會整理為比賽編號、時間、主客隊、比分、球場與狀態。

## 開發

```bash
npm install
npm test
npm run dev
```

如果本機 proxy 讓 `npm run dev` 查不到官方網站，改用 Cloudflare 遠端 runtime：

```bash
npm run dev:remote
```

第一次使用需要先執行 `npx wrangler login`。啟動後開啟終端顯示的網址，再加上 `?date=2026-08-26`。

部署前請在 `wrangler.toml` 或 Cloudflare Dashboard 設定 Worker 名稱與路由，再執行 `npm run deploy`。
