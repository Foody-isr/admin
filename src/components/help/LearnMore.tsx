'use client';

import { ExternalLink } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { FEATURE_HELP, helpArticleUrl } from '@/lib/help/registry';

interface Props {
  /** A registered feature key (resolves topic+slug from the registry)… */
  feature?: string;
  /** …or pass an explicit topic+slug for one-off links. */
  topic?: string;
  slug?: string;
  className?: string;
}

/** A "Learn more" link that deep-links to the matching foodylanding Help
 *  article in the reader's language, opening in a new tab. */
export function LearnMore({ feature, topic, slug, className }: Props) {
  const { t, locale } = useI18n();
  const f = feature ? FEATURE_HELP[feature] : undefined;
  const tp = topic ?? f?.landingTopic;
  const sl = slug ?? f?.landingSlug;
  if (!tp || !sl) return null;
  return (
    <a
      href={helpArticleUrl(tp, sl, locale)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1 text-fs-sm font-medium text-[var(--brand-500)] hover:underline',
        className,
      )}
    >
      {t('helpLearnMore')}
      <ExternalLink className="size-3.5" />
    </a>
  );
}
