import { DesktopOnly } from '@/components/common/DesktopOnly';

export default function FoodCostLayout({ children }: { children: React.ReactNode }) {
  return <DesktopOnly>{children}</DesktopOnly>;
}
