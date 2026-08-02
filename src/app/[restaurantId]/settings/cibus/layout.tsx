import { DesktopOnly } from '@/components/common/DesktopOnly';

export default function SettingsCibusLayout({ children }: { children: React.ReactNode }) {
  return <DesktopOnly>{children}</DesktopOnly>;
}
