import { Property } from '../types/property';

interface PropertyPopupProps {
  property: Property;
  onViewDetails?: (property: Property) => void;
}

const epcColors: Record<string, string> = {
  A: '#1B7A2B',
  B: '#4CAF50',
  C: '#8BC34A',
  D: '#FFD600',
  E: '#FF9800',
  F: '#FF5722',
  G: '#D32F2F',
};

export default function PropertyPopup({ property, onViewDetails }: PropertyPopupProps) {
  const epcRating = property.epc_rating?.toUpperCase() || 'Unknown';
  const epcColor = epcColors[epcRating] || '#9E9E9E';

  return (
    <div className="w-64 p-4 space-y-3">
      {/* Address */}
      <div>
        <p className="font-semibold text-sm text-gray-900">{property.address}</p>
        <p className="text-xs text-gray-600">{property.postcode}</p>
      </div>

      {/* EPC Rating Badge */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-700">EPC:</span>
        <span
          className="inline-flex items-center justify-center w-6 h-6 rounded font-bold text-white text-sm"
          style={{ backgroundColor: epcColor }}
        >
          {epcRating}
        </span>
      </div>

      {/* Property Details Grid */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        {property.property_type && (
          <div>
            <p className="text-gray-600 font-medium">Type</p>
            <p className="text-gray-900">{property.property_type}</p>
          </div>
        )}

        {property.bedrooms !== undefined && (
          <div>
            <p className="text-gray-600 font-medium">Bedrooms</p>
            <p className="text-gray-900">{property.bedrooms}</p>
          </div>
        )}

        {property.year_built && (
          <div>
            <p className="text-gray-600 font-medium">Year Built</p>
            <p className="text-gray-900">{property.year_built}</p>
          </div>
        )}

        {property.heating_type && (
          <div>
            <p className="text-gray-600 font-medium">Heating</p>
            <p className="text-gray-900">{property.heating_type}</p>
          </div>
        )}
      </div>

      {/* Stock Condition Score */}
      {property.stock_condition_score !== undefined && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-700">Condition</span>
            <span className="text-xs font-semibold text-gray-900">
              {property.stock_condition_score.toFixed(1)}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full"
              style={{
                width: `${Math.min((property.stock_condition_score / 100) * 100, 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* View Details Button */}
      {onViewDetails && (
        <button
          onClick={() => onViewDetails(property)}
          className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-3 rounded transition-colors"
        >
          View Details
        </button>
      )}
    </div>
  );
}
