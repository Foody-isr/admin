import { WebsiteV3Builder } from "@/components/website-v3/WebsiteV3Builder";

export default function WebsiteV3Page({
  params,
}: {
  params: { restaurantId: string };
}) {
  return <WebsiteV3Builder restaurantId={Number(params.restaurantId)} />;
}
