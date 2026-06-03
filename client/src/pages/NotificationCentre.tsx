import React, { useState, useEffect } from 'react';
import {
  Bell,
  AlertCircle,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Eye,
  X,
  Plus,
  Filter,
} from 'lucide-react';

interface PendingApproval {
  id: string;
  alertType: string;
  severity: 'critical' | 'warning' | 'info';
  triggeredAt: string;
  description: string;
  affectedArea: string;
  propertyCount: number;
  tenantCount: number;
  preview?: string;
}

interface RecentAlert {
  id: string;
  type: string;
  status: 'sent' | 'pending' | 'failed';
  sentAt: string;
  recipientCount: number;
  description: string;
}

const NotificationCentre: React.FC = () => {
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([
    {
      id: '1',
      alertType: 'Flood Warning',
      severity: 'critical',
      triggeredAt: '2026-03-17T09:30:00Z',
      description: 'Environment Agency flood warning for postcode area',
      affectedArea: 'SW1A 1AA',
      propertyCount: 8,
      tenantCount: 24,
      preview: 'A flood warning has been issued for your area...',
    },
  ]);

  const [recentAlerts, setRecentAlerts] = useState<RecentAlert[]>([
    {
      id: '1',
      type: 'Maintenance Notice',
      status: 'sent',
      sentAt: '2026-03-17T08:00:00Z',
      recipientCount: 42,
      description: 'Scheduled boiler maintenance',
    },
    {
      id: '2',
      type: 'Rent Payment',
      status: 'sent',
      sentAt: '2026-03-16T10:00:00Z',
      recipientCount: 156,
      description: 'Monthly rent payment reminder',
    },
  ]);

  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);
  const [composeStep, setComposeStep] = useState<1 | 2 | 3 | 4 | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'sent' | 'pending' | 'failed'>('all');
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);

  const [stats, setStats] = useState({
    pendingApprovalsCount: 1,
    alertsSentToday: 2,
    alertsSentThisWeek: 8,
    deliverySuccessRate: 98.5,
  });

  // Compose notification state
  const [compose, setCompose] = useState({
    recipients: {
      type: 'all' as 'all' | 'postcode' | 'property',
      postcode: '',
      propertyId: '',
    },
    message: {
      subject: '',
      body: '',
    },
  });

  const handlePreviewClick = (approval: PendingApproval) => {
    setSelectedApproval(approval);
    setShowPreviewModal(true);
  };

  const handleDismiss = (id: string) => {
    setPendingApprovals(pendingApprovals.filter((a) => a.id !== id));
  };

  const handleApprove = (id: string) => {
    setPendingApprovals(pendingApprovals.filter((a) => a.id !== id));
    setShowPreviewModal(false);
  };

  const filteredAlerts = recentAlerts.filter((alert) =>
    filterStatus === 'all' ? true : alert.status === filterStatus
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffHours < 24) {
      return `${Math.floor(diffHours)}h ago`;
    } else if (diffDays < 7) {
      return `${Math.floor(diffDays)}d ago`;
    } else {
      return date.toLocaleDateString('en-GB');
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'warning':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'info':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getSeverityBadgeColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-200 text-red-800';
      case 'warning':
        return 'bg-amber-200 text-amber-800';
      case 'info':
        return 'bg-blue-200 text-blue-800';
      default:
        return 'bg-gray-200 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="w-8 h-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Notification Centre</h1>
            </div>
            <button
              onClick={() => setComposeStep(1)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              Compose Notification
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Amber banner for pending approvals */}
        {stats.pendingApprovalsCount > 0 && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900">
                {stats.pendingApprovalsCount} pending approval{stats.pendingApprovalsCount !== 1 ? 's' : ''}
              </h3>
              <p className="text-sm text-amber-800">
                You have alerts waiting for approval before they can be sent to tenants.
              </p>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending Approvals</p>
                <p className="text-3xl font-bold text-gray-900">{stats.pendingApprovalsCount}</p>
              </div>
              <Clock className="w-8 h-8 text-amber-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Alerts Sent Today</p>
                <p className="text-3xl font-bold text-gray-900">{stats.alertsSentToday}</p>
              </div>
              <Bell className="w-8 h-8 text-blue-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">This Week</p>
                <p className="text-3xl font-bold text-gray-900">{stats.alertsSentThisWeek}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Success Rate</p>
                <p className="text-3xl font-bold text-gray-900">{stats.deliverySuccessRate}%</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>
        </div>

        {/* Pending Approvals Section */}
        {pendingApprovals.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Pending Approvals</h2>
            <div className="space-y-4">
              {pendingApprovals.map((approval) => (
                <div
                  key={approval.id}
                  className={`rounded-lg border-2 p-6 bg-white ${getSeverityColor(approval.severity)}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-4 flex-1">
                      <AlertCircle className="w-6 h-6 flex-shrink-0 mt-1" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-bold text-lg">{approval.alertType}</h3>
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${getSeverityBadgeColor(
                              approval.severity
                            )}`}
                          >
                            {approval.severity.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm opacity-90 mb-3">{approval.description}</p>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          <div>
                            <p className="text-xs opacity-75">Affected Area</p>
                            <p className="font-semibold">{approval.affectedArea}</p>
                          </div>
                          <div>
                            <p className="text-xs opacity-75">Properties</p>
                            <p className="font-semibold">{approval.propertyCount}</p>
                          </div>
                          <div>
                            <p className="text-xs opacity-75">Tenants</p>
                            <p className="font-semibold">{approval.tenantCount}</p>
                          </div>
                          <div>
                            <p className="text-xs opacity-75">Triggered</p>
                            <p className="font-semibold">{formatDate(approval.triggeredAt)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => handleDismiss(approval.id)}
                      className="px-4 py-2 border border-current rounded-lg hover:opacity-80 transition flex items-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Dismiss
                    </button>
                    <button
                      onClick={() => handlePreviewClick(approval)}
                      className="px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg transition flex items-center gap-2 font-semibold"
                    >
                      <Eye className="w-4 h-4" />
                      Preview & Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Alerts Timeline */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Recent Alerts</h2>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-600" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="sent">Sent</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            {filteredAlerts.length > 0 ? (
              filteredAlerts.map((alert) => (
                <div key={alert.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() =>
                      setExpandedAlert(expandedAlert === alert.id ? null : alert.id)
                    }
                    className="w-full px-6 py-4 hover:bg-gray-50 transition flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4 flex-1 text-left">
                      <div className="flex items-center gap-3">
                        {alert.status === 'sent' && (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        )}
                        {alert.status === 'pending' && (
                          <Clock className="w-5 h-5 text-amber-600" />
                        )}
                        {alert.status === 'failed' && (
                          <AlertCircle className="w-5 h-5 text-red-600" />
                        )}
                        <div>
                          <p className="font-semibold text-gray-900">{alert.type}</p>
                          <p className="text-sm text-gray-600">{alert.description}</p>
                        </div>
                      </div>
                      <div className="text-right hidden md:block">
                        <p className="text-sm text-gray-600">{formatDate(alert.sentAt)}</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {alert.recipientCount} recipients
                        </p>
                      </div>
                    </div>
                    {expandedAlert === alert.id ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </button>

                  {expandedAlert === alert.id && (
                    <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
                      <p className="text-sm text-gray-700 mb-2">
                        <strong>Status:</strong> {alert.status.charAt(0).toUpperCase() + alert.status.slice(1)}
                      </p>
                      <p className="text-sm text-gray-700 mb-2">
                        <strong>Recipients:</strong> {alert.recipientCount} tenants
                      </p>
                      <p className="text-sm text-gray-700">
                        <strong>Sent:</strong> {new Date(alert.sentAt).toLocaleString('en-GB')}
                      </p>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">No alerts found</p>
            )}
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreviewModal && selectedApproval && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="border-b border-gray-200 p-6 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-gray-900">Preview & Approve</h2>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-900">
                  This notification will be sent to <strong>{selectedApproval.tenantCount} tenants</strong> across{' '}
                  <strong>{selectedApproval.propertyCount} properties</strong> in{' '}
                  <strong>{selectedApproval.affectedArea}</strong>.
                </p>
              </div>

              <div className="border border-gray-300 rounded-lg overflow-hidden mb-6">
                <iframe
                  srcDoc={`<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">${selectedApproval.preview}</div>`}
                  className="w-full h-96 border-none"
                  title="Email Preview"
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleApprove(selectedApproval.id)}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Send to {selectedApproval.tenantCount} Tenants
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compose Notification Modal */}
      {composeStep && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="border-b border-gray-200 p-6 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-gray-900">
                Compose Notification - Step {composeStep} of 4
              </h2>
              <button
                onClick={() => setComposeStep(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              {composeStep === 1 && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-3">
                      Select Recipients
                    </label>
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="recipients"
                          value="all"
                          checked={compose.recipients.type === 'all'}
                          onChange={() =>
                            setCompose({
                              ...compose,
                              recipients: { ...compose.recipients, type: 'all' },
                            })
                          }
                          className="w-4 h-4"
                        />
                        <span className="text-gray-900">All Tenants</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="recipients"
                          value="postcode"
                          checked={compose.recipients.type === 'postcode'}
                          onChange={() =>
                            setCompose({
                              ...compose,
                              recipients: { ...compose.recipients, type: 'postcode' },
                            })
                          }
                          className="w-4 h-4"
                        />
                        <span className="text-gray-900">By Postcode</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="recipients"
                          value="property"
                          checked={compose.recipients.type === 'property'}
                          onChange={() =>
                            setCompose({
                              ...compose,
                              recipients: { ...compose.recipients, type: 'property' },
                            })
                          }
                          className="w-4 h-4"
                        />
                        <span className="text-gray-900">Specific Property</span>
                      </label>
                    </div>
                  </div>

                  {compose.recipients.type === 'postcode' && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Postcode
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., SW1A 1AA"
                        value={compose.recipients.postcode}
                        onChange={(e) =>
                          setCompose({
                            ...compose,
                            recipients: { ...compose.recipients, postcode: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {compose.recipients.type === 'property' && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Property ID
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., PROP-001"
                        value={compose.recipients.propertyId}
                        onChange={(e) =>
                          setCompose({
                            ...compose,
                            recipients: { ...compose.recipients, propertyId: e.target.value },
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {composeStep === 2 && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Subject Line
                    </label>
                    <input
                      type="text"
                      placeholder="Enter notification subject"
                      value={compose.message.subject}
                      onChange={(e) =>
                        setCompose({
                          ...compose,
                          message: { ...compose.message, subject: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Message Body
                    </label>
                    <textarea
                      placeholder="Enter notification message"
                      value={compose.message.body}
                      onChange={(e) =>
                        setCompose({
                          ...compose,
                          message: { ...compose.message, body: e.target.value },
                        })
                      }
                      rows={6}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {composeStep === 3 && (
                <div className="space-y-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-900">
                      <strong>Recipients:</strong>{' '}
                      {compose.recipients.type === 'all'
                        ? 'All tenants'
                        : compose.recipients.type === 'postcode'
                          ? `Postcode: ${compose.recipients.postcode}`
                          : `Property: ${compose.recipients.propertyId}`}
                    </p>
                  </div>

                  <div className="border border-gray-300 rounded-lg p-4 bg-white">
                    <p className="text-sm text-gray-600 mb-2">
                      <strong>Subject:</strong>
                    </p>
                    <p className="text-gray-900 font-semibold mb-4">{compose.message.subject}</p>

                    <p className="text-sm text-gray-600 mb-2">
                      <strong>Message:</strong>
                    </p>
                    <p className="text-gray-900 whitespace-pre-wrap">{compose.message.body}</p>
                  </div>
                </div>
              )}

              {composeStep === 4 && (
                <div className="text-center py-8">
                  <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                  <p className="text-lg font-semibold text-gray-900 mb-2">
                    Notification submitted for review
                  </p>
                  <p className="text-gray-600">
                    Your notification has been added to pending approvals and will require approval before sending.
                  </p>
                </div>
              )}

              <div className="flex gap-3 justify-end mt-8">
                <button
                  onClick={() => {
                    if (composeStep === 1) {
                      setComposeStep(null);
                    } else {
                      setComposeStep((composeStep - 1) as any);
                    }
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  {composeStep === 1 ? 'Cancel' : 'Back'}
                </button>
                {composeStep < 4 && (
                  <button
                    onClick={() => setComposeStep((composeStep + 1) as any)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                  >
                    Next
                  </button>
                )}
                {composeStep === 4 && (
                  <button
                    onClick={() => {
                      setComposeStep(null);
                      setPendingApprovals([
                        ...pendingApprovals,
                        {
                          id: String(pendingApprovals.length + 1),
                          alertType: 'Custom Notification',
                          severity: 'info',
                          triggeredAt: new Date().toISOString(),
                          description: compose.message.subject,
                          affectedArea: 'Various',
                          propertyCount: 12,
                          tenantCount: 45,
                          preview: compose.message.body,
                        },
                      ]);
                    }}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCentre;
