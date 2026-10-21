import { useEffect, useState } from 'react';
export function useBlob(blob?: Blob) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) {
      setUrl('');
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

export const bytes = (n: number) =>
  n < 1048576
    ? `${(n / 1024).toFixed(1)} KiB`
    : `${(n / 1048576).toFixed(2)} MiB`;
