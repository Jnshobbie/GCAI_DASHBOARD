import React, { useEffect, useMemo, useRef, useState } from "react";

export default function MiniMap({ items }) {
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [LeafletComponents, setLeafletComponents] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // inject leaflet css from CDN (remove integrity to avoid blocking)
    const linkId = 'leaflet-css-cdn';
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    // dynamic import of react-leaflet
    (async () => {
      try {
        const rl = await import('react-leaflet');
        const L = await import('leaflet');
        if (!mountedRef.current) return;
        setLeafletComponents({ rl, L });
        setLeafletLoaded(true);
      } catch (err) {
        setLeafletLoaded(false);
        setLeafletComponents(null);
      }
    })();

    return () => { mountedRef.current = false; };
  }, []);

  const regionCounts = useMemo(() => {
    return items.reduce((acc, t) => {
      const name = (t.locationName || t.region || t.location || 'Unknown').toString();
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});
  }, [items]);

  const hotspots = Object.entries(regionCounts).map(([name, count]) => ({ name, count }));

  // fallback SVG map
  function SVGFallback() {
    const gazetteer = {
      US: [38.0, -97.0],
      'United States': [38.0, -97.0],
      UK: [55.3781, -3.4360],
      China: [35.8617, 104.1954],
      India: [20.5937, 78.9629],
      'Middle East': [29.0, 45.0],
      Ukraine: [48.3794, 31.1656],
      Gaza: [31.5, 34.47],
      Israel: [31.5, 34.75],
      Pakistan: [30.3753, 69.3451],
      Russia: [61.5240, 105.3188],
    };

    function lookupCoord(name) {
      if (!name) return null;
      if (gazetteer[name]) return gazetteer[name];
      const lower = name.toLowerCase();
      for (const k of Object.keys(gazetteer)) {
        if (k.toLowerCase() === lower || lower.includes(k.toLowerCase())) return gazetteer[k];
      }
      return null;
    }

    function project(lat, lon, width, height) {
      const x = ((lon + 180) / 360) * width;
      const y = ((90 - lat) / 180) * height;
      return [x, y];
    }

    function colorFor(count) {
      if (count >= 5) return '#ef4444';
      if (count >= 3) return '#f97316';
      if (count === 2) return '#f59e0b';
      if (count === 1) return '#10b981';
      return '#94a3b8';
    }

    const width = 520;
    const height = 240;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" className="rounded">
        <rect x="0" y="0" width={width} height={height} fill="#0f172a" />
        {[-120, -60, 0, 60, 120].map((lon, i) => (
          <line
            key={`g-${i}`}
            x1={project(90, lon, width, height)[0]}
            y1={0}
            x2={project(-90, lon, width, height)[0]}
            y2={height}
            stroke="#1f2937"
            strokeWidth={0.5}
          />
        ))}
        {hotspots.map((h) => {
          const coord = lookupCoord(h.name);
          if (!coord) return null;
          const [lat, lon] = coord;
          const [x, y] = project(lat, lon, width, height);
          const r = Math.min(24, 4 + h.count * 4);
          return (
            <g key={h.name} transform={`translate(${x},${y})`}>
              <circle r={r} fill={colorFor(h.count)} opacity={0.9} stroke="#000" strokeWidth={0.5} />
              <text x={r + 6} y={4} fill="#e6eef8" fontSize={11}>
                {h.name} ({h.count})
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  // Leaflet map render
  if (leafletLoaded && LeafletComponents) {
    try {
      const { MapContainer, TileLayer, CircleMarker, Popup } = LeafletComponents.rl;
      const L = LeafletComponents.L;

      const markers = hotspots
        .map((h) => {
          const it = items.find((i) => (i.locationName || i.region || i.location || '').toString() === h.name);
          const latlon = it?.lat && it?.lon ? [it.lat, it.lon] : it?.latitude && it?.longitude ? [it.latitude, it.longitude] : null;

          const fallbackGazetteer = {
            US: [38.0, -97.0],
            'United States': [38.0, -97.0],
            UK: [55.3781, -3.4360],
            China: [35.8617, 104.1954],
            India: [20.5937, 78.9629],
            'Middle East': [29.0, 45.0],
            Ukraine: [48.3794, 31.1656],
            Gaza: [31.5, 34.47],
            Israel: [31.5, 34.75],
            Russia: [61.5240, 105.3188],
          };
          return { ...h, coords: latlon || fallbackGazetteer[h.name] };
        })
        .filter((m) => m.coords);

      const center = markers.length ? markers[0].coords : [20, 0];

      return (
        <div className="bg-gray-800 rounded-lg p-4 w-full" style={{ height: 240 }}>
          <h3 className="text-lg font-semibold mb-3">Hotspots Map</h3>
          <MapContainer center={center} zoom={2} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {markers.map((m, idx) => (
              <CircleMarker
                key={m.name + idx}
                center={m.coords}
                radius={6 + Math.min(20, m.count * 3)}
                pathOptions={{ color: '#000', fillColor: '#ef4444', fillOpacity: 0.8 }}
              >
                <Popup>
                  <div className="text-sm">
                    <strong>{m.name}</strong>
                    <br />
                    Count: {m.count}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      );
    } catch (err) {
      return (
        <div className="bg-gray-800 rounded-lg p-4 w-full" style={{ height: 240 }}>
          <h3 className="text-lg font-semibold mb-3">Hotspots Map</h3>
          {SVGFallback()}
        </div>
      );
    }
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 w-full" style={{ height: 240 }}>
      <h3 className="text-lg font-semibold mb-3">Hotspots Map</h3>
      {hotspots.length === 0 ? (
        <div className="h-full flex items-center justify-center text-gray-400">
          No hotspots for current filters
        </div>
      ) : (
        SVGFallback()
      )}
    </div>
  );
}


