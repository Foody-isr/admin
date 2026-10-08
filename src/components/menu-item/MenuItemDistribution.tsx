'use client';

import { useI18n, useCurrency } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Field } from '@/components/ds';
import { Switch } from '@/components/ui/switch';
import MenuGroupPicker from '@/components/MenuGroupPicker';
import type { Menu, MenuCategory } from '@/lib/api';

/** Restaurant library classification and customer-facing menu distribution. */
export default function MenuItemDistribution({
  name,
  price,
  categories,
  categoryId,
  setCategoryId,
  menus,
  selectedGroupIds,
  setSelectedGroupIds,
  isActive,
  setIsActive,
  disabled = false,
  byWeight = false,
}: {
  name: string;
  price: number;
  categories: MenuCategory[];
  categoryId: number;
  setCategoryId: (id: number) => void;
  menus: Menu[];
  selectedGroupIds: Set<number>;
  setSelectedGroupIds: (ids: Set<number>) => void;
  isActive: boolean;
  setIsActive: (value: boolean) => void;
  disabled?: boolean;
  byWeight?: boolean;
}) {
  const { t } = useI18n();
  const { symbol } = useCurrency();
  const { hasAnyPermission } = usePermissions();
  const readOnly = disabled || !hasAnyPermission('menu.edit');
  return (
    <fieldset
      disabled={readOnly}
      className="min-w-0 space-y-5 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5"
    >
      <h2 className="font-semibold">{t('itemSectionDistribution')}</h2>
      <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium">
        {t('active')}
        <Switch
          checked={isActive}
          onCheckedChange={setIsActive}
          disabled={readOnly}
          aria-label={t('active')}
        />
      </label>
      <Field label={t('menus')} hint={t('cartesPickHint')}>
        <MenuGroupPicker
          disabled={readOnly}
          menus={menus}
          selectedGroupIds={selectedGroupIds}
          onChange={setSelectedGroupIds}
          placeholder={t('addToMenus')}
          emptyLabel={t('noMenusAvailable')}
          noGroupsHint={t('noGroupsInMenu')}
        />
      </Field>
      <p className="text-xs leading-relaxed text-[var(--fg-muted)]">
        {t('itemChannelsInherited')}
      </p>
      <Field
        htmlFor="menu-item-category"
        label={t('category')}
        hint={t('itemInternalCategoryHint')}
      >
        <select
          id="menu-item-category"
          disabled={readOnly}
          value={categoryId}
          onChange={(event) => setCategoryId(Number(event.target.value))}
          className="input text-sm"
        >
          {!categories.some((category) => category.id === categoryId) && (
            <option value={categoryId}>{t('addToCategories')}</option>
          )}
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="border-t border-[var(--line)] pt-4 text-sm">
        <p className="break-words font-medium">{name || t('createItem')}</p>
        <p
          dir="ltr"
          className="mt-1 text-start tabular-nums text-[var(--fg-muted)]"
        >
          {price.toFixed(2)} {symbol}{byWeight ? '/kg' : ''}
        </p>
      </div>
    </fieldset>
  );
}
