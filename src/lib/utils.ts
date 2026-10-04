import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const merge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: ['fs-micro', 'fs-xs', 'fs-sm', 'fs-md', 'fs-lg', 'fs-xl', 'fs-2xl', 'fs-3xl', 'fs-4xl', 'fs-5xl'] }] } },
});

/** Merge utility classes without mistaking Foody type sizes for text colors. */
export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}
