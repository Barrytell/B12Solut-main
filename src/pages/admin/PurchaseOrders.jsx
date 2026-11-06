import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { FileDown, Package, Truck, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { generatePurchaseOrderPDF } from '@/utils/purchaseOrderPDF';
import { mulMoney, sumBy } from '@/lib/money';

export default function PurchaseOrders() {
  const [expandedSupplier, setExpandedSupplier] = useState(null);

  const { data: products = [] } = useQuery({
    queryKey: ['products-admin'],
    queryFn: () => api.entities.Product.list(),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.entities.Supplier.list(),
  });

  // Group low-stock products by supplier
  const ordersBySupplier = useMemo(() => {
    const lowStock = products.filter(p =>
      p.is_active !== false && (p.stock_quantity || 0) <= (p.low_stock_threshold || 10)
    );

    const grouped = {};

    lowStock.forEach(p => {
      const supplierId = p.supplier_id || '__unassigned__';
      if (!grouped[supplierId]) grouped[supplierId] = [];
      grouped[supplierId].push(p);
    });

    return Object.entries(grouped).map(([supplierId, items]) => {
      const supplier = supplierId === '__unassigned__'
        ? null
        : suppliers.find(s => s.id === supplierId);

      const orderItems = items.map(p => {
        const reorderQty = Math.max(
          (p.low_stock_threshold || 10) * 3 - (p.stock_quantity || 0),
          (p.low_stock_threshold || 10)
        );
        return { ...p, reorderQty, lineTotal: mulMoney(p.cost_price || 0, reorderQty) };
      });

      const totalCost = sumBy(orderItems, i => i.lineTotal);
      return { supplierId, supplier, items: orderItems, totalCost };
    }).sort((a, b) => (a.supplier ? a.supplier.name : 'zzz').localeCompare(b.supplier ? b.supplier.name : 'zzz'));
  }, [products, suppliers]);

  const handlePrint = (order) => {
    generatePurchaseOrderPDF(order);
  };

  if (ordersBySupplier.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground">Restock suggestions grouped by supplier</p>
        </div>
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Package className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-lg font-semibold">All stocked up!</h2>
          <p className="text-sm text-muted-foreground mt-1">No products are currently below their restock threshold.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Purchase Orders</h1>
        <p className="text-sm text-muted-foreground">
          {ordersBySupplier.reduce((s, o) => s + o.items.length, 0)} products need restocking across {ordersBySupplier.length} supplier{ordersBySupplier.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="space-y-4">
        {ordersBySupplier.map(order => (
          <div key={order.supplierId} className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Header */}
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedSupplier(expandedSupplier === order.supplierId ? null : order.supplierId)}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  order.supplier ? "bg-primary/10" : "bg-muted"
                )}>
                  <Truck className={cn("w-5 h-5", order.supplier ? "text-primary" : "text-muted-foreground")} />
                </div>
                <div>
                  <p className="font-semibold">{order.supplier?.name || 'Unassigned Supplier'}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {order.supplier?.contact_name && (
                      <span className="text-xs text-muted-foreground">{order.supplier.contact_name}</span>
                    )}
                    {order.supplier?.email && (
                      <span className="text-xs text-muted-foreground">· {order.supplier.email}</span>
                    )}
                    {!order.supplier && (
                      <span className="text-xs text-muted-foreground">Link products to suppliers to organize orders</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold">${order.totalCost.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg hidden sm:flex"
                  onClick={e => { e.stopPropagation(); handlePrint(order); }}
                >
                  <FileDown className="w-3.5 h-3.5 mr-1.5" /> PDF
                </Button>
                {expandedSupplier === order.supplierId
                  ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                }
              </div>
            </div>

            {/* Items table */}
            {expandedSupplier === order.supplierId && (
              <div className="border-t border-border">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/40">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Product</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Current Stock</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Threshold</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Order Qty</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Unit Cost</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {order.items.map(item => (
                        <tr key={item.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3">
                            <p className="font-medium">{item.name}</p>
                            <p className="text-xs text-muted-foreground">{item.sku}</p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={cn(
                              "font-medium",
                              (item.stock_quantity || 0) === 0 ? "text-destructive" : "text-orange-500"
                            )}>
                              {item.stock_quantity || 0}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{item.low_stock_threshold || 10}</td>
                          <td className="px-4 py-3 text-right font-semibold text-primary">{item.reorderQty}</td>
                          <td className="px-4 py-3 text-right">${(item.cost_price || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-right font-medium">${item.lineTotal.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/30 font-semibold">
                        <td colSpan={5} className="px-4 py-3 text-right text-muted-foreground">Order Total</td>
                        <td className="px-4 py-3 text-right">${order.totalCost.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="flex justify-end gap-2 p-4 border-t border-border">
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => handlePrint(order)}
                  >
                    <FileDown className="w-4 h-4 mr-2" /> Download PDF
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}