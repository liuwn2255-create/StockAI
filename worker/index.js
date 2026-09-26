/**
 * StockAI Cloudflare Worker — v2 backend
 *
 * Flow:
 * browser -> Worker -> reviewed public-data adapters -> AI -> structured JSON
 *
 * v2 adds the first real public-data adapter:
 * - TWSE OpenAPI / Government Open Data: listed-company basic information
 * - No real-time/delayed quote redistribution
 * - AI receives only reviewed evidence
 */

const ALLOWED_ORIGINS = [
  'https://liuwn2255-create.github.io',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

const STOCKS = {
  '2330': { symbol: '2330', name: '台積電', fullName: '台灣積體電路製造股份有限公司', market: '上市', industry: '半導體業' },
  '2317': { symbol: '2317', name: '鴻海', fullName: '鴻海精密工業股份有限公司', market: '上市', industry: '其他電子業' },
  '2454': { symbol: '2454', name: '聯發科', fullName: '聯發科技股份有限公司', market: '上市', industry: '半導體業' },
  '0050': { symbol: '0050', name: '元大台灣50', fullName: '元大台灣卓越50證券投資信託基金', market: 'ETF', industry: 'ETF' },
};

const TWSE_LISTED_COMPANY_API = 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L';
const DISCLAIMER = '本內容僅供公開資訊整理與研究參考，不構成投資建議、買賣推薦或任何獲利保證。AI 產生的內容可能存在錯誤、遺漏或時效性問題，請以原始資料及公司正式公告為準。';

const TWSE_MONTHLY_REVENUE_API = 'https://openapi.twse.com.tw/v1/opendata/t187ap05_L';
const TWSE_MATERIAL_ANNOUNCEMENT_API = 'https://openapi.twse.com.tw/v1/opendata/t187ap04_L';
const TWSE_INCOME_STATEMENT_GENERAL_API = 'https://openapi.twse.com.tw/v1/opendata/t187ap06_L_ci';
const TWSE_BALANCE_SHEET_GENERAL_API = 'https://openapi.twse.com.tw/v1/opendata/t187ap07_L_ci';

const MOPS_CASH_FLOW_API = 'https://mops.twse.com.tw/mops/web/ajax_t164sb05';

function cleanHtmlText(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMopsCashRows(html) {
  const rows = [];
  const trMatches = String(html || '').match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trMatches) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => cleanHtmlText(m[1]));
    if (cells.length >= 2) rows.push(cells);
  }
  return rows;
}

function cashValueFromRow(rows, labels) {
  for (const row of rows) {
    const label = String(row[0] || '').replace(/\u3000/g, ' ').trim();
    if (!labels.some(x => label.includes(x))) continue;
    for (let i = 1; i < row.length; i++) {
      const raw = String(row[i] || '').replace(/,/g, '').replace(/[()]/g, m => m === '(' ? '-' : '').trim();
      if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
    }
  }
  return null;
}

function rocYear(year) {
  return String(Number(year) - 1911);
}

function quarterSequence() {
  const now = new Date();
  let year = now.getUTCFullYear();
  let quarter = Math.floor((now.getUTCMonth()) / 3) + 1;
  // Financial reports are normally available after quarter close; start from the latest
  // completed quarter rather than querying an unreported current quarter.
  quarter -= 1;
  if (quarter < 1) { quarter = 4; year -= 1; }
  const out = [];
  for (let i = 0; i < 5; i++) {
    out.push({ year, quarter });
    quarter -= 1;
    if (quarter < 1) { quarter = 4; year -= 1; }
  }
  return out;
}

