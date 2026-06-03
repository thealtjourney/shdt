import React, { useState } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import {
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Zap,
  Droplets,
  Flame,
  Wind,
  Shield,
  Clock,
  DollarSign,
} from 'lucide-react';

interface MetricCard {
  title: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  icon: React.ReactNode;
  color: string;
}

interface HeatmapCell {
  type: string;
  condition1: number;
  condition2: number;
  condition3: number;
  condition4: number;
  condition5: number;
}

interface FailureForecast {
  month: string;
  boiler: number;
  roof: number;
  plumbing: number;
  electrics: number;
  windows: number;
  cumulativeCost: number;
}

interface AtRiskComponent {
  id: string;
  address: string;
  componentType: string;
  age: number;
  condition: number;
  failureProbability: number;
  predictedDate: string;
  replacementCost: number;
  lastMaintained: string;
}

interface ReplacementForecast {
  year: number;
  boiler: number;
  roof: number;
  plumbing: number;
  electrics: number;
  windows: number;
}

// Mock data
const mockHealthMetrics = {
  healthScore: 72,
  previousScore: 68,
  totalComponents: 847,
  failedComponents: 23,
  predictedFailures12m: 45,
  maintenanceCost12m: 52400,
  maintenanceCompliance: 82,
};

const mockHeatmapData: HeatmapCell[] = [
  { type: 'Boiler', condition1: 12, condition2: 45, condition3: 89, condition4: 34, condition5: 8 },
  { type: 'Roof', condition1: 5, condition2: 28, condition3: 156, condition4: 67, condition5: 34 },
  { type: 'Plumbing', condition1: 34, condition2: 89, condition3: 112, condition4: 28, condition5: 5 },
  { type: 'Electrics', condition1: 18, condition2: 52, condition3: 134, condition4: 45, condition5: 12 },
  { type: 'Windows', condition1: 8, condition2: 34, condition3: 178, condition4: 89, condition5: 23 },
  { type: 'Insulation', condition1: 22, condition2: 67, condition3: 145, condition4: 56, condition5: 18 },
];

const mockFailureForecastData: FailureForecast[] = [
  { month: 'Jan', boiler: 5, roof: 3, plumbing: 4, electrics: 2, windows: 1, cumulativeCost: 15000 },
  { month: 'Feb', boiler: 6, roof: 4, plumbing: 5, electrics: 3, windows: 2, cumulativeCost: 32000 },
  { month: 'Mar', boiler: 7, roof: 5, plumbing: 6, electrics: 4, windows: 2, cumulativeCost: 51000 },
  { month: 'Apr', boiler: 8, roof: 6, plumbing: 7, electrics: 5, windows: 3, cumulativeCost: 73000 },
  { month: 'May', boiler: 9, roof: 7, plumbing: 8, electrics: 6, windows: 3, cumulativeCost: 98000 },
  { month: 'Jun', boiler: 10, roof: 8, plumbing: 9, electrics: 7, windows: 4, cumulativeCost: 127000 },
  { month: 'Jul', boiler: 11, roof: 9, plumbing: 10, electrics: 8, windows: 4, cumulativeCost: 159000 },
  { month: 'Aug', boiler: 12, roof: 10, plumbing: 11, electrics: 9, windows: 5, cumulativeCost: 195000 },
  { month: 'Sep', boiler: 11, roof: 9, plumbing: 10, electrics: 8, windows: 5, cumulativeCost: 228000 },
  { month: 'Oct', boiler: 10, roof: 8, plumbing: 9, electrics: 7, windows: 4, cumulativeCost: 258000 },
  { month: 'Nov', boiler: 9, roof: 7, plumbing: 8, electrics: 6, windows: 3, cumulativeCost: 285000 },
  { month: 'Dec', boiler: 8, roof: 6, plumbing: 7, electrics: 5, windows: 3, cumulativeCost: 308000 },
];

const mockAtRiskComponents: AtRiskComponent[] = [
  {
    id: '1',
    address: '42 Oak Street, Manchester',
    componentType: 'Boiler',
    age: 18,
    condition: 5,
    failureProbability: 0.94,
    predictedDate: '2026-05-12',
    replacementCost: 4200,
    lastMaintained: '2024-11-20',
  },
  {
    id: '2',
    address: '156 Church Lane, Leeds',
    componentType: 'Roof',
    age: 22,
    condition: 4,
    failureProbability: 0.87,
    predictedDate: '2026-06-08',
    replacementCost: 18500,
    lastMaintained: '2023-08-15',
  },
  {
    id: '3',
    address: '89 High Street, Birmingham',
    componentType: 'Windows',
    age: 16,
    condition: 4,
    failureProbability: 0.76,
    predictedDate: '2026-07-20',
    replacementCost: 12300,
    lastMaintained: '2024-09-10',
  },
  {
    id: '4',
    address: '203 Park Avenue, Liverpool',
    componentType: 'Plumbing',
    age: 25,
    condition: 5,
    failureProbability: 0.82,
    predictedDate: '2026-05-30',
    replacementCost: 8900,
    lastMaintained: '2023-12-05',
  },
  {
    id: '5',
    address: '71 Queen Road, Bristol',
    componentType: 'Electrics',
    age: 19,
    condition: 4,
    failureProbability: 0.71,
    predictedDate: '2026-08-15',
    replacementCost: 6700,
    lastMaintained: '2024-02-28',
  },
];

