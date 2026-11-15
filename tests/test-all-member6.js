const path = require('path');
const fs = require('fs');
const http = require('http');
const assert = require('assert');

// Point to an isolated test database
const TEST_DB_PATH = path.join(__dirname, 'test_member6_verification.db');
process.env.DATABASE_PATH = TEST_DB_PATH;

if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

const { getDb, initDb, closeDb } = require('../src/db');
const app = require('../src/app');

function request(target, options, bodyData = null) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      path: options.path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (typeof target === 'string') {
      reqOptions.socketPath = target;
    } else {
      reqOptions.hostname = '127.0.0.1';
      reqOptions.port = target;
    }

    if (bodyData !== null) {
      reqOptions.headers['Content-Type'] = 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(bodyData));
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (bodyData !== null) {
      req.write(JSON.stringify(bodyData));
    }
    req.end();
  });
}

async function runMember6Verification() {
  console.log('================================================================');
  console.log(' TrekGear Hub - Member 6: Comprehensive Verification Test Suite ');
  console.log('================================================================\n');

  await initDb(getDb(TEST_DB_PATH));

  const isWindows = process.platform === 'win32';
  const pipePath = isWindows ? `\\\\.\\pipe\\trekgear-member6-${Date.now()}` : null;

  const server = await new Promise((resolve, reject) => {
    if (pipePath) {
      const s = app.listen(pipePath, () => resolve(s));
      s.on('error', reject);
    } else {
      const s = app.listen(0, () => resolve(s));
      s.on('error', reject);
    }
  });

  const target = pipePath || server.address().port;
  console.log(`Server listening on ${pipePath ? `named pipe: ${pipePath}` : `port: ${target}`}`);
  console.log(`Isolated Database: ${TEST_DB_PATH}\n`);

  const results = [];

  async function executeTest(section, testName, fn) {
    process.stdout.write(`[RUNNING] [${section}] ${testName}... `);
    try {
      const resultData = await fn();
      console.log('PASSED');
      results.push({ section, testName, status: 'PASSED', details: resultData });
    } catch (err) {
      console.log('FAILED');
      console.error(`          Error: ${err.message}`);
      results.push({ section, testName, status: 'FAILED', error: err.message });
    }
  }

  // ====================================================================
  // PART 1: 10 Endpoints Testing
  // ====================================================================
  console.log('--- PART 1: Postman Collection Endpoints Evaluation ---');

  await executeTest('Part 1', '1. GET /trekkers (Check implementation status)', async () => {
    const res = await request(target, { path: '/trekkers', method: 'GET' });
    // Verify response
    assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`);
    assert.deepStrictEqual(res.body, { error: 'Endpoint not found' });
    return { httpStatus: res.status, implemented: false, response: res.body };
  });

  await executeTest('Part 1', '2. GET /tents (Initial empty state)', async () => {
    const res = await request(target, { path: '/tents', method: 'GET' });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(Array.isArray(res.body), 'Expected array');
    return { httpStatus: res.status, count: res.body.length, response: res.body };
  });

  let createdTentId = null;

  await executeTest('Part 1', '4. POST /tents (Valid tent creation)', async () => {
    const payload = { tent_name: 'Mountain Explorer', size: '4-person', status: 'available' };
    const res = await request(target, { path: '/tents', method: 'POST' }, payload);
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    assert.ok(res.body.tent_id, 'Expected tent_id in response');
    assert.strictEqual(res.body.tent_name, 'Mountain Explorer');
    assert.strictEqual(res.body.size, '4-person');
    assert.strictEqual(res.body.status, 'available');
    createdTentId = res.body.tent_id;
    return { httpStatus: res.status, createdTent: res.body };
  });

  await executeTest('Part 1', '3. GET /tents/:id (Fetch created tent by ID)', async () => {
    const res = await request(target, { path: `/tents/${createdTentId}`, method: 'GET' });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.body.tent_id, createdTentId);
    assert.strictEqual(res.body.tent_name, 'Mountain Explorer');
    return { httpStatus: res.status, tent: res.body };
  });

  await executeTest('Part 1', '5. PUT /tents/:id (Update tent details)', async () => {
    const payload = { tent_name: 'Mountain Explorer Pro', size: '6-person', status: 'rented' };
    const res = await request(target, { path: `/tents/${createdTentId}`, method: 'PUT' }, payload);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.body.tent_name, 'Mountain Explorer Pro');
    assert.strictEqual(res.body.size, '6-person');
    assert.strictEqual(res.body.status, 'rented');
    return { httpStatus: res.status, updatedTent: res.body };
  });

  await executeTest('Part 1', '7. GET /rentals (Check implementation status)', async () => {
    const res = await request(target, { path: '/rentals', method: 'GET' });
    assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`);
    assert.deepStrictEqual(res.body, { error: 'Endpoint not found' });
    return { httpStatus: res.status, implemented: false, response: res.body };
  });

  await executeTest('Part 1', '8. GET /audit (Check audit records)', async () => {
    const res = await request(target, { path: '/audit', method: 'GET' });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(Array.isArray(res.body), 'Expected array');
    assert.strictEqual(res.body.length, 2, 'Expected 2 records (UPDATE and ADD)');
    return { httpStatus: res.status, recordsCount: res.body.length, records: res.body };
  });

  await executeTest('Part 1', '9. GET /tents?size=4-person (Query parameter evaluation)', async () => {
    const res = await request(target, { path: '/tents?size=4-person', method: 'GET' });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(Array.isArray(res.body), 'Expected array');
    // Note: Router does not filter by size parameter; it returns all tents
    return {
      httpStatus: res.status,
      filteringImplemented: false,
      note: 'Endpoint returns HTTP 200 with all tents; query filter not implemented in router',
      resultCount: res.body.length
    };
  });

  await executeTest('Part 1', '10. GET /tents?search_q=Mountain (Query parameter evaluation)', async () => {
    const res = await request(target, { path: '/tents?search_q=Mountain', method: 'GET' });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(Array.isArray(res.body), 'Expected array');
    return {
      httpStatus: res.status,
      filteringImplemented: false,
      note: 'Endpoint returns HTTP 200 with all tents; search query filter not implemented in router',
      resultCount: res.body.length
    };
  });

  await executeTest('Part 1', '6. DELETE /tents/:id (Delete tent)', async () => {
    const res = await request(target, { path: `/tents/${createdTentId}`, method: 'DELETE' });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.body.message, 'Tent deleted successfully');
    assert.strictEqual(res.body.tent_id, createdTentId);
    return { httpStatus: res.status, response: res.body };
  });

  // ====================================================================
  // PART 2: Validation Testing (Invalid requests)
  // ====================================================================
  console.log('\n--- PART 2: Input Validation Testing ---');

  await executeTest('Part 2', 'Validation: POST without tent_name', async () => {
    const res = await request(target, { path: '/tents', method: 'POST' }, { size: '4-person' });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    assert.deepStrictEqual(res.body, { error: 'tent_name is required' });
    return { httpStatus: res.status, response: res.body };
  });

  await executeTest('Part 2', 'Validation: POST without size', async () => {
    const res = await request(target, { path: '/tents', method: 'POST' }, { tent_name: 'Alpine Star' });
    assert.strictEqual(res.status, 400, `Expected 400, got ${res.status}`);
    assert.deepStrictEqual(res.body, { error: 'size is required' });
    return { httpStatus: res.status, response: res.body };
  });

  await executeTest('Part 2', 'Validation: POST with empty values (empty strings / whitespace)', async () => {
    const res1 = await request(target, { path: '/tents', method: 'POST' }, { tent_name: '   ', size: '   ' });
    assert.strictEqual(res1.status, 400, `Expected 400, got ${res1.status}`);
    assert.deepStrictEqual(res1.body, { error: 'tent_name is required' });

    const res2 = await request(target, { path: '/tents', method: 'POST' }, { tent_name: 'Glacier Dome', size: '  ' });
    assert.strictEqual(res2.status, 400, `Expected 400, got ${res2.status}`);
    assert.deepStrictEqual(res2.body, { error: 'size is required' });

    return {
      emptyNameStatus: res1.status,
      emptyNameError: res1.body,
      emptySizeStatus: res2.status,
      emptySizeError: res2.body
    };
  });

  // Create a tent to test PUT missing fields on an existing tent
  const prepRes = await request(target, { path: '/tents', method: 'POST' }, { tent_name: 'Base Tent', size: '2-person' });
  const prepTentId = prepRes.body.tent_id;

  await executeTest('Part 2', 'Validation: PUT with missing fields', async () => {
    // Missing tent_name
    const res1 = await request(target, { path: `/tents/${prepTentId}`, method: 'PUT' }, { size: '4-person' });
    assert.strictEqual(res1.status, 400, `Expected 400, got ${res1.status}`);
    assert.deepStrictEqual(res1.body, { error: 'tent_name is required' });

    // Missing size
    const res2 = await request(target, { path: `/tents/${prepTentId}`, method: 'PUT' }, { tent_name: 'New Base' });
    assert.strictEqual(res2.status, 400, `Expected 400, got ${res2.status}`);
    assert.deepStrictEqual(res2.body, { error: 'size is required' });

    // Empty strings
    const res3 = await request(target, { path: `/tents/${prepTentId}`, method: 'PUT' }, { tent_name: ' ', size: ' ' });
    assert.strictEqual(res3.status, 400, `Expected 400, got ${res3.status}`);
    assert.deepStrictEqual(res3.body, { error: 'tent_name is required' });

    return {
      missingNameStatus: res1.status,
      missingNameError: res1.body,
      missingSizeStatus: res2.status,
      missingSizeError: res2.body
    };
  });

  await executeTest('Part 2', 'Validation: GET with nonexistent ID', async () => {
    const res = await request(target, { path: '/tents/99999', method: 'GET' });
    assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`);
    assert.deepStrictEqual(res.body, { error: 'Tent not found' });
    return { httpStatus: res.status, response: res.body };
  });

  await executeTest('Part 2', 'Validation: DELETE with nonexistent ID', async () => {
    const res = await request(target, { path: '/tents/99999', method: 'DELETE' });
    assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`);
    assert.deepStrictEqual(res.body, { error: 'Tent not found' });
    return { httpStatus: res.status, response: res.body };
  });

  // ====================================================================
  // PART 3: Mandatory Audit Trail Sequence Testing
  // ====================================================================
  console.log('\n--- PART 3: Mandatory Audit Sequence on Clean Database ---');

  // Tear down first server and close DB
  server.close();
  await closeDb();
  if (fs.existsSync(TEST_DB_PATH)) {
    try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {}
  }

  // Create isolated clean DB for Part 3 exact sequence
  const AUDIT_TEST_DB = path.join(__dirname, 'test_member6_audit_clean.db');
  process.env.DATABASE_PATH = AUDIT_TEST_DB;
  if (fs.existsSync(AUDIT_TEST_DB)) {
    try { fs.unlinkSync(AUDIT_TEST_DB); } catch (e) {}
  }

  await initDb(getDb(AUDIT_TEST_DB));

  const pipePathAudit = isWindows ? `\\\\.\\pipe\\trekgear-audit-${Date.now()}` : null;
  const auditServer = await new Promise((resolve, reject) => {
    if (pipePathAudit) {
      const s = app.listen(pipePathAudit, () => resolve(s));
      s.on('error', reject);
    } else {
      const s = app.listen(0, () => resolve(s));
      s.on('error', reject);
    }
  });
  const auditTarget = pipePathAudit || auditServer.address().port;

  let auditTentId = null;

  await executeTest('Part 3', 'Test 1: POST /tents (Expected 201)', async () => {
    const payload = { tent_name: 'Mountain Explorer', size: '4-person' };
    const res = await request(auditTarget, { path: '/tents', method: 'POST' }, payload);
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    assert.ok(res.body.tent_id, 'Expected tent_id');
    assert.strictEqual(res.body.tent_name, 'Mountain Explorer');
    assert.strictEqual(res.body.size, '4-person');
    auditTentId = res.body.tent_id;
    return { httpStatus: res.status, createdTent: res.body };
  });

  await executeTest('Part 3', `Test 2: PUT /tents/${auditTentId} (Expected 200)`, async () => {
    const payload = { tent_name: 'Mountain Explorer Pro', size: '6-person' };
    const res = await request(auditTarget, { path: `/tents/${auditTentId}`, method: 'PUT' }, payload);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.body.tent_name, 'Mountain Explorer Pro');
    assert.strictEqual(res.body.size, '6-person');
    return { httpStatus: res.status, updatedTent: res.body };
  });

  await executeTest('Part 3', 'Test 3: GET /audit (Expected 200, 2 records: UPDATE first, ADD second)', async () => {
    const res = await request(auditTarget, { path: '/audit', method: 'GET' });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(Array.isArray(res.body), 'Expected array');
    assert.strictEqual(res.body.length, 2, `Expected exactly 2 records, got ${res.body.length}`);

    const [rec1, rec2] = res.body;

    // Check first record: UPDATE
    assert.strictEqual(rec1.action, 'UPDATE', `Expected first record action UPDATE, got ${rec1.action}`);
    assert.strictEqual(rec1.id, auditTentId, `Expected first record id ${auditTentId}, got ${rec1.id}`);
    assert.ok(rec1.time, 'Expected time in first record');

    // Check second record: ADD
    assert.strictEqual(rec2.action, 'ADD', `Expected second record action ADD, got ${rec2.action}`);
    assert.strictEqual(rec2.id, auditTentId, `Expected second record id ${auditTentId}, got ${rec2.id}`);
    assert.ok(rec2.time, 'Expected time in second record');

    // Confirm descending ordering
    assert.ok(rec1.audit_id > rec2.audit_id, 'Expected rec1.audit_id > rec2.audit_id');

    return {
      httpStatus: res.status,
      totalRecords: res.body.length,
      firstRecord: rec1,
      secondRecord: rec2
    };
  });

  await executeTest('Part 3', `DELETE Audit Logging: DELETE /tents/${auditTentId} & verify audit`, async () => {
    const deleteRes = await request(auditTarget, { path: `/tents/${auditTentId}`, method: 'DELETE' });
    assert.strictEqual(deleteRes.status, 200, `Expected 200, got ${deleteRes.status}`);

    const auditRes = await request(auditTarget, { path: '/audit', method: 'GET' });
    assert.strictEqual(auditRes.status, 200, `Expected 200, got ${auditRes.status}`);
    assert.strictEqual(auditRes.body.length, 3, `Expected 3 records after DELETE, got ${auditRes.body.length}`);

    const [recDelete, recUpdate, recAdd] = auditRes.body;
    assert.strictEqual(recDelete.action, 'DELETE', `Expected top record DELETE, got ${recDelete.action}`);
    assert.strictEqual(recDelete.id, auditTentId);
    assert.strictEqual(recUpdate.action, 'UPDATE');
    assert.strictEqual(recAdd.action, 'ADD');

    return {
      deleteResponse: deleteRes.body,
      auditLength: auditRes.body.length,
      topAction: recDelete.action,
      allActionsOrder: auditRes.body.map(r => r.action)
    };
  });

  // Cleanup
  auditServer.close();
  await closeDb();
  if (fs.existsSync(AUDIT_TEST_DB)) {
    try { fs.unlinkSync(AUDIT_TEST_DB); } catch (e) {}
  }

  console.log('\n================================================================');
  console.log(` Summary: ${results.filter(r => r.status === 'PASSED').length}/${results.length} tests passed successfully.`);
  console.log('================================================================\n');

  // Save detailed verification report JSON
  fs.writeFileSync(
    path.join(__dirname, 'member6_verification_results.json'),
    JSON.stringify(results, null, 2)
  );
  console.log('Results saved to tests/member6_verification_results.json');
}

runMember6Verification().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

