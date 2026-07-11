import { db } from "@/lib/db";

/** Get the singleton machine state, creating it on first access. */
export async function getState() {
  const state = await db.machineState.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
  return state;
}

export type MachineState = Awaited<ReturnType<typeof getState>>;
