Employee Work Management SaaS
Master Product Requirements & AI Development Prompt
1. ROLE
You are a senior software architect, product engineer, UX designer and AI-assisted development agent.

Your job is to design and progressively implement a production-quality, multi-tenant SaaS platform for employee work management.

The product combines:

Employee task management
Task scheduling
Employee time tracking
Attendance
Project management
Planned vs actual analysis
Manager dashboards
Employee mobile application
Notifications
Reporting
Future AI-powered work intelligence
The product should be suitable initially for small and medium-sized businesses in New Zealand, with architecture capable of expanding internationally.

Do not copy the implementation, UI, text, diagrams, database schema or other protected expression from any existing product or presentation.

The provided SlideShare is to be treated only as high-level inspiration for the business problem and functional domain.

2. PRODUCT VISION
Build a simple employee work-management platform that allows a business to answer:

What work needs to be done?
Who is responsible for it?
When should it be done?
How long was it expected to take?
How long did it actually take?
What is each employee working on?
Which work is overdue?
Which projects are consuming more time than expected?
Who has available capacity?
How can management improve planning?
The core workflow is:

PLAN → ASSIGN → SCHEDULE → WORK → TRACK → ANALYSE → IMPROVE

3. TARGET CUSTOMERS
Initial target market:

Small and medium-sized businesses.

Potential industries:

Professional services
IT/service companies
Cleaning companies
Trades
Construction/service businesses
Maintenance companies
Small offices
Field-service organisations
Do not over-specialise the first version.

The architecture should allow industry-specific features later.

4. USERS
The system must support role-based access.

4.1 Super Administrator
Can:

Manage SaaS platform
Create/suspend organisations
View system health
Manage subscriptions
Manage platform configuration
Manage support access
4.2 Organisation Administrator
Can:

Configure company
Manage employees
Manage teams
Manage projects
Configure task categories
Manage working hours
Manage leave settings
View company reports
Configure integrations
4.3 Manager
Can:

Create tasks
Assign tasks
Schedule work
Monitor employees
Monitor task progress
Approve timesheets
View team dashboards
View project performance
Reassign work
Generate reports
4.4 Employee
Can:

View assigned work
View today's schedule
Start a task
Pause a task
Resume a task
Complete a task
Record manual time
Add notes
Upload photos/files where permitted
View personal timesheet
Request leave
View notifications
5. MULTI-TENANT SAAS ARCHITECTURE
The system must be multi-tenant.

Each organisation must have isolated data.

Example:

Organisation A

Employees
Teams
Projects
Tasks
Timesheets
Organisation B

Employees
Teams
Projects
Tasks
Timesheets
Organisation A must never be able to access Organisation B's data.

Implement tenant isolation consistently at:

API
Service
Database
Authorisation
Reporting
File storage
Every relevant database record should contain an organisation/tenant identifier.

6. CORE MODULES
The initial platform should contain:

Authentication
Organisation management
Employee management
Team management
Project management
Task management
Task scheduling
Time tracking
Timesheets
Attendance
Leave
Notifications
Dashboard
Reports
Audit logging
Mobile employee application
Future modules:

AI assistant
GPS/geofencing
Payroll integrations
Accounting integrations
Calendar integrations
Advanced workforce optimisation
7. AUTHENTICATION
Support:

Email/password
Password reset
Email verification
Session management
Logout
Role-based authorisation
Design the authentication layer so OAuth/SSO can be added later.

Security requirements:

Passwords must never be stored in plain text
Use secure password hashing
Secure session/token handling
Rate limiting
Input validation
Authorisation checks on every protected operation
8. EMPLOYEE MANAGEMENT
Organisation administrators can:

Add employee
Edit employee
Disable employee
Assign employee to team
Assign role
Set working hours
Set employment status
Employee profile should support:

Name
Email
Phone
Role
Team
Manager
Working hours
Time zone
Employment status
Do not unnecessarily collect sensitive personal information.

9. PROJECT MANAGEMENT
Managers can create:

