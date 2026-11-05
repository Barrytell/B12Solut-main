import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Pencil, Trash2, Truck, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import SupplierFormModal from '@/components/admin/SupplierFormModal';

export default function Suppliers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list('-created_date'),
  });

  const filtered = suppliers.filter(s =>
    !search ||
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async (data) => {
    if (editingSupplier) {
      await base44.entities.Supplier.update(editingSupplier.id, data);
      toast.success('Supplier updated!');
    } else {
      await base44.entities.Supplier.create(data);
      toast.success('Supplier created!');
    }
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    setShowForm(false);
    setEditingSupplier(null);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this supplier?')) return;
    await base44.entities.Supplier.delete(id);
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    toast.success('Supplier deleted');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Suppliers</h1>
          <p className="text-sm text-muted-foreground">{suppliers.length} suppliers registered</p>
        </div>
        <Button onClick={() => { setEditingSupplier(null); setShowForm(true); }} className="rounded-xl">
          <Plus className="w-4 h-4 mr-2" /> Add Supplier
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search suppliers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <Truck className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No suppliers found</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Add your first supplier to get started</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(s => (
            <div key={s.id} className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Truck className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{s.name}</p>
                    {s.contact_name && <p className="text-xs text-muted-foreground">{s.contact_name}</p>}
                  </div>
                </div>
                <Badge variant={s.is_active !== false ? 'default' : 'secondary'} className="text-[10px]">
                  {s.is_active !== false ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <div className="space-y-1 text-xs text-muted-foreground">
                {s.email && <p>✉ {s.email}</p>}
                {s.phone && <p>📞 {s.phone}</p>}
                {s.address && <p>📍 {s.address}</p>}
                {s.notes && <p className="italic mt-2 text-foreground/60">"{s.notes}"</p>}
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 rounded-lg"
                  onClick={() => { setEditingSupplier(s); setShowForm(true); }}
                >
                  <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 rounded-lg"
                  onClick={() => handleDelete(s.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <SupplierFormModal
          supplier={editingSupplier}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingSupplier(null); }}
        />
      )}
    </div>
  );
}