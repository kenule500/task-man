# Field Service Scheduling — Product Requirements

## Background
Our field technicians are scheduled by phone. Dispatchers keep a spreadsheet, and customers do
not know when a technician will arrive. This document describes the first release of a scheduling
product for the operations team.

## Goals
- Let dispatchers assign jobs to technicians in one screen.
- Show customers an arrival window of two hours.
- Track job status from assignment to completion.

## Personas
- Dispatcher: assigns and reschedules jobs.
- Technician: sees today's route and updates job status.
- Customer: receives the arrival window by SMS.

## Functional requirements

### Job intake
1. A dispatcher can create a job with a customer name, address, skill and priority.
2. Jobs appear in a queue sorted by priority, then by requested date.
3. A job can be edited until a technician starts it.

### Assignment
4. The scheduler proposes technicians whose skills match the job and who are free in the time window.
5. A dispatcher can override the proposal and pick any active technician.
6. Assigning a job notifies the technician by push notification.

### Technician mobile view
7. The technician sees today's jobs in route order with the customer address.
8. The technician can mark a job as started, paused, or completed.
9. Completing a job asks for a short note and optional photos.

### Customer notification
10. When a job is assigned, the customer receives an SMS with a two-hour arrival window.
11. Rescheduling sends a new window and cancels the previous one.

### Reporting
12. Operations can export a weekly report of jobs per technician and average completion time.

## Non-functional requirements
- The mobile view must work on a phone with a weak connection.
- Every job status change is audited with user and timestamp.
- Customer phone numbers are personal data and must not appear in logs.

## Out of scope for this release
- Route optimisation beyond skill and availability.
- Billing and invoicing.
- Customer self-service booking.
