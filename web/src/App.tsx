import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { api } from "./api";
import type { AIJob, AIResponse, ContentPacket, DocumentSummary, Health, Job, Recipe } from "./types";

type Tab = "library" | "activity" | "capture";
type Lane = "capture" | "ai";
type Pane = "content" | "ai" | "meta";
type Theme = "mocha" | "latte";
type Toast = { id: number; tone: "ok" | "err" | "info"; text: string };

const TERMINAL = new Set(["done", "failed", "cancelled"]);
const G = { library: "▤", activity: "◌", capture: "+", search: "⌕", ai: "✦", copy: "⧉", open: "↗", refresh: "↻" };

function tone(s: string) { return s === "done" ? "ok" : s === "failed" || s === "cancelled" ? "err" : s === "running" ? "run" : s === "retry_wait" ? "warn" : "queue"; }
function label(s: string) { return ({ queued:"排队中", planning:"规划中", running:"运行中", normalizing:"整理中", stored:"已保存", retry_wait:"等待重试", done:"已完成", failed:"失败", cancelled:"已取消" } as Record<string,string>)[s] || s; }
function short(s?: string, n=14) { return !s ? "—" : s.length > n ? `${s.slice(0,n)}…` : s; }
function time(s?: string) { if (!s) return "—"; const d=new Date(s); return Number.isNaN(d.getTime()) ? s : d.toLocaleString("zh-CN",{hour12:false}); }
function ago(s?: string) { if(!s)return"—"; const x=Math.max(0,Date.now()-new Date(s).getTime()),m=Math.round(x/60000); return x<10000?"刚刚":m<1?`${Math.round(x/1000)} 秒前`:m<60?`${m} 分钟前`:m<1440?`${Math.round(m/60)} 小时前`:m<10080?`${Math.round(m/1440)} 天前`:time(s); }
function host(url?:string){try{return url?new URL(url).hostname||new URL(url).protocol.replace(":",""):""}catch{return url||""}}
function Badge({status}:{status:string}){return <span className={`badge ${tone(status)}`}><i/>{label(status)}</span>}
function Empty({title,copy,action}:{title:string;copy:string;action?:ReactNode}){return <div className="empty"><b>◇</b><strong>{title}</strong><p>{copy}</p>{action}</div>}

