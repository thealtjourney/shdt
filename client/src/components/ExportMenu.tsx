import React, { useState } from 'react';
import { Download, FileText, Map, File, ChevronDown } from 'lucide-react';
import { ExportButton } from './ExportButton';

interface ExportMenuProps {
  activeFilters?: {
    epc?: string;
    yearFrom?: number;
    yearTo?: number;
  };
}

export const ExportMenu: React.FC<ExportMenuProps> = ({ activeFilters = {} }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Build query parameters from active filters
  const buildQueryParams = (includeEpc = false): string => {
    const params = new URLSearchParams();

    if (includeEpc && activeFilters.epc) {
      params.append('epc_filter', activeFilters.epc);
    }

    if (activeFilters.yearFrom) {
      params.append('year_from', activeFilters.yearFrom.toString());
    }

    if (activeFilters.yearTo) {
      params.append('year_to', activeFilters.yearTo.toString());
    }

    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
  };

  // Export properties as CSV
  const handleExportPropertiesCSV = async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/exports/properties/csv${buildQueryParams(true)}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      downloadFile(blob, 'properties_export.csv', 'text/csv');
      setIsOpen(false);
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : 'Failed to export properties as CSV'
      );
    }
  };

  // Export properties as GeoJSON
  const handleExportGeoJSON = async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/exports/properties/geojson${buildQueryParams(true)}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      downloadFile(blob, 'properties_export.geojson', 'application/geo+json');
      setIsOpen(false);
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : 'Failed to export properties as GeoJSON'
      );
    }
  };

  // Export retrofit plan
  const handleExportRetrofitPlan = async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/exports/retrofit-plan${buildQueryParams(false)}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      downloadFile(blob, 'retrofit_plan_export.csv', 'text/csv');
      setIsOpen(false);
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : 'Failed to export retrofit plan'
      );
    }
  };

  // Generate report
  const handleGenerateReport = async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/exports/report${buildQueryParams(true)}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Navigate to report view with data
      const reportUrl = `/report?data=${encodeURIComponent(JSON.stringify(data))}`;
      window.location.href = reportUrl;
      setIsOpen(false);
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : 'Failed to generate report'
      );
    }
  };

  const downloadFile = (blob: Blob, filename: string, mimeType: string) => {
    const url = window.URL.createObjectURL(new Blob([blob], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
      >
        <Download className="w-4 h-4" />
        Export
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="p-3 space-y-2">
            <div className="px-3 py-2 text-sm font-semibold text-gray-700 border-b border-gray-200 mb-2">
              Export Options
            </div>

            <div className="space-y-2">
              <div
                className="p-2 rounded hover:bg-gray-50"
                onClick={() => {
                  /* Close menu after export completes */
                }}
              >
                <ExportButton
                  onClick={handleExportPropertiesCSV}
                  label="Export Properties CSV"
                />
              </div>

              <div className="p-2 rounded hover:bg-gray-50">
                <ExportButton onClick={handleExportGeoJSON} label="Export GeoJSON" />
              </div>

              <div className="border-t border-gray-200 my-2 pt-2">
                <ExportButton
                  onClick={handleExportRetrofitPlan}
                  label="Export Retrofit Plan CSV"
                />
              </div>

              <div className="border-t border-gray-200 my-2 pt-2">
                <ExportButton onClick={handleGenerateReport} label="Generate Report" />
              </div>
            </div>

            <div className="border-t border-gray-200 pt-2 mt-2">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>

          <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 rounded-b-lg">
            <p className="text-xs text-gray-500">
              {Object.keys(activeFilters).length > 0
                ? 'Exports respect active filters'
                : 'No active filters applied'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
