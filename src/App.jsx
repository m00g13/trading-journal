import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, BarChart, Bar, ScatterChart, Scatter, Cell
} from "recharts";

// ─── design tokens ────────────────────────────────────────────────────────
const FONT_DISPLAY = "'Cormorant Garamond', Georgia, serif";
const FONT_MONO    = "'IBM Plex Mono', 'Courier New', monospace";
const C = {
  bg:"#080b10", surface:"#0d1118", border:"#1c2230",
  gold:"#c9a84c", silver:"#8ea0b8", green:"#4caf82", red:"#c94c4c",
  muted:"#7a8fa8", text:"#f0f4ff", dim:"#9aaabb",
};

// ─── helpers ──────────────────────────────────────────────────────────────
const fmt    = (n, d=2) => n == null ? "—" : Number(n).toFixed(d);
const fmtCcy = n => n == null ? "—" : `${n>=0?"+":"-"}$${Math.abs(n).toFixed(0)}`;
const fmtPct = n => n == null ? "—" : `${n>=0?"+":""}${n.toFixed(2)}%`;
const clamp  = (v,a,b) => Math.max(a, Math.min(b, v));

// ─── moon ─────────────────────────────────────────────────────────────────
function moonPhase(dateStr) {
  if (!dateStr) return 0;
  const d = new Date(dateStr), known = new Date("2000-01-06");
  const diff = (d - known) / (1000*60*60*24), cycle = 29.53058867;
  return (((diff % cycle) + cycle) % cycle) / cycle;
}
function moonName(p) {
  if (p < 0.03 || p > 0.97) return "New Moon";
  if (p < 0.22) return "Waxing Crescent";
  if (p < 0.28) return "First Quarter";
  if (p < 0.47) return "Waxing Gibbous";
  if (p < 0.53) return "Full Moon";
  if (p < 0.72) return "Waning Gibbous";
  if (p < 0.78) return "Last Quarter";
  return "Waning Crescent";
}
const moonEmoji = p => ["🌑","🌒","🌓","🌔","🌕","🌖","🌗","🌘"][Math.round(p*8)%8];

// ─── sector map ───────────────────────────────────────────────────────────
const SECTOR_MAP = {
  NVDA:"XLK",AMD:"XLK",AAPL:"XLK",META:"XLK",MSFT:"XLK",GOOG:"XLK",GOOGL:"XLK",
  TSLA:"XLY",AMZN:"XLY", SPY:"SPY",QQQ:"QQQ",IWM:"IWM",
  JPM:"XLF",GS:"XLF",BAC:"XLF", XOM:"XLE",CVX:"XLE", JNJ:"XLV",PFE:"XLV",
};
const sectorFor = sym => SECTOR_MAP[sym] || "XLK";

// ─── demo trades ──────────────────────────────────────────────────────────
const DEMO = [
  {id:1, buyDate:"2026-05-01",buyTime:"09:32",sellDate:"2026-05-01",sellTime:"11:46",symbol:"NVDA",side:"LONG", qty:50, entryPrice:892.4,exitPrice:921.0,pnl:1430,notes:"Strong open, held through dip. Good discipline."},
  {id:2, buyDate:"2026-05-01",buyTime:"13:45",sellDate:"2026-05-01",sellTime:"14:30",symbol:"TSLA",side:"LONG", qty:100,entryPrice:178.2,exitPrice:174.5,pnl:-370,notes:"Chased the move. Should have waited for pullback."},
  {id:3, buyDate:"2026-05-02",buyTime:"10:11",sellDate:"2026-05-02",sellTime:"11:13",symbol:"TSLA",side:"LONG", qty:200,entryPrice:174.0,exitPrice:170.1,pnl:-780,notes:"Revenge trade after yesterday. Classic mistake."},
  {id:4, buyDate:"2026-05-02",buyTime:"14:30",sellDate:"2026-05-02",sellTime:"15:40",symbol:"AAPL",side:"LONG", qty:80, entryPrice:211.5,exitPrice:218.9,pnl:592, notes:"Clean breakout, held target."},
  {id:5, buyDate:"2026-05-05",buyTime:"09:45",sellDate:"2026-05-05",sellTime:"14:15",symbol:"SPY", side:"LONG", qty:30, entryPrice:521.0,exitPrice:528.4,pnl:222, notes:"Macro play, worked fine."},
  {id:6, buyDate:"2026-05-06",buyTime:"11:00",sellDate:"2026-05-06",sellTime:"12:55",symbol:"NVDA",side:"SHORT",qty:40, entryPrice:934.0,exitPrice:918.5,pnl:620, notes:"Shorted the resistance level perfectly."},
  {id:7, buyDate:"2026-05-07",buyTime:"09:31",sellDate:"2026-05-07",sellTime:"09:53",symbol:"META",side:"LONG", qty:25, entryPrice:512.0,exitPrice:508.0,pnl:-100,notes:"FOMO open. Too early."},
  {id:8, buyDate:"2026-05-07",buyTime:"10:05",sellDate:"2026-05-07",sellTime:"11:03",symbol:"META",side:"LONG", qty:50, entryPrice:507.5,exitPrice:503.0,pnl:-225,notes:"Doubled down after loss. Bad."},
  {id:9, buyDate:"2026-05-08",buyTime:"13:00",sellDate:"2026-05-08",sellTime:"15:40",symbol:"AMD", side:"LONG", qty:120,entryPrice:164.2,exitPrice:171.8,pnl:912, notes:"Patient entry, let it run."},
  {id:10,buyDate:"2026-05-09",buyTime:"15:20",sellDate:"2026-05-09",sellTime:"15:55",symbol:"QQQ", side:"SHORT",qty:60, entryPrice:448.0,exitPrice:444.5,pnl:210, notes:"EOD fade. Worked clean."},
];

// ─── localStorage persistence ─────────────────────────────────────────────
const STORAGE_KEY = "trading_journal_v1";

function loadTrades() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return { trades: parsed, isDemo: false };
    }
  } catch {}
  return { trades: DEMO, isDemo: true };
}

function saveTrades(trades) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trades)); } catch {}
}

