const { MONTHS } = require('./lib');

const SEP = ' › ';
const FA = '۰۱۲۳۴۵۶۷۸۹';

const PAGES = [
  { id: 'landing', label: 'صفحه اصلی', groups: ['landing'] },
  { id: 'auth', label: 'ورود/ثبت‌نام', groups: ['auth'] },
  { id: 'panel', label: 'پنل کاربری', groups: ['nav', 'dash', 'idea', 'assistant', 'image', 'refine', 'projects', 'stage', 'courses', 'sub', 'settings'] },
  { id: 'common', label: 'مشترک', groups: ['common', 'month'] }
];

const pageById = Object.create(null);
PAGES.forEach((page) => { pageById[page.id] = page; });

function faNum(n) {
  return String(n).replace(/\d/g, (d) => FA[d]);
}

function pageByGroup(group) {
  for (let i = 0; i < PAGES.length; i++) {
    if (PAGES[i].groups.indexOf(group) !== -1) return PAGES[i];
  }
  return PAGES[PAGES.length - 1];
}

const byKey = Object.create(null);
const ordered = [];

function add(pageId, section, key, leaf) {
  if (byKey[key]) throw new Error('duplicate text place: ' + key);
  const page = pageById[pageId];
  const info = {
    pageId: page.id,
    pageLabel: page.label,
    location: page.label + SEP + section + SEP + leaf,
    sort: ordered.length
  };
  byKey[key] = info;
  ordered.push(key);
}

function block(pageId, section, rows) {
  rows.forEach((row) => add(pageId, section, row[0], row[1]));
}

block('landing', 'عنوان برگه', [
  ['landing.title', 'عنوان مرورگر']
]);
block('landing', 'هدر', [
  ['landing.brandSub', 'نشان انگلیسی'],
  ['landing.nav.idea', 'لینک ایده‌پردازی'],
  ['landing.nav.assistant', 'لینک دستیار'],
  ['landing.nav.roadmap', 'لینک نقشه راه'],
  ['landing.nav.faq', 'لینک سوالات متداول'],
  ['landing.nav.gift', 'لینک هدیه ثبت‌نام'],
  ['landing.theme', 'تغییر حالت روشن و تیره'],
  ['landing.login', 'دکمه ورود و ثبت‌نام'],
  ['landing.menu', 'دکمه منو']
]);
block('landing', 'عنوان اصلی', [
  ['landing.hero.before', 'شروع عنوان'],
  ['landing.hero.em', 'عبارت برجسته'],
  ['landing.hero.after', 'ادامه عنوان'],
  ['landing.hero.cta', 'دکمه هدیه'],
  ['landing.hero.road', 'دکمه نقشه راه']
]);
block('landing', 'ایده‌پردازی', [
  ['landing.idea.before', 'شروع عنوان'],
  ['landing.idea.em', 'عبارت برجسته'],
  ['landing.idea.after', 'ادامه عنوان'],
  ['landing.idea.f1', 'ویژگی اول'],
  ['landing.idea.f2', 'ویژگی دوم'],
  ['landing.idea.f3', 'ویژگی سوم'],
  ['landing.idea.cta', 'دکمه'],
  ['landing.idea.sample', 'نمونهٔ نوشته'],
  ['landing.idea.build', 'دکمه بساز']
]);
block('landing', 'دستیار', [
  ['landing.assist.h', 'عنوان'],
  ['landing.assist.p', 'توضیح'],
  ['landing.assist.cta', 'دکمه'],
  ['landing.assist.name', 'نام دستیار'],
  ['landing.assist.m1', 'پیام کاربر، اول'],
  ['landing.assist.m2', 'پاسخ دستیار، اول'],
  ['landing.assist.m3', 'پیام کاربر، دوم'],
  ['landing.assist.m4', 'پاسخ دستیار، دوم']
]);
block('landing', 'نقشه راه', [
  ['landing.road.before', 'شروع عنوان'],
  ['landing.road.em', 'عبارت برجسته'],
  ['landing.road.1', 'گام ثبت‌نام'],
  ['landing.road.2', 'گام ایده‌پردازی'],
  ['landing.road.3', 'گام انتخاب طرح'],
  ['landing.road.4', 'گام مدل‌سازی'],
  ['landing.road.4b', 'برچسب ویژهٔ طراح‌ها'],
  ['landing.road.5', 'گام سفارش'],
  ['landing.road.6', 'گام تولید تصویر'],
  ['landing.road.cta', 'دکمه']
]);
block('landing', 'هدیه ثبت‌نام', [
  ['landing.gift.before', 'شروع عنوان'],
  ['landing.gift.em', 'عبارت برجسته'],
  ['landing.gift.title', 'عنوان جعبه'],
  ['landing.gift.i1', 'مورد اول'],
  ['landing.gift.i2', 'مورد دوم'],
  ['landing.gift.i3', 'مورد سوم'],
  ['landing.gift.cta', 'دکمه']
]);
block('landing', 'سوالات متداول', [
  ['landing.faq.title', 'عنوان']
]);
for (let n = 1; n <= 24; n++) {
  add('landing', 'سوالات متداول', 'landing.faq.' + n + '.q', 'سوال ' + faNum(n));
  add('landing', 'سوالات متداول', 'landing.faq.' + n + '.a', 'جواب سوال ' + faNum(n));
}
block('landing', 'پاورقی', [
  ['landing.foot.blurb', 'معرفی'],
  ['landing.foot.links', 'عنوان لینک‌ها'],
  ['landing.foot.contact', 'عنوان تماس'],
  ['landing.foot.email', 'ایمیل'],
  ['landing.foot.phone', 'تلفن'],
  ['landing.foot.legal', 'قوانین و حریم خصوصی'],
  ['landing.foot.social', 'عنوان شبکه‌ها'],
  ['landing.foot.ig', 'اینستاگرام'],
  ['landing.foot.tg', 'تلگرام'],
  ['landing.foot.copy', 'حق نشر']
]);

