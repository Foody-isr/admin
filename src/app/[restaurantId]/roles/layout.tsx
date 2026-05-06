import { DesktopOnly } from '@/components/common/DesktopOnly';

export default function RolesLayout({ children }: { children: React.ReactNode }) {
  return <DesktopOnly>{children}</DesktopOnly>;
}
