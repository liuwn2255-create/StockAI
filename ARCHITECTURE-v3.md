# StockAI v3 Architecture

## 官方資料管線

1. 公司基本資料：TWSE OpenAPI / data.gov.tw `t187ap03_L`
2. 最新月營收：TWSE OpenAPI `t187ap05_L`
3. 每日重大訊息：TWSE OpenAPI `t187ap04_L`
4. 原始公告：連回 MOPS，不搬運完整公告全文

## AI

AI 只接收通過來源政策的 evidence；沒有資料就明確表示資料不足。AI 不提供買進、賣出、目標價或獲利保證。

## 行情

即時／延遲行情暫不直接提供，直到授權條件確認。

## 免責

網站、AI 回答與後端回傳均保留投資研究免責聲明。

## v12 財務資料層
- 新增 `/api/financials?symbol=2330`
- 使用 TWSE OpenAPI `t187ap06_L_ci` 一般業綜合損益表
- 回傳最近四季：營業收入、營業利益、稅後淨利、基本 EPS
- 資料來源：data.gov.tw dataset 91998／TWSE OpenAPI
- 不對 ETF 顯示一般上市公司季財報
- 金額原始單位保留為新臺幣千元，前端轉為百萬元呈現
- AI research evidence 新增季財報來源
- 免責聲明維持固定，不提供買賣指令
