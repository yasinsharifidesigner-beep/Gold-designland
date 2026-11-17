const FA = '۰۱۲۳۴۵۶۷۸۹';

function faDigits(value) {
  return String(value).replace(/\d/g, (d) => FA[d]);
}

function faMoney(n) {
  const raw = Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return faDigits(raw);
}

function toLatinDigits(value) {
  return String(value || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function normalizePhone(value) {
  let d = toLatinDigits(value).replace(/\D/g, '');
  if (d.startsWith('98') && d.length === 12) d = '0' + d.slice(2);
  if (d.startsWith('9') && d.length === 10) d = '0' + d;
  return d;
}

function phoneSpaced(phone) {
  const d = normalizePhone(phone);
  if (d.length !== 11) return faDigits(d);
  return faDigits(d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7));
}

function phoneMasked(phone) {
  const d = normalizePhone(phone);
  if (d.length !== 11) return faDigits(d);
  return faDigits(d.slice(0, 4)) + ' *** **' + faDigits(d.slice(9));
}

const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return req.session.csrf;
}

function checkCsrf(req) {
  return req.body && req.body._csrf && req.body._csrf === req.session.csrf;
}

module.exports = {
  faDigits, faMoney, toLatinDigits, normalizePhone, phoneSpaced, phoneMasked,
  MONTHS, csrfToken, checkCsrf
};