async function fetchMopsCashFlowQuarter(symbol, year, quarter) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const body = new URLSearchParams({
      encodeURIComponent: '1',
      step: '1', firstin: '1', off: '1',
      keyword4: '', code1: '', TYPEK2: '', checkbtn: '',
      queryName: 'co_id', TYPEK: 'all', isnew: 'false',
      co_id: symbol, year: rocYear(year), season: String(quarter).padStart(2, '0'),
    });
    const response = await fetch(MOPS_CASH_FLOW_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'text/html,application/json' },
      body: body.toString(),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`MOPS cash flow ${response.status}`);
    const text = await response.text();
    let rows = [];
    try {
      const json = JSON.parse(text);
      const reportList = json?.result?.reportList;
      if (Array.isArray(reportList)) rows = reportList;
    } catch (_) {}
    if (!rows.length) rows = parseMopsCashRows(text);
    if (!rows.length) return null;

    const operating = cashValueFromRow(rows, ['營運產生之現金流入（流出）', '營業活動之淨現金流入（流出）', '營業活動之淨現金流量']);
    const investing = cashValueFromRow(rows, ['投資活動之淨現金流入（流出）', '投資活動之淨現金流量']);
    const financing = cashValueFromRow(rows, ['籌資活動之淨現金流入（流出）', '融資活動之淨現金流量', '籌資活動之淨現金流量']);
    const netChange = cashValueFromRow(rows, ['本期現金及約當現金增加（減少）數', '本期現金及約當現金增加（減少）', '現金及約當現金增加（減少）']);
    const endingCash = cashValueFromRow(rows, ['期末現金及約當現金餘額', '期末現金及約當現金']);
    if ([operating, investing, financing, netChange, endingCash].every(v => v === null)) return null;
    return { year, quarter, operating, investing, financing, netChange, endingCash };
  } finally { clearTimeout(timer); }
}

async function fetchCashFlow(symbol, limit = 4) {
  const seq = quarterSequence();
  const cumulative = [];
  for (const q of seq) {
    try {
      const item = await fetchMopsCashFlowQuarter(symbol, q.year, q.quarter);
      if (item) cumulative.push(item);
    } catch (_) {}
    if (cumulative.length >= limit + 1) break;
  }
  if (!cumulative.length) return null;

  // MOPS cash-flow figures are cumulative within the fiscal year. Convert to single-quarter
  // values by subtracting the immediately preceding cumulative quarter.
  const ordered = cumulative.sort((a,b) => (a.year-b.year) || (a.quarter-b.quarter));
  const items = ordered.map((x, i) => {
    const prev = i > 0 && ordered[i-1].year === x.year ? ordered[i-1] : null;
    const diff = (key) => x[key] == null ? null : (prev?.[key] == null ? x[key] : x[key] - prev[key]);
    return {
      year: x.year, quarter: x.quarter, period: `${x.year} Q${x.quarter}`,
      operatingCashFlowThousandNTD: diff('operating'),
      investingCashFlowThousandNTD: diff('investing'),
      financingCashFlowThousandNTD: diff('financing'),
      netCashChangeThousandNTD: diff('netChange'),
      endingCashThousandNTD: x.endingCash,
    };
  }).slice(-limit).reverse();

  return {
    items,
    latest: items[0],
    evidence: {
      id: `mops-cash-flow-${symbol}`,
      source: '公開資訊觀測站 MOPS',
      date: new Date().toISOString().slice(0,10),
      title: `${symbol} 合併現金流量表`,
      url: 'https://mops.twse.com.tw/mops/web/t164sb05',
      rawUrl: MOPS_CASH_FLOW_API,
      note: 'MOPS 現金流量表為期間累計數；StockAI 將同年度相鄰累計期間相減後呈現單季現金流，期末現金則保留存量值。',
      policy: 'OFFICIAL_PUBLIC_DATA',
    },
  };
}

