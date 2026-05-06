import { DesktopOnly } from '@/components/common/DesktopOnly';

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return <DesktopOnly>{children}</DesktopOnly>;
}