const mockReplacementForecastData: ReplacementForecast[] = [
  { year: 2026, boiler: 125000, roof: 280000, plumbing: 95000, electrics: 78000, windows: 156000 },
  { year: 2027, boiler: 142000, roof: 305000, plumbing: 108000, electrics: 92000, windows: 172000 },
  { year: 2028, boiler: 158000, roof: 328000, plumbing: 121000, electrics: 105000, windows: 188000 },
  { year: 2029, boiler: 175000, roof: 352000, plumbing: 135000, electrics: 119000, windows: 205000 },
  { year: 2030, boiler: 192000, roof: 376000, plumbing: 149000, electrics: 134000, windows: 223000 },
];

const componentColors = {
  boiler: '#ef4444',
  roof: '#f97316',
  plumbing: '#3b82f6',
  electrics: '#eab308',
  windows: '#06b6d4',
  insulation: '#8b5cf6',
};

const getConditionColor = (value: number): string => {
  if (value <= 1) return '#10b981'; // green
  if (value <= 2) return '#84cc16'; // lime
  if (value <= 3) return '#f59e0b'; // amber
  if (value <= 4) return '#f97316'; // orange
  return '#ef4444'; // red
};

const getProbabilityColor = (probability: number): string => {
  if (probability < 0.3) return 'bg-green-100 text-green-800';
  if (probability < 0.6) return 'bg-yellow-100 text-yellow-800';
  if (probability < 0.8) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
};

