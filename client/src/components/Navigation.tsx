/**
 * Sidebar / mobile navigation.
 *
 * Items are grouped by purpose and only ever link to routes that actually
 * exist in App.tsx — broken pre-Phase-3 links (alert-rules, tenant-management,
 * enrichment, reports, data-hub) have been retired. Add a route in App.tsx
 * before adding it here.
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  Map as MapIcon,
  Menu,
  X,
  LogOut,
  ShieldCheck,
  ClipboardList,
  Droplets,
  Home,
  Lightbulb,
  Search as SearchIcon,
  Upload as UploadIcon,
  Download as DownloadIcon,
  Box as BoxIcon,
  Info,
  CloudRain,
  Activity,
} from 'lucide-react';

interface NavigationProps {
  onLogout?: () => void;
}

interface MenuItem {
  label: string;
  href: string;
  icon: typeof Home;
  description: string;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Home',      href: '/overview', icon: Home,       description: 'Launchpad & KPIs' },
      { label: 'Map',       href: '/',         icon: MapIcon,    description: 'Property map view' },
      { label: 'Dashboard', href: '/dashboard', icon: LayoutGrid, description: 'Portfolio analytics' },
    ],
  },
  {
    title: 'Insights',
    items: [
      { label: 'Strategic Insights', href: '/insights', icon: Lightbulb, description: '11 ranked insight cards' },
      { label: 'Flood Intelligence', href: '/flood',    icon: CloudRain, description: 'EA layers + forecasts' },
      { label: 'Search',             href: '/search',   icon: SearchIcon, description: 'Address / postcode / ward' },
    ],
  },
  {
    title: 'Compliance & Regulatory',
    items: [
      { label: 'Compliance',         href: '/compliance', icon: ShieldCheck,   description: 'Statutory regimes & RAG' },
      { label: 'TSMs',               href: '/tsm',        icon: ClipboardList, description: 'Tenant Satisfaction' },
      { label: "Awaab's Law",        href: '/awaab',      icon: Droplets,      description: 'Damp & mould caseload' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Digital Twin', href: '/digital-twin', icon: BoxIcon, description: '3D property viewer' },
    ],
  },
  {
    title: 'Data',
    items: [
      { label: 'Data Hub',        href: '/upload',     icon: UploadIcon,   description: 'Upload CSV / Excel' },
      { label: 'Export',          href: '/export',     icon: DownloadIcon, description: 'CSV / GeoJSON / Report' },
      { label: 'Data freshness',  href: '/enrichment', icon: Activity,     description: 'Scheduled enrichment runs' },
    ],
  },
  {
    title: 'Help',
    items: [
      { label: 'About', href: '/about', icon: Info, description: 'Docs & methodology' },
    ],
  },
];

export const Navigation: React.FC<NavigationProps> = ({ onLogout }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const location = useLocation();

  const isActive = (href: string) => location.pathname === href;

  const renderItem = (item: MenuItem, onClick?: () => void) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        to={item.href}
        onClick={onClick}
        className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
          active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
        }`}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{item.label}</p>
          <p className={`text-xs ${active ? 'text-blue-100' : 'text-slate-400'}`}>
            {item.description}
          </p>
        </div>
      </Link>
    );
  };

  return (
    <>
      {/* ─── Desktop sidebar ─── */}
      <div className="hidden md:flex md:flex-col md:fixed md:left-0 md:top-0 md:h-full md:w-64 md:bg-slate-900 md:text-white md:border-r md:border-slate-800">
        {/* Logo */}
        <Link to="/overview" className="block p-6 border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
          <h1 className="text-2xl font-bold text-white">SHDT</h1>
          <p className="text-xs text-slate-400 mt-1">Social Housing Digital Twin</p>
        </Link>

        {/* Grouped menu */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {MENU_GROUPS.map((group) => (
            <div key={group.title} className="mb-5">
              <div className="px-4 mb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {group.title}
                </p>
              </div>
              <div className="space-y-1">
                {group.items.map((item) => renderItem(item))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        {onLogout && (
          <div className="border-t border-slate-800 p-3">
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </div>
        )}
      </div>

      {/* ─── Mobile top bar ─── */}
      <div className="md:hidden sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800">
        <div className="flex items-center justify-between p-4">
          <Link to="/overview" className="text-xl font-bold">SHDT</Link>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {isOpen && (
          <nav className="border-t border-slate-800 px-3 py-4 max-h-[80vh] overflow-y-auto">
            {MENU_GROUPS.map((group) => (
              <div key={group.title} className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 mb-2">
                  {group.title}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => renderItem(item, () => setIsOpen(false)))}
                </div>
              </div>
            ))}
          </nav>
        )}
      </div>

      {/* Push the main content to the right of the desktop sidebar */}
      <div className="hidden md:block md:w-64" aria-hidden="true" />
    </>
  );
};

export default Navigation;
