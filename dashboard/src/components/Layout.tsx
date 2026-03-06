import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  FileText,
  Clock,
  Play,
  Monitor,
  Webhook,
  LogOut,
  ListTodo,
  Smartphone,
  Layers,
  Key,
  GitBranch,
  Database,
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/scenarios', label: 'Scenarios', icon: FileText },
  { path: '/groups', label: 'Groups', icon: Layers },
  { path: '/streams', label: 'Streams', icon: GitBranch },
  { path: '/auth-profiles', label: 'Auth Profiles', icon: Key },
  { path: '/test-data', label: 'Test Data', icon: Database },
  { path: '/devices', label: 'Devices', icon: Smartphone },
  { path: '/schedules', label: 'Schedules', icon: Clock },
  { path: '/runs', label: 'Runs', icon: Play },
  { path: '/runners', label: 'Runners', icon: Monitor },
  { path: '/queue', label: 'Queue', icon: ListTodo },
  { path: '/webhooks', label: 'Webhooks', icon: Webhook },
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

        <nav className="flex-1 p-3 space-y-0.5 overflow-auto">
          {navItems.map(({ path, label, icon: Icon }) => {
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
