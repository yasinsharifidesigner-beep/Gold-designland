const { normalizePhone } = require('./lib');

const IDEA_CARDS = [
  { title: 'چه زیوری را می‌خواهی با هم طراحی کنیم؟', chips: ['انگشتر', 'حلقهٔ ازدواج', 'گردنبند', 'آویز', 'دستبند', 'النگو', 'گوشواره', 'سرویس کامل', 'نیم‌ست', 'پابند', 'گل‌سینه', 'چارم', 'بازوبند'] },
  { title: 'این زیور قراره برای چه کسی طراحی بشه؟', chips: ['زنانه', 'مردانه', 'بچگانه', 'ست زوج'] },
  { title: 'این زیور از چه فلزی ساخته شود؟', chips: ['طلای ۱۸ عیار', 'طلای ۲۴ عیار', 'نقرهٔ ۹۲۵', 'پلاتین', 'استیل'] },
  { title: 'فلز کار چه رنگی داشته باشد؟', chips: ['طلای زرد', 'رزگلد', 'طلای سفید', 'دورنگ', 'سه‌رنگ'] },
  { title: 'طرح از کدام سبک جواهرسازی الهام بگیرد؟', chips: ['کلاسیک', 'مدرن', 'مینیمال', 'وینتیج', 'باروک', 'آرت نوو', 'آرت دکو', 'جواهری معاصر', 'سنتی ایرانی', 'اسلیمی و ختایی', 'الهام از معماری ایرانی', 'ارگانیک و طبیعت‌گرا', 'هندسی', 'بوهو', 'لوکس مجلسی'] },
  { title: 'نگین این زیور چه باشد؟', chips: ['بدون سنگ', 'برلیان', 'الماس تراش‌خورده', 'زیرکن (اتمی)', 'زمرد', 'یاقوت', 'فیروزهٔ نیشابوری', 'عقیق', 'مروارید', 'سنگ‌های رنگی ترکیبی'] },
  { title: 'سنگ به چه شیوه‌ای روی کار بنشیند؟', chips: ['چنگی', 'کاسه‌ای (بزل)', 'ریلی', 'کانال', 'پاوه (میکروست)', 'دورنگین (هالو)', 'تنشن', 'دانه‌نشان'] },
  { title: 'دوست داری کار چه وزن و حجمی داشته باشد؟', chips: ['ظریف و سبک برای هر روز', 'متوسط و متعادل', 'پرحجم ولی سبک (توخالی)', 'سنگین و چشم‌گیر'] },
  { title: 'پرداخت سطح فلز چگونه باشد؟', chips: ['براق آینه‌ای', 'مات', 'چکشی', 'ترکیب براق و مات'] },
  { title: 'سنگ چه نوع تراش و شکلی داشته باشد؟', chips: ['برش گرد (برلیانت)', 'پرنس', 'زمردی', 'مارکیز', 'گلابی', 'قلبی', 'بیضی', 'کابوشن', 'تراش‌های فانتزی'] },
  {
    title: 'ایده‌ات را به چه شکلی ببینی و چند نمونه؟',
    groups: [
      { label: 'سبک خروجی', chips: ['اسکیچ دستی', 'اسکیچ رنگی', 'رندر واقع‌گرایانه', 'نمای فنی از چند زاویه', 'عکس روی دست یا مدل', 'خودت پیشنهاد بده'], breakAfter: 3 },
      { label: 'تعداد نمونه', chips: ['۱', '۲', '۳', '۴'] }
    ],
    confirm: true
  }
];

const IMAGE_CARDS = [
  { title: 'تصویر چه شکلی باشد؟', chips: ['عکس محصول', 'روی دست', 'روی مدل', 'خودت پیشنهاد بده'] },
  { title: 'پس‌زمینه چه باشد؟', chips: ['سفید ساده', 'مخمل', 'فضای لوکس', 'خودت پیشنهاد بده'] },
  { title: 'چند تصویر ساخته شود؟', chips: ['۱', '۲', '۳', '۴', 'خودت پیشنهاد بده'] }
];

const ASSIST_CARD = {
  title: 'با این طرح چه کار کنیم؟',
  chips: ['مشکلی در بخشی از طرح دارم', 'سؤالی دارم', 'بیا با هم فکر کنیم', 'خودت پیشنهاد بده']
};

