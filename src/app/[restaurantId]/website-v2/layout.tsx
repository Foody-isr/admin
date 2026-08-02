import { DesktopOnly } from '@/components/common/DesktopOnly';

// Website Builder v2 — fixed-viewport app shell (same invariant as the legacy
// builder's layout: the document can never exceed the viewport, so the top bar
// stays pinned and only the center preview scrolls internally).
export default function WebsiteV2Layout({ children }: { children: React.ReactNode }) {
  return (
    <DesktopOnly>
      <div className="fixed inset-0 overflow-hidden bg-neutral-50">{children}</div>
    </DesktopOnly>
  );
}
