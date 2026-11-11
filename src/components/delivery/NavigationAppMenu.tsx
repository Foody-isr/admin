'use client';

import { useState } from 'react';
import { AlertCircleIcon, ChevronDownIcon, MapIcon, NavigationIcon } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  type ButtonProps,
} from '@/components/ds';
import {
  googleNavigationUrl,
  hasNavigationCoordinates,
  wazeNavigationUrl,
  type NavigationDestination,
} from '@/lib/delivery-links';

type Translator = (key: string) => string;

interface NavigationAppMenuProps {
  destination: NavigationDestination;
  label: string;
  t: Translator;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
  disabled?: boolean;
  onNavigate: (url: string) => void;
}

export function NavigationAppMenu({
  destination,
  label,
  t,
  variant = 'secondary',
  size = 'sm',
  className,
  disabled,
  onNavigate,
}: NavigationAppMenuProps) {
  const [confirmSearch, setConfirmSearch] = useState(false);
  const uncertain = !hasNavigationCoordinates(destination);
  const wazeUrl = wazeNavigationUrl(destination);
  const chooseWaze = () => {
    if (uncertain) setConfirmSearch(true);
    else onNavigate(wazeUrl);
  };
  return (
    <>
    <Menu>
      <MenuTrigger asChild>
        <Button variant={variant} size={size} className={className} disabled={disabled} aria-label={t('chooseNavigationApp')}>
          <NavigationIcon />
          {label}
          <ChevronDownIcon className="h-3 w-3" />
        </Button>
      </MenuTrigger>
      <MenuContent side="top" align="start" className="min-w-[190px]">
        <MenuItem onSelect={chooseWaze}>
          <NavigationIcon />
          {t('navigationAppWaze')}
        </MenuItem>
        <MenuItem onSelect={() => onNavigate(googleNavigationUrl(destination))}>
          <MapIcon />
          {t('navigationAppGoogleMaps')}
        </MenuItem>
      </MenuContent>
    </Menu>
    {uncertain && <p role="note" className="flex basis-full items-start gap-1.5 text-fs-xs text-[var(--warning-500)]"><AlertCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t('navigationUnverifiedAddress')}</p>}
    <ConfirmDialog open={confirmSearch} onOpenChange={setConfirmSearch} title={t('navigationUnverifiedTitle')} description={t('navigationUnverifiedDescription').replace('{address}', [destination.address, destination.city].filter(Boolean).join(', '))} confirmLabel={t('navigationSearchAnyway')} cancelLabel={t('back')} onConfirm={() => { setConfirmSearch(false); onNavigate(wazeUrl); }} />
    </>
  );
}
