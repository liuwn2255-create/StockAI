/*
 * StockAI 資料來源安全閘門
 * 原則：
 * 1. 未確認授權的來源不得進入正式顯示層。
 * 2. 即時/延遲交易資訊不因「網路上可查」就視為可免費再發布。
 * 3. 新聞只保存必要的標題、日期、短摘要與原文連結。
 * 4. AI 摘要必須保留來源清單與資料日期。
 */

const SOURCE_STATUS = {
  CANDIDATE: "CANDIDATE",
  CANDIDATE_WITH_TERMS: "CANDIDATE_WITH_TERMS",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  APPROVED: "APPROVED",
  BLOCKED: "BLOCKED"
};

function canDisplaySource(source) {
  return source && ["APPROVED", "CANDIDATE", "CANDIDATE_WITH_TERMS"].includes(source.status);
}

function sourceLabel(source) {
  return `${source.name} · ${source.official_url}`;
}

function buildEvidenceItem({title, date, url, sourceName, summary}) {
  return {
    title,
    date,
    url,
    sourceName,
    summary,
    // 正式版應在後端再次驗證，不把前端判斷當成法律授權。
    verifiedByBackend: false
  };
}
