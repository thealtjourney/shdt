import React, { useState } from 'react';
import {
  Flame,
  Droplets,
  Zap,
  Wind,
  Home,
  AlertCircle,
  Clock,
  CheckCircle,
  AlertTriangle,
  Calendar,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

interface PropertyData {
  address: string;
  epc: string;
  healthScore: number;
  riskFlags: string[];
  components: ComponentItem[];
  maintenanceHistory: MaintenanceRecord[];
}

interface ComponentItem {
  id: string;
  name: string;
  category: 'Structure' | 'Envelope' | 'Services' | 'Internal';
  icon: React.ReactNode;
  installDate: string;
  age: number;
  condition: number; // 1-5
  failureProbability: number;
  remainingLife: number; // years
  lastMaintained: string;
  maintenanceStatus: 'compliant' | 'due' | 'overdue';
  area?: string; // for building schematic
}

interface MaintenanceRecord {
  date: string;
  component: string;
  type: string;
  status: 'completed' | 'scheduled' | 'cancelled';
  cost?: number;
}

// Mock data
const mockPropertyData: PropertyData = {
  address: '42 Oak Street, Manchester, M1 1AB',
  epc: 'D',
  healthScore: 72,
  riskFlags: ['Boiler nearing end of life', 'Roof needs inspection', 'Windows poor seal'],
  components: [
    {
      id: '1',
      name: 'Gas Boiler',
      category: 'Services',
      icon: <Flame className="w-5 h-5" />,
      installDate: '2006-03-15',
      age: 20,
      condition: 4,
      failureProbability: 0.92,
      remainingLife: 1,
      lastMaintained: '2024-11-20',
      maintenanceStatus: 'overdue',
      area: 'boiler',
    },
    {
      id: '2',
      name: 'Roof Covering',
      category: 'Structure',
      icon: <Home className="w-5 h-5" />,
      installDate: '2004-06-10',
      age: 22,
      condition: 4,
      failureProbability: 0.87,
      remainingLife: 3,
      lastMaintained: '2023-08-15',
      maintenanceStatus: 'due',
      area: 'roof',
    },
    {
      id: '3',
      name: 'Double Glazed Windows',
      category: 'Envelope',
      icon: <Wind className="w-5 h-5" />,
      installDate: '2010-09-22',
      age: 16,
      condition: 3,
      failureProbability: 0.45,
      remainingLife: 9,
      lastMaintained: '2024-09-10',
      maintenanceStatus: 'compliant',
      area: 'windows',
    },
    {
      id: '4',
      name: 'Central Heating Pipes',
      category: 'Services',
      icon: <Droplets className="w-5 h-5" />,
      installDate: '2008-05-12',
      age: 18,
      condition: 3,
      failureProbability: 0.38,
      remainingLife: 7,
      lastMaintained: '2023-12-05',
      maintenanceStatus: 'compliant',
      area: 'plumbing',
    },
    {
      id: '5',
      name: 'Electrical Installation',
      category: 'Services',
      icon: <Zap className="w-5 h-5" />,
      installDate: '2010-02-14',
      age: 16,
      condition: 2,
      failureProbability: 0.22,
      remainingLife: 14,
      lastMaintained: '2024-02-28',
      maintenanceStatus: 'compliant',
      area: 'electrics',
    },
    {
      id: '6',
      name: 'Wall Insulation',
      category: 'Envelope',
      icon: <Wind className="w-5 h-5" />,
      installDate: '2015-07-08',
      age: 11,
      condition: 2,
      failureProbability: 0.15,
      remainingLife: 19,
      lastMaintained: '2023-09-20',
      maintenanceStatus: 'compliant',
      area: 'insulation',
    },
    {
      id: '7',
      name: 'Kitchen Appliances',
      category: 'Internal',
      icon: <Flame className="w-5 h-5" />,
      installDate: '2018-11-03',
      age: 8,
      condition: 2,
      failureProbability: 0.18,
      remainingLife: 12,
      lastMaintained: '2024-05-15',
      maintenanceStatus: 'compliant',
      area: 'kitchen',
    },
    {
      id: '8',
      name: 'Bathroom Suite',
      category: 'Internal',
      icon: <Droplets className="w-5 h-5" />,
      installDate: '2012-03-20',
      age: 14,
      condition: 3,
      failureProbability: 0.32,
      remainingLife: 11,
      lastMaintained: '2024-01-10',
      maintenanceStatus: 'compliant',
      area: 'bathroom',
    },
  ],
  maintenanceHistory: [
    {
      date: '2024-11-20',
      component: 'Gas Boiler',
      type: 'Service & inspection',
      status: 'completed',
      cost: 180,
    },
    {
      date: '2024-09-10',
      component: 'Double Glazed Windows',
      type: 'Frame cleaning & seal check',
      status: 'completed',
      cost: 150,
    },
    {
      date: '2024-05-15',
      component: 'Kitchen Appliances',
      type: 'Oven service',
      status: 'completed',
      cost: 95,
    },
    {
      date: '2025-02-28',
      component: 'Electrical Installation',
      type: 'Safety inspection',
      status: 'scheduled',
    },
    {
      date: '2025-03-15',
      component: 'Roof Covering',
      type: 'Full inspection & minor repairs',
      status: 'scheduled',
      cost: 1200,
    },
  ],
};

const getConditionColor = (value: number): string => {
  if (value <= 1) return '#10b981'; // green
  if (value <= 2) return '#84cc16'; // lime
  if (value <= 3) return '#f59e0b'; // amber
  if (value <= 4) return '#f97316'; // orange
  return '#ef4444'; // red
};

const getMaintenanceStatusColor = (
  status: 'compliant' | 'due' | 'overdue'
): { bg: string; text: string; icon: React.ReactNode } => {
  switch (status) {
    case 'compliant':
      return {
        bg: 'bg-green-100',
        text: 'text-green-800',
        icon: <CheckCircle className="w-4 h-4" />,
      };
    case 'due':
      return {
        bg: 'bg-yellow-100',
        text: 'text-yellow-800',
        icon: <AlertTriangle className="w-4 h-4" />,
      };
    case 'overdue':
      return {
        bg: 'bg-red-100',
        text: 'text-red-800',
        icon: <AlertCircle className="w-4 h-4" />,
      };
  }
};

const BuildingSchematic: React.FC<{ components: ComponentItem[] }> = ({ components }) => {
  const [selectedArea, setSelectedArea] = useState<string | null>(null);

  const getAreaColor = (area: string): string => {
    const component = components.find((c) => c.area === area);
    if (!component) return '#e2e8f0';
    return getConditionColor(component.condition);
  };

  const getAreaPulse = (area: string): boolean => {
    const component = components.find((c) => c.area === area);
    if (!component) return false;
    return component.failureProbability > 0.7;
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-8">
      <h3 className="text-xl font-semibold text-slate-900 mb-6">Building Schematic</h3>

      <svg
        viewBox="0 0 500 400"
        className="w-full max-w-2xl mx-auto"
        style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}
      >
        {/* Building outline */}
        <rect x="50" y="80" width="400" height="280" fill="#f8fafc" stroke="#64748b" strokeWidth="2" />

        {/* Roof */}
        <polygon
          points="50,80 250,20 450,80"
          fill={getAreaColor('roof')}
          stroke="#64748b"
          strokeWidth="2"
          className={`transition-opacity cursor-pointer ${getAreaPulse('roof') ? 'opacity-80 animate-pulse' : ''}`}
          onClick={() => setSelectedArea('roof')}
          style={{ opacity: getAreaPulse('roof') ? 0.8 : 1 }}
        />

        {/* Left wall */}
        <rect
          x="50"
          y="80"
          width="1"
          height="280"
          fill={getAreaColor('walls')}
          stroke="#64748b"
          strokeWidth="2"
        />

        {/* Right wall */}
        <rect
          x="449"
          y="80"
          width="1"
          height="280"
          fill={getAreaColor('walls')}
          stroke="#64748b"
          strokeWidth="2"
        />

        {/* Ground floor - Left section (Boiler/Kitchen) */}
        <rect
          x="60"
          y="220"
          width="170"
          height="130"
          fill={getAreaColor('boiler')}
          stroke="#94a3b8"
          strokeWidth="1.5"
          opacity="0.6"
          className={`transition-opacity cursor-pointer hover:opacity-80 ${getAreaPulse('boiler') ? 'animate-pulse' : ''}`}
          onClick={() => setSelectedArea('boiler')}
        />

        {/* Boiler label and icon */}
        <circle cx="95" cy="260" r="20" fill="#fff" stroke="#64748b" strokeWidth="1.5" />
        <text x="95" y="265" textAnchor="middle" className="text-sm font-bold fill-slate-900">
          🔥
        </text>
        <text x="95" y="310" textAnchor="middle" className="text-xs font-semibold fill-slate-700">
          Boiler
        </text>

        {/* Kitchen section */}
        <rect
          x="60"
          y="220"
          width="85"
          height="65"
          fill={getAreaColor('kitchen')}
          stroke="#94a3b8"
          strokeWidth="1.5"
          opacity="0.5"
          className={`transition-opacity cursor-pointer hover:opacity-80 ${getAreaPulse('kitchen') ? 'animate-pulse' : ''}`}
          onClick={() => setSelectedArea('kitchen')}
        />
        <text x="102" y="275" textAnchor="middle" className="text-xs font-semibold fill-slate-700">
          Kitchen
        </text>

        {/* Ground floor - Right section (Bathroom) */}
        <rect
          x="270"
          y="220"
          width="170"
          height="130"
          fill={getAreaColor('bathroom')}
          stroke="#94a3b8"
          strokeWidth="1.5"
          opacity="0.6"
          className={`transition-opacity cursor-pointer hover:opacity-80 ${getAreaPulse('bathroom') ? 'animate-pulse' : ''}`}
          onClick={() => setSelectedArea('bathroom')}
        />

        {/* Bathroom label */}
        <circle cx="355" cy="275" r="18" fill="#fff" stroke="#64748b" strokeWidth="1.5" />
        <text x="355" y="280" textAnchor="middle" className="text-sm font-bold fill-slate-900">
          🚿
        </text>
        <text x="355" y="320" textAnchor="middle" className="text-xs font-semibold fill-slate-700">
          Bathroom
        </text>

        {/* First floor - Left (Plumbing) */}
        <rect
          x="60"
          y="120"
          width="85"
          height="100"
          fill={getAreaColor('plumbing')}
          stroke="#94a3b8"
          strokeWidth="1.5"
          opacity="0.5"
          className={`transition-opacity cursor-pointer hover:opacity-80 ${getAreaPulse('plumbing') ? 'animate-pulse' : ''}`}
          onClick={() => setSelectedArea('plumbing')}
        />
        <text x="102" y="175" textAnchor="middle" className="text-xs font-semibold fill-slate-700">
          Pipes
        </text>

        {/* First floor - Center (Living room/Insulation) */}
        <rect
          x="155"
          y="120"
          width="190"
          height="100"
          fill={getAreaColor('insulation')}
          stroke="#94a3b8"
          strokeWidth="1.5"
          opacity="0.4"
          className={`transition-opacity cursor-pointer hover:opacity-80 ${getAreaPulse('insulation') ? 'animate-pulse' : ''}`}
          onClick={() => setSelectedArea('insulation')}
        />
        <text x="250" y="175" textAnchor="middle" className="text-xs font-semibold fill-slate-700">
          Living Area
        </text>

        {/* First floor - Right (Electrics) */}
        <rect
          x="355"
          y="120"
          width="85"
          height="100"
          fill={getAreaColor('electrics')}
          stroke="#94a3b8"
          strokeWidth="1.5"
          opacity="0.5"
          className={`transition-opacity cursor-pointer hover:opacity-80 ${getAreaPulse('electrics') ? 'animate-pulse' : ''}`}
          onClick={() => setSelectedArea('electrics')}
        />
        <text x="397" y="175" textAnchor="middle" className="text-xs font-semibold fill-slate-700">
          Electrics
        </text>

        {/* Windows - Left */}
        <rect
          x="80"
          y="160"
          width="35"
          height="35"
          fill={getAreaColor('windows')}
          stroke="#64748b"
          strokeWidth="2"
          className={`transition-opacity cursor-pointer hover:opacity-80 ${getAreaPulse('windows') ? 'animate-pulse' : ''}`}
          onClick={() => setSelectedArea('windows')}
        />

        {/* Windows - Center */}
        <rect
          x="230"
          y="160"
          width="40"
          height="35"
          fill={getAreaColor('windows')}
          stroke="#64748b"
          strokeWidth="2"
          className={`transition-opacity cursor-pointer hover:opacity-80 ${getAreaPulse('windows') ? 'animate-pulse' : ''}`}
          onClick={() => setSelectedArea('windows')}
        />

        {/* Windows - Right */}
        <rect
          x="385"
          y="160"
          width="35"
          height="35"
          fill={getAreaColor('windows')}
          stroke="#64748b"
          strokeWidth="2"
          className={`transition-opacity cursor-pointer hover:opacity-80 ${getAreaPulse('windows') ? 'animate-pulse' : ''}`}
          onClick={() => setSelectedArea('windows')}
        />

        {/* Window labels */}
        <text x="98" y="182" textAnchor="middle" className="text-xs font-semibold fill-white">
          ◻
        </text>
        <text x="250" y="182" textAnchor="middle" className="text-xs font-semibold fill-white">
          ◻◻
        </text>
        <text x="402" y="182" textAnchor="middle" className="text-xs font-semibold fill-white">
          ◻
        </text>
      </svg>

      {/* Legend */}
      <div className="mt-8 grid grid-cols-5 gap-4 text-center text-sm">
        {[
          { label: 'Excellent', color: '#10b981' },
          { label: 'Good', color: '#84cc16' },
          { label: 'Fair', color: '#f59e0b' },
          { label: 'Poor', color: '#f97316' },
          { label: 'Critical', color: '#ef4444' },
        ].map((item) => (
          <div key={item.label} className="flex flex-col items-center gap-2">
            <div
              className="w-6 h-6 rounded border border-slate-300"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-slate-600">{item.label}</span>
          </div>
        ))}
      </div>

      {selectedArea && (
        <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <p className="text-sm text-slate-600">
            Selected: <span className="font-semibold text-slate-900 capitalize">{selectedArea}</span>
          </p>
        </div>
      )}
    </div>
  );
};

