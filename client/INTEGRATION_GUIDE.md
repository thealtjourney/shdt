# SHDT Notification Frontend - Integration Guide

## Quick Start Integration

### Step 1: Update React Router Configuration

Add these routes to your main router file (likely `src/main.tsx` or `src/App.tsx`):

```typescript
import NotificationCentre from './pages/NotificationCentre';
import TenantManagement from './pages/TenantManagement';
import AlertRules from './pages/AlertRules';
import Unsubscribe from './pages/Unsubscribe';
import ProtectedRoute from './components/ProtectedRoute';

// In your router configuration:
<Routes>
  {/* Existing routes */}

  {/* Notification routes - protected except unsubscribe */}
  <Route
    path="/notification-centre"
    element={
      <ProtectedRoute>
        <NotificationCentre />
      </ProtectedRoute>
    }
  />
  <Route
    path="/tenants"
    element={
      <ProtectedRoute requiredRole="admin">
        <TenantManagement />
      </ProtectedRoute>
    }
  />
  <Route
    path="/alert-rules"
    element={
      <ProtectedRoute requiredRole="admin">
        <AlertRules />
      </ProtectedRoute>
    }
  />

  {/* Public unsubscribe - no authentication */}
  <Route path="/unsubscribe" element={<Unsubscribe />} />
</Routes>
```

### Step 2: Add Notification Badge to Navigation

Update your main navigation component (e.g., `src/components/Navigation.tsx`):

```typescript
import NotificationBadge from './NotificationBadge';

export const Navigation: React.FC = () => {
  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and main navigation */}
          <div className="flex items-center gap-8">
            <a href="/" className="text-xl font-bold text-blue-600">SHDT</a>
            <a href="/dashboard" className="text-gray-700 hover:text-blue-600">Dashboard</a>
          </div>

          {/* Right side with notification badge */}
          <div className="flex items-center gap-4">
            <NotificationBadge />
            {/* Other navigation items */}
          </div>
        </div>
      </div>
    </nav>
  );
};
```

### Step 3: Connect to Backend APIs

Create an API service file (`src/services/notificationApi.ts`):

```typescript
// Base URL - update to match your backend
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

export const notificationApi = {
  // Notifications
  getPendingApprovals: () =>
    fetch(`${API_BASE}/notifications/pending`).then(r => r.json()),

  getRecentAlerts: () =>
    fetch(`${API_BASE}/notifications/recent`).then(r => r.json()),

  getStats: () =>
    fetch(`${API_BASE}/notifications/stats`).then(r => r.json()),

  sendNotification: (data: any) =>
    fetch(`${API_BASE}/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  approveNotification: (id: string) =>
    fetch(`${API_BASE}/notifications/${id}/approve`, { method: 'POST' })
      .then(r => r.json()),

  dismissNotification: (id: string) =>
    fetch(`${API_BASE}/notifications/${id}`, { method: 'DELETE' })
      .then(r => r.json()),

  getPendingCount: () =>
    fetch(`${API_BASE}/notifications/badge-count`).then(r => r.json()),

  // Tenants
  getTenants: () =>
    fetch(`${API_BASE}/tenants`).then(r => r.json()),

  addTenant: (data: any) =>
    fetch(`${API_BASE}/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  deleteTenant: (id: string) =>
    fetch(`${API_BASE}/tenants/${id}`, { method: 'DELETE' })
      .then(r => r.json()),

  exportTenants: () =>
    fetch(`${API_BASE}/tenants/export`),

  importTenants: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`${API_BASE}/tenants/import`, {
      method: 'POST',
      body: formData,
    }).then(r => r.json());
  },

  // Alert Rules
  getRules: () =>
    fetch(`${API_BASE}/alert-rules`).then(r => r.json()),

  createRule: (data: any) =>
    fetch(`${API_BASE}/alert-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  updateRule: (id: string, data: any) =>
    fetch(`${API_BASE}/alert-rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(r => r.json()),

  deleteRule: (id: string) =>
    fetch(`${API_BASE}/alert-rules/${id}`, { method: 'DELETE' })
      .then(r => r.json()),

  toggleRule: (id: string) =>
    fetch(`${API_BASE}/alert-rules/${id}/toggle`, { method: 'PATCH' })
      .then(r => r.json()),

  // Unsubscribe
  validateToken: (token: string) =>
    fetch(`${API_BASE}/unsubscribe/validate?token=${token}`)
      .then(r => r.json()),

  confirmUnsubscribe: (token: string, type: string) =>
    fetch(`${API_BASE}/unsubscribe/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, type }),
    }).then(r => r.json()),
};
```

### Step 4: Replace Mock Data in Components

Example for `NotificationCentre.tsx`:

**Before (mock data):**
```typescript
const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([
  { id: '1', alertType: 'Flood Warning', ... }
]);
```

**After (API call):**
```typescript
const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);

