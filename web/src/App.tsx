import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { AIResponse, ContentPacket, DocumentSummary, Health, Job, Recipe } from "./types";

type Tab = "jobs" | "library" | "capture";

function statusClass(status: string): string {
  if (status === "done") return "done";
  if (status === "failed" || status === "cancelled") return "failed";
  return "running";
}

function short(id?: string, n = 12): string {
  if (!id) return "—";
  return id.length > n ? `${id.slice(0, n)}…` : id;
}

function fmtTime(v?: string): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>("library");
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );

  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [docDetail, setDocDetail] = useState<ContentPacket | null>(null);
  const [aiList, setAiList] = useState<AIResponse[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeId, setRecipeId] = useState("summarize");
  const [aiJobMsg, setAiJobMsg] = useState("");

  const [captureUrl, setCaptureUrl] = useState("fake://hub-ui-demo");
  const [captureMsg, setCaptureMsg] = useState("");

  const refreshHealth = useCallback(async () => {
    try {
      const h = await api.health();
      setHealth(h);
    } catch (e) {
      setHealth(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    const list = await api.listJobs(80);
    setJobs(list);
    if (!selectedJobId && list[0]) setSelectedJobId(list[0].id);
  }, [selectedJobId]);

  const refreshDocs = useCallback(async () => {
    const list = await api.listDocs(80);
    setDocs(list);
    if (!selectedDocId && list[0]) setSelectedDocId(list[0].document_id);
  }, [selectedDocId]);

  const loadDoc = useCallback(async (id: string) => {
    if (!id) {
      setDocDetail(null);
      setAiList([]);
      return;
    }
    const [doc, ais] = await Promise.all([api.getDoc(id), api.listDocAi(id)]);
    setDocDetail(doc);
    setAiList(ais);
  }, []);

  const refreshAll = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      await refreshHealth();
      await Promise.all([refreshJobs(), refreshDocs(), api.listRecipes().then(setRecipes).catch(() => setRecipes([]))]);
      if (selectedDocId) await loadDoc(selectedDocId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [loadDoc, refreshDocs, refreshHealth, refreshJobs, selectedDocId]);

  useEffect(() => {
    void refreshAll();
    const t = setInterval(() => {
      void refreshHealth();
      if (tab === "jobs") void refreshJobs().catch(() => undefined);
    }, 4000);
    return () => clearInterval(t);
  }, [refreshAll, refreshHealth, refreshJobs, tab]);

  useEffect(() => {
    if (tab === "library" && selectedDocId) {
      void loadDoc(selectedDocId).catch((e) => setError(String(e.message || e)));
    }
  }, [tab, selectedDocId, loadDoc]);

  async function onCapture() {
    setCaptureMsg("");
    setError("");
    setBusy(true);
    try {
      const job = await api.createJob(captureUrl.trim());
      setCaptureMsg(`queued ${job.id}`);
      setTab("jobs");
      setSelectedJobId(job.id);
      await refreshJobs();
      // light poll
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 400));
        const j = await api.getJob(job.id);
        await refreshJobs();
        if (j.status === "done" || j.status === "failed" || j.status === "cancelled") {
          setCaptureMsg(`${j.status} · doc=${j.document_id || "—"}`);
          if (j.document_id) {
            await refreshDocs();
            setSelectedDocId(j.document_id);
          }
          break;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRunAi() {
    if (!selectedDocId) return;
    setBusy(true);
    setError("");
    setAiJobMsg("");
    try {
      const job = await api.enqueueAi(selectedDocId, recipeId);
      setAiJobMsg(`${job.status} · ${job.id} · attempts ${job.attempts}/${job.max_attempts}`);
      await refreshHealth();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <h1>Capture Flow</h1>
          <p>Browser DOM · Durable Queue · AI Workers</p>
        </div>
        <nav className="nav">
          <button className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}>
            Library
          </button>
          <button className={tab === "jobs" ? "active" : ""} onClick={() => setTab("jobs")}>
            Jobs
          </button>
          <button className={tab === "capture" ? "active" : ""} onClick={() => setTab("capture")}>
            Capture
          </button>
        </nav>
        <div className={`health ${health ? "ok" : "bad"}`}>
          {health
            ? health.ai_queue
              ? `hub ok · ai ${health.ai_configured ? "on" : "off"} · running ${health.ai_queue.running}/${health.ai_queue.concurrency} · queued ${health.ai_queue.queued}`
              : `hub ok · ai ${health.ai_configured ? "on" : "off"}`
            : "hub offline · start go run ./cmd/hub"}
        </div>
      </aside>

      <main className="main">
        <div className="toolbar">
          <h2>
            {tab === "library" && "Library"}
            {tab === "jobs" && "Jobs"}
            {tab === "capture" && "Capture"}
          </h2>
          <button className="ghost" onClick={() => void refreshAll()} disabled={busy}>
            Refresh
          </button>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}

        {tab === "capture" && (
          <section className="panel" style={{ padding: 16 }}>
            <p style={{ color: "var(--muted)", marginTop: 0 }}>
              提交 URL 到本机 Hub。知乎请用回答链接；开发可用 <code>fake://…</code>。
            </p>
            <div className="toolbar">
              <div className="grow">
                <input
                  type="url"
                  value={captureUrl}
                  onChange={(e) => setCaptureUrl(e.target.value)}
                  placeholder="https://… or fake://demo"
                />
              </div>
              <button className="primary" disabled={busy || !captureUrl.trim()} onClick={() => void onCapture()}>
                Capture
              </button>
            </div>
            {captureMsg ? <div className="pre">{captureMsg}</div> : null}
          </section>
        )}

        {tab === "jobs" && (
          <div className="grid">
            <section className="panel">
              <div className="panel-head">Recent jobs ({jobs.length})</div>
              <div className="list">
                {jobs.length === 0 ? (
                  <div className="empty">暂无 Job。去 Capture 提交一个 URL。</div>
                ) : (
                  jobs.map((j) => (
                    <button
                      key={j.id}
                      className={`item ${selectedJobId === j.id ? "active" : ""}`}
                      onClick={() => setSelectedJobId(j.id)}
                    >
                      <div className="title">
                        <span className={`badge ${statusClass(j.status)}`}>{j.status}</span>
                        {short(j.id, 18)}
                      </div>
                      <div className="meta">{j.target.url}</div>
                      <div className="meta">{fmtTime(j.updated_at)}</div>
                    </button>
                  ))
                )}
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">Job detail</div>
              <div className="detail">
                {!selectedJob ? (
                  <div className="empty">选择左侧 Job</div>
                ) : (
                  <>
                    <h3>{selectedJob.id}</h3>
                    <div className="kv">
                      <span>status</span>
                      <span className={`badge ${statusClass(selectedJob.status)}`}>{selectedJob.status}</span>
                      <span>url</span>
                      <span>{selectedJob.target.url}</span>
                      <span>adapter</span>
                      <span>{selectedJob.adapter || "—"}</span>
                      <span>collector</span>
                      <span>{selectedJob.collector || "—"}</span>
                      <span>document</span>
                      <span>
                        {selectedJob.document_id ? (
                          <button
                            className="ghost"
                            onClick={() => {
                              setSelectedDocId(selectedJob.document_id!);
                              setTab("library");
                            }}
                          >
                            {selectedJob.document_id}
                          </button>
                        ) : (
                          "—"
                        )}
                      </span>
                      <span>error</span>
                      <span>
                        {selectedJob.error_code
                          ? `${selectedJob.error_code} ${selectedJob.error_message || ""}`
                          : "—"}
                      </span>
                      <span>updated</span>
                      <span>{fmtTime(selectedJob.updated_at)}</span>
                    </div>
                    <div className="pre">{(selectedJob.trace || []).join(" → ") || "(no trace)"}</div>
                  </>
                )}
              </div>
            </section>
          </div>
        )}

        {tab === "library" && (
          <div className="grid">
            <section className="panel">
              <div className="panel-head">Documents ({docs.length})</div>
              <div className="list">
                {docs.length === 0 ? (
                  <div className="empty">Library 为空。先捕获内容。</div>
                ) : (
                  docs.map((d) => (
                    <button
                      key={d.document_id}
                      className={`item ${selectedDocId === d.document_id ? "active" : ""}`}
                      onClick={() => setSelectedDocId(d.document_id)}
                    >
                      <div className="title">{d.title || d.document_id}</div>
                      <div className="meta">
                        <span className="badge">{d.source}</span>
                        <span className="badge">{d.adapter}</span>
                        {d.author || "—"}
                      </div>
                      <div className="meta">{d.url}</div>
                    </button>
                  ))
                )}
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">Document + AI</div>
              <div className="detail">
                {!docDetail ? (
                  <div className="empty">选择左侧文档</div>
                ) : (
                  <>
                    <h3>{docDetail.title || docDetail.document_id}</h3>
                    <div className="kv">
                      <span>document_id</span>
                      <span>{docDetail.document_id}</span>
                      <span>revision</span>
                      <span>{docDetail.revision_id}</span>
                      <span>source / type</span>
                      <span>
                        {docDetail.source} / {docDetail.type}
                      </span>
                      <span>adapter</span>
                      <span>
                        {docDetail.adapter} · {docDetail.collector}
                      </span>
                      <span>author</span>
                      <span>{docDetail.author || "—"}</span>
                      <span>url</span>
                      <span>
                        <a href={docDetail.url} target="_blank" rel="noreferrer">
                          {docDetail.url}
                        </a>
                      </span>
                      <span>hash</span>
                      <span>{short(docDetail.content_hash, 28)}</span>
                    </div>

                    <div className="row-actions">
                      <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
                        {(recipes.length ? recipes : [{ id: "summarize", name: "summarize" }]).map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name || r.id}
                          </option>
                        ))}
                      </select>
                      <button className="primary" disabled={busy} onClick={() => void onRunAi()}>
                        Queue AI
                      </button>
                    </div>
                    {aiJobMsg ? <div className="pre">AI queue: {aiJobMsg}</div> : null}

                    <h4 style={{ margin: "8px 0" }}>Content</h4>
                    <div className="pre">{docDetail.content_md || "(empty)"}</div>

                    <h4 style={{ margin: "16px 0 8px" }}>AI responses ({aiList.length})</h4>
                    {aiList.length === 0 ? (
                      <div className="empty" style={{ padding: 12 }}>
                        尚无 AI 结果
                      </div>
                    ) : (
                      aiList.map((a) => (
                        <article key={a.id} className="ai-card">
                          <h4>
                            {a.recipe_id} · {a.model} · {fmtTime(a.created_at)}
                          </h4>
                          <div className="meta" style={{ color: "var(--muted)", fontSize: 11, marginBottom: 6 }}>
                            {a.id}
                          </div>
                          <div className="pre">{a.content_md}</div>
                        </article>
                      ))
                    )}
                  </>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
