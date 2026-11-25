const SMS_URL = 'https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber';
const SMS_TIMEOUT_MS = 10000;

function configured() {
  return !!(String(process.env.RAZ_USERNAME || '').trim()
    && String(process.env.RAZ_API_KEY || '').trim()
    && String(process.env.RAZ_BODY_ID || '').trim());
}

function logStatus(status) {
  console.error('sms RetStatus', status);
}

async function sendSms(phone, code, timeoutMs) {
  const username = String(process.env.RAZ_USERNAME || '').trim();
  const password = String(process.env.RAZ_API_KEY || '').trim();
  const bodyId = Number(String(process.env.RAZ_BODY_ID || '').trim());
  if (!username || !password || !Number.isInteger(bodyId)) {
    logStatus('config');
    return { ok: false, status: 'config' };
  }
  const limit = timeoutMs == null ? SMS_TIMEOUT_MS : timeoutMs;
  try {
    const res = await fetch(SMS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        username,
        password,
        text: String(code),
        to: phone,
        bodyId
      }),
      redirect: 'manual',
      signal: AbortSignal.timeout(limit)
    });
    const data = await res.json().catch(function () { return {}; });
    const raw = data && data.RetStatus;
    const status = raw == null || raw === '' ? null : Number(raw);
    if (status !== 1) {
      const shown = Number.isFinite(status) ? status : (raw != null ? raw : 'http ' + res.status);
      logStatus(shown);
      return { ok: false, status: shown };
    }
    return { ok: true, status };
  } catch (err) {
    const status = err && err.name === 'TimeoutError' ? 'timeout' : 'network';
    logStatus(status);
    return { ok: false, status };
  }
}

module.exports = { SMS_URL, SMS_TIMEOUT_MS, configured, sendSms };
