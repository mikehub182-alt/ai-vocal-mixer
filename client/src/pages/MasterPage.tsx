import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useCallback, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Upload, Music2, FileAudio, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";

const ALLOWED_EXTENSIONS = [".wav", ".mp3", ".flac", ".aiff", ".aif", ".ogg"];
const ALLOWED_MIMES = [
  "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3",
  "audio/flac", "audio/x-flac", "audio/aiff", "audio/x-aiff", "audio/ogg",
];
const MAX_SIZE_MB = 100;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // strip data URL prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function validateFile(file: File): string | null {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `Unsupported format: ${ext}. Accepted: ${ALLOWED_EXTENSIONS.join(", ")}`;
  }
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_SIZE_MB) {
    return `File too large: ${sizeMB.toFixed(1)} MB. Maximum: ${MAX_SIZE_MB} MB`;
  }
  return null;
}

export default function MasterPage() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.mastering.upload.useMutation({
    onSuccess: (data) => {
      console.log(`[Upload] Success! Job ID: ${data.jobId}`);
      toast.success("Upload complete! Processing started.");
      // Reset progress and navigate to job page
      setUploadProgress(0);
      navigate(`/job/${data.jobId}`);
    },
    onError: (err) => {
      console.error(`[Upload] Error:`, err);
      toast.error(err.message || "Upload failed");
      setUploadProgress(0);
    },
  });

  const handleFile = useCallback((file: File) => {
    const err = validateFile(file);
    if (err) {
      setValidationError(err);
      setSelectedFile(null);
      return;
    }
    setValidationError(null);
    setSelectedFile(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    console.log(`[Upload] Starting upload for ${selectedFile.name}`);
    setUploadProgress(10);

    try {
      console.log(`[Upload] Reading file to base64...`);
      const base64 = await fileToBase64(selectedFile);
      setUploadProgress(40);
      console.log(`[Upload] Base64 ready (${base64.length} chars). Sending to backend...`);

      await uploadMutation.mutateAsync({
        filename: selectedFile.name,
        mimeType: selectedFile.type || "audio/wav",
        fileDataBase64: base64,
        fileSizeBytes: selectedFile.size,
      });

      // Upload complete, set to 100% before navigating
      console.log(`[Upload] Mutation succeeded, setting progress to 100%`);
      setUploadProgress(100);
    } catch (err) {
      // error handled by onError
      console.error("[Upload] Error:", err);
    }
  }, [selectedFile, uploadMutation]);

  if (!loading && !isAuthenticated) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Music2 className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold mb-2">Sign in to Master</h2>
            <p className="text-muted-foreground">Log in to upload your track and start mastering.</p>
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

  const isUploading = uploadMutation.isPending || (uploadProgress > 0 && uploadProgress < 100);

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto py-10 px-4">
        {/* Header */}
        <div className="mb-10">
          <h1 className="font-display text-3xl font-bold mb-2">Master Your Track</h1>
          <p className="text-muted-foreground">
            Upload a vocal or full mix. The AI will analyze, decide, and apply a professional processing chain.
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={[
            "relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer",
            "flex flex-col items-center justify-center gap-4 p-12",
            dragOver
              ? "border-primary bg-primary/10 glow-primary"
              : selectedFile
              ? "border-accent/60 bg-accent/5"
              : "border-border/60 bg-card hover:border-primary/40 hover:bg-primary/5",
            isUploading ? "pointer-events-none opacity-70" : "",
          ].join(" ")}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_EXTENSIONS.join(",")}
            className="hidden"
            onChange={handleInputChange}
            disabled={isUploading}
          />

          {selectedFile ? (
            <>
              <div className="w-14 h-14 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center">
                <FileAudio className="w-7 h-7 text-accent" />
              </div>
              <div className="text-center">
                <p className="font-medium text-base">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
              {!isUploading && (
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setValidationError(null); }}
                  className="absolute top-4 right-4 w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/20 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
                <Upload className="w-7 h-7 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-medium text-base">Drop your audio file here</p>
                <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {ALLOWED_EXTENSIONS.map((ext) => (
                  <span key={ext} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
                    {ext.toUpperCase()}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Max {MAX_SIZE_MB} MB</p>
            </>
          )}
        </div>

        {/* Validation error */}
        {validationError && (
          <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {validationError}
          </div>
        )}

        {/* Upload progress - in progress */}
        {uploadProgress > 0 && uploadProgress < 100 && (
          <div className="mt-6">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">
                {uploadProgress < 40 ? "Reading file…" : "Uploading…"}
              </span>
              <span className="text-primary font-medium">{uploadProgress}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Upload complete */}
        {uploadProgress === 100 && (
          <div className="mt-6">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">Upload complete! Redirecting…</span>
              <span className="text-primary font-medium">100%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: "100%" }}
              />
            </div>
          </div>
        )}

        {/* Upload button */}
        {selectedFile && !isUploading && (
          <Button
            onClick={handleUpload}
            size="lg"
            className="w-full mt-6 bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-base glow-primary"
          >
            <Music2 className="w-5 h-5 mr-2" />
            Master This Track
          </Button>
        )}

        {/* Info cards */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "EQ", desc: "High-pass, peak bands, shelves" },
            { label: "Compression", desc: "Threshold, ratio, attack/release" },
            { label: "LUFS", desc: "Streaming-standard loudness" },
          ].map((item) => (
            <div key={item.label} className="p-4 rounded-xl border border-border/50 bg-card text-center">
              <div className="font-display font-semibold text-primary text-sm mb-1">{item.label}</div>
              <div className="text-xs text-muted-foreground">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
