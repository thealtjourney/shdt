import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  AlertCircle,
  X,
  ChevronDown,
  Save,
} from 'lucide-react';
import { Button } from './ui/Button';

interface UnmatchedRecord {
  id: string;
  description: string;
  trade: string;
  property: string;
  suggested_component?: string;
  property_components: Array<{ id: string; name: string }>;
  confidence?: number;
}

interface MatchingReviewProps {
  onClose: () => void;
  onSave?: (matches: Record<string, string>) => void;
}

const MatchingReview: React.FC<MatchingReviewProps> = ({ onClose, onSave }) => {
  const [records, setRecords] = useState<UnmatchedRecord[]>([]);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null);
  const [allMatched, setAllMatched] = useState(false);

  useEffect(() => {
    fetchUnmatchedRecords();
  }, []);

  const fetchUnmatchedRecords = async () => {
    try {
      const response = await fetch('/api/data-hub/unmatched-records');
      const data = await response.json();
      setRecords(data.records || []);
      setLoading(false);

      // Initialize matches with suggested components
      const initialMatches: Record<string, string> = {};
      data.records.forEach((record: UnmatchedRecord) => {
        if (record.suggested_component) {
          initialMatches[record.id] = record.suggested_component;
        }
      });
      setMatches(initialMatches);
    } catch (error) {
      console.error('Failed to fetch unmatched records:', error);
      setLoading(false);
    }
  };

  const handleMatchSelect = (recordId: string, componentId: string) => {
    setMatches(prev => ({
      ...prev,
      [recordId]: componentId,
    }));
  };

  const handleSaveMatches = async () => {
    try {
      const response = await fetch('/api/data-hub/save-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches }),
      });

      if (response.ok) {
        const data = await response.json();
        setAllMatched(true);
        if (onSave) {
          onSave(matches);
        }
      }
    } catch (error) {
      console.error('Failed to save matches:', error);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-8 text-center">
          <p className="text-slate-600">Loading unmatched records...</p>
        </div>
      </div>
    );
  }

  if (allMatched || records.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-8 text-center max-w-md">
          <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">All Records Matched</h2>
          <p className="text-slate-600 mb-6">
            All maintenance records have been successfully matched to property components.
          </p>
          <Button onClick={onClose} className="bg-green-600 hover:bg-green-700">
            Close
          </Button>
        </div>
      </div>
    );
  }

  const matchedCount = Object.keys(matches).length;
  const totalCount = records.length;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-5xl mx-auto bg-white rounded-lg shadow-lg">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Match Maintenance Records</h2>
              <p className="text-sm text-slate-600 mt-1">
                {matchedCount} of {totalCount} records matched
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="px-6 py-4 border-b border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">
                Matching Progress
              </span>
              <span className="text-sm font-bold text-slate-900">
                {Math.round((matchedCount / totalCount) * 100)}%
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(matchedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>

          {/* Records Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">
                    Maintenance Record
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">
                    Trade
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">
                    Property
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">
                    Match To Component
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((record, index) => {
                  const isMatched = !!matches[record.id];
                  return (
                    <React.Fragment key={record.id}>
                      <tr className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-slate-900 line-clamp-2">
                              {record.description}
                            </p>
                            <button
                              onClick={() =>
                                setExpandedRecord(
                                  expandedRecord === record.id ? null : record.id
                                )
                              }
                              className="text-xs text-blue-600 hover:text-blue-700 mt-1 flex items-center gap-1"
                            >
                              <ChevronDown
                                className={`w-3 h-3 transition-transform ${
                                  expandedRecord === record.id ? 'rotate-180' : ''
                                }`}
                              />
                              {expandedRecord === record.id ? 'Hide' : 'Show'} details
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                            {record.trade}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {record.property}
                        </td>
                        <td className="px-6 py-4">
                          <div className="relative inline-block w-full max-w-xs">
                            <select
                              value={matches[record.id] || ''}
                              onChange={e =>
                                handleMatchSelect(record.id, e.target.value)
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white pr-8"
                            >
                              <option value="">
                                {record.suggested_component
                                  ? 'Suggested: ' + record.suggested_component
                                  : 'Select component...'}
                              </option>
                              {record.property_components.map(component => (
                                <option key={component.id} value={component.id}>
                                  {component.name}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {isMatched ? (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-5 h-5 text-green-600" />
                              <span className="text-xs font-medium text-green-700">
                                Matched
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <AlertCircle className="w-5 h-5 text-amber-600" />
                              <span className="text-xs font-medium text-amber-700">
                                Pending
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Expanded Row */}
                      {expandedRecord === record.id && (
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <td colSpan={5} className="px-6 py-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="font-semibold text-slate-700 mb-1">
                                  Full Description
                                </p>
                                <p className="text-slate-600">{record.description}</p>
                              </div>
                              <div>
                                <p className="font-semibold text-slate-700 mb-1">
                                  Match Confidence
                                </p>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-slate-200 rounded-full h-2">
                                    <div
                                      className="bg-blue-500 h-2 rounded-full"
                                      style={{
                                        width: `${record.confidence || 0}%`,
                                      }}
                                    />
                                  </div>
                                  <span className="font-medium text-slate-900">
                                    {record.confidence || 0}%
                                  </span>
                                </div>
                              </div>
                            </div>

                            {record.suggested_component && (
                              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                                <p className="font-medium text-blue-900">
                                  Suggested match: {record.suggested_component}
                                </p>
                                <p className="text-blue-700 text-xs mt-1">
                                  Based on maintenance history and property data
                                </p>
                              </div>
                            )}

                            <div className="mt-3">
                              <p className="font-semibold text-slate-700 mb-2">
                                Available Components
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                {record.property_components.map(component => (
                                  <div
                                    key={component.id}
                                    className={`p-2 rounded border cursor-pointer transition-colors ${
                                      matches[record.id] === component.id
                                        ? 'bg-blue-100 border-blue-300'
                                        : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                                    }`}
                                    onClick={() =>
                                      handleMatchSelect(record.id, component.id)
                                    }
                                  >
                                    <p className="text-xs font-medium text-slate-900">
                                      {component.name}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex justify-between items-center">
            <div className="text-sm text-slate-600">
              {matchedCount} of {totalCount} records ready to save
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveMatches}
                disabled={matchedCount === 0}
                className="gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                Save Matches
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MatchingReview;
