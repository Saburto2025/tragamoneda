"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

const POOL = ["🍒", "🍋", "⭐", "💰", "🔥", "🔔", "💎", "7️⃣", "🍇", "🍊", "🍻", "🎰"];
const INITIAL = ["7️⃣", "🎰", "🍒"];

interface ReelProps {
  /** target symbol that must land on the centre (payline) when stopped */
  target: string | null;
  /** changes each spin — used as a remount key so the reel restarts cleanly */
  spinKey: number;
  /** stagger delay so reels stop one after another */
  delay: number;
  spinning: boolean;
  highlight: boolean;
  /** Height of each individual cell in pixels. Container matches this exactly. */
  cellH: number;
  /** Width of each individual cell in pixels. Container matches this exactly. */
  cellW: number;
}

function rand() {
  return POOL[Math.floor(Math.random() * POOL.length)];
}

/**
 * A single slot reel.
 *
 * Key design decisions:
 * - The visible window is EXACTLY `cellH` pixels tall — one cell.
 * - The strip is a tall column; each cell is also `cellH` pixels tall.
 * - `finalY` translates the strip so cell `centreIndex` sits at y=0
 *   inside the `overflow-hidden` window → perfectly centred.
 *
 * No Tailwind height classes are used for the outer container so there
 * is zero risk of a CSS-vs-inline conflict.
 */
export function Reel({ target, spinKey, delay, spinning, highlight, cellH, cellW }: ReelProps) {
  const strip = useMemo(() => {
    if (!target) return INITIAL;
    const pre: string[] = [];
    for (let i = 0; i < 26; i++) pre.push(rand());
    // strip layout: [...random…, above, TARGET, below]
    pre.push(rand());   // index len-2 → above payline
    pre.push(target);   // index len-1 → ON the payline  ← centreIndex
    pre.push(rand());   // index len   → below payline
    return pre;
  }, [spinKey, target]);

  // Index of the cell that must appear on the payline (centre of the window).
  const centreIndex = strip.length - 2;

  // Translate strip upward so `centreIndex` is perfectly centred in the window.
  // The window is cellH tall, so centre sits at cellH/2 from the top.
  // Cell top = centreIndex * cellH. We want cell centre = cellH/2.
  // → translateY = -(centreIndex * cellH) + (cellH/2) - (cellH/2) = -centreIndex * cellH
  const finalY = -centreIndex * cellH;

  const emojiSize = Math.round(cellH * 0.52);

  return (
    // Outer container: exactly cellH × cellW, clips the scrolling strip
    <div
      style={{ height: cellH, width: cellW, flexShrink: 0 }}
      className={`relative overflow-hidden rounded-xl border-2 bg-gradient-to-b from-zinc-900 to-black shadow-inner transition-all ${
        highlight
          ? "border-amber-300 shadow-[0_0_30px_rgba(252,211,77,0.8)]"
          : "border-amber-500/30"
      }`}
    >
      {/* Top vignette */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-black/80 to-transparent z-10" />
      {/* Bottom vignette */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/80 to-transparent z-10" />
      {/* Payline indicator (horizontal amber line at the vertical centre) */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-px h-[2px] bg-amber-400/40 z-10" />

      {/* Scrolling strip of symbols */}
      <motion.div
        key={spinKey}
        style={{ willChange: "transform" }}
        className={`flex flex-col${spinning ? " blur-[1.5px]" : ""}`}
        initial={{ y: 0 }}
        animate={{ y: finalY }}
        transition={
          spinning
            ? { duration: 1.0 + delay, ease: [0.18, 0.85, 0.25, 1.0], delay }
            : { duration: 0 }
        }
      >
        {strip.map((sym, i) => (
          <div
            key={i}
            style={{
              height: cellH,
              width: cellW,
              fontSize: emojiSize,
              lineHeight: 1,
              filter:
                highlight && i === centreIndex
                  ? "drop-shadow(0 0 14px rgba(252,211,77,0.95))"
                  : "none",
            }}
            className="flex items-center justify-center select-none"
          >
            {sym}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
