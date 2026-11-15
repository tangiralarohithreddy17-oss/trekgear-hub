const path = require('path');
const fs = require('fs');
const http = require('http');
const assert = require('assert');

// Point to an isolated test database
const TEST_DB_PATH = path.join(__dirname, 'test_trekgear.db');
process.env.DATABASE_PATH = TEST_DB_PATH;

// Ensure any old test database is removed
if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

const { getDb, initDb, closeDb } = require('../src/db');
const app = require('../src/app');

// Helper to make HTTP requests
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

    if (bodyData) {
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

    if (bodyData) {
      req.write(JSON.stringify(bodyData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('==================================================');
  console.log('   TrekGear Hub - Member 5 Audit Trail Tests      ');
  console.log('==================================================\n');

  // Initialize fresh isolated DB
  await initDb(getDb(TEST_DB_PATH));

  // Determine listen target: use named pipe on Windows to avoid sandbox loopback restrictions, or port 0
  const isWindows = process.platform === 'win32';
  const pipePath = isWindows ? `\\\\.\\pipe\\trekgear-test-${Date.now()}` : null;

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
  console.log(`Test server running on ${pipePath ? `pipe ${pipePath}` : `port ${target}`} using database: ${TEST_DB_PATH}\n`);

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`[PASS] Test ${total}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] Test ${total}: ${name}`);
      console.error('       Error:', err.message);
      if (err.actual !== undefined && err.expected !== undefined) {
        console.error('       Expected:', err.expected);
        console.error('       Actual:  ', err.actual);
      }
    }
  }

  // ----------------------------------------------------
  // PART 4: MANDATORY TEST CASES
  // ----------------------------------------------------
  console.log('--- PART 4: MANDATORY TESTS ---');

  let tent1Id = null;

  await test('Mandatory Test 1: Add a tent (POST /tents)', async () => {
    const res = await request(target, { path: '/tents', method: 'POST' }, {
      tent_name: 'Mountain Explorer',
      size: '4-person'
    });

    assert.strictEqual(res.status, 201, `Expected status 201, got ${res.status}`);
    assert.ok(res.body.tent_id, 'Expected response to contain tent_id');
    assert.strictEqual(res.body.tent_name, 'Mountain Explorer');
    assert.strictEqual(res.body.size, '4-person');
    tent1Id = res.body.tent_id;
  });

  await test('Mandatory Test 2: Update the same tent (PUT /tents/:id)', async () => {
    const res = await request(target, { path: `/tents/${tent1Id}`, method: 'PUT' }, {
      tent_name: 'Mountain Explorer Pro',
      size: '6-person'
    });

    assert.strictEqual(res.status, 200, `Expected status 200, got ${res.status}`);
    assert.strictEqual(res.body.tent_name, 'Mountain Explorer Pro');
    assert.strictEqual(res.body.size, '6-person');
  });

  await test('Mandatory Test 3: Check audit (GET /audit)', async () => {
    const res = await request(target, { path: '/audit', method: 'GET' });

    assert.strictEqual(res.status, 200, `Expected status 200, got ${res.status}`);
    assert.ok(Array.isArray(res.body), 'Expected audit response to be an array');
    assert.strictEqual(res.body.length, 2, `Expected exactly 2 audit records, got ${res.body.length}`);

    // UPDATE appears first (newest)
    const rec1 = res.body[0];
    assert.strictEqual(rec1.action, 'UPDATE', `Expected first record action 'UPDATE', got '${rec1.action}'`);
    assert.strictEqual(rec1.id, tent1Id, `Expected first record id ${tent1Id}, got ${rec1.id}`);
    assert.ok(rec1.time, 'Expected first record to have a time');

    // ADD appears second
    const rec2 = res.body[1];
    assert.strictEqual(rec2.action, 'ADD', `Expected second record action 'ADD', got '${rec2.action}'`);
    assert.strictEqual(rec2.id, tent1Id, `Expected second record id ${tent1Id}, got ${rec2.id}`);
    assert.ok(rec2.time, 'Expected second record to have a time');

    // Ensure audit_id ordering is descending
    assert.ok(rec1.audit_id > rec2.audit_id, 'Expected rec1.audit_id > rec2.audit_id (newest first)');
  });

  // ----------------------------------------------------
  // PART 5: ADDITIONAL TESTS
  // ----------------------------------------------------
  console.log('\n--- PART 5: ADDITIONAL TESTS ---');

  await test('Additional Test 4: Invalid add does NOT create an audit entry', async () => {
    // Missing size
    const res = await request(target, { path: '/tents', method: 'POST' }, {
      tent_name: 'Invalid Tent'
    });
    assert.strictEqual(res.status, 400, `Expected status 400, got ${res.status}`);

    // Audit count must remain 2
    const auditRes = await request(target, { path: '/audit', method: 'GET' });
    assert.strictEqual(auditRes.body.length, 2, `Expected audit count to stay 2, got ${auditRes.body.length}`);
  });

  await test('Additional Test 5: Updating a nonexistent tent does NOT create an audit entry', async () => {
    const res = await request(target, { path: '/tents/99999', method: 'PUT' }, {
      tent_name: 'Nonexistent Tent',
      size: '2-person'
    });
    assert.strictEqual(res.status, 404, `Expected status 404, got ${res.status}`);

    // Audit count must remain 2
    const auditRes = await request(target, { path: '/audit', method: 'GET' });
    assert.strictEqual(auditRes.body.length, 2, `Expected audit count to stay 2, got ${auditRes.body.length}`);
  });

  await test('Additional Test 6: Deleting a nonexistent tent does NOT create an audit entry', async () => {
    const res = await request(target, { path: '/tents/99999', method: 'DELETE' });
    assert.strictEqual(res.status, 404, `Expected status 404, got ${res.status}`);

    // Audit count must remain 2
    const auditRes = await request(target, { path: '/audit', method: 'GET' });
    assert.strictEqual(auditRes.body.length, 2, `Expected audit count to stay 2, got ${auditRes.body.length}`);
  });

  await test('Additional Test 7: Deleting an existing tent creates a DELETE audit entry', async () => {
    const res = await request(target, { path: `/tents/${tent1Id}`, method: 'DELETE' });
    assert.strictEqual(res.status, 200, `Expected status 200, got ${res.status}`);

    // Audit count should now be 3
    const auditRes = await request(target, { path: '/audit', method: 'GET' });
    assert.strictEqual(auditRes.body.length, 3, `Expected audit count to be 3, got ${auditRes.body.length}`);
    assert.strictEqual(auditRes.body[0].action, 'DELETE', `Expected newest action 'DELETE', got '${auditRes.body[0].action}'`);
    assert.strictEqual(auditRes.body[0].id, tent1Id, `Expected tent id ${tent1Id}, got ${auditRes.body[0].id}`);
  });

  await test('Additional Test 8: More than 10 audit entries returns only the newest 10 records', async () => {
    // Current audit entries: 3. Add 9 more tents to reach 12 entries
    for (let i = 1; i <= 9; i++) {
      const res = await request(target, { path: '/tents', method: 'POST' }, {
        tent_name: `Bulk Tent ${i}`,
        size: `${i + 1}-person`
      });
      assert.strictEqual(res.status, 201);
    }

    const auditRes = await request(target, { path: '/audit', method: 'GET' });
    assert.strictEqual(auditRes.status, 200);
    assert.strictEqual(auditRes.body.length, 10, `Expected exactly 10 records returned, got ${auditRes.body.length}`);

    // Verify ordering is strictly descending by audit_id
    for (let i = 0; i < auditRes.body.length - 1; i++) {
      assert.ok(
        auditRes.body[i].audit_id > auditRes.body[i + 1].audit_id,
        `Expected audit_id ${auditRes.body[i].audit_id} > ${auditRes.body[i + 1].audit_id}`
      );
    }
  });

  // Teardown
  server.close();
  await closeDb();

  if (fs.existsSync(TEST_DB_PATH)) {
    try {
      fs.unlinkSync(TEST_DB_PATH);
    } catch (e) {
      // Ignore cleanup error on Windows file locks
    }
  }

  console.log('\n==================================================');
  console.log(`Test Results: ${passed}/${total} passed (${Math.round((passed / total) * 100)}%)`);
  console.log('==================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