// ─── CSV parser (IBKR) ────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const hdr = lines[0].split(",").map(h => h.replace(/"/g,"").trim().toLowerCase());
  const ix = k => hdr.findIndex(h => h.includes(k));
  const iD=ix("date"),iSy=ix("symbol"),iQ=ix("qty"),iPr=ix("price"),iRL=ix("realized");
  return lines.slice(1).map((l,i) => {
    const c = l.split(",").map(x => x.replace(/"/g,"").trim());
    const pnl=parseFloat(c[iRL]||0), qty=Math.abs(parseFloat(c[iQ]||0)), price=parseFloat(c[iPr]||0);
    const date = c[iD] || "";
    return { id: Date.now()+i, buyDate:date, buyTime:"—", sellDate:date, sellTime:"—",
      symbol:c[iSy]||"?", side:pnl>=0?"LONG":"SHORT", qty, entryPrice:price,
      exitPrice:price+pnl/(qty||1), pnl, notes:"" };
  }).filter(t => t.symbol && t.qty);
}

// ─── Yahoo Finance via proxy ───────────────────────────────────────────────
async function fetchYahoo(symbol, from, to) {
  try {
    const f = Math.floor(new Date(from).getTime()/1000) - 86400;
    const t = Math.floor(new Date(to).getTime()/1000) + 86400;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${f}&period2=${t}&interval=1d`;
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxy);
    const json = await res.json();
    const parsed = JSON.parse(json.contents);
    const ts = parsed.chart.result[0].timestamp;
    const closes = parsed.chart.result[0].indicators.quote[0].close;
    const priceMap = {};
    ts.forEach((t,i) => { priceMap[new Date(t*1000).toISOString().slice(0,10)] = closes[i]; });
    const sorted = Object.keys(priceMap).sort();
    const pct = {};
    sorted.forEach((d,i) => {
      if (i===0) { pct[d]=0; return; }
      const prev = priceMap[sorted[i-1]];
      pct[d] = prev ? ((priceMap[d]-prev)/prev)*100 : 0;
    });
    return pct;
  } catch { return {}; }
}

// ─── TradingView URL builder ──────────────────────────────────────────────
// Opens chart at the symbol. TradingView doesn't support deep-linking to a
// specific date in the URL, so we record the OHLC snapshot permanently instead.
function tvUrl(symbol, interval="D") {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}&interval=${interval}`;
}

// ─── fetch OHLC snapshot for a single date ────────────────────────────────
async function fetchOHLC(symbol, date) {
  try {
    const d   = new Date(date);
    const f   = Math.floor(d.getTime()/1000) - 86400*3; // 3 days buffer for weekends
    const t   = Math.floor(d.getTime()/1000) + 86400;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${f}&period2=${t}&interval=1d`;
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res  = await fetch(proxy);
    const json = await res.json();
    const parsed = JSON.parse(json.contents);
    const result = parsed.chart.result[0];
    const ts     = result.timestamp;
    const q      = result.indicators.quote[0];
    // find the index closest to our target date
    const target = d.toISOString().slice(0,10);
    let best = 0;
    ts.forEach((t,i) => {
      const td = new Date(t*1000).toISOString().slice(0,10);
      if (td <= target) best = i;
    });
    return {
      date,
      open:  q.open[best]?.toFixed(2),
      high:  q.high[best]?.toFixed(2),
      low:   q.low[best]?.toFixed(2),
      close: q.close[best]?.toFixed(2),
      volume: q.volume[best],
      fetchedAt: new Date().toISOString(),
    };
  } catch { return null; }
}

// ─── stats ────────────────────────────────────────────────────────────────
function calcStats(trades) {
  if (!trades.length) return { total:0, winRate:0, wins:0, losses:0, avgWin:0, avgLoss:0, rrRatio:null, bySymbol:{} };
  const wins = trades.filter(t => t.pnl > 0), losses = trades.filter(t => t.pnl <= 0);
  const total = trades.reduce((a,t) => a+t.pnl, 0);
  const avgWin = wins.length ? wins.reduce((a,t) => a+t.pnl, 0)/wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a,t) => a+t.pnl, 0)/losses.length : 0;
  const bySymbol = {};
  trades.forEach(t => { bySymbol[t.symbol] = (bySymbol[t.symbol]||0) + t.pnl; });
  return { total, winRate:(wins.length/trades.length)*100, wins:wins.length, losses:losses.length, avgWin, avgLoss, rrRatio: avgLoss!==0 ? Math.abs(avgWin/avgLoss) : null, bySymbol };
}

function buildEquity(trades) {
  let cum = 0;
  return trades.map(t => { cum += t.pnl; return { date:t.buyDate, symbol:t.symbol, pnl:t.pnl, cum }; });
}

function buildHeatmap(trades) {
  const b = {};
  trades.forEach(t => {
    const hr = t.buyTime && t.buyTime !== "—" ? parseInt(t.buyTime.split(":")[0]) : null;
    if (hr == null) return;
    if (!b[hr]) b[hr] = { hour:hr, pnl:0, count:0 };
    b[hr].pnl += t.pnl; b[hr].count++;
  });
  return Object.values(b).sort((a,z) => a.hour-z.hour).map(b => ({ ...b, avg:b.pnl/b.count, label:`${b.hour}:00` }));
}

const PHASES = ["New Moon","Waxing Crescent","First Quarter","Waxing Gibbous","Full Moon","Waning Gibbous","Last Quarter","Waning Crescent"];
const PHASE_EMOJI = ["🌑","🌒","🌓","🌔","🌕","🌖","🌗","🌘"];

function buildMoonData(trades) {
  const buyMap = {}, sellMap = {};
  PHASES.forEach(p => { buyMap[p]={phase:p,pnl:0,count:0}; sellMap[p]={phase:p,pnl:0,count:0}; });
  trades.forEach(t => {
    const bp = moonName(moonPhase(t.buyDate));
    const sp = moonName(moonPhase(t.sellDate || t.buyDate));
    buyMap[bp].pnl += t.pnl; buyMap[bp].count++;
    sellMap[sp].pnl += t.pnl; sellMap[sp].count++;
  });
  return PHASES.map((p,i) => ({
    phase:p, emoji:PHASE_EMOJI[i],
    buyAvg:  buyMap[p].count  ? buyMap[p].pnl/buyMap[p].count   : null,
    sellAvg: sellMap[p].count ? sellMap[p].pnl/sellMap[p].count : null,
    buyCount: buyMap[p].count, sellCount: sellMap[p].count,
  }));
}

// ─── AI analysis ──────────────────────────────────────────────────────────
async function analyzeWithAI(trades, mktData) {
  const rows = trades.map(t => {
    const bmp = moonName(moonPhase(t.buyDate));
    const smp = moonName(moonPhase(t.sellDate || t.buyDate));
    const spy = mktData.SPY?.[t.buyDate];
    const sec = mktData[sectorFor(t.symbol)]?.[t.buyDate];
    return `${t.buyDate} ${t.buyTime}→${t.sellDate} ${t.sellTime} | ${t.symbol} | ${t.side} ${t.qty}sh | Entry $${t.entryPrice} | Exit $${t.exitPrice} | P&L ${fmtCcy(t.pnl)} | Buy moon: ${bmp} | Sell moon: ${smp} | SPY ${spy?fmtPct(spy):"?"} | Sector ${sec?fmtPct(sec):"?"} | Notes: "${t.notes||"none"}"`;
  }).join("\n");

  const prompt = `You are an expert trading coach. Analyze these trades with full context including trader notes:

${rows}

Provide:
1. **WINNING PATTERNS** — What conditions drive wins? Note time, sector, SPY direction, moon phases if notable.
2. **LOSING PATTERNS** — Where is money lost? Any patterns in timing, symbol, or market context?
3. **REVENGE / EMOTIONAL TRADES** — Flag specific trades that look reactive. Cross-reference with the trader's own notes.
4. **EXECUTION GRADE** — Letter grade A–F with brief reasoning.
5. **TOP 3 IMPROVEMENTS** — Specific, prioritized actions.

Be direct. Use trader language. The trader's notes are first-person reflections — take them seriously when they admit mistakes.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000, messages:[{role:"user",content:prompt}] })
  });
  const data = await res.json();
  return data.content?.map(b => b.text||"").join("") || "No analysis returned.";
}

// ─── markdown renderer ────────────────────────────────────────────────────
function MD({ text }) {
  return <div style={{ lineHeight:1.75, fontSize:13, fontFamily:FONT_MONO }}>
    {text.split("\n").map((line,i) => {
      if (/^\*\*(.+)\*\*$/.test(line)) return <h4 key={i} style={{ color:C.gold, margin:"18px 0 6px", fontFamily:FONT_DISPLAY, fontSize:15, fontWeight:600, letterSpacing:1 }}>{line.replace(/\*\*/g,"")}</h4>;
      if (/\*\*/.test(line)) { const parts=line.split(/\*\*(.+?)\*\*/g); return <p key={i} style={{ margin:"3px 0", color:C.silver }}>{parts.map((p,j) => j%2===1 ? <strong key={j} style={{ color:C.text }}>{p}</strong> : p)}</p>; }
      if (/^[-•]/.test(line)) return <li key={i} style={{ marginLeft:20, color:C.dim, marginBottom:4 }}>{line.replace(/^[-•]\s*/,"")}</li>;
      if (/^\d+\./.test(line)) return <li key={i} style={{ marginLeft:20, color:C.silver, marginBottom:4 }}>{line.replace(/^\d+\.\s*/,"")}</li>;
      if (!line.trim()) return <br key={i}/>;
      return <p key={i} style={{ margin:"3px 0", color:C.dim }}>{line}</p>;
    })}
  </div>;
}

// ─── blank trade form ─────────────────────────────────────────────────────
const blankTrade = () => ({
  id: Date.now(), buyDate:"", buyTime:"", sellDate:"", sellTime:"",
  symbol:"", side:"LONG", qty:"", entryPrice:"", exitPrice:"", pnl:"", notes:""
});

// ══════════════════════════════════════════════════════════════════════════
export default function TradingJournal() {
  const init = loadTrades();
  const [trades,   setTrades]   = useState(init.trades);
  const [isDemo,   setIsDemo]   = useState(init.isDemo);
  const [tab,      setTab]      = useState("dashboard");
  const [mktData,  setMktData]  = useState({});
  const [mktLoad,  setMktLoad]  = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [aiLoad,   setAiLoad]   = useState(false);
  const [msg,      setMsg]      = useState("");
  const [msgOk,    setMsgOk]    = useState(false);
  const [noteEdit, setNoteEdit] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState(blankTrade());
  const [formErr,   setFormErr]   = useState("");
  const [ohlcLoad,  setOhlcLoad]  = useState({});   // { tradeId: true/false }

  // persist on every change
  useEffect(() => { if (!isDemo) saveTrades(trades); }, [trades, isDemo]);

  const stats    = calcStats(trades);
  const equity   = buildEquity(trades);
  const heatmap  = buildHeatmap(trades);
  const moonData = buildMoonData(trades);
  const bySymbol = Object.entries(stats.bySymbol).map(([sym,pnl]) => ({ sym, pnl }));
  const dates    = trades.map(t => t.buyDate).sort();
  const dateFrom = dates[0] || "2026-01-01";
  const dateTo   = dates[dates.length-1] || "2026-12-31";

  // enrich with moon + market
  const enriched = trades.map(t => {
    const bmp = moonPhase(t.buyDate), smp = moonPhase(t.sellDate || t.buyDate);
    return { ...t,
      buyMoonP:bmp, buyMoonName:moonName(bmp), buyMoonEmoji:moonEmoji(bmp),
      sellMoonP:smp, sellMoonName:moonName(smp), sellMoonEmoji:moonEmoji(smp),
      spy: mktData.SPY?.[t.buyDate],
      sector: mktData[sectorFor(t.symbol)]?.[t.buyDate],
      sectorSym: sectorFor(t.symbol),
    };
  });

  const mktChart = [...new Set(dates)].map(d => ({
    date:d, SPY:mktData.SPY?.[d]??null, QQQ:mktData.QQQ?.[d]??null,
  }));

  // ── market fetch ───────────────────────────────────────────────────────
  const fetchMarket = useCallback(async () => {
    setMktLoad(true);
    const syms = [...new Set(["SPY","QQQ",...trades.map(t => sectorFor(t.symbol))])];
    const results = {};
    await Promise.all(syms.map(async sym => { results[sym] = await fetchYahoo(sym, dateFrom, dateTo); }));
    setMktData(results); setMktLoad(false);
    setMsg(`✓ Market data loaded for ${syms.join(", ")}`); setMsgOk(true);
  }, [trades, dateFrom, dateTo]);

  // ── IBKR ──────────────────────────────────────────────────────────────
  const connectIBKR = async () => {
    setMsg("Connecting to IBKR…"); setMsgOk(false);
    try {
      const authRes = await fetch("https://localhost:5000/v1/api/iserver/auth/status");
      if (!authRes.ok) throw new Error("Gateway not authenticated");
      const acctData = await (await fetch("https://localhost:5000/v1/api/iserver/accounts")).json();
      const accountId = acctData.accounts?.[0];
      if (!accountId) throw new Error("No account found");
      const raw = await (await fetch(`https://localhost:5000/v1/api/iserver/account/${accountId}/trades`)).json();
      const parsed = (raw||[]).map((t,i) => ({
        id:Date.now()+i, buyDate:t.trade_time?.split(" ")[0]||"—", buyTime:t.trade_time?.split(" ")[1]?.slice(0,5)||"—",
        sellDate:t.trade_time?.split(" ")[0]||"—", sellTime:"—",
        symbol:t.symbol||"?", side:t.side==="S"?"SHORT":"LONG",
        qty:Math.abs(t.size||0), entryPrice:t.price||0, exitPrice:t.price||0, pnl:t.realizedPL||0, notes:""
      }));
      setTrades(parsed); setIsDemo(false);
      setMsg(`✓ Loaded ${parsed.length} trades from account ${accountId}`); setMsgOk(true);
    } catch(e) {
      setMsg(`✗ ${e.message} — start IBKR Client Portal Gateway at localhost:5000, or upload a CSV`); setMsgOk(false);
    }
  };

  // ── CSV upload ────────────────────────────────────────────────────────
  const handleCSV = e => {
    const file = e.target.files?.[0]; if (!file) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const p = parseCSV(ev.target.result);
        setTrades(prev => {
          // merge: keep existing, add new by id
          const existingIds = new Set(prev.map(t => `${t.buyDate}-${t.symbol}-${t.qty}`));
          const newTrades = p.filter(t => !existingIds.has(`${t.buyDate}-${t.symbol}-${t.qty}`));
          return [...prev.filter(t => !isDemo), ...newTrades];
        });
        setIsDemo(false);
        setMsg(`✓ Imported ${p.length} trades from CSV`); setMsgOk(true);
      } catch {
        setMsg("✗ Could not parse CSV — use IBKR Trade Confirmation export"); setMsgOk(false);
      }
    };
    r.readAsText(file);
  };

  // ── manual trade add ──────────────────────────────────────────────────
  const submitForm = () => {
    if (!form.symbol || !form.buyDate || !form.entryPrice || !form.exitPrice || !form.qty) {
      setFormErr("Symbol, buy date, qty, entry and exit price are required."); return;
    }
    const qty = parseFloat(form.qty), entry = parseFloat(form.entryPrice), exit = parseFloat(form.exitPrice);
    const pnl = form.side === "LONG" ? (exit - entry) * qty : (entry - exit) * qty;
    const trade = { ...form, id:Date.now(), qty, entryPrice:entry, exitPrice:exit, pnl:parseFloat(form.pnl)||pnl };
    setTrades(prev => {
      const next = [...prev.filter(t => !isDemo), trade];
      saveTrades(next); return next;
    });
    setIsDemo(false); setForm(blankTrade()); setShowForm(false); setFormErr("");
    setMsg(`✓ Trade added: ${trade.symbol} ${fmtCcy(trade.pnl)}`); setMsgOk(trade.pnl >= 0);
  };

  // ── fetch & store OHLC snapshot for buy + sell dates ─────────────────
  const fetchSnapshot = async (trade) => {
    setOhlcLoad(prev => ({ ...prev, [trade.id]: true }));
    const [buyOHLC, sellOHLC] = await Promise.all([
      fetchOHLC(trade.symbol, trade.buyDate),
      trade.sellDate && trade.sellDate !== trade.buyDate
        ? fetchOHLC(trade.symbol, trade.sellDate)
        : Promise.resolve(null),
    ]);
    setTrades(prev => {
      const next = prev.map(t => t.id === trade.id
        ? { ...t, buyOHLC, sellOHLC: sellOHLC || buyOHLC }
        : t
      );
      saveTrades(next);
      return next;
    });
    setOhlcLoad(prev => ({ ...prev, [trade.id]: false }));
  };

  const deleteTrade = id => {
    if (!confirm("Delete this trade?")) return;
    setTrades(prev => { const next = prev.filter(t => t.id !== id); saveTrades(next); return next; });
  };

  const saveNote = id => {
    setTrades(prev => { const next = prev.map(t => t.id===id ? {...t, notes:noteText} : t); saveTrades(next); return next; });
    setNoteEdit(null);
  };

  // ── AI ────────────────────────────────────────────────────────────────
  const runAI = async () => {
    setAiLoad(true); setAnalysis("");
    try { setAnalysis(await analyzeWithAI(trades, mktData)); }
    catch(e) { setAnalysis("Error: "+e.message); }
    setAiLoad(false);
  };

  // ── styles ────────────────────────────────────────────────────────────
  const S = {
    app:    { minHeight:"100vh", background:C.bg, color:C.text, fontFamily:FONT_MONO },
    hdr:    { background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"16px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 },
    logo:   { fontFamily:FONT_DISPLAY, fontSize:24, color:C.gold, letterSpacing:2, fontWeight:600 },
    badge:  ok => ({ fontSize:9, padding:"3px 8px", borderRadius:2, letterSpacing:1, textTransform:"uppercase", background:ok?"#0e2018":"#200e0e", color:ok?C.green:C.red, border:`1px solid ${ok?"#2a5040":"#502a2a"}`, marginLeft:10 }),
    tabs:   { background:"#090d14", borderBottom:`1px solid ${C.border}`, display:"flex", padding:"0 24px", gap:2, overflowX:"auto" },
    tab:    a => ({ padding:"11px 18px", fontSize:10, letterSpacing:1.5, textTransform:"uppercase", cursor:"pointer", background:"none", border:"none", borderBottom:a?`2px solid ${C.gold}`:"2px solid transparent", color:a?C.gold:C.silver, fontFamily:FONT_MONO, transition:"all 0.12s", whiteSpace:"nowrap" }),
    body:   { padding:"24px" },
    grid:   { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:10, marginBottom:20 },
    card:   { background:C.surface, border:`1px solid ${C.border}`, borderRadius:4, padding:"14px 18px" },
    lbl:    { fontSize:9, color:C.muted, textTransform:"uppercase", letterSpacing:1.5, marginBottom:5 },
    val:    c => ({ fontSize:20, fontFamily:FONT_DISPLAY, fontWeight:700, color:c }),
    sec:    { background:C.surface, border:`1px solid ${C.border}`, borderRadius:4, padding:"18px 22px", marginBottom:16 },
    secTtl: { fontSize:9, color:C.muted, textTransform:"uppercase", letterSpacing:2, marginBottom:14 },
    btn:    { background:C.gold, color:"#080b10", border:"none", borderRadius:3, padding:"8px 16px", fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", cursor:"pointer", fontFamily:FONT_MONO },
    btnG:   { background:"transparent", color:C.gold, border:`1px solid ${C.gold}`, borderRadius:3, padding:"7px 14px", fontSize:10, letterSpacing:1.5, textTransform:"uppercase", cursor:"pointer", fontFamily:FONT_MONO },
    btnR:   { background:"transparent", color:C.red, border:`1px solid #502a2a`, borderRadius:3, padding:"4px 10px", fontSize:9, letterSpacing:1, textTransform:"uppercase", cursor:"pointer", fontFamily:FONT_MONO },
    th:     { padding:"7px 10px", textAlign:"left", color:C.muted, fontSize:9, letterSpacing:1.5, textTransform:"uppercase", borderBottom:`1px solid ${C.border}` },
    td:     { padding:"9px 10px", borderBottom:`1px solid #111820`, fontSize:12 },
    pnlC:   n => ({ color:n>0?C.green:n<0?C.red:C.muted, fontWeight:600 }),
    inp:    { background:C.bg, border:`1px solid ${C.border}`, borderRadius:3, color:C.text, padding:"6px 10px", fontSize:12, fontFamily:FONT_MONO, width:"100%" },
    sel:    { background:C.bg, border:`1px solid ${C.border}`, borderRadius:3, color:C.text, padding:"6px 10px", fontSize:12, fontFamily:FONT_MONO, width:"100%" },
    fRow:   { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 },
    fLbl:   { fontSize:9, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:4 },
  };

  const CTip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return <div style={{ background:"#0d1520", border:`1px solid ${C.border}`, borderRadius:4, padding:"10px 14px", fontSize:11, fontFamily:FONT_MONO }}>
      <div style={{ color:C.gold }}>{d.date}{d.symbol?` · ${d.symbol}`:""}</div>
      {d.pnl != null && <div style={S.pnlC(d.pnl)}>Trade: {fmtCcy(d.pnl)}</div>}
      {d.cum != null && <div style={{ color:C.silver }}>Cumulative: {fmtCcy(d.cum)}</div>}
      {d.avg != null && <div style={S.pnlC(d.avg)}>Avg P&L: {fmtCcy(d.avg)}</div>}
    </div>;
  };

  // ── form field helper ─────────────────────────────────────────────────
  const Field = ({ label, field, type="text", opts }) => (
    <div>
      <div style={S.fLbl}>{label}</div>
      {opts
        ? <select style={S.sel} value={form[field]} onChange={e => setForm(f=>({...f,[field]:e.target.value}))}>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        : <input style={S.inp} type={type} value={form[field]} onChange={e => setForm(f=>({...f,[field]:e.target.value}))}/>
      }
    </div>
  );

  return (
    <div style={S.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Cormorant+Garamond:wght@500;600;700&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:${C.bg}; }
        ::-webkit-scrollbar-thumb { background:${C.border}; border-radius:3px; }
        ul,ol { list-style:none; }
        select option { background: #0d1118; }
      `}</style>

      {/* header */}
      <div style={S.hdr}>
        <div style={{ display:"flex", alignItems:"center" }}>
          <span style={S.logo}>◈ JOURNAL</span>
          <span style={S.badge(!isDemo)}>{isDemo?"demo":"live"}</span>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <button style={S.btnG} onClick={() => { setShowForm(v=>!v); setTab("trades"); }}>+ Add Trade</button>
          <button style={S.btnG} onClick={fetchMarket} disabled={mktLoad}>{mktLoad?"Fetching…":"Load Market Data"}</button>
          <label style={{ ...S.btnG, display:"inline-block", cursor:"pointer" }}>
            Upload CSV<input type="file" accept=".csv" onChange={handleCSV} style={{ display:"none" }}/>
          </label>
          <button style={S.btn} onClick={connectIBKR}>Connect IBKR</button>
        </div>
      </div>

      {msg && <div style={{ padding:"7px 24px", fontSize:11, background:msgOk?"#071510":"#150707", color:msgOk?C.green:C.red, borderBottom:`1px solid ${C.border}` }}>{msg}</div>}

      {/* tabs */}
      <div style={S.tabs}>
        {[["dashboard","Dashboard"],["trades","Trade Log"],["notes","Notes"],["charts","Charts"],["market","Market Context"],["moon","Moon & Time"],["analysis","AI Analysis"],["import","⬆ Import"]].map(([k,l]) => (
          <button key={k} style={S.tab(tab===k)} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div style={S.body}>

        {/* ═══ DASHBOARD ═══ */}
        {tab==="dashboard" && <>
          <div style={S.grid}>
            {[
              ["Total P&L", fmtCcy(stats.total), stats.total>0?C.green:C.red],
              ["Win Rate",  fmtPct(stats.winRate), stats.winRate>=50?C.green:C.red],
              ["Trades",    trades.length, C.text],
              ["W / L",     `${stats.wins} / ${stats.losses}`, C.silver],
              ["Avg Win",   fmtCcy(stats.avgWin), C.green],
              ["Avg Loss",  fmtCcy(stats.avgLoss), C.red],
              ["R:R",       stats.rrRatio ? fmt(stats.rrRatio)+"x" : "—", (stats.rrRatio||0)>=1?C.green:C.red],
            ].map(([l,v,c]) => (
              <div key={l} style={S.card}><div style={S.lbl}>{l}</div><div style={S.val(c)}>{v}</div></div>
            ))}
          </div>
          <div style={S.sec}>
            <div style={S.secTtl}>Equity Curve</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={equity} margin={{ top:5, right:10, left:0, bottom:0 }}>
                <XAxis dataKey="date" tick={{ fontSize:9, fill:C.muted }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize:9, fill:C.muted }} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}`}/>
                <Tooltip content={<CTip/>}/>
                <ReferenceLine y={0} stroke={C.border} strokeDasharray="4 4"/>
                <Line type="monotone" dataKey="cum" stroke={C.gold} strokeWidth={2} dot={{ r:3, fill:C.gold, strokeWidth:0 }}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={S.sec}>
            <div style={S.secTtl}>P&L by Symbol</div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={bySymbol} margin={{ top:5, right:10, left:0, bottom:0 }}>
                <XAxis dataKey="sym" tick={{ fontSize:9, fill:C.muted }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize:9, fill:C.muted }} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}`}/>
                <Tooltip formatter={v=>fmtCcy(v)} contentStyle={{ background:"#0d1520", border:`1px solid ${C.border}`, fontSize:11, fontFamily:FONT_MONO }}/>
                <Bar dataKey="pnl" radius={[3,3,0,0]}>{bySymbol.map((d,i)=><Cell key={i} fill={d.pnl>=0?C.green:C.red}/>)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>}

        {/* ═══ TRADE LOG ═══ */}
        {tab==="trades" && <>
          {showForm && (
            <div style={{ ...S.sec, marginBottom:16 }}>
              <div style={{ ...S.secTtl, marginBottom:16 }}>Add Trade Manually</div>
              <div style={S.fRow}>
                <Field label="Symbol" field="symbol"/>
                <Field label="Side" field="side" opts={["LONG","SHORT"]}/>
              </div>
              <div style={S.fRow}>
                <Field label="Buy Date" field="buyDate" type="date"/>
                <Field label="Buy Time" field="buyTime" type="time"/>
              </div>
              <div style={S.fRow}>
                <Field label="Sell Date" field="sellDate" type="date"/>
                <Field label="Sell Time" field="sellTime" type="time"/>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10, marginBottom:10 }}>
                <div><div style={S.fLbl}>Qty</div><input style={S.inp} type="number" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))}/></div>
                <div><div style={S.fLbl}>Entry Price</div><input style={S.inp} type="number" step="0.01" value={form.entryPrice} onChange={e=>setForm(f=>({...f,entryPrice:e.target.value}))}/></div>
                <div><div style={S.fLbl}>Exit Price</div><input style={S.inp} type="number" step="0.01" value={form.exitPrice} onChange={e=>setForm(f=>({...f,exitPrice:e.target.value}))}/></div>
                <div><div style={S.fLbl}>P&L (auto-calc if blank)</div><input style={S.inp} type="number" step="0.01" value={form.pnl} placeholder="auto" onChange={e=>setForm(f=>({...f,pnl:e.target.value}))}/></div>
              </div>
              <div style={{ marginBottom:12 }}>
                <div style={S.fLbl}>Notes</div>
                <textarea style={{ ...S.inp, height:64, resize:"vertical" }} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Setup, mistakes, emotions…"/>
              </div>
              {form.buyDate && <div style={{ fontSize:11, color:C.dim, marginBottom:10 }}>
                Buy moon: {moonEmoji(moonPhase(form.buyDate))} {moonName(moonPhase(form.buyDate))}
                {form.sellDate && <>  ·  Sell moon: {moonEmoji(moonPhase(form.sellDate))} {moonName(moonPhase(form.sellDate))}</>}
              </div>}
              {formErr && <div style={{ fontSize:11, color:C.red, marginBottom:10 }}>{formErr}</div>}
              <div style={{ display:"flex", gap:8 }}>
                <button style={S.btn} onClick={submitForm}>Save Trade</button>
                <button style={S.btnG} onClick={()=>{setShowForm(false);setFormErr("");}}>Cancel</button>
              </div>
            </div>
          )}

          <div style={S.sec}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={S.secTtl}>All Trades ({trades.length})</div>
              {isDemo && <span style={{ fontSize:10, color:C.muted }}>Showing demo data — add a trade or import CSV to start your live journal</span>}
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr>{["Buy Date","Buy Time","Sell Date","Sell Time","Symbol","Side","Qty","Entry","Exit","P&L","🌙 Buy","🌙 Sell","SPY","Sector",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {enriched.map(t => (
                    <tr key={t.id} style={{ background:t.pnl>0?"rgba(76,175,130,0.03)":t.pnl<0?"rgba(201,76,76,0.03)":"transparent" }}>
                      <td style={S.td}>{t.buyDate}</td>
                      <td style={{ ...S.td, color:C.muted }}>{t.buyTime||"—"}</td>
                      <td style={S.td}>{t.sellDate||"—"}</td>
                      <td style={{ ...S.td, color:C.muted }}>{t.sellTime||"—"}</td>
                      <td style={{ ...S.td, color:C.gold, fontWeight:600 }}>{t.symbol}</td>
                      <td style={{ ...S.td, color:t.side==="LONG"?C.green:C.red }}>{t.side}</td>
                      <td style={S.td}>{t.qty}</td>
                      <td style={S.td}>${fmt(t.entryPrice)}</td>
                      <td style={S.td}>${fmt(t.exitPrice)}</td>
                      <td style={{ ...S.td, ...S.pnlC(t.pnl) }}>{fmtCcy(t.pnl)}</td>
                      <td style={{ ...S.td, fontSize:15 }} title={t.buyMoonName}>{t.buyMoonEmoji}</td>
                      <td style={{ ...S.td, fontSize:15 }} title={t.sellMoonName}>{t.sellMoonEmoji}</td>
                      <td style={{ ...S.td, ...S.pnlC(t.spy) }}>{t.spy!=null?fmtPct(t.spy):"—"}</td>
                      <td style={{ ...S.td, ...S.pnlC(t.sector) }}>{t.sector!=null?`${fmtPct(t.sector)} ${t.sectorSym}`:"—"}</td>
                      <td style={S.td}><button style={S.btnR} onClick={() => { if(window.confirm("Delete " + t.symbol + " trade?")) deleteTrade(t.id); }}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>}

        {/* ═══ NOTES ═══ */}
        {tab==="notes" && (
          <div style={S.sec}>
            <div style={S.secTtl}>Trade Notes</div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {trades.filter(t => t.notes || noteEdit===t.id).length === 0 && (
                <div style={{ color:C.muted, fontSize:12, padding:"20px 0" }}>No notes yet — click a trade to add reflections</div>
              )}
              {enriched.map(t => (
                <div key={t.id} style={{ borderBottom:`1px solid ${C.border}`, paddingBottom:12 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                    <span style={{ color:C.gold, fontWeight:600, fontSize:12 }}>{t.symbol}</span>
                    <span style={{ color:C.muted, fontSize:10 }}>{t.buyDate}</span>
                    <span style={{ ...S.pnlC(t.pnl), fontSize:11 }}>{fmtCcy(t.pnl)}</span>
                    <span style={{ fontSize:13 }} title={`Buy: ${t.buyMoonName}`}>{t.buyMoonEmoji}</span>
                    <span style={{ fontSize:10, color:C.dim }}>→</span>
                    <span style={{ fontSize:13 }} title={`Sell: ${t.sellMoonName}`}>{t.sellMoonEmoji}</span>
                    <span style={{ marginLeft:"auto" }}>
                      <button style={{ ...S.btnG, padding:"3px 10px" }} onClick={() => { setNoteEdit(t.id); setNoteText(t.notes||""); }}>Edit</button>
                    </span>
                  </div>
                  {noteEdit===t.id
                    ? <div>
                        <textarea style={{ ...S.inp, height:80, resize:"vertical", marginBottom:8 }} value={noteText} onChange={e=>setNoteText(e.target.value)} autoFocus placeholder="Setup, execution quality, emotions, lessons…"/>
                        <div style={{ display:"flex", gap:8 }}>
                          <button style={S.btn} onClick={() => saveNote(t.id)}>Save</button>
                          <button style={S.btnG} onClick={() => setNoteEdit(null)}>Cancel</button>
                        </div>
                      </div>
                    : <div style={{ fontSize:12, color:t.notes?C.silver:C.muted, fontStyle:t.notes?"normal":"italic" }}>
                        {t.notes || "No note — click Edit to add one"}
                      </div>
                  }
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ CHARTS ═══ */}
        {tab==="charts" && (
          <div>
            <div style={{ ...S.sec, marginBottom:16 }}>
              <div style={S.secTtl}>Chart Reference — TradingView Links + OHLC Snapshots</div>
              <div style={{ fontSize:11, color:C.dim, lineHeight:1.7 }}>
                Each trade card links to TradingView for that symbol, and stores a permanent OHLC snapshot of the buy and sell day.
                TradingView opens at the current date — use <strong style={{ color:C.silver }}>Alt+G</strong> inside TradingView to jump to a specific date.
                The OHLC data below is fetched once and saved permanently to your journal so you always have the price record even years later.
              </div>
            </div>

            {enriched.map(t => {
              const loading = ohlcLoad[t.id];
              const hasSnap = t.buyOHLC || t.sellOHLC;
              const OHLCRow = ({ label, ohlc, price, moonLabel, moonEm }) => ohlc ? (
                <div style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:4, padding:"12px 14px" }}>
                  <div style={{ fontSize:9, color:C.muted, textTransform:"uppercase", letterSpacing:1.5, marginBottom:8 }}>
                    {label} · {ohlc.date} {moonEm && <span title={moonLabel}>{moonEm}</span>}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:6, marginBottom:8 }}>
                    {[["Open", ohlc.open], ["High", ohlc.high], ["Low", ohlc.low], ["Close", ohlc.close]].map(([l,v]) => (
                      <div key={l}>
                        <div style={{ fontSize:8, color:C.muted, letterSpacing:1 }}>{l}</div>
                        <div style={{ fontSize:13, color:C.text, fontFamily:FONT_DISPLAY, fontWeight:600 }}>${v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize:10, color:C.dim }}>
                    Vol: {ohlc.volume ? Number(ohlc.volume).toLocaleString() : "—"}
                    {"  ·  "}Your {label.toLowerCase()} price: <span style={{ color:C.gold }}>${price}</span>
                  </div>
                  <div style={{ fontSize:9, color:C.muted, marginTop:6 }}>
                    Snapshot saved {ohlc.fetchedAt ? new Date(ohlc.fetchedAt).toLocaleDateString() : "—"}
                  </div>
                </div>
              ) : null;

              return (
                <div key={t.id} style={{ ...S.sec, marginBottom:12 }}>
                  {/* trade header */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <span style={{ fontFamily:FONT_DISPLAY, fontSize:18, color:C.gold, fontWeight:700 }}>{t.symbol}</span>
                      <span style={{ fontSize:10, color:t.side==="LONG"?C.green:C.red, border:`1px solid ${t.side==="LONG"?C.green:C.red}`, borderRadius:2, padding:"2px 6px" }}>{t.side}</span>
                      <span style={{ ...S.pnlC(t.pnl), fontSize:13 }}>{fmtCcy(t.pnl)}</span>
                      <span style={{ fontSize:10, color:C.muted }}>{t.buyDate} → {t.sellDate||"—"}</span>
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <a
                        href={tvUrl(t.symbol)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...S.btnG, textDecoration:"none", display:"inline-block" }}
                      >
                        Open TradingView ↗
                      </a>
                      <button
                        style={{ ...S.btn, opacity: loading ? 0.6 : 1 }}
                        onClick={() => fetchSnapshot(t)}
                        disabled={loading}
                      >
                        {loading ? "Fetching…" : hasSnap ? "Refresh OHLC" : "Fetch OHLC Snapshot"}
                      </button>
                    </div>
                  </div>

                  {/* tip if no snapshot */}
                  {!hasSnap && !loading && (
                    <div style={{ fontSize:11, color:C.muted, fontStyle:"italic", marginBottom:10 }}>
                      No snapshot yet — hit "Fetch OHLC Snapshot" to permanently store the day's candle data for buy and sell dates.
                    </div>
                  )}

                  {/* loading */}
                  {loading && (
                    <div style={{ fontSize:11, color:C.dim, padding:"10px 0" }}>Fetching candle data from Yahoo Finance…</div>
                  )}

                  {/* OHLC panels */}
                  {hasSnap && !loading && (
                    <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                      <OHLCRow label="Buy Day"  ohlc={t.buyOHLC}  price={fmt(t.entryPrice)} moonLabel={t.buyMoonName}  moonEm={t.buyMoonEmoji}/>
                      {t.sellOHLC && t.sellDate !== t.buyDate && (
                        <OHLCRow label="Sell Day" ohlc={t.sellOHLC} price={fmt(t.exitPrice)} moonLabel={t.sellMoonName} moonEm={t.sellMoonEmoji}/>
                      )}
                      {t.sellDate === t.buyDate && (
                        <div style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:4, padding:"12px 14px" }}>
                          <div style={{ fontSize:9, color:C.muted, textTransform:"uppercase", letterSpacing:1.5 }}>Sell Day</div>
                          <div style={{ fontSize:11, color:C.dim, marginTop:6 }}>Same day as buy — candle above covers both entry and exit</div>
                          <div style={{ fontSize:10, color:C.dim, marginTop:4 }}>Exit price: <span style={{ color:C.gold }}>${fmt(t.exitPrice)}</span></div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TV tip */}
                  <div style={{ fontSize:10, color:C.muted, marginTop:12, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
                    💡 In TradingView: press <strong style={{ color:C.silver }}>Alt+G</strong> and type <strong style={{ color:C.silver }}>{t.buyDate}</strong> to jump to the buy date on the chart
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ MARKET CONTEXT ═══ */}
        {tab==="market" && <>
          {!Object.keys(mktData).length
            ? <div style={{ ...S.sec, textAlign:"center", padding:52, color:C.muted }}>
                <div style={{ fontSize:28, marginBottom:12 }}>⟳</div>
                <div style={{ fontSize:13 }}>Hit <strong style={{ color:C.gold }}>"Load Market Data"</strong> in the header to pull SPY, QQQ & sector ETFs</div>
              </div>
            : <>
                <div style={S.sec}>
                  <div style={S.secTtl}>SPY & QQQ Move on Your Trade Days</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={mktChart.filter(d=>trades.some(t=>t.buyDate===d.date))} margin={{ top:5, right:10, left:0, bottom:0 }}>
                      <XAxis dataKey="date" tick={{ fontSize:9, fill:C.muted }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fontSize:9, fill:C.muted }} axisLine={false} tickLine={false} tickFormatter={v=>`${v.toFixed(1)}%`}/>
                      <Tooltip contentStyle={{ background:"#0d1520", border:`1px solid ${C.border}`, fontSize:11, fontFamily:FONT_MONO }} formatter={v=>fmtPct(v)}/>
                      <ReferenceLine y={0} stroke={C.border}/>
                      <Bar dataKey="SPY" name="SPY" fill={C.gold} opacity={0.85} radius={[2,2,0,0]}/>
                      <Bar dataKey="QQQ" name="QQQ" fill={C.silver} opacity={0.7} radius={[2,2,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={S.sec}>
                  <div style={S.secTtl}>Your P&L vs SPY Move</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <ScatterChart margin={{ top:10, right:10, left:0, bottom:20 }}>
                      <XAxis dataKey="x" type="number" tick={{ fontSize:9, fill:C.muted }} axisLine={false} tickLine={false} tickFormatter={v=>`${v.toFixed(1)}%`} label={{ value:"SPY daily %", position:"insideBottom", offset:-10, fill:C.muted, fontSize:9 }}/>
                      <YAxis dataKey="y" tick={{ fontSize:9, fill:C.muted }} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}`}/>
                      <ReferenceLine y={0} stroke={C.border} strokeDasharray="3 3"/>
                      <ReferenceLine x={0} stroke={C.border} strokeDasharray="3 3"/>
                      <Tooltip cursor={false} content={({ active, payload }) => {
                        if (!active||!payload?.length) return null;
                        const d=payload[0].payload;
                        return <div style={{ background:"#0d1520", border:`1px solid ${C.border}`, borderRadius:4, padding:"9px 13px", fontSize:11, fontFamily:FONT_MONO }}>
                          <div style={{ color:C.gold }}>{d.symbol} · {d.date}</div>
                          <div style={S.pnlC(d.y)}>P&L: {fmtCcy(d.y)}</div>
                          <div style={{ color:C.silver }}>SPY: {fmtPct(d.x)}</div>
                        </div>;
                      }}/>
                      <Scatter data={enriched.filter(t=>t.spy!=null).map(t=>({x:t.spy,y:t.pnl,symbol:t.symbol,date:t.buyDate}))} fill={C.gold} opacity={0.8}/>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </>
          }
        </>}

        {/* ═══ MOON & TIME ═══ */}
        {tab==="moon" && <>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
            <div style={S.sec}>
              <div style={S.secTtl}>Avg P&L — Buy Phase vs Sell Phase</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={moonData.filter(d=>d.buyCount>0||d.sellCount>0)} margin={{ top:5, right:10, left:0, bottom:55 }}>
                  <XAxis dataKey="phase" tick={{ fontSize:7.5, fill:C.muted, angle:-40, textAnchor:"end" }} axisLine={false} tickLine={false} interval={0}/>
                  <YAxis tick={{ fontSize:9, fill:C.muted }} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}`}/>
                  <Tooltip contentStyle={{ background:"#0d1520", border:`1px solid ${C.border}`, fontSize:11, fontFamily:FONT_MONO }} formatter={v=>v!=null?fmtCcy(v):"—"}/>
                  <ReferenceLine y={0} stroke={C.border}/>
                  <Bar dataKey="buyAvg"  name="Buy Phase Avg"  fill={C.green}  opacity={0.8} radius={[3,3,0,0]}/>
                  <Bar dataKey="sellAvg" name="Sell Phase Avg" fill={C.silver} opacity={0.7} radius={[3,3,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ fontSize:10, color:C.muted, marginTop:8, display:"flex", gap:16 }}>
                <span><span style={{ display:"inline-block", width:10, height:10, background:C.green, borderRadius:2, marginRight:5, verticalAlign:"middle" }}/>Buy phase</span>
                <span><span style={{ display:"inline-block", width:10, height:10, background:C.silver, borderRadius:2, marginRight:5, verticalAlign:"middle" }}/>Sell phase</span>
              </div>
            </div>

            <div style={S.sec}>
              <div style={S.secTtl}>Phase Breakdown</div>
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {moonData.map(d => (
                  <div key={d.phase} style={{ display:"flex", alignItems:"center", padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:14, width:22 }}>{d.emoji}</span>
                    <span style={{ fontSize:10, color:C.silver, flex:1, marginLeft:6 }}>{d.phase}</span>
                    <span style={{ fontSize:9, color:C.muted, marginRight:8 }}>B:{d.buyCount} S:{d.sellCount}</span>
                    <span style={{ ...S.pnlC(d.buyAvg??0), fontSize:11, width:50, textAlign:"right" }}>{d.buyAvg!=null?fmtCcy(d.buyAvg):"—"}</span>
                    <span style={{ fontSize:10, color:C.muted, margin:"0 4px" }}>/</span>
                    <span style={{ ...S.pnlC(d.sellAvg??0), fontSize:11, width:50 }}>{d.sellAvg!=null?fmtCcy(d.sellAvg):"—"}</span>
                  </div>
                ))}
                <div style={{ fontSize:9, color:C.muted, marginTop:6 }}>Buy avg / Sell avg</div>
              </div>
            </div>
          </div>

          <div style={S.sec}>
            <div style={S.secTtl}>Time-of-Day — Avg P&L by Entry Hour</div>
            {heatmap.length === 0
              ? <div style={{ color:C.muted, fontSize:12, padding:"20px 0" }}>No time data — add trades with entry times</div>
              : <>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={heatmap} margin={{ top:5, right:10, left:0, bottom:0 }}>
                      <XAxis dataKey="label" tick={{ fontSize:9, fill:C.muted }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fontSize:9, fill:C.muted }} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}`}/>
                      <Tooltip content={<CTip/>}/>
                      <ReferenceLine y={0} stroke={C.border}/>
                      <Bar dataKey="avg" name="Avg P&L" radius={[3,3,0,0]}>
                        {heatmap.map((d,i) => <Cell key={i} fill={d.avg>=0?C.green:C.red} opacity={clamp(0.35+Math.abs(d.avg)/600,0.35,1)}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ marginTop:10, fontSize:11, color:C.muted, display:"flex", flexWrap:"wrap", gap:"8px 20px" }}>
                    {heatmap.map(d => (
                      <span key={d.hour}><span style={{ color:C.silver }}>{d.label}</span><span style={{ ...S.pnlC(d.avg), marginLeft:5 }}>{fmtCcy(d.avg)}</span><span style={{ color:C.muted, marginLeft:4 }}>({d.count})</span></span>
                    ))}
                  </div>
                </>
            }
          </div>
        </>}

        {/* ═══ AI ANALYSIS ═══ */}
        {tab==="analysis" && <>
          <div style={{ ...S.sec, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={S.secTtl}>AI Trade Coach</div>
              <div style={{ fontSize:12, color:C.muted }}>
                {trades.length} trades · moon phases (buy + sell) · {Object.keys(mktData).length ? "market data loaded ·" : ""} notes included
              </div>
            </div>
            <button style={S.btn} onClick={runAI} disabled={aiLoad}>{aiLoad?"Analyzing…":analysis?"Re-analyze":"Run Analysis"}</button>
          </div>
          {aiLoad && (
            <div style={{ ...S.sec, textAlign:"center", padding:48, color:C.muted }}>
              <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
              <div style={{ fontSize:24, marginBottom:12, display:"inline-block", animation:"spin 2s linear infinite" }}>◈</div>
              <div style={{ fontSize:13 }}>Reviewing your trades…</div>
            </div>
          )}
          {!aiLoad && analysis && <div style={S.sec}><MD text={analysis}/></div>}
          {!aiLoad && !analysis && (
            <div style={{ ...S.sec, textAlign:"center", color:C.muted, padding:52 }}>
              <div style={{ fontSize:32, marginBottom:12, color:C.border }}>◈</div>
              <div style={{ fontSize:13 }}>Hit "Run Analysis" to get your coaching report</div>
              {!Object.keys(mktData).length && <div style={{ fontSize:11, marginTop:8, color:"#2a3848" }}>Tip: load market data first for deeper analysis</div>}
            </div>
          )}
        </>}

        {/* ═══ IMPORT ═══ */}
        {tab==="import" && <ImportTab trades={trades} setTrades={setTrades} setIsDemo={setIsDemo} setMsg={setMsg} setMsgOk={setMsgOk} />}

      </div>
    </div>
  );
}

