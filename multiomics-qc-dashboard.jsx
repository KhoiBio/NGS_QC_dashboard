import { useState, useEffect, useRef } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LineChart, Line,
  ScatterChart, Scatter, CartesianGrid, Legend, ReferenceLine
} from "recharts";

// ── Palette & helpers ─────────────────────────────────────────────────────────
const PALETTE = {
  bg: "#0a0e1a",
  panel: "#0f1629",
  border: "#1e2d4a",
  accent: "#00d4ff",
  green: "#00ffaa",
  orange: "#ff8c42",
  red: "#ff4d6d",
  purple: "#b48aff",
  yellow: "#ffd166",
  muted: "#4a6080",
  text: "#cce0ff",
  textDim: "#5a7ca0",
};

const ASSAY_COLORS = {
  "RNA-seq":    "#00d4ff",
  "scRNA-seq":  "#00ffaa",
  "ATAC-seq":   "#b48aff",
  "scATAC-seq": "#ffd166",
  "ChIP-seq":   "#ff8c42",
  "Cut&Run":    "#ff4d6d",
  "WGBS":       "#7eb8ff",
  "WGS":        "#c084fc",
};

const statusColor = (v, lo, hi) =>
  v >= hi ? PALETTE.green : v >= lo ? PALETTE.yellow : PALETTE.red;

// ── Mock data ─────────────────────────────────────────────────────────────────
const PROJECTS = [
  { id: "GBM-2024", name: "Glioblastoma Radioresistance", pi: "Dr. Nakamura", assays: ["scRNA-seq","scATAC-seq"], samples: 24, status: "running" },
  { id: "BRCA-001", name: "BRCA TNBC Epigenome", pi: "Dr. Chen", assays: ["ChIP-seq","ATAC-seq","RNA-seq"], samples: 36, status: "complete" },
  { id: "LUAD-007", name: "Lung Adenocarcinoma WGS", pi: "Dr. Patel", assays: ["WGS","RNA-seq"], samples: 18, status: "qc" },
  { id: "AML-003",  name: "AML Cut&Run Profiling", pi: "Dr. Torres", assays: ["Cut&Run","RNA-seq"], samples: 12, status: "pending" },
];

const PIPELINE_STEPS = {
  "RNA-seq":    ["FastQC","Trim Galore","STAR","featureCounts","DESeq2","Pathway"],
  "scRNA-seq":  ["FastQC","STARsolo","CellRanger","Seurat","DoubletFinder","Annotation"],
  "ATAC-seq":   ["FastQC","Trim Galore","Bowtie2","Samtools","MACS3","deepTools"],
  "scATAC-seq": ["FastQC","Trim Galore","BWA","ArchR","Peak Calling","TF Motifs"],
  "ChIP-seq":   ["FastQC","Trim Galore","Bowtie2","Samtools","MACS3","HOMER"],
  "Cut&Run":    ["FastQC","Trimmomatic","Bowtie2","SEACR","deepTools","Motifs"],
  "WGS":        ["FastQC","Trim Galore","BWA-MEM2","GATK","Mutect2","Annotation"],
  "WGBS":       ["FastQC","Trim Galore","Bismark","MethylDackel","DMRfinder","Viz"],
};

const generateSamples = () =>
  Array.from({ length: 8 }, (_, i) => {
    const pass = Math.random() > 0.2;
    return {
      id: `S${String(i + 1).padStart(2, "0")}`,
      reads: +(15 + Math.random() * 35).toFixed(1),
      mapped: +(pass ? 85 + Math.random() * 12 : 55 + Math.random() * 20).toFixed(1),
      dup: +(pass ? 5 + Math.random() * 20 : 35 + Math.random() * 30).toFixed(1),
      q30: +(pass ? 80 + Math.random() * 18 : 50 + Math.random() * 25).toFixed(1),
      frip: +(pass ? 0.15 + Math.random() * 0.35 : 0.04 + Math.random() * 0.1).toFixed(3),
      tss: +(pass ? 6 + Math.random() * 10 : 2 + Math.random() * 3).toFixed(2),
      pass,
    };
  });

