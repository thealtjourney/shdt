# SHDT Notification Frontend - Implementation Guide

## Overview

This document describes the notification hub and management system for SHDT (Smart Housing Disaster Tracker). The notification frontend provides a comprehensive interface for managing alerts, tenants, and notification rules.

## Files Created

### Pages

#### 1. **NotificationCentre.tsx**
Main notification hub featuring:

- **Top Stats Bar**: Four metric cards showing:
  - Pending Approvals count
  - Alerts sent today
  - Alerts sent this week
  - Delivery success rate

- **Amber Warning Banner**: Displays when pending approvals > 0, indicating action needed

- **Pending Approvals Section**:
  - Color-coded severity badges (critical=red, warning=amber, info=blue)
  - Shows alert type, severity, trigger time, description, affected area
  - Property and tenant count statistics
  - "Preview & Approve" button opens modal with email preview
  - "Dismiss" button removes approval from queue
  - Preview modal shows rendered email and "Send to X tenants" confirmation

- **Recent Alerts Timeline**:
  - Chronological feed of sent/pending/failed alerts
  - Filterable by status (All/Sent/Pending/Failed)
  - Expandable details showing recipient count and send time
  - Status indicators (green checkmark, amber clock, red alert)

- **Compose Notification Multi-Step Modal**:
  - Step 1: Select recipients (All Tenants / By Postcode / Specific Property)
  - Step 2: Compose message (Subject + Body textarea)
  - Step 3: Preview message with recipient summary
  - Step 4: Confirmation screen with success message
  - Can navigate back/forward through steps

#### 2. **TenantManagement.tsx**
Comprehensive tenant management interface with:

- **Searchable & Sortable Table** featuring columns:
  - Name, Email, Property, Postcode
  - Status (Active/Inactive), Consent (Yes/No)
  - Last Notified date
  - Action buttons (expand details, delete)

- **Search & Filter Controls**:
  - Real-time search across name, email, property, postcode
  - Sort by: Name, Postcode, Last Notified
  - Sort order toggle (ASC/DESC)

- **Expandable Tenant Details** showing:
  - Notification preferences (Email, SMS, Emergency Only toggles)
  - Notification history with type, subject, and timestamp

- **Action Buttons**:
  - Add Tenant button (opens form modal)
  - Import CSV button (drag-drop or browse file)
  - Export CSV button (exports current table as CSV)

- **Add Tenant Modal**:
  - Form fields: Name, Email, Property, Postcode
  - Creates new tenant with default settings (active, consent given)

- **Import CSV Modal**:
  - Drag-drop file interface
  - Expected columns: Name, Email, Property, Postcode
  - File browse fallback

#### 3. **AlertRules.tsx**
Admin interface for configuring automatic alert rules:

- **Rules Configuration Table** with columns:
  - Rule Name
  - Trigger Type (Flood Alert, Temperature, Maintenance, etc.)
  - Auto-Send status (Yes/No)
  - Cooldown period in minutes
  - Last Triggered timestamp
  - Enabled/Disabled toggle button
  - Edit and Delete action buttons

- **Rule Toggle** (ON/OFF):
  - Blue background when enabled
  - Gray background when disabled
  - Inline toggle without modal

- **Expandable Rule Details**:
  - Condition display (Type: Equals/Contains/GT/LT, Value)
  - Template information (which email template to use)
  - Auto-send behavior description

- **Create/Edit Rule Modal**:
  - Rule Name input
  - Trigger Type dropdown (Flood Alert, Temperature, Maintenance, Rent Due, Safety Hazard, Utility Issue)
  - Condition Builder:
    - Type: Equals, Contains, Greater Than, Less Than
    - Value: Input field for condition value
  - Template Selection (5 pre-configured templates)
  - Auto-Send toggle checkbox
  - Cooldown Period input (minutes)
  - Update/Create buttons

#### 4. **Unsubscribe.tsx**
Public unsubscribe page (no authentication required):

- **URL Pattern**: `/unsubscribe?token=xxx&type=flood`
- **Status States**:
  - Loading: Shows spinner while validating token
  - Success: Green checkmark with confirmation message
  - Error: Red alert with error message and support contact
  - Invalid Token: Amber alert explaining link issue

- **Features**:
  - Token validation against backend
  - Shows unsubscribed notification type
  - Success message confirming unsubscribe
  - Links to home, privacy policy, terms of service
  - Support contact email fallback

### Components

#### 1. **EmailPreview.tsx**
Mock email client frame component for previewing notification emails:

- **Email Header Section**:
  - From: notifications@shdt.co.uk (customizable)
  - To: recipient email (customizable)
  - Subject: email subject line (customizable)

- **Email Body**:
  - Renders HTML content from prop
  - Styled with prose classes for readable typography
  - Scrollable container for long emails
  - White background with standard email styling

