'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { Camera, ScanBarcode } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

/**
 * Barcode scan dialog with a hardware-scanner-first flow.
 *
 * USB / handheld scanners are keyboard-wedge devices: they "type" the barcode and
 * press Enter. There is no browser API to enumerate one, but its input is
 * recognisable — characters arrive in a fast burst and end in Enter. So the modal
 * opens listening for that (camera off); if a scanner fires, we use it. Only when
 * the user picks "Use the camera" do we open the webcam (the previous behaviour).
 */
export function ScanModal({
  open,
  onClose,
  onScan,
}: {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}) {
  const [mode, setMode] = useState<'scanner' | 'camera'>('scanner');

  // Always reopen in scanner-first mode (never auto-start the camera).
  useEffect(() => {
    if (open) setMode('scanner');
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Scan barcode">
      {mode === 'scanner' ? (
        <ScannerCapture onScan={onScan} onUseCamera={() => setMode('camera')} />
      ) : (
        <CameraCapture onScan={onScan} />
      )}
    </Modal>
  );
}

/**
 * Listens for a keyboard-wedge scanner via a focused input. Enter submits; a
 * fast-typed burst (scanner speed) also auto-submits shortly after it stops, so
 * scanners not configured to send Enter still work — while human typing (slow,
 * no fast burst) waits for an explicit Enter and never misfires.
 */
function ScannerCapture({ onScan, onUseCamera }: { onScan: (c: string) => void; onUseCamera: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const lastKey = useRef(0);
  const fastKeys = useRef(0);
  const idle = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    inputRef.current?.focus();
    return () => clearTimeout(idle.current);
  }, []);

  const submit = (code: string) => {
    const c = code.trim();
    if (c) onScan(c);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(idle.current);
      submit(value);
      return;
    }
    if (e.key.length === 1) {
      const now = performance.now();
      const gap = now - lastKey.current;
      lastKey.current = now;
      fastKeys.current = gap < 50 ? fastKeys.current + 1 : 0;
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setValue(next);
    clearTimeout(idle.current);
    // Scanner detected (burst of fast keystrokes) but no Enter sent → auto-submit
    // once input settles. Human typing never builds up a fast-key streak.
    if (fastKeys.current >= 3 && next.trim().length >= 4) {
      idle.current = setTimeout(() => submit(next), 120);
    }
  };

  return (
    <div className="space-y-3 p-5">
      <div className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-3">
        <ScanBarcode className="h-[18px] w-[18px] shrink-0 text-text-muted" />
        <input
          ref={inputRef}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder="Scan now, or type a barcode and press Enter"
          className="h-11 w-full bg-transparent text-sm text-ink-2 outline-none placeholder:text-text-faint"
          aria-label="Barcode"
        />
      </div>
      <p className="text-center text-xs text-text-muted">
        Using a USB or handheld scanner? Just pull the trigger — it fills in automatically.
      </p>
      <Button variant="outline" className="w-full gap-2" onClick={onUseCamera}>
        <Camera className="h-4 w-4" /> No scanner? Use the camera
      </Button>
    </div>
  );
}

/** Turn a getUserMedia / camera error into a line the user can act on. */
function cameraError(e: unknown): string {
  const name = (e as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Camera access was blocked. Allow the camera for this site, then try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError')
    return 'No camera was found on this device.';
  if (name === 'NotReadableError' || name === 'TrackStartError')
    return 'The camera is in use by another app. Close it and try again.';
  return 'Could not start the camera. You can still use a USB scanner or type the barcode.';
}

/** Webcam decoding via @zxing/browser; the stream is stopped on unmount. */
function CameraCapture({ onScan }: { onScan: (c: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let controls: IScannerControls | undefined;
    const reader = new BrowserMultiFormatReader();
    const video = videoRef.current;
    if (!video) return;

    reader
      .decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, video, (result, _err, ctrl) => {
        controls = ctrl;
        if (cancelled) {
          ctrl.stop();
          return;
        }
        const text = result?.getText();
        if (text) {
          cancelled = true;
          ctrl.stop();
          onScan(text);
        }
      })
      .then((ctrl) => {
        controls = ctrl;
        if (cancelled) ctrl.stop();
        else setStatus('scanning');
      })
      .catch((e) => {
        if (cancelled) return;
        setError(cameraError(e));
        setStatus('error');
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onScan]);

  return (
    <div className="space-y-3 p-5">
      {status === 'error' ? (
        <p className="rounded-lg bg-danger-soft px-3 py-4 text-sm text-danger">{error}</p>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-4/5 rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
            </div>
          </div>
          <p className="text-center text-xs text-text-muted">
            {status === 'starting'
              ? 'Starting the camera…'
              : 'Hold the barcode flat and steady inside the frame, well lit.'}
          </p>
        </>
      )}
    </div>
  );
}
