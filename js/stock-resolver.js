// StockAI 第一階段：股票識別器
// 正式版會由後端/資料來源適配器補上完整名單；前端只保留少量常用查詢作為快速入口。
const STOCK_INDEX = [
  { symbol:'2330', name:'台積電', fullName:'台灣積體電路製造股份有限公司', market:'TWSE', industry:'半導體' },
  { symbol:'2317', name:'鴻海', fullName:'鴻海精密工業股份有限公司', market:'TWSE', industry:'電子零組件' },
  { symbol:'2454', name:'聯發科', fullName:'聯發科技股份有限公司', market:'TWSE', industry:'半導體' },
  { symbol:'0050', name:'元大台灣50', fullName:'元大台灣卓越50證券投資信託基金', market:'TWSE', industry:'ETF' },
  { symbol:'2308', name:'台達電', fullName:'台達電子工業股份有限公司', market:'TWSE', industry:'電子零組件' },
  { symbol:'2303', name:'聯電', fullName:'聯華電子股份有限公司', market:'TWSE', industry:'半導體' },
  { symbol:'2881', name:'富邦金', fullName:'富邦金融控股股份有限公司', market:'TWSE', industry:'金融保險' },
  { symbol:'2882', name:'國泰金', fullName:'國泰金融控股股份有限公司', market:'TWSE', industry:'金融保險' }
];

function resolveStock(input){
  const q = String(input || '').trim().toLowerCase();
  if(!q) return null;
  return STOCK_INDEX.find(s => s.symbol === q || s.name.toLowerCase() === q || s.fullName.toLowerCase() === q)
    || (likeMatch(q) ? likeMatch(q) : null);
}

function likeMatch(q){
  return STOCK_INDEX.find(s => s.name.includes(q) || s.fullName.includes(q));
}

function officialSources(stock){
  return [
    {
      label:'公開資訊觀測站（MOPS）',
      type:'公司公告／財務／營運',
      url: stock?.symbol ? `https://mops.twse.com.tw/mops/web/t05st01?co_id=${encodeURIComponent(stock.symbol)}&firstin=true&step=1` : 'https://mops.twse.com.tw/',
      note:'正式版將優先從官方公開資訊整理。'
    },
    {
      label:'政府資料開放平臺',
      type:'公司基本資料／公開資料',
      url:'https://data.gov.tw/',
      note:'部分上市櫃公司資料集標示為免費，並採政府資料開放授權條款；正式使用仍逐資料集確認授權。'
    }
  ];
}
