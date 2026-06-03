import React, { useState, useEffect } from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';

interface ReportData {
  generated_at: string;
  total_properties: number;
  average_epc: string;
  properties_needing_retrofit: number;
  estimated_total_investment: number;
  potential_energy_savings: number;
  epc_distribution: Record<string, number>;
  retrofit_priority_count: number;
  geographic_summary: Record<string, number>;
}

export const ReportView: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [reportData, setReportData] = useState<ReportData | null>(null);

  useEffect(() => {
    const dataParam = searchParams.get('data');
    if (dataParam) {
      try {
        const data = JSON.parse(decodeURIComponent(dataParam));
        setReportData(data);
      } catch (error) {
        console.error('Failed to parse report data:', error);
      }
    }
  }, [searchParams]);

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  if (!reportData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Loading report...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Non-printable Header */}
      <div className="no-print bg-gray-50 border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Portfolio Report</h1>
          </div>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors font-medium"
          >
            <Printer className="w-4 h-4" />
            Print Report
          </button>
        </div>
      </div>

      {/* Printable Content */}
      <div className="max-w-4xl mx-auto p-8">
        {/* Title Page / Header */}
        <div className="mb-12 pb-8 border-b-2 border-gray-300 page-break-after">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Smart Housing Data Tool</h1>
          <p className="text-xl text-gray-600 mb-6">Portfolio Summary Report</p>
          <div className="grid grid-cols-2 gap-4 text-sm text-gray-700">
            <div>
              <p className="font-semibold text-gray-900">Report Generated</p>
              <p>{formatDate(reportData.generated_at)}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Properties Analyzed</p>
              <p>{reportData.total_properties}</p>
            </div>
          </div>
        </div>

        {/* Executive Summary */}
        <div className="mb-12 page-break-after">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b-2 border-blue-600">
            Executive Summary
          </h2>
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
              <p className="text-sm font-semibold text-blue-900 mb-2">Total Properties</p>
              <p className="text-3xl font-bold text-blue-600">{reportData.total_properties}</p>
            </div>
            <div className="bg-orange-50 p-6 rounded-lg border border-orange-200">
              <p className="text-sm font-semibold text-orange-900 mb-2">Average EPC Rating</p>
              <p className="text-3xl font-bold text-orange-600">{reportData.average_epc}</p>
            </div>
            <div className="bg-red-50 p-6 rounded-lg border border-red-200">
              <p className="text-sm font-semibold text-red-900 mb-2">Properties Needing Retrofit</p>
              <p className="text-3xl font-bold text-red-600">{reportData.properties_needing_retrofit}</p>
            </div>
            <div className="bg-green-50 p-6 rounded-lg border border-green-200">
              <p className="text-sm font-semibold text-green-900 mb-2">Potential Annual Savings</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(reportData.potential_energy_savings)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-purple-50 p-6 rounded-lg border border-purple-200">
              <p className="text-sm font-semibold text-purple-900 mb-2">
                Estimated Total Investment Required
              </p>
              <p className="text-2xl font-bold text-purple-600">
                {formatCurrency(reportData.estimated_total_investment)}
              </p>
            </div>
          </div>
        </div>

        {/* EPC Distribution */}
        <div className="mb-12 page-break-after">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b-2 border-blue-600">
            EPC Distribution
          </h2>

          {/* Distribution Chart (Text-based for print) */}
          <div className="mb-8">
            <div className="space-y-3">
              {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((rating) => {
                const count = reportData.epc_distribution[rating] || 0;
                const percentage =
                  reportData.total_properties > 0
                    ? Math.round((count / reportData.total_properties) * 100)
                    : 0;
                const barWidth = percentage;

                return (
                  <div key={rating} className="flex items-center gap-4">
                    <div className="w-12 font-bold text-center text-lg">
                      <span
                        className={`inline-block px-3 py-1 rounded font-bold text-white ${
                          rating === 'A' ? 'bg-green-600' : ''
                        } ${rating === 'B' ? 'bg-green-500' : ''} ${
                          rating === 'C' ? 'bg-yellow-400' : ''
                        } ${rating === 'D' ? 'bg-orange-400' : ''} ${
                          rating === 'E' ? 'bg-orange-500' : ''
                        } ${rating === 'F' ? 'bg-red-500' : ''} ${
                          rating === 'G' ? 'bg-red-700' : ''
                        }`}
                      >
                        {rating}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="w-full bg-gray-200 rounded-full h-8 overflow-hidden">
                        <div
                          className="bg-blue-600 h-full flex items-center justify-center text-white text-sm font-bold"
                          style={{ width: `${Math.max(barWidth, 5)}%` }}
                        >
                          {count > 0 && `${count}`}
                        </div>
                      </div>
                    </div>
                    <div className="w-20 text-right">
                      <p className="text-sm text-gray-600">
                        {count} ({percentage}%)
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* EPC Distribution Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-900">
                    EPC Rating
                  </th>
                  <th className="border border-gray-300 px-4 py-3 text-center font-semibold text-gray-900">
                    Count
                  </th>
                  <th className="border border-gray-300 px-4 py-3 text-right font-semibold text-gray-900">
                    Percentage
                  </th>
                </tr>
              </thead>
              <tbody>
                {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((rating) => {
                  const count = reportData.epc_distribution[rating] || 0;
                  const percentage =
                    reportData.total_properties > 0
                      ? ((count / reportData.total_properties) * 100).toFixed(1)
                      : '0.0';

                  return (
                    <tr key={rating} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-4 py-3 font-semibold">{rating}</td>
                      <td className="border border-gray-300 px-4 py-3 text-center">{count}</td>
                      <td className="border border-gray-300 px-4 py-3 text-right">
                        {percentage}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stock Condition Overview */}
        <div className="mb-12 page-break-after">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b-2 border-blue-600">
            Stock Condition Overview
          </h2>
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-semibold text-green-900">Good Condition (A-C)</p>
              <p className="text-lg font-bold text-green-600">
                {reportData.total_properties -
                  (reportData.epc_distribution['D'] || 0) -
                  (reportData.epc_distribution['E'] || 0) -
                  (reportData.epc_distribution['F'] || 0) -
                  (reportData.epc_distribution['G'] || 0)}{' '}
                properties
              </p>
            </div>
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-semibold text-yellow-900">Moderate Condition (D)</p>
              <p className="text-lg font-bold text-yellow-600">
                {reportData.epc_distribution['D'] || 0} properties
              </p>
            </div>
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm font-semibold text-red-900">Poor Condition (E-G)</p>
              <p className="text-lg font-bold text-red-600">
                {(reportData.epc_distribution['E'] || 0) +
                  (reportData.epc_distribution['F'] || 0) +
                  (reportData.epc_distribution['G'] || 0)}{' '}
                properties
              </p>
            </div>
          </div>
        </div>

        {/* Retrofit Priority Summary */}
        <div className="mb-12 page-break-after">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b-2 border-blue-600">
            Retrofit Priority Summary
          </h2>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-sm text-red-900 mb-2">Properties Requiring Immediate Attention</p>
            <p className="text-3xl font-bold text-red-600">
              {reportData.retrofit_priority_count}
            </p>
            <p className="text-sm text-red-700 mt-3">
              These properties have EPC ratings of E, F, or G and are recommended for retrofit
              improvements to improve energy efficiency and reduce operating costs.
            </p>
          </div>

          <div className="mt-6 p-6 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-semibold text-blue-900 mb-4">Investment Opportunity</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-blue-700 mb-1">Estimated Capital Required</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatCurrency(reportData.estimated_total_investment)}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-700 mb-1">Potential Annual Savings</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatCurrency(reportData.potential_energy_savings)}
                </p>
              </div>
            </div>
            <p className="text-xs text-blue-700 mt-3">
              Payback period: Approximately{' '}
              {Math.round(reportData.estimated_total_investment / reportData.potential_energy_savings)}{' '}
              years
            </p>
          </div>
        </div>

        {/* Geographic Analysis */}
        <div className="mb-12 page-break-after">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b-2 border-blue-600">
            Geographic Analysis
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-900">
                    Location
                  </th>
                  <th className="border border-gray-300 px-4 py-3 text-center font-semibold text-gray-900">
                    Properties
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(reportData.geographic_summary).map(([location, count]) => (
                  <tr key={location} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-3">{location}</td>
                    <td className="border border-gray-300 px-4 py-3 text-center">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Data Quality Notes */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b-2 border-blue-600">
            Data Quality Notes
          </h2>
          <div className="space-y-3 text-sm text-gray-700">
            <p>
              This report is generated based on the current data in the Smart Housing Data Tool
              system. Data quality and completeness may vary depending on the source data.
            </p>
            <p>
              EPC ratings are based on current Energy Performance Certificate assessments. These
              ratings may change following building improvements or reassessments.
            </p>
            <p>
              Cost estimates and energy savings projections are indicative and should be validated
              with qualified surveyors and energy specialists before undertaking retrofitting
              works.
            </p>
            <p>
              Geographic analysis is based on property location data at the time of data collection
              and may not reflect current occupancy or use.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t-2 border-gray-300 pt-6 text-center text-xs text-gray-500">
          <p>Smart Housing Data Tool - Confidential</p>
          <p>Generated on {formatDate(reportData.generated_at)}</p>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            background: white;
          }

          .no-print {
            display: none !important;
          }

          .page-break-after {
            page-break-after: always;
          }

          .max-w-4xl {
            max-width: 100%;
          }

          @page {
            size: A4;
            margin: 20mm;
          }

          h1, h2, h3 {
            page-break-after: avoid;
          }

          table {
            page-break-inside: avoid;
          }

          div {
            page-break-inside: avoid;
          }

          button {
            display: none;
          }
        }
      `}</style>
    </div>
  );
};