Project

Project name
Description
Customer
Start date
End date
Status
Budget hours
Budget amount
Project manager
Projects contain tasks.

Project statuses:

Planned
Active
On Hold
Completed
Cancelled
10. TASK MANAGEMENT
Each task should support:

Task title
Description
Project
Task category
Assigned employee
Priority
Status
Estimated duration
Due date
Scheduled start
Scheduled end
Actual duration
Created by
Created date
Updated date
Priority:

Low
Normal
High
Urgent
Status:

Not Started
Scheduled
In Progress
Paused
Completed
Cancelled
Blocked
Tasks should support comments and activity history.

11. TASK SCHEDULING
Managers should be able to schedule work using a calendar.

The calendar should show:

Employee
Task
Start time
End time
Status
Priority
Prevent obvious scheduling conflicts.

Example:

Employee John:

09:00–10:00 Customer A

10:00–12:00 Project B

13:00–14:00 Customer C

The manager should be able to drag/reassign/reschedule tasks.

12. EMPLOYEE DAILY VIEW
The employee's primary screen should be:

Today's Work
Example:

09:00
Customer A
Prepare quotation
Estimated: 1 hour

[START]

10:00
Customer B
Support issue
Estimated: 2 hours

[START]

The employee should not need to navigate through complicated screens.

The application should be mobile-first.

13. TIME TRACKING
Employees can:

Start timer
Pause timer
Resume timer
Stop timer
Manually add time
Edit time subject to permissions
Every time entry should contain:

Employee
Task
Project
Start time
End time
Duration
Source
Notes
Source can be:

Timer
Manual
Imported
Maintain an audit trail for edited time.

14. PLANNED VS ACTUAL
This is a key product feature.

For every task:

Estimated:

2 hours

Actual:

3 hours 30 minutes

Display:

Variance = +1h 30m

Variance % = +75%

Managers should be able to see:

Tasks exceeding estimates
Employees with workload issues
Projects exceeding planned hours
Categories consistently exceeding estimates
This data will later feed the AI analytics engine.

15. TIMESHEETS
Employees should have:

Daily
Weekly
Monthly

timesheets.

Example:

Monday

Project A — 3h
Project B — 2h
Internal — 1h
Meetings — 1h

Total = 7h

Managers can:

Review
Approve
Reject
Request correction
Approved timesheets should become immutable or require an auditable correction process.

16. ATTENDANCE
Support:

Clock in
Clock out
Break
Total working hours
Late arrival
Early departure
Do not assume attendance tracking and task tracking are the same thing.

A user can be:

At work for 8 hours

but have only:

6 hours of task time

The system should make this distinction visible.

17. LEAVE
Support:

Annual leave
Sick leave
Other leave categories
Leave request
Manager approval
Leave calendar
Leave should affect scheduling and employee availability.

18. NOTIFICATIONS
Support notifications for:

Task assigned
Task changed
Task due soon
Task overdue
Schedule changed
Timesheet rejected
Timesheet approved
Leave approved/rejected
Design notification infrastructure so email, push and SMS can be added independently.

19. MANAGER DASHBOARD
Dashboard should provide:

Today's Overview
Employees working:

12

Tasks scheduled:

38

Tasks completed:

25

Overdue:

4

Active:

9

Team Workload
Show:

Employee
Scheduled hours
Actual hours
Remaining tasks
Capacity
Project Performance
Show:

Project
Planned hours
Actual hours
Variance
Completion %

20. REPORTING
Initial reports:

Employee
Hours worked
Tasks completed
Tasks overdue
Planned vs actual
Project
Planned hours
Actual hours
Variance
Completion
Team
Capacity
Utilisation
Task completion
Time
Daily
Weekly
Monthly
Reports should support CSV export.

Design reporting APIs so PDF/Excel export can be added later.

21. MOBILE APPLICATION
Build the employee experience primarily for mobile.

Target:

Android
iOS
Recommended approach:

Use a cross-platform framework unless there is a strong technical reason otherwise.

