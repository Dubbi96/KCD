import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  FileText,
  Clock,
  Play,
  LogOut,
  Smartphone,
  Layers,
  GitBranch,
  Server,
  Video,
  ScrollText,
} from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: typeof LayoutDashboard;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: '운영',
    items: [
      { path: '/', label: 'Overview', icon: LayoutDashboard },
      { path: '/fleet', label: 'Fleet', icon: Server },
      { path: '/devices', label: 'Devices', icon: Smartphone },
      { path: '/runs', label: 'Runs', icon: Play },
    ],
  },
  {
    title: '설계',
    items: [
      { path: '/recorder', label: '시나리오 녹화', icon: Video },
      { path: '/scenarios', label: '시나리오', icon: FileText },
      { path: '/groups', label: '그룹', icon: Layers },
      { path: '/streams', label: '실행 흐름', icon: GitBranch },
      { path: '/schedules', label: '스케쥴', icon: Clock },
    ],
  },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user, tenant, logout } = useAuth();

  return (
    <div className="flex h-screen bg-bg">
      {/* Sidebar */}
      <aside className="w-60 bg-card flex flex-col border-r border-border">
        <div className="p-5 border-b border-border">
          <h1 className="text-lg font-bold text-white">Katab</h1>
          <p className="text-muted text-xs mt-0.5">{tenant?.name}</p>
        </div>

        <nav className="flex-1 p-3 overflow-auto">
          {navSections.map((section, si) => (
            <div key={section.title} className={si > 0 ? 'mt-5' : ''}>
              <div className="px-3 mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted/60">
                  {section.title}
                </span>
              </div>
              <div className="space-y-0.5">
                {section.items.map(({ path, label, icon: Icon }) => {
                  const active = path === '/' ? pathname === '/' : pathname.startsWith(path);
                  return (
                    <Link
                      key={path}
                      to={path}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                        active
                          ? 'bg-accent text-white'
                          : 'text-muted hover:bg-card2 hover:text-white'
                      }`}
                    >
                      <Icon size={16} />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm text-white truncate">{user?.name}</p>
              <p className="text-muted text-xs truncate">{user?.email}</p>
            </div>
            <button onClick={logout} className="text-muted hover:text-white transition-colors flex-shrink-0" title="Logout">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto flex flex-col">{children}</main>
    </div>
  );
}