function numberOrNull(value) {
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function rocDateToISO(value) {
  const m = String(value || '').trim().match(/^(\d{3})(\d{2})(\d{2})$/);
  if (!m) return String(value || '').trim();
  return `${Number(m[1]) + 1911}-${m[2]}-${m[3]}`;
}

function rocMonthToISO(value) {
  const m = String(value || '').trim().match(/^(\d{3})(\d{2})$/);
  if (!m) return String(value || '').trim();
  return `${Number(m[1]) + 1911}-${m[2]}`;
}

function normalizeMonthlyRevenue(row) {
  const get = (key) => String(row?.[key] ?? '').trim();
  return {
    symbol: get('公司代號'),
    name: get('公司名稱'),
    industry: get('產業別'),
    reportDate: rocDateToISO(get('出表日期')),
    period: rocMonthToISO(get('資料年月')),
    currentRevenueThousandNTD: numberOrNull(get('營業收入-當月營收')),
    previousRevenueThousandNTD: numberOrNull(get('營業收入-上月營收')),
    yearAgoRevenueThousandNTD: numberOrNull(get('營業收入-去年當月營收')),
    momPercent: numberOrNull(get('營業收入-上月比較增減(%)')),
    yoyPercent: numberOrNull(get('營業收入-去年同月增減(%)')),
    cumulativeRevenueThousandNTD: numberOrNull(get('累計營業收入-當月累計營收')),
    cumulativeYearAgoThousandNTD: numberOrNull(get('累計營業收入-去年累計營收')),
    cumulativeYoyPercent: numberOrNull(get('累計營業收入-前期比較增減(%)')),
    note: get('備註'),
  };
}

async function fetchMonthlyRevenue(symbol) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(TWSE_MONTHLY_REVENUE_API, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
      cf: { cacheTtl: 1800, cacheEverything: true },
    });
    if (!response.ok) throw new Error(`TWSE monthly revenue ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('TWSE monthly revenue returned unexpected format');
    const row = rows.find(item => String(item?.['公司代號'] || '').trim() === symbol);
    if (!row) return null;
    const revenue = normalizeMonthlyRevenue(row);
    return {
      revenue,
      evidence: {
        id: `twse-monthly-revenue-${symbol}`,
        source: '臺灣證券交易所 OpenAPI／政府資料開放平臺',
        date: revenue.reportDate || revenue.period,
        title: `${revenue.name || symbol} 上市公司每月營業收入彙總表`,
        url: 'https://data.gov.tw/dataset/94026',
        rawUrl: TWSE_MONTHLY_REVENUE_API,
        note: '最新一期上市公司月營收開放資料；金額單位為新臺幣千元。此端點為最新一期快照，歷史月份需由網站自行保存。',
        policy: 'OPEN_GOVERNMENT_DATA',
      },
    };
  } finally {
    clearTimeout(timer);
  }
}


function quarterLabel(year, quarter) {
  const y = String(year || '').trim();
  const q = String(quarter || '').trim().replace(/^第/, '').replace(/季$/, '');
  if (!y && !q) return '';
  return `${y} Q${q}`;
}

function normalizeIncomeStatement(row) {
  const get = (...keys) => {
    for (const key of keys) {
      if (row?.[key] !== undefined && row?.[key] !== null && String(row[key]).trim() !== '') return String(row[key]).trim();
    }
    return '';
  };
  const year = get('年度');
  const quarter = get('季別', '季度');
  return {
    symbol: get('公司代號', '公司代碼'),
    name: get('公司名稱', '公司簡稱'),
    reportDate: rocDateToISO(get('出表日期')),
    year,
    quarter,
    period: quarterLabel(year, quarter),
    revenueThousandNTD: numberOrNull(get('營業收入', '收入')),
    grossProfitThousandNTD: numberOrNull(get('營業毛利（毛損）', '營業毛利(毛損)', '營業毛利（毛損）淨額')),
    operatingIncomeThousandNTD: numberOrNull(get('營業利益（損失）', '營業利益(損失)', '營業利益')),
    pretaxIncomeThousandNTD: numberOrNull(get('稅前淨利（淨損）', '稅前淨利(淨損)')),
    netIncomeThousandNTD: numberOrNull(get('本期淨利（淨損）', '本期淨利(淨損)', '繼續營業單位本期淨利（淨損）')),
    parentNetIncomeThousandNTD: numberOrNull(get('淨利（淨損）歸屬於母公司業主', '淨利（損）歸屬於母公司業主')),
    eps: numberOrNull(get('基本每股盈餘（元）', '基本每股盈餘(元)', '基本每股盈餘')),
  };
}

async function fetchQuarterlyFinancials(symbol, limit = 4) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(TWSE_INCOME_STATEMENT_GENERAL_API, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!response.ok) throw new Error(`TWSE income statement ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('TWSE income statement returned unexpected format');
    const items = rows
      .filter(row => String(row?.['公司代號'] || row?.['公司代碼'] || '').trim() === symbol)
      .map(normalizeIncomeStatement)
      .filter(item => item.period)
      .sort((a, b) => `${b.year}${b.quarter}`.localeCompare(`${a.year}${a.quarter}`))
      .slice(0, limit);
    if (!items.length) return null;
    return {
      items,
      latest: items[0],
      evidence: {
        id: `twse-income-statement-${symbol}`,
        source: '臺灣證券交易所 OpenAPI／政府資料開放平臺',
        date: items[0].reportDate || new Date().toISOString().slice(0, 10),
        title: `${items[0].name || symbol} 上市公司綜合損益表（一般業）`,
        url: 'https://data.gov.tw/dataset/91998',
        rawUrl: TWSE_INCOME_STATEMENT_GENERAL_API,
        note: '每季更新之上市公司綜合損益表（一般業）；金額單位為新臺幣千元。季別與資料日期依官方欄位顯示。',
        policy: 'OPEN_GOVERNMENT_DATA',
      },
    };
  } finally {
    clearTimeout(timer);
  }
}


