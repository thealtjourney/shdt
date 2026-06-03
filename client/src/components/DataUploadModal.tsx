import React, { useState, useRef } from 'react';
import {
  Upload,
  X,
  CheckCircle,
  AlertCircle,
  Download,
  Eye,
} from 'lucide-react';
import { Button } from './ui/Button';

interface ColumnMapping {
  [key: string]: string;
}

interface FilePreview {
  rows: string[][];
  headers: string[];
}

interface ImportResult {
  status: 'success' | 'error' | 'partial';
  total: number;
  imported: number;
  failed: number;
  errors: string[];
}

interface DataUploadModalProps {
  dataType: 'properties' | 'maintenance' | 'enrichment' | 'tenants';
  onClose: () => void;
}

const DataUploadModal: React.FC<DataUploadModalProps> = ({ dataType, onClose }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [importMode, setImportMode] = useState<'replace' | 'update'>('replace');
  const [progress, setProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const expectedColumns = {
    properties: [
      'property_id',
      'address',
      'postcode',
      'type',
      'build_year',
      'area_sqm',
      'bedrooms',
      'bathrooms',
    ],
    maintenance: [
      'date',
      'description',
      'trade',
      'cost',
      'property_id',
      'component',
      'contractor',
    ],
    enrichment: [
      'property_id',
      'energy_rating',
      'flood_risk',
      'planning_status',
    ],
    tenants: [
      'tenant_id',
      'name',
      'property_id',
      'move_in_date',
      'move_out_date',
      'contact_email',
      'phone',
      'consent_given',
    ],
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      alert('Please select a CSV file');
      return;
    }

    setSelectedFile(file);
    await parseCSVPreview(file);
  };

  const parseCSVPreview = async (file: File) => {
    const text = await file.text();
    const lines = text.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines
      .slice(1, 11)
      .filter(line => line.trim())
      .map(line => line.split(',').map(cell => cell.trim()));

    setFilePreview({ headers, rows });

    // Auto-detect column mapping
    const newMapping: ColumnMapping = {};
    const expectedCols = expectedColumns[dataType];
    expectedCols.forEach(expected => {
      const match = headers.find(
        h => h.toLowerCase() === expected.toLowerCase() ||
             h.toLowerCase().replace(/[_\s]/g, '') === expected.toLowerCase().replace(/[_\s]/g, '')
      );
      if (match) {
        newMapping[expected] = match;
      }
    });
    setColumnMapping(newMapping);
  };

  const handleColumnMappingChange = (expected: string, actual: string) => {
    setColumnMapping(prev => ({
      ...prev,
      [expected]: actual,
    }));
  };

  const handleImport = async () => {
    if (!selectedFile || !filePreview) {
      alert('Please select a file first');
      return;
    }

    // Validate mapping
    const expectedCols = expectedColumns[dataType];
    const unmappedRequired = expectedCols.slice(0, Math.ceil(expectedCols.length / 2)).filter(
      col => !columnMapping[col]
    );

    if (unmappedRequired.length > 0) {
      alert(`Please map all required columns: ${unmappedRequired.join(', ')}`);
      return;
    }

    setIsImporting(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('data_type', dataType);
      formData.append('column_mapping', JSON.stringify(columnMapping));
      formData.append('import_mode', importMode);

      const response = await fetch('/api/data-hub/import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setImportResult({
          status: 'error',
          total: 0,
          imported: 0,
          failed: 0,
          errors: [data.error || 'Import failed'],
        });
      } else {
        // Poll for progress
        const taskId = data.task_id;
        const pollInterval = setInterval(async () => {
          const statusResponse = await fetch(
            `/api/data-hub/import/${taskId}/status`
          );
          const statusData = await statusResponse.json();

          setProgress(statusData.progress);

          if (statusData.status !== 'pending') {
            clearInterval(pollInterval);
            setIsImporting(false);
            setImportResult({
              status: statusData.status === 'completed' ? 'success' : 'error',
              total: statusData.total_records || 0,
              imported: statusData.imported_records || 0,
              failed: statusData.failed_records || 0,
              errors: statusData.errors || [],
            });
          }
        }, 1000);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setIsImporting(false);
      setImportResult({
        status: 'error',
        total: 0,
        imported: 0,
        failed: 0,
        errors: ['An error occurred during import'],
      });
    }
  };

  const handleDownloadErrors = () => {
    if (!importResult || importResult.errors.length === 0) return;

    const csv = ['Error'].concat(importResult.errors).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataType}_errors.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-slate-900">
            Upload {dataType.charAt(0).toUpperCase() + dataType.slice(1)}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Success State */}
          {importResult && importResult.status === 'success' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-green-900 mb-2">Import Successful</h3>
              <p className="text-green-800 mb-4">
                {importResult.imported} of {importResult.total} records imported successfully
              </p>
              <Button
                onClick={onClose}
                className="bg-green-600 hover:bg-green-700"
              >
                Done
              </Button>
            </div>
          )}

          {/* Error State */}
          {importResult && importResult.status === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <div className="flex gap-3 mb-4">
                <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-red-900 mb-1">Import Failed</h3>
                  <p className="text-red-800 text-sm">
                    {importResult.errors[0] || 'An error occurred'}
                  </p>
                </div>
              </div>
              {importResult.errors.length > 1 && (
                <Button
                  variant="outline"
                  onClick={handleDownloadErrors}
                  className="gap-2 w-full"
                >
                  <Download className="w-4 h-4" />
                  Download Error Report
                </Button>
              )}
              <Button
                onClick={() => {
                  setImportResult(null);
                  setSelectedFile(null);
                  setFilePreview(null);
                }}
                className="mt-3 w-full"
              >
                Try Again
              </Button>
            </div>
          )}

          {/* Upload Section */}
          {!importResult && (
            <>
              {/* Drag Drop Zone */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragActive
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-300 hover:border-slate-400'
                }`}
              >
                <Upload className="w-10 h-10 mx-auto mb-3 text-slate-400" />
                <p className="font-semibold text-slate-900 mb-1">
                  Drag and drop your CSV file here
                </p>
                <p className="text-sm text-slate-600 mb-4">
                  Or click to browse your computer
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={e => {
                    if (e.target.files?.[0]) {
                      handleFileSelect(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                >
                  Browse Files
                </Button>
              </div>

              {selectedFile && (
                <>
                  {/* File Info */}
                  <div className="bg-slate-50 rounded-lg p-4 flex justify-between items-center">
                    <div>
                      <p className="font-medium text-slate-900">{selectedFile.name}</p>
                      <p className="text-sm text-slate-600">
                        {(selectedFile.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setShowPreview(!showPreview)}
                      className="gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      {showPreview ? 'Hide' : 'Preview'}
                    </Button>
                  </div>

                  {/* File Preview */}
                  {showPreview && filePreview && (
                    <div className="bg-slate-50 rounded-lg p-4 overflow-x-auto">
                      <p className="text-sm font-semibold text-slate-900 mb-3">
                        File Preview (first 10 rows)
                      </p>
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr>
                            {filePreview.headers.map((header, i) => (
                              <th
                                key={i}
                                className="border border-slate-300 bg-slate-200 px-3 py-2 text-left font-medium text-slate-900"
                              >
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filePreview.rows.map((row, i) => (
                            <tr key={i}>
                              {row.map((cell, j) => (
                                <td
                                  key={j}
                                  className="border border-slate-300 px-3 py-2 text-slate-600 truncate max-w-xs"
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Column Mapping */}
                  {filePreview && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <h3 className="font-semibold text-slate-900">Column Mapping</h3>
                        <p className="text-xs text-slate-600">
                          {Object.keys(columnMapping).length} of{' '}
                          {expectedColumns[dataType].length} mapped
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {expectedColumns[dataType].map(expected => (
                          <div key={expected}>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              {expected}
                              {expectedColumns[dataType].slice(0, Math.ceil(expectedColumns[dataType].length / 2)).includes(expected) && (
                                <span className="text-red-600">*</span>
                              )}
                            </label>
                            <select
                              value={columnMapping[expected] || ''}
                              onChange={e =>
                                handleColumnMappingChange(expected, e.target.value)
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">Select column...</option>
                              {filePreview.headers.map(header => (
                                <option key={header} value={header}>
                                  {header}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Import Mode */}
                  {filePreview && (
                    <div className="space-y-2">
                      <label className="block font-semibold text-slate-900">
                        Import Mode
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex items-center gap-3 p-3 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                          <input
                            type="radio"
                            name="import-mode"
                            value="replace"
                            checked={importMode === 'replace'}
                            onChange={() => setImportMode('replace')}
                            className="w-4 h-4"
                          />
                          <div>
                            <p className="font-medium text-slate-900">Replace</p>
                            <p className="text-xs text-slate-600">Remove old data</p>
                          </div>
                        </label>
                        <label className="flex items-center gap-3 p-3 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                          <input
                            type="radio"
                            name="import-mode"
                            value="update"
                            checked={importMode === 'update'}
                            onChange={() => setImportMode('update')}
                            className="w-4 h-4"
                          />
                          <div>
                            <p className="font-medium text-slate-900">Update</p>
                            <p className="text-xs text-slate-600">Keep existing data</p>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Progress Bar */}
                  {isImporting && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-slate-900">Importing...</span>
                        <span className="text-slate-600">{progress}%</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-3">
                        <div
                          className="bg-blue-500 h-3 rounded-full transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  {!isImporting && (
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSelectedFile(null);
                          setFilePreview(null);
                          setColumnMapping({});
                        }}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleImport}
                        disabled={isImporting}
                        className="flex-1 bg-blue-600 hover:bg-blue-700"
                      >
                        Import Data
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataUploadModal;
