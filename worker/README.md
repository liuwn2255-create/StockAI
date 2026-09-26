# StockAI Cloudflare Worker

## v2：第一個真正的公開資料 Adapter

目前加入：

- `GET /health`：健康檢查
- `GET /api/stock-profile?symbol=2330`：取得上市公司基本資料
- `POST /api/research`：股票研究問答骨架

### 資料來源

第一個 adapter 使用 TWSE OpenAPI 的「上市公司基本資料」資料集。政府資料開放平臺資料集 18419 標示為免費，授權為「政府資料開放授權條款-第1版」。

來源：
- https://data.gov.tw/dataset/18419
- https://openapi.twse.com.tw/v1/opendata/t187ap03_L

### 本版刻意不做

- 即時行情
- 20 分鐘延遲行情
- 買賣訊號
- 目標價
- 自動交易

### 部署

1. 安裝 Wrangler
2. 在此資料夾執行 `wrangler login`
3. 執行 `wrangler deploy`
4. 若要接 AI，再用 Cloudflare Secret 儲存 API Key：`wrangler secret put AI_API_KEY`
5. `AI_API_URL`、`AI_MODEL` 可依實際 AI 服務設定
6. 部署完成後，把 Worker HTTPS URL 填入前端 `js/backend-config.js`

不要把 API Key 寫進 GitHub 前端檔案。

## v3：重大訊息 Adapter

新增：

- `GET /api/announcements?symbol=2330`：取得上市公司每日重大訊息公開資料，最多回傳 8 筆
- `POST /api/research`：研究證據增加重大訊息來源

資料來源：TWSE OpenAPI `t187ap04_L`「上市公司每日重大訊息」。原始公告仍回到 MOPS 查閱，不在 StockAI 複製未確認授權的完整公告內容。
