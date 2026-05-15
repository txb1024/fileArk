import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { base64ToText } from "./utils";

interface GeoJSONFeature {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}
interface GeoJSON {
  type: "FeatureCollection" | "Feature";
  features?: GeoJSONFeature[];
  geometry?: { type: string; coordinates: unknown };
  properties?: Record<string, unknown>;
}

function parseKmlToGeoJson(kml: string): GeoJSON {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kml, "text/xml");
  const placemarks = doc.getElementsByTagName("Placemark");
  const features: GeoJSONFeature[] = [];

  const parseCoords = (text: string): number[][] => {
    return text
      .trim()
      .split(/\s+/)
      .map((tup) => tup.split(",").map(parseFloat))
      .filter((arr) => arr.length >= 2 && !isNaN(arr[0]) && !isNaN(arr[1]))
      .map((arr) => [arr[0], arr[1]]);
  };

  for (let i = 0; i < placemarks.length; i++) {
    const pm = placemarks[i];
    const name = pm.getElementsByTagName("name")[0]?.textContent || "";
    const desc = pm.getElementsByTagName("description")[0]?.textContent || "";
    const props: Record<string, unknown> = { name, description: desc };

    const point = pm.getElementsByTagName("Point")[0];
    if (point) {
      const cs = point.getElementsByTagName("coordinates")[0]?.textContent || "";
      const coords = parseCoords(cs);
      if (coords.length > 0) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: coords[0] },
          properties: props,
        });
      }
      continue;
    }
    const ls = pm.getElementsByTagName("LineString")[0];
    if (ls) {
      const cs = ls.getElementsByTagName("coordinates")[0]?.textContent || "";
      const coords = parseCoords(cs);
      if (coords.length > 0) {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: props,
        });
      }
      continue;
    }
    const poly = pm.getElementsByTagName("Polygon")[0];
    if (poly) {
      const outer = poly.getElementsByTagName("outerBoundaryIs")[0];
      const cs = outer?.getElementsByTagName("coordinates")[0]?.textContent || "";
      const coords = parseCoords(cs);
      if (coords.length > 0) {
        features.push({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [coords] },
          properties: props,
        });
      }
    }
  }

  return { type: "FeatureCollection", features };
}

export function GeoPreview({ base64, ext }: { base64: string; ext: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const data = useMemo(() => {
    try {
      const text = base64ToText(base64);
      if (ext === "kml") return parseKmlToGeoJson(text);
      return JSON.parse(text) as GeoJSON;
    } catch (e) {
      setError(String(e));
      return null;
    }
  }, [base64, ext]);

  useEffect(() => {
    if (!data || !containerRef.current) return;
    let map: { remove: () => void } | null = null;

    import("leaflet")
      .then(({ default: L }) => {
        if (!containerRef.current) return;
        const mapInstance = L.map(containerRef.current).setView([0, 0], 2);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap",
          maxZoom: 19,
        }).addTo(mapInstance);

        const layer = L.geoJSON(data as never, {
          onEachFeature: ((feature: GeoJSONFeature, lyr: { bindPopup: (s: string) => void }) => {
            const props = feature.properties || {};
            const name = String(props.name || props.NAME || "");
            const desc = String(props.description || "");
            const html = [name && `<b>${name}</b>`, desc].filter(Boolean).join("<br/>");
            if (html) lyr.bindPopup(html);
          }) as never,
        }).addTo(mapInstance);

        try {
          const bounds = layer.getBounds();
          if (bounds.isValid()) mapInstance.fitBounds(bounds, { padding: [20, 20] });
        } catch {
          // 空图层
        }
        map = mapInstance;
      })
      .catch((e) => setError(String(e)));

    return () => {
      if (map) map.remove();
    };
  }, [data]);

  if (error) {
    return (
      <div className="preview-error">
        <p>地理数据加载失败</p>
        <small>{error}</small>
      </div>
    );
  }

  const featureCount = data?.features?.length ?? (data ? 1 : 0);

  return (
    <div className="preview-geo-container">
      <div className="geo-toolbar">
        <span className="geo-meta">{featureCount} 个要素</span>
      </div>
      <div ref={containerRef} className="geo-map" />
    </div>
  );
}
