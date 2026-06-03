import { useState } from 'react';
import { useFilters } from '../context/FilterContext';

const EPC_RATINGS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const PROPERTY_TYPES = [
  'Detached',
  'Semi-detached',
  'Terraced',
  'Flat',
  'Bungalow',
  'Other',
];
const HEATING_TYPES = ['Gas', 'Electric', 'Oil', 'Solid Fuel', 'Heat Pump', 'Other'];

interface MapControlsProps {
  onSearch?: (query: string) => void;
}

export default function MapControls({ onSearch }: MapControlsProps) {
  const { filters, setFilters, resetFilters, hasActiveFilters } = useFilters();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const activeFilterCount = [
    filters.epcRatings.length,
    filters.propertyType ? 1 : 0,
    filters.bedroomsRange[0] !== 0 || filters.bedroomsRange[1] !== 10 ? 1 : 0,
    filters.yearBuiltRange[0] !== 1800 ||
    filters.yearBuiltRange[1] !== new Date().getFullYear()
      ? 1
      : 0,
    filters.heatingType ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const handleEpcToggle = (rating: string) => {
    const newRatings = filters.epcRatings.includes(rating)
      ? filters.epcRatings.filter((r) => r !== rating)
      : [...filters.epcRatings, rating];
    setFilters({ ...filters, epcRatings: newRatings });
  };

  const handlePropertyTypeChange = (type: string) => {
    setFilters({
      ...filters,
      propertyType: filters.propertyType === type ? undefined : type,
    });
  };

  const handleBedroomsChange = (min: number, max: number) => {
    setFilters({ ...filters, bedroomsRange: [min, max] });
  };

  const handleYearBuiltChange = (min: number, max: number) => {
    setFilters({ ...filters, yearBuiltRange: [min, max] });
  };

  const handleHeatingTypeChange = (type: string) => {
    setFilters({
      ...filters,
      heatingType: filters.heatingType === type ? undefined : type,
    });
  };

  const handleSearch = () => {
    if (searchQuery.trim() && onSearch) {
      onSearch(searchQuery);
      setSearchQuery('');
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="fixed left-0 top-14 h-full z-30">
      {/* Collapse Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={`absolute right-0 top-4 transform translate-x-full ml-2 bg-white border border-gray-300 rounded-r-lg p-2 hover:bg-gray-50 transition-colors shadow-md ${
          isCollapsed ? 'left-4' : ''
        }`}
        title={isCollapsed ? 'Show controls' : 'Hide controls'}
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
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>

      {/* Sidebar Panel */}
      {!isCollapsed && (
        <div className="w-80 h-full bg-white shadow-xl overflow-y-auto border-r border-gray-300">
          <div className="p-6 space-y-6">
            {/* Header */}
            <div>
              <h2 className="text-xl font-bold text-gray-900">Filters</h2>
              {activeFilterCount > 0 && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-gray-600">
                    {activeFilterCount} active filter{activeFilterCount !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={resetFilters}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>

            {/* Search Box */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Search by Address
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Enter postcode or address"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={handleSearch}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg transition-colors"
                >
                  Go
                </button>
              </div>
            </div>

            {/* EPC Rating Filter */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                EPC Rating
              </label>
              <div className="grid grid-cols-4 gap-2">
                {EPC_RATINGS.map((rating) => (
                  <button
                    key={rating}
                    onClick={() => handleEpcToggle(rating)}
                    className={`py-2 px-2 rounded font-semibold text-sm transition-colors ${
                      filters.epcRatings.includes(rating)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {rating}
                  </button>
                ))}
              </div>
            </div>

            {/* Property Type Filter */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Property Type
              </label>
              <select
                value={filters.propertyType || ''}
                onChange={(e) => handlePropertyTypeChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Types</option>
                {PROPERTY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            {/* Bedrooms Range Filter */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-gray-700">
                  Bedrooms
                </label>
                <span className="text-xs font-semibold text-gray-900">
                  {filters.bedroomsRange[0]} - {filters.bedroomsRange[1]}
                </span>
              </div>
              <div className="space-y-2">
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={filters.bedroomsRange[0]}
                  onChange={(e) =>
                    handleBedroomsChange(
                      parseInt(e.target.value),
                      filters.bedroomsRange[1]
                    )
                  }
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={filters.bedroomsRange[1]}
                  onChange={(e) =>
                    handleBedroomsChange(
                      filters.bedroomsRange[0],
                      parseInt(e.target.value)
                    )
                  }
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
            </div>

            {/* Year Built Range Filter */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-gray-700">
                  Year Built
                </label>
                <span className="text-xs font-semibold text-gray-900">
                  {filters.yearBuiltRange[0]} - {filters.yearBuiltRange[1]}
                </span>
              </div>
              <div className="space-y-2">
                <input
                  type="range"
                  min="1800"
                  max={new Date().getFullYear()}
                  value={filters.yearBuiltRange[0]}
                  onChange={(e) =>
                    handleYearBuiltChange(
                      parseInt(e.target.value),
                      filters.yearBuiltRange[1]
                    )
                  }
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <input
                  type="range"
                  min="1800"
                  max={new Date().getFullYear()}
                  value={filters.yearBuiltRange[1]}
                  onChange={(e) =>
                    handleYearBuiltChange(
                      filters.yearBuiltRange[0],
                      parseInt(e.target.value)
                    )
                  }
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
            </div>

            {/* Heating Type Filter */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Heating Type
              </label>
              <select
                value={filters.heatingType || ''}
                onChange={(e) => handleHeatingTypeChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Types</option>
                {HEATING_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
