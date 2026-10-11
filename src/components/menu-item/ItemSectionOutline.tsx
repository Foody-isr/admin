'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';

interface SectionLink {
  id: string;
  title: string;
}

/** Shows section shortcuts only once the distribution cards have scrolled away. */
export default function ItemSectionOutline({
  scrollRoot,
  cards,
}: {
  scrollRoot: HTMLDivElement | null;
  cards: HTMLDivElement | null;
}) {
  const { t } = useI18n();
  const [sections, setSections] = useState<SectionLink[]>([]);
  const [active, setActive] = useState('');
  const [visible, setVisible] = useState(false);
  const links = useRef<HTMLElement[]>([]);

  useEffect(() => {
    if (!scrollRoot || !cards) return;
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => {
      const top = scrollRoot.getBoundingClientRect().top;
      setVisible(media.matches && cards.getBoundingClientRect().bottom <= top);
      const available = links.current;
      let current: HTMLElement | undefined = available[0];
      for (const section of available) {
        if (section.getBoundingClientRect().top <= top + 64) current = section;
      }
      if (
        scrollRoot.scrollTop + scrollRoot.clientHeight >=
        scrollRoot.scrollHeight - 2
      )
        current = available.at(-1);
      setActive(current?.id ?? '');
    };
    const collect = () => {
      links.current = Array.from(
        scrollRoot.querySelectorAll<HTMLElement>(
          '[data-item-section]:not([hidden])',
        ),
      );
      const next = links.current.map((section) => ({
        id: section.id,
        title: section.querySelector('h2')?.textContent ?? '',
      }));
      setSections((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
      update();
    };
    const mutation = new MutationObserver(collect);
    // Section visibility changes with article type. Text changes also cover locale switches.
    mutation.observe(scrollRoot.querySelector('main')!, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden'],
      characterData: true,
    });
    const resize = new ResizeObserver(update);
    resize.observe(cards);
    resize.observe(scrollRoot);
    if (scrollRoot.firstElementChild)
      resize.observe(scrollRoot.firstElementChild);
    scrollRoot.addEventListener('scroll', update, { passive: true });
    media.addEventListener('change', update);
    collect();
    return () => {
      mutation.disconnect();
      resize.disconnect();
      scrollRoot.removeEventListener('scroll', update);
      media.removeEventListener('change', update);
    };
  }, [scrollRoot, cards]);

  const jump = (id: string) => {
    const section = links.current.find((value) => value.id === id);
    if (!scrollRoot || !section) return;
    scrollRoot.scrollTo({
      top:
        scrollRoot.scrollTop +
        section.getBoundingClientRect().top -
        scrollRoot.getBoundingClientRect().top -
        24,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
    section.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  };
  return (
    <nav
      className="item-section-outline"
      aria-label={t('itemOutlineTitle')}
      hidden={!visible}
    >
      <p>{t('itemOutlineTitle')}</p>
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          aria-current={active === section.id ? 'location' : undefined}
          onClick={() => jump(section.id)}
        >
          {section.title}
        </button>
      ))}
    </nav>
  );
}
