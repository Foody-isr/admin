import { DesktopOnly } from '@/components/common/DesktopOnly';

export default function DailyOperationsLayout({ children }: { children: React.ReactNode }) {
  return <DesktopOnly>{children}</DesktopOnly>;
}