const ComponentCard: React.FC<{ component: ComponentItem; expanded?: boolean }> = ({ component, expanded }) => {
  const statusColors = getMaintenanceStatusColor(component.maintenanceStatus);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-md transition">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1">
          <div className="mt-1 text-slate-600">{component.icon}</div>
          <div>
            <h4 className="font-semibold text-slate-900">{component.name}</h4>
            <p className="text-xs text-slate-600">{component.category}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${statusColors.bg}`}>
          {statusColors.icon}
          <span className={`text-xs font-semibold ${statusColors.text}`}>
            {component.maintenanceStatus.charAt(0).toUpperCase() + component.maintenanceStatus.slice(1)}
          </span>
        </div>
      </div>

      <div className="space-y-3 text-sm">
        {/* Install Date & Age */}
        <div className="flex items-center justify-between">
          <span className="text-slate-600">Install Date:</span>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="font-medium text-slate-900">
              {new Date(component.installDate).getFullYear()}
            </span>
            <span className="text-slate-600">({component.age} yrs)</span>
          </div>
        </div>

        {/* Condition Bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-600">Condition:</span>
            <span className="font-semibold text-slate-900">{component.condition}/5</span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(component.condition / 5) * 100}%`,
                backgroundColor: getConditionColor(component.condition),
              }}
            />
          </div>
        </div>

        {/* Failure Probability Gauge */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-600">Failure Probability:</span>
            <span className="font-semibold text-slate-900">{(component.failureProbability * 100).toFixed(0)}%</span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition"
              style={{
                width: `${component.failureProbability * 100}%`,
                backgroundColor:
                  component.failureProbability < 0.3
                    ? '#10b981'
                    : component.failureProbability < 0.6
                      ? '#f59e0b'
                      : '#ef4444',
              }}
            />
          </div>
        </div>

        {/* Remaining Life */}
        <div className="flex items-center justify-between">
          <span className="text-slate-600">Remaining Life:</span>
          <span className="font-semibold text-slate-900">{component.remainingLife} years</span>
        </div>

        {/* Last Maintained */}
        <div className="flex items-center justify-between">
          <span className="text-slate-600">Last Maintained:</span>
          <span className="font-medium text-slate-900">
            {new Date(component.lastMaintained).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
};

const ComponentTimeline: React.FC<{ components: ComponentItem[] }> = ({ components }) => {
  const today = new Date();
  const startYear = Math.min(...components.map((c) => new Date(c.installDate).getFullYear()));
  const endYear = Math.max(
    ...components.map((c) => new Date(c.installDate).getFullYear() + c.age + c.remainingLife)
  );

  const timelineWidth = endYear - startYear;

  return (
    <div className="bg-white rounded-xl shadow-lg p-8">
      <h3 className="text-xl font-semibold text-slate-900 mb-6">Component Lifecycle Timeline</h3>

      <div className="space-y-4 relative">
        {/* Year markers */}
        <div className="flex justify-between text-xs text-slate-600 px-4 mb-6">
          {Array.from({ length: timelineWidth + 1 }, (_, i) => startYear + i).map((year) => (
            <span key={year} className="flex-1 text-center">
              {year}
            </span>
          ))}
        </div>

        {/* Current date marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none"
          style={{
            left: `calc(${((today.getFullYear() - startYear + (today.getMonth() / 12)) / timelineWidth) * 100}% + 1rem)`,
          }}
        >
          <span className="absolute -top-6 -left-8 text-xs font-semibold text-red-600 whitespace-nowrap">
            Today
          </span>
        </div>

        {/* Component bars */}
        {components.map((component) => {
          const installYear = new Date(component.installDate).getFullYear();
          const startPercent = ((installYear - startYear) / timelineWidth) * 100;
          const lifePercent = ((component.age + component.remainingLife) / timelineWidth) * 100;

          return (
            <div key={component.id} className="flex items-center gap-4">
              <div className="w-32 text-sm font-medium text-slate-700 truncate">{component.name}</div>
              <div className="flex-1 relative h-8 bg-slate-100 rounded-lg overflow-hidden">
                <div
                  className="absolute h-full rounded-lg transition-colors flex items-center justify-center text-xs font-semibold text-white"
                  style={{
                    left: `${startPercent}%`,
                    width: `${lifePercent}%`,
                    backgroundColor: getConditionColor(component.condition),
                  }}
                >
                  {lifePercent > 15 && `${component.age}yr`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MaintenanceHistoryFeed: React.FC<{ history: MaintenanceRecord[] }> = ({ history }) => {
  return (
    <div className="bg-white rounded-xl shadow-lg p-8">
      <h3 className="text-xl font-semibold text-slate-900 mb-6">Maintenance History</h3>

      <div className="space-y-4">
        {history.map((record, idx) => {
          const isCompleted = record.status === 'completed';
          const isPast = new Date(record.date) < new Date();

          return (
            <div
              key={idx}
              className={`flex gap-4 p-4 rounded-lg border transition ${
                isCompleted
                  ? 'bg-green-50 border-green-200'
                  : isPast
                    ? 'bg-orange-50 border-orange-200'
                    : 'bg-blue-50 border-blue-200'
              }`}
            >
              <div className="flex-shrink-0 mt-1">
                {isCompleted ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : isPast ? (
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                ) : (
                  <Clock className="w-5 h-5 text-blue-600" />
                )}
              </div>

              <div className="flex-1">
                <div className="flex items-start justify-between mb-1">
                  <h4 className="font-semibold text-slate-900">{record.component}</h4>
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      isCompleted
                        ? 'bg-green-200 text-green-800'
                        : isPast
                          ? 'bg-orange-200 text-orange-800'
                          : 'bg-blue-200 text-blue-800'
                    }`}
                  >
                    {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                  </span>
                </div>
                <p className="text-sm text-slate-700 mb-2">{record.type}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{new Date(record.date).toLocaleDateString()}</span>
                  {record.cost && <span className="font-semibold text-slate-900">£{record.cost.toLocaleString()}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function PropertyTwinView() {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Services']));

  const toggleCategory = (category: string) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(category)) {
      newSet.delete(category);
    } else {
      newSet.add(category);
    }
    setExpandedCategories(newSet);
  };

  const categories = ['Structure', 'Envelope', 'Services', 'Internal'] as const;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 space-y-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Property Digital Twin</h1>
          <p className="text-slate-600 text-lg">{mockPropertyData.address}</p>
        </div>

        {/* Property Health Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Health Score Ring */}
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-6">Health Score</h3>
            <div className="flex items-center justify-center">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="8"
                    strokeDasharray={`${(mockPropertyData.healthScore / 100) * 282.7} 282.7`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-3xl font-bold text-slate-900">{mockPropertyData.healthScore}</div>
                  <div className="text-xs text-slate-600">/ 100</div>
                </div>
              </div>
            </div>
          </div>

          {/* EPC Badge */}
          <div className="bg-white rounded-xl shadow-lg p-8 flex flex-col items-center justify-center">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Energy Rating</h3>
            <div className="flex gap-2 text-2xl font-bold">
              {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((letter) => (
                <div
                  key={letter}
                  className={`w-12 h-12 rounded-lg flex items-center justify-center transition ${
                    letter === mockPropertyData.epc
                      ? 'bg-amber-500 text-white ring-2 ring-amber-600'
                      : letter < mockPropertyData.epc
                        ? 'bg-green-200 text-green-900'
                        : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {letter}
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-slate-600 text-center">Current rating: <span className="font-semibold">{mockPropertyData.epc}</span></p>
          </div>

          {/* Risk Flags */}
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Risk Flags</h3>
            <div className="space-y-2">
              {mockPropertyData.riskFlags.map((flag, idx) => (
                <div key={idx} className="flex items-start gap-2 p-2 bg-red-50 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-red-900">{flag}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Building Schematic */}
        <BuildingSchematic components={mockPropertyData.components} />

        {/* Components by Category */}
        <div className="space-y-4 mb-8">
          {categories.map((category) => {
            const categoryComponents = mockPropertyData.components.filter((c) => c.category === category);
            const isExpanded = expandedCategories.has(category);

            return (
              <div key={category} className="bg-white rounded-xl shadow-lg overflow-hidden">
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full px-8 py-4 flex items-center justify-between hover:bg-slate-50 transition"
                >
                  <h3 className="text-lg font-semibold text-slate-900">{category}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600">{categoryComponents.length} components</span>
                    <span className={`transform transition ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-8 pb-6 pt-2 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {categoryComponents.map((component) => (
                      <ComponentCard key={component.id} component={component} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Component Timeline */}
        <ComponentTimeline components={mockPropertyData.components} />

        {/* Maintenance History */}
        <MaintenanceHistoryFeed history={mockPropertyData.maintenanceHistory} />
      </div>
    </div>
  );
}
