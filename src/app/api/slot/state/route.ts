import { NextResponse } from "next/server";
import { getState } from "@/lib/machine";

export const dynamic = "force-dynamic";

// GET the current public machine state (no admin secrets).
export async function GET() {
  const s = await getState();
  return NextResponse.json({
    balance: s.balance,
    freeSpins: s.freeSpins,
    totalSpins: s.totalSpins,
    rtp: s.totalBet > 0 ? s.totalPaid / s.totalBet : 0,
    totalBet: s.totalBet,
    totalPaid: s.totalPaid,
    sessionPaid: s.sessionPaid,
  });
}
