import React from 'react';

interface EmailPreviewProps {
  from?: string;
  to?: string;
  subject?: string;
  htmlBody: string;
  className?: string;
}

const EmailPreview: React.FC<EmailPreviewProps> = ({
  from = 'notifications@shdt.co.uk',
  to = 'tenant@example.com',
  subject = 'Notification',
  htmlBody,
  className = '',
}) => {
  return (
    <div className={`flex flex-col bg-white border border-gray-300 rounded-lg overflow-hidden ${className}`}>
      {/* Email Header */}
      <div className="bg-gray-100 border-b border-gray-300 p-4">
        <div className="space-y-2">
          <div className="flex">
            <span className="text-sm font-semibold text-gray-700 w-16">From:</span>
            <span className="text-sm text-gray-900">{from}</span>
          </div>
          <div className="flex">
            <span className="text-sm font-semibold text-gray-700 w-16">To:</span>
            <span className="text-sm text-gray-900">{to}</span>
          </div>
          <div className="flex">
            <span className="text-sm font-semibold text-gray-700 w-16">Subject:</span>
            <span className="text-sm text-gray-900 font-medium">{subject}</span>
          </div>
        </div>
      </div>

      {/* Email Body */}
      <div className="flex-1 overflow-auto bg-white">
        <div
          className="prose prose-sm max-w-none p-6"
          dangerouslySetInnerHTML={{ __html: htmlBody }}
          style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            lineHeight: '1.6',
            color: '#333',
          }}
        />
      </div>

      {/* Footer */}
      <div className="bg-gray-50 border-t border-gray-300 px-6 py-4 text-xs text-gray-600">
        <p>
          This is an automated message from SHDT Notifications. Please do not reply to this email.
          <br />
          If you wish to manage your notification preferences, please contact your property manager.
        </p>
      </div>
    </div>
  );
};

export default EmailPreview;
