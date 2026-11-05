import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, ScanBarcode, Camera } from 'lucide-react';

export default function BarcodeScannerModal({ products, onAdd, onClose }) {
  const scannerRef = useRef(null);
  const [error, setError] = useState(null);
  const [lastScanned, setLastScanned] = useState(null);
  const cooldownRef = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode('barcode-reader');
    scannerRef.current = scanner;
    let cancelled = false;
    let running = false;

    const stopScanner = () => {
      if (!running) return;
      running = false;
      try {
        scanner.stop().catch(() => {});
      } catch {
        // Scanner was already stopped — safe to ignore
      }
    };

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 280, height: 160 } },
      (decodedText) => {
        if (cooldownRef.current) return;
        cooldownRef.current = true;

        const product = products.find(
          p => p.barcode === decodedText || p.sku === decodedText
        );

        if (product) {
          onAdd(product);
          setLastScanned({ product, code: decodedText, found: true });
        } else {
          setLastScanned({ product: null, code: decodedText, found: false });
        }

        // 2-second cooldown before next scan
        setTimeout(() => { cooldownRef.current = false; }, 2000);
      },
      () => {} // ignore per-frame errors
    ).then(() => {
      if (cancelled) {
        // Unmounted before the camera finished starting — stop it now
        try {
          scanner.stop().catch(() => {});
        } catch {
          // ignore
        }
      } else {
        running = true;
      }
    }).catch(() => {
      if (!cancelled) {
        setError('Camera access denied or unavailable. Please allow camera permissions and try again.');
      }
    });

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ScanBarcode className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-lg">Scan Barcode</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scanner area */}
        <div className="relative bg-black">
          <div id="barcode-reader" className="w-full" />

          {/* Scanning guide overlay */}
          {!error && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="border-2 border-primary rounded-lg w-64 h-36 relative">
                <span className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-primary rounded-tl" />
                <span className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-primary rounded-tr" />
                <span className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-primary rounded-bl" />
                <span className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-primary rounded-br" />
              </div>
            </div>
          )}
        </div>

        {/* Status area */}
        <div className="px-5 py-4 min-h-[80px] flex flex-col justify-center">
          {error ? (
            <div className="flex items-start gap-3 text-destructive">
              <Camera className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          ) : lastScanned ? (
            lastScanned.found ? (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                  <span className="text-lg">✅</span>
                </div>
                <div>
                  <p className="font-medium text-sm text-green-700">Added to cart!</p>
                  <p className="text-xs text-muted-foreground">{lastScanned.product.name}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                  <span className="text-lg">❓</span>
                </div>
                <div>
                  <p className="font-medium text-sm text-orange-700">Product not found</p>
                  <p className="text-xs text-muted-foreground font-mono">{lastScanned.code}</p>
                </div>
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground text-center">
              Point camera at a barcode to scan
            </p>
          )}
        </div>

        <div className="px-5 pb-4">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}