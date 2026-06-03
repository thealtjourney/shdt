import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

type UnsubscribeStatus = 'loading' | 'success' | 'error' | 'invalid_token';

const Unsubscribe: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<UnsubscribeStatus>('loading');
  const [message, setMessage] = useState('');
  const [notificationType, setNotificationType] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    const type = searchParams.get('type');

    if (!token || !type) {
      setStatus('invalid_token');
      setMessage('Invalid unsubscribe link');
      return;
    }

    // Simulate token validation and processing
    const timer = setTimeout(() => {
      // In a real app, this would validate the token against a backend
      const isValidToken = token.length > 10; // Simple validation for demo

      if (isValidToken) {
        setNotificationType(type);
        setStatus('success');
        setMessage(
          `You have successfully unsubscribed from ${type} notifications. You will no longer receive these alerts.`
        );
      } else {
        setStatus('error');
        setMessage('Failed to process unsubscribe request. Please try again.');
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-600 mb-2">SHDT</h1>
          <p className="text-gray-600">Smart Housing Disaster Tracker</p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-lg shadow-lg p-8 border border-gray-200">
          {status === 'loading' && (
            <div className="text-center">
              <Loader className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" />
              <p className="text-gray-600">Processing your unsubscribe request...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <CheckCircle className="w-16 h-16 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Unsubscribe Successful</h2>
              <p className="text-gray-600 mb-6">{message}</p>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-green-900">
                  <strong>Notification Type:</strong> {notificationType}
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  You can update your notification preferences at any time by logging into your tenant portal.
                </p>

                <a
                  href="/"
                  className="inline-block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                >
                  Return to Home
                </a>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <AlertCircle className="w-16 h-16 text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Unsubscribe Failed</h2>
              <p className="text-gray-600 mb-6">{message}</p>

              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  If you continue to have issues, please contact our support team.
                </p>

                <div>
                  <a
                    href="mailto:support@shdt.co.uk"
                    className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                  >
                    Contact Support
                  </a>
                </div>
              </div>
            </div>
          )}

          {status === 'invalid_token' && (
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <AlertCircle className="w-16 h-16 text-amber-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Invalid Link</h2>
              <p className="text-gray-600 mb-6">{message}</p>

              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  The unsubscribe link appears to be invalid or expired. Please check that you've copied the full link
                  from the email.
                </p>

                <div className="flex gap-3">
                  <a
                    href="/"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition text-center"
                  >
                    Home
                  </a>
                  <a
                    href="mailto:support@shdt.co.uk"
                    className="flex-1 border border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold py-2 px-4 rounded-lg transition text-center"
                  >
                    Support
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="text-center mt-8 text-xs text-gray-500">
          <p>SHDT Notification Center</p>
          <p className="mt-1">
            <a href="/" className="text-blue-600 hover:underline">
              Privacy Policy
            </a>
            {' • '}
            <a href="/" className="text-blue-600 hover:underline">
              Terms of Service
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Unsubscribe;
