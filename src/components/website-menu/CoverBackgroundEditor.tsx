'use client';

import { useRef, useState } from 'react';
import { Restaurant, updateRestaurant, uploadRestaurantBackground } from '@/lib/api';
import { CoverFocalPicker } from '@/components/website/CoverFocalPicker';

type Props = {
  restaurantId: number;
  restaurant: Restaurant | null;
  onRestaurantUpdate: (r: Restaurant) => void;
};

const PRESET_COLORS = [
  '#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5',
  '#2196F3', '#03A9F4', '#009688', '#4CAF50', '#8BC34A',
  '#FF9800', '#FF5722', '#795548', '#607D8B', '#212121',
];

export function CoverBackgroundEditor({ restaurantId, restaurant, onRestaurantUpdate }: Props) {
  const [uploading, setUploading] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pickerColor, setPickerColor] = useState(restaurant?.background_color || '#EB5204');

  const focalSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function patch(fields: Partial<Restaurant>) {
    if (!restaurant) return;
    try {
      const updated = await updateRestaurant(restaurantId, { name: restaurant.name, ...fields } as Partial<Restaurant>);
      onRestaurantUpdate(updated);
    } catch {
      /* surfaced at parent */
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const imageUrl = await uploadRestaurantBackground(restaurantId, file);
      await patch({ cover_url: imageUrl, cover_display_mode: 'cover' });
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    await patch({ cover_url: '', background_color: '' });
  }

  async function handleSetColor(hex: string) {
    await patch({ background_color: hex, cover_url: '' });
  }

  function handleFocalChange(x: number, y: number) {
    if (!restaurant) return;
    onRestaurantUpdate({ ...restaurant, cover_focal_x: x, cover_focal_y: y });
    if (focalSaveTimer.current) clearTimeout(focalSaveTimer.current);
    focalSaveTimer.current = setTimeout(() => {
      patch({ cover_focal_x: x, cover_focal_y: y });
    }, 400);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-fg-primary mb-2">Arrière-plan</label>

      {restaurant?.cover_url ? (
        <div className="mb-3">
          <CoverFocalPicker
            src={restaurant.cover_url}
            focalX={typeof restaurant.cover_focal_x === 'number' ? restaurant.cover_focal_x : 50}
            focalY={typeof restaurant.cover_focal_y === 'number' ? restaurant.cover_focal_y : 50}
            onChange={handleFocalChange}
          />
        </div>
      ) : restaurant?.background_color ? (
        <div
          className="relative rounded-lg overflow-hidden border border-[var(--divider)] mb-3 flex items-center justify-center"
          style={{ height: 140, backgroundColor: restaurant.background_color }}
        >
          <span className="text-xs font-medium text-white/80">{restaurant.background_color}</span>
        </div>
      ) : (
        <div
          className="relative rounded-lg overflow-hidden border border-[var(--divider)] mb-3 flex items-center justify-center bg-[var(--surface-hover)]"
          style={{ height: 140 }}
        >
          <span className="text-xs text-fg-secondary">Aucun arrière-plan</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <label
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-medium cursor-pointer hover:bg-brand-600 transition ${
            uploading ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          {uploading ? 'Téléversement…' : 'Téléverser une image'}
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
        <button
          onClick={() => {
            setPickerColor(restaurant?.background_color || '#EB5204');
            setShowColorPicker(true);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--divider)] text-xs font-medium text-fg-primary hover:bg-[var(--surface-hover)] transition"
        >
          Choisir une couleur
        </button>
        {(restaurant?.cover_url || restaurant?.background_color) && (
          <button
            onClick={handleRemove}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 text-xs font-medium text-red-600 hover:bg-red-50 transition"
          >
            Retirer
          </button>
        )}
      </div>

      {showColorPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowColorPicker(false)}
        >
          <div
            className="bg-[var(--surface)] rounded-xl shadow-xl p-5 w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-fg-primary mb-3">Choisir une couleur de fond</h3>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setPickerColor(c)}
                  className={`w-10 h-10 rounded-lg border-2 transition ${
                    pickerColor === c ? 'border-brand-500 scale-110' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mb-4">
              <input
                type="color"
                value={pickerColor}
                onChange={(e) => setPickerColor(e.target.value)}
                className="w-12 h-10 rounded cursor-pointer"
              />
              <input
                type="text"
                value={pickerColor}
                onChange={(e) => setPickerColor(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--divider)] bg-[var(--surface)] text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                placeholder="#000000"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowColorPicker(false)}
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--divider)] text-sm font-medium text-fg-primary hover:bg-[var(--surface-hover)] transition"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  handleSetColor(pickerColor);
                  setShowColorPicker(false);
                }}
                className="flex-1 px-3 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition"
              >
                Appliquer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
