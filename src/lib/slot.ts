// Core slot-machine logic: prize table, dynamic RTP controller, spin resolution.
// Shared by the API routes and the admin simulator so the maths is identical.

export const CREDIT_VALUE = 25; // colones per credit
export const MIN_BET = 1;
export const MAX_BET = 4;
export const TARGET_RTP = 0.7; // house keeps 30%, player gets 70%
// Loose safety ceiling: a single win can never push RTP above this. With the
// soft controller regulating around 0.70 it almost never binds; it only exists
// to guarantee no catastrophic spike (e.g. back-to-back early jackpots).
export const RTP_CEILING = 0.78; // safety net: blocks any single win that would push RTP above this
export const RTP_FLOOR = 0.65; // below this the win-rate is boosted hard

export interface PrizeTier {
  mult: number;
  symbol: string; // emoji shown on the reels
  label: string;
  weight: number; // relative frequency among winning outcomes
  isJackpot?: boolean;
  neon: string; // tailwind text colour class for the prize display
}

// Prize table (multipliers over the amount bet).
export const PRIZES: PrizeTier[] = [
  { mult: 10, symbol: "🍋", label: "10x", weight: 132, neon: "text-amber-300" },
  { mult: 20, symbol: "🍒", label: "20x", weight: 76, neon: "text-rose-400" },
  { mult: 40, symbol: "💰", label: "40x", weight: 38, neon: "text-yellow-300" },
  { mult: 50, symbol: "⭐", label: "50x", weight: 22, neon: "text-amber-200" },
  { mult: 100, symbol: "🔥", label: "100x", weight: 9, neon: "text-orange-400" },
  { mult: 200, symbol: "🔔", label: "200x", weight: 3, neon: "text-fuchsia-400" },
  { mult: 500, symbol: "💎", label: "500x JACKPOT", weight: 0.5, isJackpot: true, neon: "text-cyan-200" },
];

// Filler symbols for the non-winning reel displays.
export const FILLER_SYMBOLS = ["🍒", "🍋", "⭐", "💰", "🔥", "🔔", "💎", "7️⃣", "🍇", "🍊", "🍻", "🎰"];

// Expected multiplier given a win, using the fixed tier weights.
const TOTAL_WEIGHT = PRIZES.reduce((s, p) => s + p.weight, 0);
const EXPECTED_MULT_GIVEN_WIN =
  PRIZES.reduce((s, p) => s + p.weight * p.mult, 0) / TOTAL_WEIGHT;

// Base win-rate that yields ~70% RTP with the fixed tier weights.
export const BASE_WIN_RATE = TARGET_RTP / EXPECTED_MULT_GIVEN_WIN;

// Probability of awarding free spins on any spin (cash or free).
const FREE_SPIN_TRIGGER_PROB = 0.012;
const MAX_FREE_SPINS = 10;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Dynamic tier weights. When the player is AHEAD of the target RTP (error < 0)
 * the big prizes (>=100x) are smoothly suppressed so that recovery happens via
 * small, low-variance prizes. When at/behind target the base weights apply, so
 * jackpots can still hit as a catch-up mechanism. This is what keeps the
 * long-run RTP tightly around 70% without a hard "squeeze".
 */
export function computeDynamicWeights(totalBet: number, totalPaid: number): number[] {
  const rtp = totalBet > 0 ? totalPaid / totalBet : 0;
  const error = TARGET_RTP - rtp; // +ve behind, -ve ahead
  return PRIZES.map((p) => {
    let w = p.weight;
    // Suppress big prizes as soon as we're at/above target so upside variance
    // is starved; suppress harder the further ahead the player is.
    if (error < 0.005 && p.mult >= 100) {
      w *= clamp(1 + (error - 0.005) * 18, 0.004, 1);
    }
    if (error < -0.02 && p.mult >= 50) {
      // clearly ahead → also throttle the 50x tier
      w *= clamp(1 + (error + 0.02) * 10, 0.05, 1);
    }
    return w;
  });
}

