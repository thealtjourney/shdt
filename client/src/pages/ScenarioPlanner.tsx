/**
 * ⚠️  DEPRECATION NOTICE
 *
 * The Scenarios feature was removed from the navigation in March 2026 but
 * this page component was left in place. SHDT_Build_Order.docx (Phase 1,
 * item #4) flags this for a deliberate keep-or-remove decision.
 *
 * Until that decision is made, this file is intentionally retained — its
 * paired backend router (server/routers/scenarios.py) remains mounted at
 * /api/scenarios. See that file for the rationale on each side.
 */
import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  Plus,
  Edit2,
  Trash2,
  Play,
  TrendingDown,
  Zap,
  DollarSign,
  Leaf,
  AlertCircle,
  CheckCircle,
  Clock,
  Home,
} from 'lucide-react';

interface Scenario {
  id: string;
  name: string;
  status: 'draft' | 'running' | 'completed';
  description?: string;
  properties: string[];
  interventions: Intervention[];
  startDate: string;
  endDate: string;
  createdAt: string;
  results?: ScenarioResults;
}

interface Intervention {
  id: string;
  name: string;
  category: string;
  cost: number;
  co2Reduction: number;
  epcImprovement: number;
  description?: string;
}

interface ScenarioResults {
  beforeEpc: EPCDistribution;
  afterEpc: EPCDistribution;
  co2Trajectory: CO2Point[];
  costBreakdown: CostBreakdown;
  propertyImpact: PropertyImpact[];
  roi: number;
  totalCost: number;
  totalCo2Reduction: number;
  averageEpcImprovement: number;
}

interface EPCDistribution {
  A: number;
  B: number;
  C: number;
  D: number;
  E: number;
  F: number;
  G: number;
}

interface CO2Point {
  year: number;
  baseline: number;
  scenario: number;
}

interface CostBreakdown {
  labour: number;
  materials: number;
  equipment: number;
  contingency: number;
}

interface PropertyImpact {
  address: string;
  currentEpc: string;
  projectedEpc: string;
  estimatedCost: number;
  estimatedSavings: number;
}

// Mock data
const mockScenarios: Scenario[] = [
  {
    id: '1',
    name: 'Manchester Winter 2025',
    status: 'completed',
    description: 'Replace boilers and improve insulation across portfolio',
    properties: ['42 Oak Street', '156 Church Lane'],
    interventions: [
      {
        id: 'i1',
        name: 'Heat Pump Installation',
        category: 'Heating',
        cost: 8500,
        co2Reduction: 4.2,
        epcImprovement: 2,
      },
      {
        id: 'i2',
        name: 'Wall Insulation',
        category: 'Envelope',
        cost: 6200,
        co2Reduction: 2.1,
        epcImprovement: 1,
      },
    ],
    startDate: '2025-01-15',
    endDate: '2025-06-30',
    createdAt: '2024-12-01',
    results: {
      beforeEpc: { A: 2, B: 8, C: 15, D: 28, E: 32, F: 12, G: 3 },
      afterEpc: { A: 5, B: 18, C: 28, D: 25, E: 18, F: 5, G: 1 },
      co2Trajectory: [
        { year: 2025, baseline: 15200, scenario: 14100 },
        { year: 2026, baseline: 15400, scenario: 13200 },
        { year: 2027, baseline: 15600, scenario: 12100 },
      ],
      costBreakdown: {
        labour: 12500,
        materials: 8900,
        equipment: 3200,
        contingency: 2400,
      },
      propertyImpact: [
        {
          address: '42 Oak Street',
          currentEpc: 'D',
          projectedEpc: 'B',
          estimatedCost: 14700,
          estimatedSavings: 2800,
        },
        {
          address: '156 Church Lane',
          currentEpc: 'E',
          projectedEpc: 'C',
          estimatedCost: 12000,
          estimatedSavings: 2200,
        },
      ],
      roi: 18.5,
      totalCost: 27000,
      totalCo2Reduction: 6.3,
      averageEpcImprovement: 1.5,
    },
  },
  {
    id: '2',
    name: 'Leeds Retrofit 2025',
    status: 'running',
    description: 'Comprehensive retrofit with renewable energy',
    properties: ['89 High Street', '203 Park Avenue'],
    interventions: [
      {
        id: 'i3',
        name: 'Solar PV Installation',
        category: 'Renewable',
        cost: 12000,
        co2Reduction: 3.8,
        epcImprovement: 1.5,
      },
      {
        id: 'i4',
        name: 'Window Replacement',
        category: 'Envelope',
        cost: 9500,
        co2Reduction: 1.5,
        epcImprovement: 1,
      },
    ],
    startDate: '2025-02-01',
    endDate: '2025-10-31',
    createdAt: '2025-01-10',
  },
  {
    id: '3',
    name: 'Bristol Minimal',
    status: 'draft',
    description: 'Low-cost maintenance-focused approach',
    properties: ['71 Queen Road'],
    interventions: [
      {
        id: 'i5',
        name: 'Boiler Service & Optimization',
        category: 'Heating',
        cost: 2500,
        co2Reduction: 0.8,
        epcImprovement: 0.5,
      },
    ],
    startDate: '2025-03-01',
    endDate: '2025-05-31',
    createdAt: '2025-01-15',
  },
];

