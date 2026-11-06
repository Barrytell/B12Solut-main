import React, { useState } from 'react';
import { X, DollarSign, Banknote, CreditCard, Smartphone, CheckCircle, Loader2, Receipt, TrendingUp, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { buildShiftReportData, generateShiftPDF } from '@/utils/shiftReport';
import { api, openShiftReport } from '@/api/client';
import { loadStoreSettings } from '@/utils/storeSettings';
import { subMoney } from '@/lib/money';

export default function ShiftCloseModal({ shift, onConfirm, onClose }) {
  const [step, setStep] = useState('review');
  const [declaredCash, setDeclaredCash] = useState('');
  const [reportData, setReportData] = useState(null);
  const [closedShift, setClosedShift] = useState(null);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState(null);

  const variance = reportData && declaredCash !== ''
    ? subMoney(declaredCash, reportData.summary.expectedCash)
    : null;

  const varianceColor = variance === null ? '' : variance === 0 ? 'text-green-600' : variance > 0 ? 'text-yellow-600' : 'text-red-600';
  const varianceLabel = variance === null ? '' : variance === 0 ? 'Balanced ✓' : variance > 0 ? `+$${Math.abs(variance).toFixed(2)} over` : `-$${Math.abs(variance).toFixed(2)} short`;

  const loadReportData = async () => {
    setStep('cash');
    const closedShift = { ...shift, end_time: new Date().toISOString() };
    try {
      setReportData(await buildShiftReportData(closedShift));
    } catch {
      // The shift can still be closed even if the preview figures fail
      setReportData(null);
    }
  };

  const handleFinalize = async () => {
    setStep('sending');
    setError(null);
    // 1. Close on the server (stores the counted cash). If this fails the shift stays open.
    let closed;
    try {
      ({ shift: closed } = await api.shifts.close(shift.id, declaredCash !== '' ? { declared_cash: declaredCash } : {}));
      setClosedShift(closed);
    } catch (e) {
      setError(e?.message || 'The shift could not be closed. Please try again.');
      setStep('cash');
      return;
    }
    // 2. The server builds the official PDF from database values, stores it and emails the admins.
    //    Closing is never undone by a report or email failure.
    try {
      const s = loadStoreSettings();
      const store = Object.fromEntries(['storeName', 'storeAddress', 'storePhone', 'storeEmail', 'storeWebsite']
        .map((k) => [k, String(s[k] ?? '').slice(0, 200)]));
      const result = await api.shifts.report(closed.id, { store });
      setEmailSent(result.email_sent);
      closed = { ...closed, report_path: result.report_path };
      setClosedShift(closed);
    } catch (e) {
      setError(e?.message || 'The report could not be generated or emailed.');
    }
    await onConfirm(closed);
    setStep('done');
  };

  const downloadReport = () => openShiftReport(closedShift.id).catch((e) => setError(e.message));

  const downloadPreview = () => {
    if (!reportData) return;
    const cash = declaredCash !== '' ? parseFloat(declaredCash) : null;
    const doc = generateShiftPDF(reportData, cash);
    doc.save(`shift-report-preview.pdf`);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold">
              {step === 'done' ? '✅ Shift Closed' : step === 'sending' ? 'Generating Report…' : 'Close Shift'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {step === 'review' ? 'Review your shift summary before closing' :
               step === 'cash' ? 'Enter declared cash for variance check' :
               step === 'sending' ? 'Building PDF and notifying admin…' :
               'Report sent to admin successfully'}
            </p>
          </div>
          {step !== 'sending' && (
            <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* STEP: Review */}
        {step === 'review' && (
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Revenue', value: `$${(shift.total_revenue || 0).toFixed(2)}`, icon: DollarSign, color: 'text-primary' },
                { label: 'Gross Profit', value: `$${(shift.total_profit || 0).toFixed(2)}`, icon: TrendingUp, color: 'text-green-600' },
                { label: 'Transactions', value: shift.total_transactions || 0, icon: Receipt, color: 'text-indigo-600' },
                { label: 'Avg. Sale', value: `$${(shift.total_transactions > 0 ? shift.total_revenue / shift.total_transactions : 0).toFixed(2)}`, icon: DollarSign, color: 'text-muted-foreground' },
              ].map(card => (
                <div key={card.label} className="bg-muted/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <card.icon className={cn("w-3.5 h-3.5", card.color)} />
                    <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{card.label}</span>
                  </div>
                  <p className={cn("text-xl font-bold", card.color)}>{card.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border divide-y divide-border text-sm">
              {[
                { label: 'Cash', value: shift.total_cash_sales || 0, icon: Banknote },
                { label: 'Card / POS', value: shift.total_card_sales || 0, icon: CreditCard },
                { label: 'Electronic', value: shift.total_electronic_sales || 0, icon: Smartphone },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <row.icon className="w-3.5 h-3.5" />
                    <span>{row.label}</span>
                  </div>
                  <span className="font-semibold">${row.value.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 flex gap-3">
              <Receipt className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
              <p>Closing this shift will generate a <strong>PDF report</strong> and email it to all admin users automatically.</p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
              <Button onClick={loadReportData} className="flex-1">Continue →</Button>
            </div>
          </div>
        )}

        {/* STEP: Cash count */}
        {step === 'cash' && (
          <div className="p-6 space-y-5">
            <div className="bg-muted/50 rounded-xl p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expected Cash in Drawer</p>
              <p className="text-3xl font-bold text-foreground">${(reportData?.summary.expectedCash || shift.total_cash_sales || 0).toFixed(2)}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Declared Cash (counted physically)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={declaredCash}
                onChange={e => setDeclaredCash(e.target.value)}
                className="h-12 text-lg text-center font-semibold"
                autoFocus
              />
              {declaredCash !== '' && variance !== null && (
                <div className={cn(
                  "rounded-lg px-4 py-2.5 flex items-center justify-between text-sm font-medium",
                  variance === 0 ? "bg-green-50 border border-green-200" :
                  variance > 0 ? "bg-yellow-50 border border-yellow-200" :
                  "bg-red-50 border border-red-200"
                )}>
                  <span className="text-muted-foreground">Variance</span>
                  <span className={cn("font-bold", varianceColor)}>{varianceLabel}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Optional — leave blank to skip variance tracking.</p>
            </div>

            {reportData && (
              <button
                onClick={downloadPreview}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                <Download className="w-4 h-4" />
                Preview PDF before sending
              </button>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep('review')} className="flex-1">← Back</Button>
              <Button onClick={handleFinalize} className="flex-1 bg-destructive hover:bg-destructive/90">
                Close Shift & Send Report
              </Button>
            </div>
          </div>
        )}

        {/* STEP: Sending */}
        {step === 'sending' && (
          <div className="p-12 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
            <div>
              <p className="font-semibold">Generating your report</p>
              <p className="text-sm text-muted-foreground mt-1">Building PDF, uploading, and sending email to admins…</p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {/* STEP: Done */}
        {step === 'done' && (
          <div className="p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <p className="font-bold text-lg">Shift Closed!</p>
              <p className="text-sm text-muted-foreground mt-1 break-words">
                {error
                  ? `Shift closed, but the report could not be sent: ${error}`
                  : emailSent ? 'The official report was emailed to the admins.' : 'The report was saved. No admin email could be sent.'}
              </p>
            </div>
            {closedShift?.report_path && (
              <button
                onClick={downloadReport}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary/10 text-primary rounded-xl text-sm font-medium hover:bg-primary/20 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download PDF Report
              </button>
            )}
            <Button onClick={onClose} className="w-full mt-2">Done</Button>
          </div>
        )}
      </div>
    </div>
  );
}