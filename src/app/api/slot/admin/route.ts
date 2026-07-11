import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getState } from "@/lib/machine";
import { simulateSpins, CREDIT_VALUE } from "@/lib/slot";

export const dynamic = "force-dynamic";

type Body = {
  action: "login" | "addBalance" | "pay" | "reset" | "stats" | "simulate" | "changePassword" | "history";
  password?: string;
  amount?: number;
  newPassword?: string;
  spins?: number;
};

async function verifyPassword(password: string | undefined) {
  const s = await getState();
  return password === s.adminPassword;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  // --- login (no auth needed, just verifies the password) ---
  if (body.action === "login") {
    const ok = await verifyPassword(body.password);
    return NextResponse.json({ ok });
  }

  // everything else requires the password
  const ok = await verifyPassword(body.password);
  if (!ok) return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });

  switch (body.action) {
    case "addBalance": {
      const amount = Math.round(Number(body.amount ?? 0));
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: "Monto inválido." }, { status: 400 });
      }
      // Round to whole credits to keep multiples of 25 if desired; we allow any positive colones.
      const updated = await db.machineState.update({
        where: { id: "singleton" },
        data: { balance: { increment: amount } },
      });
      return NextResponse.json({ balance: updated.balance, added: amount });
    }

    case "pay": {
      // Owner pays the player their current balance, then resets balance + session counter.
      const s = await getState();
      const paid = s.balance;
      const updated = await db.machineState.update({
        where: { id: "singleton" },
        data: { balance: 0, sessionPaid: 0 },
      });
      return NextResponse.json({ paid, balance: updated.balance });
    }

    case "reset": {
      // Full reset: balance, stats, free spins. Keeps admin password.
      const updated = await db.machineState.update({
        where: { id: "singleton" },
        data: {
          balance: 0,
          totalBet: 0,
          totalPaid: 0,
          sessionPaid: 0,
          totalSpins: 0,
          freeSpins: 0,
        },
      });
      await db.spinLog.deleteMany({});
      return NextResponse.json({ ok: true, state: updated });
    }

    case "stats": {
      const s = await getState();
      return NextResponse.json({
        balance: s.balance,
        totalBet: s.totalBet,
        totalPaid: s.totalPaid,
        sessionPaid: s.sessionPaid,
        totalSpins: s.totalSpins,
        freeSpins: s.freeSpins,
        rtp: s.totalBet > 0 ? s.totalPaid / s.totalBet : 0,
        credits: Math.floor(s.balance / CREDIT_VALUE),
      });
    }

    case "simulate": {
      const n = Math.min(Math.max(Math.round(Number(body.spins ?? 10000)), 100), 100000);
      const res = simulateSpins(n, 1);
      return NextResponse.json(res);
    }

    case "changePassword": {
      const np = (body.newPassword ?? "").trim();
      if (np.length < 3) return NextResponse.json({ error: "Mínimo 3 caracteres." }, { status: 400 });
      await db.machineState.update({
        where: { id: "singleton" },
        data: { adminPassword: np },
      });
      return NextResponse.json({ ok: true });
    }

    case "history": {
      const logs = await db.spinLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 25,
      });
      return NextResponse.json({ logs });
    }

    default:
      return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  }
}
