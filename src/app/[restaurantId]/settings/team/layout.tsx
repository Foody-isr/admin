import { DesktopOnly } from '@/components/common/DesktopOnly';

export default function SettingsTeamLayout({ children }: { children: React.ReactNode }) {
  return <DesktopOnly>{children}</DesktopOnly>;
}
