'use client';

// Which ticket to print: customer receipt (with prices) or kitchen ticket
// (without). Printing itself is browser-based, see lib/print-ticket.ts.
//
// Rebuilt on ds/Menu. The previous version hand-rolled a useRef + mousedown
// outside-click handler with `absolute bottom-full` positioning — no Escape, no
// focus trap, no roving focus, and it would clip inside the new sticky command
// bar. Radix portals out and handles all of it.

import { PrinterIcon, ChevronDownIcon } from 'lucide-react';
import { Button, Menu, MenuTrigger, MenuContent, MenuItem } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import type { TicketKind } from '@/lib/print-ticket';

export function PrintTicketMenu({ onSelect }: { onSelect: (kind: TicketKind) => void }) {
  const { t } = useI18n();

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="secondary" size="md" className="h-11 flex-1 md:flex-none justify-center font-semibold">
          <PrinterIcon /> {t('printReceipt') || 'Imprimer ticket'}
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </Button>
      </MenuTrigger>
      {/* The command bar sits at the bottom of the takeover, so open upward. */}
      <MenuContent side="top" align="start" className="order-detail-menu min-w-[200px]">
        <MenuItem onSelect={() => onSelect('receipt')}>
          {t('printCustomerReceipt') || 'Reçu client'}
        </MenuItem>
        <MenuItem onSelect={() => onSelect('kitchen')}>
          {t('printKitchenTicket') || 'Ticket cuisine'}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
