import { DesktopOnly } from '@/components/common/DesktopOnly';

export default function SettingsPrintersLayout({ children }: { children: React.ReactNode }) {
  return <DesktopOnly>{children}</DesktopOnly>;
}
