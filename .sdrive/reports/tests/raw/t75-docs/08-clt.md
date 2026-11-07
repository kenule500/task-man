# Claims Triage — Product Requirements

This document describes the first release of Claims Triage for the insurance team.

## Goals
- Give the insurance team one screen for daily work.
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

### Edge cases 8
1. A request created twice in one minute is merged into one record (case 8).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 8).
3. A manager may reassign up to twenty requests at once (case 8).
4. An attachment that fails the virus scan is removed with a clear message (case 8).

### Edge cases 9
1. A request created twice in one minute is merged into one record (case 9).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 9).
3. A manager may reassign up to twenty requests at once (case 9).
4. An attachment that fails the virus scan is removed with a clear message (case 9).

### Edge cases 10
1. A request created twice in one minute is merged into one record (case 10).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 10).
3. A manager may reassign up to twenty requests at once (case 10).
4. An attachment that fails the virus scan is removed with a clear message (case 10).

### Edge cases 11
1. A request created twice in one minute is merged into one record (case 11).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 11).
3. A manager may reassign up to twenty requests at once (case 11).
4. An attachment that fails the virus scan is removed with a clear message (case 11).

### Edge cases 12
1. A request created twice in one minute is merged into one record (case 12).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 12).
3. A manager may reassign up to twenty requests at once (case 12).
4. An attachment that fails the virus scan is removed with a clear message (case 12).

### Edge cases 13
1. A request created twice in one minute is merged into one record (case 13).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 13).
3. A manager may reassign up to twenty requests at once (case 13).
4. An attachment that fails the virus scan is removed with a clear message (case 13).

### Edge cases 14
1. A request created twice in one minute is merged into one record (case 14).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 14).
3. A manager may reassign up to twenty requests at once (case 14).
4. An attachment that fails the virus scan is removed with a clear message (case 14).

### Edge cases 15
1. A request created twice in one minute is merged into one record (case 15).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 15).
3. A manager may reassign up to twenty requests at once (case 15).
4. An attachment that fails the virus scan is removed with a clear message (case 15).

### Edge cases 16
1. A request created twice in one minute is merged into one record (case 16).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 16).
3. A manager may reassign up to twenty requests at once (case 16).
4. An attachment that fails the virus scan is removed with a clear message (case 16).

### Edge cases 17
1. A request created twice in one minute is merged into one record (case 17).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 17).
3. A manager may reassign up to twenty requests at once (case 17).
4. An attachment that fails the virus scan is removed with a clear message (case 17).

### Edge cases 18
1. A request created twice in one minute is merged into one record (case 18).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 18).
3. A manager may reassign up to twenty requests at once (case 18).
4. An attachment that fails the virus scan is removed with a clear message (case 18).

### Edge cases 19
1. A request created twice in one minute is merged into one record (case 19).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 19).
3. A manager may reassign up to twenty requests at once (case 19).
4. An attachment that fails the virus scan is removed with a clear message (case 19).

### Edge cases 20
1. A request created twice in one minute is merged into one record (case 20).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 20).
3. A manager may reassign up to twenty requests at once (case 20).
4. An attachment that fails the virus scan is removed with a clear message (case 20).

### Edge cases 21
1. A request created twice in one minute is merged into one record (case 21).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 21).
3. A manager may reassign up to twenty requests at once (case 21).
4. An attachment that fails the virus scan is removed with a clear message (case 21).

### Edge cases 22
1. A request created twice in one minute is merged into one record (case 22).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 22).
3. A manager may reassign up to twenty requests at once (case 22).
4. An attachment that fails the virus scan is removed with a clear message (case 22).
