import { NextResponse } from "next/server";
import { getState } from "@/lib/machine";

export const dynamic = "force-dynamic";

// GET the current public machine state (no admin secrets).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const shopId = url.searchParams.get("shop") || "singleton";
  const s = await getState(shopId);
  return NextResponse.json({
    balance: s.balance,
    freeSpins: s.freeSpins,
    totalSpins: s.totalSpins,
    rtp: s.totalBet > 0 ? s.totalPaid / s.totalBet : 0,
    totalBet: s.totalBet,
    totalPaid: s.totalPaid,
    sessionPaid: s.sessionPaid,
    active: s.active,
    barBalance: s.barBalance,
    shopName: s.shopName,
  });
}

