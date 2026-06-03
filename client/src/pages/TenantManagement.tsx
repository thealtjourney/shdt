import React, { useState, useMemo } from 'react';
import {
  Search,
  Download,
  Upload,
  Plus,
  ChevronDown,
  ChevronUp,
  Trash2,
  Mail,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  email: string;
  property: string;
  postcode: string;
  active: boolean;
  consentGiven: boolean;
  preferences: {
    emailNotifications: boolean;
    smsNotifications: boolean;
    emergencyAlertsOnly: boolean;
  };
  lastNotified: string;
  notificationHistory: Array<{
    id: string;
    type: string;
    sentAt: string;
    subject: string;
  }>;
}

const TenantManagement: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([
    {
      id: '1',
      name: 'John Smith',
      email: 'john.smith@example.com',
      property: 'PROP-001',
      postcode: 'SW1A 1AA',
      active: true,
      consentGiven: true,
      preferences: {
        emailNotifications: true,
        smsNotifications: false,
        emergencyAlertsOnly: false,
      },
      lastNotified: '2026-03-17T14:30:00Z',
      notificationHistory: [
        {
          id: '1',
          type: 'Maintenance Notice',
          sentAt: '2026-03-17T14:30:00Z',
          subject: 'Boiler maintenance scheduled',
        },
        {
          id: '2',
          type: 'Rent Reminder',
          sentAt: '2026-03-15T09:00:00Z',
          subject: 'Monthly rent due',
        },
      ],
    },
    {
      id: '2',
      name: 'Sarah Johnson',
      email: 'sarah.j@example.com',
      property: 'PROP-002',
      postcode: 'SW1A 1AA',
      active: true,
      consentGiven: true,
      preferences: {
        emailNotifications: true,
        smsNotifications: true,
        emergencyAlertsOnly: false,
      },
      lastNotified: '2026-03-16T10:15:00Z',
      notificationHistory: [
        {
          id: '1',
          type: 'Flood Alert',
          sentAt: '2026-03-10T16:45:00Z',
          subject: 'Flood warning for your area',
        },
      ],
    },
    {
      id: '3',
      name: 'Emma Williams',
      email: 'emma.w@example.com',
      property: 'PROP-003',
      postcode: 'E1 1AA',
      active: false,
      consentGiven: false,
      preferences: {
        emailNotifications: false,
        smsNotifications: false,
        emergencyAlertsOnly: true,
      },
      lastNotified: '2026-02-28T08:00:00Z',
      notificationHistory: [],
    },
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'postcode' | 'lastNotified'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);

  const [newTenant, setNewTenant] = useState({
    name: '',
    email: '',
    property: '',
    postcode: '',
  });

  const filteredAndSortedTenants = useMemo(() => {
    let filtered = tenants.filter(
      (tenant) =>
        tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tenant.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tenant.property.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tenant.postcode.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      let aVal: any = a[sortBy];
      let bVal: any = b[sortBy];

      if (sortBy === 'lastNotified') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [tenants, searchTerm, sortBy, sortOrder]);

  const handleAddTenant = () => {
    if (newTenant.name && newTenant.email && newTenant.property && newTenant.postcode) {
      setTenants([
        ...tenants,
        {
          id: String(tenants.length + 1),
          ...newTenant,
          active: true,
          consentGiven: true,
          preferences: {
            emailNotifications: true,
            smsNotifications: false,
            emergencyAlertsOnly: false,
          },
          lastNotified: new Date().toISOString(),
          notificationHistory: [],
        },
      ]);
      setNewTenant({ name: '', email: '', property: '', postcode: '' });
      setShowAddForm(false);
    }
  };

  const handleDeleteTenant = (id: string) => {
    setTenants(tenants.filter((t) => t.id !== id));
  };

  const handleExportCSV = () => {
    const headers = ['Name', 'Email', 'Property', 'Postcode', 'Active', 'Consent', 'Last Notified'];
    const rows = tenants.map((t) => [
      t.name,
      t.email,
      t.property,
      t.postcode,
      t.active ? 'Yes' : 'No',
      t.consentGiven ? 'Yes' : 'No',
      new Date(t.lastNotified).toLocaleDateString('en-GB'),
    ]);

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tenants-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-900">Tenant Management</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
              >
                <Plus className="w-4 h-4" />
                Add Tenant
              </button>
              <button
                onClick={() => setShowImportForm(true)}
                className="flex items-center gap-2 border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg transition"
              >
                <Upload className="w-4 h-4" />
                Import CSV
              </button>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg transition"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, email, property, or postcode..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="name">Sort by Name</option>
              <option value="postcode">Sort by Postcode</option>
              <option value="lastNotified">Sort by Last Notified</option>
            </select>

            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              {sortOrder === 'asc' ? '↑ ASC' : '↓ DESC'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tenants Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Name</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Email</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Property</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Postcode</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Consent</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Last Notified</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredAndSortedTenants.map((tenant) => (
                  <React.Fragment key={tenant.id}>
                    <tr className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium">{tenant.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <a
                          href={`mailto:${tenant.email}`}
                          className="text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Mail className="w-4 h-4" />
                          {tenant.email}
                        </a>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{tenant.property}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{tenant.postcode}</td>
                      <td className="px-6 py-4 text-sm">
                        {tenant.active ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {tenant.consentGiven ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3" />
                            Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                            <AlertCircle className="w-3 h-3" />
                            No
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatDate(tenant.lastNotified)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              setExpandedTenant(expandedTenant === tenant.id ? null : tenant.id)
                            }
                            className="text-blue-600 hover:text-blue-700 font-medium"
                          >
                            {expandedTenant === tenant.id ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteTenant(tenant.id)}
                            className="text-red-600 hover:text-red-700 font-medium"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Details */}
                    {expandedTenant === tenant.id && (
                      <tr className="bg-gray-50">
                        <td colSpan={8} className="px-6 py-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Preferences */}
                            <div>
                              <h3 className="font-semibold text-gray-900 mb-4">Notification Preferences</h3>
                              <div className="space-y-3">
                                <label className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={tenant.preferences.emailNotifications}
                                    readOnly
                                    className="w-4 h-4"
                                  />
                                  <span className="text-sm text-gray-700">Email Notifications</span>
                                </label>
                                <label className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={tenant.preferences.smsNotifications}
                                    readOnly
                                    className="w-4 h-4"
                                  />
                                  <span className="text-sm text-gray-700">SMS Notifications</span>
                                </label>
                                <label className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={tenant.preferences.emergencyAlertsOnly}
                                    readOnly
                                    className="w-4 h-4"
                                  />
                                  <span className="text-sm text-gray-700">Emergency Alerts Only</span>
                                </label>
                              </div>
                            </div>

                            {/* Notification History */}
                            <div>
                              <h3 className="font-semibold text-gray-900 mb-4">Notification History</h3>
                              {tenant.notificationHistory.length > 0 ? (
                                <div className="space-y-3">
                                  {tenant.notificationHistory.map((notif) => (
                                    <div
                                      key={notif.id}
                                      className="p-3 bg-white border border-gray-200 rounded text-sm"
                                    >
                                      <p className="font-medium text-gray-900">{notif.type}</p>
                                      <p className="text-gray-600">{notif.subject}</p>
                                      <p className="text-xs text-gray-500 mt-1">
                                        {formatDateTime(notif.sentAt)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-500">No notifications sent yet</p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {filteredAndSortedTenants.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No tenants found matching your search</p>
          </div>
        )}
      </div>

      {/* Add Tenant Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="border-b border-gray-200 p-6 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-gray-900">Add New Tenant</h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Name</label>
                <input
                  type="text"
                  placeholder="Full name"
                  value={newTenant.name}
                  onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Email</label>
                <input
                  type="email"
                  placeholder="email@example.com"
                  value={newTenant.email}
                  onChange={(e) => setNewTenant({ ...newTenant, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Property</label>
                <input
                  type="text"
                  placeholder="e.g., PROP-001"
                  value={newTenant.property}
                  onChange={(e) => setNewTenant({ ...newTenant, property: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">Postcode</label>
                <input
                  type="text"
                  placeholder="e.g., SW1A 1AA"
                  value={newTenant.postcode}
                  onChange={(e) => setNewTenant({ ...newTenant, postcode: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddTenant}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                >
                  Add Tenant
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {showImportForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="border-b border-gray-200 p-6 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-gray-900">Import Tenants from CSV</h2>
              <button
                onClick={() => setShowImportForm(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Upload a CSV file with columns: Name, Email, Property, Postcode
              </p>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Drag and drop your CSV file here</p>
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  id="csv-upload"
                />
                <label
                  htmlFor="csv-upload"
                  className="block mt-3 text-blue-600 hover:text-blue-700 cursor-pointer font-medium"
                >
                  or click to browse
                </label>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  onClick={() => setShowImportForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowImportForm(false)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                >
                  Import
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantManagement;