Candidate:

React Native or Flutter.

Mobile screens:

Login
Home
Today's Tasks
Task Details
Timer
Timesheet
Notifications
Profile
Leave
Calendar
The application should remain usable with intermittent connectivity.

Where practical, support offline task/time capture and synchronise when connectivity returns.

22. WEB APPLICATION
The web application is primarily for:

Administrators
Managers
Supervisors
Major navigation:

Dashboard
Employees
Teams
Projects
Tasks
Schedule
Timesheets
Attendance
Leave
Reports
Settings

Use a clean modern SaaS UI.

Avoid copying the UI of existing products.

23. AI FEATURES — PHASE 2
Design the data model so AI features can be added without major architectural changes.

Potential AI assistant:

Manager:

"What did John work on yesterday?"

System:

"John worked 7h 32m across five tasks..."

Manager:

"Which projects are behind schedule?"

System:

"Project ABC is currently 14% behind its planned schedule..."

Manager:

"Who has capacity tomorrow?"

System:

"Sarah has approximately 3.5 hours available."

Manager:

"Which tasks regularly take longer than estimated?"

System analyses historical task data.

Future AI features:

Natural language reporting
Schedule optimisation
Task duration prediction
Workload prediction
Anomaly detection
Automatic task creation
Automatic schedule suggestions
Project risk detection
Employee capacity analysis
AI recommendations must be explainable and must clearly distinguish between actual recorded data and AI-generated predictions.

24. PRIVACY AND SECURITY
Treat employee information as sensitive business data.

Implement:

Role-based access control
Tenant isolation
Encryption in transit
Secure password storage
Audit logging
Least-privilege access
Secure file uploads
Input validation
API authentication
Rate limiting
Backup strategy
GPS/location tracking must NOT be enabled by default.

If introduced later, it must have:

Clear user/company configuration
Appropriate disclosure
Permission controls
Auditability
Configurable retention
The product should be designed with NZ privacy obligations in mind, including the Privacy Act 2020.

Before commercial launch, obtain appropriate legal/privacy advice.

25. SUBSCRIPTION / SAAS
Design the system to support subscription tiers.

Example:

Starter
NZ$49/month
Up to 10 employees

Professional
NZ$99/month
Up to 15 employees

Additional employees charged per user.

Business
NZ$15/user/month or equivalent volume pricing.

Actual commercial pricing should remain configurable.

Subscription functionality should eventually support:

Trial
Active
Suspended
Cancelled
Payment failure
Plan upgrade
Plan downgrade
Do not hard-code pricing into the application.

26. TECHNICAL ARCHITECTURE
Use a modular architecture.

Recommended conceptual architecture:

Mobile App
│
Web App ─┼── API Gateway
│
▼
Application Services
│
┌──────┼────────┐
│ │ │
Tasks Time Users
│ │ │
└──────┼────────┘
│
PostgreSQL
│
┌──────┼─────────┐
│ │ │
Cache Files Queue
│
▼
External Services

Architecture should support cloud deployment.

Avoid unnecessary microservices in the MVP.

Start with a modular monolith unless there is a clear reason to introduce microservices.

27. DATABASE
Use a relational database.

Recommended:

PostgreSQL.

Core entities:

Organisation
User
Employee
Role
Team
Project
Task
TaskCategory
TaskAssignment
TaskSchedule
TimeEntry
Timesheet
Attendance
LeaveRequest
Notification
Comment
Attachment
AuditLog
Subscription

Use:

UUID identifiers
CreatedAt
UpdatedAt
Soft deletion where appropriate
Foreign-key constraints
Appropriate indexes
Tenant isolation
Do not create excessive tables merely for theoretical flexibility.

28. API
Create a well-documented API.

Example:

POST /auth/login

GET /employees

POST /employees

GET /projects

POST /projects

GET /tasks

POST /tasks

POST /tasks/{id}/start

POST /tasks/{id}/pause

POST /tasks/{id}/complete

GET /timesheets

POST /timesheets