export default function DigitalTwin() {
  const [selectedComponent, setSelectedComponent] = useState<AtRiskComponent | null>(null);
  const [sortBy, setSortBy] = useState<'probability' | 'date' | 'cost'>('probability');

  const getTrendIcon = (trend?: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-red-500" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-green-500" />;
      default:
        return null;
    }
  };

  const sortedComponents = [...mockAtRiskComponents].sort((a, b) => {
    switch (sortBy) {
      case 'probability':
        return b.failureProbability - a.failureProbability;
      case 'date':
        return new Date(a.predictedDate).getTime() - new Date(b.predictedDate).getTime();
      case 'cost':
        return b.replacementCost - a.replacementCost;
      default:
        return 0;
    }
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 space-y-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Digital Twin Dashboard</h1>
          <p className="text-slate-600">Portfolio health monitoring and predictive maintenance</p>
        </div>

        {/* Portfolio Health Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          {/* Health Score Gauge */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-lg p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-900">Portfolio Health</h2>
              <div className="flex items-center gap-2">
                {getTrendIcon('down')}
                <span className="text-sm text-green-600 font-semibold">↑ 4 points</span>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <div className="relative w-48 h-48">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  {/* Background circle */}
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                  {/* Progress circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="8"
                    strokeDasharray={`${(mockHealthMetrics.healthScore / 100) * 282.7} 282.7`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-4xl font-bold text-slate-900">{mockHealthMetrics.healthScore}</div>
                  <div className="text-sm text-slate-600">/ 100</div>
                </div>
              </div>
            </div>

            <div className="mt-6 text-center">
              <p className="text-sm text-slate-600">
                Previous: <span className="font-semibold">{mockHealthMetrics.previousScore}</span>
              </p>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Total Components</p>
                  <p className="text-2xl font-bold text-slate-900">{mockHealthMetrics.totalComponents}</p>
                </div>
                <Shield className="w-8 h-8 text-blue-500" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-red-500">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Failed Components</p>
                  <p className="text-2xl font-bold text-slate-900">{mockHealthMetrics.failedComponents}</p>
                </div>
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-orange-500">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Predicted Failures</p>
                    <p className="text-xl font-bold text-slate-900">{mockHealthMetrics.predictedFailures12m}</p>
                    <p className="text-xs text-slate-500">in 12 months</p>
                  </div>
                  <Clock className="w-6 h-6 text-orange-500" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Maintenance</p>
                    <p className="text-xl font-bold text-slate-900">{mockHealthMetrics.maintenanceCompliance}%</p>
                    <p className="text-xs text-slate-500">compliant</p>
                  </div>
                  <Zap className="w-6 h-6 text-green-500" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Component Health Heatmap */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">Component Health Heatmap</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Component Type</th>
                  {[1, 2, 3, 4, 5].map((condition) => (
                    <th key={condition} className="px-4 py-3 text-center text-sm font-semibold text-slate-600">
                      Condition {condition}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mockHeatmapData.map((row) => (
                  <tr key={row.type} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{row.type}</td>
                    {[
                      { value: row.condition1, max: 200 },
                      { value: row.condition2, max: 200 },
                      { value: row.condition3, max: 200 },
                      { value: row.condition4, max: 200 },
                      { value: row.condition5, max: 200 },
                    ].map((cell, idx) => (
                      <td
                        key={idx}
                        className="px-4 py-3 text-center cursor-pointer hover:opacity-80 transition"
                        onClick={() => console.log(`Clicked: ${row.type} Condition ${idx + 1}`)}
                      >
                        <div
                          className="inline-flex items-center justify-center w-12 h-12 rounded-lg font-semibold text-white text-sm"
                          style={{
                            backgroundColor: getConditionColor((idx + 1) * 1),
                            opacity: 0.4 + (cell.value / cell.max) * 0.6,
                          }}
                        >
                          {cell.value}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Failure Forecast Chart */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">24-Month Failure Forecast</h2>
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={mockFailureForecastData}>
              <defs>
                <linearGradient id="colorBoiler" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="colorRoof" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="colorPlumbing" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="colorElectrics" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#eab308" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#eab308" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="colorWindows" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" />
              <YAxis yAxisId="left" stroke="#64748b" />
              <YAxis yAxisId="right" orientation="right" stroke="#8b5cf6" />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="boiler"
                stackId="1"
                stroke="#ef4444"
                fillOpacity={1}
                fill="url(#colorBoiler)"
                name="Boiler"
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="roof"
                stackId="1"
                stroke="#f97316"
                fillOpacity={1}
                fill="url(#colorRoof)"
                name="Roof"
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="plumbing"
                stackId="1"
                stroke="#3b82f6"
                fillOpacity={1}
                fill="url(#colorPlumbing)"
                name="Plumbing"
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="electrics"
                stackId="1"
                stroke="#eab308"
                fillOpacity={1}
                fill="url(#colorElectrics)"
                name="Electrics"
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="windows"
                stackId="1"
                stroke="#06b6d4"
                fillOpacity={1}
                fill="url(#colorWindows)"
                name="Windows"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumulativeCost"
                stroke="#8b5cf6"
                strokeWidth={3}
                name="Cumulative Cost"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* At-Risk Components Table */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-slate-900">At-Risk Components</h2>
            <div className="flex gap-2">
              {(['probability', 'date', 'cost'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setSortBy(option)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    sortBy === option
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Sort by {option.charAt(0).toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Address</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Component</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-slate-600">Age (yrs)</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-slate-600">Condition</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-slate-600">Failure Probability</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-slate-600">Predicted Date</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-600">Cost</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-slate-600">Last Maintained</th>
                </tr>
              </thead>
              <tbody>
                {sortedComponents.map((component) => (
                  <tr
                    key={component.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition cursor-pointer"
                    onClick={() => setSelectedComponent(component)}
                  >
                    <td className="px-4 py-3 text-sm text-slate-900 font-medium">{component.address}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{component.componentType}</td>
                    <td className="px-4 py-3 text-sm text-center text-slate-700">{component.age}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-2">
                        <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(component.condition / 5) * 100}%`,
                              backgroundColor: getConditionColor(component.condition),
                            }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-slate-700">{component.condition}/5</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getProbabilityColor(component.failureProbability)}`}>
                        {(component.failureProbability * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-slate-700">
                      {new Date(component.predictedDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-slate-900 font-semibold">
                      £{component.replacementCost.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-slate-700">
                      {new Date(component.lastMaintained).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Replacement Cost Forecast */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">5-Year Replacement Cost Forecast</h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={mockReplacementForecastData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="year" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                formatter={(value) => `£${(value as number).toLocaleString()}`}
              />
              <Legend />
              <Bar dataKey="boiler" stackId="a" fill="#ef4444" name="Boiler" />
              <Bar dataKey="roof" stackId="a" fill="#f97316" name="Roof" />
              <Bar dataKey="plumbing" stackId="a" fill="#3b82f6" name="Plumbing" />
              <Bar dataKey="electrics" stackId="a" fill="#eab308" name="Electrics" />
              <Bar dataKey="windows" stackId="a" fill="#06b6d4" name="Windows" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Selected Component Detail Modal */}
        {selectedComponent && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-96 overflow-y-auto p-8">
              <button
                onClick={() => setSelectedComponent(null)}
                className="absolute top-4 right-4 text-slate-500 hover:text-slate-700"
              >
                ✕
              </button>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">{selectedComponent.componentType}</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Address</p>
                  <p className="text-lg font-semibold text-slate-900">{selectedComponent.address}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Age</p>
                  <p className="text-lg font-semibold text-slate-900">{selectedComponent.age} years</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Condition</p>
                  <p className="text-lg font-semibold text-slate-900">{selectedComponent.condition}/5</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Failure Probability</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {(selectedComponent.failureProbability * 100).toFixed(0)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Predicted Failure Date</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {new Date(selectedComponent.predictedDate).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Replacement Cost</p>
                  <p className="text-lg font-semibold text-slate-900">£{selectedComponent.replacementCost.toLocaleString()}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-slate-600 mb-1">Last Maintained</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {new Date(selectedComponent.lastMaintained).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
