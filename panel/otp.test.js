const path = require('path');
const os = require('os');
const fs = require('fs');
const assert = require('node:assert/strict');
const test = require('node:test');

const dbFile = path.join(os.tmpdir(), 'gdl-otp-' + process.pid + '-' + Date.now() + '.sqlite');
process.env.DB_PATH = dbFile;
delete process.env.DATABASE_URL;
process.env.SESSION_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.RAZ_USERNAME = 'raz-user';
process.env.RAZ_API_KEY = 'raz-test-key';
process.env.RAZ_BODY_ID = '123456';

const express = require('express');
const { init, getKnex } = require('./db');
const otp = require('./otp');
const sms = require('./sms');

const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';
const SMS_ERROR = 'ارسال پیامک انجام نشد، چند دقیقه دیگه دوباره امتحان کنید.';

test('sms otp and ltr code boxes', { timeout: 60000 }, async () => {
  const calls = [];
  const logs = [];
  const errors = [];
  const origLog = console.log;
  const origErr = console.error;
  const origFetch = global.fetch;
  let mode = 'ok';
  let failStatus = -110;
  console.log = function () {
    logs.push(Array.from(arguments).map(String).join(' '));
    return origLog.apply(console, arguments);
  };
  console.error = function () {
    errors.push(Array.from(arguments).map(String).join(' '));
    return origErr.apply(console, arguments);
  };
  global.fetch = function (url, opts) {
    if (String(url) !== sms.SMS_URL) return origFetch(url, opts);
    const body = JSON.parse(opts.body);
    calls.push({ url, method: opts.method, body, redirect: opts.redirect, headers: opts.headers });
    if (mode === 'hang') {
      return new Promise(function (resolve, reject) {
        const fail = function () {
          const err = new Error('timeout');
          err.name = 'TimeoutError';
          reject(err);
        };
        if (opts.signal.aborted) fail();
        else opts.signal.addEventListener('abort', fail, { once: true });
      });
    }
    if (mode === 'throw') throw new Error('network disabled');
    if (mode === 'status') {
      return Promise.resolve(new Response(JSON.stringify({ RetStatus: failStatus, StrRetStatus: 'err' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    return Promise.resolve(new Response(JSON.stringify({ Value: '99', RetStatus: 1, StrRetStatus: 'Ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
  };

  let server;
  try {
    assert.equal(sms.SMS_TIMEOUT_MS, 10000);
    assert.equal(sms.SMS_URL, 'https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber');
    const beforeTimeout = calls.length;
    const started = Date.now();
    mode = 'hang';
    const keepAlive = setInterval(function () {}, 1000);
    const hung = await sms.sendSms('09120000000', '12345', 40);
    clearInterval(keepAlive);
    assert.equal(hung.ok, false);
    assert.equal(hung.status, 'timeout');
    assert.ok(Date.now() - started < 1000);
    assert.equal(calls.length, beforeTimeout + 1);
    assert.ok(errors.some((line) => line.includes('timeout')));

    mode = 'status';
    failStatus = 18;
    const invalid = await sms.sendSms('09120000000', '12345');
    assert.equal(invalid.ok, false);
    assert.equal(invalid.status, 18);
    assert.ok(errors.some((line) => line.includes('sms RetStatus 18')));

    const callsBeforeConfig = calls.length;
    process.env.RAZ_BODY_ID = 'nope';
    const badConfig = await sms.sendSms('09120000000', '12345');
    assert.equal(badConfig.ok, false);
    assert.equal(calls.length, callsBeforeConfig);
    process.env.RAZ_BODY_ID = '123456';
    mode = 'ok';

    await init();
    const knex = getKnex();
    assert.equal(otp.message('sms'), SMS_ERROR);

    async function seedSends(count, base) {
      const now = Date.now() - 90 * 1000;
      const rows = [];
      for (let i = 0; i < count; i += 1) {
        rows.push({
          phone: base.phone || ('09129' + String(100000 + i).slice(-6)),
          purpose: 'signup',
          code_hash: 'x',
          salt: 'y',
          attempts: 0,
          expires_at: now,
          created_at: now,
          ip: base.ip,
          sent: true,
          consumed: true
        });
      }
      await knex('otp_codes').insert(rows);
    }

    const beforeLimit = calls.length;
    await seedSends(5, { phone: '09129000001', ip: '203.0.113.10' });
    const phoneLimited = await otp.issue({ phone: '09129000001', purpose: 'signup', ip: '203.0.113.11' });
    assert.equal(phoneLimited.ok, false);
    assert.equal(phoneLimited.reason, 'phone_limit');
    assert.equal(calls.length, beforeLimit);

    await seedSends(20, { ip: '203.0.113.20' });
    const ipLimited = await otp.issue({ phone: '09129000999', purpose: 'signup', ip: '203.0.113.20' });
    assert.equal(ipLimited.ok, false);
    assert.equal(ipLimited.reason, 'ip_limit');
    assert.equal(calls.length, beforeLimit);

    const app = express();
    app.use(express.urlencoded({ extended: false }));
    require('./mount')(app);
    server = await new Promise(function (resolve) {
      const listening = app.listen(0, '127.0.0.1', function () { resolve(listening); });
    });
    const base = 'http://127.0.0.1:' + server.address().port;

    function takeCookies(jar, res) {
      const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
      list.forEach(function (line) {
        const pair = line.split(';')[0];
        const eq = pair.indexOf('=');
        if (eq > 0) jar[pair.slice(0, eq)] = pair.slice(eq + 1);
      });
    }
    function cookieHeader(jar) {
      return Object.keys(jar).map(function (key) { return key + '=' + jar[key]; }).join('; ');
    }
    async function request(jar, method, urlPath, fields) {
      const res = await fetch(base + urlPath, {
        method,
        headers: Object.assign(
          { cookie: cookieHeader(jar) },
          fields ? { 'content-type': 'application/x-www-form-urlencoded' } : {}
        ),
        body: fields ? new URLSearchParams(fields) : undefined,
        redirect: 'manual'
      });
      takeCookies(jar, res);
      return { status: res.status, location: res.headers.get('location'), text: await res.text() };
    }
    const get = (jar, urlPath) => request(jar, 'GET', urlPath);
    const post = (jar, urlPath, fields) => request(jar, 'POST', urlPath, fields);
    function csrfOf(html) {
      const match = html.match(/name="_csrf" value="([^"]+)"/);
      assert.ok(match, 'csrf');
      return match[1];
    }
    function fields(code, alphabet) {
      const out = {};
      String(code).split('').forEach(function (ch, i) {
        out['d' + i] = alphabet ? alphabet[Number(ch)] : ch;
      });
      return out;
    }
    function visible(html) {
      return html.replace(/<input\b[^>]*>/gi, '').replace(/<[^>]+>/g, ' ');
    }
    function assertLtr(html) {
      assert.match(html, /<html[^>]*dir="rtl"/);
      const start = html.indexOf('class="otp"');
      assert.ok(start > 0);
      const block = html.slice(start, start + 900);
      assert.match(block, /dir="ltr"/);
      const d0 = block.indexOf('name="d0"');
      const d1 = block.indexOf('name="d1"');
      const d4 = block.indexOf('name="d4"');
      assert.ok(d0 > 0 && d0 < d1 && d1 < d4);
      const first = block.slice(d0, d1);
      assert.match(first, /autofocus/);
      assert.match(first, /class="on"/);
      assert.doesNotMatch(block.slice(d4, d4 + 180), /class="on"/);
    }
    function codeFor(phone) {
      const hit = calls.filter(function (call) { return call.body.to === phone; }).pop();
      assert.ok(hit, 'sms for ' + phone);
      return hit.body.text;
    }

    const jarA = {};
    const signupPage = await get(jarA, '/auth/signup');
    assert.equal(signupPage.status, 200);
    const signupCsrf = csrfOf(signupPage.text);
    const beforeExists = calls.length;
    const exists = await post(jarA, '/auth/signup', { _csrf: signupCsrf, phone: '09123456789' });
    assert.equal(exists.status, 200);
    assert.match(exists.text, /قبلاً/);
    assert.equal(calls.length, beforeExists);

    const phoneA = '09121110001';
    const logAtSend = logs.length;
    const sentA = await post(jarA, '/auth/signup', { _csrf: signupCsrf, phone: phoneA });
    assert.equal(sentA.status, 302);
    assert.equal(sentA.location, '/auth/signup/verify');
    const callA = calls[calls.length - 1];
    assert.equal(callA.url, sms.SMS_URL);
    assert.equal(callA.method, 'POST');
    assert.equal(callA.redirect, 'manual');
    assert.equal(callA.headers['Content-Type'], 'application/json');
    assert.equal(callA.body.username, 'raz-user');
    assert.equal(callA.body.password, 'raz-test-key');
    assert.equal(callA.body.to, phoneA);
    assert.equal(callA.body.bodyId, 123456);
    assert.equal(typeof callA.body.bodyId, 'number');
    assert.match(callA.body.text, /^\d{5}$/);
    assert.ok(!logs.slice(logAtSend).some((line) => line.includes(callA.body.text) || line.includes('raz-test-key')));
    const codeA = callA.body.text;
    const rowA = await knex('otp_codes').where({ phone: phoneA, sent: true }).orderBy('id', 'desc').first();
    assert.notEqual(rowA.code_hash, codeA);
    assert.equal(rowA.code_hash.length, 64);
    assert.ok(rowA.salt);
    assert.equal(Number(rowA.expires_at) - Number(rowA.created_at), otp.CODE_TTL_MS);
    assert.equal(rowA.code_hash === codeA || rowA.salt === codeA, false);
    const verifyA = await get(jarA, '/auth/signup/verify');
    assert.equal(verifyA.status, 200);
    assertLtr(verifyA.text);
    const leftA = Number(verifyA.text.match(/data-left="(\d+)"/)[1]);
    assert.ok(leftA >= 1 && leftA <= 60);
    assert.equal(verifyA.text.includes('?resend=1'), false);
    assert.equal(visible(verifyA.text).includes(codeA), false);
    assert.equal(visible(verifyA.text).includes('42971'), false);
    assert.equal(verifyA.text.includes('raz-test-key'), false);
    const wrongA = await post(jarA, '/auth/signup/verify', Object.assign({ _csrf: csrfOf(verifyA.text) }, fields('42971')));
    assert.equal(wrongA.status, 200);
    assert.match(wrongA.text, /کد درست نیست/);
    const okA = await post(jarA, '/auth/signup/verify', Object.assign({ _csrf: csrfOf(wrongA.text) }, fields(codeA, FA)));
    assert.equal(okA.status, 302);
    assert.equal(okA.location, '/auth/signup/profile');
    const profile = await get(jarA, '/auth/signup/profile');
    assert.equal(profile.status, 200);
    assert.match(profile.text, /مشخصات/);

    const isolated = await otp.issue({ phone: '09128000001', purpose: 'signup', ip: '203.0.113.50' });
    assert.equal(isolated.ok, true);
    const isolatedCode = calls[calls.length - 1].body.text;
    const wrongPurpose = await otp.check({ phone: '09128000001', purpose: 'login', code: isolatedCode });
    assert.equal(wrongPurpose.ok, false);
    const rightPurpose = await otp.check({ phone: '09128000001', purpose: 'signup', code: isolatedCode });
    assert.equal(rightPurpose.ok, true);

    const jarB = {};
    const phoneB = '09121110002';
    const pageB = await get(jarB, '/auth/signup');
    await post(jarB, '/auth/signup', { _csrf: csrfOf(pageB.text), phone: phoneB });
    const codeB = codeFor(phoneB);
    const wrongB = codeB === '00000' ? '11111' : '00000';
    let lastB = await get(jarB, '/auth/signup/verify');
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      lastB = await post(jarB, '/auth/signup/verify', Object.assign({ _csrf: csrfOf(lastB.text) }, fields(wrongB)));
      assert.equal(lastB.status, 200);
    }
    assert.match(lastB.text, /یک کد تازه بگیر/);
    const stillLocked = await post(jarB, '/auth/signup/verify', Object.assign({ _csrf: csrfOf(lastB.text) }, fields(codeB)));
    assert.equal(stillLocked.status, 200);
    assert.match(stillLocked.text, /یک کد تازه بگیر/);

    const jarC = {};
    const phoneC = '09121110003';
    const pageC = await get(jarC, '/auth/signup');
    await post(jarC, '/auth/signup', { _csrf: csrfOf(pageC.text), phone: phoneC });
    const countC = calls.filter(function (call) { return call.body.to === phoneC; }).length;
    const resendC = await get(jarC, '/auth/signup/verify?resend=1');
    assert.equal(resendC.status, 200);
    assert.equal(calls.filter(function (call) { return call.body.to === phoneC; }).length, countC);
    const leftC = Number(resendC.text.match(/data-left="(\d+)"/)[1]);
    assert.ok(leftC >= 1 && leftC <= 60);

    const jarD = {};
    const phoneD = '09121110004';
    const pageD = await get(jarD, '/auth/signup');
    await post(jarD, '/auth/signup', { _csrf: csrfOf(pageD.text), phone: phoneD });
    const codeD = codeFor(phoneD);
    await knex('otp_codes').where({ phone: phoneD }).update({
      created_at: Date.now() - 120000,
      expires_at: Date.now() - 1000
    });
    const expiredPage = await get(jarD, '/auth/signup/verify');
    assert.match(expiredPage.text, /href="\?resend=1"/);
    const expiredPost = await post(jarD, '/auth/signup/verify', Object.assign({ _csrf: csrfOf(expiredPage.text) }, fields(codeD)));
    assert.match(expiredPost.text, /منقضی/);
    const resentD = await get(jarD, '/auth/signup/verify?resend=1');
    assert.equal(resentD.status, 200);
    const codeD2 = codeFor(phoneD);
    assert.notEqual(codeD2, codeD);
    const oldD = await post(jarD, '/auth/signup/verify', Object.assign({ _csrf: csrfOf(resentD.text) }, fields(codeD)));
    assert.equal(oldD.status, 200);
    const newD = await post(jarD, '/auth/signup/verify', Object.assign({ _csrf: csrfOf(oldD.text) }, fields(codeD2)));
    assert.equal(newD.status, 302);
    assert.equal(newD.location, '/auth/signup/profile');

    const jarLogin = {};
    const forgotPage = await get(jarLogin, '/auth/forgot');
    assert.match(forgotPage.text, /با کد پیامکی وارد شو/);
    const forgotSent = await post(jarLogin, '/auth/forgot', { _csrf: csrfOf(forgotPage.text), phone: '09123456789' });
    assert.equal(forgotSent.status, 302);
    assert.equal(forgotSent.location, '/auth/forgot/code');
    const forgotCodePage = await get(jarLogin, '/auth/forgot/code');
    assertLtr(forgotCodePage.text);
    const loginCode = codeFor('09123456789');
    const loggedIn = await post(jarLogin, '/auth/forgot/verify', Object.assign({ _csrf: csrfOf(forgotCodePage.text) }, fields(loginCode, AR)));
    assert.equal(loggedIn.status, 302);
    assert.equal(loggedIn.location, '/panel');
    const panel = await get(jarLogin, '/panel');
    assert.equal(panel.status, 200);
    assert.match(panel.text, /یاسین/);
    const settings = await get(jarLogin, '/panel/settings');
    assert.equal(settings.text.includes('رمز فعلی'), false);
    const changed = await post(jarLogin, '/panel/settings/password', {
      _csrf: csrfOf(settings.text), next: '87654321', again: '87654321'
    });
    assert.equal(changed.status, 302);
    await post(jarLogin, '/auth/logout', { _csrf: csrfOf(settings.text) });
    const loginPage = await get(jarLogin, '/auth/login');
    const badPass = await post(jarLogin, '/auth/login', { _csrf: csrfOf(loginPage.text), phone: '09123456789', password: '12345678' });
    assert.equal(badPass.status, 200);
    const loginAgain = await get(jarLogin, '/auth/login');
    const goodPass = await post(jarLogin, '/auth/login', { _csrf: csrfOf(loginAgain.text), phone: '09123456789', password: '87654321' });
    assert.equal(goodPass.status, 302);
    assert.equal(goodPass.location, '/panel');

    const jarPhone = {};
    const freshLogin = await get(jarPhone, '/auth/login');
    const freshIn = await post(jarPhone, '/auth/login', {
      _csrf: csrfOf(freshLogin.text), phone: '09120000000', password: '12345678'
    });
    assert.equal(freshIn.status, 302);
    const changePage = await get(jarPhone, '/panel/settings?phone=1');
    const newPhone = '09127776655';
    const changeSent = await post(jarPhone, '/panel/settings/phone', { _csrf: csrfOf(changePage.text), newPhone });
    assert.equal(changeSent.status, 302);
    const changeCodePage = await get(jarPhone, changeSent.location);
    assertLtr(changeCodePage.text);
    const phoneCode = codeFor(newPhone);
    const changedPhone = await post(jarPhone, '/panel/settings/phone/verify', Object.assign({
      _csrf: csrfOf(changeCodePage.text)
    }, fields(phoneCode, FA)));
    assert.equal(changedPhone.status, 302);
    const freshRow = await knex('users').where({ id: 'fresh' }).first();
    assert.equal(freshRow.phone, newPhone);

    const jarFail = {};
    const failPage = await get(jarFail, '/auth/signup');
    mode = 'status';
    failStatus = -110;
    const errAt = errors.length;
    const failed = await post(jarFail, '/auth/signup', { _csrf: csrfOf(failPage.text), phone: '09121110005' });
    assert.equal(failed.status, 200);
    assert.ok(failed.text.includes(SMS_ERROR));
    assert.equal(failed.text.includes('42971'), false);
    assert.ok(errors.slice(errAt).some((line) => line.includes('sms RetStatus -110')));
    assert.ok(!errors.slice(errAt).some((line) => line.includes('raz-test-key')));
    const failedRow = await knex('otp_codes').where({ phone: '09121110005' }).orderBy('id', 'desc').first();
    assert.equal(Number(failedRow.sent), 0);
    assert.equal(failedRow.code_hash, '');
    mode = 'ok';

    delete process.env.RAZ_USERNAME;
    delete process.env.RAZ_API_KEY;
    delete process.env.RAZ_BODY_ID;
    mode = 'throw';
    const demoLogs = logs.length;
    const jarDemo = {};
    const demoPage = await get(jarDemo, '/auth/signup');
    const demoPhone = '09121110006';
    const demoSent = await post(jarDemo, '/auth/signup', { _csrf: csrfOf(demoPage.text), phone: demoPhone });
    assert.equal(demoSent.status, 302);
    assert.ok(logs.slice(demoLogs).some((line) => line.includes('otp demo ' + demoPhone + ' 42971')));
    const demoVerify = await get(jarDemo, '/auth/signup/verify');
    assert.equal(visible(demoVerify.text).includes('42971'), false);
    assertLtr(demoVerify.text);
    const demoOk = await post(jarDemo, '/auth/signup/verify', Object.assign({ _csrf: csrfOf(demoVerify.text) }, fields('42971', FA)));
    assert.equal(demoOk.status, 302);
    assert.equal(demoOk.location, '/auth/signup/profile');

    process.env.RAZ_USERNAME = 'raz-user';
    process.env.RAZ_API_KEY = 'raz-test-key';
    process.env.RAZ_BODY_ID = '123456';
    mode = 'ok';
    await knex('otp_codes').where({ phone: newPhone }).update({ created_at: Date.now() - 61000 });
    const jarReal = {};
    const realPage = await get(jarReal, '/auth/forgot');
    const realSent = await post(jarReal, '/auth/forgot', { _csrf: csrfOf(realPage.text), phone: newPhone });
    assert.equal(realSent.status, 302);
    const realCodePage = await get(jarReal, '/auth/forgot/code');
    const realCode = codeFor(newPhone);
    assert.notEqual(realCode, '42971');
    const demoRejected = await post(jarReal, '/auth/forgot/verify', Object.assign({ _csrf: csrfOf(realCodePage.text) }, fields('42971')));
    assert.equal(demoRejected.status, 200);
    assert.match(demoRejected.text, /کد درست نیست/);
    const realOk = await post(jarReal, '/auth/forgot/verify', Object.assign({ _csrf: csrfOf(demoRejected.text) }, fields(realCode)));
    assert.equal(realOk.status, 302);
    assert.equal(realOk.location, '/panel');
    assert.ok(!logs.some((line) => line.includes('raz-test-key')));
    assert.ok(!errors.some((line) => line.includes('raz-test-key')));
  } finally {
    console.log = origLog;
    console.error = origErr;
    global.fetch = origFetch;
    if (server) await new Promise(function (resolve) { server.close(resolve); });
    try { await getKnex().destroy(); } catch (err) {}
    fs.rmSync(dbFile, { force: true });
    fs.rmSync(dbFile + '-wal', { force: true });
    fs.rmSync(dbFile + '-shm', { force: true });
  }
});
