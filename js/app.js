const tabs = document.querySelectorAll('.tabs button');
const panels = document.querySelectorAll('.tab-panel');
const input = document.getElementById('stockInput');
const form = document.getElementById('searchForm');
const research = document.getElementById('researchSection');
const dataBadge = document.getElementById('dataBadge');
const resultTitle = document.getElementById('resultTitle');
const resultSubtitle = document.getElementById('resultSubtitle');
const resultTicker = document.getElementById('resultTicker');
const resultName = document.getElementById('resultName');
const resultFullName = document.getElementById('resultFullName');
const sourceGrid = document.getElementById('sourceGrid');
const newsList = document.getElementById('newsList');
const officialLinks = document.getElementById('officialLinks');
const aiSummaryRequests = new Map();

let currentStock = resolveStock('2330');
let financialTrendRequestId = 0;

function setActiveTab(id){
  tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  panels.forEach(p => p.classList.toggle('active', p.id === id));
}

tabs.forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));

function renderSources(stock){
  if(!sourceGrid) return;
  sourceGrid.innerHTML = officialSources(stock).map(src => `
    <article class="source-item">
      <div class="source-item-top"><span class="source-dot"></span><span>${src.type}</span></div>
      <h4>${src.label}</h4>
      <p>${src.note}</p>
      <a href="${src.url}" target="_blank" rel="noopener noreferrer">前往原始來源 ↗</a>
    </article>
  `).join('');
}

function renderOfficialData(stock){
  if(!officialLinks) return;
  const code = encodeURIComponent(stock.symbol);
  const links = [
    {label:'公司基本資料', note:'公司名稱、產業、資本額、上市日期等', url:`https://www.twse.com.tw/pdf/ch/${code}_ch.pdf`},
    {label:'TWSE 財務分析', note:'EPS、利潤率、股利等官方分析頁', url:`https://wwwc.twse.com.tw/IIH2/zh/company/financial.html?code=${code}`},
    {label:'MOPS 重大訊息', note:'公司公告與重大訊息原始頁', url:`https://mops.twse.com.tw/mops/web/t05st01?co_id=${code}&firstin=true&step=1`}
  ];
  officialLinks.innerHTML = links.map(item => `
    <a class="official-link" href="${item.url}" target="_blank" rel="noopener noreferrer">
      <span><strong>${item.label}</strong><small>${item.note}</small></span><b>↗</b>
    </a>`).join('');
}

async function loadMonthlyRevenue(stock){
  setResearchStatus('revenue', window.STOCKAI_CONFIG?.ENABLE_LIVE_BACKEND ? 'loading' : 'unavailable', window.STOCKAI_CONFIG?.ENABLE_LIVE_BACKEND ? '讀取中…' : '後端未啟用');
  const cfg = window.STOCKAI_CONFIG || {};
  const content = document.getElementById('monthlyRevenueContent');
  const status = document.getElementById('revenueStatus');
  const current = document.getElementById('revenueCurrent');
  const yoy = document.getElementById('revenueYoy');
  const mom = document.getElementById('revenueMom');
  const note = document.getElementById('revenueSourceNote');
  if(!content || !cfg.ENABLE_LIVE_BACKEND || !cfg.API_BASE_URL) return;
  status.textContent = '讀取中…';
  try{
    const response = await fetch(`${cfg.API_BASE_URL.replace(/\/$/,'')}/api/monthly-revenue?symbol=${encodeURIComponent(stock.symbol)}`);
    const data = await response.json();
    if(!response.ok || !data.ok) throw new Error(data.error || '月營收取得失敗');
    const r = data.revenue || {};
    const money = n => n == null ? '—' : `${(Number(n)/1000).toLocaleString('zh-TW',{maximumFractionDigits:0})} 百萬元`;
    const pct = n => n == null ? '—' : `${Number(n).toFixed(2)}%`;
    content.innerHTML = `<strong>${escapeHtml(r.period || '最新一期')} · ${escapeHtml(r.name || stock.name)}</strong><p>當月營收 ${money(r.currentRevenueThousandNTD)}；累計營收 ${money(r.cumulativeRevenueThousandNTD)}。資料為官方公開資料快照。</p>`;
    current.textContent = money(r.currentRevenueThousandNTD);
    yoy.textContent = pct(r.yoyPercent);
    mom.textContent = pct(r.momPercent);
    status.textContent = '✓ 官方資料已取得';
    setResearchStatus('revenue','ready','官方資料已取得');
    if(note) note.textContent = `來源：${data.evidence?.source || '臺灣證券交易所 OpenAPI'} · 資料日期：${data.evidence?.date || '—'} · 單位：新臺幣千元`;
  }catch(err){
    setResearchStatus('revenue','unavailable','暫不可用');
    status.textContent = '官方資料暫不可用';
    content.innerHTML = '<strong>目前無法取得最新月營收</strong><p>StockAI 不會用假數字補上；請稍後再試或直接查看原始官方資料。</p>';
  }
}

