import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getState } from "@/lib/machine";
import { resolveSpin, MIN_BET, MAX_BET, CREDIT_VALUE } from "@/lib/slot";

export const dynamic = "force-dynamic";

// POST /api/slot/spin  { bet: number }
export async function POST(req: Request) {
  let body: { bet?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const bet = Math.round(Number(body.bet ?? 1));
  if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
    return NextResponse.json({ error: "Apuesta inválida (1-4 créditos)." }, { status: 400 });
  }

  // Atomic read-resolve-write so two rapid spins can't race.
  const result = await db.$transaction(async (tx) => {
    const s = await tx.machineState.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });

    const isFree = s.freeSpins > 0;
    const cost = bet * CREDIT_VALUE;
    if (!isFree && s.balance < cost) {
      throw new Error("SALDO_INSUFICIENTE");
    }

    const spin = resolveSpin({
      bet,
      balance: s.balance,
      freeSpins: s.freeSpins,
      totalBet: s.totalBet,
      totalPaid: s.totalPaid,
      totalSpins: s.totalSpins,
      sessionPaid: s.sessionPaid,
    });

    const updated = await tx.machineState.update({
      where: { id: "singleton" },
      data: {
        balance: spin.newBalance,
        freeSpins: spin.freeSpinsRemaining,
        totalBet: spin.newTotalBet,
        totalPaid: spin.newTotalPaid,
        totalSpins: spin.newTotalSpins,
        sessionPaid: spin.newSessionPaid,
      },
    });

    await tx.spinLog.create({
      data: {
        bet,
        isFree: spin.isFree,
        mult: spin.prize ? spin.prize.mult : 0,
        payout: spin.payout,
        symbol: spin.prize ? spin.prize.symbol : "—",
        rtp: spin.rtpAfter,
      },
    });

    return { spin, updated };
  }).catch((e: unknown) => {
    if (e instanceof Error && e.message === "SALDO_INSUFICIENTE") return { error: "SALDO_INSUFICIENTE" } as const;
    throw e;
  });

  if ("error" in result) {
    return NextResponse.json({ error: "Saldo insuficiente. Compre más créditos." }, { status: 402 });
  }

  const { spin, updated } = result;
  return NextResponse.json({
    reels: spin.reels,
    won: spin.won,
    prize: spin.prize
      ? { mult: spin.prize.mult, symbol: spin.prize.symbol, label: spin.prize.label, isJackpot: !!spin.prize.isJackpot, neon: spin.prize.neon }
      : null,
    payout: spin.payout,
    isFree: spin.isFree,
    cost: spin.cost,
    freeSpinsAwarded: spin.freeSpinsAwarded,
    balance: updated.balance,
    freeSpins: updated.freeSpins,
    rtp: updated.totalBet > 0 ? updated.totalPaid / updated.totalBet : 0,
    totalSpins: updated.totalSpins,
  });
}
