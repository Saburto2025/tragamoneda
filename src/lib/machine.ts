import { db } from "@/lib/db";

/** Get the shop and machine state, creating them on first access if needed. */
export async function getState(shopId = "singleton") {
  // First, ensure the Shop exists
  let shop = await db.shop.findUnique({
    where: { id: shopId },
  });

  if (!shop) {
    shop = await db.shop.create({
      data: {
        id: shopId,
        name: shopId === "singleton" ? "Lucky Diamond Bar" : `Negocio ${shopId}`,
        adminPassword: "admin123",
        barBalance: 50000, // Saldo inicial gratuito para demostración/pruebas
        active: true,
      },
    });
  }

  // Next, ensure the MachineState exists for this shop
  const state = await db.machineState.upsert({
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

  return {
    ...state,
    adminPassword: shop.adminPassword,
    active: shop.active,
    barBalance: shop.barBalance,
    shopName: shop.name,
  };
}

export type MachineState = Awaited<ReturnType<typeof getState>>;
