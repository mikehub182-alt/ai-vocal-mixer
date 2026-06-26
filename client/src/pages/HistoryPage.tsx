import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  Clock, Download, Music2, CheckCircle2, AlertCircle,
  Loader2, Upload, FileAudio
} from "lucide-react";
import AppShell from "@/components/AppShell";

type JobStatus = "pending" | "uploading" | "analyzing" | "processing" | "exporting" | "done" | "error";

const STATUS_CONFIG: Record<JobStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "Pending", color: "text-muted-foreground border-border/50 bg-muted/30", icon: <Clock className="w-3 h-3" /> },
  uploading: { label: "Uploading", color: "text-blue-400 border-blue-400/30 bg-blue-400/10", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  analyzing: { label: "Analyzing", color: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  processing: { label: "Processing", color: "text-primary border-primary/30 bg-primary/10", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  exporting: { label: "Exporting", color: "text-accent border-accent/30 bg-accent/10", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  done: { label: "Done", color: "text-green-400 border-green-400/30 bg-green-400/10", icon: <CheckCircle2 className="w-3 h-3" /> },
  error: { label: "Failed", color: "text-destructive border-destructive/30 bg-destructive/10", icon: <AlertCircle className="w-3 h-3" /> },
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export default function HistoryPage() {
  const { isAuthenticated, loading } = useAuth();
  const { data: jobs, isLoading } = trpc.mastering.listJobs.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  if (!loading && !isAuthenticated) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Clock className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold mb-2">Sign in to view history</h2>
            <p className="text-muted-foreground">Your mastering history will appear here.</p>
          </div>
          <a href={getLoginUrl()}>
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground px-8">
              Sign In
            </Button>
          </a>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto py-10 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-bold mb-1">Mastering History</h1>
            <p className="text-muted-foreground text-sm">All your mastered tracks</p>
          </div>
          <Link href="/master">
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Upload className="w-4 h-4 mr-2" />
              New Track
            </Button>
          </Link>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && (!jobs || jobs.length === 0) && (
          <div className="flex flex-col items-center justify-center py-20 gap-5 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 border border-border/50 flex items-center justify-center">
              <Music2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-lg mb-1">No tracks yet</h3>
              <p className="text-muted-foreground text-sm">Upload your first track to get started.</p>
            </div>
            <Link href="/master">
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Upload className="w-4 h-4 mr-2" />
                Master a Track
              </Button>
            </Link>
          </div>
        )}

        {/* Job list */}
        {jobs && jobs.length > 0 && (
          <div className="space-y-3">
            {jobs.map((job) => {
              const statusCfg = STATUS_CONFIG[job.status as JobStatus] || STATUS_CONFIG.pending;
              const isActive = !["done", "error"].includes(job.status);

              return (
                <div
                  key={job.id}
                  className="rounded-xl border border-border/50 bg-card p-4 hover:border-border transition-colors"
                >
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-lg bg-muted/50 border border-border/50 flex items-center justify-center flex-shrink-0">
                      <FileAudio className="w-5 h-5 text-muted-foreground" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {job.sourceFilename || "Untitled track"}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${statusCfg.color}`}>
                          {statusCfg.icon}
                          {statusCfg.label}
                        </span>
                      </div>

                      <div className="text-xs text-muted-foreground mt-1">
                        {formatDate(job.createdAt)}
                      </div>

                      {/* Progress bar for active jobs */}
                      {isActive && job.progress != null && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span>{job.stage || "Processing…"}</span>
                            <span>{job.progress}%</span>
                          </div>
                          <div className="h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-500"
                              style={{ width: `${job.progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Error message */}
                      {job.status === "error" && job.errorMsg && (
                        <div className="text-xs text-destructive mt-1 truncate">{job.errorMsg}</div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {job.status === "done" && (
                        <>
                          {job.outputMp3Url && (
                            <a href={job.outputMp3Url} download onClick={(e) => e.stopPropagation()}>
                              <Button variant="outline" size="sm" className="h-8 border-primary/30 text-primary hover:bg-primary/10">
                                <Download className="w-3.5 h-3.5 mr-1" />
                                MP3
                              </Button>
                            </a>
                          )}
                          {job.outputWavUrl && (
                            <a href={job.outputWavUrl} download onClick={(e) => e.stopPropagation()}>
                              <Button variant="outline" size="sm" className="h-8 border-accent/30 text-accent hover:bg-accent/10">
                                <Download className="w-3.5 h-3.5 mr-1" />
                                WAV
                              </Button>
                            </a>
                          )}
                        </>
                      )}
                      <Link href={`/job/${job.id}`}>
                        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground">
                          View
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
