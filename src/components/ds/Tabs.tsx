'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

type Variant = 'segmented' | 'underline';

const VariantContext = React.createContext<Variant>('segmented');

export interface TabsProps extends React.ComponentProps<typeof TabsPrimitive.Root> {
  variant?: Variant;
}

export const Tabs = ({ variant = 'segmented', className, children, ...props }: TabsProps) => (
  <VariantContext.Provider value={variant}>
    <TabsPrimitive.Root
      data-slot="tabs"
      data-variant={variant}
      className={cn('flex flex-col gap-[var(--s-3)]', className)}
      {...props}
    >
      {children}
    </TabsPrimitive.Root>
  </VariantContext.Provider>
);

export const TabsList = ({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) => {
  const variant = React.useContext(VariantContext);
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        variant === 'segmented'
          ? 'inline-flex gap-[2px] bg-[var(--surface-2)] p-1 rounded-r-md'
          : 'flex gap-[var(--s-5)] border-b border-[var(--line)]',
        className,
      )}
      {...props}
    />
  );
};

export const Tab = ({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) => {
  const variant = React.useContext(VariantContext);
  if (variant === 'underline') {
    return (
      <TabsPrimitive.Trigger
        data-slot="tab"
        data-variant="underline"
        className={cn(
          'relative bg-transparent border-none py-[var(--s-3)] px-0',
          'text-fs-sm font-medium text-[var(--fg-muted)]',
          'transition-colors duration-fast ease-out',
          'hover:text-[var(--fg)]',
          'data-[state=active]:text-[var(--fg)]',
          "data-[state=active]:after:content-[''] data-[state=active]:after:absolute",
          'data-[state=active]:after:left-0 data-[state=active]:after:right-0',
          'data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5',
          'data-[state=active]:after:bg-[var(--brand-500)] data-[state=active]:after:rounded-[1px]',
          'focus-visible:outline-none focus-visible:shadow-ring rounded-r-sm',
          className,
        )}
        {...props}
      />
    );
  }
  return (
    <TabsPrimitive.Trigger
      data-slot="tab"
      data-variant="segmented"
      className={cn(
        'inline-flex items-center gap-[var(--s-2)] h-[30px] px-[var(--s-3)]',
        'rounded-r-sm bg-transparent border-none',
        'text-fs-sm font-medium text-[var(--fg-muted)]',
        'transition-[background-color,color] duration-fast ease-out',
        'hover:text-[var(--fg)]',
        'data-[state=active]:bg-[var(--surface)] data-[state=active]:text-[var(--fg)]',
        'data-[state=active]:shadow-1',
        'focus-visible:outline-none focus-visible:shadow-ring',
        '[&_svg]:w-4 [&_svg]:h-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
};

export const TabsContent = ({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content
    data-slot="tabs-content"
    className={cn('flex-1 outline-none', className)}
    {...props}
  />
);