useEffect(() => {
  const fetchApprovals = async () => {
    try {
      const data = await notificationApi.getPendingApprovals();
      setPendingApprovals(data);
    } catch (error) {
      console.error('Failed to fetch approvals:', error);
    }
  };

  fetchApprovals();
}, []);
```

### Step 5: Update NotificationBadge Polling

Replace mock fetch in `NotificationBadge.tsx`:

**Before:**
```typescript
const fetchPendingNotifications = async () => {
  setIsLoading(true);
  try {
    const response = await new Promise<number>((resolve) => {
      setTimeout(() => {
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
```

**After:**
```typescript
const fetchPendingNotifications = async () => {
  setIsLoading(true);
  try {
    const data = await notificationApi.getPendingCount();
    setPendingCount(data.count || 0);
  } catch (error) {
    console.error('Failed to fetch pending notifications:', error);
  } finally {
    setIsLoading(false);
  }
};
```

### Step 6: Update Environment Variables

Create/update `.env`:

```bash
# API Configuration
REACT_APP_API_URL=http://localhost:3000/api
REACT_APP_ENVIRONMENT=development

# Email Configuration
REACT_APP_EMAIL_FROM=notifications@shdt.co.uk
REACT_APP_SUPPORT_EMAIL=support@shdt.co.uk
```

## State Management Enhancement (Optional)

For production apps with complex state, consider using Zustand or Redux:

### Example with Zustand:

```typescript
// src/stores/notificationStore.ts
import { create } from 'zustand';
import { notificationApi } from '../services/notificationApi';

interface NotificationStore {
  pendingApprovals: PendingApproval[];
  recentAlerts: RecentAlert[];
  stats: Stats;
  loading: boolean;
  error: string | null;

  fetchApprovals: () => Promise<void>;
  fetchAlerts: () => Promise<void>;
  fetchStats: () => Promise<void>;
  approveNotification: (id: string) => Promise<void>;
  dismissNotification: (id: string) => Promise<void>;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  pendingApprovals: [],
  recentAlerts: [],
  stats: { pendingCount: 0, sentToday: 0, sentThisWeek: 0, successRate: 0 },
  loading: false,
  error: null,

  fetchApprovals: async () => {
    set({ loading: true });
    try {
      const data = await notificationApi.getPendingApprovals();
      set({ pendingApprovals: data, error: null });
    } catch (error) {
      set({ error: 'Failed to fetch approvals' });
    } finally {
      set({ loading: false });
    }
  },

  // ... other methods
}));
```

Then use in components:

```typescript
const { pendingApprovals, fetchApprovals } = useNotificationStore();

useEffect(() => {
  fetchApprovals();
}, [fetchApprovals]);
```

## Error Handling Best Practices

Add error boundaries and try-catch blocks:

```typescript
import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">Something went wrong</h3>
            <p className="text-sm text-red-700">{this.state.error?.message}</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```

Use in components:

```typescript
<ErrorBoundary>
  <NotificationCentre />
</ErrorBoundary>
```

## Loading States

Add spinner components while fetching data:

```typescript
const LoadingSpinner: React.FC = () => (
  <div className="flex items-center justify-center py-8">
    <div className="animate-spin">
      <Loader className="w-8 h-8 text-blue-600" />
    </div>
  </div>
);

// In component:
{isLoading ? <LoadingSpinner /> : <YourContent />}
```

## Testing Integration

Example test for NotificationCentre:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import NotificationCentre from './NotificationCentre';
import * as notificationApi from '../services/notificationApi';

jest.mock('../services/notificationApi');

describe('NotificationCentre', () => {
  it('fetches and displays pending approvals', async () => {
    const mockApprovals = [
      {
        id: '1',
        alertType: 'Flood Warning',
        severity: 'critical',
        triggeredAt: '2026-03-17T09:30:00Z',
        description: 'Test',
        affectedArea: 'SW1A 1AA',
        propertyCount: 8,
        tenantCount: 24,
      },
    ];

    (notificationApi.getPendingApprovals as jest.Mock).mockResolvedValue(
      mockApprovals
    );

    render(<NotificationCentre />);

    await waitFor(() => {
      expect(screen.getByText('Flood Warning')).toBeInTheDocument();
    });
  });
});
```

## Performance Optimization

### Memoization for expensive components:

```typescript
import { memo } from 'react';

const PendingApprovalCard = memo(({ approval }: { approval: PendingApproval }) => (
  // Card component
));

export default PendingApprovalCard;
```

### Virtual scrolling for long lists:

```typescript
import { FixedSizeList } from 'react-window';

const AlertsList = ({ alerts }: { alerts: RecentAlert[] }) => (
  <FixedSizeList
    height={600}
    itemCount={alerts.length}
    itemSize={80}
    width="100%"
  >
    {({ index, style }) => (
      <div style={style}>
        <AlertRow alert={alerts[index]} />
      </div>
    )}
  </FixedSizeList>
);
```

## Deployment Checklist

- [ ] All mock data replaced with API calls
- [ ] Error boundaries implemented
- [ ] Loading states added
- [ ] Environment variables configured
- [ ] API endpoints tested and working
- [ ] Authentication/authorization verified
- [ ] CORS configured on backend
- [ ] Email templates created on backend
- [ ] CSV import validation working
- [ ] Token validation for unsubscribe working
- [ ] Badge polling every 60 seconds
- [ ] Mobile responsive testing complete
- [ ] Accessibility testing (axe, keyboard nav)
- [ ] Performance testing (Lighthouse)
- [ ] Security review (XSS, CSRF, injection)
- [ ] Error logs configured
- [ ] Analytics tracking added

## Support & Troubleshooting

### Common Issues

**1. Components not rendering**
- Check routes are added correctly
- Verify imports are correct
- Check for React Router provider in main.tsx

**2. API calls failing**
- Verify API_URL environment variable
- Check CORS headers on backend
- Verify authentication tokens

**3. Polling not working**
- Check NotificationBadge is mounted
- Verify API endpoint returns expected format
- Check browser console for errors

**4. Styling issues**
- Ensure Tailwind CSS is configured
- Check Tailwind purge includes src/ directory
- Verify Lucide React icons are imported

## Additional Resources

- React Documentation: https://react.dev
- Tailwind CSS: https://tailwindcss.com
- Lucide Icons: https://lucide.dev
- TypeScript Handbook: https://www.typescriptlang.org/docs

For questions or issues, refer to the main NOTIFICATION_FRONTEND_README.md file.
