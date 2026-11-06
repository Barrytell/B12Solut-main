import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api, openShiftReport } from '@/api/client';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Clock, DollarSign, CreditCard, Smartphone, Banknote, Receipt, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StatCard from '@/components/shared/StatCard';
import ShiftCloseModal from '@/components/pos/ShiftCloseModal';

export default function MyShift() {
  const { user } = useOutletContext();
  const queryClient = useQueryClient();
  const [shift, setShift] = useState(null);
  const [lastClosed, setLastClosed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCloseModal, setShowCloseModal] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    // The server returns only the caller's own shifts.
    Promise.all([
      api.entities.Shift.filter({ status: 'open' }),
      api.entities.Shift.filter({ status: 'closed' }, '-created_date', 1),
    ]).then(([open, closed]) => {
      setShift(open[0] ?? null);
      setLastClosed(closed[0] ?? null);
    }).catch((err) => toast.error(err.message || 'Could not load your shift'))
      .finally(() => setLoading(false));
  }, [user?.email]);

  // The modal already closed the shift on the server; keep it on screen until "Done".
  const handleConfirmClose = async (closedShift) => {
    queryClient.invalidateQueries({ queryKey: ['shifts-all'] });
    setLastClosed(closedShift);
  };

  const handleModalClose = () => {
    setShowCloseModal(false);
    if (lastClosed && shift && lastClosed.id === shift.id) setShift(null);
  };

  const viewReport = (id) => openShiftReport(id).catch((err) => toast.error(err.message));

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
        {lastClosed && (
          <Button
            variant="outline"
            className="mt-6 rounded-xl gap-2"
            disabled={!lastClosed.report_path}
            onClick={() => viewReport(lastClosed.id)}
          >
            <FileText className="w-4 h-4" />
            {lastClosed.report_path ? 'View last shift report' : 'No report for your last shift'}
          </Button>
        )}
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