function normalizeBalanceSheet(row) {
  const get = (...keys) => {
    for (const key of keys) {
      if (row?.[key] !== undefined && row?.[key] !== null && String(row[key]).trim() !== '') return String(row[key]).trim();
    }
    return '';
  };
  const year = get('年度');
  const quarter = get('季別', '季度');
  return {
    symbol: get('公司代號', '公司代碼'),
    name: get('公司名稱', '公司簡稱'),
    reportDate: rocDateToISO(get('出表日期')),
    year, quarter, period: quarterLabel(year, quarter),
    currentAssetsThousandNTD: numberOrNull(get('流動資產合計', '流動資產總額')),
    totalAssetsThousandNTD: numberOrNull(get('資產總計')),
    currentLiabilitiesThousandNTD: numberOrNull(get('流動負債合計', '流動負債總額')),
    totalLiabilitiesThousandNTD: numberOrNull(get('負債總計')),
    equityThousandNTD: numberOrNull(get('權益總計')),
    bookValuePerShare: numberOrNull(get('每股參考淨值')),
  };
}

async function fetchBalanceSheet(symbol) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(TWSE_BALANCE_SHEET_GENERAL_API, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!response.ok) throw new Error(`TWSE balance sheet ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('TWSE balance sheet returned unexpected format');
    const items = rows.filter(row => String(row?.['公司代號'] || row?.['公司代碼'] || '').trim() === symbol)
      .map(normalizeBalanceSheet).filter(item => item.period)
      .sort((a,b) => `${b.year}${b.quarter}`.localeCompare(`${a.year}${a.quarter}`));
    if (!items.length) return null;
    return {
      items,
      latest: items[0],
      evidence: {
        id: `twse-balance-sheet-${symbol}`,
        source: '臺灣證券交易所 OpenAPI／政府資料開放平臺',
        date: items[0].reportDate || new Date().toISOString().slice(0,10),
        title: `${items[0].name || symbol} 上市公司資產負債表（一般業）`,
        url: 'https://data.gov.tw/',
        rawUrl: TWSE_BALANCE_SHEET_GENERAL_API,
        note: '上市公司資產負債表（一般業）最新期快照；金額單位為新臺幣千元。歷史期間請以 MOPS 原始財報為準。',
        policy: 'OPEN_GOVERNMENT_DATA',
      },
    };
  } finally { clearTimeout(timer); }
}


function normalizeAnnouncement(row) {
  const get = (...keys) => {
    for (const key of keys) {
      if (row?.[key] !== undefined && row?.[key] !== null && String(row[key]).trim() !== '') return String(row[key]).trim();
    }
    return '';
  };
  const dateRaw = get('發言日期', '公告日期', '發布日期', '日期');
  const timeRaw = get('發言時間', '發布時間', '時間');
  return {
    symbol: get('公司代號', '公司代碼'),
    name: get('公司名稱', '公司簡稱'),
    date: rocDateToISO(dateRaw),
    time: timeRaw,
    subject: get('主旨', '公告主旨'),
    article: get('符合條款', '符合條款-第XX款'),
    eventDate: rocDateToISO(get('事實發生日', '事實發生日(註)')),
    spokesperson: get('發言人'),
    title: get('主旨', '公告主旨') || '公司重大訊息',
    description: get('說明', '公告內容'),
  };
}

async function fetchMaterialAnnouncements(symbol, limit = 8) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(TWSE_MATERIAL_ANNOUNCEMENT_API, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
      cf: { cacheTtl: 600, cacheEverything: true },
    });
    if (!response.ok) throw new Error(`TWSE material announcement ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('TWSE material announcement returned unexpected format');
    const items = rows
      .filter(row => String(row?.['公司代號'] || row?.['公司代碼'] || '').trim() === symbol)
      .map(normalizeAnnouncement)
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
      .slice(0, limit)
      .map((item, index) => ({
        ...item,
        id: `twse-announcement-${symbol}-${index}`,
        source: '臺灣證券交易所 OpenAPI／公開資訊觀測站',
        url: 'https://mops.twse.com.tw/',
        policy: 'OFFICIAL_PUBLIC_DATA',
      }));
    return {
      items,
      evidence: items.map(item => ({
        id: item.id,
        source: item.source,
        date: item.date || new Date().toISOString().slice(0, 10),
        title: item.title,
        url: item.url,
        note: '上市公司每日重大訊息公開資料；原始公告請回到公開資訊觀測站查閱。',
        policy: item.policy,
      })),
    };
  } finally {
    clearTimeout(timer);
  }
}

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(data, status = 200, origin = '') {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });
}

