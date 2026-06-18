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
const TIPOS  = ["bovina","suína","frango","peixe","ovinos","acompanhamento"];
const LOCAIS = ["Freezer 1","Freezer 2","Freezer Ilha","Geladeira","Congelador"];
const MOTIVOS= ["consumo","churrasco","descarte","doação","transferência"];
const USERS  = ["Régis","Luciene","Hugo","Lavínia"];
const ORIGENS= ["in natura","do sol"];

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
function Dashboard({meats,exits,alerts}) {
  const [open,    setOpen]    = useState(null);
  const [localFlt,setLocalFlt]= useState("todos"); // sub-filter inside "estoque" panel
  const toggle = k => { setOpen(p=>p===k?null:k); setLocalFlt("todos"); };

  const totalKg    = meats.reduce((s,m)=>s+m.pesoTotal,0);
  const valorAtual = meats.reduce((s,m)=>s+(m.precoPago||0),0);
  const byTipo     = TIPOS.map(t=>({t,kg:meats.filter(m=>m.tipo===t).reduce((s,m)=>s+m.pesoTotal,0),count:meats.filter(m=>m.tipo===t).length})).filter(x=>x.kg>0);

  // locais that actually have items
  const locaisAtivos = LOCAIS.filter(l=>meats.some(m=>m.local===l));
  const kgByLocal    = l => meats.filter(m=>m.local===l).reduce((s,m)=>s+m.pesoTotal,0);

  // Origem breakdown
  const natItems = meats.filter(m=>m.origem==="in natura");
  const solItems = meats.filter(m=>m.origem==="do sol");
  const kgNat    = natItems.reduce((s,m)=>s+m.pesoTotal,0);
  const kgSol    = solItems.reduce((s,m)=>s+m.pesoTotal,0);

  const boxes = [
    {id:"estoque", icon:"🧊", label:"Total de estoque", value:fmtKg(totalKg),          color:C.primary},
    {id:"tipos",   icon:"📦", label:"Tipos no estoque", value:`${byTipo.length} tipos`, color:C.info},
    {id:"alertas", icon:"🚨", label:"Alertas ativos",   value:`${alerts.length} alerta${alerts.length!==1?"s":""}`, color:alerts.length?C.danger:C.success},
    {id:"valor",   icon:"💰", label:"Valor em estoque", value:fmtR(valorAtual)||"R$ 0,00", color:C.success},
  ];

  return (
    <div>
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

      {/* ── Natural / Do Sol ─────────────────────────── */}
      {(kgNat>0||kgSol>0)&&(
        <div style={{display:"flex",gap:10,marginBottom:12}}>
          <div style={{flex:1,background:C.card,border:`1px solid ${C.border}`,
            borderRadius:12,padding:"12px 14px",borderLeft:`4px solid ${C.success}`}}>
            <div style={{fontSize:11,color:C.success,fontWeight:700,marginBottom:4}}>🌿 In Natura</div>
            <div style={{fontSize:20,fontWeight:800,color:C.success}}>{fmtKg(kgNat)}</div>
            <div style={{fontSize:11,color:C.muted}}>{natItems.length} item{natItems.length!==1?"s":""}</div>
          </div>
          <div style={{flex:1,background:C.card,border:`1px solid ${C.border}`,
            borderRadius:12,padding:"12px 14px",borderLeft:`4px solid ${C.warning}`}}>
            <div style={{fontSize:11,color:C.warning,fontWeight:700,marginBottom:4}}>☀️ Do Sol</div>
            <div style={{fontSize:20,fontWeight:800,color:C.warning}}>{fmtKg(kgSol)}</div>
            <div style={{fontSize:11,color:C.muted}}>{solItems.length} item{solItems.length!==1?"s":""}</div>
          </div>
        </div>
      )}

      {/* ── Expandable panels ────────────────────────── */}
      {open==="estoque"&&(
        <Card style={{borderTop:`3px solid ${C.primary}`}}>

          {/* Location sub-filter pills */}
          <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:14,paddingBottom:2}}>
            {[{label:"Total",value:"todos",kg:totalKg},...locaisAtivos.map(l=>({label:l,value:l,kg:kgByLocal(l)}))].map(p=>{
              const act = localFlt===p.value;
              return (
                <button key={p.value} onClick={e=>{e.stopPropagation();setLocalFlt(p.value);}}
                  style={{background:act?C.primary:C.light,color:act?"#fff":C.muted,
                    border:`1px solid ${act?C.primary:C.border}`,borderRadius:16,
                    padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:600,
                    whiteSpace:"nowrap",flexShrink:0}}>
                  {p.label}
                  <span style={{marginLeft:5,opacity:0.75,fontSize:11}}>{fmtKg(p.kg)}</span>
                </button>
              );
            })}
          </div>

          {/* Summary row when a specific local is selected */}
          {localFlt!=="todos"&&(
            <div style={{background:C.light,borderRadius:8,padding:"8px 12px",marginBottom:10,
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,color:C.muted}}>📍 {localFlt}</span>
              <span style={{fontWeight:800,color:C.primary,fontSize:15}}>{fmtKg(kgByLocal(localFlt))}</span>
            </div>
          )}

          {/* Meat list */}
          {meats.length===0&&<div style={{color:C.muted,textAlign:"center"}}>Nenhuma carne cadastrada.</div>}
          {[...meats]
            .filter(m=>localFlt==="todos"||m.local===localFlt)
            .sort((a,b)=>new Date(a.dataEntrada)-new Date(b.dataEntrada))
            .map(m=>{
              const al=getAlert(m); const ai=ALERT[al];
              const dis=diffDays(m.dataEntrada,TODAY);
              return (
                <div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                  padding:"9px 0",borderBottom:`1px solid ${C.border}`,gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      <span style={{fontWeight:600}}>{m.corte||m.tipo}</span>
                      <span style={{fontSize:11,color:C.muted,background:C.light,padding:"1px 6px",borderRadius:4}}>{m.tipo}</span>
                      {al!=="ok"&&<Badge label={ai.label} color={ai.color}/>}
                    </div>
                    <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                      {localFlt==="todos"&&<>📍 {m.local} · </>}{dis}d no estoque
                    </div>
                  </div>
                  <div style={{fontWeight:800,color:TIPO_COLORS[m.tipo]||C.primary,flexShrink:0}}>{fmtKg(m.pesoTotal)}</div>
                </div>
              );
            })
          }

          {/* Total footer */}
          <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0 0",fontWeight:700,fontSize:14}}>
            <span style={{color:C.muted}}>{localFlt==="todos"?"Total geral":localFlt}</span>
            <span style={{color:C.primary}}>{fmtKg(localFlt==="todos"?totalKg:kgByLocal(localFlt))}</span>
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
function Estoque({meats,setTab,onTransfer}) {
  const [flocal,    setFlocal]    = useState("todos");
  const [selected,  setSelected]  = useState(null);
  const [showXfer,  setShowXfer]  = useState(false);  // transfer step visible?
  const [transferOk,setTransferOk]= useState("");

  // Count per location for pills
  const countBy = loc => meats.filter(m=>m.local===loc).length;

  const filtered = meats
    .filter(m=>flocal==="todos"||m.local===flocal)
    .sort((a,b)=>new Date(a.dataEntrada)-new Date(b.dataEntrada));

  const detail = meats.find(m=>m.id===selected);

  const openDetail = (id) => { setSelected(id); setShowXfer(false); setTransferOk(""); };
  const closeModal = ()   => { setSelected(null); setShowXfer(false); setTransferOk(""); };

  const doTransfer = (novoLocal) => {
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

      {/* ── Location pills ───────────────────────────── */}
      <div style={{display:"flex",gap:8,overflowX:"auto",marginBottom:16,paddingBottom:4}}>
        <LocPill label="Todos" value="todos" count={meats.length}/>
        {LOCAIS.filter(l=>countBy(l)>0).map(l=>(
          <LocPill key={l} label={l} value={l} count={countBy(l)}/>
        ))}
      </div>

      {/* ── Meat list ───────────────────────────────── */}
      {filtered.length===0&&(
        <Card><div style={{color:C.muted,textAlign:"center",padding:20}}>
          Nenhum item em {flocal==="todos"?"estoque":flocal}.
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
                  background:m.origem==="do sol"?"#2A1A00":"#0A2010",
                  color:m.origem==="do sol"?C.warning:C.success}}>
                  {m.origem==="do sol"?"☀️ Do Sol":"🌿 In Natura"}
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
                        detail.origem&&{icon:detail.origem==="do sol"?"☀️":"🌿", label:"Origem", value:detail.origem==="do sol"?"Do Sol":"In Natura"},
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

                    {/* Pacotes individuais com peso de cada um */}
                    {(detail.pacotes?.length>0)&&(
                      <div style={{marginTop:10}}>
                        <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:6}}>
                          📦 Peso de cada pacote
                        </div>
                        {detail.pacotes.map((p,i)=>(
                          <div key={p.id||i} style={{display:"flex",justifyContent:"space-between",
                            alignItems:"center",padding:"7px 10px",borderRadius:8,marginBottom:4,
                            background:p.status==="consumido"?"transparent":
                                       p.status==="aberto"?C.warning+"18":C.light,
                            opacity:p.status==="consumido"?0.4:1}}>
                            <span style={{fontSize:13,fontWeight:600,color:C.text}}>
                              Pacote {i+1}
                              {p.status==="aberto"&&<span style={{color:C.warning,fontSize:11}}> · 🔓 aberto</span>}
                              {p.status==="consumido"&&<span style={{color:C.dim,fontSize:11}}> · consumido</span>}
                            </span>
                            <div style={{textAlign:"right"}}>
                              <span style={{fontWeight:800,fontSize:14,
                                color:p.status==="consumido"?C.dim:p.status==="aberto"?C.warning:C.primary}}>
                                {fmtKg(p.pesoAtual)}
                              </span>
                              {p.pesoAtual!==p.peso&&(
                                <div style={{fontSize:10,color:C.dim}}>original: {fmtKg(p.peso)}</div>
                              )}
                            </div>
                          </div>
                        ))}
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
                        <div style={{fontSize:12,color:C.muted,marginBottom:10,fontWeight:600}}>
                          Escolha o destino:
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:8}}>
                          {LOCAIS.filter(l=>l!==detail.local).map(l=>(
                            <button key={l} onClick={()=>doTransfer(l)}
                              style={{background:C.light,border:`1px solid ${C.border}`,
                                borderRadius:12,padding:"14px 18px",cursor:"pointer",
                                color:C.text,fontSize:15,fontWeight:700,textAlign:"left",
                                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <span>📍 {l}</span>
                              <span style={{color:C.success,fontSize:20}}>→</span>
                            </button>
                          ))}
                        </div>
                        <button onClick={()=>setShowXfer(false)}
                          style={{marginTop:10,background:"none",border:"none",color:C.muted,
                            cursor:"pointer",fontSize:13,width:"100%",textAlign:"center"}}>
                          ← Cancelar
                        </button>
                      </>
                    ) : (
                      <button onClick={()=>setShowXfer(true)}
                        style={{width:"100%",background:C.info+"22",border:`1px solid ${C.info}55`,
                          borderRadius:12,padding:"14px",cursor:"pointer",color:C.info,
                          fontSize:15,fontWeight:700,display:"flex",justifyContent:"center",
                          alignItems:"center",gap:8}}>
                        🔄 Transferir para outro local
                      </button>
                    )}
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
function Entrada({onAdd, onAddToExisting, catalog, meats, setTab}) {
  const blank = {tipo:"bovina",corte:"",origem:"",pesoTotal:"",quantidadePecas:"1",
    dataEntrada:TODAY,local:"Freezer 1",status:"disponível",observacao:"",precoPago:"",precoKg:""};
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
  const handleCorteChange = (e) => {
    const val = e.target.value;
    const cap = val.charAt(0).toUpperCase() + val.slice(1);
    setForm(f=>({...f,corte:cap}));
  };

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
  const matchKey = `${form.tipo}:${form.corte.trim().toLowerCase()}`;
  const matchingItems = form.corte.trim().length>1
    ? meats.filter(m=>`${m.tipo}:${(m.corte||m.tipo).trim().toLowerCase()}`===matchKey&&m.pesoTotal>0)
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
    onAdd({...form,
      pesoTotal: pacotesPesos[0],
      pacotesPesos,
      quantidadePecas: qtd,
      precoPago: parseFloat(form.precoPago)||null,
      precoKg:   parseFloat(form.precoKg)||null,
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
          <FSelect label="Tipo *" value={form.tipo} onChange={set("tipo")}>
            {TIPOS.map(t=><option key={t} value={t}>{t}</option>)}
          </FSelect>
          <FWrap>
            <FLabel>Corte</FLabel>
            <input list="catalog-cortes" style={inputBase}
              value={form.corte} onChange={handleCorteChange} placeholder="Digite ou selecione..."/>
            <datalist id="catalog-cortes">
              {catalog.filter(c=>c.tipo===form.tipo).map(c=>(
                <option key={c.key} value={c.nome}/>
              ))}
            </datalist>
          </FWrap>
        </div>

        {/* Origem */}
        <FWrap>
          <FLabel>Origem</FLabel>
          <div style={{display:"flex",gap:8}}>
            <OrigBtn val="in natura" label="🌿 In Natura"/>
            <OrigBtn val="do sol"    label="☀️ Do Sol"/>
          </div>
        </FWrap>

        {/* Itens correspondentes */}
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
                  type="number" step="0.1" min="0.1" placeholder="Ex: 1.5"/>
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
                {LOCAIS.map(l=><option key={l} value={l}>{l}</option>)}
              </FSelect>
              <FInput label="Preço pago (R$)" value={form.precoPago} onChange={set("precoPago")}
                onBlur={calcPrecoKg} type="number" step="0.01" placeholder="Ex: 149.75"
                onFocus={e=>e.target.select()}/>
              <FInput label="Preço por kg (R$)" value={form.precoKg} onChange={set("precoKg")}
                type="number" step="0.01" placeholder="Calculado auto"
                onFocus={e=>e.target.select()}/>
            </div>
            <FInput label="Observações" value={form.observacao} onChange={set("observacao")}
              placeholder="Temperada, fatiada, para churrasco..."/>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>
              <Btn onClick={submit}>✅ Cadastrar carne</Btn>
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
  const avail = [...meats].filter(m=>m.pesoTotal>0).sort((a,b)=>new Date(a.dataEntrada)-new Date(b.dataEntrada));
  const [sel,      setSel]      = useState(avail[0]?.id||"");
  const [selPacote,setSelPacote]= useState(null); // null = auto
  const [form,     setForm]     = useState({pesoRetirado:"",dataSaida:TODAY,motivo:"churrasco",localDestino:"",eventoVinculado:"",observacao:""});
  const [ok,       setOk]       = useState(false);
  const set = k=>e=>setForm(f=>({...f,[k]:e.target.value}));
  const meat       = avail.find(m=>m.id===sel);
  const isTransfer = form.motivo==="transferência";
  const locaisDestino = meat ? LOCAIS.filter(l=>l!==meat.local) : LOCAIS;

  // Pacotes ativos do item selecionado
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

      {/* Cut selection from catalog */}
      <SecTitle icon="🥩"
        children={selKeys.length>0
          ?`Cortes selecionados (${selKeys.length})`
          :"Quais cortes vai servir?"}/>

      {catalog.length===0 ? (
        <Card style={{marginBottom:16}}>
          <div style={{color:C.muted,textAlign:"center",padding:8}}>
            Nenhum corte cadastrado ainda. Adicione carnes na aba Entrada e eles aparecerão aqui automaticamente.
          </div>
        </Card>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
          {catalog.map(entry=>{
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
        const transfers = [...exits]
          .filter(e=>e.motivo==="transferência")
          .reverse();
        return (
          <Card style={{marginBottom:14}}>
            <div style={{fontWeight:700,marginBottom:10}}>🔄 Histórico de transferências ({transfers.length})</div>
            {transfers.length===0
              ?<div style={{color:C.muted,textAlign:"center"}}>Nenhuma transferência registrada.</div>
              :transfers.map(e=>(
                <div key={e.id} style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",padding:"7px 0",
                  borderBottom:`1px solid ${C.border}`,flexWrap:"wrap",gap:4}}>
                  <div>
                    <span style={{fontWeight:600}}>{e.carneNome}</span>
                    <span style={{fontSize:12,color:C.muted}}> · {fmtDate(e.dataSaida)}</span>
                    {e.observacao&&(
                      <span style={{fontSize:12,color:C.info}}> · {e.observacao}</span>
                    )}
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

      <Card>
        <div style={{fontWeight:700,marginBottom:10}}>📋 Histórico de saídas ({exits.length})</div>
        {exits.length===0
          ?<div style={{color:C.muted,textAlign:"center"}}>Nenhuma saída registrada.</div>
          :[...exits].reverse().map(e=>(
            <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.border}`,flexWrap:"wrap",gap:4}}>
              <div>
                <span style={{fontWeight:600}}>{e.carneNome}</span>
                <span style={{fontSize:12,color:C.muted}}> · {fmtDate(e.dataSaida)} · {e.motivo}</span>
                {e.eventoVinculado&&<span style={{fontSize:11,color:C.dim}}> · {e.eventoVinculado}</span>}
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
          ))
        }
      </Card>
    </div>
  );
}

// ─── ROOT ──────────────────────────────────────────────────────────────────────
const STORAGE_KEY  = "mfi3_data";
const FIREBASE_REST = `https://meu-freezer-inteligente-default-rtdb.firebaseio.com/${DB_PATH}.json`;

export default function App() {
  const [meats,       setMeats]       = useState([]);
  const [exits,       setExits]       = useState([]);
  const [catalog,     setCatalog]     = useState([]);
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

  // ── LOAD + SYNC (Firebase onValue — leitura em tempo real) ────────────────
  useEffect(()=>{
    try {
      const savedUser = localStorage.getItem("mfi3_user");
      if(savedUser && USERS.includes(savedUser)) setCurrentUser(savedUser);
    } catch(e){}

    const unsubscribe = onValue(dbRef(db, DB_PATH), (snapshot)=>{
      const data = snapshot.val();
      if(data) {
        const hash = JSON.stringify(data);
        lastSaved.current = hash;
        setMeats(data.meats    || []);
        setExits(data.exits    || []);
        setCatalog(data.catalog || []);
      }
      setStorageOk(true);
      setLoaded(true);
    }, ()=>{
      setStorageOk(false);
      setLoaded(true);
    });
    return ()=>unsubscribe();
  },[]);

  // ── SAVE via REST API (fetch direto — mais confiável que SDK set()) ────────
  useEffect(()=>{
    if(!loaded) return;
    const currentHash = JSON.stringify({meats, exits, catalog});
    if(currentHash === lastSaved.current) return;

    setSaveStatus("saving");
    const t = setTimeout(async ()=>{
      const ctrl    = new AbortController();
      const timeout = setTimeout(()=>ctrl.abort(), 10000);
      try {
        lastSaved.current = currentHash;
        const res = await fetch(FIREBASE_REST, {
          method:"PUT",
          headers:{"Content-Type":"application/json"},
          body: JSON.stringify({meats, exits, catalog}),
          signal: ctrl.signal,
        });
        clearTimeout(timeout);
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        setSaveStatus("saved");
      } catch(err){
        clearTimeout(timeout);
        lastSaved.current = ""; // permite tentar novamente
        setSaveStatus("error");
        console.error("Save error:", err.message);
      }
    }, 800);
    return ()=>clearTimeout(t);
  },[meats, exits, catalog, loaded]);

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
    // Cria pacotes individuais
    const pesosArray = meat.pacotesPesos?.length
      ? meat.pacotesPesos
      : Array(meat.quantidadePecas||1).fill(meat.pesoTotal/(meat.quantidadePecas||1));
    const pacotes   = pesosArray.map(p=>makePacote(parseFloat(p)||0));
    const pesoTotal = pacotes.reduce((s,p)=>s+p.peso,0);
    const newMeat   = {
      ...meat, id:uid(), pesoInicial:pesoTotal, pesoTotal,
      quantidadePecas:pacotes.length, pacotes,
      status:"disponível", feitorPor:currentUser,
      pacotesPesos:undefined,
    };
    setMeats(p=>[...p, newMeat]);
    const nome=(meat.corte||meat.tipo).trim();
    const key =`${meat.tipo}:${nome.toLowerCase()}`;
    setCatalog(p=>p.some(c=>c.key===key)?p:[...p,{id:uid(),nome,tipo:meat.tipo,key}]);
  };

  const addToExisting = (id, pesoAdd, qtdAdd, precoAdd) => {
    const n = qtdAdd||1;
    const pesoPorPacote = parseFloat((pesoAdd/n).toFixed(3));
    const newPacotes = Array(n).fill(0).map(()=>makePacote(pesoPorPacote));
    setMeats(p=>p.map(m=>m.id===id?{
      ...m,
      pesoTotal:    parseFloat((getPesoTotal(m)+pesoAdd).toFixed(3)),
      pesoInicial:  parseFloat(((m.pesoInicial||m.pesoTotal)+pesoAdd).toFixed(3)),
      quantidadePecas:(m.quantidadePecas||1)+n,
      pacotes:[...(m.pacotes||[makePacote(m.pesoTotal)]),...newPacotes],
      precoPago:precoAdd?parseFloat(((m.precoPago||0)+precoAdd).toFixed(2)):m.precoPago,
      status:m.status==="consumido"?"disponível":m.status,
    }:m));
  };
  const transferMeat = (id, novoLocal) => setMeats(p=>p.map(m=>m.id===id?{...m,local:novoLocal,feitorPor:currentUser}:m));
  const registerExit= (ex)  => {
    const m = meats.find(x=>x.id===ex.carneId);
    if(!m) return;
    if(ex.motivo==="transferência") {
      setMeats(p=>p.map(x=>x.id===ex.carneId?{...x,local:ex.localDestino}:x));
      setExits(p=>[...p,{...ex,id:uid(),carneNome:m.corte||m.tipo,tipo:m.tipo,pesoRetirado:getPesoTotal(m),
        feitorPor:currentUser,
        observacao:`${m.local} → ${ex.localDestino}${ex.observacao?` · ${ex.observacao}`:""}`}]);
    } else {
      // Aplica saída nos pacotes individuais
      const pacotesAtuais = m.pacotes||[makePacote(m.pesoTotal)];
      const pacotesNovos  = applyExitToPacotes(pacotesAtuais, ex.pesoRetirado, ex.pacoteId);
      const novoTotal     = parseFloat(pacotesNovos.filter(p=>p.status!=="consumido").reduce((s,p)=>s+p.pesoAtual,0).toFixed(3));
      const novoStatus    = getStatusFromPacotes(pacotesNovos);
      const qtdAtiva      = pacotesNovos.filter(p=>p.status!=="consumido").length;
      const novoPreco     = m.precoKg && novoTotal>0
        ? parseFloat((novoTotal*m.precoKg).toFixed(2))
        : m.precoPago && m.pesoTotal>0
          ? parseFloat(((novoTotal/m.pesoTotal)*m.precoPago).toFixed(2))
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
    {id:"saida",     e:"➖", l:"Saída"},
    {id:"churras",   e:"🔥", l:"Churrasco"},
    {id:"relatorios",e:"📊", l:"Relatórios"},
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
                  {storageOk===null   && "🔄 conectando ao Firebase..."}
                  {storageOk===true   && saveStatus==="saving" && "💾 salvando..."}
                  {storageOk===true   && saveStatus==="saved"  && `✅ salvo · ${meats.length} item${meats.length!==1?"s":""}`}
                  {storageOk===true   && saveStatus==="error"  && "⚠️ erro ao salvar — verifique as regras do Firebase"}
                  {storageOk===true   && saveStatus==="idle"   && "Firebase conectado"}
                  {storageOk===false  && "⚠️ Firebase offline — verifique as regras do banco"}
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

          {/* Tabs */}
          <div style={{display:"flex",overflowX:"auto",marginTop:8,gap:0}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)}
                style={{background:"transparent",border:"none",borderBottom:`3px solid ${tab===t.id?C.primary:"transparent"}`,
                  color:tab===t.id?C.primary:C.muted,cursor:"pointer",padding:"8px 10px",
                  fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>
                {t.e} {t.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────── */}
      <div style={{maxWidth:900,margin:"0 auto",padding:"20px 16px 60px"}}>
        {tab==="dashboard"  &&<Dashboard   meats={active} exits={exits} alerts={alerts}/>}
        {tab==="estoque"    &&<Estoque     meats={active} setTab={setTab} onTransfer={transferMeat}/>}
        {tab==="entrada"    &&<Entrada     onAdd={addMeat} onAddToExisting={addToExisting} catalog={catalog} meats={active} setTab={setTab}/>}
        {tab==="saida"      &&<Saida       meats={active} onRegister={registerExit} setTab={setTab}/>}
        {tab==="churras"    &&<Churrasometro meats={active} catalog={catalog}/>}
        {tab==="relatorios" &&<Relatorios  meats={meats} exits={exits}/>}
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
