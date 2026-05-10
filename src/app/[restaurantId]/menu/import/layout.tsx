import { DesktopOnly } from '@/components/common/DesktopOnly';

export default function MenuImportLayout({ children }: { children: React.ReactNode }) {
  return <DesktopOnly>{children}</DesktopOnly>;
}