const interventionCatalog: Intervention[] = [
  {
    id: 'cat1',
    name: 'Heat Pump Installation',
    category: 'Heating',
    cost: 8500,
    co2Reduction: 4.2,
    epcImprovement: 2,
    description: 'Replace gas boiler with air source heat pump',
  },
  {
    id: 'cat2',
    name: 'Wall Insulation',
    category: 'Envelope',
    cost: 6200,
    co2Reduction: 2.1,
    epcImprovement: 1,
    description: 'External wall insulation (EWI) installation',
  },
  {
    id: 'cat3',
    name: 'Window Replacement',
    category: 'Envelope',
    cost: 9500,
    co2Reduction: 1.5,
    epcImprovement: 1,
    description: 'Triple glazed window installation',
  },
  {
    id: 'cat4',
    name: 'Solar PV Installation',
    category: 'Renewable',
    cost: 12000,
    co2Reduction: 3.8,
    epcImprovement: 1.5,
    description: '5kW solar PV array installation',
  },
  {
    id: 'cat5',
    name: 'Loft Insulation',
    category: 'Envelope',
    cost: 1800,
    co2Reduction: 0.9,
    epcImprovement: 0.5,
    description: 'Increase loft insulation to 300mm',
  },
  {
    id: 'cat6',
    name: 'Boiler Service & Optimization',
    category: 'Heating',
    cost: 2500,
    co2Reduction: 0.8,
    epcImprovement: 0.5,
    description: 'Annual service and efficiency tuning',
  },
];

const statusColors = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-800', icon: <Clock className="w-4 h-4" /> },
  running: { bg: 'bg-blue-100', text: 'text-blue-800', icon: <Zap className="w-4 h-4" /> },
  completed: { bg: 'bg-green-100', text: 'text-green-800', icon: <CheckCircle className="w-4 h-4" /> },
};

