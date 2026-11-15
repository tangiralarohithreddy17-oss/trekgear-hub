const path = require('path');
const fs = require('fs');
const http = require('http');
const assert = require('assert');

// Point to an isolated test database
const TEST_DB_PATH = path.join(__dirname, 'test_trekgear.db');
process.env.DATABASE_PATH = TEST_DB_PATH;

if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

const { getDb, initDb, runAsync, closeDb } = require('../src/db');
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

async function runTests() {
  console.log('================================================================');
  console.log('  TrekGear Hub - Comprehensive Verification Test Suite (100%)    ');
  console.log('================================================================\n');

  const testDb = getDb(TEST_DB_PATH);
  await initDb(testDb);

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
  console.log(`Test server running on ${pipePath ? `pipe ${pipePath}` : `port ${target}`}`);
  console.log(`Isolated database: ${TEST_DB_PATH}\n`);

  let total = 0;
  let passed = 0;

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
  // PART 3: MANDATORY AUDIT TRAIL SEQUENCE
  // ----------------------------------------------------
  console.log('--- PART 3: MANDATORY AUDIT SEQUENCE (Clean DB) ---');

  let tent1Id = null;

  await test('Mandatory Test 1: Add a tent (POST /tents) → Expected 201', async () => {
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

  await test('Mandatory Test 2: Update the same tent (PUT /tents/:id) → Expected 200', async () => {
    const res = await request(target, { path: `/tents/${tent1Id}`, method: 'PUT' }, {
      tent_name: 'Mountain Explorer Pro',
      size: '6-person'
    });

    assert.strictEqual(res.status, 200, `Expected status 200, got ${res.status}`);
    assert.strictEqual(res.body.tent_name, 'Mountain Explorer Pro');
    assert.strictEqual(res.body.size, '6-person');
  });

  await test('Mandatory Test 3: Check audit (GET /audit) → 200, 2 records: UPDATE first, ADD second', async () => {
    const res = await request(target, { path: '/audit', method: 'GET' });

    assert.strictEqual(res.status, 200, `Expected status 200, got ${res.status}`);
    assert.ok(Array.isArray(res.body), 'Expected audit response to be an array');
    assert.strictEqual(res.body.length, 2, `Expected exactly 2 audit records, got ${res.body.length}`);

    // UPDATE appears first (newest)
    const rec1 = res.body[0];
    assert.strictEqual(rec1.action, 'UPDATE', `Expected first record action 'UPDATE', got '${rec1.action}'`);
    assert.strictEqual(rec1.id, tent1Id);
    assert.ok(rec1.time);

    // ADD appears second
    const rec2 = res.body[1];
    assert.strictEqual(rec2.action, 'ADD', `Expected second record action 'ADD', got '${rec2.action}'`);
    assert.strictEqual(rec2.id, tent1Id);
    assert.ok(rec2.time);

    // Descending order check
    assert.ok(rec1.audit_id > rec2.audit_id, 'Expected rec1.audit_id > rec2.audit_id (newest first)');
  });

  await test('Separate DELETE audit logging: DELETE /tents/:id & verify audit has DELETE record', async () => {
    const res = await request(target, { path: `/tents/${tent1Id}`, method: 'DELETE' });
    assert.strictEqual(res.status, 200, `Expected status 200, got ${res.status}`);
    assert.strictEqual(res.body.message, 'Tent deleted successfully');

    const auditRes = await request(target, { path: '/audit', method: 'GET' });
    assert.strictEqual(auditRes.status, 200);
    assert.strictEqual(auditRes.body.length, 3);
    assert.strictEqual(auditRes.body[0].action, 'DELETE', 'Expected newest action DELETE');
    assert.strictEqual(auditRes.body[0].id, tent1Id);
  });

  // ----------------------------------------------------
  // PART 1: 10 CORE POSTMAN ENDPOINTS
  // ----------------------------------------------------
  console.log('\n--- PART 1: 10 CORE ENDPOINTS EVALUATION ---');

  let testTrekkerId = null;
  let testTent2Id = null;
  let testRentalId = null;

  await test('1. GET /trekkers (Register & list trekkers)', async () => {
    // Add trekker first
    const createRes = await request(target, { path: '/trekkers', method: 'POST' }, {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+1-555-0101'
    });
    assert.strictEqual(createRes.status, 201);
    testTrekkerId = createRes.body.trekker_id;

    const res = await request(target, { path: '/trekkers', method: 'GET' });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
  });

  await test('2. GET /tents (List all tents)', async () => {
    // Add tent 2
    const addRes = await request(target, { path: '/tents', method: 'POST' }, {
      tent_name: 'Mountain Summit 4',
      size: '4-person'
    });
    assert.strictEqual(addRes.status, 201);
    testTent2Id = addRes.body.tent_id;

    // Add tent 3 (2-person)
    await request(target, { path: '/tents', method: 'POST' }, {
      tent_name: 'Alpine Solo',
      size: '2-person'
    });

    const res = await request(target, { path: '/tents', method: 'GET' });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 2);
  });

  await test('3. GET /tents/:id (Get single tent)', async () => {
    const res = await request(target, { path: `/tents/${testTent2Id}`, method: 'GET' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.tent_id, testTent2Id);
    assert.strictEqual(res.body.tent_name, 'Mountain Summit 4');
  });

  await test('4. POST /tents (Add tent)', async () => {
    const res = await request(target, { path: '/tents', method: 'POST' }, {
      tent_name: 'Glacier Peak 4',
      size: '4-person'
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.tent_name, 'Glacier Peak 4');
  });

  await test('5. PUT /tents/:id (Update tent)', async () => {
    const res = await request(target, { path: `/tents/${testTent2Id}`, method: 'PUT' }, {
      tent_name: 'Mountain Summit 4 Pro',
      size: '4-person'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.tent_name, 'Mountain Summit 4 Pro');
  });

  await test('7. GET /rentals (⭐ THE JOIN ENDPOINT: rentals with trekker name and tent name)', async () => {
    // Create rental
    const issueRes = await request(target, { path: '/rentals', method: 'POST' }, {
      trekker_id: testTrekkerId,
      tent_id: testTent2Id,
      notes: 'Himalayan winter expedition'
    });
    assert.strictEqual(issueRes.status, 201);
    testRentalId = issueRes.body.rental_id;

    // Call GET /rentals
    const res = await request(target, { path: '/rentals', method: 'GET' });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);

    const rental = res.body.find(r => r.rental_id === testRentalId);
    assert.ok(rental, 'Expected created rental in list');
    assert.strictEqual(rental.trekker_name, 'John Doe', 'Expected trekker_name in join');
    assert.strictEqual(rental.tent_name, 'Mountain Summit 4 Pro', 'Expected tent_name in join');
    assert.strictEqual(rental.tent_size, '4-person', 'Expected tent_size in join');
    assert.strictEqual(rental.status, 'active');
  });

  await test('8. GET /audit (Fetch audit records)', async () => {
    const res = await request(target, { path: '/audit', method: 'GET' });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length <= 10);
  });

  await test('9. GET /tents?size=4-person (Filter tents by size)', async () => {
    const res = await request(target, { path: '/tents?size=4-person', method: 'GET' });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
    for (const tent of res.body) {
      assert.strictEqual(tent.size.toLowerCase(), '4-person');
    }
  });

  await test('10. GET /tents?search_q=Mountain (Search tents by keyword)', async () => {
    const res = await request(target, { path: '/tents?search_q=Mountain', method: 'GET' });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
    for (const tent of res.body) {
      assert.ok(tent.tent_name.toLowerCase().includes('mountain'));
    }
  });

  await test('6. DELETE /tents/:id (Delete tent)', async () => {
    // Delete tent 3
    const tentsRes = await request(target, { path: '/tents?search_q=Alpine', method: 'GET' });
    const alpineTent = tentsRes.body[0];
    const res = await request(target, { path: `/tents/${alpineTent.tent_id}`, method: 'DELETE' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message, 'Tent deleted successfully');
  });

  // ----------------------------------------------------
  // PART 2: TEST VALIDATION (INVALID REQUESTS)
  // ----------------------------------------------------
  console.log('\n--- PART 2: TEST VALIDATION (INVALID REQUESTS) ---');

  await test('POST without tent_name → 400 Bad Request', async () => {
    const res = await request(target, { path: '/tents', method: 'POST' }, {
      size: '4-person'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'tent_name is required');
  });

  await test('POST without size → 400 Bad Request', async () => {
    const res = await request(target, { path: '/tents', method: 'POST' }, {
      tent_name: 'Camp Wonder'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'size is required');
  });

  await test('POST with empty values → 400 Bad Request', async () => {
    const res = await request(target, { path: '/tents', method: 'POST' }, {
      tent_name: '   ',
      size: '   '
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'tent_name is required');
  });

  await test('PUT with missing fields → 400 Bad Request', async () => {
    const res = await request(target, { path: `/tents/${testTent2Id}`, method: 'PUT' }, {
      size: '2-person'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'tent_name is required');
  });

  await test('GET with a nonexistent ID → 404 Not Found', async () => {
    const res = await request(target, { path: '/tents/99999', method: 'GET' });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'Tent not found');
  });

  await test('DELETE with a nonexistent ID → 404 Not Found', async () => {
    const res = await request(target, { path: '/tents/99999', method: 'DELETE' });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'Tent not found');
  });

  // Teardown
  server.close();
  await closeDb();

  if (fs.existsSync(TEST_DB_PATH)) {
    try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {}
  }

  console.log('\n================================================================');
  console.log(` Test Results: ${passed}/${total} passed (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
