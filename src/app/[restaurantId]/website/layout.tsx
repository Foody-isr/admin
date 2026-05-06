import { DesktopOnly } from '@/components/common/DesktopOnly';

export default function WebsiteLayout({ children }: { children: React.ReactNode }) {
  return <DesktopOnly>{children}</DesktopOnly>;
}
