"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Reel } from "@/components/slot/reel";
import { AdminPanel } from "@/components/slot/admin-panel";
import {
  CREDIT_VALUE,
  MAX_BET,
  MIN_BET,
  PRIZES,
  TARGET_RTP,
} from "@/lib/slot";
import {
  playSpin,
  playReelStop,
  playWin,
  playJackpot,
  playFreeSpin,
  playLose,
  playButton,
  setMuted,
} from "@/lib/sound";
import {
  Volume2,
  VolumeX,
  Settings,
  Gift,
  Loader2,
  Zap,
  Crown,
} from "lucide-react";

interface SpinResponse {
  reels: string[];
  won: boolean;
  prize: { mult: number; symbol: string; label: string; isJackpot: boolean; neon: string } | null;
  payout: number;
  isFree: boolean;
  cost: number;
  freeSpinsAwarded: number;
  balance: number;
  freeSpins: number;
  rtp: number;
  totalSpins: number;
}

const REEL_DELAYS = [0, 0.18, 0.36];
const BASE_DURATION = 1.0;
const REVEAL_AFTER = (BASE_DURATION + REEL_DELAYS[REEL_DELAYS.length - 1]) * 1000 + 120;

const fmt = (n: number) => "₡" + n.toLocaleString("es-CR");

