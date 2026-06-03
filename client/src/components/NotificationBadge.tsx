import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';

interface NotificationBadgeProps {
  className?: string;
}

const NotificationBadge: React.FC<NotificationBadgeProps> = ({ className = '' }) => {
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPendingNotifications = async () => {
    setIsLoading(true);
    try {
      // In a real app, this would fetch from the backend API
      // For now, we'll simulate it
      const response = await new Promise<number>((resolve) => {
        setTimeout(() => {
          // Simulated API call - in production, replace with actual fetch
          resolve(Math.random() > 0.5 ? 1 : 0);
        }, 300);
      });

      setPendingCount(response);
    } catch (error) {
      console.error('Failed to fetch pending notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Fetch immediately on mount
    fetchPendingNotifications();

    // Set up polling every 60 seconds
    const interval = setInterval(fetchPendingNotifications, 60000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Link
      to="/notification-centre"
      className={`relative inline-flex items-center justify-center p-2 text-gray-700 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition ${className}`}
      aria-label="Notifications"
    >
      <Bell className="w-6 h-6" />

      {pendingCount > 0 && (
        <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1 -translate-y-1 bg-red-600 rounded-full">
          {pendingCount > 99 ? '99+' : pendingCount}
        </span>
      )}

      {isLoading && (
        <span className="absolute top-0 right-0 w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
      )}
    </Link>
  );
};

export default NotificationBadge;
