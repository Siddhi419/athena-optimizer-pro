import { User, Mail, Shield, Activity } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export default function Profile() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account and preferences.</p>
      </div>

      {/* Profile Card */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-5">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">G</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Guest User</h2>
            <p className="text-sm text-muted-foreground">Sign in to save your data across sessions</p>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="h-4 w-4" />
            <span className="text-xs font-medium">Email</span>
          </div>
          <p className="mt-2 text-sm text-foreground">Not signed in</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span className="text-xs font-medium">Role</span>
          </div>
          <p className="mt-2 text-sm text-foreground">Guest</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-4 w-4" />
            <span className="text-xs font-medium">Queries Today</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">0</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="h-4 w-4" />
            <span className="text-xs font-medium">Member Since</span>
          </div>
          <p className="mt-2 text-sm text-foreground">{new Date().toLocaleDateString()}</p>
        </div>
      </div>

      {/* Preferences */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Preferences</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Dark Mode</p>
              <p className="text-xs text-muted-foreground">Currently active</p>
            </div>
            <div className="h-6 w-10 rounded-full bg-primary/20 relative">
              <div className="absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-primary" />
            </div>
          </div>
          <div className="border-t border-border" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Auto-analyze on paste</p>
              <p className="text-xs text-muted-foreground">Automatically analyze when SQL is pasted</p>
            </div>
            <div className="h-6 w-10 rounded-full bg-muted relative">
              <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-muted-foreground/40" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