block('auth', 'عنوان برگه', [
  ['auth.loginTitle', 'عنوان مرورگر']
]);
block('auth', 'شماره موبایل', [
  ['auth.signupPhoneTitle', 'عنوان'],
  ['auth.step', 'شمارهٔ مرحله'],
  ['auth.phonePh', 'جای شماره'],
  ['auth.sendCode', 'دکمه ارسال کد'],
  ['auth.haveAccount', 'لینک ورود']
]);
block('auth', 'کد تأیید', [
  ['auth.codeTitle', 'عنوان کد ثبت‌نام'],
  ['auth.otpTitle', 'عنوان ورود با کد'],
  ['auth.codeFor', 'برچسب گیرنده'],
  ['auth.codeSentTail', 'ادامهٔ پیام کد'],
  ['auth.resendIn', 'متن شمارش معکوس'],
  ['auth.resend', 'لینک ارسال دوباره'],
  ['auth.confirm', 'دکمه تأیید'],
  ['auth.go', 'دکمه ادامه'],
  ['auth.fixPhone', 'لینک اصلاح شماره'],
  ['auth.backPassword', 'لینک برگشت به رمز']
]);
block('auth', 'مشخصات', [
  ['auth.profileTitle', 'عنوان'],
  ['auth.firstPh', 'جای نام'],
  ['auth.lastPh', 'جای نام خانوادگی'],
  ['auth.day', 'برچسب روز'],
  ['auth.month', 'برچسب ماه'],
  ['auth.year', 'برچسب سال'],
  ['auth.next', 'دکمه ادامه']
]);
block('auth', 'رمز عبور', [
  ['auth.passTitle', 'عنوان'],
  ['auth.passPh', 'جای رمز'],
  ['auth.againPh', 'جای تکرار رمز']
]);
block('auth', 'ورود', [
  ['auth.loginH', 'عنوان'],
  ['auth.forgot', 'لینک فراموشی رمز'],
  ['auth.noAccount', 'لینک ثبت‌نام']
]);
block('auth', 'خطا', [
  ['auth.errPhone', 'شماره نادرست'],
  ['auth.errExists', 'شمارهٔ تکراری'],
  ['auth.errCode', 'کد نادرست'],
  ['auth.errProfile', 'مشخصات ناقص'],
  ['auth.errPass', 'رمز و تکرار یکی نیستند'],
  ['auth.errNoUser', 'حساب پیدا نشد'],
  ['auth.errBadPass', 'رمز نادرست'],
  ['auth.errBlocked', 'حساب مسدود'],
  ['auth.errSms', 'خطای ارسال پیامک'],
  ['auth.errMany', 'سقف درخواست کد'],
  ['auth.errLocked', 'تلاش بیش از حد'],
  ['auth.errExpired', 'کد منقضی']
]);

