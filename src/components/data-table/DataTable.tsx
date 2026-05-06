'use client';

import * as React from 'react';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

type Align = 'left' | 'right' | 'center';

const alignClass: Record<Align, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

const headCellBase =
  'p-4 font-semibold text-neutral-700 dark:text-neutral-300 text-sm uppercase tracking-wider';

export type SortDir = 'asc' | 'desc';

type DataTableProps = React.HTMLAttributes<HTMLDivElement> & {
  /**
   * When false, the table keeps the desktop layout at all breakpoints
   * (use this for views that should not collapse to cards on mobile —
   * e.g. dashboards intentionally restricted to wider screens).
   * Defaults to true.
   */
  responsive?: boolean;
};

export const DataTable = React.forwardRef<HTMLDivElement, DataTableProps>(
  ({ className, children, responsive = true, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'bg-white dark:bg-[#111111] rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-800 overflow-hidden',
        responsive && 'responsive-table',
        className,
      )}
      {...props}
    >
      <table className="w-full">{children}</table>
    </div>
  ),
);
DataTable.displayName = 'DataTable';

export const DataTableHead = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, children, ...props }, ref) => (
  <thead ref={ref} className={className} {...props}>
    <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0a0a0a]">
      {children}
    </tr>
  </thead>
));
DataTableHead.displayName = 'DataTableHead';

type HeadCellProps = React.ThHTMLAttributes<HTMLTableCellElement> & {
  align?: Align;
};

export const DataTableHeadCell = React.forwardRef<HTMLTableCellElement, HeadCellProps>(
  ({ align = 'left', className, children, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(alignClass[align], headCellBase, className)}
      {...props}
    >
      {children}
    </th>
  ),
);
DataTableHeadCell.displayName = 'DataTableHeadCell';

type SortableHeadCellProps = Omit<HeadCellProps, 'onClick'> & {
  sortKey: string;
  currentSortKey: string | null | undefined;
  sortDir: SortDir;
  onSort: (key: string) => void;
};

export const SortableHeadCell = React.forwardRef<HTMLTableCellElement, SortableHeadCellProps>(
  ({ sortKey, currentSortKey, sortDir, onSort, align = 'left', className, children, ...props }, ref) => {
    const isActive = currentSortKey === sortKey;
    const buttonAlign = align === 'right' ? 'ml-auto' : align === 'center' ? 'mx-auto' : '';
    return (
      <th
        ref={ref}
        aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={cn(alignClass[align], headCellBase, className)}
        {...props}
      >
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className={cn(
            'inline-flex items-center gap-1 uppercase tracking-wider hover:text-neutral-900 dark:hover:text-white transition-colors',
            buttonAlign,
          )}
        >
          {children}
          {isActive &&
            (sortDir === 'asc' ? (
              <ChevronUpIcon className="w-3.5 h-3.5" />
            ) : (
              <ChevronDownIcon className="w-3.5 h-3.5" />
            ))}
        </button>
      </th>
    );
  },
);
SortableHeadCell.displayName = 'SortableHeadCell';

export const DataTableHeadSpacerCell = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, children, ...props }, ref) => (
  <th ref={ref} className={cn('p-4 w-12', className)} {...props}>
    {children}
  </th>
));
DataTableHeadSpacerCell.displayName = 'DataTableHeadSpacerCell';

type SelectAllProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function DataTableSelectAllCell({ checked, onCheckedChange }: SelectAllProps) {
  return (
    <DataTableHeadSpacerCell>
      <Checkbox checked={checked} onCheckedChange={onCheckedChange} />
    </DataTableHeadSpacerCell>
  );
}

export const DataTableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, children, ...props }, ref) => (
  <tbody ref={ref} className={className} {...props}>
    {children}
  </tbody>
));
DataTableBody.displayName = 'DataTableBody';

type RowProps = React.HTMLAttributes<HTMLTableRowElement> & {
  index?: number;
  striped?: boolean;
};

export const DataTableRow = React.forwardRef<HTMLTableRowElement, RowProps>(
  ({ index, striped = true, className, children, ...props }, ref) => {
    const stripeCls =
      striped && index !== undefined && index % 2 !== 0
        ? 'bg-neutral-50/50 dark:bg-[#0f0f0f]'
        : 'bg-white dark:bg-[#111111]';
    return (
      <tr
        ref={ref}
        className={cn(
          'border-b border-neutral-100 dark:border-neutral-800 hover:bg-orange-50/50 dark:hover:bg-orange-900/20 transition-colors',
          striped ? stripeCls : '',
          className,
        )}
        {...props}
      >
        {children}
      </tr>
    );
  },
);
DataTableRow.displayName = 'DataTableRow';

type CellProps = React.TdHTMLAttributes<HTMLTableCellElement> & {
  align?: Align;
  /**
   * Label shown next to the cell value when the table collapses to cards
   * on mobile. When omitted, the cell still renders but without a label.
   * Use one of the role props below for non-standard treatments.
   */
  mobileLabel?: string;
  /**
   * Render this cell as the card heading on mobile (full-width, larger,
   * no leading label). Typically the order number, item name, etc.
   */
  mobilePrimary?: boolean;
  /** Hide this cell entirely on mobile (e.g. low-value metadata). */
  mobileHidden?: boolean;
};

export const DataTableCell = React.forwardRef<HTMLTableCellElement, CellProps>(
  ({ align, className, children, mobileLabel, mobilePrimary, mobileHidden, ...props }, ref) => (
    <td
      ref={ref}
      className={cn('p-4', align ? alignClass[align] : '', className)}
      data-label={mobileLabel}
      data-mobile-primary={mobilePrimary ? '' : undefined}
      data-mobile-hidden={mobileHidden ? '' : undefined}
      {...props}
    >
      {children}
    </td>
  ),
);
DataTableCell.displayName = 'DataTableCell';

type SelectCellProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function DataTableSelectCell({ checked, onCheckedChange }: SelectCellProps) {
  return (
    <DataTableCell data-mobile-select="">
      <Checkbox checked={checked} onCheckedChange={onCheckedChange} />
    </DataTableCell>
  );
}