const PLANS = [
  { code: 'basic', name: 'پایه', price: 199000, featured: false, features: ['۱۰۰ پیام طراحیار در ماه', '۳۰ ساخت تصویر در ماه', 'دسترسی به دوره‌های منتخب', 'پشتیبانی عادی'] },
  { code: 'pro', name: 'حرفه‌ای', price: 499000, featured: true, features: ['۵۰۰ پیام طراحیار در ماه', '۲۰۰ ساخت تصویر در ماه', 'دسترسی کامل به دوره‌ها', 'پشتیبانی اولویت‌دار'] },
  { code: 'premium', name: 'ویژه', price: 899000, featured: false, features: ['پیام طراحیار نامحدود', 'ساخت تصویر نامحدود', 'دسترسی کامل به دوره‌ها', 'پشتیبانی اختصاصی'] }
];

const SKILLS_SESSIONS = [
  ['خوش‌آمدگویی و معرفی دوره', ''],
  ['مهارت‌های پایه‌ای طراح جواهر', ''],
  ['تناسب، فرم و مقیاس در طراحی', ''],
  ['شناخت فلزات و انواع زیور', ''],
  ['اتود دستی؛ از ایده تا طرح اولیه', 'در این جلسه یاد می‌گیری ایده را روی کاغذ بیاوری و با اتودهای سریع، فرم اولیهٔ کار را شکل بدهی.'],
  ['حجم و نمایش سه‌بعدی طرح', ''],
  ['جای‌گذاری نگین و تعادل بصری', ''],
  ['نقش، بافت و پرداخت سطح', ''],
  ['آماده‌سازی طرح برای ساخت', ''],
  ['جمع‌بندی و مسیر ادامه', '']
];

function designs(n) {
  return Array.from({ length: n }, (_, i) => ({
    number: i + 1,
    selected: i === 0
  }));
}

