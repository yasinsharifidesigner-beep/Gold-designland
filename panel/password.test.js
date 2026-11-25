const path = require('path');
const os = require('os');
const fs = require('fs');
const assert = require('node:assert/strict');
const test = require('node:test');
const bcrypt = require('bcrypt');

const dbFile = path.join(os.tmpdir(), 'gdl-pass-' + process.pid + '-' + Date.now() + '.sqlite');
process.env.DB_PATH = dbFile;
delete process.env.DATABASE_URL;
delete process.env.RAZ_USERNAME;
delete process.env.RAZ_API_KEY;
delete process.env.RAZ_BODY_ID;
process.env.SESSION_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

const express = require('express');
const { init, getKnex } = require('./db');
const lib = require('./lib');

test('password rule, digit keyboards, and toasts', async () => {
  assert.equal(lib.normalizePassword('طلا۱۲۳٤'), 'طلا1234');
  assert.equal(lib.passwordOk('طلا۱۲۳۴'), true);
  assert.equal(lib.passwordOk('abc١٢٣'), true);
  assert.equal(lib.passwordOk('abc123'), true);
  assert.equal(lib.passwordOk('123456'), false);
  assert.equal(lib.passwordOk('abcdef'), false);
  assert.equal(lib.passwordOk('ab12'), false);
  assert.equal(lib.passwordOk(''), false);

  await init();
  const knex = getKnex();
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  require('./mount')(app);
  const server = await new Promise(function (resolve) {
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
  function otpFields(code) {
    const out = {};
    String(code).split('').forEach(function (ch, i) { out['d' + i] = ch; });
    return out;
  }

  try {
    const quiet = await get({}, '/auth/login');
    assert.equal(quiet.status, 200);
    assert.match(quiet.text, /id="toasts"/);
    assert.equal(quiet.text.includes('toast-seed'), false);
    assert.equal(quiet.text.includes('class="err"'), false);

    const yasin = {};
    const login = await get(yasin, '/auth/login');
    const faLogin = await post(yasin, '/auth/login', {
      _csrf: csrfOf(login.text), phone: '09123456789', password: '۱۲۳۴۵۶۷۸'
    });
    assert.equal(faLogin.status, 302);
    assert.equal(faLogin.location, '/panel');
    const desk = await get(yasin, '/panel');
    assert.equal(desk.status, 200);
    assert.match(desk.text, /id="toasts"/);
    assert.equal(desk.text.includes('toast-seed'), false);

    const weak = await post(yasin, '/panel/settings/password', {
      _csrf: csrfOf(desk.text), current: '12345678', next: '123456', again: '123456'
    });
    assert.equal(weak.status, 200);
    assert.match(weak.text, /data-kind="error"/);
    assert.match(weak.text, /رمز باید حداقل ۶ کاراکتر و شامل حرف و عدد باشه/);
    assert.match(weak.text, /data-open="password"/);
    assert.match(weak.text, /data-pass-hint/);
    assert.equal(weak.text.includes('class="err"'), false);
    const mismatch = await post(yasin, '/panel/settings/password', {
      _csrf: csrfOf(weak.text), current: '12345678', next: 'gold123', again: 'gold124'
    });
    assert.match(mismatch.text, /رمز و تکرارش یکی نیستند/);
    const badCurrent = await post(yasin, '/panel/settings/password', {
      _csrf: csrfOf(mismatch.text), current: 'nope12', next: 'gold123', again: 'gold123'
    });
    assert.match(badCurrent.text, /رمز درست نیست/);
    const changed = await post(yasin, '/panel/settings/password', {
      _csrf: csrfOf(badCurrent.text), current: '۱۲۳۴۵۶۷۸', next: 'طلا۱۲۳۴', again: 'طلا1234'
    });
    assert.equal(changed.status, 302);
    await post(yasin, '/auth/logout', { _csrf: csrfOf(badCurrent.text) });
    const again = await get(yasin, '/auth/login');
    const back = await post(yasin, '/auth/login', {
      _csrf: csrfOf(again.text), phone: '09123456789', password: 'طلا1234'
    });
    assert.equal(back.status, 302);

    const offer = await get(yasin, '/panel/subscription/basic');
    const coded = await post(yasin, '/panel/subscription/basic/discount', {
      _csrf: csrfOf(offer.text), code: 'GDL20'
    });
    assert.equal(coded.status, 302);
    const checkout = await get(yasin, coded.location);
    assert.match(checkout.text, /data-kind="success"/);
    assert.match(checkout.text, /کد تخفیف اعمال شد/);
    assert.equal(checkout.text.includes('class="oknote"'), false);
    assert.equal(checkout.text.includes('class="err"'), false);

    const raw = 'رمز۱۲۳۴۵';
    await knex('users').where({ phone: '09120000000' }).update({
      password_hash: await bcrypt.hash(raw, 10)
    });
    const legacy = {};
    const legacyPage = await get(legacy, '/auth/login');
    const legacyOk = await post(legacy, '/auth/login', {
      _csrf: csrfOf(legacyPage.text), phone: '09120000000', password: raw
    });
    assert.equal(legacyOk.status, 302);
    await post(legacy, '/auth/logout', { _csrf: csrfOf(legacyPage.text) });
    const legacyAgain = await get(legacy, '/auth/login');
    const legacyNorm = await post(legacy, '/auth/login', {
      _csrf: csrfOf(legacyAgain.text), phone: '09120000000', password: 'رمز12345'
    });
    assert.equal(legacyNorm.status, 200);
    assert.match(legacyNorm.text, /رمز درست نیست/);

    const jar = {};
    const phone = '09125550007';
    const start = await get(jar, '/auth/signup');
    const sent = await post(jar, '/auth/signup', { _csrf: csrfOf(start.text), phone });
    assert.equal(sent.status, 302);
    const codePage = await get(jar, sent.location);
    assert.match(codePage.text, /id="toasts"/);
    const verified = await post(jar, '/auth/signup/verify', Object.assign({ _csrf: csrfOf(codePage.text) }, otpFields('42971')));
    assert.equal(verified.status, 302);
    const profile = await get(jar, verified.location);
    const saved = await post(jar, '/auth/signup/profile', {
      _csrf: csrfOf(profile.text), first: 'نونا', last: 'آزمون', d: '2', m: '3', y: '1370'
    });
    assert.equal(saved.status, 302);
    const passPage = await get(jar, saved.location);
    assert.match(passPage.text, /data-pass-hint/);
    assert.match(passPage.text, /حداقل ۶ کاراکتر، با حرف و عدد/);
    const badRule = await post(jar, '/auth/signup/password', {
      _csrf: csrfOf(passPage.text), password: '123456', again: '123456'
    });
    assert.equal(badRule.status, 200);
    assert.match(badRule.text, /toast-seed/);
    assert.match(badRule.text, /رمز باید حداقل ۶ کاراکتر و شامل حرف و عدد باشه/);
    assert.equal(badRule.text.includes('<p class="err"'), false);
    const badMatch = await post(jar, '/auth/signup/password', {
      _csrf: csrfOf(badRule.text), password: 'abc123', again: 'abc124'
    });
    assert.match(badMatch.text, /رمز و تکرارش یکی نیستند/);
    const made = await post(jar, '/auth/signup/password', {
      _csrf: csrfOf(badMatch.text), password: 'طلا۱۲۳۴', again: 'طلا1234'
    });
    assert.equal(made.status, 302);
    assert.equal(made.location, '/panel');
    await post(jar, '/auth/logout', { _csrf: csrfOf(badMatch.text) });
    const freshLogin = await get(jar, '/auth/login');
    const freshIn = await post(jar, '/auth/login', {
      _csrf: csrfOf(freshLogin.text), phone, password: 'طلا1234'
    });
    assert.equal(freshIn.status, 302);
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
    try { await getKnex().destroy(); } catch (err) {}
    fs.rmSync(dbFile, { force: true });
  }
});
