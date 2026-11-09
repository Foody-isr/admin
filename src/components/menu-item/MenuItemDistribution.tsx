'use client';

import { Search } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Switch } from '@/components/ui/switch';
import MenuGroupPicker from '@/components/MenuGroupPicker';
import type { Menu, MenuCategory } from '@/lib/api';
import type { ItemMenuAssignment } from '@/lib/item-menu-assignments';

/** Separate status, internal classification and customer-facing menu cards. */
export default function MenuItemDistribution({
  categories,
  categoryId,
  setCategoryId,
  menus,
  restaurantId,
  itemId,
  menuAssignments,
  setMenuAssignments,
  isActive,
  setIsActive,
  disabled = false,
  itemLocked = false,
  preserveRemovals = false,
}: {
  categories: MenuCategory[];
  categoryId: number;
  setCategoryId: (id: number) => void;
  menus: Menu[];
  restaurantId: number;
  itemId?: number;
  menuAssignments: ItemMenuAssignment[];
  setMenuAssignments: (edits: ItemMenuAssignment[]) => void;
  isActive: boolean;
  setIsActive: (value: boolean) => void;
  disabled?: boolean;
  itemLocked?: boolean;
  preserveRemovals?: boolean;
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
            disabled={readOnly || itemLocked}
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
            disabled={readOnly || itemLocked}
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
          restaurantId={restaurantId}
          itemId={itemId}
          disabled={readOnly}
          menus={menus}
          assignments={menuAssignments}
          preserveRemovals={preserveRemovals}
          onChange={setMenuAssignments}
        />
      </section>
    </fieldset>
  );
}
