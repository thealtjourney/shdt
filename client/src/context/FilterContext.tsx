import React, { createContext, useContext, useState } from 'react';

export interface Filters {
  epcRatings: string[];
  propertyType?: string;
  bedroomsRange: [number, number];
  yearBuiltRange: [number, number];
  heatingType?: string;
}

interface FilterContextType {
  filters: Filters;
  setFilters: (filters: Filters) => void;
  resetFilters: () => void;
  hasActiveFilters: () => boolean;
}

const defaultFilters: Filters = {
  epcRatings: [],
  propertyType: undefined,
  bedroomsRange: [0, 10],
  yearBuiltRange: [1800, new Date().getFullYear()],
  heatingType: undefined,
};

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  const resetFilters = () => {
    setFilters(defaultFilters);
  };

  const hasActiveFilters = () => {
    return (
      filters.epcRatings.length > 0 ||
      filters.propertyType !== undefined ||
      filters.bedroomsRange[0] !== 0 ||
      filters.bedroomsRange[1] !== 10 ||
      filters.yearBuiltRange[0] !== 1800 ||
      filters.yearBuiltRange[1] !== new Date().getFullYear() ||
      filters.heatingType !== undefined
    );
  };

  return (
    <FilterContext.Provider value={{ filters, setFilters, resetFilters, hasActiveFilters }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilters must be used within a FilterProvider');
  }
  return context;
}
