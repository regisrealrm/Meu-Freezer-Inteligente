import { useState, useEffect, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { initializeApp } from "firebase/app";
import { getDatabase, ref as dbRef, set, onValue } from "firebase/database";

// ─── FIREBASE ─────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAUHVztoxNnSn3QDya-DgCw0qYTMlQSFmI",
  authDomain: "meu-freezer-inteligente.firebaseapp.com",
  databaseURL: "https://meu-freezer-inteligente-default-rtdb.firebaseio.com",
  projectId: "meu-freezer-inteligente",
  storageBucket: "meu-freezer-inteligente.firebasestorage.app",
  messagingSenderId: "433524554201",
  appId: "1:433524554201:web:314c88d44183e823f081c8"
};
const fbApp = initializeApp(firebaseConfig);
const db    = getDatabase(fbApp);
const DB_PATH = "mfi4/data";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const TIPOS  = ["bovina","suína","frango","peixe","ovinos","acompanhamento","frutos do mar","pato"];
const LOCAIS = ["Freezer 1","Freezer 2","Freezer Ilha","Geladeira","Congelador"];
const MOTIVOS= ["consumo","churrasco","descarte","doação","transferência"];
const USERS  = ["Régis","Luciene","Hugo","Lavínia"];
const ORIGENS= ["in natura","do sol","temperada"];

// ─── DYNAMIC PALETTES (used when config overrides defaults) ──────────────────
const ORIGEM_PALETTE = [
  {icon:"🌿", color:"#00CFA8"},
  {icon:"☀️", color:"#FFAD00"},
  {icon:"🌶️", color:"#FF7043"},
  {icon:"🧊", color:"#4DAFFF"},
  {icon:"🥩", color:"#E91E63"},
  {icon:"🌾", color:"#8BC34A"},
];
const UTIL_PALETTE = [
  {icon:"🔥", color:"#FF6B35"},
  {icon:"🍽️", color:"#00CFA8"},
  {icon:"🎉", color:"#9C27B0"},
  {icon:"🌟", color:"#FFAD00"},
];
const getOrigenPalette = (origens, val) => {
  const idx = origens.indexOf(val);
  return ORIGEM_PALETTE[Math.max(0,idx) % ORIGEM_PALETTE.length];
};
const getUtilPalette = (utils, val) => {
  const idx = utils.indexOf(val);
  return UTIL_PALETTE[Math.max(0,idx) % UTIL_PALETTE.length];
};

// ─── PACOTES HELPERS ──────────────────────────────────────────────────────────
const makePacote = (peso) => ({id:uid(), peso, pesoAtual:peso, status:"disponível"});

// Aplica saída nos pacotes (pacote preferido primeiro, depois abertos, depois disponíveis — PEPS)
const applyExitToPacotes = (pacotes, pesoRetirado, preferredId) => {
  let rem = pesoRetirado;
  const updated = pacotes.map(p=>({...p}));
  const ordem = preferredId
    ? [
        ...updated.filter(p=>p.id===preferredId),
        ...updated.filter(p=>p.id!==preferredId&&p.status==="aberto"),
        ...updated.filter(p=>p.id!==preferredId&&p.status==="disponível"),
      ]
    : [
        ...updated.filter(p=>p.status==="aberto"),
        ...updated.filter(p=>p.status==="disponível"),
      ];
  for(const p of ordem) {
    if(rem<=0) break;
    const idx = updated.findIndex(u=>u.id===p.id);
    const uso = Math.min(rem, updated[idx].pesoAtual);
    rem -= uso;
    updated[idx].pesoAtual = parseFloat((updated[idx].pesoAtual-uso).toFixed(3));
    updated[idx].status = updated[idx].pesoAtual<=0.001 ? "consumido" : "aberto";
  }
  return updated;
};

const getPesoTotal = (meat) => {
  if(!meat.pacotes?.length) return meat.pesoTotal||0;
  return meat.pacotes.filter(p=>p.status!=="consumido").reduce((s,p)=>s+p.pesoAtual,0);
};

const getStatusFromPacotes = (pacotes) => {
  const ativos = pacotes.filter(p=>p.status!=="consumido");
  if(!ativos.length) return "consumido";
  if(ativos.some(p=>p.status==="aberto")) return "aberto";
  return "disponível";
};

const C = {
  bg:"#0D1B2A", card:"#142235", light:"#1A2E42", border:"#1E3A50",
  primary:"#FF6B35", success:"#00CFA8", warning:"#FFAD00",
  danger:"#FF3B5C", info:"#4DAFFF", text:"#DDE8F2",
  muted:"#6A8FAA", dim:"#3A5A70",
};

const TIPO_COLORS = {
  bovina:"#FF6B35", suína:"#E8A87C", frango:"#FFC947",
  linguiça:"#C47ABF", peixe:"#4DAFFF", outras:"#8899AA",
};

const ALERT = {
  expired:    { label:"VENCIDO",           color:"#FF3B5C", bg:"#2A0B14", icon:"⛔" },
  expiring:   { label:"VENCE EM BREVE",    color:"#FFAD00", bg:"#2A1E00", icon:"⏳" },
  openUrgent: { label:"USAR COM URGÊNCIA", color:"#FFAD00", bg:"#2A1E00", icon:"🔓" },
  old:        { label:"PRIORIZAR USO",     color:"#4DAFFF", bg:"#0B2035", icon:"⏰" },
  ok:         { label:"OK",                color:"#00CFA8", bg:"transparent", icon:"✅" },
};

// ─── UTILS ────────────────────────────────────────────────────────────────────
const TODAY     = new Date().toISOString().split("T")[0];
const diffDays  = (a,b) => Math.floor((new Date(b)-new Date(a))/86400000);
const fmtDate   = (d) => { if(!d) return "—"; const [y,m,dd]=d.split("-"); return `${dd}/${m}/${y}`; };
const fmtKg     = (kg) => (kg==null||isNaN(kg)?"—":`${Number(kg).toFixed(2).replace(".",",")} kg`);
const fmtR      = (v)  => (v?`R$ ${Number(v).toFixed(2).replace(".",",")}`:null);
const uid       = ()   => Math.random().toString(36).slice(2,9);

const getAlert = (meat) => {
  const dte = diffDays(TODAY, meat.dataValidade);
  const dis  = diffDays(meat.dataEntrada, TODAY);
  if (dte < 0) return "expired";
  if (dte <= 15) return "expiring";
  if (meat.status==="aberto" && meat.local==="Geladeira" && dis>3) return "openUrgent";
  if (dis > 60) return "old";
  return "ok";
};

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const SEED_MEATS = [];
const SEED_EXITS = [];

// ─── SHARED UI ────────────────────────────────────────────────────────────────
const Card = ({children,style}) => (
  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,...style}}>
    {children}
  </div>
);

const Badge = ({label,color}) => (
  <span style={{background:color+"22",color,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:4,letterSpacing:"0.5px",whiteSpace:"nowrap"}}>
    {label}
  </span>
);

const Btn = ({children,onClick,color=C.primary,style,disabled,small}) => (
  <button onClick={onClick} disabled={disabled}
    style={{background:disabled?C.dim:color,color:"#fff",border:"none",borderRadius:8,
      padding:small?"7px 13px":"10px 18px",cursor:disabled?"not-allowed":"pointer",
      fontWeight:600,fontSize:small?12:14,opacity:disabled?0.6:1,...style}}>
    {children}
  </button>
);

const inputBase = {background:"#0A1520",color:C.text,border:`1px solid ${C.border}`,
  borderRadius:8,padding:"10px 12px",fontSize:14,width:"100%",outline:"none"};

const FWrap = ({children}) => <div style={{marginBottom:12}}>{children}</div>;
const FLabel= ({children}) => <label style={{display:"block",fontSize:12,color:C.muted,marginBottom:4,fontWeight:600}}>{children}</label>;

const FInput = ({label,...props}) => (
  <FWrap>
    {label && <FLabel>{label}</FLabel>}
    <input style={inputBase} {...props}/>
  </FWrap>
);
const FSelect = ({label,children,...props}) => (
  <FWrap>
    {label && <FLabel>{label}</FLabel>}
    <select style={inputBase} {...props}>{children}</select>
  </FWrap>
);

const SecTitle = ({icon,children,action}) => (
  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
    {icon && <span style={{fontSize:18}}>{icon}</span>}
    <h2 style={{fontSize:16,fontWeight:700,color:C.text,margin:0,flex:1}}>{children}</h2>
    {action}
  </div>
);

const StatCard = ({icon,label,value,color=C.primary}) => (
  <Card style={{flex:"1 1 110px"}}>
    <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:5}}>{icon} {label}</div>
    <div style={{fontSize:20,fontWeight:800,color,lineHeight:1.2}}>{value}</div>
  </Card>
);

