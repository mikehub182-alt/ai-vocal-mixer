import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { Music2, Zap, Download, BarChart3, Wand2, Headphones } from "lucide-react";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();

  const features = [
    {
      icon: <Wand2 className="w-6 h-6" />,
      title: "AI Mix Decisions",
      desc: "LLM analyzes your audio and outputs precise EQ, compression, reverb, and LUFS targets.",
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: "Real DSP Pipeline",
      desc: "Pedalboard + FFmpeg apply the AI decisions: high-pass, peak EQ, compressor, reverb, limiter.",
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: "LUFS Normalization",
      desc: "Targets streaming-standard loudness (-14 LUFS) with pyloudnorm precision.",
    },
    {
      icon: <Headphones className="w-6 h-6" />,
      title: "A/B Comparison",
      desc: "Inline player lets you flip between original and mastered audio instantly.",
    },
    {
      icon: <Download className="w-6 h-6" />,
      title: "WAV + MP3 Export",
      desc: "Download your mastered track as 24-bit WAV or 320kbps MP3.",
    },
    {
      icon: <Music2 className="w-6 h-6" />,
      title: "Full Mix Report",
      desc: "See every decision the AI made: spectral analysis, voice type, detected problems.",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Music2 className="w-4 h-4 text-primary" />
            </div>
            <span className="font-display font-semibold text-lg">AI Vocal Mixer</span>
          </div>
          <div className="flex items-center gap-3">
            {!loading && (
              isAuthenticated ? (
                <div className="flex items-center gap-2">
                  <Link href="/history">
                    <Button variant="ghost" size="sm">History</Button>
                  </Link>
                  <Link href="/master">
                    <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                      Open Studio
                    </Button>
                  </Link>
                </div>
              ) : (
                <a href={getLoginUrl()}>
                  <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                    Get Started
                  </Button>
                </a>
              )
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/10 rounded-full blur-[100px]" />
          <div className="absolute top-1/3 left-1/3 w-[300px] h-[300px] bg-accent/8 rounded-full blur-[80px]" />
        </div>

        <div className="container relative py-24 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium mb-8">
            <Zap className="w-3.5 h-3.5" />
            Real DSP · Pedalboard · FFmpeg · LUFS Normalization
          </div>

          <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-tight">
            Professional Mastering
            <br />
            <span className="text-primary">Powered by AI</span>
          </h1>

          <p className="text-muted-foreground text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Upload your vocal or track. The AI analyzes spectral balance, dynamics, and voice type —
            then applies a real EQ, compressor, reverb, and limiter chain. Download studio-quality audio in seconds.
          </p>

          {/* Animated waveform */}
          <div className="flex items-center justify-center gap-1 mb-10 h-12">
            {Array.from({ length: 32 }).map((_, i) => (
              <div
                key={i}
                className="waveform-bar w-1 rounded-full"
                style={{
                  height: `${20 + Math.sin(i * 0.8) * 15 + Math.cos(i * 0.4) * 10}px`,
                  background: i % 3 === 0
                    ? "oklch(0.65 0.22 290)"
                    : i % 3 === 1
                    ? "oklch(0.70 0.18 195)"
                    : "oklch(0.65 0.22 290 / 0.5)",
                  animationDelay: `${i * 0.04}s`,
                }}
              />
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {isAuthenticated ? (
              <Link href="/master">
                <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 h-12 text-base glow-primary">
                  <Music2 className="w-5 h-5 mr-2" />
                  Open Studio
                </Button>
              </Link>
            ) : (
              <a href={getLoginUrl()}>
                <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 h-12 text-base glow-primary">
                  <Music2 className="w-5 h-5 mr-2" />
                  Start Mastering Free
                </Button>
              </a>
            )}
            <Link href="/history">
              <Button size="lg" variant="outline" className="px-8 h-12 text-base border-border/60">
                View History
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="container py-20">
        <div className="text-center mb-14">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            The Full Signal Chain
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Every step is real processing — not presets, not descriptions. Actual audio transformation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <div
              key={i}
              className="p-6 rounded-xl border border-border/50 bg-card hover:border-primary/30 hover:bg-card/80 transition-all duration-200 group"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center text-primary mb-4 group-hover:bg-primary/25 transition-colors">
                {f.icon}
              </div>
              <h3 className="font-display font-semibold text-base mb-2">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Processing pipeline visual */}
      <section className="container py-16 border-t border-border/30">
        <div className="text-center mb-12">
          <h2 className="font-display text-2xl font-bold mb-3">How It Works</h2>
          <p className="text-muted-foreground">Four stages, fully automated.</p>
        </div>
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-2">
          {[
            { step: "01", label: "Upload", sub: "WAV / MP3 / FLAC" },
            { step: "02", label: "Analyze", sub: "LUFS · Spectral · Dynamics" },
            { step: "03", label: "AI + DSP", sub: "EQ · Comp · Reverb · Limiter" },
            { step: "04", label: "Download", sub: "WAV 24-bit · MP3 320k" },
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex flex-col items-center text-center px-6 py-5 rounded-xl border border-border/50 bg-card min-w-[140px]">
                <span className="text-xs font-mono text-primary/70 mb-1">{s.step}</span>
                <span className="font-display font-semibold text-base">{s.label}</span>
                <span className="text-xs text-muted-foreground mt-1">{s.sub}</span>
              </div>
              {i < 3 && (
                <div className="hidden md:block w-8 h-px bg-gradient-to-r from-primary/40 to-primary/10 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8 mt-8">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Music2 className="w-4 h-4 text-primary" />
            <span>AI Vocal Mixer — Real DSP, Real Results</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Pedalboard · FFmpeg · pyloudnorm · LLM</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
