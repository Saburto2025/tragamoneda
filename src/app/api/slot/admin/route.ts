import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getState } from "@/lib/machine";
import { simulateSpins, CREDIT_VALUE } from "@/lib/slot";

export const dynamic = "force-dynamic";

type Body = {
  action:
    | "login"
    | "addBalance"
    | "pay"
    | "reset"
    | "stats"
    | "simulate"
    | "changePassword"
    | "history"
    | "super_stats"
    | "super_create_shop"
    | "super_toggle_shop"
    | "super_add_bar_balance"
    | "super_reset_shop";
  password?: string;
  shop?: string;
  amount?: number;
  newPassword?: string;
  spins?: number;
  // Fields for super admin creating shop
  newShopId?: string;
  newShopName?: string;
  newShopPassword?: string;
  targetShopId?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const shopId = body.shop || "singleton";
  const passwordInput = body.password ?? "";

  // 1. Check if the user is a Super Admin
  const isSuper = passwordInput === "superadmin123";

  // If trying to log in as super admin, verify and return
  if (body.action === "login" && isSuper) {
    return NextResponse.json({ ok: true, isSuper: true });
  }

  // 2. Handle Super Admin actions
  if (isSuper && body.action.startsWith("super_")) {
    switch (body.action) {
      case "super_stats": {
        const shops = await db.shop.findMany({
          include: { machineState: true },
          orderBy: { createdAt: "desc" },
        });
        return NextResponse.json({ shops });
      }

      case "super_create_shop": {
        const newId = (body.newShopId ?? "").trim().toLowerCase();
        const newName = (body.newShopName ?? "").trim();
        const newPassword = (body.newShopPassword ?? "admin123").trim();
        if (!newId || !newName) {
          return NextResponse.json({ error: "ID y Nombre son obligatorios." }, { status: 400 });
        }
        const exists = await db.shop.findUnique({ where: { id: newId } });
        if (exists) {
          return NextResponse.json({ error: "El ID del negocio ya existe." }, { status: 400 });
        }

        const shop = await db.shop.create({
          data: {
            id: newId,
            name: newName,
            adminPassword: newPassword,
            active: true,
            barBalance: 0,
          },
        });

        // Initialize MachineState
        await db.machineState.create({
          data: {
            id: newId,
            shopId: newId,
            balance: 0,
          },
        });

        return NextResponse.json({ ok: true, shop });
      }

      case "super_toggle_shop": {
        const targetId = body.targetShopId;
        if (!targetId) return NextResponse.json({ error: "ID de negocio no especificado." }, { status: 400 });
        const targetShop = await db.shop.findUnique({ where: { id: targetId } });
        if (!targetShop) return NextResponse.json({ error: "Negocio no encontrado." }, { status: 404 });

        const updated = await db.shop.update({
          where: { id: targetId },
          data: { active: !targetShop.active },
        });
        return NextResponse.json({ ok: true, active: updated.active });
      }

      case "super_add_bar_balance": {
        const targetId = body.targetShopId;
        const amount = Math.round(Number(body.amount ?? 0));
        if (!targetId) return NextResponse.json({ error: "ID de negocio no especificado." }, { status: 400 });
        if (amount <= 0) return NextResponse.json({ error: "Monto inválido." }, { status: 400 });

        const updated = await db.shop.update({
          where: { id: targetId },
          data: { barBalance: { increment: amount } },
        });
        return NextResponse.json({ ok: true, barBalance: updated.barBalance });
      }

      case "super_reset_shop": {
        const targetId = body.targetShopId;
        if (!targetId) return NextResponse.json({ error: "ID de negocio no especificado." }, { status: 400 });

        await db.machineState.update({
          where: { shopId: targetId },
          data: {
            balance: 0,
            totalBet: 0,
            totalPaid: 0,
            sessionPaid: 0,
            totalSpins: 0,
            freeSpins: 0,
          },
        });
        await db.spinLog.deleteMany({ where: { shopId: targetId } });
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: "Acción de super admin desconocida." }, { status: 400 });
    }
  }

  // 3. For normal shop actions, verify credentials
  const shopData = await getState(shopId);
  const isShopAdmin = passwordInput === shopData.adminPassword;

  // Login action verification
  if (body.action === "login") {
    return NextResponse.json({ ok: isShopAdmin, isSuper: false });
  }

  // Any action other than login and super admin actions requires authorization
  if (!isSuper && !isShopAdmin) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }

  switch (body.action) {
    case "addBalance": {
      const amount = Math.round(Number(body.amount ?? 0));
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: "Monto inválido." }, { status: 400 });
      }

      // Verify that the bar has enough barBalance
      const shop = await db.shop.findUnique({ where: { id: shopId } });
      if (!shop) return NextResponse.json({ error: "Negocio no encontrado." }, { status: 404 });
      if (shop.barBalance < amount) {
        return NextResponse.json({ error: "Saldo del Bar insuficiente. Compre más saldo." }, { status: 400 });
      }

      // Atomically decrement shop.barBalance and increment machineState.balance
      const updated = await db.$transaction(async (tx) => {
        await tx.shop.update({
          where: { id: shopId },
          data: { barBalance: { decrement: amount } },
        });

        return await tx.machineState.update({
          where: { shopId: shopId },
          data: { balance: { increment: amount } },
        });
      });

      return NextResponse.json({ balance: updated.balance, added: amount, barBalance: shop.barBalance - amount });
    }

    case "pay": {
      const paid = shopData.balance;
      const updated = await db.machineState.update({
        where: { shopId: shopId },
        data: { balance: 0, sessionPaid: 0 },
      });
      return NextResponse.json({ paid, balance: updated.balance });
    }

    case "reset": {
      const updated = await db.machineState.update({
        where: { shopId: shopId },
        data: {
          balance: 0,
          totalBet: 0,
          totalPaid: 0,
          sessionPaid: 0,
          totalSpins: 0,
          freeSpins: 0,
        },
      });
      await db.spinLog.deleteMany({ where: { shopId: shopId } });
      return NextResponse.json({ ok: true, state: updated });
    }

    case "stats": {
      return NextResponse.json({
        balance: shopData.balance,
        totalBet: shopData.totalBet,
        totalPaid: shopData.totalPaid,
        sessionPaid: shopData.sessionPaid,
        totalSpins: shopData.totalSpins,
        freeSpins: shopData.freeSpins,
        rtp: shopData.totalBet > 0 ? shopData.totalPaid / shopData.totalBet : 0,
        credits: Math.floor(shopData.balance / CREDIT_VALUE),
        barBalance: shopData.barBalance,
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
      await db.shop.update({
        where: { id: shopId },
        data: { adminPassword: np },
      });
      return NextResponse.json({ ok: true });
    }

    case "history": {
      const logs = await db.spinLog.findMany({
        where: { shopId: shopId },
        orderBy: { createdAt: "desc" },
        take: 25,
      });
      return NextResponse.json({ logs });
    }

    default:
      return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  }
}

