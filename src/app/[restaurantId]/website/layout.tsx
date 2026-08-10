import { DesktopOnly } from '@/components/common/DesktopOnly';

export default function WebsiteLayout({ children }: { children: React.ReactNode }) {
  // The website builder is a fixed-viewport app shell: a pinned top bar (device
  // toggle, publish) with only the center preview scrolling internally. The page
  // uses `h-screen`, but its ancestors (`min-h-screen` fullscreen wrapper) can
  // still grow, so any descendant that extends past 100vh (an absolutely
  // positioned layer, sub-pixel/zoom rounding, a future tall section) makes the
  // BODY scrollable — which scrolls the pinned top bar out of view and pushes the
  // preview's bottom below an unreachable fold. Anchoring the shell to the
  // viewport with a fixed, clipped container enforces the invariant: the document
  // can never exceed the viewport, so the top bar stays put and the only scroll
  // is the intended internal one. Fixed descendants (selection overlay, modals)
  // still resolve against the viewport, so they are unaffected.
  return (
    <DesktopOnly>
      <div className="fixed inset-0 overflow-hidden">{children}</div>
    </DesktopOnly>
  );
}
