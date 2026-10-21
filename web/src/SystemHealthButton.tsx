import { lazy, Suspense, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
const SystemHealth = lazy(() => import('./SystemHealth'));

export function SystemHealthButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>System health</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85dvh] overflow-y-auto">
          <DialogTitle>System health</DialogTitle>
          <DialogDescription>
            Private operational failures from the last 30 days. Repeated
            failures are grouped; new occurrences reopen resolved groups.
          </DialogDescription>
          {open && (
            <Suspense fallback={<output>Loading monitoring…</output>}>
              <SystemHealth />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