block('panel', 'منوی کناری', [
  ['nav.desk', 'میز کار'],
  ['nav.idea', 'ایده‌پردازی'],
  ['nav.refine', 'اصلاح و انتخاب طرح'],
  ['nav.assistant', 'طراحیار'],
  ['nav.image', 'ساخت تصویر'],
  ['nav.projects', 'پروژه‌ها'],
  ['nav.courses', 'دوره‌ها'],
  ['nav.sub', 'اشتراک'],
  ['nav.settings', 'تنظیمات'],
  ['nav.menu', 'دکمه منو'],
  ['nav.theme', 'تغییر ظاهر']
]);
block('panel', 'میز کار', [
  ['dash.title', 'عنوان'],
  ['dash.helloEmpty', 'خوش‌آمد، میز خالی'],
  ['dash.helloWork', 'خوش‌آمد، با کار'],
  ['dash.projects', 'عنوان پروژه‌ها'],
  ['dash.noProject', 'متن خالی پروژه‌ها'],
  ['dash.startProject', 'دکمه شروع پروژه'],
  ['dash.path', 'عنوان مسیر']
]);
block('panel', 'مسیر طرح', [
  ['stage.idea', 'ایده‌پردازی'],
  ['stage.refine', 'اصلاح و انتخاب طرح'],
  ['stage.assistant', 'طراحیار'],
  ['stage.image', 'ساخت تصویر']
]);
block('panel', 'میز کار', [
  ['dash.ideas', 'عنوان ایده‌ها'],
  ['dash.noIdea', 'متن خالی ایده‌ها'],
  ['dash.startIdea', 'دکمه شروع ایده'],
  ['dash.asks', 'عنوان سؤال‌ها'],
  ['dash.gift', 'ماندهٔ پیام هدیه'],
  ['dash.noAsk', 'متن خالی سؤال'],
  ['dash.firstAsk', 'دکمه اولین سؤال'],
  ['dash.shots', 'عنوان عکس‌ها'],
  ['dash.noShot', 'متن خالی عکس']
]);
block('panel', 'ایده‌پردازی', [
  ['idea.sub', 'توضیح فهرست'],
  ['idea.hello', 'پیام فهرست خالی'],
  ['idea.placeholder', 'جای نوشتن فهرست'],
  ['idea.startFresh', 'دکمه شروع تازه'],
  ['idea.freshTitle', 'عنوان گفت‌وگو'],
  ['idea.welcome', 'پیام آغاز گفت‌وگو'],
  ['idea.composer', 'جای نوشتن گفت‌وگو'],
  ['idea.needStyle', 'خطای سبک و تعداد'],
  ['idea.summary', 'جمع‌بندی ایده'],
  ['idea.blurb1', 'توضیح نمونه‌ها'],
  ['idea.blurb2', 'توضیح انتخاب'],
  ['idea.done', 'پیام پایان']
]);
block('panel', 'طراحیار', [
  ['assistant.sub', 'توضیح فهرست'],
  ['assistant.hello', 'پیام فهرست خالی'],
  ['assistant.placeholder', 'جای نوشتن'],
  ['assistant.freshTitle', 'عنوان گفت‌وگو'],
  ['assistant.refineIntro', 'پیام شروع از طرح'],
  ['assistant.reply', 'پاسخ گفت‌وگو'],
  ['assistant.continue', 'دکمه ادامه']
]);
block('panel', 'ساخت تصویر', [
  ['image.sub', 'توضیح فهرست'],
  ['image.placeholder', 'جای نوشتن'],
  ['image.intro', 'پیام شروع از طرح'],
  ['image.generic', 'پاسخ گفت‌وگو'],
  ['image.ready', 'پیام آماده‌شدن'],
  ['image.make', 'دکمه ساخت عکس']
]);
block('panel', 'اصلاح و انتخاب طرح', [
  ['refine.sub', 'توضیح'],
  ['refine.empty', 'متن خالی'],
  ['refine.pending', 'عنوان در انتظار'],
  ['refine.picked', 'عنوان انتخاب‌شده'],
  ['refine.got', 'پاسخ دریافت خواسته'],
  ['refine.more', 'پاسخ سؤال بعدی']
]);
block('panel', 'پروژه‌ها', [
  ['projects.title', 'عنوان'],
  ['projects.sub', 'توضیح'],
  ['projects.wait', 'متن مرحلهٔ نرسیده']
]);
block('panel', 'دوره‌ها', [
  ['courses.title', 'عنوان'],
  ['courses.sub', 'توضیح'],
  ['courses.continue', 'دکمه ادامهٔ دوره']
]);
block('panel', 'اشتراک', [
  ['sub.title', 'عنوان'],
  ['sub.activeLead', 'توضیح اشتراک فعال'],
  ['sub.giftLead', 'توضیح هدیه'],
  ['sub.activeName', 'نام اشتراک فعال'],
  ['sub.giftName', 'نام اشتراک هدیه'],
  ['sub.range', 'بازهٔ تاریخ'],
  ['sub.left', 'ماندهٔ اشتراک'],
  ['sub.featured', 'برچسب پیشنهاد'],
  ['sub.perMonth', 'واحد قیمت ماهانه'],
  ['sub.pick', 'دکمه انتخاب']
]);
block('panel', 'خرید اشتراک', [
  ['sub.checkoutTitle', 'عنوان'],
  ['sub.back', 'بازگشت'],
  ['sub.planName', 'نام طرح'],
  ['sub.term', 'مدت'],
  ['sub.toman', 'واحد پول'],
  ['sub.codePh', 'جای کد تخفیف'],
  ['sub.apply', 'دکمه اعمال'],
  ['sub.amount', 'مبلغ اشتراک'],
  ['sub.discount', 'تخفیف'],
  ['sub.final', 'مبلغ نهایی'],
  ['sub.pay', 'دکمه پرداخت'],
  ['sub.payNote', 'توضیح پرداخت'],
  ['sub.fail', 'خطای پرداخت'],
  ['sub.badCode', 'خطای کد تخفیف'],
  ['sub.codeOk', 'پیام اعمال کد']
]);
block('panel', 'فعال‌شدن اشتراک', [
  ['sub.successTitle', 'عنوان برگه'],
  ['sub.successH', 'عنوان'],
  ['sub.successP', 'توضیح'],
  ['sub.toDesk', 'دکمه میز کار']
]);
block('panel', 'نمایش آزمایشی اشتراک', [
  ['sub.mockStart', 'تاریخ شروع'],
  ['sub.mockEnd', 'تاریخ پایان'],
  ['sub.mockPct', 'درصد باقی‌مانده']
]);
block('panel', 'تنظیمات', [
  ['settings.title', 'عنوان'],
  ['settings.sub', 'توضیح'],
  ['settings.tabs', 'برچسب تب‌ها'],
  ['settings.account', 'تب حساب'],
  ['settings.changePhoto', 'تغییر عکس'],
  ['settings.first', 'نام'],
  ['settings.last', 'نام خانوادگی'],
  ['settings.birth', 'تاریخ تولد'],
  ['settings.mobile', 'شمارهٔ موبایل'],
  ['settings.changePhone', 'تغییر شماره'],
  ['settings.save', 'دکمه ذخیره'],
  ['settings.password', 'تب رمز'],
  ['settings.current', 'رمز فعلی'],
  ['settings.next', 'رمز جدید'],
  ['settings.again', 'تکرار رمز'],
  ['settings.changePass', 'دکمه تغییر رمز'],
  ['settings.appearance', 'تب ظاهر'],
  ['settings.light', 'حالت روشن'],
  ['settings.dark', 'حالت تیره'],
  ['settings.notes', 'تب اعلان‌ها'],
  ['settings.noteSub', 'عنوان پیامک اشتراک'],
  ['settings.noteSubP', 'توضیح پیامک اشتراک'],
  ['settings.noteSession', 'عنوان پیامک جلسه'],
  ['settings.noteSessionP', 'توضیح پیامک جلسه'],
  ['settings.logout', 'تب خروج']
]);