const AWS_ARCH = [
  { service: "S3", icon: "🪣", desc: "Raw FASTQs, BAMs, Peaks", color: "#ff8c42" },
  { service: "EC2/Spot", icon: "⚡", desc: "Pipeline execution nodes", color: "#00d4ff" },
  { service: "AWS Batch", icon: "🔄", desc: "Job queue & scheduling", color: "#b48aff" },
  { service: "Step Functions", icon: "🔗", desc: "Workflow orchestration", color: "#00ffaa" },
  { service: "RDS Aurora", icon: "🗄️", desc: "Project & sample metadata", color: "#ffd166" },
  { service: "CloudWatch", icon: "📊", desc: "Pipeline monitoring & alerts", color: "#ff4d6d" },
  { service: "Lambda", icon: "λ", desc: "QC triggers & notifications", color: "#7eb8ff" },
  { service: "CloudFront", icon: "🌐", desc: "Dashboard CDN delivery", color: "#c084fc" },
];

// ── Sub-components ─────────────────────────────────────────────────────────────
const Tag = ({ label, color }) => (
  <span style={{
    background: color + "22", color, border: `1px solid ${color}55`,
    borderRadius: 4, padding: "2px 8px", fontSize: 11, fontFamily: "monospace",
    letterSpacing: "0.05em",
  }}>{label}</span>
);

