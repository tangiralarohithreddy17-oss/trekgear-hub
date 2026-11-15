# TrekGear Hub - Member 5: Audit Trail Implementation

TrekGear Hub is a trekking gear rental management system built with **Node.js**, **Express.js**, and **SQLite (`sqlite3`)**.

This document outlines the architecture, implementation, and verification for **Member 5: Audit Trail Implementation**.

---

## Architecture Overview

### 1. Database Schema

The database uses SQLite with two core tables initialized via `src/db.js`:

#### A. `audit` Table (Exact Required Structure)
```sql
CREATE TABLE IF NOT EXISTS audit (
    audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    id INTEGER NOT NULL,
    time DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
- `audit_id`: Auto-incrementing unique identifier.
- `action`: Operation performed (`ADD`, `UPDATE`, or `DELETE`).
- `id`: The affected `tent_id`.
- `time`: Date and time of the operation (SQLite UTC `CURRENT_TIMESTAMP`).

#### B. `tents` Table
```sql
CREATE TABLE IF NOT EXISTS tents (
    tent_id INTEGER PRIMARY KEY AUTOINCREMENT,
    tent_name TEXT NOT NULL,
    size TEXT NOT NULL,
    status TEXT DEFAULT 'available',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Automatic Audit Logging Logic

All tent write operations and their corresponding audit record insertions are executed atomically within **SQLite transactions** (`BEGIN TRANSACTION` ... `COMMIT` / `ROLLBACK`):

1. **`POST /tents` (ADD)**:
   - Request body validated (`tent_name` and `size` required).
   - Inserts tent into `tents`.
   - Inserts audit record: `action = 'ADD'`, `id = newly created tent_id`.
   - Returns HTTP `201 Created` with newly created tent object.

2. **`PUT /tents/:id` (UPDATE)**:
   - Validates payload and verifies whether `tent_id` exists.
   - If tent does not exist, returns `404 Not Found` (no audit logged).
   - If validation fails, returns `400 Bad Request` (no audit logged).
   - Updates `tents` record.
   - Inserts audit record: `action = 'UPDATE'`, `id = updated tent_id`.
   - Returns HTTP `200 OK` with updated tent object.

3. **`DELETE /tents/:id` (DELETE)**:
   - Verifies whether `tent_id` exists.
   - If tent does not exist, returns `404 Not Found` (no audit logged).
   - Deletes `tents` record.
   - Inserts audit record: `action = 'DELETE'`, `id = deleted tent_id`.
   - Returns HTTP `200 OK`.

4. **`GET /audit`**:
   - Queries `SELECT audit_id, action, id, time FROM audit ORDER BY audit_id DESC LIMIT 10`.
   - Returns HTTP `200 OK` with a JSON array of up to the 10 most recent audit entries, sorted strictly newest first.

---

## How to Run the Application

### Prerequisites
- Node.js (v18+)
- npm

### 1. Install Dependencies
```bash
npm install
```

### 2. Reset or Initialize Clean Database
```bash
npm run reset-db
```
*(Clears all data and resets auto-increment counters without inserting any audit entries)*

### 3. Start the Server
```bash
npm start
```
Server runs at `http://localhost:3000`.

### 4. Run Automated Tests
```bash
npm test
```
Runs the automated test runner in `tests/run-tests.js`, covering all 3 mandatory tests and 5 additional tests (100% pass rate).

---

## Postman Testing Instructions

You can import the provided `postman_collection.json` directly into Postman, or follow these manual steps:

### Test 1: Add a Tent (Mandatory)
- **Method**: `POST`
- **URL**: `http://localhost:3000/tents`
- **Headers**:
  - `Content-Type: application/json`
- **Body** (`raw`, JSON):
  ```json
  {
    "tent_name": "Mountain Explorer",
    "size": "4-person"
  }
  ```
- **Expected Status**: `201 Created`
- **Expected Result**: Tent inserted with `tent_id = 1`. One `ADD` record created in audit.

---

### Test 2: Update the Same Tent (Mandatory)
- **Method**: `PUT`
- **URL**: `http://localhost:3000/tents/1`
- **Headers**:
  - `Content-Type: application/json`
- **Body** (`raw`, JSON):
  ```json
  {
    "tent_name": "Mountain Explorer Pro",
    "size": "6-person"
  }
  ```
- **Expected Status**: `200 OK`
- **Expected Result**: Tent updated. One `UPDATE` record created in audit.

---

### Test 3: Check Audit Trail (Mandatory)
- **Method**: `GET`
- **URL**: `http://localhost:3000/audit`
- **Expected Status**: `200 OK`
- **Expected Response**: Exactly 2 records, with `UPDATE` first and `ADD` second:
  ```json
  [
    {
      "audit_id": 2,
      "action": "UPDATE",
      "id": 1,
      "time": "2026-11-15 13:05:00"
    },
    {
      "audit_id": 1,
      "action": "ADD",
      "id": 1,
      "time": "2026-11-15 13:05:00"
    }
  ]
  ```

---

### Additional Tests

#### Test 4: Delete an Existing Tent
- **Method**: `DELETE`
- **URL**: `http://localhost:3000/tents/1`
- **Expected Status**: `200 OK`
- **Expected Audit Effect**: A `DELETE` entry is created with `id = 1`.

#### Test 5: Validation Failure (Invalid Add)
- **Method**: `POST`
- **URL**: `http://localhost:3000/tents`
- **Body**: `{"tent_name": ""}`
- **Expected Status**: `400 Bad Request`
- **Expected Audit Effect**: No new entry added to `audit`.

#### Test 6: Nonexistent Tent Update
- **Method**: `PUT`
- **URL**: `http://localhost:3000/tents/99999`
- **Body**: `{"tent_name": "Ghost", "size": "2-person"}`
- **Expected Status**: `404 Not Found`
- **Expected Audit Effect**: No entry added to `audit`.

#### Test 7: Nonexistent Tent Deletion
- **Method**: `DELETE`
- **URL**: `http://localhost:3000/tents/99999`
- **Expected Status**: `404 Not Found`
- **Expected Audit Effect**: No entry added to `audit`.
