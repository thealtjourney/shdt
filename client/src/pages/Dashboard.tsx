import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  PieLabelLine,
} from 'recharts';

interface AnalyticsOverview {
  total_properties: number;
  epc_distribution: Record<string, number>;
  property_type_breakdown: Record<string, number>;
  heating_type_breakdown: Record<string, number>;
  average_condition_score: number;
  retrofit_candidates: number;
  age_brackets: Record<string, number>;
}

interface EpcDistributionData {
  total: number;
  distribution: Array<{
    epc: string;
    count: number;
    percentage: number;
  }>;
}

interface RetrofitProperty {
  id: string;
  address: string;
  postcode: string;
  epc: string;
  property_type: string;
  year_built: number;
  condition_score: number;
  priority_score: number;
}

interface RetrofitData {
  properties: RetrofitProperty[];
  total: number;
  page: number;
  pages: number;
}

interface GeographicSummary {
  postcode_district: string;
  count: number;
  avg_epc_numeric: number;
  avg_condition: number;
  retrofit_needed_percent: number;
}

const API_URL = '/api';

const EPC_COLORS: Record<string, string> = {
  A: '#1B7A2B',
  B: '#4CAF50',
  C: '#8BC34A',
  D: '#FFD600',
  E: '#FF9800',
  F: '#FF5722',
  G: '#D32F2F',
};

const HEATING_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
];