function resolveStock(value) {
  const v = String(value || '').trim();
  if (STOCKS[v]) return STOCKS[v];
  const found = Object.values(STOCKS).find(s => s.name === v || s.fullName === v);
  return found || null;
}

function normalizeProfile(row) {
  const get = (...keys) => {
    for (const key of keys) {
      if (row?.[key] !== undefined && row?.[key] !== null && String(row[key]).trim() !== '') return String(row[key]).trim();
    }
    return '';
  };

  return {
    symbol: get('公司代號', '公司代碼', 'SecuritiesCompanyCode'),
    name: get('公司簡稱', '公司名稱', 'CompanyAbbreviation'),
    fullName: get('公司名稱', 'CompanyName'),
    industry: get('產業別', 'Industry'),
    address: get('住址', '公司地址', 'Address'),
    chairman: get('董事長', 'Chairman'),
    generalManager: get('總經理', 'GeneralManager'),
    spokesperson: get('發言人', 'Spokesperson'),
    foundedDate: get('成立日期', 'EstablishmentDate'),
    listingDate: get('上市日期', 'ListingDate'),
    capital: get('實收資本額', 'PaidInCapital'),
    website: get('網址', '公司網址', 'Website'),
    englishName: get('英文簡稱', 'EnglishAbbreviation'),
    updateDate: get('出表日期', '資料日期', 'Date'),
  };
}

