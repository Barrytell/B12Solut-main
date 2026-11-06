import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Plus, Shield, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CreateUserForm from '@/components/admin/CreateUserForm';
import { getUserName } from '@/utils/userName';

export default function UserManagement() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.entities.User.list(),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground">
            {users.length} team members · new accounts are created here by administrators
          </p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)} className="rounded-xl">
          <Plus className="w-4 h-4 mr-2" /> Create User
        </Button>
      </div>

      {showCreate && (
        <CreateUserForm
          onDone={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ['users'] });
          }}
        />
      )}

      <div className="bg-card rounded-xl border border-border divide-y divide-border">
        {users.map(u => (
          <div key={u.id} className="flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                {(getUserName(u) || '?')[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium">{getUserName(u) || 'Unnamed'}</p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {u.must_change_password && (
                <Badge variant="outline" className="text-[11px] text-muted-foreground">Awaiting first login</Badge>
              )}
              <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="gap-1">
                {u.role === 'admin' ? <Shield className="w-3 h-3" /> : <ShoppingCart className="w-3 h-3" />}
                {u.role === 'admin' ? 'Admin' : 'Cashier'}
              </Badge>
            </div>
          </div>
        ))}
        {users.length === 0 && (
          <div className="p-12 text-center text-muted-foreground text-sm">No users found</div>
        )}
      </div>
    </div>
  );
}