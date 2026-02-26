'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  HomeIcon,
  Bars3BottomLeftIcon,
  ClipboardDocumentListIcon,
  UsersIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  ArrowRightOnRectangleIcon,
  BuildingStorefrontIcon,
} from '@heroicons/react/24/outline';

interface SidebarProps {
  restaurantId: number;
  restaurantName: string;
}

export default function Sidebar({ restaurantId, restaurantName }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, restaurantIds } = useAuth();

  const base = `/${restaurantId}`;
  const nav = [
    { href: `${base}/dashboard`, label: 'Dashboard', icon: HomeIcon },
    { href: `${base}/menu`, label: 'Menu', icon: Bars3BottomLeftIcon },
    { href: `${base}/orders`, label: 'Orders', icon: ClipboardDocumentListIcon },
    { href: `${base}/staff`, label: 'Staff', icon: UsersIcon },
    { href: `${base}/analytics`, label: 'Analytics', icon: ChartBarIcon },
    { href: `${base}/settings`, label: 'Settings', icon: Cog6ToothIcon },
    { href: `${base}/billing`, label: 'Billing', icon: CreditCardIcon },
  ];

  return (
    <aside className="w-64 min-h-screen bg-[#1a1a2e] text-gray-300 flex flex-col">
      {/* Brand + restaurant name */}
      <div className="px-5 py-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-500 rounded-lg flex items-center justify-center">
            <span className="text-lg font-black text-white">F</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white truncate">{restaurantName}</h1>
            <p className="text-xs text-gray-400">Admin Portal</p>
          </div>
        </div>
      </div>

      {/* Switch restaurant (for multi-restaurant owners) */}
      {restaurantIds.length > 1 && (
        <div className="px-4 pt-3">
          <Link
            href="/select-restaurant"
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <BuildingStorefrontIcon className="w-4 h-4" />
            Switch restaurant
          </Link>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${isActive ? 'active' : ''}`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User & logout */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="text-xs text-gray-400 mb-1 truncate">{user?.full_name}</div>
        <div className="text-xs text-gray-500 mb-3 truncate">{user?.email}</div>
        <button
          onClick={logout}
          className="sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
        >
          <ArrowRightOnRectangleIcon className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
