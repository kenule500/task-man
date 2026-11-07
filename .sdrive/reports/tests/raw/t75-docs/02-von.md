# Vendor Onboarding — Product Requirements

This document describes the first release of Vendor Onboarding for the procurement team.

## Goals
- Give the procurement team one screen for daily work.
- Replace the current spreadsheet with an auditable record.
- Reduce the time to answer a customer request.

## Personas
- Requestor: raises a request and follows its status.
- Handler: claims, works and completes requests.
- Manager: reviews volume, ageing and exceptions.

### Intake
1. A request is created with a title, a category and a priority.
2. The requestor can attach one file up to 10 MB.
3. Requests are listed newest first with a status filter.
4. A request can be edited until a handler claims it.

### Edge cases 1
1. A request created twice in one minute is merged into one record (case 1).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 1).
3. A manager may reassign up to twenty requests at once (case 1).
4. An attachment that fails the virus scan is removed with a clear message (case 1).
