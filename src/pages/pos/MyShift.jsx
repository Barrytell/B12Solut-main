import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Clock, DollarSign, CreditCard, Smartphone, Banknote, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StatCard from '@/components/shared/StatCard';
import ShiftCloseModal from '@/components/pos/ShiftCloseModal';

export default function MyShift() {
  const { user } = useOutletContext();
  const queryClient = useQueryClient();
  const [shift, setShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCloseModal, setShowCloseModal] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    base44.entities.Shift.filter({ cashier_email: user.email, status: 'open' })
      .then(shifts => {
        if (shifts.length > 0) setShift(shifts[0]);
        setLoading(false);
      });
  }, [user?.email]);

  const handleConfirmClose = async (closedShift) => {
    await base44.entities.Shift.update(shift.id, {
      status: 'closed',
      end_time: closedShift.end_time,
    });
    queryClient.invalidateQueries({ queryKey: ['shifts-all'] });
    setShift(null);
  };

  const handleModalClose = () => {
    setShowCloseModal(false);
    // If shift was closed, the shift state is already null
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!shift) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Clock className="w-16 h-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-bold">No Active Shift</h2>
        <p className="text-sm text-muted-foreground mt-2">Start a shift from the POS screen to begin tracking.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Current Shift</h1>
          <p className="text-sm text-muted-foreground">
            Started {shift.start_time ? format(new Date(shift.start_time), 'MMM d, h:mm a') : ''}
          </p>
        </div>
        <Button
          onClick={() => setShowCloseModal(true)}
          variant="destructive"
          className="rounded-xl"
        >
          Close Session
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Revenue" value={`$${(shift.total_revenue || 0).toFixed(2)}`} icon={DollarSign} />
        <StatCard title="Cash Sales" value={`$${(shift.total_cash_sales || 0).toFixed(2)}`} icon={Banknote} />
        <StatCard title="Card Sales" value={`$${(shift.total_card_sales || 0).toFixed(2)}`} icon={CreditCard} />
        <StatCard title="Transactions" value={shift.total_transactions || 0} icon={Receipt} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard title="E-Pay Sales" value={`$${(shift.total_electronic_sales || 0).toFixed(2)}`} icon={Smartphone} />
        <StatCard title="Gross Profit" value={`$${(shift.total_profit || 0).toFixed(2)}`} icon={DollarSign} />
      </div>

      {showCloseModal && (
        <ShiftCloseModal
          shift={shift}
          onConfirm={handleConfirmClose}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}