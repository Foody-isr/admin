'use client';

import { ChevronDownIcon, MapIcon, NavigationIcon } from 'lucide-react';
import {
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  type ButtonProps,
} from '@/components/ds';
import {
  googleNavigationUrl,
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
}

export function NavigationAppMenu({
  destination,
  label,
  t,
  variant = 'secondary',
  size = 'sm',
  className,
}: NavigationAppMenuProps) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant={variant} size={size} className={className} aria-label={t('chooseNavigationApp')}>
          <NavigationIcon />
          {label}
          <ChevronDownIcon className="h-3 w-3" />
        </Button>
      </MenuTrigger>
      <MenuContent side="top" align="start" className="min-w-[190px]">
        <MenuItem asChild>
          <a href={wazeNavigationUrl(destination)} target="_blank" rel="noopener noreferrer">
            <NavigationIcon />
            {t('navigationAppWaze')}
          </a>
        </MenuItem>
        <MenuItem asChild>
          <a href={googleNavigationUrl(destination)} target="_blank" rel="noopener noreferrer">
            <MapIcon />
            {t('navigationAppGoogleMaps')}
          </a>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
