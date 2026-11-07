# Grant Review — Product Requirements

This document describes the first release of Grant Review for the public funding team.

## Goals
- Give the public funding team one screen for daily work.
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

### Assignment
1. The queue proposes handlers whose category matches the request.
2. A manager can override the proposal.
3. Claiming a request notifies the requestor by email.
4. A claimed request cannot be claimed by anyone else.

### Handling
1. A handler moves a request through open, in progress and done.
2. Every status change records the user and a timestamp.
3. Closing a request requires a short resolution note.
4. Reopening a closed request keeps the previous note.

### Reporting
1. Managers export a weekly CSV of open and closed requests.
2. The report includes the average age of open requests.
3. Only managers may export personal data columns.

## Non-functional requirements
- The list must stay usable on a phone with a weak connection.
- Personal data never appears in application logs.
- Every change is auditable for twelve months.

## Out of scope
- Billing.
- Customer self-service.
- Route optimisation.

### Edge cases 1
1. A request created twice in one minute is merged into one record (case 1).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 1).
3. A manager may reassign up to twenty requests at once (case 1).
4. An attachment that fails the virus scan is removed with a clear message (case 1).

### Edge cases 2
1. A request created twice in one minute is merged into one record (case 2).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 2).
3. A manager may reassign up to twenty requests at once (case 2).
4. An attachment that fails the virus scan is removed with a clear message (case 2).

### Edge cases 3
1. A request created twice in one minute is merged into one record (case 3).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 3).
3. A manager may reassign up to twenty requests at once (case 3).
4. An attachment that fails the virus scan is removed with a clear message (case 3).

### Edge cases 4
1. A request created twice in one minute is merged into one record (case 4).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 4).
3. A manager may reassign up to twenty requests at once (case 4).
4. An attachment that fails the virus scan is removed with a clear message (case 4).

### Edge cases 5
1. A request created twice in one minute is merged into one record (case 5).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 5).
3. A manager may reassign up to twenty requests at once (case 5).
4. An attachment that fails the virus scan is removed with a clear message (case 5).

### Edge cases 6
1. A request created twice in one minute is merged into one record (case 6).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 6).
3. A manager may reassign up to twenty requests at once (case 6).
4. An attachment that fails the virus scan is removed with a clear message (case 6).

### Edge cases 7
1. A request created twice in one minute is merged into one record (case 7).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 7).
3. A manager may reassign up to twenty requests at once (case 7).
4. An attachment that fails the virus scan is removed with a clear message (case 7).
