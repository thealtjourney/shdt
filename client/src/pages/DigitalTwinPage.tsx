import { useState, useEffect, Suspense, lazy } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const PropertyViewer3D = lazy(() => import('../components/PropertyViewer3D'));

export default function DigitalTwinPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const propertyId = searchParams.get('id');
  const [property, setProperty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) {
      setError('No property ID provided');
      setLoading(false);
      return;
    }

    const fetchProperty = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/properties/${propertyId}`);
        if (!res.ok) throw new Error(`Failed to load property (${res.status})`);
        const json = await res.json();
        // Flatten GeoJSON Feature into a flat object
        const flat = {
          id: json.id,
          latitude: json.geometry?.coordinates?.[1],
          longitude: json.geometry?.coordinates?.[0],
          ...json.properties,
        };
        setProperty(flat);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load property');
      } finally {
        setLoading(false);
      }
    };

    fetchProperty();
  }, [propertyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white" />
          <p className="text-white text-sm">Loading Digital Twin...</p>
        </div>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100">
        <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md">
          <p className="text-lg font-semibold text-gray-900 mb-2">Unable to load Digital Twin</p>
          <p className="text-sm text-gray-600 mb-4">{error || 'Property not found'}</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Map
          </button>
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full bg-gray-900">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white" />
            <p className="text-white text-sm">Loading 3D viewer...</p>
          </div>
        </div>
      }
    >
      <PropertyViewer3D
        property={property}
        onClose={() => navigate('/')}
      />
    </Suspense>
  );
}
