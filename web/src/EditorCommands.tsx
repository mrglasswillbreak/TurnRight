import { useEffect, useRef } from 'react';
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
export interface EditorCommand {
  id: string;
  label: string;
  run: () => void;
  disabled?: boolean;
}
export default function EditorCommands({
  commands,
  onClose,
}: {
  commands: EditorCommand[];
  onClose: () => void;
}) {
  const previous = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const element = previous.current;
    return () => element?.focus();
  }, []);
  return (
    <CommandDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Editor commands"
      description="Find an editing tool or workspace task"
    >
      <Command>
        <CommandInput placeholder="Search tools and actions…" />
        <CommandList>
          <CommandEmpty>No matching action.</CommandEmpty>
          <CommandGroup heading="Workspace">
            {commands.map((command) => (
              <CommandItem
                key={command.id}
                disabled={command.disabled}
                onSelect={() => {
                  onClose();
                  command.run();
                }}
              >
                {command.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
