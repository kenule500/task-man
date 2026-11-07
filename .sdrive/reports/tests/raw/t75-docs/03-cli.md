# Clinic Intake — Product Requirements

This document describes the first release of Clinic Intake for the healthcare team.

## Goals
- Give the healthcare team one screen for daily work.
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