function Dashboard() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [epcDistribution, setEpcDistribution] = useState<EpcDistributionData | null>(null);
  const [retrofitData, setRetrofitData] = useState<RetrofitData | null>(null);
  const [geographicData, setGeographicData] = useState<GeographicSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrofitPage, setRetrofitPage] = useState(1);

  useEffect(() => {
    fetchAnalyticsData();
  }, [retrofitPage]);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [overviewRes, epcRes, retrofitRes, geoRes] = await Promise.all([
        axios.get(`${API_URL}/analytics/overview`),
        axios.get(`${API_URL}/analytics/epc-distribution?target_year=2030`),
        axios.get(
          `${API_URL}/analytics/retrofit-priorities?page=${retrofitPage}&page_size=10`
        ),
        axios.get(`${API_URL}/analytics/geographic-summary`),
      ]);

      setOverview(overviewRes.data.data);
      setEpcDistribution(epcRes.data.data);
      setRetrofitData(retrofitRes.data.data);
      setGeographicData(geoRes.data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics data');
      console.error('Analytics error:', err);
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (!retrofitData?.properties) return;

    const headers = [
      'Address',
      'Postcode',
      'EPC',
      'Type',
      'Year Built',
      'Condition Score',
      'Priority Score',
    ];
    const rows = retrofitData.properties.map((prop) => [
      prop.address,
      prop.postcode,
      prop.epc,
      prop.property_type,
      prop.year_built,
      prop.condition_score,
      prop.priority_score,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${cell}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `retrofit-priorities-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const prepareEpcChartData = () => {
    if (!epcDistribution) return [];
    return epcDistribution.distribution.map((item) => ({
      name: `EPC ${item.epc}`,
      value: item.count,
      percentage: item.percentage,
      epc: item.epc,
    }));
  };

  const prepareAgeChartData = () => {
    if (!overview?.age_brackets) return [];
    return Object.entries(overview.age_brackets).map(([bracket, count]) => ({
      name: bracket,
      count: count as number,
    }));
  };

  const prepareHeatingChartData = () => {
    if (!overview?.heating_type_breakdown) return [];
    return Object.entries(overview.heating_type_breakdown)
      .slice(0, 6)
      .map(([type, count]) => ({
        name: type,
        value: count as number,
      }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 font-semibold">Error loading data</p>
          <p className="text-gray-600 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Bar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-8">
              <h1 className="text-2xl font-bold text-gray-900">SHDT</h1>
              <div className="flex gap-4">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="px-4 py-2 text-gray-600 font-medium rounded-lg bg-blue-50 text-blue-600"
                >
                  Dashboard
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg"
                >
                  Map
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-8">Portfolio Analytics</h2>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Properties */}
          <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-blue-600">
            <p className="text-gray-500 text-sm font-medium">Total Properties</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {overview?.total_properties.toLocaleString()}
            </p>
            <p className="text-gray-400 text-xs mt-3">Properties in portfolio</p>
          </div>

          {/* Average EPC */}
          <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-green-600">
            <p className="text-gray-500 text-sm font-medium">Average EPC</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {epcDistribution?.distribution
                ? (() => {
                    const epcOrder = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7 };
                    const total = epcDistribution.distribution.reduce(
                      (sum, item) => sum + item.count,
                      0
                    );
                    const weighted = epcDistribution.distribution.reduce(
                      (sum, item) =>
                        sum + (epcOrder[item.epc as keyof typeof epcOrder] || 0) * item.count,
                      0
                    );
                    const avgEpc = weighted / total;
                    return String.fromCharCode(64 + Math.round(avgEpc));
                  })()
                : 'N/A'}
            </p>
            <p className="text-gray-400 text-xs mt-3">Estimated average rating</p>
          </div>

          {/* Retrofit Candidates */}
          <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-orange-600">
            <p className="text-gray-500 text-sm font-medium">Retrofit Candidates</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {overview?.retrofit_candidates.toLocaleString()}
            </p>
            <p className="text-gray-400 text-xs mt-3">
              {overview?.total_properties
                ? `${(
                    (overview.retrofit_candidates / overview.total_properties) *
                    100
                  ).toFixed(1)}% of portfolio`
                : 'EPC D or below'}
            </p>
          </div>

          {/* Average Condition */}
          <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-purple-600">
            <p className="text-gray-500 text-sm font-medium">Avg. Condition</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {overview?.average_condition_score.toFixed(1)}
            </p>
            <p className="text-gray-400 text-xs mt-3">Condition score (0-100)</p>
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* EPC Distribution */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              EPC Distribution
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={prepareEpcChartData()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="epc" />
                <YAxis />
                <Tooltip
                  formatter={(value: any) => [
                    value.toLocaleString(),
                    'Properties',
                  ]}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {prepareEpcChartData().map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={EPC_COLORS[entry.epc] || '#6B7280'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Property Age Distribution */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Property Age Distribution
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={prepareAgeChartData()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip
                  formatter={(value: any) => [
                    value.toLocaleString(),
                    'Properties',
                  ]}
                />
                <Bar dataKey="count" fill="#3B82F6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Heating Type Distribution */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Heating Type Distribution
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={prepareHeatingChartData()}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value.toLocaleString()}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {prepareHeatingChartData().map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={HEATING_COLORS[index % HEATING_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any) => [
                    value.toLocaleString(),
                    'Properties',
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Property Type Distribution */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Top Property Types
            </h3>
            <div className="space-y-3">
              {overview?.property_type_breakdown &&
                Object.entries(overview.property_type_breakdown)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .slice(0, 5)
                  .map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">{type}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{
                              width: `${
                                ((count as number) /
                                  Math.max(
                                    ...(Object.values(
                                      overview.property_type_breakdown
                                    ) as number[])
                                  )) *
                                100
                              }%`,
                            }}
                          ></div>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 min-w-fit">
                          {(count as number).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
            </div>
          </div>
        </div>

        {/* Retrofit Priorities Table */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              Retrofit Priorities (Top Properties)
            </h3>
            <button
              onClick={downloadCSV}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Export CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-gray-700 font-semibold">
                    Address
                  </th>
                  <th className="px-4 py-3 text-left text-gray-700 font-semibold">
                    Postcode
                  </th>
                  <th className="px-4 py-3 text-center text-gray-700 font-semibold">
                    EPC
                  </th>
                  <th className="px-4 py-3 text-left text-gray-700 font-semibold">
                    Type
                  </th>
                  <th className="px-4 py-3 text-center text-gray-700 font-semibold">
                    Year
                  </th>
                  <th className="px-4 py-3 text-center text-gray-700 font-semibold">
                    Condition
                  </th>
                  <th className="px-4 py-3 text-center text-gray-700 font-semibold">
                    Priority
                  </th>
                </tr>
              </thead>
              <tbody>
                {retrofitData?.properties && retrofitData.properties.length > 0 ? (
                  retrofitData.properties.map((prop) => (
                    <tr
                      key={prop.id}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/?property=${prop.id}`)}
                    >
                      <td className="px-4 py-3 text-gray-900 font-medium">
                        {prop.address.length > 50
                          ? `${prop.address.substring(0, 50)}...`
                          : prop.address}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{prop.postcode}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className="inline-block px-3 py-1 rounded-lg font-semibold text-white"
                          style={{
                            backgroundColor: EPC_COLORS[prop.epc] || '#6B7280',
                          }}
                        >
                          {prop.epc}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{prop.property_type}</td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        {prop.year_built}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        {prop.condition_score?.toFixed(1) || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-semibold text-gray-900">
                          {prop.priority_score.toFixed(1)}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No retrofit candidates found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {retrofitData && retrofitData.pages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setRetrofitPage((p) => Math.max(1, p - 1))}
                disabled={retrofitPage === 1}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-sm text-gray-700">
                Page {retrofitPage} of {retrofitData.pages}
              </span>
              <button
                onClick={() => setRetrofitPage((p) => Math.min(retrofitData.pages, p + 1))}
                disabled={retrofitPage === retrofitData.pages}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Geographic Summary */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">
            Geographic Summary (by Postcode District)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-gray-700 font-semibold">
                    Postcode District
                  </th>
                  <th className="px-4 py-3 text-center text-gray-700 font-semibold">
                    Properties
                  </th>
                  <th className="px-4 py-3 text-center text-gray-700 font-semibold">
                    Avg EPC
                  </th>
                  <th className="px-4 py-3 text-center text-gray-700 font-semibold">
                    Avg Condition
                  </th>
                  <th className="px-4 py-3 text-center text-gray-700 font-semibold">
                    Retrofit Needed
                  </th>
                </tr>
              </thead>
              <tbody>
                {geographicData && geographicData.length > 0 ? (
                  geographicData.slice(0, 15).map((district) => {
                    const epcMap: Record<number, string> = {
                      1: 'A',
                      2: 'B',
                      3: 'C',
                      4: 'D',
                      5: 'E',
                      6: 'F',
                      7: 'G',
                    };
                    const avgEpc = epcMap[Math.round(district.avg_epc_numeric)] || 'N/A';

                    return (
                      <tr
                        key={district.postcode_district}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {district.postcode_district}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">
                          {district.count.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className="inline-block px-3 py-1 rounded-lg font-semibold text-white"
                            style={{
                              backgroundColor:
                                EPC_COLORS[avgEpc as keyof typeof EPC_COLORS] || '#6B7280',
                            }}
                          >
                            {avgEpc}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">
                          {district.avg_condition?.toFixed(1) || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-gray-900">
                          {district.retrofit_needed_percent.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No geographic data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
