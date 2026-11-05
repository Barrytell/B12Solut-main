import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOutletContext } from 'react-router-dom';
import ProductSearch from '@/components/pos/ProductSearch';
import Cart from '@/components/pos/cart';
import PaymentModal from '@/components/pos/PaymentModal';
import ReceiptModal from '@/components/pos/ReceiptModal';
import SaleTypeToggle from '@/components/pos/SaleTypeToggle';
import { toast } from 'sonner';
import { checkAndSendLowStockAlerts } from '@/utils/stockAlerts';
import { wholesaleUnitPrice } from '@/utils/wholesale';
import { getUserName } from '@/utils/userName';

/**
 * Shared sale terminal for both retail and wholesale sales.
 * Identical flow, stock handling and receipts — only pricing, labelling and
 * the recorded sale type differ.
 */
export default function SaleTerminal({ initialSaleType = 'retail' }) {
  const [saleType, setSaleType] = useState(initialSaleType);
  const isWholesale = saleType === 'wholesale';
  const { user } = useOutletContext();
  const queryClient = useQueryClient();
  const [cartItems, setCartItems] = useState([]);
  const [showPayment, setShowPayment] = useState(false);
  const [completedTransaction, setCompletedTransaction] = useState(null);
  const [activeShift, setActiveShift] = useState(null);
  const [discount, setDiscount] = useState(0);
  const [customerName, setCustomerName] = useState('');

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }),
  });

  const priceOf = (product) =>
    isWholesale ? wholesaleUnitPrice(product) : (product.selling_price || 0);

  // Switching mode re-prices the cart, so a basket started in one mode keeps
  // the right prices instead of being lost.
  const handleModeChange = (nextType) => {
    if (nextType === saleType) return;
    setSaleType(nextType);
    setCartItems(prev => prev.map(item => {
      const product = products.find(p => p.id === item.product_id);
      const unitPrice = nextType === 'wholesale'
        ? wholesaleUnitPrice(product)
        : (product?.selling_price ?? item.unit_price);
      const tax_amount = (unitPrice * item.quantity * (item.tax_rate || 0)) / 100;
      return {
        ...item,
        unit_price: unitPrice,
        tax_amount,
        line_total: unitPrice * item.quantity + tax_amount,
      };
    }));
  };

  // Check for active shift
  useEffect(() => {
    if (!user?.email) return;
    base44.entities.Shift.filter({ cashier_email: user.email, status: 'open' })
      .then(shifts => {
        if (shifts.length > 0) {
          setActiveShift(shifts[0]);
        }
      });
  }, [user?.email]);

  const startShift = async () => {
    const shift = await base44.entities.Shift.create({
      cashier_email: user.email,
      cashier_name: getUserName(user),
      start_time: new Date().toISOString(),
      status: 'open',
      total_cash_sales: 0,
      total_card_sales: 0,
      total_electronic_sales: 0,
      total_revenue: 0,
      total_transactions: 0,
      total_cost: 0,
      total_profit: 0,
    });
    setActiveShift(shift);
    toast.success('Shift started!');
  };

  const withQuantity = (item, quantity) => {
    const tax_amount = (item.unit_price * quantity * item.tax_rate) / 100;
    return { ...item, quantity, tax_amount, line_total: item.unit_price * quantity + tax_amount };
  };

  const addToCart = (product) => {
    const stock = product.stock_quantity || 0;
    if (stock <= 0) {
      toast.error(`${product.name} is out of stock`);
      return;
    }
    setCartItems(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        if (existing.quantity >= stock) {
          toast.error(`Only ${stock} ${product.name} in stock`);
          return prev;
        }
        return prev.map(item =>
          item.product_id === product.id
            ? withQuantity(item, item.quantity + 1)
            : item
        );
      }
      const unitPrice = priceOf(product);
      const taxRate = product.tax_rate || 0;
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        quantity: 1,
        unit_price: unitPrice,
        cost_price: product.cost_price || 0,
        tax_rate: taxRate,
        tax_amount: (unitPrice * taxRate) / 100,
        line_total: unitPrice + (unitPrice * taxRate) / 100,
      }];
    });
  };

  const updateQuantity = (productId, quantity) => {
    const product = products.find(p => p.id === productId);
    const stock = product?.stock_quantity || 0;
    if (quantity > stock) {
      toast.error(`Only ${stock} ${product?.name || 'units'} in stock`);
      quantity = stock;
    }
    if (quantity <= 0) {
      setCartItems(prev => prev.filter(item => item.product_id !== productId));
    } else {
      setCartItems(prev => prev.map(item =>
        item.product_id === productId ? withQuantity(item, quantity) : item
      ));
    }
  };

  const removeItem = (productId) => {
    setCartItems(prev => prev.filter(item => item.product_id !== productId));
  };

  const subtotal = cartItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  const taxTotal = cartItems.reduce((sum, item) => sum + item.tax_amount, 0);
  const grandTotal = subtotal + taxTotal - discount;
  const totalCost = cartItems.reduce((sum, item) => sum + (item.cost_price * item.quantity), 0);

  const handlePayment = async (paymentMethod, amountPaid) => {
    const txNumber = `${isWholesale ? 'WS' : 'TX'}-${Date.now().toString(36).toUpperCase()}`;

    const payload = {
      transaction_number: txNumber,
      sale_type: saleType,
      cashier_email: user.email,
      cashier_name: getUserName(user),
      items: cartItems,
      subtotal,
      tax_total: taxTotal,
      discount_amount: discount,
      grand_total: grandTotal,
      total_cost: totalCost,
      gross_profit: grandTotal - totalCost,
      payment_method: paymentMethod,
      amount_paid: amountPaid,
      change_given: Math.max(0, amountPaid - grandTotal),
      shift_id: activeShift?.id,
      status: 'completed',
    };
    if (isWholesale && customerName.trim()) payload.customer_name = customerName.trim();

    const transaction = await base44.entities.Transaction.create(payload);

    // Update stock quantities
    for (const item of cartItems) {
      const product = products.find(p => p.id === item.product_id);
      if (product) {
        await base44.entities.Product.update(item.product_id, {
          stock_quantity: Math.max(0, (product.stock_quantity || 0) - item.quantity)
        });
      }
    }

    // Check for low stock and send alerts (fire-and-forget)
    checkAndSendLowStockAlerts(cartItems, products).then(alerted => {
      if (alerted?.length > 0) {
        toast.warning(`⚠️ Low stock alert sent to admin for: ${alerted.map(p => p.name).join(', ')}`);
      }
    });

    // Update shift totals
    if (activeShift) {
      const fieldMap = { cash: 'total_cash_sales', card: 'total_card_sales', electronic: 'total_electronic_sales' };
      const field = fieldMap[paymentMethod];
      await base44.entities.Shift.update(activeShift.id, {
        [field]: (activeShift[field] || 0) + grandTotal,
        total_revenue: (activeShift.total_revenue || 0) + grandTotal,
        total_transactions: (activeShift.total_transactions || 0) + 1,
        total_cost: (activeShift.total_cost || 0) + totalCost,
        total_profit: (activeShift.total_profit || 0) + (grandTotal - totalCost),
      });
      setActiveShift(prev => ({
        ...prev,
        [field]: (prev[field] || 0) + grandTotal,
        total_revenue: (prev.total_revenue || 0) + grandTotal,
        total_transactions: (prev.total_transactions || 0) + 1,
      }));
    }

    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['transactions-wholesale'] });
    setCartItems([]);
    setDiscount(0);
    setCustomerName('');
    setShowPayment(false);
    setCompletedTransaction(transaction);
  };

  if (!activeShift) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
          <span className="text-3xl">🕐</span>
        </div>
        <h2 className="text-xl font-bold">Start Your Shift</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">
          You need to start a shift before processing sales. All transactions will be tracked under this shift.
        </p>
        <button
          onClick={startShift}
          className="mt-6 px-8 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors"
        >
          Start Shift
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Terminal header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">
            {isWholesale ? 'Wholesale Sale' : 'Retail Sale'}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isWholesale
              ? 'Bulk orders billed at your wholesale prices'
              : 'Standard counter sales at retail prices'}
          </p>
        </div>
        <SaleTypeToggle value={saleType} onChange={handleModeChange} />
      </div>

      <div className="flex flex-col lg:flex-row gap-4 h-auto lg:h-[calc(100vh-10rem)]">
        {/* Product search panel */}
        <div className="flex-1 min-w-0 h-[50vh] lg:h-auto">
          <ProductSearch products={products} onAddToCart={addToCart} getPrice={priceOf} mode={saleType} />
        </div>

        {/* Cart panel */}
        <div className="w-full lg:w-96 shrink-0">
          <Cart
            items={cartItems}
            subtotal={subtotal}
            taxTotal={taxTotal}
            discount={discount}
            grandTotal={grandTotal}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeItem}
            onSetDiscount={setDiscount}
            onCheckout={() => setShowPayment(true)}
            title={isWholesale ? 'Wholesale Order' : 'Current Sale'}
            customerName={isWholesale ? customerName : undefined}
            onSetCustomerName={isWholesale ? setCustomerName : undefined}
          />
        </div>
      </div>

      {showPayment && (
        <PaymentModal
          grandTotal={grandTotal}
          onPay={handlePayment}
          onClose={() => setShowPayment(false)}
        />
      )}

      {completedTransaction && (
        <ReceiptModal
          transaction={completedTransaction}
          onClose={() => {
            toast.success(
              `${isWholesale ? 'Wholesale order' : 'Sale'} completed! Change: $${(completedTransaction.change_given || 0).toFixed(2)}`
            );
            setCompletedTransaction(null);
          }}
        />
      )}
    </div>
  );
}