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
  cellHeight: number;
  cellWidth: number;
}

function rand() {
  return POOL[Math.floor(Math.random() * POOL.length)];
}

/**
 * A single slot reel. On each spin we build a long strip of random symbols
 * whose centre cell is `target`, then animate it scrolling down into place.
 * The motion.div is keyed by spinKey so it remounts and replays cleanly.
 */
export function Reel({ target, spinKey, delay, spinning, highlight, cellHeight, cellWidth }: ReelProps) {
  const strip = useMemo(() => {
    if (!target) return INITIAL;
    const len = 26;
    const arr: string[] = [];
    for (let i = 0; i < len; i++) arr.push(rand());
    // final three: [above, centre=target, below]
    arr.push(rand());
    arr.push(target);
    arr.push(rand());
    return arr;
  }, [spinKey, target]);

  const centreIndex = strip.length - 2;
  const finalY = -centreIndex * cellHeight;

  return (
    <div
      style={{ height: cellHeight, width: cellWidth }}
      className={`relative overflow-hidden rounded-xl border-2 bg-gradient-to-b from-zinc-900 to-black shadow-inner transition-all ${
        highlight
          ? "border-amber-300 shadow-[0_0_25px_rgba(252,211,77,0.7)]"
          : "border-amber-500/30"
      }`}
    >
      {/* depth shading */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-black/70 to-transparent z-10" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-black/70 to-transparent z-10" />
      {/* payline */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-amber-300/20 z-10" />

      <motion.div
        key={spinKey}
        className={`flex flex-col items-center ${spinning ? "blur-[1px]" : ""}`}
        initial={{ y: 0 }}
        animate={{ y: finalY }}
        transition={
          spinning
            ? { duration: 1.0 + delay, ease: [0.18, 0.85, 0.25, 1], delay }
            : { duration: 0 }
        }
      >
        {strip.map((s, i) => (
          <div
            key={i}
            style={{
              height: cellHeight,
              width: cellWidth,
              fontSize: `${cellHeight * 0.52}px`,
              filter: highlight && i === centreIndex ? "drop-shadow(0 0 12px rgba(252,211,77,0.9))" : "none",
            }}
            className="flex items-center justify-center select-none leading-none"
          >
            {s}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
