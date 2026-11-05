import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Trash2, Tag, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const prettify = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

export default function Categories() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list('name'),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products-admin'],
    queryFn: () => base44.entities.Product.list(),
  });

  const countFor = (catName) => products.filter(p => p.category === catName).length;

  const addCategory = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      toast.error('That category already exists');
      return;
    }
    setAdding(true);
    try {
      await base44.entities.Category.create({ name });
      toast.success(`Category "${prettify(name)}" added`);
      setNewName('');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    } catch (err) {
      toast.error(err.message || 'Failed to add category');
    } finally {
      setAdding(false);
    }
  };

  const deleteCategory = async (cat) => {
    const count = countFor(cat.name);
    if (count > 0) {
      toast.error(`Cannot delete: ${count} product(s) still use "${prettify(cat.name)}"`);
      return;
    }
    if (!window.confirm(`Delete category "${prettify(cat.name)}"?`)) return;
    try {
      await base44.entities.Category.delete(cat.id);
      toast.success('Category deleted');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    } catch (err) {
      toast.error(err.message || 'Failed to delete category');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Product Categories</h1>
        <p className="text-sm text-muted-foreground">Add and remove category names used across products</p>
      </div>

      {/* Add form */}
      <form onSubmit={addCategory} className="flex gap-2 max-w-md">
        <Input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New category name (e.g. Canned Goods)"
          className="h-10"
        />
        <Button type="submit" disabled={adding} className="gap-1.5">
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add
        </Button>
      </form>

      {/* List */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : categories.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">No categories yet — add your first one above.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Products</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {categories.map(cat => (
                <tr key={cat.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium flex items-center gap-2">
                    <Tag className="w-4 h-4 text-muted-foreground" />
                    {prettify(cat.name)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{countFor(cat.name)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteCategory(cat)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      title="Delete category"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}