async function loadLiveProfile(stock){
  setResearchStatus('profile', window.STOCKAI_CONFIG?.ENABLE_LIVE_BACKEND ? 'loading' : 'unavailable', window.STOCKAI_CONFIG?.ENABLE_LIVE_BACKEND ? '讀取中…' : '後端未啟用');
  const cfg = window.STOCKAI_CONFIG || {};
  if(!cfg.ENABLE_LIVE_BACKEND || !cfg.API_BASE_URL) return;
  try{
    const response = await fetch(`${cfg.API_BASE_URL.replace(/\/$/,'')}/api/stock-profile?symbol=${encodeURIComponent(stock.symbol)}`);
    const data = await response.json();
    if(!response.ok || !data.ok) throw new Error(data.error || '公司資料取得失敗');
    const p = data.profile || {};
    const industryEl = document.querySelector('#overview .info-card:nth-child(1) .data-row:nth-of-type(1) b');
    const marketEl = document.querySelector('#overview .info-card:nth-child(1) .data-row:nth-of-type(2) b');
    const codeEl = document.querySelector('#overview .info-card:nth-child(1) .data-row:nth-of-type(3) b');
    if(industryEl && p.industry) industryEl.textContent = p.industry;
    if(marketEl && p.symbol) marketEl.textContent = stock.market === 'ETF' ? 'ETF' : '臺灣證券交易所';
    if(codeEl && p.symbol) codeEl.textContent = p.symbol;
    if(p.fullName) resultFullName.textContent = p.fullName;
    if(p.name) resultName.textContent = p.name;
    if(p.industry) resultSubtitle.textContent = `${p.fullName || stock.fullName} · ${p.industry}`;
    dataBadge.textContent = p.status === 'fallback' ? '識別成功 · 官方資料暫不可用' : '✓ 官方公司資料已取得';
    dataBadge.classList.add('ready');
    setResearchStatus('profile','ready','官方資料已取得');
    const note = document.querySelector('#officialDataCard .official-data-head p');
    if(note && data.evidence?.date) note.textContent = `來源：${data.evidence.source} · 資料日期：${data.evidence.date}`;
  }catch(err){
    setResearchStatus('profile','unavailable','暫不可用');
    dataBadge.textContent = '識別成功 · 後端資料待確認';
  }
}


const researchStatus = {profile:'pending', revenue:'pending', financials:'pending', balance:'pending', cashflow:'pending', announcements:'pending'};
function setResearchStatus(module, state, note){
  researchStatus[module]=state;
  const item=document.querySelector(`.status-item[data-module="${module}"]`);
  if(item){ item.classList.remove('pending','loading','ready','unavailable'); item.classList.add(state); const small=item.querySelector('small'); if(small) small.textContent=note || (state==='ready'?'已取得':state==='loading'?'讀取中…':'暫不可用'); }
  const vals=Object.values(researchStatus);
  const ready=vals.filter(x=>x==='ready').length, unavailable=vals.filter(x=>x==='unavailable').length, loading=vals.filter(x=>x==='loading').length;
  const summary=document.getElementById('researchStatusSummary');
  if(summary){
    if(!window.STOCKAI_CONFIG?.ENABLE_LIVE_BACKEND){ summary.textContent='後端尚未啟用'; }
    else if(loading) summary.textContent=`讀取中 · ${ready}/6 已取得`;
    else if(ready===6) summary.textContent='✓ 6/6 官方資料已取得';
    else summary.textContent=`已取得 ${ready}/6 · ${unavailable} 項暫不可用`;
  }
}


async function runBackendDiagnostics(stock){
  const btn=document.getElementById('diagnosticBtn');
  const cfg=window.STOCKAI_CONFIG||{};
  if(!cfg.API_BASE_URL){
    if(btn) btn.textContent='請先設定 Worker';
    const summary=document.getElementById('researchStatusSummary');
    if(summary) summary.textContent='尚未設定 Worker URL';
    return;
  }
  if(btn){btn.disabled=true;btn.textContent='檢查中…';}
  try{
    const base=cfg.API_BASE_URL.replace(/\/$/,'');
    const response=await fetch(`${base}/api/diagnostics?symbol=${encodeURIComponent(stock.symbol)}`);
    const data=await response.json();
    if(!response.ok) throw new Error(data.error||'診斷失敗');

    // 支援目前 Worker 的 checks 格式，也相容舊版 tests 格式。
    const items = data.checks || data.tests || [];
    const map={
      '公司資料':'profile',
      '月營收':'revenue',
      '損益':'financials',
      '損益表':'financials',
      '資產負債':'balance',
      '資產負債表':'balance',
      '現金流':'cashflow',
      '現金流量表':'cashflow',
      '重大訊息':'announcements'
    };

    items.forEach(t=>{
      const module=map[t.name];
      if(!module) return;
      const ok=!!t.ok;
      const detail=t.message || t.detail || '';
      setResearchStatus(
        module,
        ok ? 'ready' : 'unavailable',
        ok ? `已取得 · ${t.ms||0}ms` : '官方資料來源暫不可用'
      );
    });

    const passed = Number.isFinite(data.passed)
      ? data.passed
      : (data.summary?.passed ?? items.filter(t=>t.ok).length);
    const total = Number.isFinite(data.total)
      ? data.total
      : (data.summary?.total ?? items.length);
    const unavailable = Math.max(total - passed, 0);

    const summary=document.getElementById('researchStatusSummary');
    if(summary){
      summary.textContent = unavailable
        ? `診斷完成 · 已取得 ${passed}/${total} · ${unavailable} 項暫不可用`
        : `診斷完成 · ${passed}/${total} 項資料可用`;
    }
  }catch(err){
    const summary=document.getElementById('researchStatusSummary');
    if(summary) summary.textContent='Worker 無法連線';
  }finally{
    if(btn){btn.disabled=false;btn.textContent='重新檢查';}
  }
}

