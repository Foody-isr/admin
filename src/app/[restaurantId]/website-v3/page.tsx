import { WebsiteV3Builder } from "@/components/website-v3/WebsiteV3Builder";

export default async function WebsiteV3Page({
  params,
}: {
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;
  return <WebsiteV3Builder restaurantId={Number(restaurantId)} />;
}