- **Footer**:
  - Standard automated message disclaimer
  - Instructions not to reply
  - Link to notification preferences

#### 2. **NotificationBadge.tsx**
Reusable navigation component with notification count:

- **Features**:
  - Bell icon with badge showing pending approval count
  - Polls API every 60 seconds for updates
  - Red badge with white number (99+ for large counts)
  - Blue pulse indicator while fetching
  - Links to NotificationCentre page
  - Accessible with aria-label

- **API Integration**:
  - Fetches pending notification count on mount
  - Sets up 60-second polling interval
  - Handles loading state gracefully
  - Cleans up interval on unmount

## Styling & Design

### Color Scheme
- Primary: Blue #1B4F72 (SHDT brand)
- Neutral: White backgrounds
- Status indicators:
  - Critical: Red
  - Warning: Amber
  - Info: Blue
  - Success: Green
- Text: Gray scale from #111827 (900) to #9CA3AF (600)

### Tailwind Classes Used
- Responsive grid layouts (grid-cols-1, md:grid-cols-2, lg:grid-cols-4)
- Flexbox utilities for alignment
- Border and shadow utilities for depth
- Transition utilities for smooth interactions
- Focus ring styles for accessibility

### Responsive Design
- Mobile-first approach
- Tablet optimization (md breakpoint)
- Desktop layouts (lg breakpoint)
- Sticky headers for navigation
- Scrollable table containers on mobile

## Integration Points

### Required Routes
Add these routes to your React Router configuration:

```typescript
import NotificationCentre from './pages/NotificationCentre';
import TenantManagement from './pages/TenantManagement';
import AlertRules from './pages/AlertRules';
import Unsubscribe from './pages/Unsubscribe';
```

```jsx
<Route path="/notification-centre" element={<NotificationCentre />} />
<Route path="/tenants" element={<TenantManagement />} />
<Route path="/alert-rules" element={<AlertRules />} />
<Route path="/unsubscribe" element={<Unsubscribe />} />
```

### Navigation Bar Integration
Add NotificationBadge to your main navigation:

```jsx
import NotificationBadge from './components/NotificationBadge';

// In your navbar/header component:
<NotificationBadge className="ml-auto" />
```

### API Endpoints Required

The frontend expects these backend endpoints:

- `GET /api/notifications/pending` - Fetch pending approvals
- `GET /api/notifications/recent` - Fetch recent alerts
- `GET /api/notifications/stats` - Fetch notification statistics
- `POST /api/notifications/send` - Send a notification
- `POST /api/notifications/:id/approve` - Approve pending notification
- `DELETE /api/notifications/:id` - Dismiss pending notification
- `GET /api/tenants` - Fetch all tenants
- `POST /api/tenants` - Add new tenant
- `DELETE /api/tenants/:id` - Delete tenant
- `GET /api/tenants/export` - Export tenants as CSV
- `POST /api/tenants/import` - Import tenants from CSV
- `GET /api/alert-rules` - Fetch all alert rules
- `POST /api/alert-rules` - Create new rule
- `PUT /api/alert-rules/:id` - Update rule
- `DELETE /api/alert-rules/:id` - Delete rule
- `PATCH /api/alert-rules/:id/toggle` - Toggle rule enabled/disabled
- `GET /api/unsubscribe/validate?token=xxx` - Validate unsubscribe token
- `POST /api/unsubscribe/confirm` - Confirm unsubscribe action
- `GET /api/notifications/badge-count` - Get pending notification count for badge

## State Management Notes

Currently using React local state with `useState`. For production, consider:

- Redux or Zustand for global state
- React Query for server state and caching
- WebSocket for real-time updates instead of polling
- Local storage for temporary UI state

## Accessibility Features

- Semantic HTML (buttons, forms, tables)
- ARIA labels on icon buttons
- Keyboard navigation support
- Focus ring styling on interactive elements
- Color contrast compliance (WCAG AA)
- Expandable sections with appropriate indicators

## Security Considerations

- Unsubscribe page uses token validation (no user auth required)
- CSRF protection should be implemented on form submissions
- Input sanitization for HTML in email preview
- CSV import validation to prevent injection attacks
- Proper authorization checks on all admin endpoints

## Testing Recommendations

- Unit tests for modal state management
- Integration tests for form submissions
- E2E tests for multi-step compose flow
- Responsive design testing on tablet/mobile
- Email preview rendering tests with various HTML content
- Token validation edge cases for unsubscribe

## Future Enhancements

1. Real-time notifications via WebSocket
2. Email template editor UI
3. Advanced recipient filtering (demographics, behavior)
4. Notification scheduling (send at specific times)
5. A/B testing for notification content
6. Analytics dashboard for open/click rates
7. Integration with SMS/push notification channels
8. Notification history archival and search
9. Bulk operations (approve/dismiss multiple)
10. Notification template library with presets
