# SHDT User Guide

## Introduction

SHDT (Supportive Housing Data Tracker) is a comprehensive platform for managing and tracking housing inventory, occupancy, and resident information for supportive housing programs. This guide provides instructions for using all major features of the system.

## Getting Started

### Logging In

1. Navigate to the SHDT application URL (e.g., https://yourdomain.com)
2. Enter your email address
3. Enter your password
4. Click "Sign In"
5. You will be redirected to the Dashboard

**Password Requirements:**
- Minimum 12 characters
- At least one uppercase letter
- At least one number
- At least one special character (!@#$%^&*)

### Resetting Your Password

1. Click "Forgot Password?" on the login page
2. Enter your email address
3. Click "Send Reset Link"
4. Check your email for reset instructions
5. Click the link and create a new password
6. Return to login with your new password

### User Profile Settings

1. Click your name in the top right corner
2. Select "Profile Settings"
3. Update information as needed:
   - Name
   - Email address
   - Phone number
   - Department/Program
4. Click "Save Changes"

## Dashboard

### Overview

The Dashboard is your main hub for accessing all SHDT features. Key sections:

**Quick Stats**
- Total Housing Units
- Active Occupancy Rate
- Units Needing Attention
- Recent Imports

**Quick Actions**
- Import Data
- Add New Unit
- View Reports
- Export Data

**Recent Activity**
- Latest data changes
- Recent imports
- User activity log

### Customizing Your Dashboard

1. Click "Customize" in the top right
2. Select which widgets to display
3. Drag to reorder sections
4. Click "Save Layout"

**Available Widgets:**
- Occupancy Overview
- Program Distribution
- Geographic Heat Map
- Upcoming Lease Expirations
- Unit Status Summary
- Data Quality Score

## Housing Inventory Management

### Viewing Housing Units

#### List View

1. Click "Housing" → "All Units"
2. Browse the list of all housing units
3. Use filters to narrow results:
   - **Status**: Active, Inactive, Under Renovation
   - **Program Type**: PSH, RRH, IH, Transitional, Emergency
   - **Operator**: Filter by managing organization
   - **Bedrooms**: Filter by unit size
   - **City/District**: Geographic filter
4. Click column headers to sort
5. Click any unit name to view/edit details

#### Map View

1. Click "Housing" → "Map View"
2. View all units as markers on interactive map
3. Zoom and pan to explore
4. Click markers to see unit details
5. Use layer controls to show/hide categories
6. Draw radius circles to see nearby units
7. Use search box to find specific units

#### Table View

1. Click "Housing" → "Detailed Table"
2. View all unit fields in sortable table
3. Export table to Excel or CSV
4. Filter and search within table
5. Adjust column visibility and width

### Adding a New Unit

1. Click "Housing" → "New Unit" or "Add Unit" button
2. Fill in required fields (marked with *):
   - Unit ID
   - Unit Name
   - Address
   - City/State/ZIP
   - Bedrooms
   - Bathrooms
   - Unit Type
   - Capacity
3. Fill in optional fields:
   - Program Type
   - Operator Name
   - Contact Information
   - Rent/Subsidy Amounts
   - Accessibility Features
   - Pet Policy
   - Utilities Included
4. Click "Save Unit"
5. Unit appears in all views and reports

### Editing Unit Details

1. Navigate to the unit (via List, Map, or Table view)
2. Click the unit to open details panel
3. Click "Edit" button
4. Modify desired fields
5. Click "Save Changes"
6. Changes are logged in audit trail

### Unit Status Management

Units can have the following statuses:

- **Active**: Currently operating and accepting residents
- **Inactive**: Temporarily not accepting new residents
- **Under Renovation**: Undergoing repairs or improvements
- **Planned**: Future unit not yet operational
- **Closed**: Permanently closed

To change unit status:

1. Open unit details
2. Click "Edit"
3. Change "Status" dropdown
4. Add status change reason (optional)
5. Click "Save Changes"

### Viewing Unit History

1. Open unit details
2. Click "History" tab
3. View chronological list of all changes
4. See who made each change and when
5. Click on any change to see details

## Occupancy Management

### Current Occupancy Tracking

1. Click "Occupancy" → "Current Status"
2. View current occupancy for all units
3. Units are color-coded:
   - **Green**: Normal occupancy (> 75%)
   - **Yellow**: Below target (50-75%)
   - **Red**: Significantly below target (< 50%)
4. Click unit to view/edit occupancy

### Recording Occupancy Changes

1. Navigate to unit details
2. Click "Occupancy" tab
3. View "Current Occupancy" field
4. Click "Update Occupancy"
5. Enter new occupancy number
6. Select date of change
7. Add optional notes
8. Click "Save"

**Changes automatically logged with:**
- Previous occupancy
- New occupancy
- Change date
- Who made the change

### Occupancy Trends

1. Click "Occupancy" → "Trends"
2. Select date range (last 30/90/365 days)
3. View graphs showing:
   - Average occupancy over time
   - Peak occupancy periods
   - Lowest occupancy periods
   - Seasonal patterns
4. Compare specific units
5. Export trend data

### Occupancy Reports

1. Click "Reports" → "Occupancy"
2. Select report type:
   - **Summary**: Overview of all units
   - **Detailed**: Unit-by-unit breakdown
   - **Historical**: Trends over time
3. Select date range
4. Apply filters (program, operator, etc.)
5. Click "Generate Report"
6. Download as PDF or Excel

## Data Import

### CSV Import Process

1. Click "Admin" → "Data Import"
2. Click "Choose File" button
3. Select your CSV file from your computer
4. System displays preview of first 5 rows
5. Review field mapping (usually auto-detected)
6. Edit mappings if needed (drag column headers)
7. Click "Validate Data"
8. Review any validation errors/warnings
9. Correct errors if necessary (or re-upload corrected file)
10. Click "Import Data"
11. Monitor progress bar
12. Review import summary:
    - Total records processed
    - Successfully imported
    - Rows with errors
    - Warnings (if any)

**Supported File Formats:**
- CSV (Comma-Separated Values)
- Excel (.xlsx, .xls)
- Tab-separated (.tsv)

### Mapping CSV Columns

During import, map your CSV columns to SHDT fields:

**Common Mappings:**
```
Your CSV Column → SHDT Field
---
Residence ID → Unit ID
Residence Name → Unit Name
Full Address → Address
City Name → City
State Code → State
ZIP Code → ZIP Code
Bedrooms → Bed Count
Bathrooms → Bath Count
Max Capacity → Capacity
```

1. Click "Edit Mapping"
2. For each CSV column, select corresponding SHDT field
3. Mark fields as required if needed
4. Click "Save Mapping"
5. Mapping is saved for future imports from same source

### Import History

1. Click "Admin" → "Data Import"
2. Click "Import History" tab
3. View all past imports:
   - File name
   - Date imported
   - Records processed
   - Success/error counts
4. Click any import to see details:
   - Detailed row-by-row results
   - Error messages for failed rows
   - Data quality warnings
5. Download import report

### Bulk Updates

To update multiple existing units:

1. Export current data
2. Edit the exported file with new information
3. Import using "Update Mode":
   - Click "Advanced Options" during import
   - Select "Update Existing Records"
   - System will match by Unit ID
   - Updates only changed fields
4. Complete import as normal

## Searching and Filtering

### Simple Search

1. Use search box at top of page
2. Type unit name, address, or ID
3. Results appear instantly
4. Click result to open unit details

### Advanced Filters

1. Click "Filters" button
2. Add filters as needed:
   - **Status**: Active, Inactive, etc.
   - **Program Type**: PSH, RRH, IH, etc.
   - **Operator**: By managing organization
   - **Location**: By city or district
   - **Occupancy Range**: Min-max occupancy
   - **Bedrooms**: Filter by unit size
   - **Date Range**: Created/modified dates
3. Combine multiple filters
4. Click "Apply Filters"
5. Results update automatically

### Saving Filter Sets

1. Create your filter combination
2. Click "Save Filter As..."
3. Enter a name (e.g., "Active PSH Units")
4. Click "Save"
5. Future access: Click "Saved Filters" → select saved filter

## Reporting

### Pre-built Reports

1. Click "Reports"
2. Select report type:
   - **Inventory**: Housing unit summary
   - **Occupancy**: Current and historical
   - **Program Performance**: By program type
   - **Geographic Distribution**: By location
   - **Data Quality**: Missing/invalid fields
   - **Audit Log**: User activity
3. Configure report parameters:
   - Date range
   - Filters
   - Detail level
4. Click "Generate"
5. View in browser or download

### Custom Reports

1. Click "Reports" → "Custom Report"
2. Select fields to include
3. Add filters
4. Choose grouping (by program, location, etc.)
5. Select visualization:
   - Table
   - Chart
   - Map
6. Click "Generate"
7. Download or save as template

### Report Export

Reports can be exported as:
- **PDF**: For printing/sharing
- **Excel**: For further analysis
- **CSV**: For data integration
- **JSON**: For API integration

To export:
1. Generate desired report
2. Click "Download" or "Export"
3. Select format
4. Choose options:
   - Include charts
   - Include filters used
   - Include timestamp
5. Click "Export"

## Geographic Features

### Map View

1. Click "Housing" → "Map View"
2. Interactive map displays all units
3. Features:
   - **Zoom**: Scroll wheel or +/- buttons
   - **Pan**: Click and drag
   - **Marker Colors**: By status or program
   - **Click Marker**: Show unit details
   - **Layer Toggle**: Show/hide categories

### Geographic Queries

1. Click "Housing" → "Geographic Search"
2. Define search area:
   - **Draw Circle**: Click center point, drag radius
   - **Draw Rectangle**: Click corners
   - **Enter Coordinates**: Lat/Long or address
   - **City/District**: Select from list
3. View units in search area
4. Filter results by type/status
5. Export list

### Proximity Analysis

1. Click "Housing" → "Proximity Analysis"
2. Select reference unit or address
3. Set distance radius (1, 5, 10, 25 miles)
4. View nearby units
5. Analyze:
   - Nearest units
   - Clustering patterns
   - Service area coverage
6. Export results

### Heat Maps

1. Click "Housing" → "Heat Map"
2. Select metric:
   - Occupancy Density
   - Unit Concentration
   - Program Distribution
   - Availability
3. View map with color intensity
4. Intensity = concentration of selected metric
5. Hover for details
6. Zoom to explore specific areas

## Reports and Analytics

### Dashboard Reports

The home dashboard displays quick stats:
- Occupancy rate
- Active units count
- Percentage by program type
- Recent activity

### Standard Reports

Navigate to Reports section:

**Inventory Report**
- Total units by status
- Breakdown by program type
- Breakdown by operator
- Geographic distribution
- Capacity analysis

**Occupancy Report**
- Current occupancy by unit
- Occupancy rate by program
- Occupancy trends
- Vacant unit list
- Over-occupancy alerts

**Program Performance**
- Performance by program type
- Operator comparisons
- Waiting list length
- Average stay duration
- Unit turnover rate

### Trend Analysis

1. Click "Analytics" → "Trends"
2. Select metric to track
3. Set date range
4. View line chart showing trend
5. Compare multiple metrics
6. Export trend data

### Data Quality Dashboard

1. Click "Admin" → "Data Quality"
2. View quality metrics:
   - Completeness (% fields filled)
   - Accuracy (validation issues)
   - Consistency (data standards met)
   - Currency (last update date)
3. Identify problem areas:
   - Missing required fields
   - Invalid values
   - Stale data (> 90 days old)
4. Export quality report
5. View recommendations for improvements

## User Management (Admin Only)

### Managing Users

1. Click "Admin" → "User Management"
2. View all system users
3. Click user to edit:
   - Name
   - Email
   - Role/Permissions
   - Status (active/inactive)
4. Click "Save Changes"

### Roles and Permissions

**Viewer**
- Read-only access
- View reports
- Export data
- Cannot edit

**Data Entry**
- Create/edit units
- Update occupancy
- Import data
- Cannot delete
- Cannot manage users

**Program Manager**
- Full data access
- Can delete units (mark inactive)
- Manage operators
- Generate reports
- Cannot manage users/system

**Administrator**
- Full system access
- Manage users
- Configure settings
- System maintenance
- Backup/restore

### Inviting New Users

1. Click "Admin" → "User Management"
2. Click "Invite User"
3. Enter email address
4. Select role
5. Click "Send Invitation"
6. User receives email with login link
7. User creates their password on first login

### Disabling User Access

1. Click "Admin" → "User Management"
2. Find user
3. Click user to edit
4. Change "Status" to "Inactive"
5. Click "Save Changes"
6. User cannot log in but data remains

## Settings and Configuration

### Application Settings

1. Click "Admin" → "Settings"
2. Configure:
   - **Organization Name**: Display name
   - **Logo**: Upload custom logo
   - **Timezone**: For all dates/times
   - **Date Format**: MM/DD/YYYY or other
   - **Default Program Type**: Pre-selection
   - **Currency**: For rent/subsidy amounts

### Data Configuration

1. Click "Admin" → "Data Settings"
2. Configure unit fields:
   - **Required Fields**: Which fields are mandatory
   - **Field Order**: Display order in forms
   - **Unit Type Options**: Available choices
   - **Program Type Options**: Available choices
   - **Status Options**: Custom statuses
3. Click "Save Configuration"

### Integration Settings

1. Click "Admin" → "Integrations"
2. Available integrations:
   - **Salesforce**: CRM integration
   - **Slack**: Notifications
   - **Box**: File storage
   - **Tableau**: Advanced analytics
3. Click integration to configure
4. Authenticate and authorize access
5. Select data to sync

## Notifications and Alerts

### Alert Settings

1. Click your name → "Notification Settings"
2. Select alert types:
   - **Critical Alerts**: System issues
   - **Import Notifications**: When imports complete
   - **Report Ready**: When generated reports available
   - **Data Quality Issues**: When problems detected
   - **Weekly Digest**: Summary of activity
3. Choose notification method:
   - Email
   - In-app notification
   - SMS (if enabled)
4. Click "Save Preferences"

### Alert Examples

- Unit marked inactive unexpectedly
- Occupancy reaches 0
- Data import fails
- Duplicate unit IDs detected
- Large occupancy change (>25%)
- Certificate renewal approaching

## Troubleshooting

### Common Issues

**Can't Log In**
- Verify email is correct
- Use "Forgot Password" to reset
- Check password requirements
- Contact administrator if still issues

**Data Not Showing**
- Check filters are not hiding data
- Verify you have permission to view
- Refresh page (Ctrl+R or Cmd+R)
- Contact administrator

**Import Fails**
- Check CSV file format
- Verify columns match requirements
- Look for duplicate unit IDs
- Contact administrator with error message

**Map Not Loading**
- Check internet connection
- Clear browser cache
- Try different browser
- Contact support

### Getting Help

1. Click "Help" in top right corner
2. Access:
   - Documentation
   - Video tutorials
   - Contact support form
   - Knowledge base
3. For urgent issues:
   - Email: support@yourdomain.com
   - Phone: 1-800-XXX-XXXX
   - Online chat (during business hours)

## Best Practices

### Data Entry
- Update occupancy weekly
- Keep contact information current
- Use consistent naming conventions
- Complete all optional fields when available

### Imports
- Validate data before importing
- Schedule imports during off-hours
- Back up data before large imports
- Review import reports for errors

### Regular Maintenance
- Review data quality monthly
- Archive inactive records
- Update contact information
- Test backups regularly

### Security
- Use strong passwords
- Never share login credentials
- Log out when away from computer
- Report suspicious activity

## Related Documentation

For more technical information, see:
- **ARCHITECTURE.md**: System design
- **DEPLOYMENT.md**: System installation
- **DATA_GUIDE.md**: Data formats and import