/** Expected multiplier given a win, using the dynamic weights. */
function dynamicExpectedMult(weights: number[]): number {
  const num = weights.reduce((s, w, i) => s + w * PRIZES[i].mult, 0);
  const den = weights.reduce((s, w) => s + w, 0);
  return den > 0 ? num / den : EXPECTED_MULT_GIVEN_WIN;
}

/**
 * Dynamic win probability. winRate = (TARGET / dynamicExpectedMult) keeps the
 * EXPECTED payout at the target regardless of how the tier weights shift, then
 * a proportional gain on the RTP error nudges frequency up/down to converge.
 */
export function computeWinRate(totalBet: number, totalPaid: number): number {
  if (totalBet < 300) return BASE_WIN_RATE; // warm-up
  const currentRTP = totalPaid / totalBet;
  const error = TARGET_RTP - currentRTP; // +ve => need to pay more
  const weights = computeDynamicWeights(totalBet, totalPaid);
  const dynE = dynamicExpectedMult(weights);
  const gain = 10;
  let p = (TARGET_RTP / dynE) * (1 + gain * error);
  if (currentRTP < RTP_FLOOR) p = Math.max(p, BASE_WIN_RATE * 3); // catch-up boost
  return clamp(p, 0.001, 0.4);
}

/** Weighted pick of a prize tier from a (possibly filtered) list + custom weights. */
function weightedPick(tiers: PrizeTier[], weights?: number[]): PrizeTier {
  const total = (weights ?? tiers.map((p) => p.weight)).reduce((s, w) => s + w, 0);
  const r = Math.random() * total;
  let acc = 0;
  for (let i = 0; i < tiers.length; i++) {
    acc += weights ? weights[i] : tiers[i].weight;
    if (r <= acc) return tiers[i];
  }
  return tiers[tiers.length - 1];
}

/**
 * Decide the prize for a winning spin. Uses the dynamic tier weights (which
 * suppress big prizes when the player is ahead) and respects the loose safety
 * ceiling: a tier is only eligible if paying it keeps RTP <= RTP_CEILING. If
 * nothing fits the win is downgraded to a loss (null).
 */
export function resolveWinAttempt(
  cost: number,
  totalBet: number,
  totalPaid: number
): PrizeTier | null {
  const room = totalBet * RTP_CEILING - totalPaid; // max additional payout allowed
  const weights = computeDynamicWeights(totalBet, totalPaid);
  // pair each prize with its weight, keep only affordable tiers
  const eligible: { tier: PrizeTier; weight: number }[] = [];
  for (let i = 0; i < PRIZES.length; i++) {
    if (cost * PRIZES[i].mult <= room) eligible.push({ tier: PRIZES[i], weight: weights[i] });
  }
  if (eligible.length === 0) return null; // can't afford even 10x → forced loss
  const total = eligible.reduce((s, e) => s + e.weight, 0);
  const r = Math.random() * total;
  let acc = 0;
  for (const e of eligible) {
    acc += e.weight;
    if (r <= acc) return e.tier;
  }
  return eligible[eligible.length - 1].tier;
}

function randomFiller(): string {
  return FILLER_SYMBOLS[Math.floor(Math.random() * FILLER_SYMBOLS.length)];
}

/** Build the 3-reel payline symbols for a result. */
export function buildReels(won: boolean, symbol: string): string[] {
  if (won) return [symbol, symbol, symbol];
  // losing line: three symbols, guaranteed not all identical
  const a = randomFiller();
  const b = randomFiller();
  let c = randomFiller();
  let guard = 0;
  while (a === b && b === c && guard < 10) {
    c = randomFiller();
    guard++;
  }
  return [a, b, c];
}

export interface SpinInput {
  bet: number; // credits (1-4)
  balance: number; // colones
  freeSpins: number;
  totalBet: number;
  totalPaid: number;
  totalSpins: number;
  sessionPaid: number;
}

export interface SpinResult {
  reels: string[];
  won: boolean;
  prize: PrizeTier | null;
  payout: number; // colones won
  isFree: boolean;
  freeSpinsAwarded: number;
  freeSpinsRemaining: number;
  newBalance: number;
  newTotalBet: number;
  newTotalPaid: number;
  newTotalSpins: number;
  newSessionPaid: number;
  rtpAfter: number;
  cost: number; // colones charged for this spin (0 if free)
}