// ─── Import Tab ──────────────────────────────────────────────────────────────
function ImportTab({ trades, setTrades, setIsDemo, setMsg, setMsgOk }) {
  const [raw,     setRaw]     = useState("");
  const [preview, setPreview] = useState([]);
  const [log,     setLog]     = useState([]);

  function parseJson() {
    setLog([]); setPreview([]);
    let parsed;
    try { parsed = JSON.parse(raw.trim()); }
    catch { setLog([{msg:"Invalid JSON", ok:false}]); return; }

    const bySymbol = {};
    for (const r of parsed) {
      if (!bySymbol[r.symbol]) bySymbol[r.symbol] = [];
      bySymbol[r.symbol].push(r);
    }

    const results = [];
    for (const [symbol, fills] of Object.entries(bySymbol)) {
      fills.sort((a,b) => a.time < b.time ? -1 : 1);
      let openBuy = null;
      for (const fill of fills) {
        if (fill.side === "BOT") {
          if (openBuy) results.push(buildJournalTrade(symbol, openBuy, null));
          openBuy = fill;
        } else if (fill.side === "SLD") {
          results.push(buildJournalTrade(symbol, openBuy, fill));
          openBuy = null;
        }
      }
      if (openBuy) results.push(buildJournalTrade(symbol, openBuy, null));
    }

    results.sort((a,b) => (b.buyDate+b.buyTime) > (a.buyDate+a.buyTime) ? 1 : -1);
    setPreview(results);
    setLog([{msg:"Found " + results.length + " trade(s) — " + results.filter(t=>t.sellDate).length + " closed, " + results.filter(t=>!t.sellDate).length + " open", ok:true}]);
  }

  function buildJournalTrade(symbol, buy, sell) {
    const entryPrice = buy && buy.price > 0 && buy.price < 1e100 ? buy.price : null;
    const exitPrice  = sell && sell.price > 0 && sell.price < 1e100 ? sell.price : null;
    const totalComm  = (buy ? (buy.commission||0) : 0) + (sell ? (sell.commission||0) : 0);
    let pnl = null;
    if (entryPrice != null && exitPrice != null) {
      pnl = Math.round(((exitPrice - entryPrice) * (buy ? buy.quantity : 1) - totalComm) * 100) / 100;
    }
    function parseDateTime(t) {
      if (!t) return { date:"", time:"" };
      const d = new Date(t);
      return { date: d.toISOString().slice(0,10), time: d.toISOString().slice(11,16) };
    }
    const entry = parseDateTime(buy ? buy.time : null);
    const exit  = parseDateTime(sell ? sell.time : null);
    return {
      id: Date.now() + Math.random(),
      symbol, side:"LONG",
      qty: buy ? buy.quantity : (sell ? sell.quantity : 1),
      entryPrice, exitPrice, pnl,
      buyDate: entry.date, buyTime: entry.time,
      sellDate: exit.date || null, sellTime: exit.time || null,
      notes: (buy && buy.note) || "",
      tags: ["paper"],
      stopPrice: buy ? (buy.stop_price || null) : null,
      commission: totalComm,
      source: "proxobot-import",
    };
  }

  function doImport(clear) {
    if (preview.length === 0) { setLog(l => [...l, {msg:"Run Preview first", ok:false}]); return; }
    const existing = clear ? [] : trades.filter(t => t.source !== "demo");
    const existingKeys = new Set(existing.map(t => t.symbol + "|" + t.buyDate + "|" + t.buyTime));
    let added = 0, skipped = 0;
    const next = [...existing];
    for (const t of preview) {
      const key = t.symbol + "|" + t.buyDate + "|" + t.buyTime;
      if (existingKeys.has(key)) { skipped++; continue; }
      next.push(t); existingKeys.add(key); added++;
    }
    saveTrades(next);
    setTrades(next);
    setIsDemo(false);
    setLog(l => [...l,
      {msg:"✓ " + added + " added, " + skipped + " skipped", ok:true},
      {msg:"Journal now has " + next.length + " trade(s) — switch to Trade Log to view", ok:true},
    ]);
  }

  const S2 = {
    section: { background:C.surface, border:"1px solid " + C.border, borderRadius:6, padding:24, marginBottom:16 },
    label:   { fontSize:10, letterSpacing:2, textTransform:"uppercase", color:C.muted, fontFamily:FONT_MONO, marginBottom:10, display:"block" },
    textarea:{ width:"100%", minHeight:180, background:C.bg, border:"1px solid " + C.border, borderRadius:4, color:C.text, fontFamily:FONT_MONO, fontSize:11, padding:12, resize:"vertical", outline:"none", lineHeight:1.6 },
    btn:     (col) => ({ padding:"8px 20px", fontFamily:FONT_MONO, fontSize:10, letterSpacing:2, textTransform:"uppercase", border:"none", borderRadius:3, cursor:"pointer", background:col, color:col===C.red?"#fff":"#000", marginRight:8, marginTop:10 }),
    th:      { textAlign:"left", color:C.muted, fontSize:10, letterSpacing:1, padding:"6px 8px", borderBottom:"1px solid " + C.border },
    td:      { padding:"7px 8px", borderBottom:"1px solid " + C.border, fontSize:11, fontFamily:FONT_MONO },
  };

  return (
    <div style={{ padding:24, maxWidth:900 }}>
      <div style={{ fontSize:18, fontFamily:FONT_DISPLAY, color:C.gold, marginBottom:4 }}>Import from Proxobot</div>
      <div style={{ fontSize:11, color:C.muted, marginBottom:24, fontFamily:FONT_MONO }}>Paste trades.json → preview → import to journal</div>

      <div style={S2.section}>
        <span style={S2.label}>Step 1 — Paste trades.json contents</span>
        <textarea style={S2.textarea} value={raw} onChange={e=>setRaw(e.target.value)} placeholder="Paste your trades.json here..." />
        <button style={S2.btn(C.gold)} onClick={parseJson}>Preview</button>
      </div>

      {log.length > 0 && (
        <div style={S2.section}>
          <span style={S2.label}>Log</span>
          {log.map((l,i) => (
            <div key={i} style={{ fontFamily:FONT_MONO, fontSize:11, color:l.ok?C.green:C.red, lineHeight:1.8 }}>{l.msg}</div>
          ))}
        </div>
      )}

      {preview.length > 0 && (
        <div style={S2.section}>
          <span style={S2.label}>Step 2 — Preview ({preview.length} trades)</span>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                {["Symbol","Entry","Exit","Entry $","Exit $","Stop","P&L","Comm"].map(h => <th key={h} style={S2.th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {preview.map((t,i) => (
                  <tr key={i}>
                    <td style={{...S2.td, color:C.gold}}>{t.symbol}</td>
                    <td style={{...S2.td, color:C.muted}}>{t.buyDate}</td>
                    <td style={{...S2.td, color:C.muted}}>{t.sellDate || <span style={{color:C.green}}>OPEN</span>}</td>
                    <td style={S2.td}>{t.entryPrice != null ? "$"+t.entryPrice.toFixed(2) : "?"}</td>
                    <td style={S2.td}>{t.exitPrice  != null ? "$"+t.exitPrice.toFixed(2)  : "—"}</td>
                    <td style={{...S2.td, color:C.red}}>{t.stopPrice ? "$"+t.stopPrice.toFixed(2) : "—"}</td>
                    <td style={{...S2.td, color:t.pnl==null?C.muted:t.pnl>=0?C.green:C.red}}>
                      {t.pnl==null ? "—" : (t.pnl>=0?"+":"")+t.pnl.toFixed(2)}
                    </td>
                    <td style={{...S2.td, color:C.muted}}>${t.commission.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button style={S2.btn(C.gold)} onClick={() => doImport(false)}>Import (merge)</button>
          <button style={S2.btn(C.red)}  onClick={() => { if(window.confirm("Clear all existing trades first?")) doImport(true); }}>Clear & Import</button>
        </div>
      )}
    </div>
  );
}
