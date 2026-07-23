/** خيارات التوصيل الظاهرة للمورد عند القبول — نقي بدون DB */

export function deliveryOptionsForSupplier(
  profile: {
    delivers_self: boolean;
    self_delivery_regions: string[] | null;
  },
  deliveryRegion: string,
): { supplier_delivery: boolean; logistics: boolean } {
  const selfOk =
    !!profile.delivers_self &&
    (profile.self_delivery_regions ?? []).includes(deliveryRegion);
  return {
    supplier_delivery: selfOk,
    /** طلب ناقل متاح دائماً ما لم تُقيَّد المنصة لاحقاً */
    logistics: true,
  };
}