async function fetchListedCompanyProfile(symbol, env) {
  // Government/TWSE OpenAPI dataset: listed-company basic information.
  // The dataset is listed on data.gov.tw as free and under the Open Government Data License v1.0.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(TWSE_LISTED_COMPANY_API, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!response.ok) throw new Error(`TWSE OpenAPI ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('TWSE OpenAPI returned unexpected format');
    const row = rows.find(item => String(item?.['公司代號'] || item?.['公司代碼'] || '').trim() === symbol);
    if (!row) return null;
    const profile = normalizeProfile(row);
    return {
      profile,
      evidence: {
        id: `twse-profile-${symbol}`,
        source: '臺灣證券交易所／政府資料開放平臺',
        date: profile.updateDate || new Date().toISOString().slice(0, 10),
        title: `${profile.name || symbol} 上市公司基本資料`,
        url: 'https://data.gov.tw/dataset/18419',
        note: '上市公司基本資料開放資料；正式顯示前仍保留原始資料來源與資料日期。',
        policy: 'OPEN_GOVERNMENT_DATA',
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

function fallbackProfile(stock) {
  return {
    profile: {
      symbol: stock.symbol,
      name: stock.name,
      fullName: stock.fullName,
      market: stock.market,
      industry: stock.industry,
      status: 'fallback',
    },
    evidence: {
      id: `fallback-profile-${stock.symbol}`,
      source: 'StockAI 股票識別器',
      date: new Date().toISOString().slice(0, 10),
      title: `${stock.name} 識別資訊`,
      url: 'https://mops.twse.com.tw/',
      note: '僅作為查詢識別的 fallback，不作為正式財務或投資資料。',
      policy: 'FALLBACK_ONLY',
    },
  };
}

async function getStockProfile(stock, env) {
  // ETF 0050 is not expected in the listed-company basic-info dataset.
  if (stock.market === 'ETF') return fallbackProfile(stock);
  try {
    return await fetchListedCompanyProfile(stock.symbol, env);
  } catch (error) {
    return { ...fallbackProfile(stock), error: String(error?.message || error) };
  }
}

function systemPrompt() {
  return `你是 StockAI 的資訊研究助手。\n你的任務是整理已提供的公開資料，不是提供投資建議。\n規則：\n1. 只能根據輸入的 evidence 回答，不可自行捏造數字、日期、新聞或公司事件。\n2. 找不到足夠資料時，明確說明資料不足。\n3. 重要事實要附 evidence id。\n4. 區分公司正式公告、財務資料與媒體報導。\n5. 不提供買進、賣出、目標價、持有比例或獲利保證。\n6. 不使用未經授權的即時或延遲 TWSE 行情資料。\n7. 回答使用繁體中文。\n8. 回答最後必須保留：${DISCLAIMER}`;
}

async function callAI(question, stock, evidence, env) {
  if (!env.AI_API_KEY || !env.AI_API_URL) {
    return {
      mode: 'demo',
      answer: `目前 Worker 已收到「${stock.name}」的問題。正式版 AI 會只根據已通過來源檢查的資料回答。`,
      evidence,
    };
  }

  const payload = {
    model: env.AI_MODEL || 'gpt-5.6-luna',
    input: [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: JSON.stringify({ stock, question, evidence }) },
    ],
  };

  const r = await fetch(env.AI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.AI_API_KEY}` },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`AI upstream ${r.status}: ${text.slice(0, 500)}`);
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  const answer = data.output_text || data.output?.map?.(x => x?.content?.map?.(c => c?.text || '').join('')).join('') || data.choices?.[0]?.message?.content || data.raw;
  return { mode: 'live', answer: answer || 'AI 沒有回傳可顯示的內容。', evidence };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) });

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'StockAI Worker', version: '4.0.0', aiConfigured: Boolean(env.AI_API_KEY && env.AI_API_URL), profileAdapter: 'TWSE OpenAPI / data.gov.tw', announcementAdapter: 'TWSE OpenAPI t187ap04_L', financialAdapter: 'TWSE OpenAPI t187ap06_L_ci' }, 200, origin);
    }

    if (request.method === 'GET' && url.pathname === '/api/monthly-revenue') {
      const symbol = String(url.searchParams.get('symbol') || '').trim();
      const stock = resolveStock(symbol);
      if (!stock) return json({ ok: false, error: '目前無法識別這支股票。' }, 400, origin);
      if (stock.market === 'ETF') return json({ ok: false, error: '目前月營收資料僅適用上市公司，不適用 ETF。' }, 400, origin);
      try {
        const result = await fetchMonthlyRevenue(stock.symbol);
        if (!result) return json({ ok: false, error: '目前找不到這支股票的最新月營收資料。' }, 404, origin);
        return json({ ok: true, stock, ...result }, 200, origin);
      } catch (err) {
        return json({ ok: false, error: '月營收資料暫時無法取得。' }, 502, origin);
      }
    }


    if (request.method === 'GET' && url.pathname === '/api/announcements') {
      const symbol = String(url.searchParams.get('symbol') || '').trim();
      const stock = resolveStock(symbol);
      if (!stock) return json({ ok: false, error: '目前無法識別這支股票。' }, 400, origin);
      if (stock.market === 'ETF') return json({ ok: false, error: '目前重大訊息資料僅適用上市公司，不適用 ETF。' }, 400, origin);
      try {
        const result = await fetchMaterialAnnouncements(stock.symbol, 8);
        return json({ ok: true, stock, ...result }, 200, origin);
      } catch (err) {
        return json({ ok: false, error: '重大訊息資料暫時無法取得。' }, 502, origin);
      }
    }


    if (request.method === 'GET' && url.pathname === '/api/cash-flow') {
      const symbol = String(url.searchParams.get('symbol') || '').trim();
      const stock = resolveStock(symbol);
      if (!stock) return json({ ok: false, error: '目前無法識別這支股票。' }, 400, origin);
      if (stock.market === 'ETF') return json({ ok: false, error: '目前現金流量表資料僅適用上市公司，不適用 ETF。' }, 400, origin);
      try {
        const result = await fetchCashFlow(stock.symbol, 4);
        if (!result) return json({ ok: false, error: '目前找不到這支股票的現金流量表資料。' }, 404, origin);
        return json({ ok: true, stock, ...result }, 200, origin);
      } catch (_) {
        return json({ ok: false, error: '現金流量表資料暫時無法取得。' }, 502, origin);
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/financials') {
      const symbol = String(url.searchParams.get('symbol') || '').trim();
      const stock = resolveStock(symbol);
      if (!stock) return json({ ok: false, error: '目前無法識別這支股票。' }, 400, origin);
      if (stock.market === 'ETF') return json({ ok: false, error: '目前季財務報表資料僅適用上市公司，不適用 ETF。' }, 400, origin);
      try {
        const result = await fetchQuarterlyFinancials(stock.symbol, 4);
        if (!result) return json({ ok: false, error: '目前找不到這支股票的季財務資料。' }, 404, origin);
        return json({ ok: true, stock, ...result }, 200, origin);
      } catch (err) {
        return json({ ok: false, error: '季財務資料暫時無法取得。' }, 502, origin);
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/balance-sheet') {
      const symbol = String(url.searchParams.get('symbol') || '').trim();
      const stock = resolveStock(symbol);
      if (!stock) return json({ ok: false, error: '目前無法識別這支股票。' }, 400, origin);
      if (stock.market === 'ETF') return json({ ok: false, error: '目前資產負債表資料僅適用上市公司，不適用 ETF。' }, 400, origin);
      try {
        const result = await fetchBalanceSheet(stock.symbol);
        if (!result) return json({ ok: false, error: '目前找不到這支股票的資產負債表資料。' }, 404, origin);
        return json({ ok: true, stock, ...result }, 200, origin);
      } catch (_) {
        return json({ ok: false, error: '資產負債表資料暫時無法取得。' }, 502, origin);
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/diagnostics') {
      const symbol = String(url.searchParams.get('symbol') || '2330').trim();
      const stock = resolveStock(symbol);
      if (!stock) return json({ ok: false, error: '目前無法識別這支股票。' }, 400, origin);
      const runTest = async (name, fn) => {
        const started = Date.now();
        try {
          const value = await fn();
          return { name, ok: !!value, ms: Date.now() - started, detail: value ? '取得資料' : '沒有資料' };
        } catch (err) {
          return { name, ok: false, ms: Date.now() - started, detail: String(err?.message || err).slice(0, 160) };
        }
      };
      const jobs = [
        runTest('公司資料', async () => (await getStockProfile(stock, env))?.profile),
      ];
      if (stock.market !== 'ETF') {
        jobs.push(
          runTest('月營收', async () => (await fetchMonthlyRevenue(stock.symbol))?.revenue),
          runTest('損益表', async () => (await fetchQuarterlyFinancials(stock.symbol, 1))?.items?.length),
          runTest('資產負債表', async () => (await fetchBalanceSheet(stock.symbol))?.balance),
          runTest('現金流量表', async () => (await fetchCashFlow(stock.symbol, 1))?.latest),
          runTest('重大訊息', async () => (await fetchMaterialAnnouncements(stock.symbol, 1))?.items?.length),
        );
      }
      const tests = await Promise.all(jobs);
      return json({
        ok: true,
        stock,
        checkedAt: new Date().toISOString(),
        summary: {
          passed: tests.filter(x => x.ok).length,
          total: tests.length,
        },
        tests,
        note: '診斷只測試官方資料來源是否能被 Worker 取得，不會把診斷結果當成投資結論。',
      }, 200, origin);
    }

    if (request.method === 'GET' && url.pathname === '/api/stock-profile') {
      const symbol = String(url.searchParams.get('symbol') || '').trim();
      const stock = resolveStock(symbol);
      if (!stock) return json({ ok: false, error: '目前無法識別這支股票。' }, 400, origin);
      const result = await getStockProfile(stock, env);
      return json({ ok: true, stock, ...result }, 200, origin);
    }

    if (request.method !== 'POST' || url.pathname !== '/api/research') {
      return json({ error: 'Not Found' }, 404, origin);
    }

    try {
      const body = await request.json();
      const stock = resolveStock(body.stock);
      const question = String(body.question || '').trim();
      if (!stock) return json({ error: '目前無法識別這支股票。' }, 400, origin);
      if (!question) return json({ error: '請輸入問題。' }, 400, origin);
      if (question.length > 500) return json({ error: '問題長度請控制在 500 字以內。' }, 400, origin);

      const profileResult = await getStockProfile(stock, env);
      const evidence = [profileResult.evidence];
      try {
        const revenueResult = await fetchMonthlyRevenue(stock.symbol);
        if (revenueResult) evidence.push(revenueResult.evidence);
      } catch (_) { /* keep research usable when optional revenue source is unavailable */ }
      try {
        const announcementResult = await fetchMaterialAnnouncements(stock.symbol, 5);
        evidence.push(...announcementResult.evidence);
      } catch (_) { /* keep research usable when optional announcements source is unavailable */ }
      try {
        const financialResult = await fetchQuarterlyFinancials(stock.symbol, 4);
        if (financialResult) evidence.push(financialResult.evidence);
      } catch (_) { /* keep research usable when optional financial source is unavailable */ }
      try {
        const balanceResult = await fetchBalanceSheet(stock.symbol);
        if (balanceResult) evidence.push(balanceResult.evidence);
      } catch (_) { /* keep research usable when optional balance source is unavailable */ }
      try {
        const cashResult = await fetchCashFlow(stock.symbol, 4);
        if (cashResult) evidence.push(cashResult.evidence);
      } catch (_) { /* keep research usable when optional cash-flow source is unavailable */ }
      const result = await callAI(question, stock, evidence, env);

      return json({
        ok: true,
        stock,
        profile: profileResult.profile,
        ...result,
        disclaimer: DISCLAIMER,
      }, 200, origin);
    } catch (err) {
      return json({ ok: false, error: '後端處理失敗，請稍後再試。', detail: String(err?.message || err).slice(0, 500) }, 500, origin);
    }
  },
};