/**
 * Resolve a single spin. Pure function — does NOT touch the database.
 * The caller persists the resulting counters.
 */
export function resolveSpin(input: SpinInput): SpinResult {
  const bet = clamp(Math.round(input.bet), MIN_BET, MAX_BET);
  const cost = bet * CREDIT_VALUE;
  const isFree = input.freeSpins > 0;

  let balance = input.balance;
  let totalBet = input.totalBet;
  let totalPaid = input.totalPaid;
  let totalSpins = input.totalSpins;
  let sessionPaid = input.sessionPaid;
  let freeSpins = input.freeSpins;

  if (isFree) {
    freeSpins -= 1;
  } else {
    balance -= cost;
    totalBet += cost;
  }
  totalSpins += 1;

  // Decide win using the dynamic win-rate, then enforce the RTP ceiling.
  const winRate = computeWinRate(totalBet, totalPaid);
  const rolledWin = Math.random() < winRate;

  let prize: PrizeTier | null = null;
  let payout = 0;
  let won = false;
  if (rolledWin) {
    prize = resolveWinAttempt(cost, totalBet, totalPaid);
    if (prize) {
      won = true;
      payout = cost * prize.mult;
      balance += payout;
      totalPaid += payout;
      sessionPaid += payout;
    }
  }

  // Maybe award free spins (independent of win/lose).
  let freeSpinsAwarded = 0;
  if (Math.random() < FREE_SPIN_TRIGGER_PROB) {
    freeSpinsAwarded = 1 + Math.floor(Math.random() * 4); // 1..4
    freeSpins = Math.min(MAX_FREE_SPINS, freeSpins + freeSpinsAwarded);
  }

  const symbol = prize ? prize.symbol : "—";
  const reels = buildReels(won, prize ? prize.symbol : "");

  return {
    reels,
    won,
    prize,
    payout,
    isFree,
    freeSpinsAwarded,
    freeSpinsRemaining: freeSpins,
    newBalance: balance,
    newTotalBet: totalBet,
    newTotalPaid: totalPaid,
    newTotalSpins: totalSpins,
    newSessionPaid: sessionPaid,
    rtpAfter: totalBet > 0 ? totalPaid / totalBet : 0,
    cost: isFree ? 0 : cost,
  };
}

export interface SimResult {
  spins: number;
  totalBet: number;
  totalPaid: number;
  rtp: number;
  wins: number;
  jackpots: number;
  freeSpinsUsed: number;
}

/**
 * Run a pure in-memory simulation of N cash spins (plus any free spins they
 * trigger) to validate that the RTP converges to ~70%. Mirrors resolveSpin.
 */
export function simulateSpins(n: number, bet = 1): SimResult {
  let totalBet = 0;
  let totalPaid = 0;
  let freeSpins = 0;
  let wins = 0;
  let jackpots = 0;
  let freeSpinsUsed = 0;
  let cashSpins = 0;
  let resolved = 0;
  const maxResolve = n * 4; // safety cap

  while (cashSpins < n && resolved < maxResolve) {
    const isFree = freeSpins > 0;
    if (isFree) {
      freeSpins -= 1;
      freeSpinsUsed++;
    } else {
      cashSpins++;
    }
    const cost = bet * CREDIT_VALUE;
    if (!isFree) totalBet += cost;

    const winRate = computeWinRate(totalBet, totalPaid);
    if (Math.random() < winRate) {
      const prize = resolveWinAttempt(cost, totalBet, totalPaid);
      if (prize) {
        const payout = cost * prize.mult;
        totalPaid += payout;
        wins++;
        if (prize.isJackpot) jackpots++;
      }
    }
    if (Math.random() < FREE_SPIN_TRIGGER_PROB) {
      freeSpins = Math.min(MAX_FREE_SPINS, freeSpins + 1 + Math.floor(Math.random() * 4));
    }
    resolved++;
  }

  return {
    spins: cashSpins,
    totalBet,
    totalPaid,
    rtp: totalBet > 0 ? totalPaid / totalBet : 0,
    wins,
    jackpots,
    freeSpinsUsed,
  };
}