function seed() {
  const yasin = {
    id: 'yasin',
    phone: '09123456789',
    firstName: 'یاسین',
    lastName: 'شریفی',
    birth: { d: 15, m: 7, y: 1372 },
    password: '12345678',
    theme: 'light',
    notifySubEnd: true,
    notifyNewSession: true,
    giftTotal: 50,
    giftUsed: 18,
    subscription: null,
    paidOk: false
  };
  const fresh = {
    id: 'fresh',
    phone: '09120000000',
    firstName: 'سارا',
    lastName: 'نمونه',
    birth: { d: 1, m: 1, y: 1380 },
    password: '12345678',
    theme: 'light',
    notifySubEnd: true,
    notifyNewSession: true,
    giftTotal: 50,
    giftUsed: 0,
    subscription: null,
    paidOk: false
  };

  const ideaRows = [
    ['پابند ظریف با نقش هندسی', '۲ ماه پیش', false],
    ['گل‌سینه با مروارید درخشان', '۱ ماه پیش', false],
    ['سرویس کامل کلاسیک با برلیان', '۳ هفته پیش', false],
    ['آویز طلا با فیروزهٔ نیشابوری', '۲ هفته پیش', false],
    ['النگوی پهن با طرح ختایی', '۱۰ روز پیش', false],
    ['حلقهٔ ازدواج با نقش اسلیمی', '۱ هفته پیش', false],
    ['گوشوارهٔ آویز با سنگ زمرد', '۵ روز پیش', false],
    ['دستبند زنجیری با طرح سنتی', '۳ روز پیش', true],
    ['گردنبند مینیمال برای هدیهٔ سالگرد', 'دیروز', false],
    ['انگشتر نگین‌دار با الهام از گل شاه‌پسند', 'امروز', true]
  ];
  const assistRows = [
    ['انگشتر سه‌رنگ با طرح هندسی', '۲ ماه پیش', false],
    ['گردنبند اسلیمی با زمرد', '۱ ماه پیش', false],
    ['گوشوارهٔ میخی مینیمال', '۳ هفته پیش', false],
    ['دستبند ظریف با الماس تراش‌خورده', '۲ هفته پیش', false],
    ['انگشتر مردانه با نگین عقیق', '۱۰ روز پیش', false],
    ['حلقهٔ ست با برش پرنس', '۱ هفته پیش', false],
    ['گوشوارهٔ آویز با نگین زمرد', '۵ روز پیش', false],
    ['دستبند زنجیری دورنگ', '۳ روز پیش', true],
    ['گردنبند مینیمال رزگلد', 'دیروز', false],
    ['انگشتر اسلیمی با نگین برلیان، مدل ۱', 'امروز', true]
  ];

  const chats = [];
  ideaRows.forEach((row, i) => {
    chats.push({
      id: 'idea-' + (ideaRows.length - i),
      userId: 'yasin', kind: 'idea', title: row[0], when: row[1], project: row[2],
      dash: false, messages: [], card: 1, answers: {}, done: false, list: true
    });
  });
  [
    ['گردنبند برگ زیتون', '۲ ساعت پیش'],
    ['انگشتر نشان مینیمال', 'دیروز'],
    ['پلاک حروف درهم', '۴ روز پیش']
  ].forEach((row, i) => {
    chats.push({
      id: 'idea-dash-' + (i + 1),
      userId: 'yasin', kind: 'idea', title: row[0], when: row[1], project: false,
      dash: true, messages: [{ role: 'user', type: 'text', text: row[0] }], card: 2, answers: { 1: row[0] }, done: false, list: false
    });
  });
  assistRows.forEach((row, i) => {
    chats.push({
      id: 'asst-' + (assistRows.length - i),
      userId: 'yasin', kind: 'assistant', title: row[0], when: row[1], project: row[2],
      dash: false, messages: [{ role: 'user', type: 'text', text: row[0] }], card: 0, answers: {}, done: false, list: true
    });
  });
  [
    ['چطور انگشتر رو در ماتریکس متقارن کنم؟', '۲ ساعت پیش'],
    ['برای نگین اشکی چند چنگ مناسبه؟', 'دیروز'],
    ['فایل STL رو با چه دقتی خروجی بگیرم؟', '۳ روز پیش']
  ].forEach((row, i) => {
    chats.push({
      id: 'asst-dash-' + (i + 1),
      userId: 'yasin', kind: 'assistant', title: row[0], when: row[1], project: false,
      dash: true, messages: [{ role: 'user', type: 'text', text: row[0] }], card: 0, answers: {}, done: false, list: false
    });
  });

  const projects = [
    { slug: 'olive-ring', userId: 'yasin', title: 'انگشتر زیتون', when: 'امروز', stage: 'refine', shape: 'ring', summary: 'ایدهٔ اولیه: انگشتر با برگ زیتون.', designs: designs(4), blurb: ['چهار طرح اتودی ساخته شد.', 'انتخاب روی مدل ۱ است.'] },
    { slug: 'sara-pendant', userId: 'yasin', title: 'آویز سارا', when: 'دیروز', stage: 'idea', shape: 'square', summary: 'ایدهٔ اولیه: آویز ساده.', designs: [], blurb: [] },
    { slug: 'drop-earring', userId: 'yasin', title: 'گوشواره قطره', when: '۳ روز پیش', stage: 'assistant', shape: 'drop', summary: 'ایدهٔ اولیه: گوشوارهٔ قطره‌ای.', designs: designs(4), blurb: ['گفت‌وگوی طراحیار دربارهٔ تناسب قطره شروع شده.', ''] },
    { slug: 'eslimi-ring', userId: 'yasin', title: 'انگشتر اسلیمی با نگین برلیان', when: 'امروز', stage: 'image', shape: 'ring', summary: 'ایدهٔ اولیه: انگشتر با نقوش اسلیمی و یک نگین برلیان در مرکز.', designs: designs(4), blurb: ['چهار طرح اتودی برای این انگشتر ساخته شد.', 'انتخاب روی مدل ۱ است و جزئیات نقش و تناسب نگین در حال اصلاح است.'], listStage: 'image' },
    { slug: 'necklace-rosegold', userId: 'yasin', title: 'گردنبند مینیمال رزگلد', when: 'دیروز', stage: 'image', shape: 'pendant', summary: 'ایدهٔ اولیه: گردنبند مینیمال رزگلد.', designs: designs(2), blurb: ['تصویر محصول ساخته شد.', ''] },
    { slug: 'bracelet-twotone', userId: 'yasin', title: 'دستبند زنجیری دورنگ', when: '۳ روز پیش', stage: 'assistant', shape: 'bar', summary: 'ایدهٔ اولیه: دستبند زنجیری دورنگ.', designs: designs(4), blurb: ['طراحیار در حال تکمیل زنجیر است.', ''] },
    { slug: 'earring-emerald', userId: 'yasin', title: 'گوشوارهٔ آویز با نگین زمرد', when: '۵ روز پیش', stage: 'assistant', shape: 'drop', summary: 'ایدهٔ اولیه: گوشواره با زمرد.', designs: designs(4), blurb: ['سؤال دربارهٔ نشستن زمرد باز است.', ''] },
    { slug: 'bangle-gold', userId: 'yasin', title: 'النگوی طلای زرد', when: '۱ هفته پیش', stage: 'refine', shape: 'ring', summary: 'ایدهٔ اولیه: النگوی پهن طلای زرد.', designs: designs(4), blurb: ['طرح‌ها برای انتخاب آماده‌اند.', ''] },
    { slug: 'pearl-set', userId: 'yasin', title: 'نیم‌ست مروارید', when: '۲ هفته پیش', stage: 'idea', shape: 'square', summary: 'ایدهٔ اولیه: نیم‌ست مروارید.', designs: [], blurb: [] }
  ];

  const shots = [1, 2, 3, 4, 5, 6].map((n) => ({
    id: 'shot-' + n,
    userId: 'yasin',
    project: n === 1 || n === 3,
    chatId: 'image-' + n
  }));
  shots.forEach((s) => {
    chats.push({
      id: s.chatId, userId: 'yasin', kind: 'image', title: 'تصویر ' + s.id, when: 'امروز',
      project: s.project, dash: false, messages: [
        { role: 'assistant', type: 'text', text: 'طرحت رسید! بگو تصویرش رو چطور بسازیم.' }
      ],
      card: 1, answers: {}, done: false, list: false, fromRefine: false
    });
  });

  const courses = [
    {
      slug: 'jewelry-skills', title: 'معرفی مهارت طراحی طلا و جواهرات',
      sessions: SKILLS_SESSIONS.map((s, i) => ({ n: i + 1, title: s[0], description: s[1], duration: '۱۶:۴۵' })),
      watched: [1, 2, 3, 4]
    },
    {
      slug: 'matrix-intro', title: 'آشنایی اولیه با نرم‌افزار ماتریکس',
      sessions: [1, 2, 3, 4, 5].map((n) => ({ n, title: 'جلسهٔ ' + ['۱', '۲', '۳', '۴', '۵'][n - 1], description: '', duration: '۱۲:۰۰' })),
      watched: [1]
    }
  ];

  return {
    users: [yasin, fresh],
    chats,
    projects,
    shots,
    courses,
    plans: PLANS,
    discount: { code: 'GDL20', percent: 20 },
    seq: 100
  };
}