const GRID2 = {display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(190px, 1fr))",gap:8};

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({meats,exits,alerts,appConfig,pacotesChurrasco,totalChurrascoKg,onConfirmChurrasco,onCancelChurrasco,onTogglePacoteChurrasco,shoppingList,onRemoveFromShoppingList}) {
  const [open,      setOpen]      = useState(null);
  const [localFlt,  setLocalFlt]  = useState("todos");
  const [openUtil,  setOpenUtil]  = useState(null);
  const [openOrigem,setOpenOrigem]= useState(null);

  const origens    = appConfig?.origens    || ORIGENS;
  const utilidades = appConfig?.utilidades || ["churrasco","consumo"];

  const openPrint = (html) => {
    const w=window.open("","_blank");
    if(w){w.document.write(html);w.document.close();}
  };
  const printBase = (title,color,bodyHTML) => {
    const now=new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
    <title>${title}</title>
    <style>body{font-family:Arial,sans-serif;color:#222;padding:20px;max-width:800px;margin:0 auto}
    table td,table th{border-bottom:1px solid #eee;padding:5px 8px}
    @media print{body{padding:0}}</style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ${color};padding-bottom:8px;margin-bottom:16px">
      <h1 style="margin:0;font-size:20px;color:${color}">${title}</h1>
      <span style="font-size:12px;color:#666">${now}</span>
    </div>
    ${bodyHTML}
    <script>window.onload=()=>window.print()<\/script>
    </body></html>`;
  };

  const printEstoque = () => {
    const locais=[...new Set(meats.map(m=>m.local).filter(Boolean))];
    const totalGeral=meats.reduce((s,m)=>s+m.pesoTotal,0);
    const body=`<p style="margin:0 0 12px;font-size:14px;color:#555">Total em estoque: <strong>${totalGeral.toFixed(3).replace(".",",")} kg</strong></p>`+
      locais.map(local=>{
        const items=meats.filter(m=>m.local===local);
        const tot=items.reduce((s,m)=>s+m.pesoTotal,0);
        return `<h3 style="margin:16px 0 4px;border-bottom:1px solid #ccc">📍 ${local}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f0f0f0">
            <th style="text-align:left">Corte</th><th style="text-align:left">Tipo</th>
            <th style="text-align:left">Origem</th><th style="text-align:left">Pacotes</th>
            <th style="text-align:right">Peso</th>
          </tr></thead>
          <tbody>${items.map(m=>`<tr>
            <td>${m.corte||m.tipo}</td>
            <td style="text-transform:capitalize">${m.tipo}</td>
            <td>${m.origem||"—"}</td>
            <td>${(m.pacotes||[]).filter(p=>p.status!=="consumido").length} pct</td>
            <td style="text-align:right;font-weight:700">${m.pesoTotal.toFixed(3).replace(".",",")} kg</td>
          </tr>`).join("")}</tbody>
          <tfoot><tr style="font-weight:700;background:#f9f9f9">
            <td colspan="4">Total ${local}</td>
            <td style="text-align:right">${tot.toFixed(3).replace(".",",")} kg</td>
          </tr></tfoot>
        </table>`;
      }).join("");
    openPrint(printBase("📦 Estoque Atual","#1565c0",body));
  };

  const printChurrasco = () => {
    if(!pacotesChurrasco?.length) return alert("Nenhum pacote marcado para churrasco.");
    const grupos={};
    pacotesChurrasco.forEach(p=>{
      if(!grupos[p.corte]) grupos[p.corte]={corte:p.corte,tipo:p.tipo,local:p.local,kg:0,n:0};
      grupos[p.corte].kg+=p.pesoAtual; grupos[p.corte].n++;
    });
    const body=`<p style="margin:0 0 12px;font-size:14px;color:#555">Total: <strong>${totalChurrascoKg.toFixed(3).replace(".",",")} kg</strong></p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#fff3e0">
        <th style="text-align:left">Corte</th><th style="text-align:left">Tipo</th>
        <th style="text-align:left">Local</th><th style="text-align:left">Pacotes</th>
        <th style="text-align:right">Peso</th>
      </tr></thead>
      <tbody>${Object.values(grupos).map(g=>`<tr>
        <td>${g.corte}</td><td style="text-transform:capitalize">${g.tipo}</td>
        <td>${g.local}</td><td>${g.n} pct</td>
        <td style="text-align:right;font-weight:700">${g.kg.toFixed(3).replace(".",",")} kg</td>
      </tr>`).join("")}</tbody>
      <tfoot><tr style="font-weight:700;background:#fff3e0">
        <td colspan="4">Total</td>
        <td style="text-align:right">${totalChurrascoKg.toFixed(3).replace(".",",")} kg</td>
      </tr></tfoot>
    </table>`;
    openPrint(printBase("🔥 Preparar Churrasco","#e65c00",body));
  };

  const printCompras = () => {
    if(!shoppingList?.length) return alert("Lista de compras está vazia.");
    const body=`<table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#e8f5e9">
        <th style="text-align:left">Item</th>
        <th style="text-align:left">Tipo</th>
        <th style="text-align:left">Adicionado por</th>
      </tr></thead>
      <tbody>${shoppingList.map(i=>`<tr>
        <td>${i.nome}</td>
        <td style="text-transform:capitalize">${i.tipo||"—"}</td>
        <td>${i.addedBy||"—"}</td>
      </tr>`).join("")}</tbody>
    </table>`;
    openPrint(printBase("🛒 Lista de Compras","#2e7d32",body));
  };

  const toggle = k => {
    setOpen(p=>p===k?null:k);
    setOpenUtil(null); setOpenOrigem(null); setLocalFlt("todos");
  };
  const toggleUtil = u => {
    setOpenUtil(p=>p===u?null:u);
    setOpen(null); setOpenOrigem(null);
  };
  const toggleOrigem = o => {
    setOpenOrigem(p=>p===o?null:o);
    setOpen(null); setOpenUtil(null);
  };

  const totalKg    = meats.reduce((s,m)=>s+m.pesoTotal,0);
  const valorAtual = meats.reduce((s,m)=>s+(m.precoPago||0),0);
  const byTipo     = (appConfig?.tipos||TIPOS).map(t=>({t,kg:meats.filter(m=>m.tipo===t).reduce((s,m)=>s+m.pesoTotal,0),count:meats.filter(m=>m.tipo===t).length})).filter(x=>x.kg>0);

  const locaisAtivos = LOCAIS.filter(l=>meats.some(m=>m.local===l));
  const kgByLocal    = l => meats.filter(m=>m.local===l).reduce((s,m)=>s+m.pesoTotal,0);

  // Origem — dinâmico via appConfig
  const origenData = origens
    .map(o=>({o, items:meats.filter(m=>m.origem===o), kg:meats.filter(m=>m.origem===o).reduce((s,m)=>s+m.pesoTotal,0), pal:getOrigenPalette(origens,o)}))
    .filter(x=>x.kg>0);

  // Utilidade — dinâmico via appConfig
  const utilData = utilidades
    .map(u=>({u, items:meats.filter(m=>m.utilidade===u), kg:meats.filter(m=>m.utilidade===u).reduce((s,m)=>s+m.pesoTotal,0), pal:getUtilPalette(utilidades,u)}))
    .filter(x=>x.kg>0);

  const boxes = [
    {id:"estoque", icon:"🧊", label:"Total de estoque", value:fmtKg(totalKg),          color:C.primary},
    {id:"tipos",   icon:"📦", label:"Tipos no estoque", value:`${byTipo.length} tipos`, color:C.info},
    {id:"alertas", icon:"🚨", label:"Alertas ativos",   value:`${alerts.length} alerta${alerts.length!==1?"s":""}`, color:alerts.length?C.danger:C.success},
    {id:"valor",   icon:"💰", label:"Valor em estoque", value:fmtR(valorAtual)||"R$ 0,00", color:C.success},
  ];

  const [showPrintScreen, setShowPrintScreen] = useState(false);
  const [pfLocal,  setPfLocal]  = useState("todos");
  const [pfTipo,   setPfTipo]   = useState("todos");
  const [pfOrigem, setPfOrigem] = useState("todos");
  const [pfUtil,   setPfUtil]   = useState("todos");

  return (
    <div>
      {/* ── Botão imprimir ───────────────────────────── */}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
        <button onClick={()=>setShowPrintScreen(true)}
          style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,
            padding:"7px 16px",cursor:"pointer",fontSize:13,color:C.muted,fontWeight:600}}>
          🖨️ Imprimir
        </button>
      </div>

      {/* ── Tela de impressão ────────────────────────── */}
      {showPrintScreen&&(
        <div style={{position:"fixed",inset:0,background:C.bg,zIndex:400,overflowY:"auto",padding:"16px 16px 100px"}}>
          <div style={{maxWidth:600,margin:"0 auto"}}>

            {/* Header */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{fontWeight:800,fontSize:18}}>🖨️ Impressão</div>
              <button onClick={()=>setShowPrintScreen(false)}
                style={{background:C.light,border:`1px solid ${C.border}`,borderRadius:8,
                  padding:"6px 14px",cursor:"pointer",fontSize:13,color:C.muted}}>
                ✕ Fechar
              </button>
            </div>

            {/* ── BLOCO 1: Estoque ── */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px",marginBottom:14}}>
              <div style={{fontWeight:800,fontSize:15,color:C.info,marginBottom:12}}>📦 Estoque</div>

              {/* Filtros */}
              <div style={{marginBottom:12,display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:C.muted,fontWeight:700,alignSelf:"center"}}>LOCAL</span>
                  {["todos",...(appConfig?.locais||LOCAIS).filter(l=>meats.some(m=>m.local===l))].map(l=>(
                    <button key={l} onClick={()=>setPfLocal(l)}
                      style={{fontSize:11,padding:"3px 10px",borderRadius:10,cursor:"pointer",fontWeight:600,
                        background:pfLocal===l?C.info+"22":C.light,
                        border:`1px solid ${pfLocal===l?C.info:C.border}`,
                        color:pfLocal===l?C.info:C.muted}}>
                      {l==="todos"?"Todos":l}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:C.muted,fontWeight:700,alignSelf:"center"}}>TIPO</span>
                  {["todos",...(appConfig?.tipos||TIPOS).filter(t=>meats.some(m=>m.tipo===t))].map(t=>(
                    <button key={t} onClick={()=>setPfTipo(t)}
                      style={{fontSize:11,padding:"3px 10px",borderRadius:10,cursor:"pointer",fontWeight:600,
                        textTransform:"capitalize",
                        background:pfTipo===t?C.info+"22":C.light,
                        border:`1px solid ${pfTipo===t?C.info:C.border}`,
                        color:pfTipo===t?C.info:C.muted}}>
                      {t==="todos"?"Todos":t}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:C.muted,fontWeight:700,alignSelf:"center"}}>ORIGEM</span>
                  {["todos",...(appConfig?.origens||ORIGENS).filter(o=>meats.some(m=>m.origem===o))].map(o=>(
                    <button key={o} onClick={()=>setPfOrigem(o)}
                      style={{fontSize:11,padding:"3px 10px",borderRadius:10,cursor:"pointer",fontWeight:600,
                        background:pfOrigem===o?C.info+"22":C.light,
                        border:`1px solid ${pfOrigem===o?C.info:C.border}`,
                        color:pfOrigem===o?C.info:C.muted}}>
                      {o==="todos"?"Todas":o}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:C.muted,fontWeight:700,alignSelf:"center"}}>UTILIDADE</span>
                  {["todos",...(appConfig?.utilidades||["churrasco","consumo"]).filter(u=>meats.some(m=>m.utilidade===u))].map(u=>(
                    <button key={u} onClick={()=>setPfUtil(u)}
                      style={{fontSize:11,padding:"3px 10px",borderRadius:10,cursor:"pointer",fontWeight:600,
                        background:pfUtil===u?C.info+"22":C.light,
                        border:`1px solid ${pfUtil===u?C.info:C.border}`,
                        color:pfUtil===u?C.info:C.muted}}>
                      {u==="todos"?"Todas":u}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lista filtrada */}
              {(()=>{
                const filtered=meats
                  .filter(m=>pfLocal==="todos"||m.local===pfLocal)
                  .filter(m=>pfTipo==="todos"||m.tipo===pfTipo)
                  .filter(m=>pfOrigem==="todos"||m.origem===pfOrigem)
                  .filter(m=>pfUtil==="todos"||m.utilidade===pfUtil);
                const total=filtered.reduce((s,m)=>s+m.pesoTotal,0);
                return (
                  <>
                    {filtered.length===0
                      ? <div style={{color:C.muted,textAlign:"center",padding:8}}>Nenhum item com esses filtros.</div>
                      : filtered.map(m=>(
                          <div key={m.id} style={{display:"flex",justifyContent:"space-between",
                            padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
                            <div>
                              <span style={{fontWeight:600}}>{m.corte||m.tipo}</span>
                              <span style={{fontSize:11,color:C.muted,marginLeft:6,textTransform:"capitalize"}}>{m.tipo}</span>
                              <span style={{fontSize:11,color:C.muted}}> · {m.local}</span>
                            </div>
                            <span style={{fontWeight:700,color:C.info}}>{fmtKg(m.pesoTotal)}</span>
                          </div>
                        ))
                    }
                    {filtered.length>0&&(
                      <div style={{display:"flex",justifyContent:"space-between",fontWeight:800,
                        padding:"8px 0 4px",fontSize:13,color:C.info}}>
                        <span>{filtered.length} item{filtered.length!==1?"s":""}</span>
                        <span>{fmtKg(total)}</span>
                      </div>
                    )}
                    <button onClick={()=>{
                      const locais=[...new Set(filtered.map(m=>m.local).filter(Boolean))];
                      const now=new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
                      const body=locais.map(local=>{
                        const items=filtered.filter(m=>m.local===local);
                        const tot=items.reduce((s,m)=>s+m.pesoTotal,0);
                        return `<h3 style="margin:16px 0 4px;border-bottom:1px solid #ccc">📍 ${local}</h3>
                        <table style="width:100%;border-collapse:collapse;font-size:13px">
                          <thead><tr style="background:#f0f0f0">
                            <th style="text-align:left;padding:4px 8px">Corte</th>
                            <th style="text-align:left;padding:4px 8px">Tipo</th>
                            <th style="text-align:left;padding:4px 8px">Origem</th>
                            <th style="text-align:left;padding:4px 8px">Pacotes</th>
                            <th style="text-align:right;padding:4px 8px">Peso</th>
                          </tr></thead>
                          <tbody>${items.map(m=>`<tr>
                            <td style="padding:4px 8px">${m.corte||m.tipo}</td>
                            <td style="padding:4px 8px;text-transform:capitalize">${m.tipo}</td>
                            <td style="padding:4px 8px">${m.origem||"—"}</td>
                            <td style="padding:4px 8px">${(m.pacotes||[]).filter(p=>p.status!=="consumido").length} pct</td>
                            <td style="padding:4px 8px;text-align:right;font-weight:700">${m.pesoTotal.toFixed(3).replace(".",",")} kg</td>
                          </tr>`).join("")}</tbody>
                          <tfoot><tr style="font-weight:700;background:#f9f9f9">
                            <td colspan="4" style="padding:4px 8px">Total</td>
                            <td style="padding:4px 8px;text-align:right">${tot.toFixed(3).replace(".",",")} kg</td>
                          </tr></tfoot>
                        </table>`;
                      }).join("");
                      const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Estoque</title>
                        <style>body{font-family:Arial,sans-serif;padding:20px;max-width:800px;margin:0 auto}@media print{body{padding:0}}</style>
                      </head><body>
                        <div style="display:flex;justify-content:space-between;border-bottom:2px solid #1565c0;padding-bottom:8px;margin-bottom:12px">
                          <h1 style="margin:0;color:#1565c0;font-size:20px">📦 Estoque Atual</h1>
                          <span style="font-size:12px;color:#666">${now}</span>
                        </div>
                        <p style="margin:0 0 12px;font-size:13px;color:#555">Total: <strong>${fmtKg(total)}</strong></p>
                        ${body}
                        <script>window.onload=()=>window.print()<\/script>
                      </body></html>`;
                      const w=window.open("","_blank");
                      if(w){w.document.write(html);w.document.close();}
                    }} style={{marginTop:10,width:"100%",background:C.info,border:"none",
                      borderRadius:10,padding:"11px",cursor:"pointer",
                      color:"#fff",fontSize:13,fontWeight:700}}>
                      🖨️ Imprimir Estoque
                    </button>
                  </>
                );
              })()}
            </div>

            {/* ── BLOCO 2: Preparar Churrasco ── */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px",marginBottom:14}}>
              <div style={{fontWeight:800,fontSize:15,color:C.primary,marginBottom:12}}>🔥 Preparar Churrasco</div>
              {!pacotesChurrasco?.length
                ? <div style={{color:C.muted,textAlign:"center",padding:8}}>Nenhum pacote marcado para churrasco.</div>
                : (()=>{
                    const grupos={};
                    pacotesChurrasco.forEach(p=>{
                      if(!grupos[p.corte]) grupos[p.corte]={corte:p.corte,tipo:p.tipo,local:p.local,kg:0,n:0};
                      grupos[p.corte].kg+=p.pesoAtual; grupos[p.corte].n++;
                    });
                    return (
                      <>
                        {Object.values(grupos).map(g=>(
                          <div key={g.corte} style={{display:"flex",justifyContent:"space-between",
                            padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
                            <div>
                              <span style={{fontWeight:600}}>{g.corte}</span>
                              <span style={{fontSize:11,color:C.muted,marginLeft:6}}>{g.n} pct · {g.local}</span>
                            </div>
                            <span style={{fontWeight:700,color:C.primary}}>{fmtKg(g.kg)}</span>
                          </div>
                        ))}
                        <div style={{display:"flex",justifyContent:"space-between",fontWeight:800,
                          padding:"8px 0 4px",fontSize:13,color:C.primary}}>
                          <span>Total</span><span>{fmtKg(totalChurrascoKg)}</span>
                        </div>
                        <button onClick={()=>{
                          const now=new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
                          const rows=Object.values(grupos).map(g=>`<tr>
                            <td style="padding:5px 8px">${g.corte}</td>
                            <td style="padding:5px 8px;text-transform:capitalize">${g.tipo}</td>
                            <td style="padding:5px 8px">${g.local}</td>
                            <td style="padding:5px 8px">${g.n} pct</td>
                            <td style="padding:5px 8px;text-align:right;font-weight:700">${g.kg.toFixed(3).replace(".",",")} kg</td>
                          </tr>`).join("");
                          const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Churrasco</title>
                            <style>body{font-family:Arial,sans-serif;padding:20px;max-width:800px;margin:0 auto}@media print{body{padding:0}}</style>
                          </head><body>
                            <div style="display:flex;justify-content:space-between;border-bottom:2px solid #e65c00;padding-bottom:8px;margin-bottom:12px">
                              <h1 style="margin:0;color:#e65c00;font-size:20px">🔥 Preparar Churrasco</h1>
                              <span style="font-size:12px;color:#666">${now}</span>
                            </div>
                            <table style="width:100%;border-collapse:collapse;font-size:13px">
                              <thead><tr style="background:#fff3e0">
                                <th style="text-align:left;padding:5px 8px">Corte</th>
                                <th style="text-align:left;padding:5px 8px">Tipo</th>
                                <th style="text-align:left;padding:5px 8px">Local</th>
                                <th style="text-align:left;padding:5px 8px">Pacotes</th>
                                <th style="text-align:right;padding:5px 8px">Peso</th>
                              </tr></thead>
                              <tbody>${rows}</tbody>
                              <tfoot><tr style="font-weight:700;background:#fff3e0">
                                <td colspan="4" style="padding:5px 8px">Total</td>
                                <td style="padding:5px 8px;text-align:right">${totalChurrascoKg.toFixed(3).replace(".",",")} kg</td>
                              </tr></tfoot>
                            </table>
                            <script>window.onload=()=>window.print()<\/script>
                          </body></html>`;
                          const w=window.open("","_blank");
                          if(w){w.document.write(html);w.document.close();}
                        }} style={{marginTop:10,width:"100%",background:C.primary,border:"none",
                          borderRadius:10,padding:"11px",cursor:"pointer",color:"#fff",fontSize:13,fontWeight:700}}>
                          🖨️ Imprimir Churrasco
                        </button>
                      </>
                    );
                  })()
              }
            </div>

            {/* ── BLOCO 3: Lista de Compras ── */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px",marginBottom:14}}>
              <div style={{fontWeight:800,fontSize:15,color:C.success,marginBottom:12}}>🛒 Lista de Compras</div>
              {!shoppingList?.length
                ? <div style={{color:C.muted,textAlign:"center",padding:8}}>Lista de compras vazia.</div>
                : (
                  <>
                    {shoppingList.map(i=>(
                      <div key={i.id} style={{display:"flex",justifyContent:"space-between",
                        padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
                        <span style={{fontWeight:600}}>{i.nome}</span>
                        <span style={{fontSize:11,color:C.muted,textTransform:"capitalize"}}>{i.tipo||""}</span>
                      </div>
                    ))}
                    <button onClick={()=>{
                      const now=new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
                      const rows=(shoppingList||[]).map(i=>`<tr>
                        <td style="padding:6px 8px;font-size:14px">☐ ${i.nome}</td>
                        <td style="padding:6px 8px;text-transform:capitalize;color:#555">${i.tipo||"—"}</td>
                      </tr>`).join("");
                      const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Lista de Compras</title>
                        <style>body{font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:0 auto}@media print{body{padding:0}}</style>
                      </head><body>
                        <div style="display:flex;justify-content:space-between;border-bottom:2px solid #2e7d32;padding-bottom:8px;margin-bottom:12px">
                          <h1 style="margin:0;color:#2e7d32;font-size:20px">🛒 Lista de Compras</h1>
                          <span style="font-size:12px;color:#666">${now}</span>
                        </div>
                        <table style="width:100%;border-collapse:collapse;font-size:14px">
                          <tbody>${rows}</tbody>
                        </table>
                        <script>window.onload=()=>window.print()<\/script>
                      </body></html>`;
                      const w=window.open("","_blank");
                      if(w){w.document.write(html);w.document.close();}
                    }} style={{marginTop:10,width:"100%",background:C.success,border:"none",
                      borderRadius:10,padding:"11px",cursor:"pointer",color:"#fff",fontSize:13,fontWeight:700}}>
                      🖨️ Imprimir Lista de Compras
                    </button>
                  </>
                )
              }
            </div>

          </div>
        </div>
      )}

      {/* ── 2×2 clickable stat cards ─────────────────── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        {boxes.map(b=>{
          const active = open===b.id;
          return (
            <div key={b.id} onClick={()=>toggle(b.id)}
              style={{background:active?b.color+"18":C.card,
                border:`1px solid ${active?b.color:C.border}`,
                borderRadius:12,padding:"14px 16px",cursor:"pointer",
                borderBottom:`3px solid ${active?b.color:C.border}`}}>
              <div style={{fontSize:11,color:active?b.color:C.muted,fontWeight:600,marginBottom:5}}>
                {b.icon} {b.label}
              </div>
              <div style={{fontSize:19,fontWeight:800,color:b.color,lineHeight:1.2}}>{b.value}</div>
              <div style={{fontSize:10,color:active?b.color:C.dim,marginTop:5,fontWeight:600}}>
                {active?"▲ fechar":"▼ detalhes"}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Origens — dinâmico ──────────────────────────── */}
      {origenData.length>0&&(
        <>
          <div style={{display:"flex",gap:8,marginBottom:openOrigem?8:12,flexWrap:"wrap"}}>
            {origenData.map(({o,items,kg,pal})=>(
              <div key={o} onClick={()=>toggleOrigem(o)}
                style={{flex:"1 1 80px",background:openOrigem===o?pal.color+"18":C.card,
                  border:`1px solid ${openOrigem===o?pal.color:C.border}`,
                  borderRadius:12,padding:"12px 14px",cursor:"pointer",
                  borderLeft:`4px solid ${pal.color}`}}>
                <div style={{fontSize:11,color:pal.color,fontWeight:700}}>{pal.icon} {o}</div>
                <div style={{fontSize:18,fontWeight:800,color:pal.color}}>{fmtKg(kg)}</div>
                <div style={{fontSize:11,color:C.muted}}>{items.length} item{items.length!==1?"s":""} · {openOrigem===o?"▲":"▼"}</div>
              </div>
            ))}
          </div>
          {openOrigem&&(()=>{
            const od = origenData.find(x=>x.o===openOrigem);
            if(!od) return null;
            return (
              <Card style={{marginBottom:12,borderTop:`3px solid ${od.pal.color}`}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>{od.pal.icon} {openOrigem} por tipo</div>
                {(appConfig?.tipos||TIPOS).map(t=>{
                  const itens=od.items.filter(m=>m.tipo===t);
                  const kg=itens.reduce((s,m)=>s+m.pesoTotal,0);
                  if(kg===0) return null;
                  const pct=od.kg>0?(kg/od.kg)*100:0;
                  const accent=TIPO_COLORS[t]||C.muted;
                  return (
                    <div key={t} style={{marginBottom:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                        <span style={{fontSize:13,fontWeight:600,textTransform:"capitalize",color:C.text}}>{t}</span>
                        <div>
                          <span style={{fontSize:13,fontWeight:800,color:accent}}>{fmtKg(kg)}</span>
                          <span style={{fontSize:11,color:C.muted}}> · {itens.length} item{itens.length!==1?"s":""}</span>
                        </div>
                      </div>
                      <div style={{background:C.border,borderRadius:4,height:6,overflow:"hidden"}}>
                        <div style={{width:`${pct}%`,height:"100%",background:accent,transition:"width 0.4s"}}/>
                      </div>
                      {itens.map(m=>(
                        <div key={m.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,padding:"2px 8px"}}>
                          <span>{m.corte||m.tipo}</span>
                          <span style={{color:accent,fontWeight:600}}>{fmtKg(m.pesoTotal)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </Card>
            );
          })()}
        </>
      )}

      {/* ── Utilidade — dinâmico ─────────────────────────── */}
      {utilData.length>0&&(
        <>
          <div style={{display:"flex",gap:8,marginBottom:openUtil?8:12}}>
            {utilData.map(({u,items,kg,pal})=>(
              <div key={u} onClick={()=>toggleUtil(u)}
                style={{flex:1,background:openUtil===u?pal.color+"18":C.card,
                  border:`1px solid ${openUtil===u?pal.color:C.border}`,
                  borderRadius:12,padding:"12px 14px",cursor:"pointer",
                  borderLeft:`4px solid ${pal.color}`}}>
                <div style={{fontSize:11,color:pal.color,fontWeight:700}}>{pal.icon} {u}</div>
                <div style={{fontSize:18,fontWeight:800,color:pal.color}}>{fmtKg(kg)}</div>
                <div style={{fontSize:11,color:C.muted}}>{items.length} item{items.length!==1?"s":""} · {openUtil===u?"▲":"▼"}</div>
              </div>
            ))}
          </div>
          {openUtil&&(()=>{
            const ud = utilData.find(x=>x.u===openUtil);
            if(!ud) return null;
            return (
              <Card style={{marginBottom:12,borderTop:`3px solid ${ud.pal.color}`}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>{ud.pal.icon} {openUtil} por tipo</div>
                {(appConfig?.tipos||TIPOS).map(t=>{
                  const itens=ud.items.filter(m=>m.tipo===t);
                  const kg=itens.reduce((s,m)=>s+m.pesoTotal,0);
                  if(kg===0) return null;
                  const pct=ud.kg>0?(kg/ud.kg)*100:0;
                  const accent=TIPO_COLORS[t]||C.muted;
                  return (
                    <div key={t} style={{marginBottom:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                        <span style={{fontSize:13,fontWeight:600,textTransform:"capitalize",color:C.text}}>{t}</span>
                        <div>
                          <span style={{fontSize:13,fontWeight:800,color:accent}}>{fmtKg(kg)}</span>
                          <span style={{fontSize:11,color:C.muted}}> · {itens.length} item{itens.length!==1?"s":""}</span>
                        </div>
                      </div>
                      <div style={{background:C.border,borderRadius:4,height:6,overflow:"hidden"}}>
                        <div style={{width:`${pct}%`,height:"100%",background:accent,transition:"width 0.4s"}}/>
                      </div>
                      {itens.map(m=>(
                        <div key={m.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,padding:"2px 8px"}}>
                          <span>{m.corte||m.tipo}</span>
                          <span style={{color:accent,fontWeight:600}}>{fmtKg(m.pesoTotal)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </Card>
            );
          })()}
        </>
      )}

      {/* ── Lista de Compras ─────────────────────────────── */}
      {shoppingList?.length>0&&(
        <div style={{background:C.card,border:`2px solid ${C.success}`,borderRadius:14,
          padding:"14px 16px",marginBottom:14}}>
          <div style={{fontWeight:800,fontSize:16,color:C.success,marginBottom:10}}>
            🛒 Lista de Compras
          </div>
          {shoppingList.map(item=>(
            <div key={item.id} style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
              <div>
                <span style={{fontWeight:600,fontSize:14}}>{item.nome}</span>
                {item.tipo&&<span style={{fontSize:11,color:C.muted,marginLeft:8,
                  textTransform:"capitalize",background:C.light,padding:"1px 6px",borderRadius:4}}>
                  {item.tipo}
                </span>}
                {item.addedBy&&<span style={{fontSize:11,color:C.muted,marginLeft:6}}>
                  · {item.addedBy}
                </span>}
              </div>
              <button onClick={()=>onRemoveFromShoppingList(item.id)}
                style={{background:C.success+"22",border:`1px solid ${C.success}55`,
                  borderRadius:8,padding:"5px 12px",cursor:"pointer",
                  color:C.success,fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>
                ✓ Comprei
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Card Preparar Churrasco ─────────────────────── */}
      {pacotesChurrasco?.length>0&&(
        <div style={{background:"#2A1000",border:`2px solid ${C.primary}`,borderRadius:14,
          padding:"14px 16px",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div>
              <div style={{fontWeight:800,fontSize:16,color:C.primary}}>🔥 Preparar Churrasco</div>
              <div style={{fontSize:12,color:C.muted}}>
                {pacotesChurrasco.length} pacote{pacotesChurrasco.length!==1?"s":""} · {fmtKg(totalChurrascoKg)} total
              </div>
            </div>
          </div>

          {/* Lista por corte com opção de desmarcar cada pacote */}
          {(()=>{
            const grupos={};
            pacotesChurrasco.forEach(p=>{
              if(!grupos[p.corte]) grupos[p.corte]={corte:p.corte,tipo:p.tipo,local:p.local,pacotes:[]};
              grupos[p.corte].pacotes.push(p);
            });
            return Object.values(grupos).map(g=>{
              const kg=Math.round(g.pacotes.reduce((s,p)=>s+p.pesoAtual,0)*1000)/1000;
              return (
                <div key={g.corte} style={{background:C.primary+"18",borderRadius:10,
                  padding:"10px 12px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",
                    alignItems:"center",marginBottom:g.pacotes.length>0?6:0}}>
                    <div>
                      <span style={{fontWeight:700,fontSize:14,color:C.text}}>{g.corte}</span>
                      <span style={{fontSize:11,color:C.muted,marginLeft:8,textTransform:"capitalize"}}>
                        {g.tipo} · {g.local}
                      </span>
                    </div>
                    <span style={{fontWeight:800,fontSize:15,color:C.primary}}>{fmtKg(kg)}</span>
                  </div>
                  {g.pacotes.map((p,i)=>(
                    <div key={p.id} style={{display:"flex",justifyContent:"space-between",
                      alignItems:"center",padding:"5px 4px",
                      borderTop:`1px solid ${C.border}44`}}>
                      <span style={{fontSize:12,color:C.muted}}>
                        Pacote {i+1} · {fmtKg(p.pesoAtual)}
                      </span>
                      <button onClick={()=>onTogglePacoteChurrasco(p.meatId,p.id)}
                        title="Remover da lista — volta ao estoque"
                        style={{background:"none",border:`1px solid ${C.danger}55`,
                          borderRadius:6,padding:"3px 8px",cursor:"pointer",
                          color:C.danger,fontSize:11,fontWeight:600}}>
                        ✕ Não retirar
                      </button>
                    </div>
                  ))}
                </div>
              );
            });
          })()}

          <div style={{fontSize:11,color:C.muted,marginBottom:10,textAlign:"center"}}>
            Clique em "✕ Não retirar" para deixar um pacote no estoque.
          </div>

          <div style={{display:"flex",gap:10}}>
            <button onClick={onCancelChurrasco}
              style={{flex:1,background:C.danger+"22",border:`1px solid ${C.danger}55`,
                borderRadius:10,padding:"11px",cursor:"pointer",color:C.danger,fontSize:13,fontWeight:700}}>
              ❌ Cancelar tudo
            </button>
            <button onClick={onConfirmChurrasco}
              style={{flex:2,background:C.primary,border:"none",
                borderRadius:10,padding:"11px",cursor:"pointer",color:"#fff",fontSize:13,fontWeight:800}}>
              ✅ Confirmar saída
            </button>
          </div>
        </div>
      )}

      {/* ── Expandable panels ────────────────────────── */}
      {open==="estoque"&&(
        <Card style={{borderTop:`3px solid ${C.primary}`}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12,color:C.primary}}>
            🧊 Estoque total por tipo
          </div>
          {meats.length===0&&<div style={{color:C.muted,textAlign:"center"}}>Nenhuma carne cadastrada.</div>}
          {TIPOS.map(t=>{
            const itens = meats.filter(m=>m.tipo===t);
            const kg    = itens.reduce((s,m)=>s+m.pesoTotal,0);
            if(kg===0) return null;
            const pct   = totalKg>0?(kg/totalKg)*100:0;
            const accent= TIPO_COLORS[t]||C.muted;
            return (
              <div key={t} style={{marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:14,fontWeight:700,textTransform:"capitalize",color:C.text}}>{t}</span>
                  <div style={{textAlign:"right"}}>
                    <span style={{fontSize:14,fontWeight:800,color:accent}}>{fmtKg(kg)}</span>
                    <span style={{fontSize:11,color:C.muted}}> · {itens.length} item{itens.length!==1?"s":""}</span>
                  </div>
                </div>
                <div style={{background:C.border,borderRadius:4,height:6,overflow:"hidden",marginBottom:6}}>
                  <div style={{width:`${pct}%`,height:"100%",background:accent,transition:"width 0.4s"}}/>
                </div>
                {itens.map(m=>(
                  <div key={m.id} style={{display:"flex",justifyContent:"space-between",
                    fontSize:12,color:C.muted,padding:"4px 8px",
                    borderBottom:`1px solid ${C.border+"80"}`}}>
                    <div>
                      <span style={{color:C.text,fontWeight:600}}>{m.corte||m.tipo}</span>
                      <span style={{fontSize:10,marginLeft:6}}>📍 {m.local}</span>
                      {m.origem&&<span style={{fontSize:10,marginLeft:6,color:m.origem==="do sol"?C.warning:m.origem==="temperada"?"#FF7043":C.success}}>
                        {m.origem==="do sol"?"☀️":m.origem==="temperada"?"🌶️":"🌿"}
                      </span>}
                    </div>
                    <strong style={{color:accent}}>{fmtKg(m.pesoTotal)}</strong>
                  </div>
                ))}
              </div>
            );
          })}
          <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0 0",
            fontWeight:800,fontSize:15,borderTop:`1px solid ${C.border}`}}>
            <span style={{color:C.muted}}>Total geral</span>
            <span style={{color:C.primary}}>{fmtKg(totalKg)}</span>
          </div>
        </Card>
      )}

      {open==="tipos"&&(
        <Card style={{borderTop:`3px solid ${C.info}`}}>
          <div style={{fontWeight:700,marginBottom:12,color:C.info}}>📦 Estoque por tipo</div>
          {byTipo.length===0&&<div style={{color:C.muted}}>Sem itens.</div>}
          {byTipo.map(x=>(
            <div key={x.t} style={{display:"flex",alignItems:"center",gap:10,
              padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:TIPO_COLORS[x.t]||C.muted,flexShrink:0}}/>
              <div style={{flex:1,fontWeight:600,textTransform:"capitalize"}}>{x.t}</div>
              <div style={{fontSize:12,color:C.muted}}>{x.count} item{x.count!==1?"s":""}</div>
              <div style={{fontWeight:800,color:TIPO_COLORS[x.t]||C.muted,minWidth:70,textAlign:"right"}}>
                {fmtKg(x.kg)}
              </div>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0 0",fontWeight:700}}>
            <span style={{color:C.muted}}>Total</span>
            <span style={{color:C.primary}}>{fmtKg(totalKg)}</span>
          </div>
        </Card>
      )}

      {open==="alertas"&&(
        <Card style={{borderTop:`3px solid ${alerts.length?C.danger:C.success}`}}>
          <div style={{fontWeight:700,marginBottom:12,color:alerts.length?C.danger:C.success}}>
            🚨 Alertas ativos
          </div>
          {alerts.length===0&&(
            <div style={{color:C.success,textAlign:"center",padding:8}}>✅ Tudo em ordem, sem alertas!</div>
          )}
          {alerts.map(m=>{
            const a=ALERT[m._alert];
            const dte=diffDays(TODAY,m.dataValidade);
            const dis=diffDays(m.dataEntrada,TODAY);
            return (
              <div key={m.id} style={{background:a.bg,border:`1px solid ${a.color}44`,
                borderLeft:`4px solid ${a.color}`,borderRadius:8,padding:"10px 12px",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:18}}>{a.icon}</span>
                    <div>
                      <div style={{fontWeight:700,fontSize:14}}>{m.corte||m.tipo}</div>
                      <div style={{fontSize:11,color:C.muted}}>
                        {m.local} · {fmtKg(m.pesoTotal)} ·{" "}
                        {m.dataValidade?(dte<0?`Venceu há ${Math.abs(dte)}d`:dte<=15?`Vence em ${dte}d`:`${dis}d no estoque`):`${dis}d no estoque`}
                      </div>
                    </div>
                  </div>
                  <Badge label={a.label} color={a.color}/>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {open==="valor"&&(
        <Card style={{borderTop:`3px solid ${C.success}`}}>
          <div style={{fontWeight:700,marginBottom:12,color:C.success}}>💰 Valor em estoque</div>
          {meats.filter(m=>m.precoPago).length===0&&(
            <div style={{color:C.muted}}>Nenhum item com preço cadastrado.</div>
          )}
          {TIPOS.map(t=>{
            const itens = meats.filter(m=>m.tipo===t&&m.precoPago);
            if(!itens.length) return null;
            const total = itens.reduce((s,m)=>s+(m.precoPago||0),0);
            return (
              <div key={t} style={{display:"flex",alignItems:"center",gap:10,
                padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:TIPO_COLORS[t]||C.muted,flexShrink:0}}/>
                <div style={{flex:1,textTransform:"capitalize"}}>{t}</div>
                <div style={{fontSize:11,color:C.muted}}>{itens.length} item{itens.length!==1?"s":""}</div>
                <div style={{fontWeight:700,color:C.success,minWidth:80,textAlign:"right"}}>{fmtR(total)}</div>
              </div>
            );
          })}
          <div style={{display:"flex",justifyContent:"space-between",padding:"12px 0 0",fontWeight:800,fontSize:16}}>
            <span style={{color:C.muted}}>Total investido</span>
            <span style={{color:C.success}}>{fmtR(valorAtual)||"R$ 0,00"}</span>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── ESTOQUE ──────────────────────────────────────────────────────────────────
function Estoque({meats,setTab,onTransfer,onUpdate,onMerge,onDelete,onRegisterExit,appConfig,onTogglePacoteChurrasco,onAddToShoppingList}) {
  const [flocal,     setFlocal]     = useState("todos");
  const [futilidade,  setFutilidade]  = useState("todos");
  const [forigem,     setForigem]     = useState("todos");
  const [ftipo,       setFtipo]       = useState("todos");
  const [fcorte,      setFcorte]      = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selected,    setSelected]    = useState(null);
  const [showXfer,    setShowXfer]    = useState(false);
  const [showSaida,   setShowSaida]   = useState(false);
  const [saidaForm,   setSaidaForm]   = useState({});
  const [transferOk,  setTransferOk]  = useState("");
  const [editingOrigem,   setEditingOrigem]   = useState(false);
  const [editingPreco,    setEditingPreco]    = useState(false);
  const [editingUtilidade,setEditingUtilidade]= useState(false);
  const [editingPacotes,  setEditingPacotes]  = useState(false);
  const [pacotesForm,     setPacotesForm]     = useState({});
  const [merging,         setMerging]         = useState(false);
  const [confirmDelete,   setConfirmDelete]   = useState(false);
  const [precoForm,       setPrecoForm]       = useState({});

  const countBy     = loc  => meats.filter(m=>m.local===loc).length;
  const countByUtil = util => meats.filter(m=>m.utilidade===util).length;
  const hasFilter   = flocal!=="todos"||futilidade!=="todos"||forigem!=="todos"||ftipo!=="todos"||fcorte;
  const clearAll    = () => { setFlocal("todos");setFutilidade("todos");setForigem("todos");setFtipo("todos");setFcorte(""); };

  const filtered = meats
    .filter(m=>flocal==="todos"     ||m.local===flocal)
    .filter(m=>futilidade==="todos" ||m.utilidade===futilidade)
    .filter(m=>forigem==="todos"    ||m.origem===forigem)
    .filter(m=>ftipo==="todos"      ||m.tipo===ftipo)
    .filter(m=>!fcorte              ||(m.corte||m.tipo).toLowerCase().includes(fcorte.toLowerCase()))
    .sort((a,b)=>new Date(a.dataEntrada)-new Date(b.dataEntrada));

  const detail = meats.find(m=>m.id===selected);

  const openDetail = (id) => {
    setSelected(id); setShowXfer(false); setTransferOk(""); setShowSaida(false); setSaidaForm({});
    setEditingOrigem(false); setEditingPreco(false); setEditingUtilidade(false);
    setEditingPacotes(false); setMerging(false); setConfirmDelete(false);
  };
  const closeModal = () => {
    setSelected(null); setShowXfer(false); setTransferOk(""); setShowSaida(false); setSaidaForm({});
    setEditingOrigem(false); setEditingPreco(false); setEditingUtilidade(false);
    setEditingPacotes(false); setMerging(false); setConfirmDelete(false);
  };

  const [xferMode,    setXferMode]    = useState("tudo"); // "tudo"|"parcial"
  const [xferPesos,   setXferPesos]   = useState({});

  const doTransfer = (novoLocal) => {
    const m = meats.find(x=>x.id===selected);
    if(!m) return;
    // Registra no histórico
    onRegisterExit({
      id: selected, tipo: m.tipo, corte: m.corte,
      pesoRetirado: m.pesoTotal,
      dataSaida: TODAY, motivo: "transferência",
      observacao: `${m.local} → ${novoLocal}`,
    });
    onTransfer(selected, novoLocal);
    setTransferOk(novoLocal);
    setShowXfer(false);
    setTimeout(closeModal, 1800);
  };

  // ── Location pill button
  const LocPill = ({label,value,count}) => {
    const active = flocal===value;
    return (
      <button onClick={()=>setFlocal(value)}
        style={{background:active?C.primary:C.card,color:active?"#fff":C.muted,
          border:`1px solid ${active?C.primary:C.border}`,borderRadius:20,
          padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600,
          whiteSpace:"nowrap",flexShrink:0,display:"flex",gap:6,alignItems:"center"}}>
        {label}
        {count!==undefined&&(
          <span style={{background:active?"#ffffff44":C.light,borderRadius:10,
            padding:"1px 6px",fontSize:11,fontWeight:700}}>
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <div>
      <SecTitle icon="📦" children="Estoque"
        action={<Btn small onClick={()=>setTab("entrada")}>+ Nova entrada</Btn>}/>

      {/* ── Filtros colapsáveis ──────────────────────── */}
      {(()=>{
        const activeCount = [flocal!=="todos",futilidade!=="todos",forigem!=="todos",ftipo!=="todos",!!fcorte].filter(Boolean).length;
        // estilo padrão de pill — todos do mesmo tamanho
        const pill = (active,color=C.primary) => ({
          padding:"8px 0",minWidth:90,flex:"1 1 0",
          borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600,
          textAlign:"center",whiteSpace:"nowrap",overflow:"hidden",
          textOverflow:"ellipsis",
          background:active?color+"22":C.card,
          color:active?color:C.muted,
          border:`1px solid ${active?color:C.border}`,
        });
        return (
          <>
            {/* Botão toggle */}
            <button onClick={()=>setShowFilters(f=>!f)}
              style={{width:"100%",marginBottom:8,padding:"11px 16px",borderRadius:10,cursor:"pointer",
                display:"flex",justifyContent:"space-between",alignItems:"center",
                background:activeCount>0?C.primary+"18":C.card,
                border:`1px solid ${activeCount>0?C.primary:C.border}`,
                color:activeCount>0?C.primary:C.muted,fontWeight:600,fontSize:13}}>
              <span>🔍 Filtros{activeCount>0?` (${activeCount} ativo${activeCount>1?"s":""})`:""}</span>
              <span style={{fontSize:16}}>{showFilters?"▲":"▼"}</span>
            </button>

            {showFilters&&(
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                padding:"12px",marginBottom:12}}>

                {/* Local */}
                <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:6,letterSpacing:1}}>📍 LOCAL</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  <button style={pill(flocal==="todos")} onClick={()=>setFlocal("todos")}>Todos</button>
                  {(appConfig?.locais||LOCAIS).filter(l=>countBy(l)>0).map(l=>(
                    <button key={l} style={pill(flocal===l)} onClick={()=>setFlocal(l)}>{l}</button>
                  ))}
                </div>

                {/* Tipo */}
                <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:6,letterSpacing:1}}>🥩 TIPO</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  <button style={pill(ftipo==="todos",C.info)} onClick={()=>setFtipo("todos")}>Todos</button>
                  {(appConfig?.tipos||TIPOS).filter(t=>meats.some(m=>m.tipo===t)).map(t=>(
                    <button key={t} style={{...pill(ftipo===t,C.info),textTransform:"capitalize"}} onClick={()=>setFtipo(t)}>{t}</button>
                  ))}
                </div>

                {/* Origem */}
                <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:6,letterSpacing:1}}>🌿 ORIGEM</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  <button style={pill(forigem==="todos",C.success)} onClick={()=>setForigem("todos")}>Todas</button>
                  {(appConfig?.origens||ORIGENS).map((o,i)=>(
                    <button key={o} style={pill(forigem===o,C.success)} onClick={()=>setForigem(o)}>
                      {getOrigenPalette(appConfig?.origens||ORIGENS,o).icon} {o}
                    </button>
                  ))}
                </div>

                {/* Utilidade */}
                <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:6,letterSpacing:1}}>🎯 UTILIDADE</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  <button style={pill(futilidade==="todos")} onClick={()=>setFutilidade("todos")}>Tudo</button>
                  {(appConfig?.utilidades||["churrasco","consumo"]).map((u,i)=>(
                    <button key={u} style={pill(futilidade===u)} onClick={()=>setFutilidade(u)}>
                      {getUtilPalette(appConfig?.utilidades||["churrasco","consumo"],u).icon} {u}
                    </button>
                  ))}
                </div>

                {/* Corte */}
                <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:6,letterSpacing:1}}>🔪 CORTE</div>
                <div style={{display:"flex",gap:8}}>
                  <input style={{...inputBase,flex:1,padding:"9px 12px",fontSize:13}}
                    placeholder="Buscar por corte..."
                    value={fcorte} onChange={e=>setFcorte(e.target.value)}/>
                  {fcorte&&(
                    <button onClick={()=>setFcorte("")}
                      style={{background:C.light,border:`1px solid ${C.border}`,borderRadius:8,
                        padding:"9px 12px",cursor:"pointer",color:C.muted,fontSize:12}}>✕</button>
                  )}
                </div>

                {/* Limpar tudo */}
                {activeCount>0&&(
                  <button onClick={clearAll}
                    style={{width:"100%",marginTop:12,background:C.danger+"22",border:`1px solid ${C.danger}44`,
                      borderRadius:8,padding:"9px",cursor:"pointer",color:C.danger,fontSize:12,fontWeight:700}}>
                    ✕ Limpar todos os filtros
                  </button>
                )}
              </div>
            )}

            {hasFilter&&!showFilters&&(
              <div style={{fontSize:11,color:C.muted,marginBottom:8}}>
                {filtered.length} item{filtered.length!==1?"s":""} encontrado{filtered.length!==1?"s":""}
                {" · "}<span style={{color:C.primary,cursor:"pointer",fontWeight:600}} onClick={clearAll}>limpar</span>
              </div>
            )}
          </>
        );
      })()}

      {/* ── Meat list ───────────────────────────────── */}
      {filtered.length===0&&(
        <Card><div style={{color:C.muted,textAlign:"center",padding:20}}>
          Nenhum item encontrado com os filtros selecionados.
        </div></Card>
      )}

      {filtered.map(m=>{
        const al = getAlert(m);
        const ai = ALERT[al];
        const accentColor = al!=="ok" ? ai.color : (TIPO_COLORS[m.tipo]||C.muted);
        const dis = diffDays(m.dataEntrada,TODAY);
        return (
          <div key={m.id} onClick={()=>openDetail(m.id)}
            style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
              padding:"14px 16px",marginBottom:8,cursor:"pointer",
              borderLeft:`5px solid ${accentColor}`,
              display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap",marginBottom:4}}>
                <span style={{fontWeight:700,fontSize:15,color:C.text}}>{m.corte||m.tipo}</span>
                <span style={{fontSize:11,color:C.muted,background:C.light,padding:"2px 7px",borderRadius:4,textTransform:"capitalize"}}>{m.tipo}</span>
                {m.origem&&<span style={{fontSize:11,padding:"2px 7px",borderRadius:4,fontWeight:600,
                  background:m.origem==="do sol"?"#2A1A00":m.origem==="temperada"?"#2A1000":"#0A2010",
                  color:m.origem==="do sol"?C.warning:m.origem==="temperada"?"#FF7043":C.success}}>
                  {m.origem==="do sol"?"☀️ Do Sol":m.origem==="temperada"?"🌶️ Temperada":"🌿 In Natura"}
                </span>}
                {al!=="ok"&&<Badge label={ai.label} color={ai.color}/>}
              </div>
              <div style={{fontSize:12,color:C.muted}}>
                {flocal==="todos"&&<>📍 {m.local} · </>}{dis}d no estoque
                {(()=>{
                  const pacs = m.pacotes||[];
                  const nAbertos = pacs.filter(p=>p.status==="aberto").length;
                  const nFechados = pacs.filter(p=>p.status==="disponível").length;
                  if(!pacs.length) {
                    if((m.quantidadePecas||1)>1) return <span style={{color:C.info}}> · {m.quantidadePecas} pacotes</span>;
                    if(m.status==="aberto") return <span style={{color:C.warning,fontWeight:600}}> · aberto</span>;
                    return null;
                  }
                  return <>
                    {nFechados>0&&<span style={{color:C.info}}> · {nFechados} fechado{nFechados!==1?"s":""}</span>}
                    {nAbertos>0&&<span style={{color:C.warning,fontWeight:600}}> · 🔓{nAbertos} aberto{nAbertos!==1?"s":""}</span>}
                  </>;
                })()}
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
              <div style={{fontWeight:800,fontSize:18,color:accentColor}}>{fmtKg(m.pesoTotal)}</div>
              <span style={{color:C.dim,fontSize:20,lineHeight:1}}>›</span>
            </div>
          </div>
        );
      })}

      {/* ── Detail bottom-sheet ─────────────────────── */}
      {detail&&(
        <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:200,
          display:"flex",alignItems:"flex-end",justifyContent:"center"}}
          onClick={closeModal}>
          <div style={{background:C.card,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:900,
            maxHeight:"90vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>

            {/* Drag handle */}
            <div style={{display:"flex",justifyContent:"center",paddingTop:12,paddingBottom:2}}>
              <div style={{width:40,height:4,borderRadius:2,background:C.border}}/>
            </div>

            {(()=>{
              const al = getAlert(detail);
              const ai = ALERT[al];
              const accent = al!=="ok" ? ai.color : (TIPO_COLORS[detail.tipo]||C.muted);
              return (
                <>
                  {/* Header */}
                  <div style={{padding:"10px 20px 16px",borderBottom:`1px solid ${C.border}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:24,fontWeight:900,color:C.text,lineHeight:1.1}}>
                          {detail.corte||detail.tipo}
                        </div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
                          <span style={{background:C.light,color:C.muted,fontSize:12,padding:"2px 9px",borderRadius:4,textTransform:"capitalize"}}>{detail.tipo}</span>
                          <span style={{fontSize:12,padding:"2px 9px",borderRadius:4,fontWeight:600,
                            background:detail.status==="aberto"?C.warning+"33":C.light,
                            color:detail.status==="aberto"?C.warning:C.muted}}>
                            {detail.status}
                          </span>
                          {al!=="ok"&&<Badge label={ai.label} color={ai.color}/>}
                        </div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                        <div style={{fontSize:30,fontWeight:900,color:accent,lineHeight:1}}>{fmtKg(detail.pesoTotal)}</div>
                        {detail.pesoInicial&&detail.pesoInicial!==detail.pesoTotal&&(
                          <div style={{fontSize:11,color:C.muted}}>entrada: {fmtKg(detail.pesoInicial)}</div>
                        )}
                        <button onClick={closeModal}
                          style={{background:C.light,border:"none",borderRadius:"50%",width:30,height:30,
                            color:C.muted,cursor:"pointer",fontSize:14,marginTop:4}}>✕</button>
                      </div>
                    </div>
                  </div>

                  {/* All details */}
                  <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      {[
                        {icon:"📍", label:"Local",          value:detail.local},
                        {icon:"📅", label:"Data de entrada", value:`${fmtDate(detail.dataEntrada)} · ${diffDays(detail.dataEntrada,TODAY)}d`},
                        detail.corte&&{icon:"🔪", label:"Corte", value:detail.corte},
                        {icon:"⚖️", label:"Peso total", value:fmtKg(detail.pesoTotal)},
                        {icon:"📦", label:"Nº de pacotes", value:`${(detail.pacotes||[]).filter(p=>p.status!=="consumido").length||detail.quantidadePecas||1} pacote${((detail.pacotes||[]).filter(p=>p.status!=="consumido").length||detail.quantidadePecas||1)!==1?"s":""}`},
                      ].filter(Boolean).map((row,i)=>(
                        <div key={i} style={{background:C.light,borderRadius:8,padding:"10px 12px"}}>
                          <div style={{fontSize:10,color:C.muted,marginBottom:3,fontWeight:600}}>
                            {row.icon} {row.label}
                          </div>
                          <div style={{fontWeight:600,fontSize:14,color:C.text}}>{row.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Origem — editável */}
                    <div style={{marginTop:8,background:C.light,borderRadius:8,padding:"10px 12px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:editingOrigem?10:0}}>
                        <div>
                          <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>
                            {detail.origem==="do sol"?"☀️":detail.origem==="temperada"?"🌶️":"🌿"} Origem
                          </div>
                          {!editingOrigem&&(
                            <div style={{fontWeight:600,fontSize:14,color:C.text}}>
                              {detail.origem==="do sol"?"Do Sol":detail.origem==="temperada"?"Temperada":detail.origem==="in natura"?"In Natura":"Não definida"}
                            </div>
                          )}
                        </div>
                        <button onClick={()=>setEditingOrigem(e=>!e)}
                          style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,
                            padding:"3px 9px",cursor:"pointer",fontSize:11,color:C.muted}}>
                          {editingOrigem?"✕ Fechar":"✏️ Editar"}
                        </button>
                      </div>
                      {editingOrigem&&(
                        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                          {[
                            {val:"in natura",  label:"🌿 In Natura",  color:C.success},
                            {val:"do sol",     label:"☀️ Do Sol",     color:C.warning},
                            {val:"temperada",  label:"🌶️ Temperada",  color:"#FF7043"},
                          ].map(o=>(
                            <button key={o.val}
                              onClick={()=>{ onUpdate(detail.id,{origem:o.val}); setEditingOrigem(false); }}
                              style={{flex:"1 1 40%",padding:"9px 4px",borderRadius:8,cursor:"pointer",
                                fontSize:11,fontWeight:700,
                                background:detail.origem===o.val?o.color+"22":C.bg,
                                border:`2px solid ${detail.origem===o.val?o.color:C.border}`,
                                color:detail.origem===o.val?o.color:C.muted}}>
                              {o.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Preço — editável por pacote */}
                    <div style={{marginTop:8,background:C.light,borderRadius:8,padding:"10px 12px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:editingPreco?10:0}}>
                        <div>
                          <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>💰 Preço</div>
                          {!editingPreco&&(
                            <div style={{fontWeight:600,fontSize:14,color:C.text}}>
                              {detail.precoPago ? fmtR(detail.precoPago) : "—"}
                              {detail.precoKg && <span style={{fontSize:12,color:C.muted}}> · {fmtR(detail.precoKg)}/kg</span>}
                            </div>
                          )}
                        </div>
                        <button onClick={()=>{
                          if(!editingPreco) {
                            const pacs = (detail.pacotes||[]).filter(p=>p.status!=="consumido");
                            const porPac = pacs.length && detail.precoPago
                              ? parseFloat((detail.precoPago/pacs.length).toFixed(2)) : "";
                            if(pacs.length>0) {
                              setPrecoForm(pacs.reduce((obj,p)=>({...obj,[p.id]:porPac}),{}));
                            } else {
                              setPrecoForm({__single__: detail.precoPago||""});
                            }
                          }
                          setEditingPreco(e=>!e);
                        }}
                          style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,
                            padding:"3px 9px",cursor:"pointer",fontSize:11,color:C.muted}}>
                          {editingPreco?"✕ Fechar":"✏️ Editar"}
                        </button>
                      </div>
                      {editingPreco&&(()=>{
                        const pacs = (detail.pacotes||[]).filter(p=>p.status!=="consumido");
                        const isSingle = pacs.length===0 || "__single__" in precoForm;
                        const totalPreco = isSingle
                          ? parseFloat(precoForm.__single__)||0
                          : pacs.reduce((s,p)=>s+(parseFloat(precoForm[p.id])||0),0);
                        const totalPeso = isSingle
                          ? detail.pesoTotal
                          : pacs.reduce((s,p)=>s+p.pesoAtual,0);
                        return (
                          <div>
                            {isSingle ? (
                              <div style={{marginBottom:8}}>
                                <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:4}}>Preço total (R$)</div>
                                <input style={inputBase} type="number" step="0.01"
                                  value={precoForm.__single__}
                                  onFocus={e=>e.target.select()}
                                  onChange={e=>setPrecoForm({__single__:e.target.value})}
                                  placeholder="Ex: 149.75"/>
                              </div>
                            ) : (
                              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:8,marginBottom:8}}>
                                {pacs.map((p,i)=>(
                                  <div key={p.id}>
                                    <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>
                                      Pacote {i+1} · {fmtKg(p.pesoAtual)}
                                    </div>
                                    <input style={inputBase} type="number" step="0.01"
                                      value={precoForm[p.id]||""}
                                      onFocus={e=>e.target.select()}
                                      onChange={e=>setPrecoForm(f=>({...f,[p.id]:e.target.value}))}
                                      placeholder="R$"/>
                                  </div>
                                ))}
                              </div>
                            )}
                            {totalPreco>0&&(
                              <div style={{fontSize:11,color:C.muted,marginBottom:8}}>
                                Total: <strong style={{color:C.primary}}>{fmtR(totalPreco)}</strong>
                                {totalPeso>0&&<span> · {fmtR(parseFloat((totalPreco/totalPeso).toFixed(2)))}/kg</span>}
                              </div>
                            )}
                            <button onClick={()=>{
                              const precoKgCalc = totalPeso>0 ? parseFloat((totalPreco/totalPeso).toFixed(2)) : null;
                              onUpdate(detail.id,{
                                precoPago: totalPreco||null,
                                precoKg:   precoKgCalc,
                              });
                              setEditingPreco(false);
                            }}
                              style={{width:"100%",background:C.success+"22",border:`1px solid ${C.success}55`,
                                borderRadius:8,padding:"10px",cursor:"pointer",color:C.success,
                                fontSize:13,fontWeight:700}}>
                              ✅ Salvar preço
                            </button>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Utilidade — editável */}
                    <div style={{marginTop:8,background:C.light,borderRadius:8,padding:"10px 12px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:editingUtilidade?10:0}}>
                        <div>
                          <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>🎯 Utilidade</div>
                          {!editingUtilidade&&(
                            <div style={{fontWeight:600,fontSize:14,color:C.text}}>
                              {detail.utilidade==="churrasco"?"🔥 Churrasco":detail.utilidade==="consumo"?"🍽️ Consumo":"Não definida"}
                            </div>
                          )}
                        </div>
                        <button onClick={()=>setEditingUtilidade(e=>!e)}
                          style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,
                            padding:"3px 9px",cursor:"pointer",fontSize:11,color:C.muted}}>
                          {editingUtilidade?"✕ Fechar":"✏️ Editar"}
                        </button>
                      </div>
                      {editingUtilidade&&(
                        <div style={{display:"flex",gap:8}}>
                          {[
                            {val:"churrasco", label:"🔥 Churrasco", color:C.primary},
                            {val:"consumo",  label:"🍽️ Consumo",  color:C.info},
                          ].map(u=>(
                            <button key={u.val}
                              onClick={()=>{ onUpdate(detail.id,{utilidade:u.val}); setEditingUtilidade(false); }}
                              style={{flex:1,padding:"10px 4px",borderRadius:8,cursor:"pointer",
                                fontSize:12,fontWeight:700,
                                background:detail.utilidade===u.val?u.color+"22":C.bg,
                                border:`2px solid ${detail.utilidade===u.val?u.color:C.border}`,
                                color:detail.utilidade===u.val?u.color:C.muted}}>
                              {u.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {(detail.pacotes?.length>0)&&(
                      <div style={{marginTop:10}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                          <div style={{fontSize:11,color:C.muted,fontWeight:600}}>📦 Peso de cada pacote</div>
                          <button onClick={()=>{
                            if(!editingPacotes) {
                              const pacs = detail.pacotes.filter(p=>p.status!=="consumido");
                              setPacotesForm(pacs.reduce((obj,p)=>({...obj,[p.id]:p.pesoAtual}),{}));
                            }
                            setEditingPacotes(e=>!e);
                          }}
                            style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,
                              padding:"3px 9px",cursor:"pointer",fontSize:11,color:C.muted}}>
                            {editingPacotes?"✕ Fechar":"✏️ Editar pesos"}
                          </button>
                        </div>
                        {detail.pacotes.map((p,i)=>(
                          <div key={p.id||i} style={{display:"flex",justifyContent:"space-between",
                            alignItems:"center",padding:"7px 10px",borderRadius:8,marginBottom:4,
                            background:p.churrasco?"#FF6B3522":p.status==="consumido"?"transparent":p.status==="aberto"?C.warning+"18":C.light,
                            border:p.churrasco?`2px solid ${C.primary}55`:"2px solid transparent",
                            opacity:p.status==="consumido"?0.4:1}}>
                            <span style={{fontSize:13,fontWeight:600,color:C.text}}>
                              Pacote {i+1}
                              {p.churrasco&&<span style={{fontSize:11,color:C.primary}}> · 🔥 churrasco</span>}
                              {p.status==="aberto"&&<span style={{color:C.warning,fontSize:11}}> · 🔓 aberto</span>}
                              {p.status==="consumido"&&<span style={{color:C.dim,fontSize:11}}> · consumido</span>}
                            </span>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              {editingPacotes&&p.status!=="consumido" ? (
                                <input style={{...inputBase,width:90,textAlign:"right",padding:"4px 8px",fontSize:13}}
                                  type="number" step="0.1" min="0"
                                  value={pacotesForm[p.id]??p.pesoAtual}
                                  onFocus={e=>e.target.select()}
                                  onChange={e=>setPacotesForm(f=>({...f,[p.id]:e.target.value}))}/>
                              ) : (
                                <div style={{textAlign:"right"}}>
                                  <span style={{fontWeight:800,fontSize:14,
                                    color:p.status==="consumido"?C.dim:p.status==="aberto"?C.warning:C.primary}}>
                                    {fmtKg(p.pesoAtual)}
                                  </span>
                                  {p.pesoAtual!==p.peso&&(
                                    <div style={{fontSize:10,color:C.dim}}>original: {fmtKg(p.peso)}</div>
                                  )}
                                </div>
                              )}
                              {p.status!=="consumido"&&!editingPacotes&&(
                                <button onClick={()=>onTogglePacoteChurrasco(detail.id,p.id)}
                                  style={{background:p.churrasco?C.primary+"33":C.bg,
                                    border:`1px solid ${p.churrasco?C.primary:C.border}`,
                                    borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:14}}>
                                  🔥
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        {editingPacotes&&(
                          <button onClick={()=>{
                            const updated = detail.pacotes.map(p=>{
                              if(p.status==="consumido") return p;
                              const novo = parseFloat(pacotesForm[p.id]);
                              if(isNaN(novo)||novo<0) return p;
                              return {...p,pesoAtual:parseFloat(novo.toFixed(3)),status:novo<=0.001?"consumido":p.status};
                            });
                            const newTotal = parseFloat(updated.filter(p=>p.status!=="consumido").reduce((s,p)=>s+p.pesoAtual,0).toFixed(3));
                            onUpdate(detail.id,{pacotes:updated,pesoTotal:newTotal});
                            setEditingPacotes(false);
                          }}
                            style={{width:"100%",background:C.success+"22",border:`1px solid ${C.success}55`,
                              borderRadius:8,padding:"10px",cursor:"pointer",color:C.success,
                              fontSize:13,fontWeight:700,marginTop:4}}>
                            ✅ Salvar pesos
                          </button>
                        )}
                      </div>
                    )}

                    {detail.observacao&&(
                      <div style={{marginTop:8,background:C.light,borderRadius:8,padding:"10px 12px",
                        fontSize:13,color:C.muted,display:"flex",gap:8,alignItems:"flex-start"}}>
                        <span>📝</span><span>{detail.observacao}</span>
                      </div>
                    )}
                  </div>

                  {/* Transfer section */}
                  <div style={{padding:"16px 20px 28px"}}>
                    {transferOk ? (
                      <div style={{background:"#0D2A1A",border:`1px solid ${C.success}55`,
                        borderRadius:12,padding:"14px",textAlign:"center",fontSize:14,
                        color:C.success,fontWeight:700}}>
                        ✅ Movido para <strong>{transferOk}</strong>!
                      </div>
                    ) : showXfer ? (
                      <>
                        <div style={{fontWeight:700,fontSize:14,color:C.info,marginBottom:10}}>
                          🔄 Transferir para outro local
                        </div>

                        {/* Modo: tudo ou parcial */}
                        <div style={{display:"flex",gap:8,marginBottom:12}}>
                          {["tudo","parcial"].map(m=>(
                            <button key={m} onClick={()=>setXferMode(m)}
                              style={{flex:1,padding:"9px",borderRadius:8,cursor:"pointer",
                                fontSize:13,fontWeight:700,
                                background:xferMode===m?C.info+"22":C.light,
                                border:`2px solid ${xferMode===m?C.info:C.border}`,
                                color:xferMode===m?C.info:C.muted}}>
                              {m==="tudo"?"📦 Tudo":"⚖️ Parcial (peso)"}
                            </button>
                          ))}
                        </div>

                        {/* Se parcial, mostra campos por pacote */}
                        {xferMode==="parcial"&&(
                          <div style={{marginBottom:12}}>
                            {(detail.pacotes||[]).filter(p=>p.status!=="consumido").map((p,i)=>{
                              const isCompleto = parseFloat(xferPesos[p.id])===p.pesoAtual;
                              return (
                                <div key={p.id} style={{background:C.light,borderRadius:10,padding:"10px 12px",marginBottom:8}}>
                                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                                    <span style={{fontSize:13,fontWeight:700}}>Pacote {i+1}</span>
                                    <span style={{fontSize:12,color:C.primary}}>{fmtKg(p.pesoAtual)}</span>
                                  </div>
                                  <div style={{display:"flex",gap:8}}>
                                    <button onClick={()=>setXferPesos(f=>({...f,[p.id]:isCompleto?"":p.pesoAtual}))}
                                      style={{flex:"0 0 auto",padding:"8px 12px",borderRadius:8,cursor:"pointer",
                                        fontSize:12,fontWeight:700,
                                        background:isCompleto?C.info+"33":C.bg,
                                        border:`2px solid ${isCompleto?C.info:C.border}`,
                                        color:isCompleto?C.info:C.muted}}>
                                      {isCompleto?"✅ Completo":"📦 Completo"}
                                    </button>
                                    <input style={{...inputBase,flex:1,padding:"8px 10px",fontSize:13}}
                                      type="number" step="0.1" min="0" max={p.pesoAtual}
                                      placeholder="Parcial (kg)"
                                      value={xferPesos[p.id]||""}
                                      onFocus={e=>{e.target.select();setXferPesos(f=>({...f,[p.id]:""}));}}
                                      onChange={e=>setXferPesos(f=>({...f,[p.id]:e.target.value}))}/>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Destino */}
                        <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:8}}>
                          Escolha o destino:
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:8}}>
                          {(appConfig?.locais||LOCAIS).filter(l=>l!==detail.local).map(l=>(
                            <button key={l} onClick={()=>{
                              if(xferMode==="parcial"){
                                const hasAny=Object.values(xferPesos).some(v=>parseFloat(v)>0);
                                if(!hasAny) return alert("Informe o peso a transferir de pelo menos um pacote.");
                              }
                              doTransfer(l);
                            }}
                              style={{background:C.light,border:`1px solid ${C.border}`,
                                borderRadius:12,padding:"14px 18px",cursor:"pointer",
                                color:C.text,fontSize:15,fontWeight:700,textAlign:"left",
                                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <span>📍 {l}</span>
                              <span style={{color:C.info,fontSize:20}}>→</span>
                            </button>
                          ))}
                        </div>
                        <button onClick={()=>{setShowXfer(false);setXferMode("tudo");setXferPesos({});}}
                          style={{marginTop:10,background:"none",border:"none",color:C.muted,
                            cursor:"pointer",fontSize:13,width:"100%",textAlign:"center"}}>
                          ← Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        {/* ── SAÍDA inline ── */}
                        {!showSaida ? (
                          <button onClick={()=>{
                            const pacs=(detail.pacotes||[]).filter(p=>p.status!=="consumido");
                            setSaidaForm({
                              data:TODAY, motivo:"consumo",
                              pesos:Object.fromEntries(pacs.map(p=>[p.id,""]))
                            });
                            setShowSaida(true);
                          }}
                            style={{width:"100%",background:C.danger+"22",border:`1px solid ${C.danger}55`,
                              borderRadius:12,padding:"13px",cursor:"pointer",color:C.danger,
                              fontSize:14,fontWeight:700,marginBottom:8,display:"flex",
                              justifyContent:"center",alignItems:"center",gap:8}}>
                            ➖ Registrar Saída
                          </button>
                        ) : (
                          <div style={{background:"#1A0A0A",border:`1px solid ${C.danger}44`,borderRadius:12,padding:14,marginBottom:8}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                              <div style={{fontWeight:700,fontSize:14,color:C.danger}}>➖ Registrar Saída</div>
                              <button onClick={()=>{
                                const pacs=(detail.pacotes||[]).filter(p=>p.status!=="consumido");
                                setSaidaForm(f=>({...f,pesos:Object.fromEntries(pacs.map(p=>[p.id,p.pesoAtual]))}));
                              }}
                                style={{background:C.danger+"22",border:`1px solid ${C.danger}55`,borderRadius:8,
                                  padding:"5px 10px",cursor:"pointer",color:C.danger,fontSize:12,fontWeight:700}}>
                                📦 Tudo
                              </button>
                            </div>

                            {/* Peso por pacote */}
                            {(detail.pacotes||[]).filter(p=>p.status!=="consumido").map((p,i)=>{
                              const isCompleto = parseFloat(saidaForm.pesos?.[p.id])===p.pesoAtual;
                              return (
                                <div key={p.id} style={{marginBottom:10,background:C.light,borderRadius:10,padding:"10px 12px"}}>
                                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                                    <span style={{fontSize:13,fontWeight:700,color:C.text}}>Pacote {i+1}</span>
                                    <span style={{fontSize:12,color:C.primary,fontWeight:600}}>{fmtKg(p.pesoAtual)} disponível</span>
                                  </div>
                                  <div style={{display:"flex",gap:8}}>
                                    {/* Botão completo */}
                                    <button onClick={()=>setSaidaForm(f=>({
                                      ...f, pesos:{...f.pesos, [p.id]: isCompleto?"":p.pesoAtual}
                                    }))}
                                      style={{flex:"0 0 auto",padding:"9px 14px",borderRadius:8,cursor:"pointer",
                                        fontSize:12,fontWeight:700,
                                        background:isCompleto?C.danger+"33":C.bg,
                                        border:`2px solid ${isCompleto?C.danger:C.border}`,
                                        color:isCompleto?C.danger:C.muted}}>
                                      {isCompleto?"✅ Completo":"📦 Completo"}
                                    </button>
                                    {/* Campo parcial */}
                                    <input style={{...inputBase,flex:1,padding:"8px 10px",fontSize:13}}
                                      type="number" step="0.1" min="0" max={p.pesoAtual}
                                      placeholder="Parcial (kg)"
                                      value={saidaForm.pesos?.[p.id]||""}
                                      onFocus={e=>{e.target.select();setSaidaForm(f=>({...f,pesos:{...f.pesos,[p.id]:""}}));}}
                                      onChange={e=>setSaidaForm(f=>({...f,pesos:{...f.pesos,[p.id]:e.target.value}}))}/>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Data */}
                            <div style={{marginBottom:8}}>
                              <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:4}}>📅 Data</div>
                              <input style={{...inputBase,width:"100%",padding:"8px 12px"}}
                                type="date" value={saidaForm.data||TODAY}
                                onChange={e=>setSaidaForm(f=>({...f,data:e.target.value}))}/>
                            </div>
                            {/* Motivo */}
                            <div style={{marginBottom:12}}>
                              <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:4}}>🎯 Motivo</div>
                              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                                {["consumo","churrasco","descarte","doação"].map(m=>(
                                  <button key={m} onClick={()=>setSaidaForm(f=>({...f,motivo:m}))}
                                    style={{padding:"6px 12px",borderRadius:8,cursor:"pointer",fontSize:12,
                                      fontWeight:600,textTransform:"capitalize",
                                      background:saidaForm.motivo===m?C.primary+"22":C.light,
                                      color:saidaForm.motivo===m?C.primary:C.muted,
                                      border:`1px solid ${saidaForm.motivo===m?C.primary:C.border}`}}>
                                    {m}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {/* Buttons */}
                            <div style={{display:"flex",gap:8}}>
                              <button onClick={()=>{
                                const pacs=(detail.pacotes||[]).filter(p=>p.status!=="consumido");
                                const hasAny = pacs.some(p=>parseFloat(saidaForm.pesos?.[p.id])>0);
                                if(!hasAny) return alert("Informe o peso a retirar de pelo menos um pacote.");
                                // Apply exits per package
                                const updatedPacotes = (detail.pacotes||[]).map(p=>{
                                  const retirar = parseFloat(saidaForm.pesos?.[p.id])||0;
                                  if(retirar<=0||p.status==="consumido") return p;
                                  const novoAtual = Math.max(0, Math.round((p.pesoAtual-retirar)*1000)/1000);
                                  return {...p, pesoAtual:novoAtual, status:novoAtual<=0.001?"consumido":"aberto"};
                                });
                                const novoTotal = Math.round(updatedPacotes.filter(p=>p.status!=="consumido").reduce((s,p)=>s+p.pesoAtual,0)*1000)/1000;
                                const totalRetirado = Math.round(pacs.reduce((s,p)=>s+(parseFloat(saidaForm.pesos?.[p.id])||0),0)*1000)/1000;
                                onUpdate(detail.id,{pacotes:updatedPacotes,pesoTotal:novoTotal,status:novoTotal<=0?"consumido":"aberto"});
                                onRegisterExit({id:detail.id,tipo:detail.tipo,corte:detail.corte,local:detail.local,pesoRetirado:totalRetirado,dataSaida:saidaForm.data,motivo:saidaForm.motivo});
                                setShowSaida(false); setSaidaForm({});
                                if(novoTotal<=0){
                                  closeModal();
                                  if(window.confirm(`Acabou o estoque de "${detail.corte||detail.tipo}".\n\nAdicionar à lista de compras?`)){
                                    onAddToShoppingList(detail.corte||detail.tipo, detail.tipo);
                                  }
                                }
                              }}
                                style={{flex:2,background:C.danger,border:"none",borderRadius:8,
                                  padding:"11px",cursor:"pointer",color:"#fff",fontSize:13,fontWeight:700}}>
                                ✅ Confirmar saída
                              </button>
                              <button onClick={()=>{setShowSaida(false);setSaidaForm({});}}
                                style={{flex:1,background:C.light,border:`1px solid ${C.border}`,borderRadius:8,
                                  padding:"11px",cursor:"pointer",color:C.muted,fontSize:13}}>
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                        <button onClick={()=>setShowXfer(true)}
                          style={{width:"100%",background:C.info+"22",border:`1px solid ${C.info}55`,
                            borderRadius:12,padding:"14px",cursor:"pointer",color:C.info,
                            fontSize:15,fontWeight:700,display:"flex",justifyContent:"center",
                            alignItems:"center",gap:8}}>
                          🔄 Transferir para outro local
                        </button>
                      </>
                    )}

                    {/* Excluir item */}
                    <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
                      {!confirmDelete ? (
                        <button onClick={()=>setConfirmDelete(true)}
                          style={{width:"100%",background:"transparent",border:`1px solid ${C.danger}55`,
                            borderRadius:12,padding:"12px",cursor:"pointer",color:C.danger,
                            fontSize:13,fontWeight:700,display:"flex",justifyContent:"center",
                            alignItems:"center",gap:8}}>
                          🗑️ Excluir item do estoque
                        </button>
                      ) : (
                        <div style={{background:"#2A0A0A",border:`1px solid ${C.danger}55`,borderRadius:12,padding:14}}>
                          <div style={{fontSize:13,color:C.danger,fontWeight:700,marginBottom:4,textAlign:"center"}}>
                            ⚠️ Confirmar exclusão?
                          </div>
                          <div style={{fontSize:11,color:C.muted,textAlign:"center",marginBottom:12}}>
                            "{detail.corte||detail.tipo}" será removido permanentemente do estoque.
                          </div>
                          <div style={{display:"flex",gap:8}}>
                            <button onClick={()=>{ onDelete(detail.id); closeModal(); }}
                              style={{flex:1,background:C.danger,border:"none",borderRadius:8,
                                padding:"11px",cursor:"pointer",color:"#fff",fontSize:13,fontWeight:700}}>
                              🗑️ Sim, excluir
                            </button>
                            <button onClick={()=>setConfirmDelete(false)}
                              style={{flex:1,background:C.light,border:`1px solid ${C.border}`,borderRadius:8,
                                padding:"11px",cursor:"pointer",color:C.muted,fontSize:13,fontWeight:600}}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ENTRADA ──────────────────────────────────────────────────────────────────
function Entrada({onAdd, onAddToExisting, catalog, meats, setTab, appConfig}) {
  const cfgTipos  = appConfig?.tipos      || TIPOS;
  const cfgLocais = appConfig?.locais     || LOCAIS;
  const cfgOrigens= appConfig?.origens    || ORIGENS;
  const cfgUtils  = appConfig?.utilidades || ["churrasco","consumo"];
  const blank = {tipo:cfgTipos[0]||"bovina",corte:"",origem:"",utilidade:"",pesoTotal:"",quantidadePecas:"1",
    dataEntrada:TODAY,local:cfgLocais[0]||"Freezer 1",status:"disponível",observacao:"",precoPago:"",precoKg:""};
  const [form,     setForm]    = useState(blank);
  const [ok,       setOk]      = useState(false);
  const [addMode,  setAddMode] = useState(null);
  const [addForm,  setAddForm] = useState({pesoAdd:"",qtdAdd:"1",precoAdd:""});
  const [pesosInd, setPesosInd] = useState([""]);
  const set  = k=>e=>setForm(f=>({...f,[k]:e.target.value}));
  const setA = k=>e=>setAddForm(f=>({...f,[k]:e.target.value}));

  const qtd = parseInt(form.quantidadePecas)||1;

  // Sincroniza array de pesos com qtd
  const handleQtdChange = (e) => {
    const n = Math.max(1, parseInt(e.target.value)||1);
    setForm(f=>({...f,quantidadePecas:String(n)}));
    setPesosInd(prev=>{
      const arr=[...prev];
      while(arr.length<n) arr.push(arr[0]||"");
      return arr.slice(0,n);
    });
  };

  // Capitaliza primeira letra do corte
  const calcPrecoKg = () => {
    const total = qtd>1
      ? pesosInd.reduce((s,p)=>s+(parseFloat(p)||0),0)
      : parseFloat(form.pesoTotal)||0;
    const pago = parseFloat(form.precoPago);
    if(pago && total>0) setForm(f=>({...f,precoKg:(pago/total).toFixed(2)}));
  };

  const totalPesosInd = qtd>1
    ? pesosInd.reduce((s,p)=>s+(parseFloat(p)||0),0)
    : parseFloat(form.pesoTotal)||0;

  // Itens correspondentes no estoque
  // — exato (tipo + corte + origem) → auto-merge ao salvar
  // — parcial (tipo + corte, origem diferente) → mostra sugestão
  const corteKey   = form.corte.trim().toLowerCase();
  const exactMatch = corteKey.length>1
    ? meats.find(m=>
        m.tipo===(form.tipo) &&
        (m.corte||m.tipo).trim().toLowerCase()===corteKey &&
        (m.origem||"")===(form.origem||"") &&
        m.pesoTotal>0
      )
    : null;
  const matchingItems = !exactMatch && corteKey.length>1
    ? meats.filter(m=>
        m.tipo===form.tipo &&
        (m.corte||m.tipo).trim().toLowerCase()===corteKey &&
        m.pesoTotal>0
      )
    : [];

  const selectedForAdd = meats.find(m=>m.id===addMode);

  const submit = () => {
    if(qtd>1) {
      if(pesosInd.some(p=>!(parseFloat(p)>0))) return alert("Informe o peso de todos os pacotes.");
    } else {
      if(!form.pesoTotal||+form.pesoTotal<=0) return alert("Informe um peso válido.");
    }
    const pacotesPesos = qtd>1
      ? pesosInd.map(p=>parseFloat(p))
      : [parseFloat(form.pesoTotal)];
    const totalPeso = Math.round(pacotesPesos.reduce((s,p)=>s+p,0)*1000)/1000;

    if(!window.confirm(
      `Confirmar cadastro?\n\n` +
      `• ${form.tipo}${form.corte?" — "+form.corte:""}\n` +
      `• ${qtd} pacote${qtd>1?"s":""}\n` +
      `• Peso total: ${totalPeso.toFixed(3).replace(".",",")} kg\n` +
      `• Local: ${form.local}\n` +
      (form.precoPago?`• Preço: R$ ${parseFloat(form.precoPago).toFixed(2)}\n`:"") +
      `\nEstá correto?`
    )) return;

    // Auto-merge: tipo + corte + origem iguais → vira mais pacote(s)
    if(exactMatch) {
      onAddToExisting(exactMatch.id, totalPeso, qtd, parseFloat(form.precoPago)||null, pacotesPesos);
      setForm(blank); setAddMode(null); setPesosInd([""]);
      setOk(true); setTimeout(()=>setOk(false),3000);
      return;
    }

    onAdd({...form,
      pesoTotal:       totalPeso,
      pacotesPesos,
      quantidadePecas: qtd,
      precoPago:       parseFloat(form.precoPago)||null,
      precoKg:         parseFloat(form.precoKg)||null,
    });
    setForm(blank); setAddMode(null); setPesosInd([""]);
    setOk(true); setTimeout(()=>setOk(false),3000);
  };

  const submitAdd = () => {
    if(!addForm.pesoAdd||+addForm.pesoAdd<=0) return alert("Informe o peso a adicionar.");
    onAddToExisting(addMode,parseFloat(addForm.pesoAdd),parseInt(addForm.qtdAdd)||1,parseFloat(addForm.precoAdd)||null);
    setAddMode(null); setAddForm({pesoAdd:"",qtdAdd:"1",precoAdd:""});
    setOk(true); setTimeout(()=>setOk(false),3000);
  };

  const OrigBtn = ({val,label}) => (
    <button onClick={()=>setForm(f=>({...f,origem:f.origem===val?"":val}))}
      style={{flex:1,padding:"10px 0",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",
        border:`2px solid ${form.origem===val?C.primary:C.border}`,
        background:form.origem===val?C.primary+"22":"#0A1520",
        color:form.origem===val?C.primary:C.muted}}>
      {label}
    </button>
  );

  const UtilBtn = ({val,label}) => (
    <button onClick={()=>setForm(f=>({...f,utilidade:f.utilidade===val?"":val}))}
      style={{flex:1,padding:"10px 0",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",
        border:`2px solid ${form.utilidade===val?C.primary:C.border}`,
        background:form.utilidade===val?C.primary+"22":"#0A1520",
        color:form.utilidade===val?C.primary:C.muted}}>
      {label}
    </button>
  );

  return (
    <div>
      <SecTitle icon="➕" children="Nova Entrada"/>
      {ok&&(
        <Card style={{background:"#0B2A1E",borderColor:C.success,marginBottom:14}}>
          <span style={{color:C.success,fontWeight:700}}>✅ Estoque atualizado com sucesso!</span>
        </Card>
      )}
      <Card>
        {/* Tipo + Corte */}
        <div style={GRID2}>
          <FSelect label="Tipo *" value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value,corte:""}))}>
            {cfgTipos.length===0
              ? <option value="">— cadastre tipos em Ajustes —</option>
              : cfgTipos.map(t=><option key={t} value={t}>{t}</option>)
            }
          </FSelect>
          <FSelect label="Corte" value={form.corte} onChange={set("corte")}>
            <option value="">Selecione um corte...</option>
            {catalog.map(c=>(
              <option key={c.key} value={c.nome}>{c.nome}</option>
            ))}
            {catalog.length===0&&(
              <option disabled>— cadastre cortes em Ajustes —</option>
            )}
          </FSelect>
        </div>

        {/* Origem */}
        <FWrap>
          <FLabel>Origem</FLabel>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {cfgOrigens.map(o=>(
              <OrigBtn key={o} val={o} label={`${getOrigenPalette(cfgOrigens,o).icon} ${o}`}/>
            ))}
          </div>
        </FWrap>

        <FWrap>
          <FLabel>Utilidade</FLabel>
          <div style={{display:"flex",gap:8}}>
            {cfgUtils.map(u=>(
              <UtilBtn key={u} val={u} label={`${getUtilPalette(cfgUtils,u).icon} ${u}`}/>
            ))}
          </div>
        </FWrap>

        {/* Aviso de auto-merge quando tipo+corte+origem já existem */}
        {exactMatch&&!addMode&&(
          <div style={{background:"#0B2A1E",border:`1px solid ${C.success}55`,borderRadius:8,
            padding:"10px 12px",marginBottom:12}}>
            <div style={{fontSize:12,color:C.success,fontWeight:700,marginBottom:2}}>
              ✅ Será adicionado como pacote ao estoque existente
            </div>
            <div style={{fontSize:11,color:C.muted}}>
              {exactMatch.corte||exactMatch.tipo} · {exactMatch.local} · {fmtKg(exactMatch.pesoTotal)} já em estoque
            </div>
          </div>
        )}

        {matchingItems.length>0&&!addMode&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:12,color:C.info,fontWeight:600,marginBottom:8}}>
              📦 Já existe em estoque — adicionar a um item existente?
            </div>
            {matchingItems.map(m=>(
              <div key={m.id} onClick={()=>setAddMode(m.id)}
                style={{background:C.light,border:`1px solid ${C.border}`,borderRadius:8,
                  padding:"10px 12px",cursor:"pointer",marginBottom:6,
                  display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700}}>{m.corte||m.tipo}
                    {m.origem&&<span style={{fontSize:11,color:C.muted}}> · {m.origem}</span>}
                  </div>
                  <div style={{fontSize:11,color:C.muted}}>
                    {m.local} · {fmtKg(m.pesoTotal)} · {m.quantidadePecas||1} pacote{(m.quantidadePecas||1)!==1?"s":""}
                  </div>
                </div>
                <span style={{color:C.success,fontWeight:700,fontSize:13}}>+ Adicionar →</span>
              </div>
            ))}
            <div style={{fontSize:11,color:C.muted,marginTop:4}}>
              Ou preencha abaixo para cadastrar como item separado.
            </div>
          </div>
        )}

        {/* Modo adicionar ao existente */}
        {addMode&&selectedForAdd&&(
          <div style={{background:"#0B2035",border:`1px solid ${C.info}44`,borderRadius:10,padding:14,marginBottom:14}}>
            <div style={{fontWeight:700,marginBottom:6,color:C.info}}>
              + Adicionando a: <span style={{color:C.text}}>{selectedForAdd.corte||selectedForAdd.tipo}</span>
            </div>
            <div style={{fontSize:12,color:C.muted,marginBottom:10}}>
              Estoque atual: <strong style={{color:C.primary}}>{fmtKg(selectedForAdd.pesoTotal)}</strong> · {selectedForAdd.quantidadePecas||1} pacote{(selectedForAdd.quantidadePecas||1)!==1?"s":""}
            </div>
            <div style={GRID2}>
              <FInput label="Peso a adicionar (kg) *" type="number" step="0.1" min="0.1"
                value={addForm.pesoAdd} onChange={setA("pesoAdd")} onFocus={e=>e.target.select()} placeholder="Ex: 2.5"/>
              <FInput label="Nº de pacotes" type="number" step="1" min="1"
                value={addForm.qtdAdd} onChange={setA("qtdAdd")} onFocus={e=>e.target.select()} placeholder="1"/>
              <FInput label="Preço pago (R$)" type="number" step="0.01"
                value={addForm.precoAdd} onChange={setA("precoAdd")} placeholder="Opcional"/>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <Btn onClick={submitAdd} color={C.success}>✅ Confirmar adição</Btn>
              <Btn onClick={()=>setAddMode(null)} color={C.dim}>← Cancelar</Btn>
            </div>
          </div>
        )}

        {/* Formulário novo item */}
        {!addMode&&(
          <>
            <div style={GRID2}>
              {/* Nº de pacotes */}
              <FInput label="Nº de pacotes" value={form.quantidadePecas}
                onChange={handleQtdChange} type="number" step="1" min="1" placeholder="1"
                onFocus={e=>e.target.select()}/>

              {/* Peso único quando qtd = 1 */}
              {qtd===1&&(
                <FInput label="Peso total (kg) *"
                  value={form.pesoTotal} onChange={set("pesoTotal")} onFocus={e=>e.target.select()}
                  type="number" step="0.001" min="0.001" placeholder="Ex: 1.500"
                  autoComplete="off"/>
              )}
            </div>

            {/* Pesos individuais quando qtd > 1 — sempre mostra */}
            {qtd>1&&(
              <FWrap>
                <FLabel>Peso de cada pacote (kg) *</FLabel>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:8,marginBottom:6}}>
                  {pesosInd.map((p,i)=>(
                    <div key={i}>
                      <div style={{fontSize:11,color:C.muted,marginBottom:3}}>Pacote {i+1}</div>
                      <input style={inputBase} type="number" step="0.1" min="0"
                        value={p} placeholder="kg"
                        onFocus={e=>e.target.select()}
                        onChange={e=>{
                          const arr=[...pesosInd];
                          arr[i]=e.target.value;
                          setPesosInd(arr);
                        }}/>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:12,color:C.primary,fontWeight:700}}>
                  Total: {fmtKg(totalPesosInd)}
                </div>
              </FWrap>
            )}

            <div style={GRID2}>
              <FInput label="Data de entrada" value={form.dataEntrada} onChange={set("dataEntrada")} type="date"/>
              <FSelect label="Local" value={form.local} onChange={set("local")}>
                {cfgLocais.map(l=><option key={l} value={l}>{l}</option>)}
              </FSelect>
              <FInput label="Preço pago (R$)" value={form.precoPago} onChange={set("precoPago")}
                onBlur={calcPrecoKg} type="number" step="0.01" placeholder="Ex: 149.75"
                onFocus={e=>e.target.select()}/>
              <FInput label="Preço por kg (R$)" value={form.precoKg} onChange={set("precoKg")}
                type="number" step="0.01" placeholder="Calculado auto"
                onFocus={e=>e.target.select()}/>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>
              <Btn onClick={submit}>✅ Cadastrar item</Btn>
              <Btn onClick={()=>setTab("estoque")} color={C.dim}>← Voltar</Btn>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ─── SAÍDA ────────────────────────────────────────────────────────────────────
function Saida({meats,onRegister,setTab}) {
  const [filterUtil,   setFilterUtil]   = useState("todos");
  const [filterLocal,  setFilterLocal]  = useState("todos");
  const [filterOrigem, setFilterOrigem] = useState("todos");
  const [filterTipo,   setFilterTipo]   = useState("todos");
  const [filterCorte,  setFilterCorte]  = useState("");
  const avail = [...meats]
    .filter(m=>m.pesoTotal>0)
    .filter(m=>filterUtil==="todos"   ||m.utilidade===filterUtil)
    .filter(m=>filterLocal==="todos"  ||m.local===filterLocal)
    .filter(m=>filterOrigem==="todos" ||m.origem===filterOrigem)
    .filter(m=>filterTipo==="todos"   ||m.tipo===filterTipo)
    .filter(m=>!filterCorte           ||(m.corte||m.tipo).toLowerCase().includes(filterCorte.toLowerCase()))
    .sort((a,b)=>new Date(a.dataEntrada)-new Date(b.dataEntrada));
  const locaisComItem = LOCAIS.filter(l=>meats.some(m=>m.pesoTotal>0&&m.local===l));
  const tiposComItem  = TIPOS.filter(t=>meats.some(m=>m.pesoTotal>0&&m.tipo===t));
  const hasFilter = filterUtil!=="todos"||filterLocal!=="todos"||filterOrigem!=="todos"||filterTipo!=="todos"||filterCorte;
  const [sel,      setSel]      = useState("");
  const [selPacote,setSelPacote]= useState(null);
  const clearFilters = ()=>{setFilterUtil("todos");setFilterLocal("todos");setFilterOrigem("todos");setFilterTipo("todos");setFilterCorte("");setSel("");};
  const [form,     setForm]     = useState({pesoRetirado:"",dataSaida:TODAY,motivo:"churrasco",localDestino:"",eventoVinculado:"",observacao:""});
  const [ok,       setOk]       = useState(false);
  const set = k=>e=>setForm(f=>({...f,[k]:e.target.value}));
  const meat       = avail.find(m=>m.id===sel);
  const isTransfer = form.motivo==="transferência";
  const locaisDestino = meat ? LOCAIS.filter(l=>l!==meat.local) : LOCAIS;

  const meatPacotes = (meat?.pacotes||[]).filter(p=>p.status!=="consumido");
  const selectedPac  = meatPacotes.find(p=>p.id===selPacote);
  const maxPeso      = selPacote && selectedPac ? selectedPac.pesoAtual : meat?.pesoTotal||0;

  const handleMeatSelect = (m) => {
    setSel(m.id);
    setSelPacote(null);
    setForm(f=>({...f,localDestino:"",pesoRetirado:m.pesoTotal}));
  };

  const handlePacoteSelect = (pid) => {
    setSelPacote(pid);
    const p = meatPacotes.find(x=>x.id===pid);
    if(p) setForm(f=>({...f,pesoRetirado:p.pesoAtual}));
  };

  const submit = () => {
    if(!sel) return alert("Selecione uma carne.");
    if(isTransfer) {
      if(!form.localDestino) return alert("Selecione o local de destino.");
    } else {
      if(!form.pesoRetirado||+form.pesoRetirado<=0) return alert("Informe o peso retirado.");
      const peso = parseFloat(form.pesoRetirado);
      if(peso>maxPeso) return alert(`Peso maior que o disponível: ${fmtKg(maxPeso)}`);
    }
    onRegister({carneId:sel,...form,
      pesoRetirado:isTransfer?null:parseFloat(form.pesoRetirado),
      pacoteId:selPacote||null,
    });
    setSel(""); setSelPacote(null);
    setForm({pesoRetirado:"",dataSaida:TODAY,motivo:"churrasco",localDestino:"",eventoVinculado:"",observacao:""});
    setOk(true);
    setTimeout(()=>setOk(false),3000);
  };

  return (
    <div>
      <SecTitle icon="➖" children="Registrar Saída"/>
      {ok&&(
        <Card style={{background:"#0B2A1E",borderColor:C.success,marginBottom:14}}>
          <span style={{color:C.success,fontWeight:700}}>
            {isTransfer?"🔄 Transferência registrada!":"✅ Saída registrada! Estoque atualizado."}
          </span>
        </Card>
      )}
      <Card>
        {/* ── Filtros completos ── */}
        <div style={{marginBottom:12}}>
          {/* Armazenamento */}
          <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:6,paddingBottom:2}}>
            {["todos",...locaisComItem].map(l=>(
              <button key={l} onClick={()=>{setFilterLocal(l);setSel("");}}
                style={{background:filterLocal===l?C.info+"22":C.card,color:filterLocal===l?C.info:C.muted,
                  border:`1px solid ${filterLocal===l?C.info:C.border}`,borderRadius:20,
                  padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap",flexShrink:0}}>
                {l==="todos"?"📍 Todos locais":l}
              </button>
            ))}
          </div>
          {/* Tipo */}
          <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:6,paddingBottom:2}}>
            {["todos",...tiposComItem].map(t=>(
              <button key={t} onClick={()=>{setFilterTipo(t);setSel("");}}
                style={{background:filterTipo===t?C.warning+"22":C.card,color:filterTipo===t?C.warning:C.muted,
                  border:`1px solid ${filterTipo===t?C.warning:C.border}`,borderRadius:20,
                  padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:600,
                  whiteSpace:"nowrap",flexShrink:0,textTransform:"capitalize"}}>
                {t==="todos"?"Todos tipos":t}
              </button>
            ))}
          </div>
          {/* Origem */}
          <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:6,paddingBottom:2}}>
            {[{val:"todos",label:"Todas origens"},{val:"in natura",label:"🌿 In Natura"},{val:"do sol",label:"☀️ Do Sol"},{val:"temperada",label:"🌶️ Temperada"}].map(o=>(
              <button key={o.val} onClick={()=>{setFilterOrigem(o.val);setSel("");}}
                style={{background:filterOrigem===o.val?C.success+"22":C.card,color:filterOrigem===o.val?C.success:C.muted,
                  border:`1px solid ${filterOrigem===o.val?C.success:C.border}`,borderRadius:20,
                  padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap",flexShrink:0}}>
                {o.label}
              </button>
            ))}
          </div>
          {/* Utilidade */}
          <div style={{display:"flex",gap:6,marginBottom:6}}>
            {[{val:"todos",label:"Tudo"},{val:"churrasco",label:"🔥 Churrasco"},{val:"consumo",label:"🍽️ Consumo"}].map(u=>(
              <button key={u.val} onClick={()=>{setFilterUtil(u.val);setSel("");}}
                style={{background:filterUtil===u.val?C.primary+"22":C.card,color:filterUtil===u.val?C.primary:C.muted,
                  border:`1px solid ${filterUtil===u.val?C.primary:C.border}`,borderRadius:20,
                  padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:600}}>
                {u.label}
              </button>
            ))}
          </div>
          {/* Busca por corte + limpar */}
          <div style={{display:"flex",gap:8}}>
            <input style={{...inputBase,flex:1,padding:"8px 12px",fontSize:13}}
              placeholder="🔍 Buscar por corte..."
              value={filterCorte} onChange={e=>{setFilterCorte(e.target.value);setSel("");}}/>
            {hasFilter&&(
              <button onClick={clearFilters}
                style={{background:C.danger+"22",border:`1px solid ${C.danger}55`,borderRadius:8,
                  padding:"8px 10px",cursor:"pointer",color:C.danger,fontSize:12,fontWeight:700}}>
                ✕
              </button>
            )}
          </div>
          {hasFilter&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>{avail.length} item{avail.length!==1?"s":""} encontrado{avail.length!==1?"s":""}</div>}
        </div>

        {/* Selecionar carne */}
        <FLabel>Selecionar carne *</FLabel>
        <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:220,overflowY:"auto",marginBottom:14,paddingRight:4}}>
          {avail.length===0&&<div style={{color:C.muted}}>Nenhuma carne disponível.</div>}
          {avail.map(m=>(
            <div key={m.id} onClick={()=>handleMeatSelect(m)}
              style={{background:sel===m.id?C.light:"#0A1520",border:`2px solid ${sel===m.id?C.primary:C.border}`,borderRadius:8,padding:"10px 12px",cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontWeight:600}}>{m.corte||m.tipo} <span style={{color:C.muted,fontWeight:400,fontSize:13}}>({m.tipo})</span></span>
                <span style={{fontWeight:700,color:C.primary}}>{fmtKg(m.pesoTotal)}</span>
              </div>
              <div style={{fontSize:11,color:C.muted}}>{m.local} · {(m.pacotes||[]).filter(p=>p.status!=="consumido").length||1} pacote{((m.pacotes||[]).filter(p=>p.status!=="consumido").length||1)!==1?"s":""}</div>
            </div>
          ))}
        </div>

        {/* Selecionar pacote (quando há mais de 1 ativo) */}
        {meat&&meatPacotes.length>1&&!isTransfer&&(
          <div style={{marginBottom:14}}>
            <FLabel>De qual pacote retirar?</FLabel>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {/* Opção auto */}
              <div onClick={()=>{setSelPacote(null);setForm(f=>({...f,pesoRetirado:meat.pesoTotal}));}}
                style={{background:!selPacote?C.primary+"18":"#0A1520",
                  border:`2px solid ${!selPacote?C.primary:C.border}`,
                  borderRadius:8,padding:"8px 12px",cursor:"pointer",
                  display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,color:!selPacote?C.primary:C.muted,fontWeight:600}}>🔄 Automático (aberto primeiro)</span>
                <span style={{fontSize:12,color:C.muted}}>{fmtKg(meat.pesoTotal)} total</span>
              </div>
              {/* Cada pacote */}
              {meatPacotes.map((p,i)=>(
                <div key={p.id} onClick={()=>handlePacoteSelect(p.id)}
                  style={{background:selPacote===p.id?C.warning+"18":"#0A1520",
                    border:`2px solid ${selPacote===p.id?C.warning:C.border}`,
                    borderRadius:8,padding:"8px 12px",cursor:"pointer",
                    display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:13,fontWeight:600,color:selPacote===p.id?C.warning:C.text}}>
                    Pacote {i+1}
                    {p.status==="aberto"&&<span style={{color:C.warning,fontSize:11}}> · 🔓 aberto</span>}
                  </span>
                  <span style={{fontWeight:800,color:selPacote===p.id?C.warning:C.primary,fontSize:14}}>{fmtKg(p.pesoAtual)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {meat&&(
          <div style={{background:C.light,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:13,color:C.info}}>
            {selPacote&&selectedPac
              ? <>Pacote selecionado: <strong style={{color:C.warning}}>{fmtKg(selectedPac.pesoAtual)} disponível</strong></>
              : <><strong>{meat.corte||meat.tipo}</strong> — {fmtKg(meat.pesoTotal)} · 📍 {meat.local}</>
            }
          </div>
        )}

        <div style={GRID2}>
          <FInput label="Data" value={form.dataSaida} onChange={set("dataSaida")} type="date"/>
          <FSelect label="Motivo" value={form.motivo} onChange={set("motivo")}>
            {MOTIVOS.map(v=><option key={v} value={v}>{v}</option>)}
          </FSelect>

          {isTransfer ? (
            <FSelect label="Local de destino *" value={form.localDestino} onChange={set("localDestino")}>
              <option value="">— selecione —</option>
              {locaisDestino.map(l=><option key={l} value={l}>{l}</option>)}
            </FSelect>
          ) : (
            <FInput label={`Peso retirado (kg) — máx ${fmtKg(maxPeso)}`}
              value={form.pesoRetirado} onChange={set("pesoRetirado")} onFocus={e=>e.target.select()} type="number" step="0.1" min="0.1" placeholder="Ex: 1.2"/>
          )}

          {!isTransfer&&(
            <FInput label="Evento" value={form.eventoVinculado} onChange={set("eventoVinculado")} placeholder="Ex: Churrasco domingo"/>
          )}
        </div>

        {isTransfer&&meat&&form.localDestino&&(
          <div style={{background:"#0B2035",border:`1px solid ${C.info}44`,borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:13}}>
            🔄 <strong>{meat.corte||meat.tipo}</strong> de <strong style={{color:C.warning}}>{meat.local}</strong> → <strong style={{color:C.success}}>{form.localDestino}</strong>
          </div>
        )}

        <FInput label="Observação" value={form.observacao} onChange={set("observacao")} placeholder="Detalhes..."/>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>
          <Btn onClick={submit} color={isTransfer?C.info:C.danger}>
            {isTransfer?"🔄 Confirmar transferência":"✅ Confirmar saída"}
          </Btn>
          <Btn onClick={()=>setTab("estoque")} color={C.dim}>← Voltar</Btn>
        </div>
      </Card>
    </div>
  );
}

// ─── CHURRASCÔMETRO ───────────────────────────────────────────────────────────
const PERFIL_G    = {pouco:300,normal:400,muito:500};
const DIST_PADRAO = {}; // kept for compatibility, no longer used

function Churrasometro({meats, catalog}) {
  const [adultos,  setAdultos]  = useState(10);
  const [criancas, setCriancas] = useState(4);
  const [perfil,   setPerfil]   = useState("normal");
  const [longo,    setLongo]    = useState(false);
  const [selKeys,  setSelKeys]  = useState([]);
  const [result,   setResult]   = useState(null);

  const toggleKey = key => {
    setSelKeys(p=>p.includes(key)?p.filter(x=>x!==key):[...p,key]);
    setResult(null);
  };

  // Stock disponível para um corte do catálogo
  const stockOf = entry => meats
    .filter(m=>`${m.tipo}:${(m.corte||m.tipo).trim().toLowerCase()}`===entry.key)
    .reduce((s,m)=>s+m.pesoTotal, 0);

  const calcular = () => {
    if(!selKeys.length) return alert("Selecione ao menos um corte.");
    const gAdulto = PERFIL_G[perfil] * (longo?1.2:1);
    const totalKg = (adultos*gAdulto + criancas*gAdulto*0.5)/1000;
    const kgCorte = totalKg / selKeys.length;
    const cortes  = selKeys.map(key=>{
      const entry = catalog.find(c=>c.key===key);
      const disp  = entry ? stockOf(entry) : 0;
      return {key, entry, necessario:kgCorte, disp, falta:Math.max(0,kgCorte-disp)};
    });
    setResult({totalKg, adultos, criancas, gAdulto, cortes});
  };

  const durBtn = (label,val) => (
    <button onClick={()=>setLongo(val)}
      style={{flex:1,padding:"10px 0",borderRadius:8,
        border:`2px solid ${longo===val?C.primary:C.border}`,
        background:longo===val?C.primary+"22":"#0A1520",
        color:longo===val?C.primary:C.muted,cursor:"pointer",fontSize:13,fontWeight:600}}>
      {label}
    </button>
  );

  // Só cortes cadastrados com utilidade "churrasco" no estoque
  const churrascoCortes = (() => {
    const keys = new Set(meats.filter(m=>m.utilidade==="churrasco").map(m=>`${m.tipo}:${(m.corte||m.tipo).trim().toLowerCase()}`));
    return catalog.filter(c=>keys.has(c.key));
  })();

  return (
    <div>
      <SecTitle icon="🔥" children="Churrascômetro"/>

      {/* Inputs */}
      <Card style={{marginBottom:16}}>
        <div style={GRID2}>
          <FInput label="Adultos"  type="number" min={1} value={adultos}  onFocus={e=>e.target.select()} onChange={e=>setAdultos(Math.max(1,+e.target.value))}/>
          <FInput label="Crianças" type="number" min={0} value={criancas} onFocus={e=>e.target.select()} onChange={e=>setCriancas(Math.max(0,+e.target.value))}/>
          <FSelect label="Apetite" value={perfil} onChange={e=>setPerfil(e.target.value)}>
            <option value="pouco">Come pouco — 300g/adulto</option>
            <option value="normal">Normal — 400g/adulto</option>
            <option value="muito">Come muito — 500g/adulto</option>
          </FSelect>
          <FWrap>
            <FLabel>Duração</FLabel>
            <div style={{display:"flex",gap:8}}>
              {durBtn("Normal",false)}
              {durBtn("Longo +20%",true)}
            </div>
          </FWrap>
        </div>
      </Card>

      {/* Seleção de cortes — só os cadastrados como churrasco */}
      <SecTitle icon="🥩"
        children={selKeys.length>0
          ?`Cortes selecionados (${selKeys.length})`
          :"Quais cortes vai servir?"}/>

      {churrascoCortes.length===0 ? (
        <Card style={{marginBottom:16}}>
          <div style={{color:C.muted,textAlign:"center",padding:8}}>
            Nenhum corte cadastrado com utilidade "Churrasco". Vá em Estoque → edite a utilidade dos itens.
          </div>
        </Card>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
          {churrascoCortes.map(entry=>{
            const on     = selKeys.includes(entry.key);
            const accent = TIPO_COLORS[entry.tipo]||C.muted;
            const disp   = stockOf(entry);
            return (
              <div key={entry.key} onClick={()=>toggleKey(entry.key)}
                style={{background:on?accent+"1A":C.card,
                  border:`2px solid ${on?accent:C.border}`,
                  borderRadius:10,padding:"12px 14px",cursor:"pointer",
                  display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:22,height:22,borderRadius:6,flexShrink:0,
                  background:on?accent:"transparent",
                  border:`2px solid ${on?accent:C.dim}`,
                  display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {on&&<span style={{color:"#fff",fontSize:12,fontWeight:900}}>✓</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:15}}>{entry.nome}</div>
                  <div style={{fontSize:11,color:C.muted,textTransform:"capitalize"}}>{entry.tipo}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  {disp>0 ? (
                    <>
                      <div style={{fontWeight:800,color:accent,fontSize:15}}>{fmtKg(disp)}</div>
                      <div style={{fontSize:10,color:C.success}}>em estoque</div>
                    </>
                  ) : (
                    <>
                      <div style={{fontWeight:700,color:C.dim,fontSize:13}}>sem estoque</div>
                      <div style={{fontSize:10,color:C.muted}}>comprar tudo</div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Btn onClick={calcular} disabled={!selKeys.length}>🔥 Calcular churrasco</Btn>

      {/* Results */}
      {result&&(
        <>
          <Card style={{background:"#1A1800",borderColor:"#FF6B3555",marginTop:16,marginBottom:16,textAlign:"center"}}>
            <div style={{fontSize:12,color:C.muted,marginBottom:4}}>Total necessário</div>
            <div style={{fontSize:52,fontWeight:900,color:C.primary,lineHeight:1}}>{fmtKg(result.totalKg)}</div>
            <div style={{fontSize:13,color:C.muted,marginTop:6}}>
              {result.adultos} adultos × {result.gAdulto.toFixed(0)}g
              {result.criancas>0&&` + ${result.criancas} crianças × ${(result.gAdulto*0.5).toFixed(0)}g`}
            </div>
            <div style={{fontSize:12,color:C.dim,marginTop:4}}>
              {fmtKg(result.totalKg/result.cortes.length)} por corte · {result.cortes.length} corte{result.cortes.length!==1?"s":""}
            </div>
          </Card>

          <SecTitle icon="📋" children="Por corte"/>
          {result.cortes.map(c=>{
            const accent = TIPO_COLORS[c.entry?.tipo]||C.muted;
            const pct    = Math.min(100, c.necessario>0?(c.disp/c.necessario)*100:100);
            return (
              <Card key={c.key} style={{marginBottom:8,borderLeft:`4px solid ${accent}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:15}}>{c.entry?.nome}</div>
                    <div style={{fontSize:11,color:C.muted,textTransform:"capitalize"}}>{c.entry?.tipo}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:11,color:C.muted}}>necessário</div>
                    <div style={{fontWeight:800,color:accent}}>{fmtKg(c.necessario)}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:14,fontSize:13,flexWrap:"wrap",marginBottom:8}}>
                  <span>🧊 Tenho: <strong style={{color:c.disp>0?C.success:C.dim}}>{fmtKg(c.disp)}</strong></span>
                  {c.falta>0
                    ?<span>🛒 Comprar: <strong style={{color:C.danger}}>{fmtKg(c.falta)}</strong></span>
                    :<span style={{color:C.success,fontWeight:600}}>✓ Suficiente</span>
                  }
                </div>
                <div style={{background:C.border,borderRadius:4,height:6,overflow:"hidden"}}>
                  <div style={{width:`${pct}%`,height:"100%",background:c.falta>0?C.warning:C.success,transition:"width 0.5s ease"}}/>
                </div>
              </Card>
            );
          })}

          {/* Conclusão */}
          <Card style={{marginTop:8,background:"#0D1B2A",border:`1px solid ${C.border}`}}>
            <div style={{fontWeight:700,marginBottom:12,fontSize:15}}>📊 Conclusão</div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
              <span style={{color:C.muted}}>Total necessário</span>
              <strong style={{color:C.primary}}>{fmtKg(result.totalKg)}</strong>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
              <span style={{color:C.muted}}>🧊 Já tenho em estoque</span>
              <strong style={{color:C.success}}>{fmtKg(result.cortes.reduce((s,c)=>s+Math.min(c.disp,c.necessario),0))}</strong>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0"}}>
              <span style={{color:C.muted}}>🛒 Preciso comprar</span>
              <strong style={{color:result.cortes.some(c=>c.falta>0)?C.warning:C.success}}>
                {fmtKg(result.cortes.reduce((s,c)=>s+c.falta,0))}
              </strong>
            </div>
          </Card>

          {result.cortes.some(c=>c.falta>0)&&(
            <Card style={{background:"#1A1200",borderColor:C.warning+"55",marginTop:8}}>
              <div style={{fontWeight:700,marginBottom:10,fontSize:15}}>🛒 Lista de compras</div>
              {result.cortes.filter(c=>c.falta>0).map(c=>(
                <div key={c.key} style={{display:"flex",justifyContent:"space-between",
                  padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontWeight:600}}>{c.entry?.nome}</span>
                  <strong style={{color:C.warning}}>{fmtKg(c.falta)}</strong>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── RELATÓRIOS ───────────────────────────────────────────────────────────────
function Relatorios({meats,exits}) {
  const active    = meats.filter(m=>m.status!=="consumido"&&m.pesoTotal>0);
  const totalKg   = active.reduce((s,m)=>s+m.pesoTotal,0);
  const totalInv  = meats.reduce((s,m)=>s+(m.precoPago||0),0);
  const totalCons = exits.reduce((s,e)=>s+e.pesoRetirado,0);
  const totalDesc = exits.filter(e=>e.motivo==="descarte").reduce((s,e)=>s+e.pesoRetirado,0);

  const byTipo   = TIPOS.map(t=>({name:t,kg:active.filter(m=>m.tipo===t).reduce((s,m)=>s+m.pesoTotal,0)})).filter(x=>x.kg>0);
  const consTipo = TIPOS.map(t=>({name:t,kg:exits.filter(e=>e.tipo===t).reduce((s,e)=>s+e.pesoRetirado,0)})).filter(x=>x.kg>0);

  const ttStyle  = {background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:12};

  return (
    <div>
      <SecTitle icon="📊" children="Relatórios"/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:20}}>
        <StatCard icon="🧊" label="Estoque atual"    value={fmtKg(totalKg)}    color={C.primary}/>
        <StatCard icon="✅" label="Total consumido"  value={fmtKg(totalCons)}  color={C.success}/>
        <StatCard icon="💰" label="Total investido"  value={fmtR(totalInv)||"R$ 0,00"} color={C.info}/>
        <StatCard icon="🗑️" label="Total descartado" value={fmtKg(totalDesc)}  color={totalDesc>0?C.danger:C.muted}/>
      </div>

      {byTipo.length>0&&(
        <Card style={{marginBottom:14}}>
          <div style={{fontWeight:700,marginBottom:12}}>📦 Estoque por tipo (kg)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={byTipo} margin={{top:4,right:8,left:-20,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="name" tick={{fill:C.muted,fontSize:11}}/>
              <YAxis tick={{fill:C.muted,fontSize:11}}/>
              <Tooltip contentStyle={ttStyle} formatter={v=>[`${v.toFixed(2)} kg`,"Peso"]}/>
              <Bar dataKey="kg" radius={[4,4,0,0]}>
                {byTipo.map(e=><Cell key={e.name} fill={TIPO_COLORS[e.name]||C.muted}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {consTipo.length>0&&(
        <Card style={{marginBottom:14}}>
          <div style={{fontWeight:700,marginBottom:12}}>🍽️ Consumo por tipo (kg)</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={consTipo} margin={{top:4,right:8,left:-20,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="name" tick={{fill:C.muted,fontSize:11}}/>
              <YAxis tick={{fill:C.muted,fontSize:11}}/>
              <Tooltip contentStyle={ttStyle} formatter={v=>[`${v.toFixed(2)} kg`,"Consumido"]}/>
              <Bar dataKey="kg" fill={C.success} radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Histórico de transferências */}
      {(()=>{
        const transfers = [...exits].filter(e=>e.motivo==="transferência").reverse();
        return (
          <Card style={{marginBottom:14}}>
            <div style={{fontWeight:700,marginBottom:10}}>🔄 Histórico de transferências ({transfers.length})</div>
            {transfers.length===0
              ?<div style={{color:C.muted,textAlign:"center"}}>Nenhuma transferência registrada.</div>
              :transfers.map(e=>(
                <div key={e.id} style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.border}`,flexWrap:"wrap",gap:4}}>
                  <div>
                    <span style={{fontWeight:700}}>{e.corte||e.carneNome}</span>
                    {e.tipo&&<span style={{fontSize:11,color:C.muted,background:C.light,
                      padding:"1px 6px",borderRadius:4,marginLeft:6}}>{e.tipo}</span>}
                    <span style={{fontSize:12,color:C.muted}}> · {fmtDate(e.dataSaida)}</span>
                    {e.observacao&&<span style={{fontSize:12,color:C.info}}> · {e.observacao}</span>}
                    {e.feitorPor&&(
                      <span style={{fontSize:11,
                        background:`hsl(${USERS.indexOf(e.feitorPor)*90},60%,20%)`,
                        color:`hsl(${USERS.indexOf(e.feitorPor)*90},70%,65%)`,
                        padding:"1px 7px",borderRadius:10,marginLeft:6,fontWeight:600}}>
                        {e.feitorPor}
                      </span>
                    )}
                  </div>
                  <span style={{fontSize:11,color:C.muted}}>{fmtKg(e.pesoRetirado)}</span>
                </div>
              ))
            }
          </Card>
        );
      })()}

      {/* Histórico de Entradas */}
      <Card style={{marginBottom:14}}>
        <div style={{fontWeight:700,marginBottom:10}}>📥 Histórico de entradas ({meats.length})</div>
        {meats.length===0
          ?<div style={{color:C.muted,textAlign:"center"}}>Nenhuma entrada registrada.</div>
          :[...meats].sort((a,b)=>new Date(b.dataEntrada)-new Date(a.dataEntrada)).map(m=>(
            <div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"7px 0",borderBottom:`1px solid ${C.border}`,flexWrap:"wrap",gap:4}}>
              <div>
                <span style={{fontWeight:600}}>{m.corte||m.tipo}</span>
                <span style={{fontSize:11,color:C.muted,background:C.light,
                  padding:"1px 6px",borderRadius:4,marginLeft:6}}>{m.tipo}</span>
                <span style={{fontSize:12,color:C.muted}}> · {fmtDate(m.dataEntrada)} · {m.local}</span>
                {m.precoPago&&<span style={{fontSize:12,color:C.muted}}> · {fmtR(m.precoPago)}</span>}
                {m.feitorPor&&(
                  <span style={{fontSize:11,
                    background:`hsl(${USERS.indexOf(m.feitorPor)*90},60%,20%)`,
                    color:`hsl(${USERS.indexOf(m.feitorPor)*90},70%,65%)`,
                    padding:"1px 7px",borderRadius:10,marginLeft:6,fontWeight:600}}>
                    {m.feitorPor}
                  </span>
                )}
              </div>
              <strong style={{color:C.success}}>+{fmtKg(m.pesoInicial||m.pesoTotal)}</strong>
            </div>
          ))
        }
      </Card>

      {/* Histórico de saídas — com filtro por freezer */}
      {(()=>{
        const saidas = exits.filter(e=>e.motivo!=="transferência");
        const locaisComSaida = [...new Set(saidas.map(e=>e.local).filter(Boolean))];
        return (
          <Card>
            <div style={{fontWeight:700,marginBottom:10}}>
              📋 Histórico de saídas ({saidas.length})
            </div>
            {saidas.length===0
              ? <div style={{color:C.muted,textAlign:"center"}}>Nenhuma saída registrada.</div>
              : (
                <>
                  {/* Saídas por freezer */}
                  {locaisComSaida.length>1&&locaisComSaida.map(local=>{
                    const items = [...saidas].filter(e=>e.local===local).reverse();
                    if(!items.length) return null;
                    const totalLocal = items.reduce((s,e)=>s+e.pesoRetirado,0);
                    return (
                      <div key={local} style={{marginBottom:16}}>
                        <div style={{fontSize:12,fontWeight:700,color:C.info,
                          background:C.light,borderRadius:8,padding:"6px 12px",
                          marginBottom:8,display:"flex",justifyContent:"space-between"}}>
                          <span>📍 {local}</span>
                          <span style={{color:C.danger}}>−{fmtKg(totalLocal)}</span>
                        </div>
                        {items.map(e=>(
                          <div key={e.id} style={{display:"flex",justifyContent:"space-between",
                            alignItems:"center",padding:"6px 8px",
                            borderBottom:`1px solid ${C.border}`,flexWrap:"wrap",gap:4}}>
                            <div>
                              <span style={{fontWeight:700}}>{e.corte||e.carneNome||e.tipo}</span>
                              <span style={{fontSize:12,color:C.muted}}> · {fmtDate(e.dataSaida)} · </span>
                              <span style={{fontSize:12,fontWeight:600,color:
                                e.motivo==="churrasco"?C.primary:
                                e.motivo==="descarte"?C.danger:C.success}}>
                                {e.motivo}
                              </span>
                            </div>
                            <strong style={{color:C.danger}}>−{fmtKg(e.pesoRetirado)}</strong>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {/* Saídas sem local ou lista geral (se só 1 local) */}
                  {locaisComSaida.length<=1&&[...saidas].reverse().map(e=>(
                    <div key={e.id} style={{display:"flex",justifyContent:"space-between",
                      alignItems:"center",padding:"8px 0",
                      borderBottom:`1px solid ${C.border}`,flexWrap:"wrap",gap:4}}>
                      <div>
                        <span style={{fontWeight:700}}>{e.corte||e.carneNome||e.tipo}</span>
                        {e.tipo&&<span style={{fontSize:11,color:C.muted,background:C.light,
                          padding:"1px 6px",borderRadius:4,marginLeft:6}}>{e.tipo}</span>}
                        <span style={{fontSize:12,color:C.muted}}> · {fmtDate(e.dataSaida)} · </span>
                        <span style={{fontSize:12,fontWeight:600,color:
                          e.motivo==="churrasco"?C.primary:
                          e.motivo==="descarte"?C.danger:C.success}}>
                          {e.motivo}
                        </span>
                        {e.feitorPor&&(
                          <span style={{fontSize:11,background:`hsl(${USERS.indexOf(e.feitorPor)*90},60%,20%)`,
                            color:`hsl(${USERS.indexOf(e.feitorPor)*90},70%,65%)`,
                            padding:"1px 7px",borderRadius:10,marginLeft:6,fontWeight:600}}>
                            {e.feitorPor}
                          </span>
                        )}
                      </div>
                      <strong style={{color:C.danger}}>−{fmtKg(e.pesoRetirado)}</strong>
                    </div>
                  ))}
                </>
              )
            }
          </Card>
        );
      })()}
    </div>
  );
}

// ─── ROOT ──────────────────────────────────────────────────────────────────────
const STORAGE_KEY  = "mfi3_data";
const FIREBASE_REST = `https://meu-freezer-inteligente-default-rtdb.firebaseio.com/${DB_PATH}.json`;

// ─── AJUSTES ──────────────────────────────────────────────────────────────────
// ─── AJUSTES ──────────────────────────────────────────────────────────────────
function Configuracoes({config,catalog,meats,onUpdateConfig,onUpdateCatalog,onUpdateMeats,onRenameMeatField,onClearHistory}) {
  const [editingSection,setEditingSection] = useState(null);
  const [newItem,       setNewItem]        = useState("");
  const [editIdx,       setEditIdx]        = useState(null);
  const [editVal,       setEditVal]        = useState("");
  const [newCorte,      setNewCorte]       = useState("");

  const sections = [
    {key:"tipos",      title:"Tipos de carne",          icon:"🥩", color:C.primary,  field:"tipo"},
    {key:"locais",     title:"Locais de armazenamento",  icon:"📍", color:C.info,     field:"local"},
    {key:"origens",    title:"Origens",                  icon:"🌿", color:C.success,  field:"origem"},
    {key:"utilidades", title:"Utilidades",               icon:"🎯", color:C.warning,  field:"utilidade"},
  ];

  const openSection = (key) => {
    setEditingSection(s=>s===key?null:key);
    setEditIdx(null); setEditVal(""); setNewItem("");
  };

  const addItem = (key) => {
    const val = newItem.trim();
    if(!val) return;
    if((config[key]||[]).some(v=>v.toLowerCase()===val.toLowerCase())) return alert("Já existe.");
    onUpdateConfig({...config,[key]:[...(config[key]||[]),val]});
    setNewItem("");
  };

  const deleteItem = (key,idx) => {
    onUpdateConfig({...config,[key]:(config[key]||[]).filter((_,i)=>i!==idx)});
  };

  const clearSection = (key) => {
    if(!window.confirm(`Limpar todos os itens de "${key}"?`)) return;
    onUpdateConfig({...config,[key]:[]});
  };

  const addCorte = () => {
    const nome = newCorte.trim();
    if(!nome) return;
    const key = nome.toLowerCase();
    if(catalog.some(c=>c.key===key)) return alert("Corte já existe.");
    onUpdateCatalog([...catalog, {id:uid(), nome, tipo:"", key}]);
    setNewCorte("");
  };

  // Salva edição de seção — propaga renomeação para todos os itens
  const saveEdit = (key,field) => {
    const val = editVal.trim();
    if(!val) return;
    const oldVal = (config[key]||[])[editIdx];
    if(oldVal===undefined||oldVal===null) return;

    // 1. Atualiza config
    const updated = [...(config[key]||[])];
    updated[editIdx] = val;
    onUpdateConfig({...config,[key]:updated});

    // 2. Propaga para estoque — usa meats prop diretamente (sem functional update)
    if(field && oldVal !== val && meats?.length) {
      const renamed = meats.map(m => m[field]===oldVal ? {...m,[field]:val} : m);
      onUpdateMeats(renamed);
    }

    setEditIdx(null); setEditVal("");
  };

  // Salva edição de corte do catálogo
  const saveCorteEdit = (idx) => {
    const val = editVal.trim();
    if(!val) return;
    const oldNome = catalog[idx]?.nome;
    if(!oldNome) return;
    const updatedCatalog = catalog.map((c,i)=>
      i===idx ? {...c, nome:val, key:`${c.tipo}:${val.toLowerCase()}`} : c
    );
    onUpdateCatalog(updatedCatalog);
    // Propaga para estoque
    if(meats?.length) {
      const renamed = meats.map(m => m.corte===oldNome ? {...m,corte:val} : m);
      onUpdateMeats(renamed);
    }
    setEditIdx(null); setEditVal("");
  };

  const ItemRow = ({label,sub,idx,onSave,onDelete}) => (
    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
      {editIdx===idx ? (
        <>
          <input style={{...inputBase,flex:1,padding:"8px 10px",fontSize:13}}
            value={editVal} autoFocus
            onChange={e=>setEditVal(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&onSave()}/>
          <button onClick={onSave}
            style={{background:C.success+"22",border:`1px solid ${C.success}55`,borderRadius:8,
              padding:"8px 12px",cursor:"pointer",color:C.success,fontSize:13,fontWeight:700}}>✅</button>
          <button onClick={()=>{setEditIdx(null);setEditVal("");}}
            style={{background:C.light,border:`1px solid ${C.border}`,borderRadius:8,
              padding:"8px 10px",cursor:"pointer",color:C.muted,fontSize:12}}>✕</button>
        </>
      ) : (
        <>
          <div style={{flex:1,padding:"9px 12px",background:C.light,borderRadius:8,
            fontSize:13,fontWeight:600,color:C.text,textTransform:"capitalize"}}>
            {label}
            {sub&&<span style={{fontSize:11,color:C.muted,marginLeft:8,fontWeight:400}}>{sub}</span>}
          </div>
          <button onClick={()=>{setEditIdx(idx);setEditVal(label);}}
            style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,
              padding:"8px 10px",cursor:"pointer",color:C.muted,fontSize:12}}>✏️</button>
          <button onClick={onDelete}
            style={{background:"none",border:`1px solid ${C.danger}55`,borderRadius:8,
              padding:"8px 10px",cursor:"pointer",color:C.danger,fontSize:12}}>🗑️</button>
        </>
      )}
    </div>
  );

  return (
    <div>
      <SecTitle icon="⚙️" children="Ajustes"/>
      <div style={{fontSize:12,color:C.muted,marginBottom:14,textAlign:"center",padding:"0 8px"}}>
        ✅ Renomear qualquer item atualiza automaticamente todos os itens do estoque.
      </div>

      {sections.map(s=>(
        <Card key={s.key} style={{marginBottom:10}}>
          <button onClick={()=>openSection(s.key)}
            style={{width:"100%",background:"none",border:"none",cursor:"pointer",
              display:"flex",justifyContent:"space-between",alignItems:"center",padding:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:18}}>{s.icon}</span>
              <span style={{fontWeight:700,fontSize:14,color:C.text}}>{s.title}</span>
              <span style={{fontSize:11,color:C.muted,background:C.light,borderRadius:10,padding:"1px 8px"}}>
                {(config[s.key]||[]).length}
              </span>
            </div>
            <span style={{color:C.muted}}>{editingSection===s.key?"▲":"▼"}</span>
          </button>

          {editingSection===s.key&&(
            <div style={{marginTop:12}}>
              {(config[s.key]||[]).map((item,i)=>(
                <ItemRow key={i} label={item} idx={i}
                  onSave={()=>saveEdit(s.key,s.field)}
                  onDelete={()=>deleteItem(s.key,i)}/>
              ))}
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <input style={{...inputBase,flex:1,padding:"9px 12px",fontSize:13}}
                  placeholder="Novo item..."
                  value={newItem} onChange={e=>setNewItem(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&addItem(s.key)}/>
                <button onClick={()=>addItem(s.key)}
                  style={{background:s.color+"22",border:`1px solid ${s.color}55`,borderRadius:8,
                    padding:"9px 14px",cursor:"pointer",color:s.color,fontSize:13,fontWeight:700}}>
                  +
                </button>
              </div>
            </div>
          )}
        </Card>
      ))}

      {/* Cortes */}
      <Card style={{marginBottom:12}}>
        <button onClick={()=>openSection("cortes")}
          style={{width:"100%",background:"none",border:"none",cursor:"pointer",
            display:"flex",justifyContent:"space-between",alignItems:"center",padding:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:18}}>🔪</span>
            <span style={{fontWeight:700,fontSize:14,color:C.text}}>Cortes do catálogo</span>
            <span style={{fontSize:11,color:C.muted,background:C.light,borderRadius:10,padding:"1px 8px"}}>
              {catalog.length}
            </span>
          </div>
          <span style={{color:C.muted}}>{editingSection==="cortes"?"▲":"▼"}</span>
        </button>
        {editingSection==="cortes"&&(
          <div style={{marginTop:12}}>
            {catalog.length===0&&(
              <div style={{color:C.muted,textAlign:"center",padding:8}}>Nenhum corte cadastrado ainda.</div>
            )}
            {catalog.map((c,i)=>(
              <ItemRow key={c.key||i} label={c.nome} sub={c.tipo} idx={i}
                onSave={()=>saveCorteEdit(i)}
                onDelete={()=>onUpdateCatalog(catalog.filter((_,j)=>j!==i))}/>
            ))}
            {/* Adicionar novo corte — independente de tipo */}
            <div style={{display:"flex",gap:8,marginTop:10}}>
              <input style={{...inputBase,flex:1,padding:"9px 12px",fontSize:13}}
                placeholder="Nome do corte..."
                value={newCorte} onChange={e=>setNewCorte(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&addCorte()}/>
              <button onClick={addCorte}
                style={{background:C.primary+"22",border:`1px solid ${C.primary}55`,borderRadius:8,
                  padding:"9px 14px",cursor:"pointer",color:C.primary,fontSize:13,fontWeight:700}}>+</button>
            </div>
          </div>
        )}
      </Card>

      {/* Zona de perigo */}
      <Card style={{border:`1px solid ${C.danger}55`,marginBottom:12}}>
        <div style={{fontWeight:700,fontSize:14,color:C.danger,marginBottom:10}}>⚠️ Zona de perigo</div>
        <button onClick={()=>{
          if(window.confirm("Tem certeza que quer apagar TODO o histórico?\n\nIsso remove saídas, transferências e entradas dos relatórios.\n\nO estoque atual NÃO será afetado."))
            onClearHistory();
        }} style={{width:"100%",background:C.danger+"18",border:`1px solid ${C.danger}55`,
          borderRadius:10,padding:"12px",cursor:"pointer",color:C.danger,
          fontSize:14,fontWeight:700}}>
          🗑️ Limpar todos os históricos
        </button>
        <div style={{fontSize:11,color:C.muted,marginTop:6,textAlign:"center"}}>
          Remove saídas e transferências dos relatórios. O estoque atual fica intacto.
        </div>
      </Card>
    </div>
  );
}

export default function App() {
  const [meats,        setMeats]        = useState([]);
  const [exits,        setExits]        = useState([]);
  const [catalog,      setCatalog]      = useState([]);
  const [shoppingList, setShoppingList] = useState([]);
  const [appConfig,   setAppConfig]   = useState({
    tipos:      [...TIPOS],
    locais:     [...LOCAIS],
    origens:    [...ORIGENS],
    utilidades: ["churrasco","consumo"],
  });
  const [tab,         setTab]         = useState("dashboard");
  const [loaded,      setLoaded]      = useState(false);
  const [saveStatus,  setSaveStatus]  = useState("idle");
  const [storageOk,   setStorageOk]   = useState(null);
  const [showBackup,  setShowBackup]  = useState(false);
  const [importTxt,   setImportTxt]   = useState("");
  const [importMsg,   setImportMsg]   = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [changingUser,setChangingUser]= useState(false);

  const lastSaved = useRef("");

  // ── LOAD: localStorage primeiro (instantâneo), Firebase depois (sync) ─────
  useEffect(()=>{
    try {
      const savedUser = localStorage.getItem("mfi3_user");
      if(savedUser && USERS.includes(savedUser)) setCurrentUser(savedUser);

      // Carrega localStorage imediatamente
      const local = localStorage.getItem("mfi_local_data");
      if(local) {
        const d = JSON.parse(local);
        if(d.meats?.length||d.exits?.length||d.catalog?.length) {
          setMeats(d.meats         || []);
          setExits(d.exits         || []);
          setCatalog(d.catalog     || []);
          setShoppingList(d.shoppingList || []);
          if(d.appConfig) setAppConfig(d.appConfig);
          lastSaved.current = local;
        }
      }
    } catch(e){}
    setLoaded(true);
    setStorageOk(true);

    // Firebase: sincroniza em background (se disponível)
    try {
      const unsubscribe = onValue(dbRef(db, DB_PATH), (snapshot)=>{
        const data = snapshot.val();
        if(data) {
          const hash = JSON.stringify(data);
          const localRaw = localStorage.getItem("mfi_local_data");
          if(!localRaw || hash !== lastSaved.current) {
            lastSaved.current = hash;
            setMeats(data.meats         || []);
            setExits(data.exits         || []);
            setCatalog(data.catalog     || []);
            setShoppingList(data.shoppingList || []);
            if(data.appConfig) setAppConfig(data.appConfig);
          }
        }
      }, ()=>{});
      return ()=>unsubscribe();
    } catch(e){}
  },[]);

  // ── SAVE: localStorage (sempre) + Firebase (quando disponível) ────────────
  useEffect(()=>{
    if(!loaded) return;
    const currentHash = JSON.stringify({meats, exits, catalog, appConfig, shoppingList});
    if(currentHash === lastSaved.current) return;

    lastSaved.current = currentHash;
    setSaveStatus("saving");

    try {
      localStorage.setItem("mfi_local_data", currentHash);
      setSaveStatus("saved");
    } catch(e){}

    const t = setTimeout(async ()=>{
      const ctrl    = new AbortController();
      const timeout = setTimeout(()=>ctrl.abort(), 8000);
      try {
        const res = await fetch(FIREBASE_REST, {
          method:"PUT",
          headers:{"Content-Type":"application/json"},
          body: currentHash,
          signal: ctrl.signal,
        });
        clearTimeout(timeout);
        if(!res.ok) console.warn("Firebase sync error:", res.status);
      } catch(e){
        clearTimeout(timeout);
        console.warn("Firebase offline, usando localStorage:", e.message);
      }
    }, 1000);
    return ()=>clearTimeout(t);
  },[meats, exits, catalog, appConfig, shoppingList, loaded]);

  // ── EXPORT / IMPORT ───────────────────────────────────────────────────────
  const exportData = () => {
    const json = JSON.stringify({meats,exits,catalog}, null, 2);
    setImportTxt(json);
    setImportMsg("");
    setShowBackup(true);
  };

  const importData = () => {
    try {
      const d = JSON.parse(importTxt);
      if(!Array.isArray(d.meats)) throw new Error("Formato inválido");
      setMeats(d.meats || []);
      setExits(d.exits || []);
      setCatalog(d.catalog || []);
      setImportMsg("✅ Dados restaurados com sucesso!");
      setShowBackup(false);
    } catch(e) {
      setImportMsg("❌ JSON inválido. Verifique o conteúdo e tente novamente.");
    }
  };

  // Active stock (not consumed, has weight)
  const active = meats.filter(m=>m.status!=="consumido"&&m.pesoTotal>0);

  // Alerts (sorted by severity)
  const alerts = active
    .map(m=>({...m,_alert:getAlert(m)}))
    .filter(m=>m._alert!=="ok")
    .sort((a,b)=>({expired:0,expiring:1,openUrgent:2,old:3}[a._alert]-{expired:0,expiring:1,openUrgent:2,old:3}[b._alert]));

  const selectUser = (name) => {
    setCurrentUser(name);
    setChangingUser(false);
    localStorage.setItem("mfi3_user", name);
  };

  const addMeat = (meat) => {
    // ── Calcula pesos dos pacotes de forma explícita e limpa
    const pesos = (meat.pacotesPesos?.length > 0)
      ? meat.pacotesPesos.map(p => Math.round(parseFloat(p) * 1000) / 1000)
      : [Math.round(parseFloat(meat.pesoTotal) * 1000) / 1000];

    const validPesos = pesos.filter(p => p > 0);
    if(validPesos.length === 0) { alert("Peso inválido."); return; }

    const pacotes = validPesos.map(peso => ({
      id: uid(), peso, pesoAtual: peso, status: "disponível"
    }));

    const pesoTotal = Math.round(validPesos.reduce((s,p)=>s+p, 0) * 1000) / 1000;
    const precoPago = parseFloat(meat.precoPago) > 0 ? parseFloat(meat.precoPago) : null;
    const precoKg   = precoPago && pesoTotal > 0
      ? Math.round((precoPago / pesoTotal) * 100) / 100
      : parseFloat(meat.precoKg) > 0 ? parseFloat(meat.precoKg) : null;

    // ── Objeto limpo — sem spread que pode contaminar
    const newMeat = {
      id:              uid(),
      tipo:            meat.tipo             || "bovina",
      corte:           meat.corte            || "",
      origem:          meat.origem           || "",
      utilidade:       meat.utilidade        || "",
      dataEntrada:     meat.dataEntrada      || TODAY,
      local:           meat.local            || "Freezer 1",
      observacao:      meat.observacao       || "",
      status:          "disponível",
      feitorPor:       currentUser           || "",
      pesoTotal,
      pesoInicial:     pesoTotal,
      quantidadePecas: pacotes.length,
      pacotes,
      precoPago,
      precoKg,
    };

    setMeats(p => [...p, newMeat]);
    // Cortes só são adicionados pelo menu Ajustes — não aqui
  };

  const addToExisting = (id, pesoAdd, qtdAdd, precoAdd, pacotesPesos) => {
    const pesos = (pacotesPesos?.length > 0)
      ? pacotesPesos.map(p => Math.round(parseFloat(p) * 1000) / 1000).filter(p=>p>0)
      : Array(Math.max(1, qtdAdd||1)).fill(
          Math.round((parseFloat(pesoAdd) / Math.max(1, qtdAdd||1)) * 1000) / 1000
        );

    const newPacotes = pesos.map(peso => ({id:uid(), peso, pesoAtual:peso, status:"disponível"}));
    const totalAdd   = Math.round(pesos.reduce((s,p)=>s+p, 0) * 1000) / 1000;

    setMeats(p=>p.map(m=>{
      if(m.id !== id) return m;
      const existingPacotes = m.pacotes || [{id:m.id+"_0", peso:m.pesoTotal, pesoAtual:m.pesoTotal, status:m.status}];
      const allPacotes = [...existingPacotes, ...newPacotes];
      const novoTotal  = Math.round(allPacotes.filter(p=>p.status!=="consumido").reduce((s,p)=>s+p.pesoAtual,0) * 1000) / 1000;
      return {
        ...m,
        pacotes:        allPacotes,
        pesoTotal:      novoTotal,
        pesoInicial:    Math.round(((m.pesoInicial||m.pesoTotal) + totalAdd) * 1000) / 1000,
        quantidadePecas:(m.quantidadePecas||1) + pesos.length,
        precoPago:      precoAdd ? Math.round(((m.precoPago||0) + parseFloat(precoAdd)) * 100) / 100 : m.precoPago,
        status:         m.status === "consumido" ? "disponível" : m.status,
      };
    }));
  };
  const transferMeat = (id, novoLocal) => setMeats(p=>p.map(m=>m.id===id?{...m,local:novoLocal,feitorPor:currentUser}:m));
  const updateMeat   = (id, fields)   => setMeats(p=>p.map(m=>m.id===id?{...m,...fields}:m));
  const deleteMeat   = (id)           => setMeats(p=>p.filter(m=>m.id!==id));

  // ── LISTA DE COMPRAS ────────────────────────────────────────────────────────
  const addToShoppingList = (nome, tipo) => {
    setShoppingList(prev=>{
      if(prev.some(i=>i.nome.toLowerCase()===nome.toLowerCase())) return prev;
      return [...prev, {id:uid(), nome, tipo, addedBy:currentUser, addedAt:TODAY}];
    });
  };
  const removeFromShoppingList = (id) => setShoppingList(p=>p.filter(i=>i.id!==id));

  // ── CHURRASCO ──────────────────────────────────────────────────────────────
  const togglePacoteChurrasco = (meatId, pacoteId) => {
    setMeats(prev=>prev.map(m=>{
      if(m.id!==meatId) return m;
      const pacs = (m.pacotes||[]).map(p=>p.id===pacoteId?{...p,churrasco:!p.churrasco}:p);
      return {...m, pacotes:pacs};
    }));
  };

  const cancelChurrasco = () => {
    setMeats(prev=>prev.map(m=>({
      ...m,
      pacotes:(m.pacotes||[]).map(p=>({...p,churrasco:false}))
    })));
  };

  const confirmChurrasco = () => {
    const churrascoMeats = meats.filter(m=>(m.pacotes||[]).some(p=>p.churrasco&&p.status!=="consumido"));
    const newMeats = meats.map(m=>{
      if(!(m.pacotes||[]).some(p=>p.churrasco&&p.status!=="consumido")) return m;
      const updatedPacs = (m.pacotes||[]).map(p=>{
        if(!p.churrasco||p.status==="consumido") return {...p,churrasco:false};
        return {...p,pesoAtual:0,status:"consumido",churrasco:false};
      });
      const novoTotal = Math.round(updatedPacs.filter(p=>p.status!=="consumido").reduce((s,p)=>s+p.pesoAtual,0)*1000)/1000;
      return {...m,pacotes:updatedPacs,pesoTotal:novoTotal,status:novoTotal<=0?"consumido":"aberto"};
    });
    setMeats(newMeats);
    churrascoMeats.forEach(m=>{
      const cPacs=(m.pacotes||[]).filter(p=>p.churrasco&&p.status!=="consumido");
      const totalRet=Math.round(cPacs.reduce((s,p)=>s+p.pesoAtual,0)*1000)/1000;
      setExits(prev=>[...prev,{
        id:uid(), tipo:m.tipo, corte:m.corte, local:m.local,
        carneNome:m.corte||m.tipo, pesoRetirado:totalRet,
        dataSaida:TODAY, motivo:"churrasco", feitorPor:currentUser
      }]);
    });
    // Detecta itens que ficaram sem estoque e oferece lista de compras
    const esgotados = newMeats.filter(m=>
      churrascoMeats.some(c=>c.id===m.id) && m.pesoTotal<=0
    );
    if(esgotados.length>0){
      const nomes = esgotados.map(m=>m.corte||m.tipo).join(", ");
      if(window.confirm(`Acabou o estoque de: ${nomes}.\n\nAdicionar à lista de compras?`)){
        esgotados.forEach(m=>addToShoppingList(m.corte||m.tipo, m.tipo));
      }
    }
  };

  // Pacotes marcados para churrasco
  const pacotesChurrasco = meats.flatMap(m=>
    (m.pacotes||[]).filter(p=>p.churrasco&&p.status!=="consumido")
      .map(p=>({...p,meatId:m.id,corte:m.corte||m.tipo,tipo:m.tipo,local:m.local}))
  );
  const totalChurrascoKg = Math.round(pacotesChurrasco.reduce((s,p)=>s+p.pesoAtual,0)*1000)/1000;

  // Renomeia campo em TODOS os itens do estoque de uma vez (Ajustes)
  const renameMeatField = (field, oldVal, newVal) => {
    if(!field||!oldVal||oldVal===newVal) return;
    setMeats(prev => {
      const updated = prev.map(m => m[field]===oldVal ? {...m,[field]:newVal} : m);
      return updated;
    });
  };

  // Mescla dois itens em um — absorve os pacotes do item2 no item1
  const mergeItems = (id1, id2) => {
    const m1 = meats.find(m=>m.id===id1);
    const m2 = meats.find(m=>m.id===id2);
    if(!m1||!m2) return;
    const pacs1 = m1.pacotes||[makePacote(m1.pesoTotal)];
    const pacs2 = m2.pacotes||[makePacote(m2.pesoTotal)];
    const merged = [...pacs1, ...pacs2];
    const novoTotal = merged.filter(p=>p.status!=="consumido").reduce((s,p)=>s+p.pesoAtual,0);
    setMeats(p=>p
      .map(m=>m.id===id1?{
        ...m,
        pacotes: merged,
        pesoTotal: parseFloat(novoTotal.toFixed(3)),
        pesoInicial: parseFloat(((m.pesoInicial||m.pesoTotal)+(m2.pesoInicial||m2.pesoTotal)).toFixed(3)),
        quantidadePecas: (m1.quantidadePecas||1)+(m2.quantidadePecas||1),
        precoPago: (m1.precoPago||0)+(m2.precoPago||0)||null,
      }:m)
      .filter(m=>m.id!==id2) // remove o item2
    );
  };
  const registerExit= (ex)  => {
    const m = meats.find(x=>x.id===ex.carneId);
    if(!m) return;
    if(ex.motivo==="transferência") {
      setMeats(p=>p.map(x=>x.id===ex.carneId?{...x,local:ex.localDestino}:x));
      setExits(p=>[...p,{...ex,id:uid(),carneNome:m.corte||m.tipo,tipo:m.tipo,
        pesoRetirado:m.pesoTotal, feitorPor:currentUser,
        observacao:`${m.local} → ${ex.localDestino}${ex.observacao?` · ${ex.observacao}`:""}`}]);
    } else {
      const pacotesAtuais = m.pacotes||[{id:m.id+"_0",peso:m.pesoTotal,pesoAtual:m.pesoTotal,status:m.status}];
      const pacotesNovos  = applyExitToPacotes(pacotesAtuais, parseFloat(ex.pesoRetirado), ex.pacoteId);
      const novoTotal     = Math.round(
        pacotesNovos.filter(p=>p.status!=="consumido").reduce((s,p)=>s+p.pesoAtual,0) * 1000
      ) / 1000;
      const novoStatus    = getStatusFromPacotes(pacotesNovos);
      const qtdAtiva      = pacotesNovos.filter(p=>p.status!=="consumido").length;
      const novoPreco     = m.precoKg && novoTotal>0
        ? Math.round(novoTotal * m.precoKg * 100) / 100
        : m.precoPago && m.pesoTotal>0
          ? Math.round((novoTotal / m.pesoTotal) * m.precoPago * 100) / 100
          : null;
      setMeats(p=>p.map(x=>x.id===ex.carneId?{
        ...x, pacotes:pacotesNovos, pesoTotal:novoTotal,
        quantidadePecas:qtdAtiva, status:novoStatus,
        precoPago:novoTotal===0?0:novoPreco,
      }:x));
      setExits(p=>[...p,{...ex,id:uid(),carneNome:m.corte||m.tipo,tipo:m.tipo,feitorPor:currentUser}]);
    }
  };

  const TABS = [
    {id:"dashboard", e:"🏠", l:"Painel"},
    {id:"estoque",   e:"📦", l:"Estoque"},
    {id:"entrada",   e:"➕", l:"Entrada"},
    {id:"churras",   e:"🔥", l:"Churrascômetro"},
    {id:"relatorios",e:"📊", l:"Relatórios"},
    {id:"config",    e:"⚙️", l:"Ajustes"},
  ];

  if(!loaded) return (
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
      <span style={{fontSize:36}}>🧊</span>
      <div style={{color:C.muted,fontSize:14}}>Restaurando dados...</div>
    </div>
  );

  // ── Tela de seleção de usuário ────────────────────────────────────────────
  if(!currentUser || changingUser) return (
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{width:"100%",maxWidth:360}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <span style={{fontSize:48}}>🧊</span>
          <div style={{fontSize:22,fontWeight:900,color:C.primary,marginTop:8}}>Meu Freezer Inteligente</div>
          <div style={{fontSize:15,color:C.muted,marginTop:8}}>
            {changingUser ? "Trocar usuário" : "Quem é você?"}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {USERS.map(u=>(
            <button key={u} onClick={()=>selectUser(u)}
              style={{background:currentUser===u&&changingUser?C.primary+"22":C.card,
                border:`2px solid ${currentUser===u&&changingUser?C.primary:C.border}`,
                borderRadius:14,padding:"18px 20px",cursor:"pointer",
                color:C.text,fontSize:18,fontWeight:700,textAlign:"left",
                display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:42,height:42,borderRadius:"50%",
                background:`hsl(${USERS.indexOf(u)*90},60%,45%)`,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:18,fontWeight:900,color:"#fff",flexShrink:0}}>
                {u[0]}
              </div>
              {u}
              {currentUser===u&&changingUser&&<span style={{marginLeft:"auto",color:C.primary}}>✓</span>}
            </button>
          ))}
        </div>
        {changingUser&&(
          <button onClick={()=>setChangingUser(false)}
            style={{width:"100%",marginTop:16,background:"none",border:"none",
              color:C.muted,cursor:"pointer",fontSize:14,padding:8}}>
            ← Cancelar
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'Inter', system-ui, sans-serif"}}>
      <style>{`
        *{box-sizing:border-box;}
        input,select{color-scheme:dark;}
        input:focus,select:focus{border-color:#FF6B35!important;box-shadow:0 0 0 3px #FF6B3522;}
        ::-webkit-scrollbar{width:5px;}
        ::-webkit-scrollbar-track{background:#0D1B2A;}
        ::-webkit-scrollbar-thumb{background:#1E3A50;border-radius:3px;}
        button{transition:opacity 0.15s;}
        button:hover:not(:disabled){opacity:0.85;}
      `}</style>

      {/* ── Header ─────────────────────────────────────── */}
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:900,margin:"0 auto",padding:"0 16px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:12}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:26}}>🧊</span>
              <div>
                <div style={{fontSize:16,fontWeight:800,color:C.primary,letterSpacing:"-0.3px"}}>Meu Freezer Inteligente</div>
                <div style={{fontSize:10,fontWeight:600,
                  color: storageOk===true&&saveStatus==="saved" ? C.success
                       : storageOk===false ? C.warning
                       : saveStatus==="error" ? C.danger
                       : C.muted}}>
                  {saveStatus==="saving" && "💾 salvando..."}
                  {saveStatus==="saved"  && `✅ salvo · ${meats.length} item${meats.length!==1?"s":""}`}
                  {saveStatus==="error"  && "⚠️ erro ao salvar"}
                  {saveStatus==="idle"   && "Meu Freezer Inteligente"}
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              {/* User pill */}
              <button onClick={()=>setChangingUser(true)}
                style={{background:C.light,border:`1px solid ${C.border}`,borderRadius:20,
                  padding:"4px 12px",cursor:"pointer",color:C.text,
                  fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:20,height:20,borderRadius:"50%",
                  background:`hsl(${USERS.indexOf(currentUser)*90},60%,45%)`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:11,fontWeight:900,color:"#fff"}}>
                  {currentUser?.[0]}
                </div>
                {currentUser}
              </button>
              {alerts.length>0&&(
                <div onClick={()=>setTab("dashboard")}
                  style={{background:C.danger+"20",border:`1px solid ${C.danger}55`,borderRadius:20,
                    padding:"3px 10px",fontSize:12,color:C.danger,fontWeight:700,cursor:"pointer"}}>
                  🚨 {alerts.length}
                </div>
              )}
            </div>
          </div>

          {/* Warning banner if storage unavailable */}
          {storageOk===false&&(
            <div style={{background:"#2A1800",border:`1px solid ${C.warning}44`,borderRadius:8,
              padding:"8px 12px",margin:"8px 0 4px",fontSize:12,color:C.warning}}>
              ⚠️ O armazenamento automático não está disponível neste navegador/contexto.
              Use o botão <strong>💾 Backup</strong> para salvar seus dados manualmente e <strong>Restaurar</strong> para recarregar.
            </div>
          )}

          {/* Nav grid 3×2 */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,
            padding:"10px 0 10px"}}>
            {TABS.map(t=>{
              const on = tab===t.id;
              return (
                <button key={t.id} onClick={()=>setTab(t.id)}
                  style={{background:on?C.primary+"22":C.light,
                    border:`2px solid ${on?C.primary:C.border}`,
                    borderRadius:12,padding:"10px 4px",cursor:"pointer",
                    display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                  <span style={{fontSize:22,lineHeight:1}}>{t.e}</span>
                  <span style={{fontSize:11,fontWeight:700,
                    color:on?C.primary:C.muted}}>{t.l}</span>
                  {on&&<div style={{width:18,height:3,borderRadius:2,background:C.primary}}/>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────── */}
      <div style={{maxWidth:900,margin:"0 auto",padding:"16px 16px 60px"}}>
        {tab==="dashboard"  &&<Dashboard   meats={active} exits={exits} alerts={alerts} appConfig={appConfig} pacotesChurrasco={pacotesChurrasco} totalChurrascoKg={totalChurrascoKg} onConfirmChurrasco={confirmChurrasco} onCancelChurrasco={cancelChurrasco} onTogglePacoteChurrasco={togglePacoteChurrasco} shoppingList={shoppingList} onRemoveFromShoppingList={removeFromShoppingList}/>}
        {tab==="estoque"    &&<Estoque     meats={active} setTab={setTab} onTransfer={transferMeat} onUpdate={updateMeat} onMerge={mergeItems} onDelete={deleteMeat} onRegisterExit={exit=>{setExits(p=>[...p,{...exit,id:uid(),feitorPor:currentUser}]);}} appConfig={appConfig} onTogglePacoteChurrasco={togglePacoteChurrasco} onAddToShoppingList={addToShoppingList}/>}
        {tab==="entrada"    &&<Entrada     onAdd={addMeat} onAddToExisting={addToExisting} catalog={catalog} meats={active} setTab={setTab} appConfig={appConfig}/>}
        {tab==="churras"    &&<Churrasometro meats={active} catalog={catalog} appConfig={appConfig}/>}
        {tab==="relatorios" &&<Relatorios  meats={meats} exits={exits}/>}
        {tab==="config"     &&<Configuracoes config={appConfig} catalog={catalog} meats={meats} onUpdateConfig={setAppConfig} onUpdateCatalog={setCatalog} onUpdateMeats={setMeats} onRenameMeatField={renameMeatField} onClearHistory={()=>{
          setExits([]);
          setMeats(p=>p.filter(m=>m.pesoTotal>0));
        }}/>}
      </div>

      {/* ── Backup / Restore modal ──────────────────────── */}
      {showBackup&&(
        <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:300,
          display:"flex",alignItems:"flex-end",justifyContent:"center"}}
          onClick={()=>setShowBackup(false)}>
          <div style={{background:C.card,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:900,
            padding:"20px 20px 36px",maxHeight:"80vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:800,fontSize:17,marginBottom:4}}>💾 Backup de dados</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:14}}>
              Copie o texto abaixo e guarde em um bloco de notas, e-mail ou qualquer lugar seguro.
              Para restaurar depois, cole o texto e clique em Restaurar.
            </div>
            <textarea value={importTxt} onChange={e=>setImportTxt(e.target.value)}
              rows={8}
              style={{width:"100%",background:"#0A1520",color:C.text,
                border:`1px solid ${C.border}`,borderRadius:8,padding:12,
                fontSize:11,fontFamily:"monospace",resize:"vertical",outline:"none"}}/>
            {importMsg&&(
              <div style={{marginTop:8,fontSize:13,
                color:importMsg.startsWith("✅")?C.success:C.danger}}>
                {importMsg}
              </div>
            )}
            <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
              <Btn onClick={()=>{
                try {
                  if(navigator?.clipboard?.writeText) {
                    navigator.clipboard.writeText(importTxt);
                    setImportMsg("✅ Copiado! Cole em um bloco de notas para guardar.");
                  } else {
                    setImportMsg("Selecione todo o texto acima e copie manualmente (Ctrl+A → Ctrl+C).");
                  }
                } catch(e){ setImportMsg("Selecione o texto acima e copie manualmente."); }
              }}>📋 Copiar backup</Btn>
              <Btn onClick={importData} color={C.success}>🔄 Restaurar</Btn>
              <Btn onClick={()=>setShowBackup(false)} color={C.dim}>Fechar</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
