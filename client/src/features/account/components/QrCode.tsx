import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface QrCodeProps {
  value: string;
  /** Text alternative: the QR code itself is meaningless to a screen reader */
  label: string;
  className?: string;
}

const QUIET_ZONE = 4;

/** Dark squares as one SVG path (`M x y h1 v1 h-1 z` per module), so the image needs no data: URL under the CSP. */
const toPath = (size: number, isDark: (row: number, col: number) => boolean): string => {
  let path = '';
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (isDark(row, col)) path += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
    }
  }
  return path;
};

/** QR code for `value`; the `qrcode` library loads only when this renders. Always black on white so scanners read it in dark mode. */
export const QrCode = ({ value, label, className }: QrCodeProps) => {
  const [code, setCode] = useState<{ value: string; size: number; path: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import('qrcode')
      .then((qr) => {
        if (cancelled) return;
        const { modules } = qr.create(value, { errorCorrectionLevel: 'M' });
        setCode({ value, size: modules.size, path: toPath(modules.size, (row, col) => Boolean(modules.get(row, col))) });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (failed) {
    return <p className="text-sm text-danger-fg">The QR code could not be drawn. Use the key below instead.</p>;
  }
  if (!code || code.value !== value) return <Skeleton className={className ?? 'size-48 rounded-xl'} />;

  const total = code.size + QUIET_ZONE * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
      className={className ?? 'size-48 rounded-xl border border-slate-200'}
    >
      <rect width={total} height={total} fill="#fff" />
      <path d={code.path} fill="#000" />
    </svg>
  );
};
