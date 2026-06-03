import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Property } from '../types/property';
import { Filters } from '../context/FilterContext';
import { LatLngBounds } from 'leaflet';

interface PropertiesResponse {
  properties: Property[];
  total?: number;
  clusters?: Array<{
    count: number;
    latitude: number;
    longitude: number;
    properties?: Property[];
  }>;
}

interface UsePropertiesOptions {
  bounds: LatLngBounds | null;
  zoom: number;
  filters: Filters;
}

const API_BASE_URL = '/api';

export function useProperties({ bounds, zoom, filters }: UsePropertiesOptions) {
  const [data, setData] = useState<PropertiesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout>();
  const lastResponseRef = useRef<PropertiesResponse | null>(null);

  const fetchProperties = useCallback(async () => {
    if (!bounds) return;

    setLoading(true);
    setError(null);

    try {
      const south = bounds.getSouth();
      const west = bounds.getWest();
      const north = bounds.getNorth();
      const east = bounds.getEast();

      const params = new URLSearchParams({
        south: south.toString(),
        west: west.toString(),
        north: north.toString(),
        east: east.toString(),
      });

      // Add filter parameters
      if (filters.epcRatings.length > 0) {
        params.append('epcRatings', filters.epcRatings.join(','));
      }
      if (filters.propertyType) {
        params.append('propertyType', filters.propertyType);
      }
      if (filters.bedroomsRange[0] > 0 || filters.bedroomsRange[1] < 10) {
        params.append('minBedrooms', filters.bedroomsRange[0].toString());
        params.append('maxBedrooms', filters.bedroomsRange[1].toString());
      }
      if (filters.yearBuiltRange[0] > 1800 || filters.yearBuiltRange[1] < new Date().getFullYear()) {
        params.append('minYear', filters.yearBuiltRange[0].toString());
        params.append('maxYear', filters.yearBuiltRange[1].toString());
      }
      if (filters.heatingType) {
        params.append('heatingType', filters.heatingType);
      }

      // Choose endpoint based on zoom level
      const endpoint = zoom < 14 ? '/properties/cluster' : '/properties/bbox';
      const url = `${API_BASE_URL}${endpoint}?${params.toString()}`;

      const response = await axios.get<PropertiesResponse>(url);
      lastResponseRef.current = response.data;
      setData(response.data);
    } catch (err) {
      const errorMsg = axios.isAxiosError(err)
        ? err.response?.data?.message || err.message
        : 'Failed to fetch properties';
      setError(errorMsg);
      console.error('Error fetching properties:', err);
    } finally {
      setLoading(false);
    }
  }, [bounds, zoom, filters]);

  // Debounced fetch on bounds/zoom/filters change
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      fetchProperties();
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [fetchProperties]);

  return {
    data,
    loading,
    error,
    refetch: fetchProperties,
    lastResponse: lastResponseRef.current,
  };
}
