import React, { useState, useEffect } from 'react';
import {
  Upload,
  Database,
  BarChart3,
  Users,
  ArrowRight,
  Download,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
} from 'lucide-react';
import DataUploadModal from '../components/DataUploadModal';
import SetupWizard from '../components/SetupWizard';
import Navigation from '../components/Navigation';
import { Button } from '../components/ui/Button';

interface PipelineStatus {
  properties: 'complete' | 'in_progress' | 'pending';
  maintenance: 'complete' | 'in_progress' | 'pending';
  enrichment: 'complete' | 'in_progress' | 'pending';
  digital_twin: 'complete' | 'in_progress' | 'pending';
}

interface DataStats {
  properties: {
    total: number;
    geocoded_percentage: number;
    fields: number;
  };
  maintenance: {
    records: number;
    matched_percentage: number;
    needs_review: number;
  };
  enrichment: {
    coverage_percentage: number;
    sources_active: number;
  };
  tenants: {
    total: number;
    consent: number;
    active: number;
  };
}

interface Activity {
  id: string;
  timestamp: string;
  action: string;
  status: 'success' | 'pending' | 'error';
  details: string;
}

const DataHub: React.FC = () => {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>({
    properties: 'pending',
    maintenance: 'pending',
    enrichment: 'pending',
    digital_twin: 'pending',
  });
  const [stats, setStats] = useState<DataStats>({
    properties: { total: 0, geocoded_percentage: 0, fields: 0 },
    maintenance: { records: 0, matched_percentage: 0, needs_review: 0 },
    enrichment: { coverage_percentage: 0, sources_active: 0 },
    tenants: { total: 0, consent: 0, active: 0 },
  });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isFirstTime, setIsFirstTime] = useState(false);

  useEffect(() => {
    fetchPipelineStatus();
    fetchStats();
    fetchActivities();
    checkFirstTime();
  }, []);

  const checkFirstTime = async () => {
    try {
      const response = await fetch('/api/data-hub/status');
      const data = await response.json();
      if (!data.has_data) {
        setIsFirstTime(true);
        setShowWizard(true);
      }
    } catch (error) {
      console.error('Failed to check first time setup:', error);
    }
  };

  const fetchPipelineStatus = async () => {
    try {
      const response = await fetch('/api/data-hub/status');
      const data = await response.json();
      setPipelineStatus(data.pipeline_status);
    } catch (error) {
      console.error('Failed to fetch pipeline status:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/data-hub/status');
      const data = await response.json();
      setStats(data.stats);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const fetchActivities = async () => {
    try {
      const response = await fetch('/api/data-hub/activities');
      const data = await response.json();
      setActivities(data.activities || []);
    } catch (error) {
      console.error('Failed to fetch activities:', error);
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'complete':
        return 'bg-green-500';
      case 'in_progress':
        return 'bg-amber-400';
      case 'pending':
        return 'bg-gray-300';
      default:
        return 'bg-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'in_progress':
        return <Clock className="w-5 h-5 text-amber-600 animate-spin" />;
      case 'pending':
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
      default:
        return null;
    }
  };

  const handleDownloadTemplate = async (dataType: string) => {
    try {
      const response = await fetch(`/api/data-hub/templates/${dataType}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dataType}_template.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download template:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Navigation />
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 mb-2">Data hub</h1>
              <p className="text-slate-600">Manage your property data, maintenance records, and digital twin</p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => fetchPipelineStatus()}
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </Button>
              <Button
                onClick={() => setShowWizard(true)}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Database className="w-4 h-4" />
                Setup Guide
              </Button>
            </div>
          </div>

          {/* Pipeline Progress Bar */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">Pipeline Progress</p>
            <div className="flex gap-2 h-2">
              <div className={`flex-1 rounded-full ${getStatusColor(pipelineStatus.properties)} transition-all`} />
              <div className={`flex-1 rounded-full ${getStatusColor(pipelineStatus.maintenance)} transition-all`} />
              <div className={`flex-1 rounded-full ${getStatusColor(pipelineStatus.enrichment)} transition-all`} />
              <div className={`flex-1 rounded-full ${getStatusColor(pipelineStatus.digital_twin)} transition-all`} />
            </div>
            <div className="flex justify-between text-xs text-slate-600 mt-1">
              <span>Properties</span>
              <span>Maintenance</span>
              <span>Enrichment</span>
              <span>Digital Twin</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Data Source Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Property Data Card */}
          <div className="bg-white rounded-lg border border-slate-200 hover:border-blue-300 hover:shadow-lg transition-all p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Database className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">Property Data</h3>
                <span className="inline-block mt-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded">
                  Step 1 - Required
                </span>
              </div>
              {getStatusIcon(pipelineStatus.properties)}
            </div>

            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setActiveCard('properties');
                    setShowUploadModal(true);
                  }}
                  className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  <Upload className="w-4 h-4" />
                  {stats.properties.total > 0 ? 'Re-import' : 'Upload CSV'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleDownloadTemplate('properties')}
                  className="gap-2"
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-slate-50 rounded p-3">
                  <p className="text-slate-600 text-xs mb-1">Total</p>
                  <p className="font-bold text-slate-900">{stats.properties.total}</p>
                </div>
                <div className="bg-slate-50 rounded p-3">
                  <p className="text-slate-600 text-xs mb-1">Geocoded</p>
                  <p className="font-bold text-slate-900">{stats.properties.geocoded_percentage}%</p>
                </div>
                <div className="bg-slate-50 rounded p-3">
                  <p className="text-slate-600 text-xs mb-1">Fields</p>
                  <p className="font-bold text-slate-900">{stats.properties.fields}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Maintenance History Card */}
          <div className="bg-white rounded-lg border border-slate-200 hover:border-amber-300 hover:shadow-lg transition-all p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-amber-100 rounded-lg">
                <BarChart3 className="w-6 h-6 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">Maintenance History</h3>
                <span className="inline-block mt-1 px-2 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded">
                  Step 2 - Recommended
                </span>
              </div>
              {getStatusIcon(pipelineStatus.maintenance)}
            </div>

            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setActiveCard('maintenance');
                    setShowUploadModal(true);
                  }}
                  className="flex-1 gap-2 bg-amber-600 hover:bg-amber-700"
                >
                  <Upload className="w-4 h-4" />
                  {stats.maintenance.records > 0 ? 'Re-import' : 'Upload CSV'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleDownloadTemplate('maintenance')}
                  className="gap-2"
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-slate-50 rounded p-3">
                  <p className="text-slate-600 text-xs mb-1">Records</p>
                  <p className="font-bold text-slate-900">{stats.maintenance.records}</p>
                </div>
                <div className="bg-slate-50 rounded p-3">
                  <p className="text-slate-600 text-xs mb-1">Matched</p>
                  <p className="font-bold text-slate-900">{stats.maintenance.matched_percentage}%</p>
                </div>
                <div className="bg-slate-50 rounded p-3">
                  <p className="text-slate-600 text-xs mb-1">Review</p>
                  <p className="font-bold text-slate-900">{stats.maintenance.needs_review}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Open Data Enrichment Card */}
          <div className="bg-white rounded-lg border border-slate-200 hover:border-green-300 hover:shadow-lg transition-all p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <BarChart3 className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">Open Data Enrichment</h3>
                <span className="inline-block mt-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded">
                  Step 3 - Automatic
                </span>
              </div>
              {getStatusIcon(pipelineStatus.enrichment)}
            </div>

            <div className="space-y-4">
              <Button
                onClick={() => {
                  // Trigger enrichment
                  fetchPipelineStatus();
                }}
                className="w-full gap-2 bg-green-600 hover:bg-green-700"
              >
                <RefreshCw className="w-4 h-4" />
                Run enrichment now
              </Button>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Coverage</span>
                  <span className="font-bold text-slate-900">{stats.enrichment.coverage_percentage}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${stats.enrichment.coverage_percentage}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500">{stats.enrichment.sources_active} sources active</p>
              </div>
            </div>
          </div>

          {/* Tenant Data Card */}
          <div className="bg-white rounded-lg border border-slate-200 hover:border-slate-400 hover:shadow-lg transition-all p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-slate-100 rounded-lg">
                <Users className="w-6 h-6 text-slate-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">Tenant Data</h3>
                <span className="inline-block mt-1 px-2 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded">
                  Step 4 - Optional
                </span>
              </div>
              {getStatusIcon(pipelineStatus.digital_twin)}
            </div>

            <div className="space-y-4">
              <Button
                onClick={() => {
                  setActiveCard('tenants');
                  setShowUploadModal(true);
                }}
                className="w-full gap-2 bg-slate-600 hover:bg-slate-700"
              >
                <Upload className="w-4 h-4" />
                {stats.tenants.total > 0 ? 'Update Tenants' : 'Import Tenants'}
              </Button>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-slate-50 rounded p-3">
                  <p className="text-slate-600 text-xs mb-1">Total</p>
                  <p className="font-bold text-slate-900">{stats.tenants.total}</p>
                </div>
                <div className="bg-slate-50 rounded p-3">
                  <p className="text-slate-600 text-xs mb-1">Consent</p>
                  <p className="font-bold text-slate-900">{stats.tenants.consent}</p>
                </div>
                <div className="bg-slate-50 rounded p-3">
                  <p className="text-slate-600 text-xs mb-1">Active</p>
                  <p className="font-bold text-slate-900">{stats.tenants.active}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section: Activity and Quality Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Activity Feed */}
          <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Activity</h2>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {activities.length > 0 ? (
                activities.slice(0, 10).map((activity) => (
                  <div key={activity.id} className="flex gap-3 pb-3 border-b border-slate-100 last:border-0">
                    <div className="pt-1">
                      {activity.status === 'success' && (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      )}
                      {activity.status === 'pending' && (
                        <Clock className="w-5 h-5 text-amber-600 animate-spin" />
                      )}
                      {activity.status === 'error' && (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900">{activity.action}</p>
                      <p className="text-sm text-slate-600 truncate">{activity.details}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(activity.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-slate-500 text-center py-8">No activities yet</p>
              )}
            </div>
          </div>

          {/* Data Quality Summary */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Quality Summary</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600">Data Completeness</span>
                  <span className="font-bold text-slate-900">
                    {Math.round(
                      (stats.properties.total > 0 ? stats.properties.geocoded_percentage : 0) +
                        (stats.maintenance.records > 0 ? stats.maintenance.matched_percentage : 0)
                    ) / 2}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{
                      width: `${
                        Math.round(
                          (stats.properties.total > 0 ? stats.properties.geocoded_percentage : 0) +
                            (stats.maintenance.records > 0 ? stats.maintenance.matched_percentage : 0)
                        ) / 2
                      }%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600">Enrichment Coverage</span>
                  <span className="font-bold text-slate-900">{stats.enrichment.coverage_percentage}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${stats.enrichment.coverage_percentage}%` }}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <p className="text-xs text-slate-600 mb-2">Last updated</p>
                <p className="font-mono text-sm text-slate-900">
                  {activities.length > 0
                    ? new Date(activities[0].timestamp).toLocaleString()
                    : 'Never'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <DataUploadModal
          dataType={activeCard || 'properties'}
          onClose={() => {
            setShowUploadModal(false);
            setActiveCard(null);
            fetchPipelineStatus();
            fetchStats();
            fetchActivities();
          }}
        />
      )}

      {/* Setup Wizard */}
      {showWizard && (
        <SetupWizard
          onClose={() => {
            setShowWizard(false);
            setIsFirstTime(false);
            fetchPipelineStatus();
            fetchStats();
            fetchActivities();
          }}
        />
      )}
    </div>
  );
};

export default DataHub;
