"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import {
  Lock,
  Wallet,
  BarChart3,
  HandCoins,
  RotateCcw,
  KeyRound,
  FlaskConical,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { CREDIT_VALUE } from "@/lib/slot";

interface AdminPanelProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onStateChanged: () => void;
}

const fmt = (n: number) => "₡" + n.toLocaleString("es-CR");

export function AdminPanel({ open, onOpenChange, onStateChanged }: AdminPanelProps) {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);

  // stats
  const [stats, setStats] = useState<{
    balance: number;
    totalBet: number;
    totalPaid: number;
    sessionPaid: number;
    totalSpins: number;
    freeSpins: number;
    rtp: number;
    credits: number;
  } | null>(null);

  // add balance
  const [addAmt, setAddAmt] = useState("");

  // change password
  const [newPw, setNewPw] = useState("");

  // simulation
  const [simSpins, setSimSpins] = useState("10000");
  const [simResult, setSimResult] = useState<null | {
    spins: number;
    totalBet: number;
    totalPaid: number;
    rtp: number;
    wins: number;
    jackpots: number;
    freeSpinsUsed: number;
  }>(null);

  // history
  const [logs, setLogs] = useState<Array<{ id: string; bet: number; isFree: boolean; mult: number; payout: number; symbol: string; rtp: number; createdAt: string }>>([]);

  async function call(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const res = await fetch("/api/slot/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, password, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error ?? "Error", variant: "destructive" });
        return null;
      }
      return data;
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function doLogin() {
    const data = await call("login");
    if (data?.ok) {
      setUnlocked(true);
      toast({ title: "Acceso concedido", description: "Panel de administración desbloqueado." });
      await refreshStats();
      await refreshHistory();
    } else {
      toast({ title: "Acceso denegado", description: "Contraseña incorrecta.", variant: "destructive" });
    }
  }

  async function refreshStats() {
    const data = await call("stats");
    if (data) setStats(data);
  }

  async function refreshHistory() {
    const data = await call("history");
    if (data) setLogs(data.logs);
  }

  async function doAddBalance() {
    const amt = Math.round(Number(addAmt));
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ title: "Monto inválido", variant: "destructive" });
      return;
    }
    const data = await call("addBalance", { amount: amt });
    if (data) {
      toast({ title: "Saldo agregado", description: `Se añadieron ${fmt(amt)} (₡${data.balance} en total).` });
      setAddAmt("");
      await refreshStats();
      onStateChanged();
    }
  }

  async function doPay() {
    const data = await call("pay");
    if (data) {
      toast({ title: "Pago realizado", description: `Se pagaron ${fmt(data.paid)} al jugador. Contador reiniciado.` });
      await refreshStats();
      onStateChanged();
    }
  }

  async function doReset() {
    const data = await call("reset");
    if (data) {
      toast({ title: "Sistema reseteado", description: "Saldo y estadísticas reiniciados." });
      await refreshStats();
      onStateChanged();
    }
  }

  async function doChangePw() {
    if (newPw.trim().length < 3) {
      toast({ title: "Mínimo 3 caracteres", variant: "destructive" });
      return;
    }
    const data = await call("changePassword", { newPassword: newPw });
    if (data?.ok) {
      toast({ title: "Contraseña actualizada" });
      setNewPw("");
    }
  }

  async function doSimulate() {
    const n = Number(simSpins);
    const data = await call("simulate", { spins: n });
    if (data) setSimResult(data);
  }

  function handleClose(o: boolean) {
    onOpenChange(o);
    if (!o) {
      // keep unlocked state during session but close dialog
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl bg-zinc-950/95 border-amber-500/40 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-300 text-xl">
            <ShieldCheck className="h-5 w-5" /> Panel de Administración
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Acceso restringido — solo el dueño de la máquina.
          </DialogDescription>
        </DialogHeader>

        {!unlocked ? (
          <div className="space-y-4 py-2">
            <Label className="text-zinc-300 flex items-center gap-2">
              <Lock className="h-4 w-4" /> Contraseña de administrador
            </Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doLogin()}
                placeholder="••••••••"
                className="bg-zinc-900 border-zinc-700"
                autoFocus
              />
              <Button onClick={doLogin} disabled={busy} className="bg-amber-500 text-black hover:bg-amber-400">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
              </Button>
            </div>
            <p className="text-xs text-zinc-500">
              Contraseña por defecto: <code className="text-amber-300">admin123</code> (cámbiala tras el primer ingreso).
            </p>
          </div>
        ) : (
          <Tabs defaultValue="caja" className="w-full" onValueChange={(v) => { if (v === "stats") { refreshStats(); refreshHistory(); } }}>
            <TabsList className="grid grid-cols-2 sm:grid-cols-5 bg-zinc-900 border border-zinc-800 h-auto">
              <TabsTrigger value="caja" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-zinc-300">
                <HandCoins className="h-4 w-4 mr-1" /> Caja
              </TabsTrigger>
              <TabsTrigger value="saldo" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-zinc-300">
                <Wallet className="h-4 w-4 mr-1" /> Saldo
              </TabsTrigger>
              <TabsTrigger value="stats" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-zinc-300">
                <BarChart3 className="h-4 w-4 mr-1" /> Stats
              </TabsTrigger>
              <TabsTrigger value="sim" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-zinc-300">
                <FlaskConical className="h-4 w-4 mr-1" /> Simul.
              </TabsTrigger>
              <TabsTrigger value="config" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-zinc-300 col-span-2 sm:col-span-1">
                <KeyRound className="h-4 w-4 mr-1" /> Config
              </TabsTrigger>
            </TabsList>

            {/* Caja — pay the player & reset session */}
            <TabsContent value="caja" className="space-y-4">
              <div className="rounded-lg border border-amber-500/30 bg-zinc-900/60 p-4">
                <p className="text-zinc-400 text-sm">Saldo actual del jugador</p>
                <p className="text-3xl font-bold text-emerald-400">{stats ? fmt(stats.balance) : "—"}</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Equivale a {stats ? stats.credits : 0} créditos (₡{CREDIT_VALUE} c/u).
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                <p className="text-zinc-400 text-sm">Premios pagados esta sesión (desde último pago)</p>
                <p className="text-2xl font-bold text-amber-300">{stats ? fmt(stats.sessionPaid) : "—"}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={doPay} disabled={busy} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                  <HandCoins className="h-4 w-4 mr-2" /> Pagar y reiniciar contador
                </Button>
                <Button onClick={doReset} disabled={busy} variant="destructive">
                  <RotateCcw className="h-4 w-4 mr-2" /> Reset total (saldo + stats)
                </Button>
              </div>
              <p className="text-xs text-zinc-500">
                <strong>Pagar</strong> entrega el saldo al jugador y reinicia el contador de la sesión. Las estadísticas de RTP se conservan.
                <strong> Reset total</strong> borra todo (usar solo cuando sea necesario).
              </p>
            </TabsContent>

            {/* Saldo — add credits */}
            <TabsContent value="saldo" className="space-y-4">
              <Label className="text-zinc-300">Agregar saldo digital (colones)</Label>
              <div className="flex flex-wrap gap-2">
                {[1000, 2500, 5000, 10000].map((v) => (
                  <Button key={v} variant="outline" className="border-zinc-700 text-zinc-200 hover:bg-zinc-800" onClick={() => setAddAmt(String(v))}>
                    ₡{v.toLocaleString("es-CR")}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={addAmt}
                  onChange={(e) => setAddAmt(e.target.value)}
                  placeholder="Monto en colones"
                  className="bg-zinc-900 border-zinc-700"
                />
                <Button onClick={doAddBalance} disabled={busy} className="bg-amber-500 text-black hover:bg-amber-400">
                  <Wallet className="h-4 w-4 mr-1" /> Agregar
                </Button>
              </div>
              <p className="text-xs text-zinc-500">
                Saldo actual: <span className="text-emerald-400 font-semibold">{stats ? fmt(stats.balance) : "—"}</span> ·{" "}
                {stats ? stats.credits : 0} créditos.
              </p>
            </TabsContent>

            {/* Stats */}
            <TabsContent value="stats" className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Total jugado" value={stats ? fmt(stats.totalBet) : "—"} color="text-zinc-200" />
                <Stat label="Total pagado" value={stats ? fmt(stats.totalPaid) : "—"} color="text-amber-300" />
                <Stat label="RTP real" value={stats ? (stats.rtp * 100).toFixed(2) + "%" : "—"} color={stats && stats.rtp > 0.65 && stats.rtp < 0.75 ? "text-emerald-400" : "text-amber-300"} />
                <Stat label="Ganancia casa (30%)" value={stats ? fmt(Math.round(stats.totalBet * 0.3)) : "—"} color="text-fuchsia-400" />
                <Stat label="Tiros totales" value={stats ? stats.totalSpins.toLocaleString("es-CR") : "—"} color="text-zinc-200" />
                <Stat label="Tiros gratis disp." value={stats ? String(stats.freeSpins) : "—"} color="text-cyan-300" />
              </div>
              <Separator className="bg-zinc-800" />
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-400">Últimos 25 tiros</p>
                <Button variant="ghost" size="sm" className="text-amber-300" onClick={refreshHistory}>
                  Refrescar
                </Button>
              </div>
              <ScrollArea className="h-40 rounded-md border border-zinc-800 bg-zinc-900/60">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
                    <tr>
                      <th className="p-2 text-left">Hora</th>
                      <th className="p-2 text-left">Apuesta</th>
                      <th className="p-2 text-left">Tipo</th>
                      <th className="p-2 text-left">Símbolo</th>
                      <th className="p-2 text-right">Mult</th>
                      <th className="p-2 text-right">Pago</th>
                      <th className="p-2 text-right">RTP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-4 text-center text-zinc-500">Sin registros aún.</td>
                      </tr>
                    )}
                    {logs.map((l) => (
                      <tr key={l.id} className="border-t border-zinc-800/60">
                        <td className="p-2 text-zinc-400">{new Date(l.createdAt).toLocaleTimeString("es-CR")}</td>
                        <td className="p-2">{l.bet}c</td>
                        <td className="p-2">{l.isFree ? <Badge className="bg-cyan-600">Gratis</Badge> : <Badge variant="outline" className="text-zinc-400">Normal</Badge>}</td>
                        <td className="p-2 text-lg">{l.symbol}</td>
                        <td className="p-2 text-right">{l.mult > 0 ? l.mult + "x" : "—"}</td>
                        <td className="p-2 text-right text-amber-300">{l.payout > 0 ? fmt(l.payout) : "—"}</td>
                        <td className="p-2 text-right text-zinc-400">{(l.rtp * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </TabsContent>

            {/* Simulation */}
            <TabsContent value="sim" className="space-y-4">
              <p className="text-sm text-zinc-400">
                Ejecuta una simulación pura (sin afectar la máquina real) para verificar que el RTP converge al 70%.
              </p>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-zinc-300">Número de tiros</Label>
                  <Input type="number" value={simSpins} onChange={(e) => setSimSpins(e.target.value)} className="bg-zinc-900 border-zinc-700" />
                </div>
                <Button onClick={doSimulate} disabled={busy} className="bg-amber-500 text-black hover:bg-amber-400">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-1" />} Simular
                </Button>
              </div>
              {simResult && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-amber-500/30 bg-zinc-900/60 p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Tiros simulados</span>
                    <span className="font-semibold">{simResult.spins.toLocaleString("es-CR")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Total apostado</span>
                    <span className="font-semibold">{fmt(simResult.totalBet)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Total pagado</span>
                    <span className="font-semibold text-amber-300">{fmt(simResult.totalPaid)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">RTP resultante</span>
                    <span className={`font-bold text-lg ${Math.abs(simResult.rtp - 0.7) <= 0.01 ? "text-emerald-400" : "text-amber-300"}`}>
                      {(simResult.rtp * 100).toFixed(3)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Premios ganados</span>
                    <span className="font-semibold">{simResult.wins.toLocaleString("es-CR")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Jackpots (500x)</span>
                    <span className="font-semibold text-cyan-300">{simResult.jackpots}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Tiros gratis usados</span>
                    <span className="font-semibold text-cyan-300">{simResult.freeSpinsUsed}</span>
                  </div>
                  <p className={`text-xs pt-1 ${Math.abs(simResult.rtp - 0.7) <= 0.01 ? "text-emerald-400" : "text-amber-400"}`}>
                    {Math.abs(simResult.rtp - 0.7) <= 0.01
                      ? "✓ Dentro de la tolerancia ±1% — regla del 30% cumplida."
                      : "⚠ Fuera de ±1%. Ejecuta más tiros para mayor convergencia."}
                  </p>
                </motion.div>
              )}
            </TabsContent>

            {/* Config */}
            <TabsContent value="config" className="space-y-4">
              <Label className="text-zinc-300">Cambiar contraseña de administrador</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="Nueva contraseña"
                  className="bg-zinc-900 border-zinc-700"
                />
                <Button onClick={doChangePw} disabled={busy} className="bg-amber-500 text-black hover:bg-amber-400">
                  <KeyRound className="h-4 w-4 mr-1" /> Guardar
                </Button>
              </div>
              <Separator className="bg-zinc-800" />
              <Button variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => { setUnlocked(false); setPassword(""); }}>
                <Lock className="h-4 w-4 mr-1" /> Bloquear panel
              </Button>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
