# Partner Portal — Product Requirements

This document describes the first release of Partner Portal for the channel sales team.

## Goals
- Give the channel sales team one screen for daily work.
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

### Edge cases 23
1. A request created twice in one minute is merged into one record (case 23).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 23).
3. A manager may reassign up to twenty requests at once (case 23).
4. An attachment that fails the virus scan is removed with a clear message (case 23).

### Edge cases 24
1. A request created twice in one minute is merged into one record (case 24).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 24).
3. A manager may reassign up to twenty requests at once (case 24).
4. An attachment that fails the virus scan is removed with a clear message (case 24).

### Edge cases 25
1. A request created twice in one minute is merged into one record (case 25).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 25).
3. A manager may reassign up to twenty requests at once (case 25).
4. An attachment that fails the virus scan is removed with a clear message (case 25).

### Edge cases 26
1. A request created twice in one minute is merged into one record (case 26).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 26).
3. A manager may reassign up to twenty requests at once (case 26).
4. An attachment that fails the virus scan is removed with a clear message (case 26).

### Edge cases 27
1. A request created twice in one minute is merged into one record (case 27).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 27).
3. A manager may reassign up to twenty requests at once (case 27).
4. An attachment that fails the virus scan is removed with a clear message (case 27).

### Edge cases 28
1. A request created twice in one minute is merged into one record (case 28).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 28).
3. A manager may reassign up to twenty requests at once (case 28).
4. An attachment that fails the virus scan is removed with a clear message (case 28).

### Edge cases 29
1. A request created twice in one minute is merged into one record (case 29).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 29).
3. A manager may reassign up to twenty requests at once (case 29).
4. An attachment that fails the virus scan is removed with a clear message (case 29).

### Edge cases 30
1. A request created twice in one minute is merged into one record (case 30).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 30).
3. A manager may reassign up to twenty requests at once (case 30).
4. An attachment that fails the virus scan is removed with a clear message (case 30).

### Edge cases 31
1. A request created twice in one minute is merged into one record (case 31).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 31).
3. A manager may reassign up to twenty requests at once (case 31).
4. An attachment that fails the virus scan is removed with a clear message (case 31).

### Edge cases 32
1. A request created twice in one minute is merged into one record (case 32).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 32).
3. A manager may reassign up to twenty requests at once (case 32).
4. An attachment that fails the virus scan is removed with a clear message (case 32).

### Edge cases 33
1. A request created twice in one minute is merged into one record (case 33).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 33).
3. A manager may reassign up to twenty requests at once (case 33).
4. An attachment that fails the virus scan is removed with a clear message (case 33).

### Edge cases 34
1. A request created twice in one minute is merged into one record (case 34).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 34).
3. A manager may reassign up to twenty requests at once (case 34).
4. An attachment that fails the virus scan is removed with a clear message (case 34).

### Edge cases 35
1. A request created twice in one minute is merged into one record (case 35).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 35).
3. A manager may reassign up to twenty requests at once (case 35).
4. An attachment that fails the virus scan is removed with a clear message (case 35).

### Edge cases 36
1. A request created twice in one minute is merged into one record (case 36).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 36).
3. A manager may reassign up to twenty requests at once (case 36).
4. An attachment that fails the virus scan is removed with a clear message (case 36).

### Edge cases 37
1. A request created twice in one minute is merged into one record (case 37).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 37).
3. A manager may reassign up to twenty requests at once (case 37).
4. An attachment that fails the virus scan is removed with a clear message (case 37).

### Edge cases 38
1. A request created twice in one minute is merged into one record (case 38).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 38).
3. A manager may reassign up to twenty requests at once (case 38).
4. An attachment that fails the virus scan is removed with a clear message (case 38).

### Edge cases 39
1. A request created twice in one minute is merged into one record (case 39).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 39).
3. A manager may reassign up to twenty requests at once (case 39).
4. An attachment that fails the virus scan is removed with a clear message (case 39).

### Edge cases 40
1. A request created twice in one minute is merged into one record (case 40).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 40).
3. A manager may reassign up to twenty requests at once (case 40).
4. An attachment that fails the virus scan is removed with a clear message (case 40).

### Edge cases 41
1. A request created twice in one minute is merged into one record (case 41).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 41).
3. A manager may reassign up to twenty requests at once (case 41).
4. An attachment that fails the virus scan is removed with a clear message (case 41).

### Edge cases 42
1. A request created twice in one minute is merged into one record (case 42).
2. A handler who loses connection mid-update sees the saved status on reconnect (case 42).
3. A manager may reassign up to twenty requests at once (case 42).
4. An attachment that fails the virus scan is removed with a clear message (case 42).