POST /timesheets/{id}/approve

GET /reports/employee

GET /reports/project

API must enforce:

Authentication
Authorisation
Tenant isolation
Validation
Error handling
Rate limiting where appropriate

29. AUDIT LOG
Record important actions:

Employee created
Employee disabled
Task created
Task assigned
Task reassigned
Task changed
Time edited
Timesheet approved
Timesheet rejected
Leave approved
Permission changed
Audit record:

User
Action
Entity
Entity ID
Timestamp
Old value where appropriate
New value where appropriate

30. UX PRINCIPLES
The product must be:

Simple
Fast
Mobile-first
Easy for non-technical users
Accessible
Responsive
Employee workflow should require as few taps as possible.

Primary employee action:

OPEN APP → SEE TASK → START → WORK → COMPLETE

Manager workflow:

OPEN DASHBOARD → SEE PROBLEM → TAKE ACTION

Avoid excessive configuration.

31. MVP DEFINITION
Do NOT attempt to build every feature initially.

MVP must include:

Web
Authentication
Organisation
Employees
Teams
Projects
Tasks
Assignment
Scheduling
Dashboard
Timesheets
Basic reports
Mobile
Login
Today's tasks
Task details
Start/stop timer
Pause/resume
Complete task
Notes
Timesheet
Backend
Authentication
RBAC
Tenant isolation
PostgreSQL
REST API
Audit logging
Basic notifications
Do NOT implement AI, GPS, payroll or complex integrations in MVP unless explicitly requested.

32. DEVELOPMENT METHODOLOGY
Do not attempt to generate the entire application in one step.

Work incrementally.

Before writing code:

Analyse requirements.
Identify ambiguities.
Propose architecture.
Propose database model.
Propose API.
Propose project structure.
Create development plan.
Wait for approval before major implementation.
Then implement in vertical slices.

Recommended order:

Phase 1:
Project foundation

Phase 2:
Authentication

Phase 3:
Organisation/users

Phase 4:
Employees/teams

Phase 5:
Projects

Phase 6:
Tasks

Phase 7:
Scheduling

Phase 8:
Time tracking

Phase 9:
Timesheets

Phase 10:
Dashboard

Phase 11:
Reports

Phase 12:
Mobile application

Phase 13:
Testing

Phase 14:
Deployment

33. TESTING
Every major feature must include tests.

Include:

Unit tests
Integration tests
API tests
Authorisation tests
Tenant isolation tests
Mobile UI tests where appropriate
Critical security test:

User from Organisation A must never retrieve Organisation B data.

Critical business tests:

Timer cannot create invalid overlapping entries
Completed task cannot accidentally continue running
Approved timesheet cannot silently change
Disabled employee cannot access the system
Manager cannot access another organisation
34. OBSERVABILITY
Prepare for production monitoring.

Include:

Structured logging
Error tracking
Health endpoint
API performance metrics
Database monitoring
Background job monitoring
Do not log passwords, tokens or unnecessary personal information.

35. DEPLOYMENT
For development and testing, use a low-cost managed deployment rather than provisioning a full production-style infrastructure stack.

Recommended initial setup:

Source control and CI: GitHub Free with GitHub Actions
Web application: Vercel Hobby or Cloudflare Pages
API: Render, Railway, or Fly.io on their lowest-cost development plan
Database: Neon, Supabase, or Render PostgreSQL free/development tier
File storage: Cloudflare R2, Supabase Storage, or an S3-compatible development bucket
Email: Resend, Brevo, or Mailtrap for development and testing
Error tracking: Sentry free tier
Mobile testing: Expo with React Native, using physical devices and Expo Go during development
Local development: Docker Compose for PostgreSQL and any required services
For the lowest initial cost, use a single repository and a modular monolith with:

One web application
One API service
One managed PostgreSQL database
Object storage only when file uploads are required
No Redis, queue worker, Kubernetes, or separate microservices until usage requires them
A practical development configuration is:

Web:
Next.js deployed to Vercel or Cloudflare Pages

