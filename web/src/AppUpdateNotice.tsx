import { Button } from '@/components/ui/button';

export function AppUpdateNotice({
  navigating,
  installing,
  onInstall,
}: {
  navigating: boolean;
  installing: boolean;
  onInstall: () => Promise<void>;
}) {
  return (
    <div className="public-update">
      <output>
        <strong>App update ready</strong>
        <span>
          {navigating
            ? 'Finish your walk before updating.'
            : 'Install the latest version of TurnRight.'}
        </span>
      </output>
      <Button disabled={navigating || installing} onClick={onInstall}>
        {installing ? 'Installing…' : 'Install update'}
      </Button>
    </div>
  );
}
