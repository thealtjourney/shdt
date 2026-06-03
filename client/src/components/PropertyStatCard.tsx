import React from 'react';

interface PropertyStatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number | undefined;
  unit?: string;
}

export default function PropertyStatCard({
  icon,
  label,
  value,
  unit,
}: PropertyStatCardProps) {
  return (
    <div className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="text-gray-600 mb-2 flex-shrink-0">
        {icon}
      </div>
      <p className="text-xs text-gray-500 uppercase tracking-wide text-center">
        {label}
      </p>
      <p className="text-lg font-semibold text-gray-900 mt-1">
        {value !== undefined ? value : 'N/A'}
        {unit && <span className="text-sm font-normal text-gray-600 ml-1">{unit}</span>}
      </p>
    </div>
  );
}
