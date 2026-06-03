import { useState, useEffect } from 'react';
import { useMap } from 'react-leaflet';

type ActiveLayer = 'epc' | 'flood-risk' | 'imd' | 'epc-heatmap' | null;

const epcRatings = [
  { rating: 'A', color: '#1B7A2B' },
  { rating: 'B', color: '#4CAF50' },
  { rating: 'C', color: '#8BC34A' },
  { rating: 'D', color: '#FFD600' },
  { rating: 'E', color: '#FF9800' },
  { rating: 'F', color: '#FF5722' },
  { rating: 'G', color: '#D32F2F' },
  { rating: 'Unknown', color: '#9E9E9E' },
];

const floodZones = [
  {
    zone: 'Zone 3',
    color: '#FF0000',
    opacity: 0.3,
    description: 'High probability (>3.3%)',
  },
  {
    zone: 'Zone 2',
    color: '#FFA500',
    opacity: 0.25,
    description: 'Medium probability (1-3.3%)',
  },
  {
    zone: 'Zone 1',
    color: '#FFFF00',
    opacity: 0.2,
    description: 'Low probability (<1%)',
  },
];

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

const epcHeatmapScale = {
  min: '#0000FF',
  mid: '#FFFF00',
  max: '#FF0000',
};

export default function MapLegend() {
  const map = useMap();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>('epc');

  // Listen for layer changes by checking visible layers
  useEffect(() => {
    // This is a simplified approach - in production you might use a context
    // to communicate which layer is active from LayerControl component
    const checkActiveLayers = () => {
      const layers = map.eachLayer((layer: any) => {
        // Check if layer is visible and determine its type
        // For now, we'll use the default EPC view
      });
    };

    checkActiveLayers();
  }, [map]);

  return (
    <div className="fixed bottom-6 right-6 z-40">
      {/* Collapse Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -top-12 right-0 bg-white border border-gray-300 rounded-lg p-2 hover:bg-gray-50 transition-colors shadow-md"
        title={isCollapsed ? 'Show legend' : 'Hide legend'}
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

      {/* Legend Panel */}
      {!isCollapsed && (
        <div className="bg-white rounded-lg shadow-lg p-4 border border-gray-300 max-w-xs">
          {/* EPC Ratings (Default) */}
          {activeLayer === 'epc' && (
            <>
              <h3 className="font-semibold text-sm text-gray-900 mb-3">
                EPC Ratings
              </h3>
              <div className="space-y-2">
                {epcRatings.map((item) => (
                  <div key={item.rating} className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded flex-shrink-0 border border-gray-300"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-xs text-gray-700 font-medium">
                      {item.rating}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-3 pt-3 border-t border-gray-200">
                Higher ratings = better energy efficiency
              </p>
            </>
          )}

          {/* Flood Risk Zones */}
          {activeLayer === 'flood-risk' && (
            <>
              <h3 className="font-semibold text-sm text-gray-900 mb-3">
                Flood Risk Zones
              </h3>
              <div className="space-y-2">
                {floodZones.map((zone) => (
                  <div key={zone.zone} className="flex items-start gap-3">
                    <div
                      className="w-4 h-4 rounded flex-shrink-0 border border-gray-300 mt-0.5"
                      style={{
                        backgroundColor: zone.color,
                        opacity: zone.opacity,
                      }}
                    />
                    <div>
                      <p className="text-xs text-gray-900 font-medium">
                        {zone.zone}
                      </p>
                      <p className="text-xs text-gray-600">{zone.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-3 pt-3 border-t border-gray-200">
                Data: Environment Agency (Open Government Licence v3.0)
              </p>
            </>
          )}

          {/* IMD Deprivation */}
          {activeLayer === 'imd' && (
            <>
              <h3 className="font-semibold text-sm text-gray-900 mb-3">
                IMD Deprivation (by Decile)
              </h3>
              <p className="text-xs text-gray-600 mb-2">
                1 = Most deprived | 10 = Least deprived
              </p>
              <div className="flex h-6 rounded overflow-hidden border border-gray-300 mb-2">
                {imdColorScale.map((color, i) => (
                  <div
                    key={i}
                    className="flex-1 hover:opacity-80 cursor-help"
                    style={{ backgroundColor: color, opacity: 0.8 }}
                    title={`Decile ${i + 1}`}
                  />
                ))}
              </div>
              <div className="flex justify-between text-xs text-gray-600 mb-3">
                <span>Deprived</span>
                <span>Affluent</span>
              </div>
              <p className="text-xs text-gray-600 pt-3 border-t border-gray-200">
                Data: ONS (Open Government Licence v3.0)
              </p>
            </>
          )}

          {/* EPC Heatmap */}
          {activeLayer === 'epc-heatmap' && (
            <>
              <h3 className="font-semibold text-sm text-gray-900 mb-3">
                EPC Heatmap
              </h3>
              <p className="text-xs text-gray-600 mb-2">
                Energy performance intensity by location
              </p>
              <div
                className="h-6 rounded border border-gray-300 mb-2"
                style={{
                  background: `linear-gradient(to right, ${epcHeatmapScale.min}, ${epcHeatmapScale.mid}, ${epcHeatmapScale.max})`,
                }}
              />
              <div className="flex justify-between text-xs text-gray-600 mb-3">
                <span>Poor</span>
                <span>Good</span>
              </div>
              <p className="text-xs text-gray-600 pt-3 border-t border-gray-200">
                Data: EPC (Department for Energy Security & Net Zero)
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