const StatCard = ({ label, value, unit, good, warn }) => {
  const numVal = parseFloat(value);
  const color = numVal >= good ? PALETTE.green : numVal >= warn ? PALETTE.yellow : PALETTE.red;
  return (
    <div style={{
      background: PALETTE.panel, border: `1px solid ${PALETTE.border}`,
      borderRadius: 8, padding: "14px 16px", flex: 1, minWidth: 120,
    }}>
      <div style={{ color: PALETTE.textDim, fontSize: 11, marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ color, fontSize: 26, fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>
        {value}<span style={{ fontSize: 13, marginLeft: 3, opacity: 0.7 }}>{unit}</span>
      </div>
    </div>
  );
};

const PipelineTracker = ({ steps, assay }) => {
  const [active, setActive] = useState(3);
  useEffect(() => {
    const t = setInterval(() => setActive(a => (a < steps.length ? a + 1 : a)), 1800);
    return () => clearInterval(t);
  }, [steps]);
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
      {steps.map((s, i) => {
        const done = i < active;
        const running = i === active - 1;
        return (
          <div key={s} style={{
            padding: "4px 10px", borderRadius: 4, fontSize: 11, fontFamily: "monospace",
            background: done ? PALETTE.accent + "22" : "#1a2535",
            border: `1px solid ${running ? PALETTE.accent : done ? PALETTE.accent + "44" : PALETTE.border}`,
            color: done ? PALETTE.accent : PALETTE.muted,
            position: "relative",
            boxShadow: running ? `0 0 8px ${PALETTE.accent}66` : "none",
          }}>
            {running && <span style={{ marginRight: 4, animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>}
            {done && !running && "✓ "}
            {s}
          </div>
        );
      })}
    </div>
  );
};

const RadarSample = ({ sample }) => {
  const data = [
    { metric: "Mapped%", value: sample.mapped, full: 100 },
    { metric: "Q30%", value: sample.q30, full: 100 },
    { metric: "Low Dup", value: 100 - sample.dup, full: 100 },
    { metric: "Reads(M)", value: Math.min(sample.reads * 2, 100), full: 100 },
    { metric: "FRiP×100", value: Math.min(sample.frip * 200, 100), full: 100 },
    { metric: "TSS Score", value: Math.min(sample.tss * 7, 100), full: 100 },
  ];
  return (
    <ResponsiveContainer width="100%" height={200}>
      <RadarChart data={data}>
        <PolarGrid stroke={PALETTE.border} />
        <PolarAngleAxis dataKey="metric" tick={{ fill: PALETTE.textDim, fontSize: 10 }} />
        <Radar dataKey="value" stroke={sample.pass ? PALETTE.green : PALETTE.red}
          fill={sample.pass ? PALETTE.green : PALETTE.red} fillOpacity={0.15} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  );
};

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function MultiOmicsQCDashboard() {
  const [activeProject, setActiveProject] = useState(PROJECTS[0]);
  const [activeAssay, setActiveAssay] = useState("scRNA-seq");
  const [samples] = useState(generateSamples);
  const [selectedSample, setSelectedSample] = useState(null);
  const [tab, setTab] = useState("overview"); // overview | pipeline | aws | samples

  const passCount = samples.filter(s => s.pass).length;

  const assayColors = ASSAY_COLORS;

  return (
    <div style={{
      background: PALETTE.bg, color: PALETTE.text, minHeight: "100vh",
      fontFamily: "'IBM Plex Sans', 'Helvetica Neue', sans-serif",
      fontSize: 13,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #1e2d4a; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
      `}</style>

      {/* Header */}
      <div style={{
        background: PALETTE.panel, borderBottom: `1px solid ${PALETTE.border}`,
        padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 56,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 6,
            background: `linear-gradient(135deg, ${PALETTE.accent}, ${PALETTE.purple})`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
          }}>🧬</div>
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", color: PALETTE.accent, fontSize: 13, fontWeight: 700, letterSpacing: "0.05em" }}>
              BiNGS · QC Dashboard
            </div>
            <div style={{ color: PALETTE.textDim, fontSize: 10, letterSpacing: "0.08em" }}>MULTI-OMICS QUALITY CONTROL · AWS-POWERED</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: PALETTE.green, animation: "pulse 2s infinite" }} />
            <span style={{ color: PALETTE.green, fontSize: 11, fontFamily: "monospace" }}>LIVE · us-east-1</span>
          </div>
          <Tag label="AWS Batch" color={PALETTE.accent} />
          <Tag label="S3 Connected" color={PALETTE.green} />
        </div>
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 56px)" }}>

        {/* Sidebar - Projects */}
        <div style={{
          width: 220, background: PALETTE.panel, borderRight: `1px solid ${PALETTE.border}`,
          padding: "16px 12px", display: "flex", flexDirection: "column", gap: 4, overflowY: "auto",
          flexShrink: 0,
        }}>
          <div style={{ color: PALETTE.textDim, fontSize: 10, letterSpacing: "0.12em", marginBottom: 8, paddingLeft: 4 }}>
            ACTIVE PROJECTS
          </div>
          {PROJECTS.map(p => (
            <div key={p.id} onClick={() => { setActiveProject(p); setActiveAssay(p.assays[0]); }}
              style={{
                padding: "10px 12px", borderRadius: 6, cursor: "pointer",
                background: activeProject.id === p.id ? PALETTE.accent + "18" : "transparent",
                border: `1px solid ${activeProject.id === p.id ? PALETTE.accent + "55" : "transparent"}`,
                transition: "all 0.15s",
              }}>
              <div style={{ color: activeProject.id === p.id ? PALETTE.accent : PALETTE.text, fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
                {p.name}
              </div>
              <div style={{ color: PALETTE.textDim, fontSize: 10, marginBottom: 6 }}>{p.pi} · {p.samples} samples</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {p.assays.map(a => (
                  <span key={a} style={{
                    background: assayColors[a] + "22", color: assayColors[a],
                    borderRadius: 3, padding: "1px 5px", fontSize: 9, fontFamily: "monospace",
                  }}>{a}</span>
                ))}
              </div>
              <div style={{ marginTop: 6 }}>
                <span style={{
                  fontSize: 9, padding: "2px 6px", borderRadius: 3,
                  background: p.status === "complete" ? PALETTE.green + "22" : p.status === "running" ? PALETTE.accent + "22" : p.status === "qc" ? PALETTE.yellow + "22" : "#ffffff11",
                  color: p.status === "complete" ? PALETTE.green : p.status === "running" ? PALETTE.accent : p.status === "qc" ? PALETTE.yellow : PALETTE.muted,
                }}>● {p.status.toUpperCase()}</span>
              </div>
            </div>
          ))}

          <div style={{ marginTop: "auto", padding: "12px 4px", borderTop: `1px solid ${PALETTE.border}` }}>
            <div style={{ color: PALETTE.textDim, fontSize: 10, letterSpacing: "0.08em", marginBottom: 8 }}>COST MONITOR</div>
            {[["Compute","$42.80"],["Storage","$12.34"],["Transfer","$3.21"]].map(([k,v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: PALETTE.textDim, fontSize: 11 }}>{k}</span>
                <span style={{ color: PALETTE.yellow, fontFamily: "monospace", fontSize: 11 }}>{v}</span>
              </div>
            ))}
            <div style={{ marginTop: 8, padding: "6px 8px", background: PALETTE.green + "11", border: `1px solid ${PALETTE.green}33`, borderRadius: 4 }}>
              <div style={{ color: PALETTE.green, fontSize: 10 }}>💡 Spot savings: ~72%</div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Project header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, color: PALETTE.text, marginBottom: 4 }}>
                {activeProject.name}
              </div>
              <div style={{ color: PALETTE.textDim, fontSize: 11 }}>{activeProject.pi} · Project ID: {activeProject.id}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {["overview","samples","pipeline","aws"].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: "6px 14px", borderRadius: 4, border: `1px solid ${tab === t ? PALETTE.accent : PALETTE.border}`,
                  background: tab === t ? PALETTE.accent + "22" : "transparent",
                  color: tab === t ? PALETTE.accent : PALETTE.muted, cursor: "pointer",
                  fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em",
                  fontFamily: "'IBM Plex Sans', sans-serif",
                }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Assay tabs */}
          <div style={{ display: "flex", gap: 6 }}>
            {activeProject.assays.map(a => (
              <button key={a} onClick={() => setActiveAssay(a)} style={{
                padding: "5px 14px", borderRadius: 20, border: `1px solid ${activeAssay === a ? assayColors[a] : PALETTE.border}`,
                background: activeAssay === a ? assayColors[a] + "22" : "transparent",
                color: activeAssay === a ? assayColors[a] : PALETTE.muted,
                cursor: "pointer", fontSize: 11, fontFamily: "monospace",
              }}>{a}</button>
            ))}
          </div>

          {/* ── OVERVIEW TAB ── */}
          {tab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "fadeIn 0.3s ease" }}>
              {/* Stat cards */}
              <div style={{ display: "flex", gap: 10 }}>
                <StatCard label="Avg Mapped" value={(samples.reduce((a,s)=>a+s.mapped,0)/samples.length).toFixed(1)} unit="%" good={85} warn={70} />
                <StatCard label="Avg Q30" value={(samples.reduce((a,s)=>a+s.q30,0)/samples.length).toFixed(1)} unit="%" good={80} warn={65} />
                <StatCard label="Avg Duplication" value={(samples.reduce((a,s)=>a+s.dup,0)/samples.length).toFixed(1)} unit="%" good={90} warn={75} />
                <StatCard label="Samples Pass" value={passCount} unit={`/ ${samples.length}`} good={samples.length} warn={samples.length * 0.7} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {/* Mapping rate bar chart */}
                <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: 16 }}>
                  <div style={{ color: PALETTE.textDim, fontSize: 11, letterSpacing: "0.08em", marginBottom: 12 }}>ALIGNMENT RATE PER SAMPLE</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={samples} barSize={18}>
                      <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} vertical={false} />
                      <XAxis dataKey="id" tick={{ fill: PALETTE.muted, fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fill: PALETTE.muted, fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: "#0f1629", border: `1px solid ${PALETTE.border}`, borderRadius: 6, color: PALETTE.text, fontSize: 11 }} />
                      <ReferenceLine y={85} stroke={PALETTE.green} strokeDasharray="4 4" />
                      <Bar dataKey="mapped" radius={[3,3,0,0]}>
                        {samples.map((s, i) => <Cell key={i} fill={s.pass ? PALETTE.accent : PALETTE.red} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ color: PALETTE.textDim, fontSize: 10, marginTop: 6 }}>— Dashed line: 85% threshold (Bowtie2 / STAR)</div>
                </div>

                {/* Duplication vs Q30 scatter */}
                <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: 16 }}>
                  <div style={{ color: PALETTE.textDim, fontSize: 11, letterSpacing: "0.08em", marginBottom: 12 }}>DUPLICATION vs Q30 QUALITY</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} />
                      <XAxis dataKey="dup" name="Duplication%" tick={{ fill: PALETTE.muted, fontSize: 10 }} label={{ value: "Dup%", position: "insideBottom", fill: PALETTE.muted, fontSize: 10, dy: 10 }} />
                      <YAxis dataKey="q30" name="Q30%" tick={{ fill: PALETTE.muted, fontSize: 10 }} />
                      <Tooltip cursor={{ stroke: PALETTE.border }} contentStyle={{ background: "#0f1629", border: `1px solid ${PALETTE.border}`, borderRadius: 6, color: PALETTE.text, fontSize: 11 }}
                        formatter={(v, n) => [v + (n.includes("Q30") ? "%" : "%"), n]} />
                      <Scatter data={samples} shape={(props) => {
                        const { cx, cy, payload } = props;
                        return <circle cx={cx} cy={cy} r={6} fill={payload.pass ? PALETTE.green : PALETTE.red} fillOpacity={0.8} />;
                      }} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>

                {/* TSS enrichment */}
                <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: 16 }}>
                  <div style={{ color: PALETTE.textDim, fontSize: 11, letterSpacing: "0.08em", marginBottom: 12 }}>TSS ENRICHMENT SCORE ({activeAssay})</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={samples} barSize={18}>
                      <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} vertical={false} />
                      <XAxis dataKey="id" tick={{ fill: PALETTE.muted, fontSize: 10 }} />
                      <YAxis tick={{ fill: PALETTE.muted, fontSize: 10 }} />
                      <ReferenceLine y={6} stroke={PALETTE.purple} strokeDasharray="4 4" />
                      <Tooltip contentStyle={{ background: "#0f1629", border: `1px solid ${PALETTE.border}`, borderRadius: 6, color: PALETTE.text, fontSize: 11 }} />
                      <Bar dataKey="tss" radius={[3,3,0,0]}>
                        {samples.map((s,i) => <Cell key={i} fill={s.tss >= 6 ? PALETTE.purple : PALETTE.orange} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ color: PALETTE.textDim, fontSize: 10, marginTop: 6 }}>— ENCODE threshold: TSS ≥ 6 (ATAC/scATAC) · deepTools bamCompare</div>
                </div>

                {/* FRiP score */}
                <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: 16 }}>
                  <div style={{ color: PALETTE.textDim, fontSize: 11, letterSpacing: "0.08em", marginBottom: 12 }}>FRiP SCORE (Fraction Reads in Peaks)</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={samples} barSize={18}>
                      <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} vertical={false} />
                      <XAxis dataKey="id" tick={{ fill: PALETTE.muted, fontSize: 10 }} />
                      <YAxis tick={{ fill: PALETTE.muted, fontSize: 10 }} />
                      <ReferenceLine y={0.15} stroke={PALETTE.yellow} strokeDasharray="4 4" />
                      <Tooltip contentStyle={{ background: "#0f1629", border: `1px solid ${PALETTE.border}`, borderRadius: 6, color: PALETTE.text, fontSize: 11 }} />
                      <Bar dataKey="frip" radius={[3,3,0,0]}>
                        {samples.map((s,i) => <Cell key={i} fill={s.frip >= 0.15 ? PALETTE.yellow : PALETTE.red} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ color: PALETTE.textDim, fontSize: 10, marginTop: 6 }}>— ENCODE threshold: FRiP ≥ 0.15 · MACS3 peaks</div>
                </div>
              </div>
            </div>
          )}

          {/* ── SAMPLES TAB ── */}
          {tab === "samples" && (
            <div style={{ display: "flex", gap: 14, animation: "fadeIn 0.3s ease" }}>
              <div style={{ flex: 1, background: PALETTE.panel, border: `1px solid ${PALETTE.border}`, borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                      {["Sample","Reads (M)","Mapped %","Dup %","Q30 %","FRiP","TSS","Status"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: PALETTE.textDim, fontSize: 10, letterSpacing: "0.08em", fontWeight: 400 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {samples.map(s => (
                      <tr key={s.id} onClick={() => setSelectedSample(s)}
                        style={{
                          borderBottom: `1px solid ${PALETTE.border}`, cursor: "pointer",
                          background: selectedSample?.id === s.id ? PALETTE.accent + "11" : "transparent",
                          transition: "background 0.1s",
                        }}>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", color: PALETTE.accent }}>{s.id}</td>
                        <td style={{ padding: "10px 14px", color: statusColor(s.reads, 20, 30) }}>{s.reads}</td>
                        <td style={{ padding: "10px 14px", color: statusColor(s.mapped, 70, 85) }}>{s.mapped}%</td>
                        <td style={{ padding: "10px 14px", color: statusColor(100-s.dup, 70, 85) }}>{s.dup}%</td>
                        <td style={{ padding: "10px 14px", color: statusColor(s.q30, 65, 80) }}>{s.q30}%</td>
                        <td style={{ padding: "10px 14px", color: statusColor(s.frip, 0.05, 0.15) }}>{s.frip}</td>
                        <td style={{ padding: "10px 14px", color: statusColor(s.tss, 3, 6) }}>{s.tss}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{
                            padding: "2px 8px", borderRadius: 3, fontSize: 10, fontFamily: "monospace",
                            background: s.pass ? PALETTE.green + "22" : PALETTE.red + "22",
                            color: s.pass ? PALETTE.green : PALETTE.red,
                          }}>{s.pass ? "PASS" : "FAIL"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedSample && (
                <div style={{ width: 260, background: PALETTE.panel, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: 16, flexShrink: 0 }}>
                  <div style={{ fontFamily: "monospace", color: PALETTE.accent, fontSize: 14, marginBottom: 4 }}>Sample {selectedSample.id}</div>
                  <div style={{ color: PALETTE.textDim, fontSize: 10, marginBottom: 12 }}>QC Radar Profile</div>
                  <RadarSample sample={selectedSample} />
                  <div style={{ color: PALETTE.textDim, fontSize: 10, marginTop: 8, lineHeight: 1.6 }}>
                    {selectedSample.pass
                      ? "✅ Sample passes all ENCODE QC thresholds. Ready for downstream analysis."
                      : "⚠️ Sample fails one or more QC metrics. Review alignment logs and consider re-sequencing."}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PIPELINE TAB ── */}
          {tab === "pipeline" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, animation: "fadeIn 0.3s ease" }}>
              {activeProject.assays.map(assay => (
                <div key={assay} style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{ background: assayColors[assay] + "22", color: assayColors[assay], borderRadius: 4, padding: "3px 10px", fontSize: 11, fontFamily: "monospace" }}>{assay}</span>
                    <span style={{ color: PALETTE.textDim, fontSize: 11 }}>Automated pipeline · AWS Batch · Snakemake</span>
                  </div>
                  <PipelineTracker steps={PIPELINE_STEPS[assay] || []} assay={assay} />
                </div>
              ))}

              <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: 16 }}>
                <div style={{ color: PALETTE.textDim, fontSize: 11, letterSpacing: "0.08em", marginBottom: 12 }}>RESOURCE UTILIZATION · LIVE</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  {[["vCPUs Active","48 / 96",PALETTE.accent],["Memory Used","312 GB",PALETTE.purple],["Jobs Queued","7",PALETTE.yellow],["S3 Writes","2.3 TB",PALETTE.green]].map(([l,v,c]) => (
                    <div key={l} style={{ background: "#0a0e1a", borderRadius: 6, padding: 12, border: `1px solid ${PALETTE.border}` }}>
                      <div style={{ color: PALETTE.textDim, fontSize: 10, marginBottom: 6 }}>{l}</div>
                      <div style={{ fontFamily: "monospace", color: c, fontSize: 18, fontWeight: 700 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── AWS TAB ── */}
          {tab === "aws" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "fadeIn 0.3s ease" }}>
              <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: 16 }}>
                <div style={{ color: PALETTE.textDim, fontSize: 11, letterSpacing: "0.08em", marginBottom: 14 }}>CLOUD ARCHITECTURE · BiNGS INFRASTRUCTURE</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  {AWS_ARCH.map(({ service, icon, desc, color }) => (
                    <div key={service} style={{
                      background: "#0a0e1a", border: `1px solid ${color}33`, borderRadius: 8,
                      padding: 14, transition: "border-color 0.2s", cursor: "default",
                    }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = color + "88"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = color + "33"}>
                      <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
                      <div style={{ color, fontFamily: "monospace", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{service}</div>
                      <div style={{ color: PALETTE.textDim, fontSize: 10, lineHeight: 1.5 }}>{desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: 16 }}>
                  <div style={{ color: PALETTE.textDim, fontSize: 11, letterSpacing: "0.08em", marginBottom: 12 }}>DAILY COMPUTE SPEND · USD</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={[
                      { day: "M", cost: 38 }, { day: "T", cost: 52 }, { day: "W", cost: 61 },
                      { day: "Th", cost: 44 }, { day: "F", cost: 58 }, { day: "Sa", cost: 23 },
                      { day: "Su", cost: 15 },
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} />
                      <XAxis dataKey="day" tick={{ fill: PALETTE.muted, fontSize: 10 }} />
                      <YAxis tick={{ fill: PALETTE.muted, fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: "#0f1629", border: `1px solid ${PALETTE.border}`, borderRadius: 6, color: PALETTE.text, fontSize: 11 }} />
                      <Line type="monotone" dataKey="cost" stroke={PALETTE.accent} strokeWidth={2} dot={{ fill: PALETTE.accent, r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: 16 }}>
                  <div style={{ color: PALETTE.textDim, fontSize: 11, letterSpacing: "0.08em", marginBottom: 12 }}>S3 STORAGE BREAKDOWN</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    {[["Raw FASTQs","4.2 TB",0.72],["BAM Files","2.8 TB",0.48],["Peak Calls","120 GB",0.02],["Results/Reports","340 GB",0.06]].map(([l,v,f]) => (
                      <div key={l}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ color: PALETTE.textDim, fontSize: 11 }}>{l}</span>
                          <span style={{ fontFamily: "monospace", color: PALETTE.text, fontSize: 11 }}>{v}</span>
                        </div>
                        <div style={{ background: PALETTE.border, borderRadius: 2, height: 4 }}>
                          <div style={{ width: `${f * 100}%`, height: "100%", background: PALETTE.accent, borderRadius: 2, transition: "width 0.5s" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ background: "#0a1a0f", border: `1px solid ${PALETTE.green}33`, borderRadius: 8, padding: 16 }}>
                <div style={{ color: PALETTE.green, fontSize: 11, fontFamily: "monospace", marginBottom: 10 }}>$ aws batch submit-job --job-name GBM-2024-scATAC --job-queue bioinformatics-high-priority</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {["Snakemake Orchestration","Spot Instance Fleet","Auto-scaling Workers","S3 Lifecycle Policies","CloudWatch Alarms","IAM Role Isolation","VPC Private Subnet","Cost Budgets"].map(f => (
                    <span key={f} style={{ background: PALETTE.green + "15", color: PALETTE.green, border: `1px solid ${PALETTE.green}33`, borderRadius: 4, padding: "3px 10px", fontSize: 10, fontFamily: "monospace" }}>✓ {f}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
