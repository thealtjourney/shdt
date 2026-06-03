import React, { useState } from 'react';
import {
  Settings,
  Edit,
  Trash2,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Toggle,
} from 'lucide-react';

interface AlertRule {
  id: string;
  name: string;
  trigger: string;
  condition: {
    type: 'equals' | 'contains' | 'greater_than' | 'less_than';
    value: string;
  };
  enabled: boolean;
  autoSend: boolean;
  cooldownMinutes: number;
  template: string;
  lastTriggered?: string;
}

const AlertRules: React.FC = () => {
  const [rules, setRules] = useState<AlertRule[]>([
    {
      id: '1',
      name: 'Flood Warning Alert',
      trigger: 'flood_alert',
      condition: {
        type: 'equals',
        value: 'warning',
      },
      enabled: true,
      autoSend: true,
      cooldownMinutes: 60,
      template: 'flood-template',
      lastTriggered: '2026-03-17T09:30:00Z',
    },
    {
      id: '2',
      name: 'High Temperature Alert',
      trigger: 'temperature',
      condition: {
        type: 'greater_than',
        value: '35',
      },
      enabled: true,
      autoSend: false,
      cooldownMinutes: 120,
      template: 'temperature-template',
    },
    {
      id: '3',
      name: 'Maintenance Scheduled',
      trigger: 'maintenance',
      condition: {
        type: 'equals',
        value: 'scheduled',
      },
      enabled: false,
      autoSend: false,
      cooldownMinutes: 0,
      template: 'maintenance-template',
    },
  ]);

  const [showEditor, setShowEditor] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);

  const [formData, setFormData] = useState<AlertRule>({
    id: '',
    name: '',
    trigger: '',
    condition: { type: 'equals', value: '' },
    enabled: true,
    autoSend: false,
    cooldownMinutes: 0,
    template: '',
  });

  const handleEdit = (rule: AlertRule) => {
    setEditingRule(rule);
    setFormData(rule);
    setShowEditor(true);
  };

  const handleNew = () => {
    setEditingRule(null);
    setFormData({
      id: '',
      name: '',
      trigger: '',
      condition: { type: 'equals', value: '' },
      enabled: true,
      autoSend: false,
      cooldownMinutes: 0,
      template: '',
    });
    setShowEditor(true);
  };

  const handleSave = () => {
    if (!formData.name || !formData.trigger || !formData.template) {
      return;
    }

    if (editingRule) {
      setRules(rules.map((r) => (r.id === editingRule.id ? formData : r)));
    } else {
      setRules([
        ...rules,
        {
          ...formData,
          id: String(rules.length + 1),
        },
      ]);
    }

    setShowEditor(false);
  };

  const handleDelete = (id: string) => {
    setRules(rules.filter((r) => r.id !== id));
  };

  const toggleEnabled = (id: string) => {
    setRules(
      rules.map((r) =>
        r.id === id
          ? { ...r, enabled: !r.enabled }
          : r
      )
    );
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const triggerOptions = [
    { value: 'flood_alert', label: 'Flood Alert' },
    { value: 'temperature', label: 'Temperature' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'rent_due', label: 'Rent Due' },
    { value: 'safety_hazard', label: 'Safety Hazard' },
    { value: 'utility_issue', label: 'Utility Issue' },
  ];

  const templateOptions = [
    { value: 'flood-template', label: 'Flood Warning Template' },
    { value: 'temperature-template', label: 'Temperature Alert Template' },
    { value: 'maintenance-template', label: 'Maintenance Notice Template' },
    { value: 'rent-template', label: 'Rent Reminder Template' },
    { value: 'safety-template', label: 'Safety Alert Template' },
  ];

  const conditionTypes = ['equals', 'contains', 'greater_than', 'less_than'];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings className="w-8 h-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Alert Rules Configuration</h1>
            </div>
            <button
              onClick={handleNew}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              Create Rule
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Rules Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Rule Name</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Trigger</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Auto-Send</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Cooldown</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Last Triggered</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Enabled</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rules.map((rule) => (
                  <React.Fragment key={rule.id}>
                    <tr className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium">{rule.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {triggerOptions.find((o) => o.value === rule.trigger)?.label || rule.trigger}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                            rule.autoSend
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {rule.autoSend ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {rule.cooldownMinutes > 0 ? `${rule.cooldownMinutes} min` : 'None'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatDate(rule.lastTriggered)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <button
                          onClick={() => toggleEnabled(rule.id)}
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold transition ${
                            rule.enabled
                              ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                              : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                          }`}
                        >
                          <Toggle className="w-3 h-3 mr-1" />
                          {rule.enabled ? 'ON' : 'OFF'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              setExpandedRule(expandedRule === rule.id ? null : rule.id)
                            }
                            className="text-blue-600 hover:text-blue-700 font-medium"
                          >
                            {expandedRule === rule.id ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleEdit(rule)}
                            className="text-blue-600 hover:text-blue-700 font-medium"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(rule.id)}
                            className="text-red-600 hover:text-red-700 font-medium"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Details */}
                    {expandedRule === rule.id && (
                      <tr className="bg-gray-50">
                        <td colSpan={7} className="px-6 py-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Condition Builder */}
                            <div>
                              <h3 className="font-semibold text-gray-900 mb-4">Condition</h3>
                              <div className="space-y-3 bg-white p-4 rounded border border-gray-200">
                                <div>
                                  <p className="text-xs text-gray-600 mb-1">Type</p>
                                  <p className="text-sm font-medium text-gray-900">
                                    {rule.condition.type === 'equals'
                                      ? 'Equals'
                                      : rule.condition.type === 'contains'
                                        ? 'Contains'
                                        : rule.condition.type === 'greater_than'
                                          ? 'Greater Than'
                                          : 'Less Than'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-600 mb-1">Value</p>
                                  <p className="text-sm font-medium text-gray-900">
                                    {rule.condition.value}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Template Info */}
                            <div>
                              <h3 className="font-semibold text-gray-900 mb-4">Template</h3>
                              <div className="bg-white p-4 rounded border border-gray-200">
                                <p className="text-sm font-medium text-gray-900">
                                  {templateOptions.find((o) => o.value === rule.template)?.label ||
                                    rule.template}
                                </p>
                                <p className="text-xs text-gray-600 mt-2">
                                  {rule.autoSend
                                    ? 'Will automatically send when trigger matches'
                                    : 'Requires manual approval before sending'}
                                </p>
                              </div>
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
      </div>

      {/* Rule Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="border-b border-gray-200 p-6 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-gray-900">
                {editingRule ? 'Edit Rule' : 'Create New Rule'}
              </h2>
              <button
                onClick={() => setShowEditor(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Rule Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Rule Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., Flood Warning Alert"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Trigger Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Trigger Type
                </label>
                <select
                  value={formData.trigger}
                  onChange={(e) => setFormData({ ...formData, trigger: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a trigger type</option>
                  {triggerOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Condition Builder */}
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <h3 className="font-semibold text-gray-900 mb-4">Condition Builder</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Type
                    </label>
                    <select
                      value={formData.condition.type}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          condition: {
                            ...formData.condition,
                            type: e.target.value as any,
                          },
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="equals">Equals</option>
                      <option value="contains">Contains</option>
                      <option value="greater_than">Greater Than</option>
                      <option value="less_than">Less Than</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Value
                    </label>
                    <input
                      type="text"
                      placeholder="Enter value"
                      value={formData.condition.value}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          condition: {
                            ...formData.condition,
                            value: e.target.value,
                          },
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Template Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Notification Template
                </label>
                <select
                  value={formData.template}
                  onChange={(e) => setFormData({ ...formData, template: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a template</option>
                  {templateOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Auto-Send Toggle */}
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">Auto-Send</h3>
                    <p className="text-sm text-gray-600">
                      Automatically send when trigger matches
                    </p>
                  </div>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.autoSend}
                      onChange={(e) => setFormData({ ...formData, autoSend: e.target.checked })}
                      className="w-4 h-4"
                    />
                  </label>
                </div>
              </div>

              {/* Cooldown */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Cooldown Period (minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="0 for no cooldown"
                  value={formData.cooldownMinutes}
                  onChange={(e) =>
                    setFormData({ ...formData, cooldownMinutes: parseInt(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Prevents rule from triggering again within this period
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowEditor(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                >
                  {editingRule ? 'Update Rule' : 'Create Rule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertRules;
