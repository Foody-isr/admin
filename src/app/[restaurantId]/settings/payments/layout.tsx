import { DesktopOnly } from '@/components/common/DesktopOnly';

export default function SettingsPaymentsLayout({ children }: { children: React.ReactNode }) {
  return <DesktopOnly>{children}</DesktopOnly>;
}