block('common', 'لوگو', [
  ['common.brand', 'نام برند']
]);
block('common', 'گفت‌وگو', [
  ['common.project', 'برچسب پروژه'],
  ['common.attach', 'دکمه پیوست'],
  ['common.send', 'دکمه ارسال'],
  ['common.typing', 'در حال نوشتن'],
  ['common.stageOf', 'برچسب مرحله'],
  ['common.confirmDesigns', 'دکمه تأیید طرح‌ها'],
  ['common.build', 'دکمه بساز']
]);
block('common', 'میز کار', [
  ['common.seeAll', 'لینک دیدن همه']
]);
block('common', 'پروژه', [
  ['common.continue', 'دکمه ادامه'],
  ['common.seeFull', 'لینک دیدن کامل'],
  ['common.model', 'عنوان مدل']
]);
block('common', 'اصلاح طرح', [
  ['common.download', 'دکمه دانلود'],
  ['common.share', 'دکمه اشتراک‌گذاری'],
  ['common.moreSamples', 'دکمه نمونه‌های دیگر'],
  ['common.copied', 'پیام کپی لینک'],
  ['common.selected', 'برچسب انتخاب‌شده']
]);
block('common', 'دوره', [
  ['common.play', 'دکمه پخش'],
  ['common.sound', 'دکمه صدا'],
  ['common.full', 'دکمه تمام‌صفحه'],
  ['common.sessionTitle', 'عنوان جلسه'],
  ['common.sessionN', 'الگوی شمارهٔ جلسه'],
  ['common.prevSession', 'جلسهٔ قبل'],
  ['common.nextSession', 'جلسهٔ بعد']
]);
block('common', 'خروج', [
  ['common.logoutAsk', 'سؤال خروج'],
  ['common.logout', 'دکمه خروج'],
  ['common.cancel', 'دکمه انصراف']
]);
block('common', 'خطا', [
  ['common.serverError', 'خطای سرور'],
  ['error.csrf', 'نشست منقضی']
]);
block('common', 'ماه تولد', MONTHS.map((name, i) => ['month.' + (i + 1), name]));

function place(key) {
  if (byKey[key]) return byKey[key];
  const page = pageByGroup(String(key || '').split('.')[0]);
  return {
    pageId: page.id,
    pageLabel: page.label,
    location: page.label + SEP + String(key || ''),
    sort: ordered.length + 1000
  };
}

function pairKey(key) {
  const match = /^(.*\.\d+)\.(q|a)$/.exec(String(key || ''));
  if (!match) return '';
  return match[1] + '.' + (match[2] === 'q' ? 'a' : 'q');
}

function orderByPlace(builder) {
  const sql = 'CASE "key" ' + ordered.map(() => 'WHEN ? THEN ?').join(' ') + ' ELSE ? END';
  const bindings = [];
  ordered.forEach((key, index) => { bindings.push(key, index); });
  bindings.push(ordered.length + 1000);
  return builder.orderByRaw(sql, bindings).orderByRaw(
    "CASE WHEN \"key\" LIKE '%.a' THEN substr(\"key\", 1, length(\"key\") - 1) || 'z' ELSE \"key\" END"
  );
}

module.exports = { pages: PAGES, place, pairKey, orderByPlace, ordered };
