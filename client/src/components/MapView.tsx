import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { LatLngBounds, LatLng } from 'leaflet';
import { useFilters } from '../context/FilterContext';
import { useProperties } from '../hooks/useProperties';
import { Property } from '../types/property';
import PropertyPopup from './PropertyPopup';
import PropertyDetailPanel from './PropertyDetailPanel';
import MapControls from './MapControls';
import MapLegend from './MapLegend';
import LayerControl from './LayerControl';
import 'leaflet/dist/leaflet.css';

const epcColors: Record<string, string> = {
  A: '#1B7A2B',
  B: '#4CAF50',
  C: '#8BC34A',
  D: '#FFD600',
  E: '#FF9800',
  F: '#FF5722',
  G: '#D32F2F',
};

interface MapCluster {
  count: number;
  latitude: number;
  longitude: number;
  properties?: Property[];
}

function MapContent() {
  const map = useMap();
  const { filters } = useFilters();
  const [bounds, setBounds] = useState<LatLngBounds | null>(null);
  const [zoom, setZoom] = useState(6);
  const [clusters, setClusters] = useState<MapCluster[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);

  const { data, loading, error } = useProperties({
    bounds,
    zoom,
    filters,
  });

  // Update bounds and zoom on map interaction
  useEffect(() => {
    const handleMapMove = () => {
      setBounds(map.getBounds());
      setZoom(map.getZoom());
    };

    map.on('move', handleMapMove);
    map.on('zoom', handleMapMove);

    // Set initial bounds
    setBounds(map.getBounds());
    setZoom(map.getZoom());

    return () => {
      map.off('move', handleMapMove);
      map.off('zoom', handleMapMove);
    };
  }, [map]);

  // Extract clusters from data
  useEffect(() => {
    if (data?.clusters) {
      setClusters(data.clusters);
    } else {
      setClusters([]);
    }
  }, [data?.clusters]);

  const handleSearch = (query: string) => {
    // This would typically call a geocoding service
    // For now, we'll just zoom to a default location
    console.log('Search:', query);
    // TODO: Implement search/geocoding functionality
  };

  const handleMarkerClick = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
    setIsDetailPanelOpen(true);
  };

  const handleCloseDetailPanel = () => {
    setIsDetailPanelOpen(false);
    // Keep selectedPropertyId so data remains cached, will reset on new selection
  };

  // Render clusters or individual properties based on zoom
  const renderMarkers = () => {
    if (zoom < 14) {
      // Render clusters
      return clusters.map((cluster) => {
        const radius = Math.max(
          10,
          Math.min(40, cluster.count * 2)
        );
        return (
          <CircleMarker
            key={`cluster-${cluster.latitude}-${cluster.longitude}`}
            center={[cluster.latitude, cluster.longitude]}
            radius={radius}
            fillColor="#1B4F72"
            color="#0D2E47"
            weight={2}
            opacity={0.8}
            fillOpacity={0.7}
          >
            <Popup>
              <div className="p-2">
                <p className="font-semibold text-sm">{cluster.count} properties</p>
                <p className="text-xs text-gray-600">Zoom in for details</p>
              </div>
            </Popup>
          </CircleMarker>
        );
      });
    } else {
      // Render individual property markers
      return (data?.properties || []).map((property) => {
        const epcRating = property.epc_rating?.toUpperCase() || 'Unknown';
        const color = epcColors[epcRating] || epcColors['Unknown'];

        return (
          <CircleMarker
            key={property.id}
            center={[property.latitude, property.longitude]}
            radius={6}
            fillColor={color}
            color={color}
            weight={2}
            opacity={1}
            fillOpacity={0.8}
            eventHandlers={{
              click: () => handleMarkerClick(property.id),
            }}
          >
            <Popup>
              <PropertyPopup
                property={property}
                onViewDetails={(prop) => handleMarkerClick(prop.id)}
              />
            </Popup>
          </CircleMarker>
        );
      });
    }
  };

  return (
    <>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {renderMarkers()}

      {/* Loading Indicator */}
      {loading && (
        <div className="absolute top-4 left-96 z-20 bg-white px-4 py-2 rounded-lg shadow-md border border-gray-300">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
            <span className="text-sm text-gray-700">Loading properties...</span>
          </div>
        </div>
      )}

      {/* Error Indicator */}
      {error && (
        <div className="absolute top-4 left-96 z-20 bg-red-50 px-4 py-2 rounded-lg shadow-md border border-red-300">
          <p className="text-sm text-red-700">Error: {error}</p>
        </div>
      )}

      <MapControls onSearch={handleSearch} />
      <LayerControl />
      <MapLegend />

      {/* Property Detail Panel */}
      <PropertyDetailPanel
        propertyId={selectedPropertyId}
        isOpen={isDetailPanelOpen}
        onClose={handleCloseDetailPanel}
      />
    </>
  );
}

export default function MapView() {
  // Centre on England
  const center: [number, number] = [52.5, -1.5];
  const zoom = 6;

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className="w-full h-full"
      style={{ backgroundColor: '#f5f5f5' }}
    >
      <MapContent />
    </MapContainer>
  );
}
