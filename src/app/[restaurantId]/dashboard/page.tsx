'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getDayComparison,
  getAnalyticsToday,
  getTopSellers,
  type ComparisonResult,
  type TodayStats,
  type TopSeller,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  DollarSign, ShoppingBag, Users, TrendingUp, Plus, Edit, ChevronUp, ChevronDown,
} from 'lucide-react';
import AiPromptBar from './AiPromptBar';
import KPIInfoModal, { KPI_INFO } from '@/components/common/KPIInfoModal';

// Figma page: foodyadmin_figma/src/app/pages/dashboard/page.tsx
// Layout + classes ported verbatim; KPI numbers come from real analytics.

export default function DashboardPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();

  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'today' | 'week' | 'month'>('today');
  const [showKpis, setShowKpis] = useState(true);
  const [selectedKpi, setSelectedKpi] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      getDayComparison(rid),
      getAnalyticsToday(rid),
      getTopSellers(rid),
    ])
      .then(([cmp, st, top]) => {
        if (cmp.status === 'fulfilled') setComparison(cmp.value);
        if (st.status === 'fulfilled') setStats(st.value);
        if (top.status === 'fulfilled') setTopSellers(top.value ?? []);
      })
      .finally(() => setLoading(false));
  }, [rid]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const current = comparison?.current;
  const previous = comparison?.previous;
  const revenue = stats?.total_revenue ?? current?.net_sales ?? 0;
  const orders = stats?.total_orders ?? current?.transactions ?? 0;
  const avgTicket = orders > 0 ? revenue / orders : current?.avg_sale ?? 0;
  const pct = (now: number, before: number) => {
    if (!before) return now > 0 ? 100 : 0;
    return ((now - before) / before) * 100;
  };
  const revChange = pct(current?.net_sales ?? 0, previous?.net_sales ?? 0);
  const orderChange = pct(current?.transactions ?? 0, previous?.transactions ?? 0);
  const ticketChange = pct(current?.avg_sale ?? 0, previous?.avg_sale ?? 0);

  // Daily volume bars — use hourly data bucketed to a 14-cell visualization.
  // Figma had 14 bars; we map from 24 hours by bucketing pairs.
  const bars = (() => {
    if (!comparison) return new Array(14).fill(40);
    const hourly = comparison.hourly ?? [];
    const max = Math.max(1, ...hourly.map((h) => h.current_amt));
    // Take 14 buckets across 24 hours
    const buckets: number[] = [];
    for (let i = 0; i < 14; i++) {
      const start = Math.floor((i / 14) * 24);
      const end = Math.floor(((i + 1) / 14) * 24);
      const sum = hourly
        .filter((h) => h.hour >= start && h.hour < end)
        .reduce((s, h) => s + h.current_amt, 0);
      buckets.push(max > 0 ? Math.min(100, (sum / max) * 100) : 0);
    }
    return buckets;
  })();

  return (
    <div className="-mx-6 -my-6 lg:-mx-8 flex-1 overflow-y-auto bg-neutral-50 dark:bg-[#0a0a0a]">
      {/* Header — Figma:11 */}
      <div className="bg-white dark:bg-[#111111] border-b border-neutral-200 dark:border-neutral-800 px-8 py-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
              {t('dashboardHome') || 'Tableau de bord'}
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400 mt-1">
              {t('dashboardWelcome') || 'Bienvenue ! Voici un aperçu de votre activité'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowKpis((v) => !v)}
              className="p-3 border border-neutral-200 dark:border-neutral-700 rounded-xl hover:bg-neutral-50 dark:hover:bg-[#1a1a1a] transition-colors"
              title={showKpis ? 'Masquer les KPIs' : 'Afficher les KPIs'}
              aria-label="Toggle KPIs"
            >
              {showKpis ? (
                <ChevronUp size={20} className="text-neutral-600 dark:text-neutral-400" />
              ) : (
                <ChevronDown size={20} className="text-neutral-600 dark:text-neutral-400" />
              )}
            </button>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as 'today' | 'week' | 'month')}
              className="px-4 py-2.5 bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            >
              <option value="today">{t('today') || "Aujourd'hui"}</option>
              <option value="week">{t('thisWeek') || 'Cette semaine'}</option>
              <option value="month">{t('thisMonth') || 'Ce mois'}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="p-8">
        <div className="mb-6">
          <AiPromptBar />
        </div>

        {/* 4 KPI cards — Figma:32 */}
        {showKpis && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Revenue — gradient orange */}
            <button
              type="button"
              onClick={() => setSelectedKpi('revenue')}
              title="Cliquez pour plus d'informations"
              className="text-left bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white shadow-lg hover:shadow-xl transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="size-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <DollarSign size={24} />
                </div>
                <span className="text-sm bg-white/20 px-3 py-1 rounded-full">
                  {revChange >= 0 ? '+' : ''}
                  {revChange.toFixed(1)}%
                </span>
              </div>
              <p className="text-white/80 text-sm mb-1">
                {t('revenue') || "Chiffre d'affaires"}
              </p>
              <p className="text-3xl font-bold">₪{revenue.toFixed(2)}</p>
            </button>

            {/* Orders */}
            <button
              type="button"
              onClick={() => setSelectedKpi('orders')}
              title="Cliquez pour plus d'informations"
              className="text-left bg-white dark:bg-[#111111] rounded-2xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-sm hover:shadow-lg hover:border-orange-500 dark:hover:border-orange-500 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="size-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                  <ShoppingBag size={24} className="text-blue-600 dark:text-blue-400" />
                </div>
                <span className={`text-sm font-medium ${orderChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {orderChange >= 0 ? '+' : ''}
                  {orderChange.toFixed(1)}%
                </span>
              </div>
              <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-1">
                {t('orders') || 'Commandes'}
              </p>
              <p className="text-3xl font-bold text-neutral-900 dark:text-white">{orders}</p>
            </button>

            {/* Customers */}
            <button
              type="button"
              onClick={() => setSelectedKpi('customers')}
              title="Cliquez pour plus d'informations"
              className="text-left bg-white dark:bg-[#111111] rounded-2xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-sm hover:shadow-lg hover:border-orange-500 dark:hover:border-orange-500 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="size-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                  <Users size={24} className="text-purple-600 dark:text-purple-400" />
                </div>
                <span className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">—</span>
              </div>
              <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-1">
                {t('customers') || 'Clients'}
              </p>
              <p className="text-3xl font-bold text-neutral-900 dark:text-white">
                {topSellers.length > 0 ? topSellers.reduce((s, x) => s + x.quantity, 0) : 0}
              </p>
            </button>

            {/* Avg Ticket */}
            <button
              type="button"
              onClick={() => setSelectedKpi('average-ticket')}
              title="Cliquez pour plus d'informations"
              className="text-left bg-white dark:bg-[#111111] rounded-2xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-sm hover:shadow-lg hover:border-orange-500 dark:hover:border-orange-500 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="size-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                  <TrendingUp size={24} className="text-green-600 dark:text-green-400" />
                </div>
                <span className={`text-sm font-medium ${ticketChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {ticketChange >= 0 ? '+' : ''}
                  {ticketChange.toFixed(1)}%
                </span>
              </div>
              <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-1">
                {t('avgTicket') || 'Ticket moyen'}
              </p>
              <p className="text-3xl font-bold text-neutral-900 dark:text-white">
                ₪{avgTicket.toFixed(2)}
              </p>
            </button>
          </div>
        )}

        {/* KPI info modal */}
        <KPIInfoModal
          kpiInfo={selectedKpi ? KPI_INFO[selectedKpi] ?? null : null}
          onClose={() => setSelectedKpi(null)}
        />

        {/* Main grid — Figma:82 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column — Charts + Top items */}
          <div className="lg:col-span-2 space-y-8">
            {/* Rendement chart — Figma:86 */}
            <div className="bg-white dark:bg-[#111111] rounded-2xl p-6 border border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                    {t('performance') || 'Rendement'}
                  </h3>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {previous?.date && current?.date
                      ? `${new Date(previous.date).toLocaleDateString()} — ${new Date(current.date).toLocaleDateString()}`
                      : t('today') || "Aujourd'hui"}
                  </p>
                </div>
                <button
                  onClick={() => router.push(`/${rid}/orders/all`)}
                  className="px-4 py-2 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors text-sm font-medium"
                >
                  {t('viewOrders') || 'Afficher les commandes'}
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                    {t('netSales') || 'Ventes nettes'}
                  </p>
                  <p className="text-xl font-bold text-neutral-900 dark:text-white">
                    ₪{(current?.net_sales ?? 0).toFixed(0)}
                  </p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">HVA</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                    {t('transactions') || 'Transactions'}
                  </p>
                  <p className="text-xl font-bold text-neutral-900 dark:text-white">
                    {current?.transactions ?? 0}
                  </p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">HVA</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                    {t('laborPercent') || "Main-d'œuvre"}
                  </p>
                  <p className="text-xl font-bold text-neutral-900 dark:text-white">
                    {(current?.labor_percent ?? 0).toFixed(1)}%
                  </p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">HVA</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                    {t('avgSale') || 'Vente moyenne'}
                  </p>
                  <p className="text-xl font-bold text-neutral-900 dark:text-white">
                    ₪{(current?.avg_sale ?? 0).toFixed(0)}
                  </p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">HVA</p>
                </div>
              </div>

              {/* Bars */}
              <div className="h-64 flex items-end justify-between gap-2">
                {bars.map((height, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-gradient-to-t from-orange-500 to-orange-400 rounded-t-lg transition-all hover:from-orange-600 hover:to-orange-500"
                    style={{ height: `${Math.max(5, height)}%` }}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-2 text-xs text-neutral-400 dark:text-neutral-500">
                <span>Lun</span>
                <span>Mar</span>
                <span>Mer</span>
                <span>Jeu</span>
                <span>Ven</span>
                <span>Sam</span>
                <span>Dim</span>
              </div>
            </div>

            {/* Top items — Figma:138 */}
            <div className="bg-white dark:bg-[#111111] rounded-2xl p-6 border border-neutral-200 dark:border-neutral-800">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4">
                {t('topItems') || 'Articles les plus vendus'}
              </h3>
              {topSellers.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400 py-6 text-center">
                  {t('noSalesYet') || 'Aucune vente enregistrée.'}
                </p>
              ) : (
                <div className="space-y-3">
                  {topSellers.slice(0, 4).map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-[#0a0a0a] rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🍽️</span>
                        <div>
                          <p className="font-medium text-neutral-900 dark:text-white">{s.name}</p>
                          <p className="text-sm text-neutral-600 dark:text-neutral-400">
                            {s.quantity} {t('sales') || 'ventes'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-neutral-900 dark:text-white">
                          ₪{s.revenue.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column — Balance + Quick actions + Activity — Figma:166 */}
          <div className="space-y-6">
            {/* Balance */}
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 text-white shadow-lg">
              <p className="text-white/80 text-sm mb-2">
                {t('balance') || 'SOLDE'}
              </p>
              <p className="text-4xl font-bold mb-4">₪{revenue.toFixed(2)}</p>
              <button
                onClick={() => router.push(`/${rid}/orders/all`)}
                className="w-full py-2.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors font-medium"
              >
                {t('viewTransactions') || 'Voir les transactions'}
              </button>
            </div>

            {/* Quick Actions */}
            <div className="bg-white dark:bg-[#111111] rounded-2xl p-6 border border-neutral-200 dark:border-neutral-800">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4">
                {t('quickActions') || 'Actions rapides'}
              </h3>
              <div className="space-y-2">
                <button
                  onClick={() => router.push(`/${rid}/orders/all`)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-neutral-50 dark:bg-[#0a0a0a] hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] rounded-lg transition-colors text-left"
                >
                  <div className="size-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                    <DollarSign size={20} className="text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-white">
                      {t('acceptPayment') || 'Accepter un paiement'}
                    </p>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      {t('recordTransaction') || 'Enregistrer une transaction'}
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => router.push(`/${rid}/menu/menus`)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-neutral-50 dark:bg-[#0a0a0a] hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] rounded-lg transition-colors text-left"
                >
                  <div className="size-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                    <Edit size={20} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-white">
                      {t('editMenu') || 'Modifier la carte'}
                    </p>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      {t('updateMenu') || 'Mettre à jour le menu'}
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => router.push(`/${rid}/menu/items/new`)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-neutral-50 dark:bg-[#0a0a0a] hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] rounded-lg transition-colors text-left"
                >
                  <div className="size-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                    <Plus size={20} className="text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-white">
                      {t('addItem') || 'Ajouter un article'}
                    </p>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      {t('newProduct') || 'Nouveau produit'}
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Activity Feed — placeholder until a real feed endpoint exists */}
            <div className="bg-white dark:bg-[#111111] rounded-2xl p-6 border border-neutral-200 dark:border-neutral-800">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4">
                {t('recentActivity') || 'Activité récente'}
              </h3>
              <div className="space-y-4">
                <ActivityRow
                  color="bg-green-500"
                  title={`${t('ordersToday') || 'Commandes aujourd\'hui'}: ${orders}`}
                  subtitle={t('liveFigures') || 'Chiffres en direct'}
                />
                <ActivityRow
                  color="bg-blue-500"
                  title={`${t('netSales') || 'Ventes nettes'}: ₪${revenue.toFixed(2)}`}
                  subtitle={current?.date ? new Date(current.date).toLocaleDateString() : ''}
                />
                {(current?.tips ?? 0) > 0 && (
                  <ActivityRow
                    color="bg-orange-500"
                    title={`${t('tips') || 'Pourboires'}: ₪${(current?.tips ?? 0).toFixed(2)}`}
                    subtitle=""
                  />
                )}
                {(current?.discounts ?? 0) > 0 && (
                  <ActivityRow
                    color="bg-purple-500"
                    title={`${t('discounts') || 'Remises'}: ₪${(current?.discounts ?? 0).toFixed(2)}`}
                    subtitle=""
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ color, title, subtitle }: { color: string; title: string; subtitle: string }) {
  return (
    <div className="flex gap-3">
      <div className={`size-2 mt-2 rounded-full ${color} flex-shrink-0`} />
      <div>
        <p className="text-sm font-medium text-neutral-900 dark:text-white">{title}</p>
        {subtitle && (
          <p className="text-xs text-neutral-600 dark:text-neutral-400">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
