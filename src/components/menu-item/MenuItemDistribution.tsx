'use client';

import { Search } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Switch } from '@/components/ui/switch';
import MenuGroupPicker from '@/components/MenuGroupPicker';
import type { Menu, MenuCategory } from '@/lib/api';

/** Separate status, internal classification and customer-facing menu cards. */
export default function MenuItemDistribution({
  categories,
  categoryId,
  setCategoryId,
  menus,
  selectedGroupIds,
  setSelectedGroupIds,
  isActive,
  setIsActive,
  disabled = false,
}: {
  categories: MenuCategory[];
  categoryId: number;
  setCategoryId: (id: number) => void;
  menus: Menu[];
  selectedGroupIds: Set<number>;
  setSelectedGroupIds: (ids: Set<number>) => void;
  isActive: boolean;
  setIsActive: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const readOnly = disabled || !hasAnyPermission('menu.edit');
  return (
    <fieldset disabled={readOnly} className="item-distribution">
      <section
        className="item-side-card item-state-card"
        aria-labelledby="item-state-title"
      >
        <h2 id="item-state-title">{t('status')}</h2>
        <label className="item-state-control">
          <span>{isActive ? t('active') : t('inactive')}</span>
          <Switch
            checked={isActive}
            onCheckedChange={setIsActive}
            disabled={readOnly}
            aria-label={t('active')}
          />
        </label>
      </section>
      <section className="item-side-card" aria-labelledby="item-category-title">
        <h2 id="item-category-title">{t('categories')}</h2>
        <p>{t('itemCategoryPurpose')}</p>
        <div className="item-category-picker">
          <Search size={20} aria-hidden />
          <select
            id="menu-item-category"
            aria-label={t('category')}
            disabled={readOnly}
            value={categoryId}
            onChange={(event) => setCategoryId(Number(event.target.value))}
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
        </div>
      </section>
      <section className="item-side-card" aria-labelledby="item-menus-title">
        <h2 id="item-menus-title">{t('menus')}</h2>
        <p>{t('itemMenusPurpose')}</p>
        <MenuGroupPicker
          appearance="item-editor"
          disabled={readOnly}
          menus={menus}
          selectedGroupIds={selectedGroupIds}
          onChange={setSelectedGroupIds}
          placeholder={t('addToMenus')}
          emptyLabel={t('noMenusAvailable')}
          noGroupsHint={t('noGroupsInMenu')}
        />
        {selectedGroupIds.size === 0 && (
          <p className="item-menu-empty-hint">{t('itemMenuRequiredHint')}</p>
        )}
      </section>
    </fieldset>
  );
}