export function SlotMachine() {
  const [balance, setBalance] = useState(0);
  const [freeSpins, setFreeSpins] = useState(0);
  const [bet, setBet] = useState(1);
  const [spinning, setSpinning] = useState(false);
  const [spinKey, setSpinKey] = useState(0);
  const [targets, setTargets] = useState<(string | null)[]>([null, null, null]);
  const [highlight, setHighlight] = useState(false);
  const [lastResult, setLastResult] = useState<SpinResponse | null>(null);
  const [muted, setMutedState] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [bootBalance, setBootBalance] = useState(true);
  const winFlash = useRef<number | null>(null);

  // initial load
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/slot/state", { cache: "no-store" });
        const data = await res.json();
        setBalance(data.balance);
        setFreeSpins(data.freeSpins);
      } catch {
        /* ignore */
      } finally {
        setBootBalance(false);
      }
    })();
  }, []);

  const refreshState = useCallback(async () => {
    try {
      const res = await fetch("/api/slot/state", { cache: "no-store" });
      const data = await res.json();
      setBalance(data.balance);
      setFreeSpins(data.freeSpins);
    } catch {
      /* ignore */
    }
  }, []);

  const canSpin = !spinning && !bootBalance && (freeSpins > 0 || balance >= bet * CREDIT_VALUE);

  const doSpin = useCallback(async () => {
    if (spinning) return;
    if (freeSpins <= 0 && balance < bet * CREDIT_VALUE) {
      toast({
        title: "Saldo insuficiente",
        description: "Pide al dueño que agregue créditos.",
        variant: "destructive",
      });
      return;
    }
    setSpinning(true);
    setHighlight(false);
    setLastResult(null);
    playSpin();

    let data: SpinResponse;
    try {
      const res = await fetch("/api/slot/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bet }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: "No se pudo girar", description: json.error, variant: "destructive" });
        setSpinning(false);
        return;
      }
      data = json as SpinResponse;
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
      setSpinning(false);
      return;
    }

    // start the reel landing animation with the resolved targets
    setTargets(data.reels);
    setSpinKey((k) => k + 1);

    // reel-stop clicks staggered
    REEL_DELAYS.forEach((d, i) => {
      window.setTimeout(() => playReelStop(i), (BASE_DURATION + d) * 1000);
    });

    // reveal after the last reel settles
    window.setTimeout(() => {
      setSpinning(false);
      setBalance(data.balance);
      setFreeSpins(data.freeSpins);
      setLastResult(data);
      if (data.won && data.prize) {
        setHighlight(true);
        if (data.prize.isJackpot) {
          playJackpot();
          fireJackpotConfetti();
        } else {
          playWin(data.prize.mult);
          fireWinConfetti(data.prize.mult);
        }
      } else {
        playLose();
      }
      if (data.freeSpinsAwarded > 0) {
        window.setTimeout(() => playFreeSpin(), 400);
        toast({
          title: `🎁 ${data.freeSpinsAwarded} tiro(s) gratis!`,
          description: "Se añadieron a tu contador.",
        });
      }
    }, REVEAL_AFTER);
  }, [spinning, freeSpins, balance, bet]);

  // spacebar to spin
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space") {
        // don't hijack when typing in an input
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        e.preventDefault();
        doSpin();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSpin]);

  function toggleMute() {
    playButton();
    const m = !muted;
    setMutedState(m);
    setMuted(m);
  }

  const cost = bet * CREDIT_VALUE;
  const isFreeSpin = freeSpins > 0;
  const credits = Math.floor(balance / CREDIT_VALUE);

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0612] text-zinc-100">
      {/* ambient neon background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-96 w-96 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 px-4 py-3 sm:py-4 border-b border-amber-500/20 backdrop-blur-sm bg-black/30">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Crown className="h-6 w-6 sm:h-7 sm:w-7 text-amber-400" />
            <div>
              <h1 className="text-lg sm:text-2xl font-black tracking-tight bg-gradient-to-r from-amber-300 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent leading-none">
                LUCKY DIAMOND
              </h1>
              <p className="text-[10px] sm:text-xs text-zinc-500 leading-none mt-0.5">Tragamonedas · Bar & Cantina</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              className="text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/60 h-9 w-9"
              aria-label={muted ? "Activar sonido" : "Silenciar"}
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { playButton(); setAdminOpen(true); }}
              className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
            >
              <Settings className="h-4 w-4 mr-1" /> Admin
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 px-3 sm:px-4 py-4 sm:py-6">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-[1fr_300px] gap-4 sm:gap-6">
          {/* Machine cabinet */}
          <section className="rounded-3xl border-2 border-amber-500/40 bg-gradient-to-b from-zinc-900 via-[#150b22] to-black p-4 sm:p-6 shadow-[0_0_60px_rgba(217,119,6,0.15)]">
            {/* balance + free spins bar */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
              <div className="rounded-xl bg-black/50 border border-zinc-800 px-3 py-2">
                <p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wide">Saldo</p>
                <p className="text-base sm:text-xl font-bold text-emerald-400 tabular-nums">{bootBalance ? "…" : fmt(balance)}</p>
              </div>
              <div className="rounded-xl bg-black/50 border border-zinc-800 px-3 py-2 text-center">
                <p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wide">Apuesta</p>
                <p className="text-base sm:text-xl font-bold text-amber-300 tabular-nums">{bet}c · {fmt(cost)}</p>
              </div>
              <div className="rounded-xl bg-black/50 border border-zinc-800 px-3 py-2 text-right">
                <p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wide">Tiros gratis</p>
                <p className={`text-base sm:text-xl font-bold tabular-nums ${freeSpins > 0 ? "text-cyan-300" : "text-zinc-600"}`}>{freeSpins}</p>
              </div>
            </div>

            {/* free-spin banner */}
            <AnimatePresence>
              {isFreeSpin && !spinning && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-cyan-500/10 border border-cyan-400/40 py-1.5 text-cyan-200 text-sm font-semibold"
                >
                  <Gift className="h-4 w-4" /> ¡Tiro gratis en curso! No descuenta saldo.
                </motion.div>
              )}
            </AnimatePresence>

            {/* Reels */}
            <div className="relative rounded-2xl bg-black/60 border border-amber-500/20 p-3 sm:p-5">
              {/* win flash */}
              <div
                className={`pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300 ${
                  highlight ? "opacity-100" : "opacity-0"
                }`}
                style={{ boxShadow: "inset 0 0 60px rgba(252,211,77,0.6)" }}
              />
              <div className="flex items-center justify-center gap-2 sm:gap-4">
                {targets.map((t, i) => (
                  <Reel
                    key={i}
                    target={t}
                    spinKey={spinKey}
                    delay={REEL_DELAYS[i]}
                    spinning={spinning}
                    highlight={highlight && !!lastResult?.won}
                  />
                ))}
              </div>

              {/* win banner */}
              <div className="h-16 sm:h-20 mt-3 flex items-center justify-center">
                <AnimatePresence mode="wait">
                  {lastResult?.won && lastResult.prize ? (
                    <motion.div
                      key={lastResult.prize.label + lastResult.totalSpins}
                      initial={{ scale: 0.6, opacity: 0, rotate: -5 }}
                      animate={{ scale: 1, opacity: 1, rotate: 0 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 15 }}
                      className="text-center"
                    >
                      <div className={`text-2xl sm:text-3xl font-black ${lastResult.prize.neon} drop-shadow-[0_0_12px_currentColor]`}>
                        {lastResult.prize.isJackpot ? "💎 JACKPOT 500x 💎" : `¡PREMIO ${lastResult.prize.label}!`}
                      </div>
                      <div className="text-lg sm:text-xl font-bold text-emerald-400">
                        +{fmt(lastResult.payout)}
                      </div>
                    </motion.div>
                  ) : lastResult && !lastResult.won ? (
                    <motion.div
                      key={"lose" + lastResult.totalSpins}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-zinc-500 text-sm sm:text-base font-medium"
                    >
                      {lastResult.isFree ? "Tiro gratis — sigue intentando" : "Sigue girando…"}
                    </motion.div>
                  ) : (
                    <div className="text-zinc-600 text-sm">Presiona <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-xs">Espacio</kbd> o el botón para girar</div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* bet selector + spin */}
            <div className="mt-4 sm:mt-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1">
                <p className="text-xs text-zinc-500 mb-1.5">Apuesta (créditos)</p>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((b) => (
                    <button
                      key={b}
                      onClick={() => { playButton(); setBet(b); }}
                      disabled={spinning}
                      className={`relative rounded-lg py-2.5 font-bold border-2 transition-all ${
                        bet === b
                          ? "border-amber-400 bg-amber-400/20 text-amber-200 shadow-[0_0_15px_rgba(252,211,77,0.4)]"
                          : "border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:border-zinc-500"
                      } disabled:opacity-50`}
                    >
                      <span className="block text-lg leading-none">{b}</span>
                      <span className="block text-[10px] font-normal text-zinc-500">{fmt(b * CREDIT_VALUE)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={doSpin}
                disabled={!canSpin}
                className={`relative overflow-hidden rounded-xl px-6 py-4 sm:py-5 font-black text-base sm:text-lg tracking-wide transition-all ${
                  canSpin
                    ? "bg-gradient-to-b from-amber-400 to-amber-600 text-black shadow-[0_0_30px_rgba(252,211,77,0.5)] hover:scale-[1.02] active:scale-95"
                    : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                }`}
              >
                <span className="flex items-center gap-2 justify-center">
                  {spinning ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" /> GIRANDO…
                    </>
                  ) : isFreeSpin ? (
                    <>
                      <Gift className="h-5 w-5" /> TIRO GRATIS
                    </>
                  ) : (
                    <>
                      <Zap className="h-5 w-5" /> GIRAR · {fmt(cost)}
                    </>
                  )}
                </span>
              </button>
            </div>
          </section>

          {/* Paytable sidebar */}
          <aside className="rounded-2xl border border-amber-500/30 bg-zinc-900/70 p-4 sm:p-5 h-fit lg:sticky lg:top-4">
            <h2 className="text-sm font-bold text-amber-300 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Crown className="h-4 w-4" /> Tabla de Premios
            </h2>
            <div className="space-y-1.5">
              {[...PRIZES].reverse().map((p) => (
                <div
                  key={p.mult}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                    p.isJackpot
                      ? "bg-gradient-to-r from-cyan-500/20 to-fuchsia-500/20 border border-cyan-400/40"
                      : "bg-black/30 border border-zinc-800"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{p.symbol}{p.isJackpot ? p.symbol + p.symbol : ""}</span>
                    <span className={`font-bold ${p.neon}`}>{p.label}</span>
                  </div>
                  <span className="text-xs text-zinc-400">×{p.mult}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg bg-black/40 border border-zinc-800 p-3 text-xs text-zinc-400 space-y-1">
              <p>💎 3 iguales en la línea = premio.</p>
              <p>1 crédito = {fmt(CREDIT_VALUE)}. Apuesta 1-4 créditos.</p>
              <p>RTP objetivo: <span className="text-emerald-400 font-semibold">{(TARGET_RTP * 100).toFixed(0)}%</span> (la casa retiene 30%).</p>
            </div>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 mt-auto border-t border-amber-500/20 bg-black/40 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-500">
          <p>Presiona <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700">Espacio</kbd> para girar · Solo para mayores de edad · Juega con responsabilidad</p>
          <p className="text-zinc-600">LUCKY DIAMOND · {credits} créditos · RTP {(TARGET_RTP * 100).toFixed(0)}%</p>
        </div>
      </footer>

      <AdminPanel open={adminOpen} onOpenChange={setAdminOpen} onStateChanged={refreshState} />
    </div>
  );
}

function fireWinConfetti(mult: number) {
  const count = Math.min(60, 20 + mult);
  confetti({
    particleCount: count,
    spread: 70,
    origin: { y: 0.6 },
    colors: ["#fbbf24", "#f59e0b", "#fcd34d", "#ffffff"],
    scalar: 0.9,
  });
}

function fireJackpotConfetti() {
  const end = Date.now() + 2200;
  const colors = ["#fbbf24", "#22d3ee", "#e879f9", "#34d399", "#ffffff"];
  (function frame() {
    confetti({
      particleCount: 6,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.5 },
      colors,
    });
    confetti({
      particleCount: 6,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.5 },
      colors,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  // central burst
  confetti({
    particleCount: 160,
    spread: 100,
    startVelocity: 45,
    origin: { y: 0.5 },
    colors,
    scalar: 1.1,
  });
}