Backend:
NestJS, Fastify, or another selected backend framework deployed as one service on Render, Railway, or Fly.io

Database:
Neon or Supabase PostgreSQL

Mobile:
Expo/React Native, tested locally through Expo Go

CI:
GitHub Actions for linting, unit tests, integration tests, and database migration checks

Use separate development, test, and production environments. Do not use a free database as the only copy of important data. Free tiers may sleep, have limited storage, impose usage limits, or remove inactive projects, so they are suitable for development and testing but not for production without confirming their current terms and backup capabilities.

For local development, run PostgreSQL with Docker Compose when possible. This avoids consuming hosted database quotas and allows development to continue if a hosted free tier is unavailable.

For a small pilot after development, use the simplest paid configuration that provides predictable uptime and backups:

One small application instance
One small managed PostgreSQL instance with automated backups
Object storage for uploads
A transactional email provider
Basic error tracking and uptime monitoring
Avoid relying on free-tier hosting for customer data, payroll-related information, or production employee records. Before production launch, confirm data residency, backup, security, privacy, service limits, and New Zealand Privacy Act obligations with the selected providers.

36. FUTURE INTEGRATIONS
Architecture should allow integrations with:

Google Calendar
Microsoft 365
Xero
MYOB
Payroll systems
Slack
Microsoft Teams
REST APIs
Webhooks
These should not block MVP development.

37. COMMERCIAL DIFFERENTIATION
The product should not try to win purely through basic time tracking.

Primary differentiator:

Planned vs Actual Work Intelligence
The system should continuously learn from recorded work data.

Example:

Estimated:

2 hours

Actual average:

3.1 hours

System:

"Tasks of this type have historically required approximately 55% more time than estimated."

This eventually becomes the foundation for AI-powered planning.

38. SUCCESS METRICS
Track product metrics such as:

Active organisations
Active employees
Daily active users
Tasks completed
Time entries recorded
Timesheet approval rate
Weekly retention
Monthly retention
Average revenue per organisation
Trial-to-paid conversion
Churn
Do not collect unnecessary employee surveillance data simply because it is technically possible.

39. IMPORTANT LEGAL/IP REQUIREMENT
The product may be inspired by existing employee time/task tracking concepts and publicly available product functionality.

However:

DO NOT copy:

Existing source code
Existing UI designs
Existing screenshots
Existing text
Existing database schema
Existing documentation
Proprietary algorithms
Trademarks
Branding
Create an original implementation and user experience.

The linked SlideShare should be treated as domain inspiration only.

40. AI AGENT DEVELOPMENT RULES
When implementing this project:

Inspect the repository before changing anything.
Do not overwrite existing work without understanding it.
Keep changes small and reviewable.
Explain architectural decisions.
Write tests with new functionality.
Do not introduce unnecessary dependencies.
Prefer simple solutions.
Do not over-engineer the MVP.
Keep security and tenant isolation as first-class requirements.
Never expose secrets.
Keep API contracts documented.
Update documentation when architecture changes.
Maintain backward compatibility where practical.
Run tests after significant changes.
Report failures rather than hiding them.
41. FIRST TASK FOR THE AI AGENT
Do NOT start coding immediately.

First produce:

A. Product architecture
Show:

Web
Mobile
API
Services
Database
Authentication
Notifications
B. Database ERD
Show all MVP entities and relationships.

C. API specification
List the initial REST endpoints.

D. Repository structure
Recommend the project folder structure.

E. Technology selection
Recommend:

Frontend framework
Mobile framework
Backend framework
Database
Authentication
Cloud
File storage
Notification system
Testing framework
Explain the reasoning and trade-offs.

F. MVP implementation plan
Break the project into small development milestones.

For every milestone specify:

Objective
Files/components
API changes
Database changes
Tests
Acceptance criteria
G. Risks
Identify:

Security risks
Privacy risks
Scalability risks
Product risks
Technical risks
Commercial risks
Do not implement the application until this design phase has been reviewed.