import { useState, useRef, useEffect } from 'react';
import QRCode from 'qrcode';
import QrScanner from 'qr-scanner';
import { getUuid, setUuid } from '../api/client';
import { cn } from '../lib/utils';
import { Scan } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';

interface IdentityPanelProps {
  open: boolean;
  onClose: () => void;
}

export function IdentityPanel({ open, onClose }: IdentityPanelProps) {
  const [copied, setCopied] = useState(false);
  const [scanning, setScanning] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const uuid = getUuid();
  const { resolvedTheme } = useTheme();

  const qrColors =
    resolvedTheme === 'dark' ? { dark: '#ECE9E0', light: '#1C1B18' } : { dark: '#141413', light: '#FDFCF8' };

  useEffect(() => {
    if (!open) return;
    // Defer one frame so Radix Dialog Portal has finished mounting the canvas
    const rafId = requestAnimationFrame(() => {
      if (!canvasRef.current) return;
      const qrUrl = `${window.location.origin}/code?uuid=${encodeURIComponent(uuid)}`;
      QRCode.toCanvas(canvasRef.current, qrUrl, {
        width: 200,
        margin: 1,
        color: qrColors,
      }).catch((err: unknown) => {
        console.error('QR generation failed:', err);
      });
    });
    return () => cancelAnimationFrame(rafId);
  }, [open, uuid, resolvedTheme]);

  // Cleanup scanner on close
  useEffect(() => {
    if (!open && scannerRef.current) {
      scannerRef.current.stop();
      scannerRef.current.destroy();
      scannerRef.current = null;
      setScanning(false);
    }
  }, [open]);

  if (!open) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(uuid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startCamera = async () => {
    if (!videoRef.current) return;
    setScanning(true);
    try {
      const scanner = new QrScanner(
        videoRef.current,
        result => {
          handleScannedData(result.data);
        },
        { returnDetailedScanResult: true },
      );
      scannerRef.current = scanner;
      await scanner.start();
    } catch (e) {
      console.error('Camera error:', e);
      setScanning(false);
    }
  };

  const stopCamera = () => {
    if (scannerRef.current) {
      scannerRef.current.stop();
      scannerRef.current.destroy();
      scannerRef.current = null;
    }
    setScanning(false);
  };

  const handleScannedData = (data: string) => {
    try {
      // Try ACP format: { url, token }
      const parsed = JSON.parse(data);
      if (parsed.url && parsed.token) {
        // Store ACP connection data and navigate to ACP direct connect view
        stopCamera();
        onClose();
        sessionStorage.setItem('acp_connection', JSON.stringify({ url: parsed.url, token: parsed.token }));
        window.location.href = '/code/?acp=1';
        return;
      }
    } catch {
      // Not JSON
    }

    // Try URL with uuid param
    try {
      const url = new URL(data);
      const importedUuid = url.searchParams.get('uuid');
      if (importedUuid) {
        setUuid(importedUuid);
        stopCamera();
        onClose();
        return;
      }
    } catch {
      // Not a URL
    }

    // Raw UUID string
    if (data.length >= 32) {
      setUuid(data);
      stopCamera();
      onClose();
      return;
    }
  };

  const handleScanUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async e => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const result = await QrScanner.scanImage(file, {
          returnDetailedScanResult: true,
        });
        handleScannedData(result.data);
      } catch {
        alert('No QR code found in image');
      }
    };
    input.click();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-sm rounded-2xl border-border bg-surface-1 p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-semibold text-text-primary">Identity</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* UUID */}
          <div>
            <label className="mb-1 block text-sm text-text-secondary">Your UUID</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-text-primary">
                {uuid}
              </code>
              <button
                onClick={handleCopy}
                className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-2 transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* QR Code display */}
          {!scanning && (
            <div>
              <label className="mb-2 block text-sm text-text-secondary">Scan on another device</label>
              <div className="flex justify-center">
                <canvas ref={canvasRef} />
              </div>
            </div>
          )}

          {/* Camera scanner */}
          {scanning && (
            <div>
              <label className="mb-2 block text-sm text-text-secondary">Camera scanner</label>
              <div className="relative overflow-hidden rounded-lg">
                <video ref={videoRef} className="w-full" />
              </div>
              <button
                onClick={stopCamera}
                className="mt-2 w-full rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-2 transition-colors"
              >
                Stop scanning
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={scanning ? stopCamera : startCamera}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors',
                scanning
                  ? 'border-status-error/30 text-status-error hover:bg-status-error/10'
                  : 'border-border text-text-secondary hover:bg-surface-2',
              )}
            >
              <Scan className="h-4 w-4" />
              {scanning ? 'Stop Camera' : 'Scan with Camera'}
            </button>
            <button
              onClick={handleScanUpload}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-2 transition-colors"
            >
              Upload QR Image
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
