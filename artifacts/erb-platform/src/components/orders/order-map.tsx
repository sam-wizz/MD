/// <reference types="google.maps" />
import { useEffect, useMemo } from "react";
import { APIProvider, Map as GMap, Marker, useMap } from "@vis.gl/react-google-maps";
import { findRegion, statusMeta } from "@/lib/orders";
import { MapPin, Truck, Store } from "lucide-react";

type Props = {
  supplierRegion?: string | null; // منطقة المورد (نقطة الانطلاق)
  deliveryRegion: string;         // منطقة المنشأة (الوجهة)
  status: string;
};

/** يرسم خط السير بين المورد والمنشأة على خريطة جوجل. */
function RouteLine({ from, to }: { from: google.maps.LatLngLiteral; to: google.maps.LatLngLiteral }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const line = new google.maps.Polyline({
      path: [from, to],
      geodesic: true,
      strokeColor: "#2563eb",
      strokeOpacity: 0.9,
      strokeWeight: 3,
      icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.4, scale: 3 }, offset: "0", repeat: "18px" }],
    });
    line.setMap(map);
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(from);
    bounds.extend(to);
    map.fitBounds(bounds, 60);
    return () => line.setMap(null);
  }, [map, from.lat, from.lng, to.lat, to.lng]);
  return null;
}

export function OrderMap({ supplierRegion, deliveryRegion, status }: Props) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const meta = statusMeta(status);

  const origin = findRegion(supplierRegion);
  const dest = findRegion(deliveryRegion);
  const sameSpot = origin.name === dest.name;

  // موقع الشحنة التقريبي على الخط حسب حالة الطلب
  const truckPos = useMemo(() => {
    const f = meta.progress;
    return {
      lat: origin.lat + (dest.lat - origin.lat) * f,
      lng: origin.lng + (dest.lng - origin.lng) * f,
    };
  }, [origin.lat, origin.lng, dest.lat, dest.lng, meta.progress]);

  const showTruck = ["assigned", "preparing", "in_transit", "delivered"].includes(status);

  if (!apiKey) {
    // لا يوجد مفتاح خرائط بعد — عرض بديل أنيق بنفس المعلومات
    return (
      <div className="rounded-sm border border-slate-200 bg-slate-50 p-6" data-testid="map-fallback">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <Truck className="h-4 w-4 text-blue-600" />
            {supplierRegion ? `من ${origin.name}` : "بانتظار تحديد المورد"}
          </div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <Store className="h-4 w-4 text-emerald-600" />
            إلى {dest.name}
          </div>
        </div>
        <div className="relative h-2 rounded-full bg-slate-200 overflow-hidden">
          <div
            className="absolute inset-y-0 right-0 bg-blue-600 rounded-full transition-all"
            style={{ width: `${Math.round(meta.progress * 100)}%` }}
          />
        </div>
        <p className="text-xs text-slate-400 mt-4 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          الخريطة التفاعلية ستظهر هنا فور إضافة مفتاح خرائط Google
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-sm overflow-hidden border border-slate-200 h-72" data-testid="map-order">
      <APIProvider apiKey={apiKey}>
        <GMap
          defaultCenter={{ lat: (origin.lat + dest.lat) / 2, lng: (origin.lng + dest.lng) / 2 }}
          defaultZoom={sameSpot ? 10 : 6}
          gestureHandling="cooperative"
          disableDefaultUI={false}
          style={{ width: "100%", height: "100%" }}
        >
          {supplierRegion && !sameSpot && (
            <Marker position={{ lat: origin.lat, lng: origin.lng }} title={`المورد — ${origin.name}`} label="م" />
          )}
          <Marker position={{ lat: dest.lat, lng: dest.lng }} title={`التسليم — ${dest.name}`} />
          {showTruck && !sameSpot && supplierRegion && (
            <Marker
              position={truckPos}
              title="موقع الشحنة التقريبي"
              icon={{
                path: "M -8,-4 8,-4 8,4 -8,4 z",
                fillColor: "#2563eb",
                fillOpacity: 1,
                strokeColor: "#1e40af",
                strokeWeight: 1,
                scale: 1.2,
              }}
            />
          )}
          {supplierRegion && !sameSpot && (
            <RouteLine from={{ lat: origin.lat, lng: origin.lng }} to={{ lat: dest.lat, lng: dest.lng }} />
          )}
        </GMap>
      </APIProvider>
    </div>
  );
}