export default function App(){
  const [tab,setTab]=useState<Tab>("library"), [lane,setLane]=useState<Lane>("capture"), [pane,setPane]=useState<Pane>("content");
  const [theme,setTheme]=useState<Theme>(()=>localStorage.getItem("capture-flow-theme")==="latte"?"latte":"mocha");
  const [health,setHealth]=useState<Health|null>(null), [refreshing,setRefreshing]=useState(false), [lastSync,setLastSync]=useState<Date|null>(null);
  const [toasts,setToasts]=useState<Toast[]>([]), seed=useRef(0), docLoadSeq=useRef(0);
  const [jobs,setJobs]=useState<Job[]>([]), [aiJobs,setAiJobs]=useState<AIJob[]>([]), [jobId,setJobId]=useState(""), [aiJobId,setAiJobId]=useState("");
  const [docs,setDocs]=useState<DocumentSummary[]>([]), [query,setQuery]=useState(""), [docId,setDocId]=useState("");
  const [doc,setDoc]=useState<ContentPacket|null>(null), [docLoading,setDocLoading]=useState(false), [results,setResults]=useState<AIResponse[]>([]);
  const [recipes,setRecipes]=useState<Recipe[]>([]), [recipeId,setRecipeId]=useState("summarize"), [enqueueing,setEnqueueing]=useState(false), [latestAi,setLatestAi]=useState<AIJob|null>(null);
  const [url,setUrl]=useState(""), [capturing,setCapturing]=useState(false), searchRef=useRef<HTMLInputElement|null>(null);

  const selectedJob=useMemo(()=>jobs.find(x=>x.id===jobId)||null,[jobs,jobId]);
  const selectedAi=useMemo(()=>aiJobs.find(x=>x.id===aiJobId)||null,[aiJobs,aiJobId]);
  const recipe=useMemo(()=>recipes.find(x=>x.id===recipeId),[recipes,recipeId]);
  const docMap=useMemo(()=>new Map(docs.map(x=>[x.document_id,x])),[docs]);
  const filtered=useMemo(()=>{const q=query.trim().toLowerCase();return q?docs.filter(d=>[d.title,d.author,d.url,d.source,d.adapter].some(v=>String(v||"").toLowerCase().includes(q))):docs},[docs,query]);
  const activeCapture=jobs.filter(x=>!TERMINAL.has(x.status)).length, failures=jobs.filter(x=>x.status==="failed").length+(health?.ai_queue?.failed||0);

  const toast=useCallback((tone:Toast["tone"],text:string)=>{const id=++seed.current;setToasts(x=>[...x,{id,tone,text}]);setTimeout(()=>setToasts(x=>x.filter(t=>t.id!==id)),3600)},[]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem("capture-flow-theme",theme)},[theme]);
  useEffect(()=>{const f=(e:KeyboardEvent)=>{const t=e.target as HTMLElement|null,typing=t&&(["INPUT","TEXTAREA","SELECT"].includes(t.tagName)||t.isContentEditable);if(e.key==="/"&&!typing){e.preventDefault();setTab("library");setTimeout(()=>searchRef.current?.focus(),0)}};addEventListener("keydown",f);return()=>removeEventListener("keydown",f)},[]);

  const refreshHealth=useCallback(async()=>{try{setHealth(await api.health())}catch{setHealth(null)}},[]);
  const refreshJobs=useCallback(async()=>{const x=await api.listJobs(100);setJobs(x);setJobId(v=>v||x[0]?.id||"")},[]);
  const refreshAi=useCallback(async()=>{const x=await api.listAiJobs(100);setAiJobs(x);setAiJobId(v=>v||x[0]?.id||"");setLatestAi(v=>v?x.find(j=>j.id===v.id)||v:v)},[]);
  const refreshDocs=useCallback(async()=>{const x=await api.listDocs(120);setDocs(x);setDocId(v=>v||x[0]?.document_id||"")},[]);
  const loadDoc=useCallback(async(id:string,quiet=false)=>{const seq=++docLoadSeq.current;if(!id){setDoc(null);setResults([]);return}if(!quiet)setDocLoading(true);try{const[d,a]=await Promise.all([api.getDoc(id),api.listDocAi(id)]);if(seq!==docLoadSeq.current)return;setDoc(d);setResults(a)}catch(e){if(!quiet&&seq===docLoadSeq.current)toast("err",e instanceof Error?e.message:String(e))}finally{if(!quiet&&seq===docLoadSeq.current)setDocLoading(false)}},[toast]);
  const refreshAll=useCallback(async(notify=false)=>{setRefreshing(true);try{await Promise.all([refreshHealth(),refreshJobs(),refreshAi(),refreshDocs(),api.listRecipes().then(setRecipes).catch(()=>setRecipes([]))]);setLastSync(new Date());if(notify)toast("ok","已同步最新状态")}catch(e){toast("err",e instanceof Error?e.message:String(e))}finally{setRefreshing(false)}},[refreshHealth,refreshJobs,refreshAi,refreshDocs,toast]);

  useEffect(()=>{void refreshAll()},[refreshAll]);
  useEffect(()=>{if(docId)void loadDoc(docId)},[docId,loadDoc]);
  useEffect(()=>{const id=setInterval(()=>{void refreshHealth();if(tab==="activity"){void refreshJobs().catch(()=>{});void refreshAi().catch(()=>{})}if(tab==="library"&&docId)void api.listDocAi(docId).then(setResults).catch(()=>{})},3500);return()=>clearInterval(id)},[tab,docId,refreshHealth,refreshJobs,refreshAi]);

  async function copy(v:string,msg="已复制"){try{await navigator.clipboard.writeText(v);toast("ok",msg)}catch{toast("err","复制失败，请手动复制")}}
  async function capture(e:FormEvent<HTMLFormElement>){e.preventDefault();const raw=url.trim();if(!raw)return;const normalized=/^[a-z][\w+.-]*:\/\//i.test(raw)?raw:`https://${raw}`;try{const p=new URL(normalized);if(!["http:","https:","fake:"].includes(p.protocol))throw 0}catch{toast("err","请输入有效的网址");return}setCapturing(true);try{const j=await api.createJob(normalized);setJobs(x=>[j,...x.filter(v=>v.id!==j.id)]);setJobId(j.id);setLane("capture");setTab("activity");setUrl("");toast("ok","已进入采集队列，可以继续做别的事") }catch(e){toast("err",e instanceof Error?e.message:String(e))}finally{setCapturing(false)}}
  async function runAi(){if(!docId)return;setEnqueueing(true);try{const j=await api.enqueueAi(docId,recipeId);setLatestAi(j);setAiJobs(x=>[j,...x.filter(v=>v.id!==j.id)]);setAiJobId(j.id);toast(j.status==="done"?"ok":"info",j.status==="done"?"已复用相同结果":"AI 任务已进入后台队列");await refreshHealth()}catch(e){toast("err",e instanceof Error?e.message:String(e))}finally{setEnqueueing(false)}}

  const meta={library:["资料库","阅读、检索并继续处理已经捕获的内容"],activity:["活动","一个地方看清采集与 AI 后台队列"],capture:["采集","手动补录 URL；日常浏览推荐 Browser Snapshot"]}[tab];

  return <div className="shell">
    <aside className="side">
      <div className="brand"><span className="logo"><i/><i/><i/></span><div><strong>Capture Flow</strong><small>Local intelligence inbox</small></div></div>
      <nav>{(["library","activity","capture"] as Tab[]).map(x=><button key={x} className={tab===x?"active":""} onClick={()=>setTab(x)}><span className="glyph">{G[x]}</span><b>{x==="library"?"资料库":x==="activity"?"活动":"采集"}</b>{x==="library"?<kbd>/</kbd>:x==="activity"&&activeCapture+(health?.ai_queue?.queued||0)+(health?.ai_queue?.running||0)>0?<em>{activeCapture+(health?.ai_queue?.queued||0)+(health?.ai_queue?.running||0)}</em>:null}</button>)}</nav>
      <section className={`hub ${health?"on":"off"}`}><header><span><i/>Hub {health?"在线":"离线"}</span><code>127.0.0.1</code></header>{health?<><div className="workers"><span>AI workers</span><b>{health.ai_queue?.running||0}<small> / {health.ai_queue?.concurrency||0}</small></b></div><div className="meter"><i style={{width:`${Math.min(100,(health.ai_queue?.running||0)/Math.max(1,health.ai_queue?.concurrency||1)*100)}%`}}/></div><footer><span>排队 <b>{health.ai_queue?.queued||0}</b></span><span>重试 <b>{health.ai_queue?.retry_wait||0}</b></span><span>模型 <b className={health.ai_configured?"good":"warn"}>{health.ai_configured?"Ready":"Off"}</b></span></footer></>:<p>启动本地 Hub 后自动恢复连接。</p>}</section>
      <button className="theme" onClick={()=>setTheme(x=>x==="mocha"?"latte":"mocha")}>{theme==="mocha"?"☼  Latte 明亮":"☾  Mocha 深色"}<small>Catppuccin</small></button>
    </aside>

    <main>
      <header className="top"><div><small>LOCAL HUB</small><h1>{meta[0]}</h1><p>{meta[1]}</p></div><div>{lastSync&&<span>{ago(lastSync.toISOString())}同步</span>}<button className={refreshing?"spinning":""} onClick={()=>void refreshAll(true)} aria-label="刷新">{G.refresh}</button></div></header>
      {!health&&<div className="offline"><b>!</b><span><strong>Local Hub 当前不可达</strong><small>启动后本页会自动重新连接。</small></span><code>go run ./cmd/hub -addr 127.0.0.1:8080 -data data</code><button onClick={()=>void copy("go run ./cmd/hub -addr 127.0.0.1:8080 -data data","启动命令已复制")} aria-label="复制启动命令">{G.copy}</button></div>}

      {tab==="library"&&<div className="workspace library">
        <aside className="surface doclist"><header><label>{G.search}<input ref={searchRef} value={query} onChange={(e:ChangeEvent<HTMLInputElement>)=>setQuery(e.target.value)} placeholder="搜索标题、作者、来源…"/><kbd>/</kbd></label><small>{filtered.length}/{docs.length}</small></header><div>{filtered.length?filtered.map(d=><button key={d.document_id} className={docId===d.document_id?"active":""} onClick={()=>{setDocId(d.document_id);setPane("content")}}><i className="source">{(d.source||"W")[0].toUpperCase()}</i><span><strong>{d.title||"未命名内容"}</strong><small>{d.author||host(d.url)||"未知来源"}</small><em>{d.source} · {ago(d.updated_at||d.captured_at)}</em></span><b>›</b></button>):<Empty title={docs.length?"没有匹配内容":"资料库还是空的"} copy={docs.length?"换一个更短的关键词试试。":"用浏览器插件捕获，或手动提交一个 URL。"} action={!docs.length?<button className="secondary" onClick={()=>setTab("capture")}>去采集</button>:undefined}/>}</div></aside>
        <section className="surface reader">{docLoading&&!doc?<div className="loading">◌ 正在加载…</div>:!doc?<Empty title="选择一篇内容开始阅读" copy="正文、AI 结果与元数据都在同一个阅读工作台里。"/>:<>
          <header className="readerhead"><p><span>{doc.source}</span>{host(doc.url)} · {ago(doc.captured_at)}</p><h2>{doc.title||"未命名内容"}</h2><footer><span>{doc.author||"未知作者"} · {doc.collector}</span><div><button onClick={()=>void copy(doc.url,"链接已复制")}>{G.copy} 复制</button><a href={doc.url} target="_blank" rel="noreferrer">{G.open} 原文</a></div></footer></header>
          <div className="aibar"><span>{G.ai}</span><select value={recipeId} onChange={(e:ChangeEvent<HTMLSelectElement>)=>setRecipeId(e.target.value)}>{(recipes.length?recipes:[{id:"summarize",name:"总结"}]).map(r=><option key={r.id} value={r.id}>{r.name||r.id}</option>)}</select><small>{recipe?.description||"对当前 revision 运行 AI 配方"}</small>{latestAi?.document_id===docId&&<Badge status={latestAi.status}/>}<button className="primary" disabled={enqueueing||!health?.ai_configured} onClick={()=>void runAi()}>{enqueueing?"正在入队…":"✦ 加入 AI 队列"}</button></div>
          <nav className="tabs"><button className={pane==="content"?"active":""} onClick={()=>setPane("content")}>正文</button><button className={pane==="ai"?"active":""} onClick={()=>setPane("ai")}>AI 结果 <i>{results.length}</i></button><button className={pane==="meta"?"active":""} onClick={()=>setPane("meta")}>详情</button></nav>
          <div className="readerbody">{pane==="content"?<article>{doc.content_md||"（正文为空）"}</article>:pane==="ai"?<section className="results">{results.length?results.map(r=><article key={r.id}><header><div><span>{r.recipe_id}</span><b>{r.model||"default model"}</b><small>{time(r.created_at)}</small></div><button onClick={()=>void copy(r.content_md,"AI 结果已复制")} aria-label="复制 AI 结果">{G.copy}</button></header><p>{r.content_md}</p></article>):<Empty title="还没有 AI 结果" copy="加入后台队列后可以直接离开，完成后结果会自动出现。"/>}</section>:<section className="metadata">{[["Document ID",doc.document_id],["Revision",doc.revision_id],["Source / Type",`${doc.source} / ${doc.type}`],["Adapter",`${doc.adapter} · ${doc.adapter_version}`],["Collector",doc.collector],["Content hash",short(doc.content_hash,34)],["Captured",time(doc.captured_at)],["URL",doc.url]].map(([k,v])=><div key={k}><span>{k}</span><code>{v}</code>{(k==="Document ID"||k==="Revision")&&<button onClick={()=>void copy(v)}>{G.copy}</button>}</div>)}</section>}</div>
        </>}</section>
      </div>}

      {tab==="activity"&&<><section className="stats"><div><i className="peach">◌</i><span>采集处理中<b>{activeCapture}</b></span></div><div><i className="blue">◇</i><span>AI 运行中<b>{health?.ai_queue?.running||0}<small> / {health?.ai_queue?.concurrency||0}</small></b></span></div><div><i className="mauve">✦</i><span>AI 排队<b>{health?.ai_queue?.queued||0}</b></span></div><div className={failures?"danger":""}><i className="red">!</i><span>失败记录<b>{failures}</b></span></div></section>
        <nav className="lanes"><button className={lane==="capture"?"active":""} onClick={()=>setLane("capture")}>+ 采集队列 <i>{jobs.length}</i></button><button className={lane==="ai"?"active":""} onClick={()=>setLane("ai")}>✦ AI 队列 <i>{aiJobs.length}</i></button></nav>
        <div className="workspace activity">{lane==="capture"?<><aside className="surface tasks"><header>最近采集 <small>自动刷新</small></header><div>{jobs.length?jobs.map(j=><button key={j.id} className={jobId===j.id?"active":""} onClick={()=>setJobId(j.id)}><span><Badge status={j.status}/><small>{ago(j.updated_at)}</small></span><strong>{host(j.target.url)||short(j.id,20)}</strong><em>{j.target.url}</em></button>):<Empty title="没有采集任务" copy="新任务提交后会立即出现在这里。"/>}</div></aside><section className="surface taskdetail">{selectedJob?<TaskDetail job={selectedJob} openDoc={()=>{if(selectedJob.document_id){setDocId(selectedJob.document_id);setPane("content");setTab("library")}}}/>:<Empty title="选择一个采集任务" copy="这里会解释任务正在做什么，以及失败时发生了什么。"/>}</section></>:<><aside className="surface tasks"><header>AI jobs <small>并发 {health?.ai_queue?.concurrency||0}</small></header><div>{aiJobs.length?aiJobs.map(j=><button key={j.id} className={aiJobId===j.id?"active":""} onClick={()=>setAiJobId(j.id)}><span><Badge status={j.status}/><small>{ago(j.updated_at||j.created_at)}</small></span><strong>{docMap.get(j.document_id)?.title||short(j.document_id,20)}</strong><em>{j.recipe_id} · {j.model||"default model"}</em></button>):<Empty title="AI 队列为空" copy="在任意文档里选择配方并加入队列。"/>}</div></aside><section className="surface taskdetail">{selectedAi?<AiDetail job={selectedAi} title={docMap.get(selectedAi.document_id)?.title} openDoc={()=>{setDocId(selectedAi.document_id);setPane(selectedAi.status==="done"?"ai":"content");setTab("library")}}/>:<Empty title="选择一个 AI 任务" copy="查看它绑定的 revision、重试次数与结果状态。"/>}</section></>}</div>
      </>}

      {tab==="capture"&&<section className="capturepage"><div className="surface capturehero"><div><i>+</i><small>MANUAL FALLBACK</small><h2>把一个 URL 放进采集队列</h2><p>提交后立即返回，不需要盯着页面等待；固定并发的 workers 会在后台处理。</p></div><form onSubmit={(e:FormEvent<HTMLFormElement>)=>void capture(e)}><label>网页地址</label><section><div><span>https://</span><input value={url} onChange={(e:ChangeEvent<HTMLInputElement>)=>setUrl(e.target.value)} placeholder="example.com/article" autoFocus/></div><button className="primary" disabled={capturing||!url.trim()}>{capturing?"正在提交…":"+ 加入队列"}</button></section><small>可直接输入域名，也支持完整 https:// 与开发环境 fake://。</small></form></div><div className="methods"><Method mark="✦" title="Browser Snapshot" badge="推荐" text="直接采集你正在看的真实 DOM。登录态、SPA、已展开内容都能保留下来。" foot="Alt + Shift + C"/><Method mark="◌" title="URL Fallback" text="由本地 OpenCLI worker 重新访问，适合公开网页、补录和自动化入口。" foot={`Capture workers · ${health?.capture_concurrency||0}`}/><Method mark="◇" title="AI 后台处理" text="采集与 AI 是独立队列。关闭标签页不会中断已经持久化的任务。" foot={`AI workers · ${health?.ai_queue?.concurrency||0}`}/></div></section>}
    </main>

    <aside className="toasts">{toasts.map(t=><div key={t.id} className={t.tone}><b>{t.tone==="ok"?"✓":t.tone==="err"?"!":"✦"}</b><span>{t.text}</span><button onClick={()=>setToasts(x=>x.filter(v=>v.id!==t.id))}>×</button></div>)}</aside>
  </div>
}

function TaskDetail({job,openDoc}:{job:Job;openDoc:()=>void}){return <div className="detail"><header><div><Badge status={job.status}/><h2>{host(job.target.url)||"Capture job"}</h2><a href={job.target.url} target="_blank" rel="noreferrer">{job.target.url}</a></div><code>{short(job.id,22)}</code></header><section className="facts"><div><span>Adapter</span><b>{job.adapter||"等待规划"}</b></div><div><span>Collector</span><b>{job.collector||"—"}</b></div><div><span>Updated</span><b>{time(job.updated_at)}</b></div></section>{job.error_code&&<p className="error"><b>!</b><span><strong>{job.error_code}</strong>{job.error_message||"任务执行失败"}</span></p>}{job.document_id&&<button className="secondary" onClick={openDoc}>▤ 打开已保存文档</button>}<h3>执行轨迹</h3><ol>{(job.trace||[]).map((s,i)=><li key={`${s}-${i}`}><i>{i+1}</i><span><code>{s}</code>{i===(job.trace?.length||0)-1&&<small>最新状态</small>}</span></li>)}</ol></div>}
function AiDetail({job,title,openDoc}:{job:AIJob;title?:string;openDoc:()=>void}){return <div className="detail"><header><div><Badge status={job.status}/><h2>{title||"AI job"}</h2><span>{job.recipe_id} · {job.model||"default model"}</span></div><code>{short(job.id,22)}</code></header>{!TERMINAL.has(job.status)&&<div className={`progress ${job.status==="running"?"run":""}`}><i/></div>}<section className="facts four"><div><span>Attempts</span><b>{job.attempts} / {job.max_attempts}</b></div><div><span>Recipe</span><b>{job.recipe_id}</b></div><div><span>Created</span><b>{ago(job.created_at)}</b></div><div><span>Revision</span><code>{short(job.revision_id,18)}</code></div></section>{job.error_message&&<p className="error"><b>!</b><span><strong>AI request failed</strong>{job.error_message}</span></p>}<button className="secondary" onClick={openDoc}>▤ 打开关联文档</button><section className="ids"><div>Document <code>{job.document_id}</code></div><div>Revision <code>{job.revision_id}</code></div>{job.response_id&&<div>Response <code>{job.response_id}</code></div>}</section></div>}
function Method({mark,title,badge,text,foot}:{mark:string;title:string;badge?:string;text:string;foot:string}){return <article className="surface method"><header><i>{mark}</i>{badge&&<span>{badge}</span>}</header><h3>{title}</h3><p>{text}</p><footer>{foot}</footer></article>}
