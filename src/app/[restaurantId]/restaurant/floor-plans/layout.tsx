import { DesktopOnly } from '@/components/common/DesktopOnly';

export default function FloorPlansLayout({ children }: { children: React.ReactNode }) {
  return <DesktopOnly>{children}</DesktopOnly>;
}
