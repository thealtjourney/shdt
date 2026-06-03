import { useState, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

type LayerType = 'flood-risk' | 'imd' | 'epc-heatmap' | null;

interface LayerColorInfo {
  name: string;
  color: string;
  opacity: number;
  description: string;
}

interface FloodZone {
  name: string;
  color: string;
  opacity: number;
  description: string;
}

interface IMDDecile {
  decile: number;
  color: string;
}

export default function LayerControl() {
  const map = useMap();
  const [activeLayer, setActiveLayer] = useState<LayerType>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);

  // WMS layer reference for flood risk
  const [floodRiskLayer, setFloodRiskLayer] = useState<L.TileLayer.WMS | null>(
    null
  );

  // GeoJSON layer references
  const [imdLayer, setImdLayer] = useState<L.GeoJSON | null>(null);
  const [epcLayer, setEpcLayer] = useState<L.GeoJSON | null>(null);

  // Layer color information for UI display
  const [floodZones, setFloodZones] = useState<FloodZone[]>([]);
  const [imdColors, setImdColors] = useState<IMDDecile[]>([]);

  // Flood Risk Zones
  const floodZonePresets = [
    {
      name: 'Zone 3',
      color: '#FF0000',
      opacity: 0.3,
      description: 'High probability (>3.3%)',
    },
    {
      name: 'Zone 2',
      color: '#FFA500',
      opacity: 0.25,
      description: 'Medium probability (1-3.3%)',
    },
    {
      name: 'Zone 1',
      color: '#FFFF00',
      opacity: 0.2,
      description: 'Low probability (<1%)',
    },
  ];

  // IMD Decile colors (red to green)
  const imdColorScale = [
    '#67001f', // Decile 1 (most deprived)
    '#b2182b',
    '#d6604d',
    '#f4a582',
    '#fddfc7',
    '#d1e5f0',
    '#92c5de',
    '#4393c3',
    '#2166ac',
    '#053061', // Decile 10 (least deprived)
  ];

  // EPC Score colors (blue to red via yellow)
  const epcColorScale = {
    min: '#0000FF', // Blue (poor)
    mid: '#FFFF00', // Yellow
    max: '#FF0000', // Red (good)
  };

  // Get current bbox from map
  const getBBox = () => {
    const bounds = map.getBounds();
    return {
      min_lat: bounds.getSouth(),
      min_lng: bounds.getWest(),
      max_lat: bounds.getNorth(),
      max_lng: bounds.getEast(),
    };
  };

  // Toggle layer on/off
  const toggleLayer = async (layer: LayerType) => {
    try {
      setError(null);
      setLoading(true);

      if (activeLayer === layer) {
        // Remove layer if clicking same button
        removeAllLayers();
        setActiveLayer(null);
        return;
      }

      // Remove previous layer
      removeAllLayers();

      const bbox = getBBox();

      switch (layer) {
        case 'flood-risk':
          await loadFloodRiskLayer(bbox);
          break;
        case 'imd':
          await loadIMDLayer(bbox);
          break;
        case 'epc-heatmap':
          await loadEPCHeatmap(bbox);
          break;
      }

      setActiveLayer(layer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load layer');
      setActiveLayer(null);
    } finally {
      setLoading(false);
    }
  };

  // Load flood risk WMS layer
  const loadFloodRiskLayer = async (bbox: {
    min_lat: number;
    min_lng: number;
    max_lat: number;
    max_lng: number;
  }) => {
    const response = await fetch(
      `/api/layers/flood-risk?min_lat=${bbox.min_lat}&min_lng=${bbox.min_lng}&max_lat=${bbox.max_lat}&max_lng=${bbox.max_lng}`
    );
    if (!response.ok) throw new Error('Failed to load flood risk data');

    const data = await response.json();

    // Create WMS layer
    const wmsLayer = L.tileLayer.wms(data.url, {
      layers: data.layers,
      styles: '',
      format: 'image/png',
      transparent: true,
      attribution: `&copy; ${data.attribution}`,
    });

    wmsLayer.addTo(map);
    setFloodRiskLayer(wmsLayer);
    setFloodZones(data.zones || floodZonePresets);
  };

  // Load IMD GeoJSON layer
  const loadIMDLayer = async (bbox: {
    min_lat: number;
    min_lng: number;
    max_lat: number;
    max_lng: number;
  }) => {
    const response = await fetch(
      `/api/layers/imd?min_lat=${bbox.min_lat}&min_lng=${bbox.min_lng}&max_lat=${bbox.max_lat}&max_lng=${bbox.max_lng}`
    );
    if (!response.ok) throw new Error('Failed to load IMD data');

    const data = await response.json();

    // Style function for IMD deciles
    const styleFunction = (feature: any) => {
      const decile = feature.properties?.imd_decile || 5;
      const colorIndex = Math.max(0, Math.min(9, decile - 1));
      return {
        fillColor: imdColorScale[colorIndex],
        weight: 1,
        opacity: 1,
        color: '#666',
        dashArray: '3',
        fillOpacity: 0.2,
      };
    };

    // Create popup function
    const onEachFeature = (feature: any, layer: L.Layer) => {
      if (feature.properties) {
        const props = feature.properties;
        const popupContent = `
          <div class="p-2 text-sm">
            <p><strong>${props.lsoa_name}</strong></p>
            <p>Code: ${props.lsoa_code}</p>
            <p>IMD Decile: <strong>${props.imd_decile}</strong></p>
            <p>IMD Score: ${props.imd_score}</p>
            <p class="text-xs text-gray-600 mt-1">
              ${props.imd_decile <= 3 ? 'Most deprived' : props.imd_decile >= 8 ? 'Least deprived' : 'Moderate deprivation'}
            </p>
          </div>
        `;
        layer.bindPopup(popupContent);
      }
    };

    const geoJsonLayer = L.geoJSON(data, {
      style: styleFunction,
      onEachFeature: onEachFeature,
    });

    geoJsonLayer.addTo(map);
    setImdLayer(geoJsonLayer);

    // Set IMD colors for legend
    const deciles = imdColorScale.map((color, i) => ({
      decile: i + 1,
      color,
    }));
    setImdColors(deciles);
  };

  // Load EPC heatmap using Leaflet.heat if available
  const loadEPCHeatmap = async (bbox: {
    min_lat: number;
    min_lng: number;
    max_lat: number;
    max_lng: number;
  }) => {
    const response = await fetch(
      `/api/layers/epc-heatmap?min_lat=${bbox.min_lat}&min_lng=${bbox.min_lng}&max_lat=${bbox.max_lat}&max_lng=${bbox.max_lng}&resolution=15`
    );
    if (!response.ok) throw new Error('Failed to load EPC heatmap data');

    const data = await response.json();

    // For now, render as circles with intensity-based sizing and color
    // In production, would use Leaflet.heat for true heatmap
    const geoJsonLayer = L.geoJSON(data, {
      pointToLayer: (feature, latlng) => {
        const intensity = feature.properties?.intensity || 0.5;
        const score = feature.properties?.epc_score || 50;

        // Color scale: blue (low) -> yellow (mid) -> red (high)
        let color;
        if (intensity < 0.33) {
          // Blue to Yellow
          const t = intensity / 0.33;
          color = `rgb(0, 0, ${Math.floor(255 * (1 - t))})`; // Fade blue
        } else if (intensity < 0.67) {
          // Yellow to Red
          const t = (intensity - 0.33) / 0.34;
          color = `rgb(${Math.floor(255 * t)}, 255, 0)`; // Fade to red
        } else {
          // Red
          color = 'rgb(255, 0, 0)';
        }

        const radius = 4 + intensity * 6;

        const circle = L.circleMarker(latlng, {
          radius,
          fillColor: color,
          color: color,
          weight: 1,
          opacity: 0.7,
          fillOpacity: 0.6,
        });

        circle.bindPopup(
          `<div class="text-xs"><p>EPC Score: <strong>${score.toFixed(1)}</strong></p><p>Count: ${feature.properties?.count || 'N/A'}</p></div>`
        );

        return circle;
      },
    });

    geoJsonLayer.addTo(map);
    setEpcLayer(geoJsonLayer);
  };

  // Remove all layers
  const removeAllLayers = () => {
    if (floodRiskLayer) {
      map.removeLayer(floodRiskLayer);
      setFloodRiskLayer(null);
    }
    if (imdLayer) {
      map.removeLayer(imdLayer);
      setImdLayer(null);
    }
    if (epcLayer) {
      map.removeLayer(epcLayer);
      setEpcLayer(null);
    }
  };

  // Update layer on map bounds change
  useEffect(() => {
    const updateLayerBounds = () => {
      if (activeLayer) {
        // Remove and reload layer with new bounds
        removeAllLayers();
        const bbox = getBBox();

        switch (activeLayer) {
          case 'flood-risk':
            loadFloodRiskLayer(bbox);
            break;
          case 'imd':
            loadIMDLayer(bbox);
            break;
          case 'epc-heatmap':
            loadEPCHeatmap(bbox);
            break;
        }
      }
    };

    // Debounce to avoid excessive updates
    let timeoutId: NodeJS.Timeout;
    const handleMapMove = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(updateLayerBounds, 500);
    };

    map.on('moveend', handleMapMove);

    return () => {
      map.off('moveend', handleMapMove);
      clearTimeout(timeoutId);
    };
  }, [activeLayer, map]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      removeAllLayers();
    };
  }, []);

  return (
    <div className="fixed top-24 right-6 z-40">
      {/* Collapse Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -top-12 right-0 bg-white border border-gray-300 rounded-lg p-2 hover:bg-gray-50 transition-colors shadow-md"
        title={isCollapsed ? 'Show layers' : 'Hide layers'}
      >
        <svg
          className={`w-5 h-5 text-gray-700 transition-transform ${
            isCollapsed ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Layer Control Panel */}
      {!isCollapsed && (
        <div className="bg-white rounded-lg shadow-lg p-4 border border-gray-300 w-80 max-h-96 overflow-y-auto">
          <h3 className="font-semibold text-sm text-gray-900 mb-4">
            Open Data Layers
          </h3>

          {error && (
            <div className="mb-3 p-2 bg-red-50 border border-red-300 rounded text-xs text-red-700">
              {error}
            </div>
          )}

          {loading && (
            <div className="mb-3 p-2 bg-blue-50 border border-blue-300 rounded text-xs text-blue-700 flex items-center gap-2">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600" />
              Loading layer...
            </div>
          )}

          {/* Flood Risk Layer */}
          <div className="mb-4">
            <button
              onClick={() => toggleLayer('flood-risk')}
              disabled={loading}
              className={`w-full text-left p-3 rounded border-2 transition-all ${
                activeLayer === 'flood-risk'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-gray-50 hover:border-gray-300'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium text-sm text-gray-900">
                    Flood Risk Zones
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Environment Agency flood zones
                  </p>
                </div>
                <div className="ml-2">
                  {activeLayer === 'flood-risk' && (
                    <svg
                      className="w-5 h-5 text-blue-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
              </div>

              {/* Flood zone color swatches */}
              {activeLayer === 'flood-risk' && (
                <div className="mt-3 space-y-2">
                  {floodZonePresets.map((zone) => (
                    <div key={zone.name} className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded border border-gray-300"
                        style={{
                          backgroundColor: zone.color,
                          opacity: zone.opacity,
                        }}
                      />
                      <span className="text-xs text-gray-700">
                        {zone.name}: {zone.description}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </button>
          </div>

          {/* IMD Deprivation Layer */}
          <div className="mb-4">
            <button
              onClick={() => toggleLayer('imd')}
              disabled={loading}
              className={`w-full text-left p-3 rounded border-2 transition-all ${
                activeLayer === 'imd'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-gray-50 hover:border-gray-300'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium text-sm text-gray-900">
                    IMD Deprivation
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Index of Multiple Deprivation (ONS)
                  </p>
                </div>
                <div className="ml-2">
                  {activeLayer === 'imd' && (
                    <svg
                      className="w-5 h-5 text-blue-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
              </div>

              {/* IMD color gradient */}
              {activeLayer === 'imd' && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-700 mb-2">
                    Deciles (1=Most deprived, 10=Least deprived):
                  </p>
                  <div className="flex h-4 rounded overflow-hidden border border-gray-300">
                    {imdColorScale.map((color, i) => (
                      <div
                        key={i}
                        className="flex-1"
                        style={{ backgroundColor: color, opacity: 0.7 }}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>More deprived</span>
                    <span>Less deprived</span>
                  </div>
                </div>
              )}
            </button>
          </div>

          {/* EPC Heatmap Layer */}
          <div className="mb-4">
            <button
              onClick={() => toggleLayer('epc-heatmap')}
              disabled={loading}
              className={`w-full text-left p-3 rounded border-2 transition-all ${
                activeLayer === 'epc-heatmap'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-gray-50 hover:border-gray-300'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium text-sm text-gray-900">
                    EPC Heatmap
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Energy performance intensity
                  </p>
                </div>
                <div className="ml-2">
                  {activeLayer === 'epc-heatmap' && (
                    <svg
                      className="w-5 h-5 text-blue-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
              </div>

              {/* EPC color scale */}
              {activeLayer === 'epc-heatmap' && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-700 mb-2">
                    Energy Performance Scale:
                  </p>
                  <div
                    className="h-4 rounded border border-gray-300"
                    style={{
                      background: `linear-gradient(to right, ${epcColorScale.min}, ${epcColorScale.mid}, ${epcColorScale.max})`,
                    }}
                  />
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>Poor (1)</span>
                    <span>Good (100)</span>
                  </div>
                </div>
              )}
            </button>
          </div>

          {/* Attribution */}
          <div className="text-xs text-gray-600 border-t border-gray-200 pt-3 mt-3">
            <p className="font-medium text-gray-700 mb-1">Data Sources:</p>
            <ul className="space-y-1">
              <li>
                Flood Risk: Contains public sector information licensed under
                the Open Government Licence v3.0
              </li>
              <li>
                IMD: Contains public sector information licensed under the Open
                Government Licence v3.0
              </li>
              <li>EPC: Department for Energy Security & Net Zero</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
