import { trpc } from "@/lib/trpc";
import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Download, Play, Pause, RotateCcw, CheckCircle2,
  AlertCircle, Loader2, Music2, Wand2, BarChart3, ChevronDown, ChevronUp
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { toast } from "sonner";

type JobStatus = "pending" | "uploading" | "analyzing" | "processing" | "exporting" | "done" | "error";

const STAGES: { status: JobStatus; label: string; desc: string }[] = [
  { status: "uploading", label: "Uploading", desc: "Transferring audio to server" },
  { status: "analyzing", label: "Analyzing", desc: "Measuring LUFS, spectral balance, dynamics" },
  { status: "processing", label: "AI + DSP", desc: "Applying EQ, compression, reverb, limiter" },
  { status: "exporting", label: "Exporting", desc: "Rendering WAV & MP3" },
  { status: "done", label: "Done", desc: "Your mastered track is ready" },
];

const STATUS_ORDER: JobStatus[] = ["uploading", "analyzing", "processing", "exporting", "done"];

function getStageIndex(status: JobStatus): number {
  return STATUS_ORDER.indexOf(status);
}

// Simple inline audio player
function AudioPlayer({ url, label, color }: { url: string; label: string; color: "primary" | "accent" }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const colorClass = color === "primary"
    ? "bg-primary/15 border-primary/30 text-primary"
    : "bg-accent/15 border-accent/30 text-accent";
  const progressColor = color === "primary" ? "bg-primary" : "bg-accent";

  return (
    <div className={`rounded-xl border p-4 ${colorClass.split(" ").slice(0, 2).join(" ")} bg-card`}>
      <audio
        ref={audioRef}
        src={url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
        onTimeUpdate={() => {
          if (audioRef.current) setProgress(audioRef.current.currentTime);
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) setDuration(audioRef.current.duration);
        }}
      />
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors ${colorClass}`}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <div className="flex-1">
          <div className="text-xs font-medium mb-1.5">{label}</div>
          <div
            className="h-1.5 rounded-full bg-muted cursor-pointer overflow-hidden"
            onClick={(e) => {
              if (!audioRef.current || !duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              audioRef.current.currentTime = ratio * duration;
            }}
          >
            <div
              className={`h-full rounded-full transition-all ${progressColor}`}
              style={{ width: duration > 0 ? `${(progress / duration) * 100}%` : "0%" }}
            />
          </div>
        </div>
        <span className="text-xs text-muted-foreground font-mono min-w-[36px] text-right">
          {duration > 0 ? formatTime(duration - progress) : "--:--"}
        </span>
      </div>
    </div>
  );
}

// Mix settings display
function MixSettingsPanel({ settings }: { settings: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);

  const eq = settings.eq as Record<string, unknown> | undefined;
  const comp = settings.compression as Record<string, unknown> | undefined;
  const reverb = settings.reverb as Record<string, unknown> | undefined;
  const reasoning = settings.reasoning as Record<string, unknown> | undefined;

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <Wand2 className="w-4 h-4 text-primary" />
          AI Mix Settings
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border/50 p-4 space-y-4">
          {reasoning && (
            <div className="p-3 rounded-lg bg-primary/8 border border-primary/20">
              <div className="text-xs font-medium text-primary mb-2">AI Reasoning</div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Voice type: <span className="text-foreground font-medium">{String(reasoning.voice_type || "—")}</span></div>
                {reasoning.genre_detected != null && <div>Genre: <span className="text-foreground font-medium">{String(reasoning.genre_detected)}</span></div>}
                {Array.isArray(reasoning.key_decisions) && reasoning.key_decisions.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-medium text-primary mb-1">Key decisions:</div>
                    <ul className="space-y-0.5">
                      {(reasoning.key_decisions as string[]).map((d: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground">• {String(d)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {eq && (
              <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
                <div className="text-xs font-medium mb-2 text-primary">EQ</div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>HPF: <span className="text-foreground">{String(eq.highpass_hz || "—")} Hz</span></div>
                  <div>LPF: <span className="text-foreground">{String(eq.lowpass_hz || "—")} Hz</span></div>
                  {Array.isArray(eq.peak_bands) && (eq.peak_bands as Array<Record<string, unknown>>)
                    .filter((b: Record<string, unknown>) => Math.abs(Number(b.gain_db)) > 0.1)
                    .map((b: Record<string, unknown>, i: number) => (
                      <div key={i}>{String(b.label || `Band ${i + 1}`)}: <span className="text-foreground">{Number(b.gain_db) > 0 ? "+" : ""}{Number(b.gain_db).toFixed(1)} dB @ {String(b.freq)} Hz</span></div>
                    ))
                  }
                </div>
              </div>
            )}

            {comp && (
              <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
                <div className="text-xs font-medium mb-2 text-accent">Compression</div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>Threshold: <span className="text-foreground">{Number(comp.threshold_db).toFixed(1)} dB</span></div>
                  <div>Ratio: <span className="text-foreground">{Number(comp.ratio).toFixed(1)}:1</span></div>
                  <div>Attack: <span className="text-foreground">{Number(comp.attack_ms).toFixed(0)} ms</span></div>
                  <div>Release: <span className="text-foreground">{Number(comp.release_ms).toFixed(0)} ms</span></div>
                  <div>Makeup: <span className="text-foreground">+{Number(comp.makeup_gain_db).toFixed(1)} dB</span></div>
                </div>
              </div>
            )}

            {reverb && (
              <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
                <div className="text-xs font-medium mb-2" style={{ color: "oklch(0.72 0.18 145)" }}>Reverb + Limiter</div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>Room: <span className="text-foreground">{(Number(reverb.room_size) * 100).toFixed(0)}%</span></div>
                  <div>Wet: <span className="text-foreground">{(Number(reverb.wet_level) * 100).toFixed(0)}%</span></div>
                  <div>Damping: <span className="text-foreground">{(Number(reverb.damping) * 100).toFixed(0)}%</span></div>
                  <div>LUFS target: <span className="text-foreground">{Number(settings.lufs_target || -14).toFixed(1)} LUFS</span></div>
                  <div>Limiter: <span className="text-foreground">-0.3 dBFS</span></div>
                </div>
              </div>
            )}
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View raw JSON</summary>
            <pre className="mt-2 p-3 rounded-lg bg-muted/50 text-muted-foreground overflow-auto text-xs leading-relaxed max-h-64">
              {JSON.stringify(settings, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

// Analysis report display
function AnalysisPanel({ report }: { report: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <BarChart3 className="w-4 h-4 text-accent" />
          Audio Analysis Report
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border/50 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: "LUFS", value: `${Number(report.lufs || 0).toFixed(1)}` },
              { label: "Peak", value: `${Number(report.peak_db || 0).toFixed(1)} dB` },
              { label: "RMS", value: `${Number(report.rms_db || 0).toFixed(1)} dB` },
              { label: "Voice Type", value: String(report.voice_type || "—") },
            ].map((m) => (
              <div key={m.label} className="p-3 rounded-lg bg-muted/30 border border-border/40 text-center">
                <div className="text-xs text-muted-foreground mb-1">{m.label}</div>
                <div className="font-display font-semibold text-sm capitalize">{m.value}</div>
              </div>
            ))}
          </div>

          {report.problems != null && (
            <div className="p-3 rounded-lg bg-muted/20 border border-border/40">
              <div className="text-xs font-medium mb-2">Detected Problems</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(report.problems as Record<string, boolean>).map(([k, v]) => (
                  <span
                    key={k}
                    className={`text-xs px-2 py-0.5 rounded-full border font-mono ${
                      v
                        ? "bg-destructive/15 border-destructive/30 text-destructive"
                        : "bg-muted/30 border-border/40 text-muted-foreground"
                    }`}
                  >
                    {v ? "⚠ " : "✓ "}{k}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function JobPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const [, navigate] = useLocation();
  const [polling, setPolling] = useState(true);

  const { data: job, refetch } = trpc.mastering.getJob.useQuery(
    { jobId: jobId || "" },
    {
      enabled: !!jobId,
      refetchInterval: polling ? 2000 : false,
    }
  );

  useEffect(() => {
    if (job?.status === "done" || job?.status === "error") {
      setPolling(false);
    }
  }, [job?.status]);

  if (!jobId) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Invalid job ID.</p>
        </div>
      </AppShell>
    );
  }

  const currentStageIndex = job ? getStageIndex(job.status as JobStatus) : 0;
  const isDone = job?.status === "done";
  const isError = job?.status === "error";
  const isProcessing = !isDone && !isError;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto py-10 px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold mb-1">
            {isDone ? "Mastering Complete" : isError ? "Processing Failed" : "Mastering in Progress"}
          </h1>
          {job?.sourceFilename && (
            <p className="text-muted-foreground text-sm">{job.sourceFilename}</p>
          )}
        </div>

        {/* Stage progress */}
        <div className="mb-8">
          <div className="flex items-center gap-0 mb-6">
            {STAGES.map((stage, i) => {
              const stageIdx = getStageIndex(stage.status);
              const done = stageIdx < currentStageIndex || isDone;
              const active = stageIdx === currentStageIndex && !isDone && !isError;
              const error = isError && stageIdx === currentStageIndex;

              return (
                <div key={stage.status} className="flex items-center flex-1">
                  <div className="flex flex-col items-center">
                    <div
                      className={[
                        "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300",
                        done
                          ? "border-primary bg-primary text-primary-foreground"
                          : active
                          ? "border-primary bg-primary/20 text-primary"
                          : error
                          ? "border-destructive bg-destructive/20 text-destructive"
                          : "border-border/50 bg-muted/30 text-muted-foreground",
                      ].join(" ")}
                    >
                      {done ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : active ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : error ? (
                        <AlertCircle className="w-4 h-4" />
                      ) : (
                        <span className="text-xs font-mono">{i + 1}</span>
                      )}
                    </div>
                    <span className={`text-xs mt-1.5 font-medium hidden sm:block ${active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"}`}>
                      {stage.label}
                    </span>
                  </div>
                  {i < STAGES.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 transition-all duration-500 ${done ? "bg-primary" : "bg-border/40"}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Current stage info */}
          {isProcessing && job && (
            <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-primary">{job.stage || "Processing…"}</span>
                <span className="text-sm font-mono text-primary">{job.progress ?? 0}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${job.progress ?? 0}%` }}
                />
              </div>
            </div>
          )}

          {isError && (
            <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/10 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-destructive mb-1">Processing failed</div>
                <div className="text-xs text-muted-foreground">{job?.errorMsg || "An unknown error occurred."}</div>
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        {isDone && job && (
          <div className="space-y-5">
            {/* A/B Players */}
            <div className="rounded-xl border border-border/50 bg-card p-5">
              <h2 className="font-display font-semibold text-base mb-4 flex items-center gap-2">
                <Music2 className="w-4 h-4 text-primary" />
                A/B Comparison
              </h2>
              <div className="space-y-3">
                {job.sourceUrl && (
                  <AudioPlayer url={job.sourceUrl} label="Original" color="primary" />
                )}
                {job.outputMp3Url && (
                  <AudioPlayer url={job.outputMp3Url} label="Mastered (MP3 320k)" color="accent" />
                )}
              </div>
            </div>

            {/* Download buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {job.outputMp3Url && (
                <a href={job.outputMp3Url} download>
                  <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-11 glow-primary">
                    <Download className="w-4 h-4 mr-2" />
                    Download MP3 (320k)
                  </Button>
                </a>
              )}
              {job.outputWavUrl && (
                <a href={job.outputWavUrl} download>
                  <Button variant="outline" className="w-full h-11 border-accent/40 text-accent hover:bg-accent/10">
                    <Download className="w-4 h-4 mr-2" />
                    Download WAV (24-bit)
                  </Button>
                </a>
              )}
            </div>

            {/* Mix settings */}
            {job.mixSettings && (
              <MixSettingsPanel settings={job.mixSettings as Record<string, unknown>} />
            )}

            {/* Analysis report */}
            {job.analysisReport && (
              <AnalysisPanel report={job.analysisReport as Record<string, unknown>} />
            )}

            {/* Master another */}
            <div className="pt-2">
              <Button
                variant="ghost"
                onClick={() => navigate("/master")}
                className="text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Master Another Track
              </Button>
            </div>
          </div>
        )}

        {/* Waiting state */}
        {isProcessing && !job && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}
      </div>
    </AppShell>
  );
}
