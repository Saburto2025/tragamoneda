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
  AlertTriangle,
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

  // SaaS states
  const [shopId, setShopId] = useState("singleton");
  const [active, setActive] = useState(true);
  const [shopName, setShopName] = useState("LUCKY DIAMOND");

  // Dynamic sizing state
  const [isMobile, setIsMobile] = useState(true);

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 640);
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const cellHeight = isMobile ? 128 : 175;
  const cellWidth = isMobile ? 96 : 130;

  // Load shopId from URL query string
  useEffect(() => {
    let s = "singleton";
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      s = params.get("shop") || "singleton";
      setShopId(s);
    }

    (async () => {
      try {
        const res = await fetch(`/api/slot/state?shop=${s}`, { cache: "no-store" });
        const data = await res.json();
        setBalance(data.balance);
        setFreeSpins(data.freeSpins);
        setActive(data.active ?? true);
        setShopName(data.shopName ?? "LUCKY DIAMOND");
      } catch {
        /* ignore */
      } finally {
        setBootBalance(false);
      }
    })();
  }, []);

  const refreshState = useCallback(async () => {
    try {
      const res = await fetch(`/api/slot/state?shop=${shopId}`, { cache: "no-store" });
      const data = await res.json();
      setBalance(data.balance);
      setFreeSpins(data.freeSpins);
      setActive(data.active ?? true);
      setShopName(data.shopName ?? "LUCKY DIAMOND");
    } catch {
      /* ignore */
    }
  }, [shopId]);

  const canSpin = !spinning && !bootBalance && active && (freeSpins > 0 || balance >= bet * CREDIT_VALUE);

  const doSpin = useCallback(async () => {
    if (spinning || !active) return;
    if (freeSpins <= 0 && balance < bet * CREDIT_VALUE) {
      toast({
        title: "Saldo insuficiente",
        description: "Recargue créditos en el panel de administrador.",
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
        body: JSON.stringify({ bet, shop: shopId }),
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

    setTargets(data.reels);
    setSpinKey((k) => k + 1);

    REEL_DELAYS.forEach((d, i) => {
      window.setTimeout(() => playReelStop(i), (BASE_DURATION + d) * 1000);
    });

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
  }, [spinning, freeSpins, balance, bet, active, shopId]);

  // spacebar to spin
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space") {
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
    <div className="min-h-screen max-h-screen flex flex-col bg-[#06030c] text-zinc-100 overflow-hidden font-sans relative">
      {/* ambient neon background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-fuchsia-600/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-emerald-500/5 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 px-4 py-2 sm:py-3 border-b border-amber-500/10 backdrop-blur-sm bg-black/40">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 sm:h-6 sm:w-6 text-amber-400" />
            <div>
              <h1 className="text-base sm:text-xl font-black tracking-wider bg-gradient-to-r from-amber-300 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent leading-none">
                {shopName.toUpperCase()}
              </h1>
              <p className="text-[9px] sm:text-[11px] text-zinc-500 leading-none mt-0.5">Tragamonedas · Bar & Cantina</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              className="text-zinc-400 hover:text-amber-300 hover:bg-zinc-900/60 h-8 w-8"
              aria-label={muted ? "Activar sonido" : "Silenciar"}
            >
              {muted ? <VolumeX className="h-4.5 w-4.5" /> : <Volume2 className="h-4.5 w-4.5" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { playButton(); setAdminOpen(true); }}
              className="border-amber-500/20 text-amber-300 hover:bg-amber-500/10 h-8 text-xs px-2.5"
            >
              <Settings className="h-3.5 w-3.5 mr-1" /> Admin
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto lg:overflow-hidden select-none">
        {/* Deactivated Business Block Overlay */}
        <AnimatePresence>
          {!active && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-md z-40 flex flex-col items-center justify-center p-6 text-center"
            >
              <motion.div
                initial={{ scale: 0.9, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                className="max-w-md rounded-2xl border border-rose-500/30 bg-gradient-to-b from-zinc-900 to-black p-6 sm:p-8 shadow-[0_0_50px_rgba(239,68,68,0.15)] flex flex-col items-center"
              >
                <div className="rounded-full bg-rose-500/10 p-4 border border-rose-500/30 mb-4">
                  <AlertTriangle className="h-10 w-10 text-rose-400 animate-pulse" />
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-rose-400 tracking-wide mb-2">NEGOCIO DESACTIVADO</h2>
                <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                  Este punto de juego está suspendido temporalmente. Por favor, solicite asistencia al administrador del establecimiento.
                </p>
                <Button
                  onClick={() => setAdminOpen(true)}
                  className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700 font-semibold text-xs py-2 px-4"
                >
                  <Settings className="h-3.5 w-3.5 mr-1.5" /> Administrar
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="w-full max-w-6xl lg:max-h-[calc(100vh-130px)] grid lg:grid-cols-[1fr_300px] gap-4 sm:gap-6 items-stretch">
          {/* Cabinet Section */}
          <section className="flex flex-col justify-between rounded-3xl border border-amber-500/30 bg-gradient-to-b from-zinc-900 via-[#0d0716] to-[#040207] p-3 sm:p-5 shadow-[0_0_50px_rgba(217,119,6,0.1)]">
            
            {/* Balance panel */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3 sm:mb-4 text-center">
              <div className="rounded-xl bg-black/60 border border-zinc-900 px-2 py-1.5 sm:py-2">
                <p className="text-[9px] sm:text-xs text-zinc-500 uppercase font-semibold tracking-wider">Saldo</p>
                <p className="text-sm sm:text-lg font-black text-emerald-400 font-mono mt-0.5">{bootBalance ? "…" : fmt(balance)}</p>
              </div>
              <div className="rounded-xl bg-black/60 border border-zinc-900 px-2 py-1.5 sm:py-2">
                <p className="text-[9px] sm:text-xs text-zinc-500 uppercase font-semibold tracking-wider">Apuesta</p>
                <p className="text-sm sm:text-lg font-black text-amber-300 font-mono mt-0.5">{bet}c · {fmt(cost)}</p>
              </div>
              <div className="rounded-xl bg-black/60 border border-zinc-900 px-2 py-1.5 sm:py-2">
                <p className="text-[9px] sm:text-xs text-zinc-500 uppercase font-semibold tracking-wider">Tiros gratis</p>
                <p className={`text-sm sm:text-lg font-black font-mono mt-0.5 ${freeSpins > 0 ? "text-cyan-300" : "text-zinc-700"}`}>{freeSpins}</p>
              </div>
            </div>

            {/* Free spin dynamic display banner */}
            <div className="h-6 overflow-hidden relative">
              <AnimatePresence>
                {isFreeSpin && !spinning && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute inset-x-0 top-0 flex items-center justify-center gap-1.5 rounded-lg bg-cyan-500/10 border border-cyan-400/20 py-0.5 text-cyan-200 text-xs font-semibold"
                  >
                    <Gift className="h-3.5 w-3.5" /> ¡Tiro gratis en curso! No descuenta saldo.
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Reel viewport */}
            <div className="relative rounded-2xl bg-black/75 border border-amber-500/10 p-3 sm:p-5 flex-1 flex flex-col justify-center items-center my-2 select-none overflow-hidden min-h-[180px] sm:min-h-[260px]">
              {/* win flash box overlay */}
              <div
                className={`pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300 z-20 ${
                  highlight ? "opacity-100" : "opacity-0"
                }`}
                style={{ boxShadow: "inset 0 0 50px rgba(252,211,77,0.5)" }}
              />

              {/* Centered Reel Container */}
              <div className="flex items-center justify-center gap-2 sm:gap-6 relative w-full h-full">
                {/* Horizontal central payline line across all reels */}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent z-25 opacity-80 pointer-events-none" />

                {targets.map((t, i) => (
                  <Reel
                    key={i}
                    target={t}
                    spinKey={spinKey}
                    delay={REEL_DELAYS[i]}
                    spinning={spinning}
                    highlight={highlight && !!lastResult?.won}
                    cellHeight={cellHeight}
                    cellWidth={cellWidth}
                  />
                ))}
              </div>

              {/* Win banner - MAkE THE PRIZE NAME MUCH LARGER */}
              <div className="h-16 sm:h-20 mt-4 flex items-center justify-center z-10">
                <AnimatePresence mode="wait">
                  {lastResult?.won && lastResult.prize ? (
                    <motion.div
                      key={lastResult.prize.label + lastResult.totalSpins}
                      initial={{ scale: 0.7, opacity: 0, rotate: -3 }}
                      animate={{ scale: 1, opacity: 1, rotate: 0 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 350, damping: 14 }}
                      className="text-center"
                    >
                      <div className={`text-2xl sm:text-4xl font-black tracking-wide ${lastResult.prize.neon} drop-shadow-[0_0_15px_currentColor] uppercase`}>
                        {lastResult.prize.isJackpot ? "💎 JACKPOT 500x 💎" : `¡PREMIO ${lastResult.prize.label}!`}
                      </div>
                      <div className="text-xl sm:text-2xl font-extrabold text-emerald-400 mt-1 font-mono">
                        +{fmt(lastResult.payout)}
                      </div>
                    </motion.div>
                  ) : lastResult && !lastResult.won ? (
                    <motion.div
                      key={"lose" + lastResult.totalSpins}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-zinc-500 text-xs sm:text-sm font-semibold"
                    >
                      {lastResult.isFree ? "Tiro gratis — sigue intentando" : "Sigue girando…"}
                    </motion.div>
                  ) : (
                    <div className="text-zinc-500 text-[10px] sm:text-xs">
                      Presiona <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[9px]">Espacio</kbd> o el botón para jugar
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Betting selector and main trigger spin button */}
            <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1">
                <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-1">Apuesta (créditos)</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1, 2, 3, 4].map((b) => (
                    <button
                      key={b}
                      onClick={() => { playButton(); setBet(b); }}
                      disabled={spinning}
                      className={`relative rounded-lg py-1.5 sm:py-2 font-black border transition-all ${
                        bet === b
                          ? "border-amber-400 bg-amber-400/20 text-amber-200 shadow-[0_0_10px_rgba(252,211,77,0.3)]"
                          : "border-zinc-800 bg-zinc-950/60 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
                      } disabled:opacity-50 text-sm`}
                    >
                      <span className="block font-mono leading-none">{b}</span>
                      <span className="block text-[8px] font-normal text-zinc-600 mt-0.5">{fmt(b * CREDIT_VALUE)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={doSpin}
                disabled={!canSpin}
                className={`relative overflow-hidden rounded-xl px-5 py-3 sm:py-4 font-black text-sm sm:text-base tracking-widest transition-all ${
                  canSpin
                    ? "bg-gradient-to-b from-amber-400 to-amber-600 text-black shadow-[0_0_20px_rgba(252,211,77,0.4)] hover:scale-[1.01] active:scale-95 cursor-pointer"
                    : "bg-zinc-900 text-zinc-600 cursor-not-allowed border border-zinc-800/40"
                }`}
              >
                <span className="flex items-center gap-2 justify-center">
                  {spinning ? (
                    <>
                      <Loader2 className="h-4.5 w-4.5 animate-spin" /> JUGANDO…
                    </>
                  ) : isFreeSpin ? (
                    <>
                      <Gift className="h-4.5 w-4.5" /> TIRO GRATIS
                    </>
                  ) : (
                    <>
                      <Zap className="h-4.5 w-4.5" /> GIRAR · {fmt(cost)}
                    </>
                  )}
                </span>
              </button>
            </div>
          </section>

          {/* Paytable Sidebar */}
          <aside className="rounded-2xl border border-amber-500/10 bg-zinc-950/50 backdrop-blur-sm p-4 flex flex-col justify-between max-h-[300px] lg:max-h-none overflow-y-auto">
            <div>
              <h2 className="text-xs font-bold text-amber-300 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Crown className="h-3.5 w-3.5" /> Tabla de Premios
              </h2>
              <div className="space-y-1">
                {[...PRIZES].reverse().map((p) => (
                  <div
                    key={p.mult}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${
                      p.isJackpot
                        ? "bg-gradient-to-r from-cyan-500/15 to-fuchsia-500/15 border border-cyan-400/30"
                        : "bg-black/40 border border-zinc-900"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{p.symbol}{p.isJackpot ? p.symbol + p.symbol : ""}</span>
                      <span className={`font-semibold text-[10px] sm:text-xs ${p.neon}`}>{p.label}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-bold">×{p.mult}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="mt-4 rounded-lg bg-black/45 border border-zinc-950 p-3 text-[10px] text-zinc-500 space-y-1 select-none">
              <p>💎 3 iguales en la línea = premio.</p>
              <p>1 crédito = {fmt(CREDIT_VALUE)} · Apuesta 1-4 créditos.</p>
              <p>RTP objetivo: <span className="text-emerald-400 font-semibold">{(TARGET_RTP * 100).toFixed(0)}%</span> (la casa retiene 30%).</p>
            </div>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-amber-500/10 bg-black/50 backdrop-blur-sm mt-auto select-none">
        <div className="max-w-6xl mx-auto px-4 py-2 flex flex-col sm:flex-row items-center justify-between gap-1 text-[10px] text-zinc-600 text-center sm:text-left">
          <p>Presiona <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[8px]">Espacio</kbd> para girar · Solo mayores de edad · Juega con responsabilidad</p>
          <p className="text-[9px] font-mono text-zinc-700">LUCKY DIAMOND · {credits} créditos · RTP {(TARGET_RTP * 100).toFixed(0)}%</p>
        </div>
      </footer>

      <AdminPanel open={adminOpen} onOpenChange={setAdminOpen} onStateChanged={refreshState} shopId={shopId} />
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
  confetti({
    particleCount: 160,
    spread: 100,
    startVelocity: 45,
    origin: { y: 0.5 },
    colors,
    scalar: 1.1,
  });
}
