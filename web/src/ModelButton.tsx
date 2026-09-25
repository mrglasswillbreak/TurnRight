/* Disabled-action explanations are focusable so keyboard users can read them. */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/** Shared editor actions; disabled reasons remain available to keyboard users. */
export function ModelButton({
  icon,
  children,
  title,
  ...props
}: ComponentProps<typeof Button> & { icon?: ReactNode }) {
  const button = (
    <Button
      variant="ghost"
      data-model-variant={props.variant || "ghost"}
      {...props}
      className={`model-button ${props.className || ''}`}
      title={title}
    >
      {icon}
      {children}
    </Button>
  );
  return title ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="model-button-tip"
            role={props.disabled ? 'note' : undefined}
            tabIndex={props.disabled ? 0 : undefined}
            aria-label={props.disabled ? title : undefined}
          />
        }
      >
        {button}
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  ) : (
    button
  );
}
