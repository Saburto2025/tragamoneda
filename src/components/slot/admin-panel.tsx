"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  Building2,
  PlusCircle,
  DollarSign,
} from "lucide-react";
import { CREDIT_VALUE } from "@/lib/slot";

interface AdminPanelProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onStateChanged: () => void;
  shopId: string;
}

const fmt = (n: number) => "₡" + n.toLocaleString("es-CR");

export function AdminPanel({ open, onOpenChange, onStateChanged, shopId }: AdminPanelProps) {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [isSuper, setIsSuper] = useState(false);
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
    barBalance: number;
  } | null>(null);

  // add balance (credits) to slot machine from bar balance
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

  // Super Admin state
  const [shops, setShops] = useState<Array<{
    id: string;
    name: string;
    active: boolean;
    barBalance: number;
    adminPassword: string;
    machineState: {
      balance: number;
      totalBet: number;
      totalPaid: number;
      sessionPaid: number;
      totalSpins: number;
    } | null;
  }>>([]);

  // Super Admin create shop form
  const [newShopId, setNewShopId] = useState("");
  const [newShopName, setNewShopName] = useState("");
  const [newShopPassword, setNewShopPassword] = useState("admin123");

  // Super Admin add bar balance form
  const [superAddAmt, setSuperAddAmt] = useState("");
  const [selectedShopId, setSelectedShopId] = useState("");

  async function call(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const res = await fetch("/api/slot/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, password, shop: shopId, ...extra }),
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
      setIsSuper(!!data.isSuper);
      toast({
        title: "Acceso concedido",
        description: data.isSuper ? "Panel de Super Administrador desbloqueado." : "Panel de administración desbloqueado.",
      });
      if (data.isSuper) {
        await refreshSuperStats();
      } else {
        await refreshStats();
        await refreshHistory();
      }
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

  // Super Admin stats refresh
  async function refreshSuperStats() {
    const data = await call("super_stats");
    if (data) setShops(data.shops);
  }

  async function doAddBalance() {
    const amt = Math.round(Number(addAmt));
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ title: "Monto inválido", variant: "destructive" });
      return;
    }
    const data = await call("addBalance", { amount: amt });
    if (data) {
      toast({
        title: "Saldo cargado a la máquina",
        description: `Se cargaron ${fmt(amt)} desde tu saldo del bar.`,
      });
      setAddAmt("");
      await refreshStats();
      onStateChanged();
    }
  }

  async function doPay() {
    const data = await call("pay");
    if (data) {
      toast({ title: "Pago realizado", description: `Se pagaron ${fmt(data.paid)} al jugador. Contador de sesión reiniciado.` });
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

  // Super Admin: Create shop
  async function doSuperCreateShop() {
    if (!newShopId.trim() || !newShopName.trim()) {
      toast({ title: "Faltan datos", description: "ID y Nombre son necesarios", variant: "destructive" });
      return;
    }
    const data = await call("super_create_shop", {
      newShopId: newShopId,
      newShopName: newShopName,
      newShopPassword: newShopPassword,
    });
    if (data) {
      toast({ title: "Negocio creado", description: `Se creó exitosamente el negocio ${newShopName}.` });
      setNewShopId("");
      setNewShopName("");
      setNewShopPassword("admin123");
      await refreshSuperStats();
    }
  }

  // Super Admin: Toggle shop status
  async function doSuperToggleShop(id: string) {
    const data = await call("super_toggle_shop", { targetShopId: id });
    if (data) {
      toast({
        title: "Estado actualizado",
        description: `Negocio ${data.active ? "Activado" : "Desactivado"}.`,
      });
      await refreshSuperStats();
    }
  }

  // Super Admin: Sell/Add bar balance
  async function doSuperAddBarBalance() {
    const amt = Math.round(Number(superAddAmt));
    if (!selectedShopId) {
      toast({ title: "Error", description: "Selecciona un negocio.", variant: "destructive" });
      return;
    }
    if (amt <= 0) {
      toast({ title: "Error", description: "Monto inválido.", variant: "destructive" });
      return;
    }

    const data = await call("super_add_bar_balance", {
      targetShopId: selectedShopId,
      amount: amt,
    });
    if (data) {
      toast({
        title: "Saldo recargado",
        description: `Se vendieron ${fmt(amt)} de saldo al negocio. Nuevo saldo: ${fmt(data.barBalance)}`,
      });
      setSuperAddAmt("");
      await refreshSuperStats();
    }
  }

  // Super Admin: Reset shop wagers/history
  async function doSuperResetShop(id: string, name: string) {
    if (!confirm(`¿Está seguro de reiniciar por completo el negocio ${name}? Se perderán todas las estadísticas y el saldo de la máquina.`)) return;
    const data = await call("super_reset_shop", { targetShopId: id });
    if (data) {
      toast({ title: "Negocio reiniciado", description: `Métricas de ${name} restablecidas a cero.` });
      await refreshSuperStats();
    }
  }

  function handleClose(o: boolean) {
    onOpenChange(o);
    if (!o) {
      setUnlocked(false);
      setPassword("");
    }
  }

  // Split profits: 70% Bar Owner / 30% SaaS Owner
  const netProfit = stats ? stats.totalBet - stats.totalPaid : 0;
  const barShare = netProfit > 0 ? netProfit * 0.7 : 0;
  const saasShare = netProfit > 0 ? netProfit * 0.3 : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl bg-zinc-950/95 border-amber-500/40 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-300 text-xl">
            <ShieldCheck className="h-5 w-5" /> Panel de Administración {isSuper && "(SaaS MASTER)"}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {isSuper
              ? "Bienvenido, Administrador de la plataforma SaaS."
              : `Ajustes del bar · Negocio ID: ${shopId}`}
          </DialogDescription>
        </DialogHeader>

        {!unlocked ? (
          <div className="space-y-4 py-2">
            <Label className="text-zinc-300 flex items-center gap-2">
              <Lock className="h-4 w-4" /> Contraseña del sistema
            </Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doLogin()}
                placeholder="••••••••"
                className="bg-zinc-900 border-zinc-700 font-mono"
                autoFocus
              />
              <Button onClick={doLogin} disabled={busy} className="bg-amber-500 text-black hover:bg-amber-400">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
              </Button>
            </div>
            <p className="text-xs text-zinc-500">
              Ingresa la contraseña del negocio o la contraseña maestra de Super Admin.
            </p>
          </div>
        ) : isSuper ? (
          /* ================= SUPER ADMIN TAB VIEW ================= */
          <Tabs defaultValue="shops" className="w-full" onValueChange={(v) => { if (v === "shops") refreshSuperStats(); }}>
            <TabsList className="grid grid-cols-4 bg-zinc-900 border border-zinc-800 h-auto p-1 rounded-xl">
              <TabsTrigger value="shops" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-xs sm:text-sm text-zinc-300 py-2">
                <Building2 className="h-4 w-4 mr-1" /> Negocios
              </TabsTrigger>
              <TabsTrigger value="crear" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-xs sm:text-sm text-zinc-300 py-2">
                <PlusCircle className="h-4 w-4 mr-1" /> Crear Bar
              </TabsTrigger>
              <TabsTrigger value="saldo_bar" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-xs sm:text-sm text-zinc-300 py-2">
                <DollarSign className="h-4 w-4 mr-1" /> Cargar Saldo
              </TabsTrigger>
              <TabsTrigger value="sim" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-xs sm:text-sm text-zinc-300 py-2">
                <FlaskConical className="h-4 w-4 mr-1" /> Simulador
              </TabsTrigger>
            </TabsList>

            {/* List of Shops */}
            <TabsContent value="shops" className="space-y-4 pt-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Monitoreo de Bares Afiliados</h3>
                <Button variant="ghost" size="sm" className="text-amber-300 h-7" onClick={refreshSuperStats}>
                  Refrescar
                </Button>
              </div>
              <ScrollArea className="h-[260px] rounded-lg border border-zinc-800 bg-zinc-950">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
                    <tr className="text-left">
                      <th className="p-3">ID / Nombre</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3 text-right">Saldo Bar</th>
                      <th className="p-3 text-right">Saldo Máquina</th>
                      <th className="p-3 text-right">Wager Total</th>
                      <th className="p-3 text-right">RTP Acum.</th>
                      <th className="p-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shops.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-zinc-500">No hay negocios registrados.</td>
                      </tr>
                    )}
                    {shops.map((s) => {
                      const w = s.machineState?.totalBet ?? 0;
                      const p = s.machineState?.totalPaid ?? 0;
                      const rtp = w > 0 ? (p / w) * 100 : 0;
                      return (
                        <tr key={s.id} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                          <td className="p-3 font-semibold">
                            <span className="text-amber-300 font-mono block">{s.id}</span>
                            <span className="text-zinc-400 block text-[10px]">{s.name}</span>
                          </td>
                          <td className="p-3">
                            <Badge className={s.active ? "bg-emerald-500/20 text-emerald-400 border border-emerald-400/40" : "bg-rose-500/20 text-rose-400 border border-rose-400/40"}>
                              {s.active ? "Activo" : "Desactivado"}
                            </Badge>
                          </td>
                          <td className="p-3 text-right text-cyan-300 font-mono">{fmt(s.barBalance)}</td>
                          <td className="p-3 text-right text-emerald-400 font-mono">{fmt(s.machineState?.balance ?? 0)}</td>
                          <td className="p-3 text-right font-mono">{fmt(w)}</td>
                          <td className="p-3 text-right font-mono">{rtp.toFixed(1)}%</td>
                          <td className="p-3 text-center flex items-center justify-center gap-1.5">
                            <Button size="sm" variant="outline" className={`h-7 px-2 ${s.active ? "border-rose-950 text-rose-400 hover:bg-rose-950/20" : "border-emerald-950 text-emerald-400 hover:bg-emerald-950/20"}`} onClick={() => doSuperToggleShop(s.id)}>
                              {s.active ? "Desactivar" : "Activar"}
                            </Button>
                            <Button size="sm" variant="destructive" className="h-7 px-2" onClick={() => doSuperResetShop(s.id, s.name)}>
                              Reiniciar
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>
            </TabsContent>

            {/* Create Shop */}
            <TabsContent value="crear" className="space-y-4 pt-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-4">
                <h3 className="text-sm font-bold text-amber-300">Registrar Nuevo Bar</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="shopId">ID único del bar (sin espacios/minúsculas)</Label>
                    <Input id="shopId" placeholder="ej. bar-luces" value={newShopId} onChange={(e) => setNewShopId(e.target.value)} className="bg-zinc-900 border-zinc-700 font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="shopName">Nombre comercial</Label>
                    <Input id="shopName" placeholder="ej. Bar Las Luces" value={newShopName} onChange={(e) => setNewShopName(e.target.value)} className="bg-zinc-900 border-zinc-700" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="shopPw">Contraseña inicial de administrador</Label>
                    <Input id="shopPw" type="password" value={newShopPassword} onChange={(e) => setNewShopPassword(e.target.value)} className="bg-zinc-900 border-zinc-700 font-mono" />
                  </div>
                </div>
                <Button onClick={doSuperCreateShop} className="bg-amber-500 text-black hover:bg-amber-400 w-full sm:w-auto">
                  Crear Negocio
                </Button>
              </div>
            </TabsContent>

            {/* Sell Balance to Bar */}
            <TabsContent value="saldo_bar" className="space-y-4 pt-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-4">
                <h3 className="text-sm font-bold text-amber-300">Venta de Saldo de Recargas a Negocios</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Selecciona el Negocio</Label>
                    <select
                      value={selectedShopId}
                      onChange={(e) => setSelectedShopId(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="">-- Seleccionar --</option>
                      {shops.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.id}) - Actual: {fmt(s.barBalance)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Monto en Colones de Saldo a Cargar</Label>
                    <Input type="number" placeholder="ej. 50000" value={superAddAmt} onChange={(e) => setSuperAddAmt(e.target.value)} className="bg-zinc-900 border-zinc-700" />
                  </div>
                </div>
                <div className="flex gap-2">
                  {[20000, 50000, 100000, 200000].map((v) => (
                    <Button key={v} size="sm" variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => setSuperAddAmt(String(v))}>
                      ₡{v.toLocaleString("es-CR")}
                    </Button>
                  ))}
                </div>
                <Separator className="bg-zinc-800" />
                <div className="text-[11px] text-zinc-400">
                  <span>Nota: El bar te pagará el 30% del valor cargado (ej. por 100.000 colones de saldo, te pagará 30.000 colones en efectivo).</span>
                </div>
                <Button onClick={doSuperAddBarBalance} className="bg-cyan-600 text-white hover:bg-cyan-500 w-full sm:w-auto">
                  Cargar Saldo y Registrar Venta
                </Button>
              </div>
            </TabsContent>

            {/* Simulator Tab for Super */}
            <TabsContent value="sim" className="space-y-4 pt-3">
              <Label className="text-zinc-300">Tiros simulados</Label>
              <div className="flex gap-2">
                <Input type="number" value={simSpins} onChange={(e) => setSimSpins(e.target.value)} className="bg-zinc-900 border-zinc-700" />
                <Button onClick={doSimulate} className="bg-amber-500 text-black hover:bg-amber-400">
                  Simular
                </Button>
              </div>
              {simResult && (
                <ScrollArea className="max-h-48 border border-zinc-800 rounded p-3 text-xs space-y-1 bg-zinc-950 font-mono">
                  <div className="flex justify-between"><span>Giros:</span> <span>{simResult.spins}</span></div>
                  <div className="flex justify-between"><span>Jugado:</span> <span>{fmt(simResult.totalBet)}</span></div>
                  <div className="flex justify-between"><span>Premios:</span> <span className="text-amber-300">{fmt(simResult.totalPaid)}</span></div>
                  <div className="flex justify-between font-bold font-mono"><span>RTP final:</span> <span className="text-emerald-400">{(simResult.rtp * 100).toFixed(3)}%</span></div>
                  <div className="flex justify-between"><span>Wins:</span> <span>{simResult.wins}</span></div>
                  <div className="flex justify-between"><span>Jackpots:</span> <span>{simResult.jackpots}</span></div>
                </ScrollArea>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          /* ================= BAR OWNER TAB VIEW ================= */
          <Tabs defaultValue="caja" className="w-full" onValueChange={(v) => { if (v === "stats") { refreshStats(); refreshHistory(); } else { refreshStats(); } }}>
            <TabsList className="grid grid-cols-5 bg-zinc-900 border border-zinc-800 h-auto p-1 rounded-xl">
              <TabsTrigger value="caja" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-[10px] sm:text-xs text-zinc-300 py-2">
                <HandCoins className="h-4 w-4 mr-1" /> Caja
              </TabsTrigger>
              <TabsTrigger value="saldo" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-[10px] sm:text-xs text-zinc-300 py-2">
                <Wallet className="h-4 w-4 mr-1" /> Cargar
              </TabsTrigger>
              <TabsTrigger value="stats" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-[10px] sm:text-xs text-zinc-300 py-2">
                <BarChart3 className="h-4 w-4 mr-1" /> Stats
              </TabsTrigger>
              <TabsTrigger value="sim" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-[10px] sm:text-xs text-zinc-300 py-2">
                <FlaskConical className="h-4 w-4 mr-1" /> Simul.
              </TabsTrigger>
              <TabsTrigger value="config" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black text-[10px] sm:text-xs text-zinc-300 py-2">
                <KeyRound className="h-4 w-4 mr-1" /> Config
              </TabsTrigger>
            </TabsList>

            {/* Caja — pay player */}
            <TabsContent value="caja" className="space-y-4 pt-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-amber-500/20 bg-zinc-900/60 p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wide">Saldo en la Máquina</p>
                  <p className="text-2xl font-black text-emerald-400 font-mono mt-1">{stats ? fmt(stats.balance) : "—"}</p>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Equivale a {stats ? stats.credits : 0} créditos (₡{CREDIT_VALUE} c/u).
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                  <p className="text-zinc-400 text-xs uppercase tracking-wide">Pago de Premios de Sesión</p>
                  <p className="text-2xl font-black text-amber-300 font-mono mt-1">{stats ? fmt(stats.sessionPaid) : "—"}</p>
                  <p className="text-[10px] text-zinc-500 mt-1">Acumulado desde el último reinicio.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={doPay} disabled={busy} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold">
                  <HandCoins className="h-4 w-4 mr-2" /> Pagar y reiniciar sesión
                </Button>
                <Button onClick={doReset} disabled={busy} variant="destructive">
                  <RotateCcw className="h-4 w-4 mr-2" /> Reset total
                </Button>
              </div>
            </TabsContent>

            {/* Cargar Saldo (deduct from barBalance) */}
            <TabsContent value="saldo" className="space-y-4 pt-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wide">Tu Saldo Disponible en el Bar</p>
                    <p className="text-2xl font-black text-cyan-300 font-mono">{stats ? fmt(stats.barBalance) : "—"}</p>
                  </div>
                  <Badge className="bg-cyan-500/20 text-cyan-400 border border-cyan-400/40">
                    Venta autorizada
                  </Badge>
                </div>
                <p className="text-xs text-zinc-400">
                  Deduce créditos de tu saldo comprado para cargárselos al cliente en la pantalla de juego.
                </p>
                <Separator className="bg-zinc-800" />
                <Label className="text-zinc-300 text-xs">Selecciona el monto a cargar a la máquina:</Label>
                <div className="flex flex-wrap gap-2">
                  {[1000, 2000, 5000, 10000].map((v) => (
                    <Button key={v} variant="outline" className="border-zinc-700 hover:bg-zinc-800 text-xs" onClick={() => setAddAmt(String(v))}>
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
                  <Button onClick={doAddBalance} disabled={busy} className="bg-amber-500 text-black hover:bg-amber-400 font-bold whitespace-nowrap">
                    <Wallet className="h-4 w-4 mr-1" /> Cargar Créditos
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Stats (split earnings 70/30) */}
            <TabsContent value="stats" className="space-y-4 pt-3">
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Total Jugado" value={stats ? fmt(stats.totalBet) : "—"} color="text-zinc-200" />
                <Stat label="Total Pagado" value={stats ? fmt(stats.totalPaid) : "—"} color="text-zinc-200" />
                <Stat label="RTP Real" value={stats ? (stats.rtp * 100).toFixed(2) + "%" : "—"} color="text-amber-300" />
              </div>
              
              <div className="rounded-lg border border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-fuchsia-500/5 p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Margen Neto de Retención (30% House Edge)</span>
                  <span className="text-base font-bold text-amber-300 font-mono">{fmt(netProfit)}</span>
                </div>
                <Separator className="bg-zinc-800/60" />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-zinc-500 block uppercase">Tu Ganancia Bar (70%)</span>
                    <span className="text-lg font-bold text-emerald-400 font-mono">{fmt(Math.round(barShare))}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block uppercase">Ganancia SaaS (30%)</span>
                    <span className="text-lg font-bold text-fuchsia-400 font-mono">{fmt(Math.round(saasShare))}</span>
                  </div>
                </div>
              </div>

              <ScrollArea className="h-28 rounded border border-zinc-800 bg-zinc-950">
                <table className="w-full text-[11px] sm:text-xs">
                  <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
                    <tr>
                      <th className="p-2 text-left">Hora</th>
                      <th className="p-2 text-left">Apuesta</th>
                      <th className="p-2 text-left">Símbolo</th>
                      <th className="p-2 text-right">Pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-zinc-600">Sin historial registrado.</td>
                      </tr>
                    )}
                    {logs.slice(0, 10).map((l) => (
                      <tr key={l.id} className="border-t border-zinc-900">
                        <td className="p-2 text-zinc-500">{new Date(l.createdAt).toLocaleTimeString("es-CR")}</td>
                        <td className="p-2">{l.bet}c</td>
                        <td className="p-2 text-sm">{l.symbol}</td>
                        <td className="p-2 text-right text-amber-300 font-mono">{l.payout > 0 ? fmt(l.payout) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </TabsContent>

            {/* Simulator */}
            <TabsContent value="sim" className="space-y-4 pt-3">
              <div className="flex gap-2">
                <Input type="number" value={simSpins} onChange={(e) => setSimSpins(e.target.value)} className="bg-zinc-900 border-zinc-700" />
                <Button onClick={doSimulate} className="bg-amber-500 text-black hover:bg-amber-400">Simular</Button>
              </div>
              {simResult && (
                <div className="rounded border border-zinc-800 p-3 text-xs bg-zinc-950 font-mono">
                  RTP Resultante: {(simResult.rtp * 100).toFixed(2)}% (Converge al 70%)
                </div>
              )}
            </TabsContent>

            {/* Config */}
            <TabsContent value="config" className="space-y-4 pt-3">
              <Label className="text-zinc-300">Cambiar Contraseña de Administrador del Bar</Label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="Nueva contraseña"
                  className="bg-zinc-900 border-zinc-700 font-mono"
                />
                <Button onClick={doChangePw} className="bg-amber-500 text-black hover:bg-amber-400">
                  Guardar
                </Button>
              </div>
              <Separator className="bg-zinc-800" />
              <Button variant="outline" className="border-zinc-700 text-zinc-300 w-full sm:w-auto" onClick={() => { setUnlocked(false); setPassword(""); }}>
                Bloquear panel
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
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`text-base font-bold font-mono mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}
