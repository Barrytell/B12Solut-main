import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useOutletContext } from 'react-router-dom';
import ProductSearch from '@/components/pos/ProductSearch';
import Cart from '@/components/pos/cart';
import PaymentModal from '@/components/pos/PaymentModal';
import ReceiptModal from '@/components/pos/ReceiptModal';
import SaleTypeToggle from '@/components/pos/SaleTypeToggle';
import { toast } from 'sonner';
import { wholesaleUnitPrice } from '@/utils/wholesale';
import { priceCart } from '@/lib/money';

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
    queryFn: () => api.entities.Product.filter({ is_active: true }),
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
      return { ...item, unit_price: unitPrice };
    }));
  };

  // Check for active shift (the server only returns the caller's own shifts)
  const refreshShift = () => api.entities.Shift.filter({ status: 'open' })
    .then(shifts => setActiveShift(shifts[0] ?? null));

  useEffect(() => {
    if (!user?.email) return;
    refreshShift();
  }, [user?.email]);

  const startShift = async () => {
    try {
      const { shift } = await api.shifts.start();
      setActiveShift(shift);
      toast.success('Shift started!');
    } catch (err) {
      if (err.code === 'SHIFT_ALREADY_OPEN' && err.details?.shift) {
        setActiveShift(err.details.shift);
        return;
      }
      toast.error(err.message || 'Could not start the shift');
    }
  };

  // tax_amount / line_total are derived by priceCart() below, in exact cents
  const withQuantity = (item, quantity) => ({ ...item, quantity });

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

  // Same pricing rules as POST /api/sales, in exact cents, so the screen shows
  // what the server will charge. The server recomputes everything from the database.
  const priced = priceCart(cartItems, discount);
  const { subtotal, taxTotal, grandTotal } = priced;

  // One idempotency key per checkout attempt: a double tap or a network retry
  // replays the same sale instead of charging twice.
  const checkoutId = useRef(null);
  const openPayment = () => {
    checkoutId.current = crypto.randomUUID();
    setShowPayment(true);
  };

  const handlePayment = async (paymentMethod, amountPaid) => {
    const body = {
      client_request_id: checkoutId.current,
      sale_type: saleType,
      items: cartItems.map(item => ({ product_id: item.product_id, quantity: item.quantity })),
      discount_amount: discount || 0,
      payment_method: paymentMethod,
    };
    if (paymentMethod === 'cash') body.amount_paid = amountPaid;
    if (isWholesale && customerName.trim()) body.customer_name = customerName.trim();

    let result;
    try {
      result = await api.sales.create(body);
    } catch (err) {
      if (err.code === 'INSUFFICIENT_STOCK') {
        const names = (err.details || []).map(d => `${d.name} (${d.available} left)`).join(', ');
        toast.error(`Not enough stock: ${names}`);
        queryClient.invalidateQueries({ queryKey: ['products'] });
      } else if (err.code === 'NO_OPEN_SHIFT') {
        toast.error('Your shift is no longer open. Start a new shift.');
        refreshShift();
      } else {
        toast.error(err.message || 'The sale could not be completed');
      }
      return; // keeps the cart so the cashier can fix it and retry
    }

    const alerts = result.low_stock_alerts || [];
    if (alerts.length > 0) {
      toast.warning(`⚠️ Low stock alert sent to admin for: ${alerts.map(p => p.name).join(', ')}`);
    }

    refreshShift();
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['transactions-wholesale'] });
    checkoutId.current = null;
    setCartItems([]);
    setDiscount(0);
    setCustomerName('');
    setShowPayment(false);
    setCompletedTransaction(result.transaction);
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
            items={priced.lines}
            subtotal={subtotal}
            taxTotal={taxTotal}
            discount={discount}
            grandTotal={grandTotal}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeItem}
            onSetDiscount={setDiscount}
            onCheckout={openPayment}
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