const ScenarioCard: React.FC<{
  scenario: Scenario;
  onEdit: (scenario: Scenario) => void;
  onDelete: (id: string) => void;
  onRun: (scenario: Scenario) => void;
}> = ({ scenario, onEdit, onDelete, onRun }) => {
  const colors = statusColors[scenario.status];

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500 hover:shadow-xl transition">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{scenario.name}</h3>
          <p className="text-sm text-slate-600 mt-1">{scenario.description}</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${colors.bg}`}>
          {colors.icon}
          <span className={`text-xs font-semibold ${colors.text}`}>
            {scenario.status.charAt(0).toUpperCase() + scenario.status.slice(1)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-slate-600 mb-1">Properties</p>
          <p className="text-sm font-semibold text-slate-900">{scenario.properties.length} properties</p>
        </div>
        <div>
          <p className="text-xs text-slate-600 mb-1">Interventions</p>
          <p className="text-sm font-semibold text-slate-900">{scenario.interventions.length} items</p>
        </div>
      </div>

      {scenario.results && (
        <div className="grid grid-cols-3 gap-2 mb-4 p-3 bg-slate-50 rounded-lg">
          <div>
            <p className="text-xs text-slate-600">Total Cost</p>
            <p className="text-sm font-bold text-slate-900">£{scenario.results.totalCost.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-slate-600">CO2 Reduction</p>
            <p className="text-sm font-bold text-green-600">{scenario.results.totalCo2Reduction}T</p>
          </div>
          <div>
            <p className="text-xs text-slate-600">ROI</p>
            <p className="text-sm font-bold text-blue-600">{scenario.results.roi}%</p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {scenario.status === 'draft' && (
          <>
            <button
              onClick={() => onRun(scenario)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium text-sm"
            >
              <Play className="w-4 h-4" />
              Run Simulation
            </button>
            <button
              onClick={() => onEdit(scenario)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </>
        )}
        <button
          onClick={() => onDelete(scenario.id)}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const ScenarioBuilder: React.FC<{ onClose: () => void; scenario?: Scenario }> = ({ onClose, scenario }) => {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(scenario?.name || '');
  const [selectedProperties, setSelectedProperties] = useState<string[]>(scenario?.properties || []);
  const [selectedInterventions, setSelectedInterventions] = useState<string[]>(
    scenario?.interventions.map((i) => i.id) || []
  );
  const [startDate, setStartDate] = useState(scenario?.startDate || '');
  const [endDate, setEndDate] = useState(scenario?.endDate || '');

  const toggleProperty = (property: string) => {
    setSelectedProperties((prev) =>
      prev.includes(property) ? prev.filter((p) => p !== property) : [...prev, property]
    );
  };

  const toggleIntervention = (interventionId: string) => {
    setSelectedInterventions((prev) =>
      prev.includes(interventionId)
        ? prev.filter((i) => i !== interventionId)
        : [...prev, interventionId]
    );
  };

  const selectedInterventionData = interventionCatalog.filter((i) =>
    selectedInterventions.includes(i.id)
  );
  const totalCost = selectedInterventionData.reduce((sum, i) => sum + i.cost, 0);
  const totalCo2 = selectedInterventionData.reduce((sum, i) => sum + i.co2Reduction, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-96 overflow-y-auto p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-900">
            {scenario ? 'Edit Scenario' : 'Create New Scenario'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 text-2xl"
          >
            ✕
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`flex-1 py-2 rounded-lg font-semibold text-sm transition ${
                s === step
                  ? 'bg-blue-500 text-white'
                  : s < step
                    ? 'bg-green-500 text-white'
                    : 'bg-slate-200 text-slate-600'
              }`}
            >
              Step {s}
            </button>
          ))}
        </div>

        {/* Step 1: Name */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Scenario Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Manchester Winter 2025"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => setStep(2)}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-semibold"
            >
              Next
            </button>
          </div>
        )}

        {/* Step 2: Select Properties */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-3">Select Properties</label>
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                {['42 Oak Street', '156 Church Lane', '89 High Street', '203 Park Avenue', '71 Queen Road'].map((prop) => (
                  <label key={prop} className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedProperties.includes(prop)}
                      onChange={() => toggleProperty(prop)}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm text-slate-700">{prop}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="flex-1 px-4 py-2 bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300 transition font-semibold"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={selectedProperties.length === 0}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-slate-300 transition font-semibold"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Select Interventions */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-3">Select Interventions</label>
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                {interventionCatalog.map((intervention) => (
                  <label key={intervention.id} className="flex items-start gap-3 p-3 hover:bg-slate-50 rounded-lg cursor-pointer border border-slate-200">
                    <input
                      type="checkbox"
                      checked={selectedInterventions.includes(intervention.id)}
                      onChange={() => toggleIntervention(intervention.id)}
                      className="w-4 h-4 rounded mt-1"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{intervention.name}</p>
                      <p className="text-xs text-slate-600">{intervention.description}</p>
                      <div className="flex gap-3 mt-2 text-xs">
                        <span className="text-blue-600">£{intervention.cost.toLocaleString()}</span>
                        <span className="text-green-600">{intervention.co2Reduction}T CO2</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-sm font-semibold text-slate-900 mb-2">Summary</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-slate-600">Total Cost:</span>
                <span className="font-semibold text-slate-900">£{totalCost.toLocaleString()}</span>
                <span className="text-slate-600">CO2 Reduction:</span>
                <span className="font-semibold text-green-600">{totalCo2}T</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep(2)}
                className="flex-1 px-4 py-2 bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300 transition font-semibold"
              >
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                disabled={selectedInterventions.length === 0}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-slate-300 transition font-semibold"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Set Timeframe */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep(3)}
                className="flex-1 px-4 py-2 bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300 transition font-semibold"
              >
                Back
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition font-semibold"
              >
                Create Scenario
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ResultsView: React.FC<{ scenario: Scenario }> = ({ scenario }) => {
  if (!scenario.results) return null;

  const results = scenario.results;

  // Prepare EPC chart data
  const epcData = [
    { rating: 'A', before: results.beforeEpc.A, after: results.afterEpc.A },
    { rating: 'B', before: results.beforeEpc.B, after: results.afterEpc.B },
    { rating: 'C', before: results.beforeEpc.C, after: results.afterEpc.C },
    { rating: 'D', before: results.beforeEpc.D, after: results.afterEpc.D },
    { rating: 'E', before: results.beforeEpc.E, after: results.afterEpc.E },
    { rating: 'F', before: results.beforeEpc.F, after: results.afterEpc.F },
    { rating: 'G', before: results.beforeEpc.G, after: results.afterEpc.G },
  ];

  // Prepare cost breakdown data
  const costData = [
    { name: 'Labour', value: results.costBreakdown.labour },
    { name: 'Materials', value: results.costBreakdown.materials },
    { name: 'Equipment', value: results.costBreakdown.equipment },
    { name: 'Contingency', value: results.costBreakdown.contingency },
  ];

  const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'];

  // Prepare radar data for comparison
  const radarData = [
    { metric: 'EPC Improvement', before: 2, after: 5, fullMark: 10 },
    { metric: 'Cost Efficiency', before: 6, after: 8, fullMark: 10 },
    { metric: 'CO2 Reduction', before: 3, after: 8, fullMark: 10 },
    { metric: 'Implementation', before: 4, after: 9, fullMark: 10 },
    { metric: 'Long-term ROI', before: 5, after: 7, fullMark: 10 },
  ];

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500">
          <p className="text-sm text-slate-600 mb-1">Total Cost</p>
          <p className="text-2xl font-bold text-slate-900">£{results.totalCost.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-2">All interventions</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500">
          <p className="text-sm text-slate-600 mb-1">CO2 Reduction</p>
          <p className="text-2xl font-bold text-green-600">{results.totalCo2Reduction}T CO2e</p>
          <p className="text-xs text-slate-500 mt-2">Annual impact</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-500">
          <p className="text-sm text-slate-600 mb-1">ROI</p>
          <p className="text-2xl font-bold text-purple-600">{results.roi}%</p>
          <p className="text-xs text-slate-500 mt-2">5-year return</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-amber-500">
          <p className="text-sm text-slate-600 mb-1">EPC Improvement</p>
          <p className="text-2xl font-bold text-amber-600">+{results.averageEpcImprovement} grades</p>
          <p className="text-xs text-slate-500 mt-2">Average per property</p>
        </div>
      </div>

      {/* EPC Distribution Comparison */}
      <div className="bg-white rounded-xl shadow-lg p-8">
        <h3 className="text-xl font-semibold text-slate-900 mb-6">EPC Distribution</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={epcData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="rating" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
            />
            <Legend />
            <Bar dataKey="before" fill="#94a3b8" name="Before" />
            <Bar dataKey="after" fill="#3b82f6" name="After" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* CO2 Trajectory */}
      <div className="bg-white rounded-xl shadow-lg p-8">
        <h3 className="text-xl font-semibold text-slate-900 mb-6">CO2 Trajectory</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={results.co2Trajectory}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="year" stroke="#64748b" />
            <YAxis stroke="#64748b" label={{ value: 'CO2e (tonnes)', angle: -90, position: 'insideLeft' }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              formatter={(value) => `${value}T`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="baseline"
              stroke="#ef4444"
              strokeWidth={2}
              name="Baseline"
              dot={{ fill: '#ef4444' }}
            />
            <Line
              type="monotone"
              dataKey="scenario"
              stroke="#10b981"
              strokeWidth={2}
              name="Scenario"
              dot={{ fill: '#10b981' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Cost Breakdown & Radar Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Cost Breakdown */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h3 className="text-xl font-semibold text-slate-900 mb-6">Cost Breakdown</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={costData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" stroke="#64748b" />
              <YAxis dataKey="name" type="category" stroke="#64748b" width={140} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                formatter={(value) => `£${(value as number).toLocaleString()}`}
              />
              <Bar dataKey="value" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Scenario Comparison Radar */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h3 className="text-xl font-semibold text-slate-900 mb-6">Scenario Benefits</h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="metric" stroke="#64748b" />
              <PolarRadiusAxis stroke="#64748b" />
              <Radar name="Before" dataKey="before" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} />
              <Radar name="After" dataKey="after" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Property Impact Table */}
      <div className="bg-white rounded-xl shadow-lg p-8">
        <h3 className="text-xl font-semibold text-slate-900 mb-6">Property Impact</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Property</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-600">Current EPC</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-600">Projected EPC</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-600">Cost</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-600">Annual Savings</th>
              </tr>
            </thead>
            <tbody>
              {results.propertyImpact.map((impact, idx) => (
                <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td className="px-4 py-3 text-sm text-slate-900 font-medium">{impact.address}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-semibold">
                      {impact.currentEpc}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
                      {impact.projectedEpc}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                    £{impact.estimatedCost.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-green-600">
                    £{impact.estimatedSavings.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default function ScenarioPlanner() {
  const [scenarios, setScenarios] = useState<Scenario[]>(mockScenarios);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [editingScenario, setEditingScenario] = useState<Scenario | undefined>();

  const handleDeleteScenario = (id: string) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  };

  const handleRunScenario = (scenario: Scenario) => {
    // In a real app, this would call an API to run the simulation
    setScenarios((prev) =>
      prev.map((s) =>
        s.id === scenario.id
          ? {
              ...s,
              status: 'completed' as const,
              results: {
                beforeEpc: { A: 2, B: 8, C: 15, D: 28, E: 32, F: 12, G: 3 },
                afterEpc: { A: 5, B: 18, C: 28, D: 25, E: 18, F: 5, G: 1 },
                co2Trajectory: [
                  { year: 2025, baseline: 15200, scenario: 14100 },
                  { year: 2026, baseline: 15400, scenario: 13200 },
                  { year: 2027, baseline: 15600, scenario: 12100 },
                ],
                costBreakdown: {
                  labour: 12500,
                  materials: 8900,
                  equipment: 3200,
                  contingency: 2400,
                },
                propertyImpact: [
                  {
                    address: '42 Oak Street',
                    currentEpc: 'D',
                    projectedEpc: 'B',
                    estimatedCost: 14700,
                    estimatedSavings: 2800,
                  },
                  {
                    address: '156 Church Lane',
                    currentEpc: 'E',
                    projectedEpc: 'C',
                    estimatedCost: 12000,
                    estimatedSavings: 2200,
                  },
                ],
                roi: 18.5,
                totalCost: 27000,
                totalCo2Reduction: 6.3,
                averageEpcImprovement: 1.5,
              },
            }
          : s
      )
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Scenario Planner</h1>
            <p className="text-slate-600">Create and analyze retrofit scenarios for your portfolio</p>
          </div>
          <button
            onClick={() => {
              setEditingScenario(undefined);
              setShowBuilder(true);
            }}
            className="flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-semibold"
          >
            <Plus className="w-5 h-5" />
            New Scenario
          </button>
        </div>

        {/* Selected Scenario View */}
        {selectedScenario ? (
          <div>
            <button
              onClick={() => setSelectedScenario(null)}
              className="mb-6 px-4 py-2 text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-2"
            >
              ← Back to Scenarios
            </button>
            <h2 className="text-2xl font-bold text-slate-900 mb-6">{selectedScenario.name}</h2>
            <ResultsView scenario={selectedScenario} />
          </div>
        ) : (
          <div>
            {/* Scenario Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {scenarios.map((scenario) => (
                <div
                  key={scenario.id}
                  onClick={() => scenario.results && setSelectedScenario(scenario)}
                  className={scenario.results ? 'cursor-pointer' : ''}
                >
                  <ScenarioCard
                    scenario={scenario}
                    onEdit={(s) => {
                      setEditingScenario(s);
                      setShowBuilder(true);
                    }}
                    onDelete={handleDeleteScenario}
                    onRun={handleRunScenario}
                  />
                </div>
              ))}
            </div>

            {/* Empty State */}
            {scenarios.length === 0 && (
              <div className="text-center py-12">
                <Home className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600 mb-4">No scenarios created yet</p>
                <button
                  onClick={() => {
                    setEditingScenario(undefined);
                    setShowBuilder(true);
                  }}
                  className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-semibold"
                >
                  Create First Scenario
                </button>
              </div>
            )}
          </div>
        )}

        {/* Scenario Builder Modal */}
        {showBuilder && (
          <ScenarioBuilder
            onClose={() => setShowBuilder(false)}
            scenario={editingScenario}
          />
        )}
      </div>
    </div>
  );
}
