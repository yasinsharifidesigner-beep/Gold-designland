const crypto = require('crypto');
const { getKnex } = require('./db');
const lib = require('./lib');
const texts = require('./texts');
const sms = require('./sms');

const DEMO_CODE = '42971';
const CODE_TTL_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 60 * 1000;
const PHONE_HOUR_LIMIT = 5;
const IP_HOUR_LIMIT = 20;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function db() { return getKnex(); }

function ms(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hashCode(code, salt) {
  return new Promise(function (resolve, reject) {
    crypto.scrypt(String(code), salt, 32, { N: 16384, r: 8, p: 1 }, function (err, key) {
      if (err) reject(err);
      else resolve(key.toString('hex'));
    });
  });
}

function sameHash(stored, computed) {
  const a = Buffer.from(String(stored || ''), 'hex');
  const b = Buffer.from(String(computed || ''), 'hex');
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function cleanIp(ip) {
  return String(ip || 'unknown').replace(/^::ffff:/, '').slice(0, 64) || 'unknown';
}

function leftFrom(row, now) {
  if (!row) return 0;
  const remain = COOLDOWN_MS - (now - ms(row.created_at));
  if (remain <= 0) return 0;
  return Math.ceil(remain / 1000);
}

async function countOf(query) {
  const row = await query.count({ c: '*' }).first();
  return Number(row && row.c) || 0;
}

async function cooldownLeft(phone) {
  const row = await db()('otp_codes').where({ phone, sent: true }).orderBy('id', 'desc').first();
  return leftFrom(row, Date.now());
}

function message(reason) {
  if (reason === 'sms') return texts.t('auth.errSms');
  if (reason === 'phone_limit' || reason === 'ip_limit') return texts.t('auth.errMany');
  if (reason === 'locked') return texts.t('auth.errLocked');
  if (reason === 'expired') return texts.t('auth.errExpired');
  return texts.t('auth.errCode');
}

async function issue(input) {
  const phone = String(input.phone || '');
  const purpose = String(input.purpose || '');
  const ip = cleanIp(input.ip);
  const now = Date.now();
  const hourAgo = now - HOUR_MS;
  const demo = !sms.configured();

  await db()('otp_codes').where('created_at', '<', now - DAY_MS).delete();

  const recent = await db()('otp_codes')
    .where({ phone, sent: true })
    .where('created_at', '>', now - COOLDOWN_MS)
    .orderBy('id', 'desc')
    .first();
  if (recent) return { ok: true, skipped: true, left: leftFrom(recent, now), demo };

  const phoneSends = await countOf(db()('otp_codes').where({ phone, sent: true }).where('created_at', '>=', hourAgo));
  if (phoneSends >= PHONE_HOUR_LIMIT) return { ok: false, reason: 'phone_limit', left: 0 };

  const ipSends = await countOf(db()('otp_codes').where({ ip }).where('created_at', '>=', hourAgo));
  if (ipSends >= IP_HOUR_LIMIT) return { ok: false, reason: 'ip_limit', left: 0 };

  const code = demo ? DEMO_CODE : String(crypto.randomInt(0, 100000)).padStart(5, '0');
  if (demo) {
    console.log('otp demo ' + phone + ' ' + DEMO_CODE);
  } else {
    const sent = await sms.sendSms(phone, code);
    if (!sent.ok) {
      await db()('otp_codes').insert({
        phone, purpose, code_hash: '', salt: '', attempts: 0,
        expires_at: now, created_at: now, ip, sent: false, consumed: true
      });
      return { ok: false, reason: 'sms', left: 0 };
    }
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const codeHash = await hashCode(code, salt);
  await db()('otp_codes').where({ phone, purpose, consumed: false }).update({ consumed: true });
  await db()('otp_codes').insert({
    phone, purpose, code_hash: codeHash, salt, attempts: 0,
    expires_at: now + CODE_TTL_MS, created_at: now, ip, sent: true, consumed: false
  });
  return { ok: true, left: Math.ceil(COOLDOWN_MS / 1000), demo };
}

async function check(input) {
  const phone = String(input.phone || '');
  const purpose = String(input.purpose || '');
  const normalized = lib.toLatinDigits(input.code || '').replace(/\D/g, '');
  const row = await db()('otp_codes').where({ phone, purpose, sent: true }).orderBy('id', 'desc').first();
  if (!row || !row.code_hash || !row.salt) return { ok: false, reason: 'missing' };
  if (ms(row.expires_at) <= Date.now()) return { ok: false, reason: 'expired' };
  const attemptsSoFar = Number(row.attempts) || 0;
  if (row.consumed && attemptsSoFar >= MAX_ATTEMPTS) return { ok: false, reason: 'locked' };
  if (row.consumed) return { ok: false, reason: 'missing' };
  if (!/^\d{5}$/.test(normalized)) return { ok: false, reason: 'mismatch' };
  const expected = await hashCode(normalized, row.salt);
  if (!sameHash(row.code_hash, expected)) {
    const attempts = attemptsSoFar + 1;
    const locked = attempts >= MAX_ATTEMPTS;
    await db()('otp_codes').where({ id: row.id, consumed: false }).update({ attempts, consumed: locked });
    return { ok: false, reason: locked ? 'locked' : 'mismatch' };
  }
  await db()('otp_codes').where({ id: row.id, consumed: false }).update({ consumed: true });
  return { ok: true };
}

module.exports = {
  DEMO_CODE, CODE_TTL_MS, MAX_ATTEMPTS, COOLDOWN_MS, PHONE_HOUR_LIMIT, IP_HOUR_LIMIT,
  issue, check, cooldownLeft, message
};