const db = seed();
const DEMO_CODE = '42971';

function userById(id) { return db.users.find((u) => u.id === id); }
function userByPhone(phone) { return db.users.find((u) => u.phone === normalizePhone(phone)); }

function hasWork(user) {
  if (!user) return false;
  return db.projects.some((p) => p.userId === user.id) || db.chats.some((c) => c.userId === user.id) || db.shots.some((s) => s.userId === user.id);
}

function giftLeft(user) {
  return Math.max(0, user.giftTotal - user.giftUsed);
}

const STAGES = ['idea', 'refine', 'assistant', 'image'];
function stageIndex(stage) { return STAGES.indexOf(stage); }

function createUser(fields) {
  const user = {
    id: 'u' + (++db.seq),
    phone: normalizePhone(fields.phone),
    firstName: fields.firstName,
    lastName: fields.lastName,
    birth: fields.birth,
    password: fields.password,
    theme: 'light',
    notifySubEnd: true,
    notifyNewSession: true,
    giftTotal: 50,
    giftUsed: 0,
    subscription: null,
    paidOk: false
  };
  db.users.push(user);
  db.courses.forEach(() => {});
  if (!db.enroll) db.enroll = {};
  return user;
}

function enrollments(userId) {
  if (!db.enroll) db.enroll = {};
  if (!db.enroll[userId]) {
    db.enroll[userId] = userId === 'yasin'
      ? { 'jewelry-skills': [1, 2, 3, 4], 'matrix-intro': [1] }
      : {};
  }
  return db.enroll[userId];
}

module.exports = {
  db, DEMO_CODE, IDEA_CARDS, IMAGE_CARDS, ASSIST_CARD, STAGES,
  userById, userByPhone, hasWork, giftLeft, stageIndex, createUser, enrollments, designs
};
