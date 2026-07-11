import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getState } from "@/lib/machine";
import { resolveSpin, MIN_BET, MAX_BET, CREDIT_VALUE } from "@/lib/slot";

export const dynamic = "force-dynamic";

// POST /api/slot/spin  { bet: number, shop?: string }
export async function POST(req: Request) {
  let body: { bet?: number; shop?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const bet = Math.round(Number(body.bet ?? 1));
  if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
    return NextResponse.json({ error: "Apuesta inválida (1-4 créditos)." }, { status: 400 });
  }

  const shopId = body.shop || "singleton";

  // Check if shop is active
  const shop = await db.shop.findUnique({ where: { id: shopId } });
  if (shop && !shop.active) {
    return NextResponse.json({ error: "Este negocio está desactivado. Contacte al administrador." }, { status: 403 });
  }

  // Atomic read-resolve-write so two rapid spins can't race.
  const result = await db.$transaction(async (tx) => {
    // Ensure shop exists in transaction context
    await tx.shop.upsert({
      where: { id: shopId },
      update: {},
      create: {
        id: shopId,
        name: shopId === "singleton" ? "Lucky Diamond Bar" : `Negocio ${shopId}`,
        adminPassword: "admin123",
        barBalance: 50000,
        active: true,
      },
    });

    const s = await tx.machineState.upsert({
      where: { shopId: shopId },
      update: {},
      create: {
        id: shopId,
        shopId: shopId,
        balance: 0,
        totalBet: 0,
        totalPaid: 0,
        sessionPaid: 0,
        totalSpins: 0,
        freeSpins: 0,
      },
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
      where: { shopId: shopId },
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
        shopId,
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

