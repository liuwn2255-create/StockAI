# StockAI v2 資料架構

## 核心流程

使用者輸入股票
→ 股票名稱/代號識別
→ 後端搜尋公開資料
→ 資料來源安全檢查
→ 新聞/公告去重
→ AI 閱讀與摘要
→ 顯示摘要 + 日期 + 原始來源
→ 使用者繼續追問

## 四層設計

### 1. UI
index.html / css / js
只負責畫面與互動，不保存 API Key。

### 2. Backend / Worker
正式版建議使用 Cloudflare Worker：
- 隱藏 AI API Key
- 接收股票查詢
- 統一處理搜尋
- 控制請求次數
- 過濾來源
- 傳回結構化 JSON

### 3. Source Adapters
每個資料來源獨立一個 adapter。
例如：
- mopsAdapter
- newsAdapter
- twseAdapter（暫停，直到授權確認）
- governmentDataAdapter

### 4. AI
AI 只接收「已通過來源規則的資料」。
要求：
- 不捏造資料
- 每個重要結論附來源
- 標示資料日期
- 不輸出買進/賣出指令
- 找不到資料時明確說明

## 第一版資料政策

- 即時/延遲行情：暫不接。
- 公司公告/財務資料：優先研究 MOPS。
- 新聞：優先研究有明確 RSS 規範的來源。
- 政府資料：逐資料集確認授權。
- 所有來源都要保留原始網址與日期。

## AI 回應 JSON 建議

{
  "stock": {
    "symbol": "2330",
    "name": "台積電"
  },
  "as_of": "2026-09-26",
  "summary": "...",
  "key_points": [
    {
      "title": "...",
      "summary": "...",
      "sources": ["..."]
    }
  ],
  "risks_to_watch": ["..."],
  "source_count": 5,
  "disclaimer": "僅供資訊整理與研究參考，不構成投資建議。"
}

## 重要原則

「來源能查到」與「我們可以重新公開使用」是兩件不同的事。
正式上線前，逐一確認來源條款、授權、API 限制、快取規則與費用。
