import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { AlertCircle, CheckCircle2, Clock, RefreshCw, TrendingUp, Database, Calendar, Play, Pause } from 'lucide-react';

interface OverviewCard {
  title: string;
  value: string | number;
  subtext?: string;
  icon: React.ReactNode;
  trend?: number;
}

interface ProviderStatus {
  provider: string;
  enabled: boolean;
  matchCount: number;
  matchRate: number;
  lastRun: string;
  errorRate: number;
}

interface ScheduleConfig {
  provider: string;
  interval: string;
  nextRun: string;
  lastRun: string;
  enabled: boolean;
}

interface QualityMetrics {
  overallScore: number;
  completeness: { [key: string]: number };
  freshness: { [key: string]: string };
  alerts: string[];
}

const EnrichmentDashboard: React.FC = () => {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [schedules, setSchedules] = useState<ScheduleConfig[]>([]);
  const [qualityMetrics, setQualityMetrics] = useState<QualityMetrics | null>(null);
  const [enrichmentProgress, setEnrichmentProgress] = useState<number | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [coverageData, setCoverageData] = useState<any[]>([]);
  const [epcData, setEpcData] = useState<any[]>([]);
  const [freshnessData, setFreshnessData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [statusRes, scheduleRes, qualityRes] = await Promise.all([
        fetch('/api/enrichment/provider-status'),
        fetch('/api/scheduler/status'),
        fetch('/api/enrichment/quality')
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setProviders(data.providers);
        setCoverageData(data.coverage || []);
        setEpcData(data.epcConfidence || []);
      }

      if (scheduleRes.ok) {
        const data = await scheduleRes.json();
        setSchedules(data.schedules);
      }

      if (qualityRes.ok) {
        const data = await qualityRes.json();
        setQualityMetrics(data);
        setFreshnessData(data.freshnessTimeline || []);
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setLoading(false);
    }
  };

  const handleEnrichAll = async () => {
    if (!window.confirm('Start enrichment for all properties? This may take several minutes.')) {
      return;
    }

    setIsEnriching(true);
    setEnrichmentProgress(0);

    try {
      const response = await fetch('/api/enrichment/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) throw new Error('Enrichment failed');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.progress) {
                setEnrichmentProgress(data.progress);
              }
              if (data.completed) {
                setEnrichmentProgress(100);
                setTimeout(() => {
                  setIsEnriching(false);
                  fetchDashboardData();
                }, 1500);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      console.error('Enrichment error:', error);
      setIsEnriching(false);
      alert('Enrichment failed. Check console for details.');
    }
  };

  const getHealthColor = (rate: number): string => {
    if (rate >= 90) return 'bg-green-50 border-green-200';
    if (rate >= 70) return 'bg-amber-50 border-amber-200';
    return 'bg-red-50 border-red-200';
  };

  const getHealthBadge = (rate: number): string => {
    if (rate >= 90) return 'bg-green-100 text-green-800';
    if (rate >= 70) return 'bg-amber-100 text-amber-800';
    return 'bg-red-100 text-red-800';
  };

  const getQualityColor = (score: number): string => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const totalProperties = providers.reduce((sum, p) => sum + p.matchCount, 0);
  const enrichedCount = providers.reduce((sum, p) => sum + Math.round(p.matchCount * p.matchRate / 100), 0);
  const enrichedPercent = totalProperties > 0 ? Math.round(enrichedCount / totalProperties * 100) : 0;

  const lastRun = providers.length > 0
    ? new Date(Math.max(...providers.map(p => new Date(p.lastRun).getTime()))).toLocaleString()
    : 'Never';

  const overviewCards: OverviewCard[] = [
    {
      title: 'Total Properties',
      value: totalProperties.toLocaleString(),
      icon: <Database className="w-8 h-8 text-blue-600" />
    },
    {
      title: 'Enriched Count',
      value: enrichedCount.toLocaleString(),
      subtext: `${enrichedPercent}% complete`,
      icon: <CheckCircle2 className="w-8 h-8 text-green-600" />
    },
    {
      title: 'Last Run',
      value: lastRun,
      icon: <Clock className="w-8 h-8 text-gray-600" />
    },
    {
      title: 'Data Freshness',
      value: qualityMetrics ? `${Math.round(qualityMetrics.overallScore)}%` : '—',
      icon: <TrendingUp className="w-8 h-8 text-purple-600" />
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Enrichment Dashboard</h1>
          <p className="text-gray-600">Monitor and manage property data enrichment</p>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {overviewCards.map((card, idx) => (
            <div key={idx} className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600 font-medium">{card.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{card.value}</p>
                  {card.subtext && <p className="text-xs text-gray-500 mt-1">{card.subtext}</p>}
                </div>
                <div className="opacity-80">{card.icon}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Enrich All Button */}
        <div className="mb-8">
          <button
            onClick={handleEnrichAll}
            disabled={isEnriching}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition"
          >
            {isEnriching ? <Pause className="w-5 h-5" /> : <RefreshCw className="w-5 h-5" />}
            {isEnriching ? 'Enrichment in Progress' : 'Enrich All Properties'}
          </button>

          {isEnriching && enrichmentProgress !== null && (
            <div className="mt-4 bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Progress</span>
                <span className="text-sm font-bold text-gray-900">{enrichmentProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${enrichmentProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Provider Status Table */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Provider Status</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Provider</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Enabled</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Match Count</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Match Rate</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Error Rate</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Last Run</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Health</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <tr key={provider.provider} className={`border-b border-gray-100 ${getHealthColor(provider.matchRate)}`}>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{provider.provider}</td>
                    <td className="px-6 py-4 text-sm">
                      <input
                        type="checkbox"
                        checked={provider.enabled}
                        onChange={() => {}}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{provider.matchCount.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{provider.matchRate.toFixed(1)}%</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{provider.errorRate.toFixed(1)}%</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(provider.lastRun).toLocaleDateString()} {new Date(provider.lastRun).toLocaleTimeString()}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${getHealthBadge(provider.matchRate)}`}>
                        {provider.matchRate >= 90 ? 'Healthy' : provider.matchRate >= 70 ? 'Warning' : 'Critical'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Data Quality Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Coverage Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Coverage by Source</h3>
            {coverageData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={coverageData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="source" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="coverage" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-center py-12">No data available</p>
            )}
          </div>

          {/* EPC Confidence */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">EPC Match Confidence</h3>
            {epcData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={epcData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="confidence" type="category" width={80} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-center py-12">No data available</p>
            )}
          </div>
        </div>

        {/* Quality Metrics and Freshness */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Quality Score Gauge */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Overall Quality Score</h3>
            {qualityMetrics && (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="relative w-32 h-32 mb-4">
                  <svg className="w-full h-full" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke={getQualityColor(qualityMetrics.overallScore).replace('text-', '')}
                      strokeWidth="8"
                      strokeDasharray={`${(qualityMetrics.overallScore / 100) * 283} 283`}
                      transform="rotate(-90 50 50)"
                      className="transition-all duration-500"
                    />
                    <text x="50" y="50" textAnchor="middle" dy="0.3em" className="text-2xl font-bold fill-gray-900">
                      {Math.round(qualityMetrics.overallScore)}
                    </text>
                  </svg>
                </div>
                <p className={`text-lg font-semibold ${getQualityColor(qualityMetrics.overallScore)}`}>
                  {qualityMetrics.overallScore >= 80 ? 'Excellent' : qualityMetrics.overallScore >= 60 ? 'Good' : 'Needs Improvement'}
                </p>
              </div>
            )}
          </div>

          {/* Freshness Timeline */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Freshness Timeline</h3>
            {freshnessData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={freshnessData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="freshness" stroke="#3b82f6" name="Freshness %" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-center py-12">No data available</p>
            )}
          </div>
        </div>

        {/* Scheduling Panel */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Enrichment Schedule</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {schedules.map((schedule) => (
              <div key={schedule.provider} className="px-6 py-4 hover:bg-gray-50 transition">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{schedule.provider}</h3>
                    <div className="grid grid-cols-2 gap-4 mt-2 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">Interval:</span> {schedule.interval}
                      </div>
                      <div>
                        <span className="font-medium">Next Run:</span>{' '}
                        {new Date(schedule.nextRun).toLocaleString()}
                      </div>
                      <div>
                        <span className="font-medium">Last Run:</span>{' '}
                        {new Date(schedule.lastRun).toLocaleString()}
                      </div>
                      <div>
                        <span className="font-medium">Status:</span>{' '}
                        <span className={schedule.enabled ? 'text-green-600' : 'text-gray-500'}>
                          {schedule.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-2 rounded text-sm font-medium transition">
                      <Play className="w-4 h-4 inline mr-1" /> Trigger
                    </button>
                    <button className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded text-sm font-medium transition">
                      {schedule.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quality Alerts */}
        {qualityMetrics && qualityMetrics.alerts.length > 0 && (
          <div className="bg-white rounded-lg shadow border-l-4 border-red-500">
            <div className="px-6 py-4">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Active Alerts</h3>
                  <ul className="space-y-1">
                    {qualityMetrics.alerts.map((alert, idx) => (
                      <li key={idx} className="text-sm text-gray-700">
                        • {alert}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnrichmentDashboard;