function resetResearchStatus(){
  Object.keys(researchStatus).forEach(k=>researchStatus[k]='pending');
  document.querySelectorAll('.status-item').forEach(el=>{el.classList.remove('ready','loading','unavailable');el.classList.add('pending');const small=el.querySelector('small');if(small)small.textContent='等待資料';});
  setResearchStatus('profile','pending','等待資料');
}

function formatMillion(value){
  if(value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if(!Number.isFinite(n)) return '—';
  return `${(n / 1000).toLocaleString('zh-TW', {maximumFractionDigits: 0})} 百萬元`;
}

function renderTrendChart(id, items, key, unit){
  const el = document.getElementById(id);
  if(!el) return;
  const rows = (items || []).filter(x => x[key] !== null && x[key] !== undefined && x[key] !== '' && Number.isFinite(Number(x[key])));
  if(rows.length < 2){ el.innerHTML = '<div class="chart-empty">目前資料不足以形成趨勢</div>'; return; }
  const data = rows.slice(-6);
  const divisor = unit === '百萬元' ? 1000 : 1;
  const values = data.map(x => Number(x[key]) / divisor);
  const min = Math.min(...values), max = Math.max(...values);
  const pad = (max-min) || Math.max(Math.abs(max)*0.08, 1);
  const lo = min - pad*0.12, hi = max + pad*0.12;
  const W=560,H=170,L=12,R=12,T=16,B=30;
  const x=i=>L+(W-L-R)*(i/(data.length-1));
  const y=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo));
  const pts=data.map((d,i)=>[x(i),y(Number(d[key]))]);
  const line=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const area=line+' L '+pts[pts.length-1][0].toFixed(1)+' '+(H-B)+' L '+pts[0][0].toFixed(1)+' '+(H-B)+' Z';
  const grids=[0,0.5,1].map(t=>{const gy=T+(H-T-B)*t;return `<line class="chart-grid-line" x1="${L}" y1="${gy}" x2="${W-R}" y2="${gy}"/>`;}).join('');
  const labels=data.map((d,i)=>`<text class="chart-label" x="${x(i)}" y="${H-9}" text-anchor="middle">${escapeHtml(d.period||'')}</text>`).join('');
  const points=pts.map((p,i)=>`<circle class="chart-point" cx="${p[0]}" cy="${p[1]}" r="3.5"><title>${escapeHtml(data[i].period||'')}：${formatNumber(values[i], key==='eps'?2:0)} ${unit}</title></circle>`).join('');
  const valuesText=pts.map((p,i)=>`<text class="chart-value" x="${p[0]}" y="${Math.max(11,p[1]-8)}" text-anchor="middle">${formatNumber(values[i], key==='eps'?2:0)}</text>`).join('');
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${key} 趨勢圖">${grids}<path class="chart-area" d="${area}"/><path class="chart-line" d="${line}"/>${points}${valuesText}${labels}</svg>`;
}

function renderFinancialTrends(items){
  renderTrendChart('revenueChart', items, 'revenueThousandNTD', '百萬元');
  renderTrendChart('operatingChart', items, 'operatingIncomeThousandNTD', '百萬元');
  renderTrendChart('epsChart', items, 'eps', '元');
  const note=document.getElementById('trendNote');
  if(note) note.textContent='圖表呈現已取得的官方財務資料；期間與數值以原始資料為準，不代表未來表現，也不構成投資建議。';
}

function renderTrendUnavailable(){
  ['revenueChart','operatingChart','epsChart'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.innerHTML='<div class="chart-empty">趨勢資料暫時無法取得</div>';
  });
}

