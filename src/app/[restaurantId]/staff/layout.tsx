import { DesktopOnly } from '@/components/common/DesktopOnly';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <DesktopOnly>{children}</DesktopOnly>;
}