function formatNumber(value, digits=2){
  if(value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('zh-TW', {maximumFractionDigits: digits}) : '—';
}

async function loadQuarterlyFinancials(stock){
  setResearchStatus('financials', window.STOCKAI_CONFIG?.ENABLE_LIVE_BACKEND ? 'loading' : 'unavailable', window.STOCKAI_CONFIG?.ENABLE_LIVE_BACKEND ? '讀取中…' : '後端未啟用');
  const cfg = window.STOCKAI_CONFIG || {};
  const content = document.getElementById('quarterlyFinancialContent');
  const status = document.getElementById('financialStatus');
  if(!content || !status || !cfg.ENABLE_LIVE_BACKEND || !cfg.API_BASE_URL) return;
  status.textContent = '讀取中…';
  try{
    const response = await fetch(`${cfg.API_BASE_URL.replace(/\/$/,'')}/api/financials?symbol=${encodeURIComponent(stock.symbol)}`);
    const data = await response.json();
    if(!response.ok || !data.ok) throw new Error(data.error || '財務資料取得失敗');
    const items = data.items || [];
    if(!items.length) throw new Error('沒有資料');
    status.textContent = `✓ 官方資料 · ${data.evidence?.date || ''}`;
    setResearchStatus('financials','ready','官方資料已取得');
    content.innerHTML = `
      <div class="financial-latest-grid">
        <div class="big-stat"><strong>最新季度</strong><span>${escapeHtml(data.latest?.period || '—')}</span></div>
        <div class="big-stat"><strong>營業收入</strong><span>${formatMillion(data.latest?.revenueThousandNTD)}</span></div>
        <div class="big-stat"><strong>營業利益</strong><span>${formatMillion(data.latest?.operatingIncomeThousandNTD)}</span></div>
        <div class="big-stat"><strong>基本 EPS</strong><span>${formatNumber(data.latest?.eps, 2)} 元</span></div>
      </div>
      <div class="financial-table-wrap">
        <table class="financial-table">
          <thead><tr><th>期間</th><th>營業收入</th><th>營業利益</th><th>稅後淨利</th><th>EPS</th></tr></thead>
          <tbody>${items.map(item => `<tr><td>${escapeHtml(item.period || '—')}</td><td>${formatMillion(item.revenueThousandNTD)}</td><td>${formatMillion(item.operatingIncomeThousandNTD)}</td><td>${formatMillion(item.netIncomeThousandNTD)}</td><td>${formatNumber(item.eps,2)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="source-meta">來源：${escapeHtml(data.evidence?.source || '臺灣證券交易所')} · 資料日期：${escapeHtml(data.evidence?.date || '—')} · 金額原始單位：新臺幣千元</div>
      <a class="source-link" href="${data.evidence?.url || 'https://data.gov.tw/dataset/91998'}" target="_blank" rel="noopener noreferrer">查看官方財務資料 ↗</a>
    `;
  }catch(err){
    setResearchStatus('financials','unavailable','暫不可用');
    status.textContent = '官方資料暫不可用';
    content.innerHTML = `<strong>目前無法取得季財務資料</strong><p>StockAI 不會用假數字補上。可直接查看公開資訊觀測站的原始財務資料。</p><a class="source-link" href="https://mops.twse.com.tw/" target="_blank" rel="noopener noreferrer">查看 MOPS ↗</a>`;
  }
}

async function loadFinancialTrends(stock){
  const requestId=++financialTrendRequestId;
  const requestedSymbol=String(stock?.symbol || '');
  if(!requestedSymbol) return;
  const isCurrentRequest=()=>requestId===financialTrendRequestId && currentStock.symbol===requestedSymbol;
  const cfg = window.STOCKAI_CONFIG || {};
  if(!cfg.ENABLE_LIVE_BACKEND || !cfg.API_BASE_URL){
    if(isCurrentRequest()) renderTrendUnavailable();
    return;
  }
  try{
    const response = await fetch(`${cfg.API_BASE_URL.replace(/\/$/,'')}/api/trends?symbol=${encodeURIComponent(requestedSymbol)}`);
    const data = await response.json();
    if(!response.ok || !data.ok) throw new Error(data.error || '財務趨勢資料取得失敗');
    if(data.symbol && String(data.symbol)!==requestedSymbol) throw new Error('趨勢資料股票代號不符');
    if(!isCurrentRequest()) return;
    renderFinancialTrends(Array.isArray(data.items) ? data.items : []);
  }catch(_){
    if(isCurrentRequest()) renderTrendUnavailable();
  }
}



async function loadFinancialHealth(stock){
  const cfg = window.STOCKAI_CONFIG || {};
  const el = document.getElementById('financialHealthContent');
  if(!el || !cfg.ENABLE_LIVE_BACKEND || !cfg.API_BASE_URL) return;
  el.innerHTML = '<div class="health-empty">正在整理官方財務資料…</div>';
  try{
    const base = cfg.API_BASE_URL.replace(/\/$/,'');
    const [finRes, balRes] = await Promise.all([
      fetch(`${base}/api/financials?symbol=${encodeURIComponent(stock.symbol)}`),
      fetch(`${base}/api/balance-sheet?symbol=${encodeURIComponent(stock.symbol)}`)
    ]);
    const fin = await finRes.json();
    const bal = await balRes.json();
    if(!finRes.ok || !fin.ok || !balRes.ok || !bal.ok) throw new Error('官方資料不足');
    const f = fin.latest || {};
    const b = bal.latest || {};
    const n = v => {
      if(v === null || v === undefined) return null;
      if(typeof v === 'number') return Number.isFinite(v) ? v : null;
      if(typeof v !== 'string' || !v.trim()) return null;
      const value = Number(v);
      return Number.isFinite(value) ? value : null;
    };
    const curA=n(b.currentAssetsThousandNTD), curL=n(b.currentLiabilitiesThousandNTD), liab=n(b.totalLiabilitiesThousandNTD), assets=n(b.totalAssetsThousandNTD), eq=n(b.equityThousandNTD);
    const op=n(f.operatingIncomeThousandNTD), rev=n(f.revenueThousandNTD), net=n(f.netIncomeThousandNTD);
    const ratios=[
      ['流動比率', Number.isFinite(curA)&&Number.isFinite(curL)&&curL!==0 ? curA/curL : null, '倍'],
      ['負債比率', Number.isFinite(liab)&&Number.isFinite(assets)&&assets!==0 ? liab/assets*100 : null, '%'],
      ['權益比率', Number.isFinite(eq)&&Number.isFinite(assets)&&assets!==0 ? eq/assets*100 : null, '%'],
      ['營業利益率', Number.isFinite(op)&&Number.isFinite(rev)&&rev!==0 ? op/rev*100 : null, '%'],
      ['稅後淨利率', Number.isFinite(net)&&Number.isFinite(rev)&&rev!==0 ? net/rev*100 : null, '%']
    ];
    el.innerHTML = ratios.map(([label,val,unit])=>`<article class="health-card"><span>${label}</span><strong>${val===null?'—':val.toLocaleString('zh-TW',{maximumFractionDigits:2})}${val===null?'':unit}</strong><small>${val===null?'目前資料不足以計算':'依最新可取得官方期間計算'}</small></article>`).join('');
  }catch(err){
    el.innerHTML='<div class="health-empty">目前無法完整取得計算所需的官方財務資料，StockAI 不會用假數字補上。</div>';
  }
}

async function loadBalanceSheet(stock){
  setResearchStatus('balance', window.STOCKAI_CONFIG?.ENABLE_LIVE_BACKEND ? 'loading' : 'unavailable', window.STOCKAI_CONFIG?.ENABLE_LIVE_BACKEND ? '讀取中…' : '後端未啟用');
  const cfg = window.STOCKAI_CONFIG || {};
  const content = document.getElementById('balanceSheetContent');
  const status = document.getElementById('balanceStatus');
  if(!content || !status || !cfg.ENABLE_LIVE_BACKEND || !cfg.API_BASE_URL) return;
  status.textContent='讀取中…';
  try{
    const response=await fetch(`${cfg.API_BASE_URL.replace(/\/$/,'')}/api/balance-sheet?symbol=${encodeURIComponent(stock.symbol)}`);
    const data=await response.json();
    if(!response.ok || !data.ok) throw new Error(data.error||'資產負債表取得失敗');
    const x=data.latest||{};
    status.textContent=`✓ 官方資料 · ${data.evidence?.date||''}`;
    setResearchStatus('balance','ready','官方資料已取得');
    content.innerHTML=`<div class="balance-grid">
      <div class="big-stat"><strong>流動資產</strong><span>${formatMillion(x.currentAssetsThousandNTD)}</span></div>
      <div class="big-stat"><strong>資產總計</strong><span>${formatMillion(x.totalAssetsThousandNTD)}</span></div>
      <div class="big-stat"><strong>負債總計</strong><span>${formatMillion(x.totalLiabilitiesThousandNTD)}</span></div>
      <div class="big-stat"><strong>權益總計</strong><span>${formatMillion(x.equityThousandNTD)}</span></div>
    </div>
    <div class="source-meta">期間：${escapeHtml(x.period||'—')} · 資料日期：${escapeHtml(data.evidence?.date||'—')} · 金額原始單位：新臺幣千元</div>
    <a class="source-link" href="${data.evidence?.url||'https://data.gov.tw/'}" target="_blank" rel="noopener noreferrer">查看官方資料 ↗</a>`;
  }catch(err){
    setResearchStatus('balance','unavailable','官方資料暫不可用');
    status.textContent='官方資料暫不可用';
    content.innerHTML='<strong>目前無法取得資產負債表</strong><p>StockAI 不會用假數字補上。可直接查看公開資訊觀測站的原始財報。</p><a class="source-link" href="https://mops.twse.com.tw/" target="_blank" rel="noopener noreferrer">查看 MOPS ↗</a>';
  }
}


async function loadCashFlow(stock){
  setResearchStatus('cashflow', window.STOCKAI_CONFIG?.ENABLE_LIVE_BACKEND ? 'loading' : 'unavailable', window.STOCKAI_CONFIG?.ENABLE_LIVE_BACKEND ? '讀取中…' : '後端未啟用');
  const cfg = window.STOCKAI_CONFIG || {};
  const content = document.getElementById('cashFlowContent');
  const status = document.getElementById('cashFlowStatus');
  if(!content || !status || !cfg.ENABLE_LIVE_BACKEND || !cfg.API_BASE_URL) return;
  status.textContent='讀取中…';
  try{
    const response=await fetch(`${cfg.API_BASE_URL.replace(/\/$/,'')}/api/cash-flow?symbol=${encodeURIComponent(stock.symbol)}`);
    const data=await response.json();
    if(!response.ok || !data.ok) throw new Error(data.error||'現金流量表取得失敗');
    const items=data.items||[];
    if(!items.length) throw new Error('沒有資料');
    const money=v=>v==null?'—':`${(Number(v)/1000).toLocaleString('zh-TW',{maximumFractionDigits:0})} 百萬元`;
    const latest=data.latest||items[0];
    const flowCard=(label,value,cls)=>`<div class="cashflow-stat ${cls||''}"><span>${label}</span><strong>${money(value)}</strong></div>`;
    content.innerHTML=`
      <div class="cashflow-grid">
        ${flowCard('營業活動現金流',latest.operatingCashFlowThousandNTD,'operating')}
        ${flowCard('投資活動現金流',latest.investingCashFlowThousandNTD,'investing')}
        ${flowCard('籌資活動現金流',latest.financingCashFlowThousandNTD,'financing')}
        ${flowCard('本期現金增減',latest.netCashChangeThousandNTD,'net')}
      </div>
      <div class="cashflow-table-wrap"><table class="financial-table"><thead><tr><th>期間</th><th>營業活動</th><th>投資活動</th><th>籌資活動</th><th>現金增減</th><th>期末現金</th></tr></thead><tbody>${items.map(x=>`<tr><td>${escapeHtml(x.period||'—')}</td><td>${money(x.operatingCashFlowThousandNTD)}</td><td>${money(x.investingCashFlowThousandNTD)}</td><td>${money(x.financingCashFlowThousandNTD)}</td><td>${money(x.netCashChangeThousandNTD)}</td><td>${money(x.endingCashThousandNTD)}</td></tr>`).join('')}</tbody></table></div>
      <div class="source-meta">來源：${escapeHtml(data.evidence?.source||'公開資訊觀測站 MOPS')} · 查詢日期：${escapeHtml(data.evidence?.date||'—')} · 金額原始單位：新臺幣千元</div>
      <a class="source-link" href="${data.evidence?.url||'https://mops.twse.com.tw/'}" target="_blank" rel="noopener noreferrer">查看 MOPS 原始財報 ↗</a>
      <div class="trend-note">現金流數字依 MOPS 財報期間整理；不同產業的現金流項目可能不同，StockAI 不自行補值或推估。</div>`;
    status.textContent=`✓ 官方資料 · ${items.length} 期`;
    setResearchStatus('cashflow','ready',`${items.length} 期官方資料`);
  }catch(err){
    setResearchStatus('cashflow','unavailable','官方資料暫不可用');
    status.textContent='官方資料暫不可用';
    content.innerHTML='<strong>目前無法取得現金流量表</strong><p>StockAI 不會用假數字補上。可直接查看公開資訊觀測站的原始財報。</p><a class="source-link" href="https://mops.twse.com.tw/" target="_blank" rel="noopener noreferrer">查看 MOPS ↗</a>';
  }
}

async function loadAnnouncements(stock){
  setResearchStatus('announcements', window.STOCKAI_CONFIG?.ENABLE_LIVE_BACKEND ? 'loading' : 'unavailable', window.STOCKAI_CONFIG?.ENABLE_LIVE_BACKEND ? '讀取中…' : '後端未啟用');
  const cfg = window.STOCKAI_CONFIG || {};
  if(!newsList || !cfg.ENABLE_LIVE_BACKEND || !cfg.API_BASE_URL) return;
  try{
    const response = await fetch(`${cfg.API_BASE_URL.replace(/\/$/,'')}/api/announcements?symbol=${encodeURIComponent(stock.symbol)}`);
    const data = await response.json();
    if(!response.ok || !data.ok) throw new Error(data.error || '重大訊息取得失敗');
    const items = data.items || [];
    if(!items.length){
      setResearchStatus('announcements','unavailable','目前沒有可顯示的官方訊息');
      newsList.innerHTML = `<article class="news-card source-card"><span class="news-date">官方資料</span><h3>目前沒有取得可顯示的重大訊息</h3><p>StockAI 不會用其他來源或假資料補上。</p><a href="https://mops.twse.com.tw/" target="_blank" rel="noopener noreferrer">查看公開資訊觀測站 ↗</a></article>`;
      return;
    }
    setResearchStatus('announcements','ready',`${items.length} 筆官方訊息`);
    newsList.innerHTML = items.map(item => `
      <article class="news-card source-card">
        <span class="news-date">${escapeHtml(item.date || '日期未提供')} ${escapeHtml(item.time || '')} · 官方重大訊息</span>
        <h3>${escapeHtml(item.title || '公司重大訊息')}</h3>
        <p>${escapeHtml(item.description || '原始公告內容請至公開資訊觀測站查閱。')}</p>
        <div class="source-meta">來源：${escapeHtml(item.source || '臺灣證券交易所')} · 資料日期：${escapeHtml(item.date || '—')}</div>
        <a href="${item.url}" target="_blank" rel="noopener noreferrer">查看 MOPS 原始資料 ↗</a>
      </article>`).join('');
  }catch(err){
    setResearchStatus('announcements','unavailable','暫不可用');
    newsList.innerHTML = `<article class="news-card source-card"><span class="news-date">官方資料暫不可用</span><h3>重大訊息暫時無法取得</h3><p>這次沒有用假資料補上；可以直接查看 MOPS 原始資料。</p><a href="https://mops.twse.com.tw/" target="_blank" rel="noopener noreferrer">查看 MOPS ↗</a></article>`;
  }
}

function renderStock(stock){
  currentStock = stock;
  resetResearchStatus();
  resultTitle.textContent = `${stock.symbol} ${stock.name}`;
  resultSubtitle.textContent = `${stock.fullName} · ${stock.industry}`;
  resultTicker.textContent = `${stock.market} · ${stock.symbol}`;
  resultName.textContent = stock.name;
  resultFullName.textContent = stock.fullName;
  dataBadge.textContent = '已識別股票 · 資料待接';
  dataBadge.classList.add('ready');
  renderSources(stock);
  renderOfficialData(stock);
  loadLiveProfile(stock);
  loadMonthlyRevenue(stock);
  loadQuarterlyFinancials(stock);
  loadFinancialTrends(stock);
  loadBalanceSheet(stock);
  loadFinancialHealth(stock);
  loadCashFlow(stock);
  loadAnnouncements(stock);
  loadAiSummary(stock);
}

function showSearchMessage(message){
  const existing = document.getElementById('searchMessage');
  if(existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'searchMessage';
  el.className = 'search-message';
  el.textContent = message;
  form.insertAdjacentElement('afterend', el);
  setTimeout(() => el.remove(), 3500);
}

function searchStock(value){
  const v = String(value || '').trim();
  if(!v){ showSearchMessage('請輸入股票名稱或代號，例如：2330 或 台積電'); return; }
  const stock = resolveStock(v);
  if(!stock){
    showSearchMessage(`目前前端識別器找不到「${v}」。完整股票名單將由後端資料來源補上。`);
    return;
  }
  renderStock(stock);
  research.scrollIntoView({behavior:'smooth', block:'start'});
}

form.addEventListener('submit', e => { e.preventDefault(); searchStock(input.value); });

document.querySelectorAll('.hot-search button').forEach(btn => {
  btn.addEventListener('click', () => {
    input.value = btn.dataset.symbol;
    searchStock(btn.dataset.symbol);
  });
});


// 免責條款視窗：固定保留，任何研究頁面都可查看。
const disclaimerModal = document.getElementById('disclaimerModal');
const openDisclaimer = () => {
  disclaimerModal.classList.add('open');
  disclaimerModal.setAttribute('aria-hidden', 'false');
};
const closeDisclaimer = () => {
  disclaimerModal.classList.remove('open');
  disclaimerModal.setAttribute('aria-hidden', 'true');
};
document.getElementById('openDisclaimer')?.addEventListener('click', openDisclaimer);
document.getElementById('openDisclaimerFooter')?.addEventListener('click', openDisclaimer);
document.querySelectorAll('[data-close-disclaimer]').forEach(el => el.addEventListener('click', closeDisclaimer));
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeDisclaimer(); });

renderStock(currentStock);


// v7：AI 研究助手示範流程。正式版由後端提供經來源政策檢查的資料。
const assistantForm = document.getElementById('assistantForm');
const assistantInput = document.getElementById('assistantInput');
const assistantChat = document.getElementById('assistantChat');

function addChatMessage(role, html){
  const item = document.createElement('div');
  item.className = `chat-message ${role === 'user' ? 'user-message' : 'ai-message'}`;
  item.innerHTML = role === 'user'
    ? `<div class="chat-bubble"><strong>你</strong><p>${html}</p></div>`
    : `<div class="chat-avatar">✦</div><div class="chat-bubble"><strong>StockAI</strong>${html}</div>`;
  assistantChat.appendChild(item);
  assistantChat.scrollTop = assistantChat.scrollHeight;
}

function demoAnswer(question){
  const stock = currentStock;
  const q = question.toLowerCase();
  let focus = '目前示範模式不會自行編造即時數字。正式版會先取得通過來源政策檢查的資料，再交給 AI 整理。';
  if(q.includes('公告') || q.includes('消息') || q.includes('新聞')){
    focus = `針對「${stock.name}」，正式版會優先整理 MOPS 的重大訊息與公司公告，再視授權條件加入新聞來源。回答會區分「公司正式公告」與「媒體報導」，避免把兩者混在一起。`;
  } else if(q.includes('財務') || q.includes('eps') || q.includes('營收')){
    focus = `針對「${stock.name}」，正式版會整理 MOPS 的月營收、各季損益、資產負債表、現金流量表及財務比率，並標示資料期間。MOPS 官方目前提供這些資料類別。`;
  } else if(q.includes('風險') || q.includes('注意')){
    focus = `針對「${stock.name}」，正式版會從公司公告、財務資料及可合法使用的公開資訊中整理「值得進一步查證的事項」，不會直接轉成買進或賣出指令。`;
  }
  return `<p>${focus}</p><div class="evidence-box"><strong>資料來源規則</strong><span>MOPS／官方公開資料優先</span><span>每項回答標示資料日期與原始連結</span><span>未確認授權的行情資料不直接顯示</span></div><div class="chat-disclaimer">⚠️ 免責聲明：本內容僅供公開資訊整理與研究參考，不構成投資建議、買賣推薦或任何獲利保證；正式版仍應以原始資料及公司正式公告為準。</div>`;
}

async function askBackend(question, stock = currentStock){
  const cfg = window.STOCKAI_CONFIG || {};
  if(!cfg.ENABLE_LIVE_BACKEND || !cfg.API_BASE_URL) return null;
  const response = await fetch(`${cfg.API_BASE_URL.replace(/\/$/, '')}/api/research`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({stock: stock.symbol, question})
  });
  const data = await response.json();
  if(!response.ok || !data.ok) throw new Error(data.error || '後端沒有回傳成功結果');
  return data;
}

async function loadAiSummary(stock){
  const content = document.getElementById('aiSummaryContent');
  const card = document.getElementById('aiSummaryCard');
  if(!content || !stock?.symbol) return;

  const symbol = String(stock.symbol);
  let entry = aiSummaryRequests.get(symbol);
  if(entry?.data){
    if(currentStock.symbol === symbol){
      content.innerHTML = liveAnswer(entry.data);
      card?.setAttribute('aria-busy', 'false');
    }
    return;
  }
  if(entry?.promise) return entry.promise;

  if(!entry){
    entry = {data: null, promise: null};
    aiSummaryRequests.set(symbol, entry);
  }
  content.innerHTML = '<p>正在整理個股 AI 分析摘要…</p>';
  card?.setAttribute('aria-busy', 'true');

  entry.promise = (async () => {
    try{
      const question = '請根據目前取得的公開資料，摘要整理這家公司近期的財務表現、營運重點與主要風險；引用可取得的關鍵數字及資料期間，若資料不足請明確說明。';
      const data = await askBackend(question, stock);
      if(!data) throw new Error('AI 後端目前無法使用。');
      entry.data = data;
      if(currentStock.symbol === symbol){
        content.innerHTML = liveAnswer(data);
        card?.setAttribute('aria-busy', 'false');
      }
    }catch(_err){
      aiSummaryRequests.delete(symbol);
      if(currentStock.symbol === symbol){
        content.innerHTML = '<p>目前無法取得 AI 個股摘要，請稍後再試。下方互動式 AI 助手仍可繼續使用。</p>';
        card?.setAttribute('aria-busy', 'false');
      }
    }finally{
      entry.promise = null;
    }
  })();
  return entry.promise;
}

function liveAnswer(data){
  const statusBadge = document.getElementById('aiStatusBadge');
  if(statusBadge && data.mode === 'live') statusBadge.textContent = 'LIVE · AI 已連線';
  else if(statusBadge && data.mode === 'demo') statusBadge.textContent = 'DEMO · 示範模式';
  const evidence = (data.evidence || []).map(item => `
    <a href="${item.url}" target="_blank" rel="noopener noreferrer"><strong>${item.source}</strong> · ${item.date}</a>
  `).join('');
  return `<p>${escapeHtml(data.answer || 'AI 沒有回傳可顯示的內容。')}</p>
    <div class="evidence-box"><strong>資料來源</strong>${evidence || '<span>目前沒有可顯示的來源</span>'}</div>
    <div class="chat-disclaimer">⚠️ 免責聲明：${escapeHtml(data.disclaimer || '本內容僅供公開資訊整理與研究參考，不構成投資建議、買賣推薦或任何獲利保證。')}</div>`;
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

assistantForm?.addEventListener('submit', async e => {
  e.preventDefault();
  const q = assistantInput.value.trim();
  if(!q) return;
  addChatMessage('user', escapeHtml(q));
  assistantInput.value = '';
  const loading = document.createElement('div');
  loading.className = 'chat-message ai-message';
  loading.innerHTML = '<div class="chat-avatar">✦</div><div class="chat-bubble"><strong>StockAI</strong><p>正在整理資料…</p></div>';
  assistantChat.appendChild(loading);
  assistantChat.scrollTop = assistantChat.scrollHeight;
  try {
    const data = await askBackend(q);
    loading.remove();
    if(data) addChatMessage('ai', liveAnswer(data));
    else addChatMessage('ai', demoAnswer(q));
  } catch(err){
    loading.remove();
    addChatMessage('ai', `<p>目前無法連線到 StockAI 後端。這次沒有假裝成真正的 AI 回答。</p><div class="evidence-box"><strong>狀態</strong><span>請確認 Cloudflare Worker URL 與部署設定</span></div><div class="chat-disclaimer">⚠️ 免責聲明：${escapeHtml('本內容僅供公開資訊整理與研究參考，不構成投資建議、買賣推薦或任何獲利保證。')}</div>`);
  }
});

// 快速提問直接帶入 AI 助手，而不是只改標題。
document.querySelectorAll('.question-chips button').forEach(btn => {
  btn.addEventListener('click', () => {
    if(assistantInput){
      assistantInput.value = btn.textContent.trim();
      document.getElementById('aiAssistant')?.scrollIntoView({behavior:'smooth', block:'center'});
      setTimeout(() => assistantInput.focus(), 350);
    }
  });
});

const diagnosticBtn=document.getElementById('diagnosticBtn');
if(diagnosticBtn){ diagnosticBtn.addEventListener('click',()=>runBackendDiagnostics(currentStock||{symbol:'2330',name:'台積電'})); }
