const bcrypt = require('bcrypt');
const texts = require('./texts');
const content = require('./content');

async function countOf(db, table) {
  const row = await db(table).count({ c: '*' }).first();
  return Number(row && row.c) || 0;
}

async function seedTexts(db) {
  if (await countOf(db, 'texts')) return;
  await db('texts').insert(texts.list().map((row) => ({
    key: row.key,
    grp: row.group,
    label: row.label,
    value: row.value
  })));
}

async function seedPlans(db) {
  if (await countOf(db, 'plans')) return;
  await db('plans').insert(content.PLANS.map((plan, i) => ({
    code: plan.code,
    name: plan.name,
    price: plan.price,
    message_count: plan.messageCount,
    image_count: plan.imageCount,
    features_json: JSON.stringify(plan.features),
    featured: plan.featured,
    active: plan.active,
    sort: i + 1
  })));
}

async function seedCourses(db) {
  if (await countOf(db, 'courses')) return;
  for (let i = 0; i < content.COURSES.length; i++) {
    const course = content.COURSES[i];
    const inserted = await db('courses').insert({
      slug: course.slug,
      title: course.title,
      description: '',
      sort: i + 1,
      active: true
    }).returning('id');
    const courseId = Array.isArray(inserted) ? (inserted[0].id || inserted[0]) : inserted;
    await db('lessons').insert(course.lessons.map((lesson) => ({
      course_id: courseId,
      n: lesson.n,
      title: lesson.title,
      description: lesson.description,
      duration: lesson.duration,
      video_url: lesson.videoUrl,
      access: lesson.access,
      sort: lesson.n
    })));
  }
}

async function seedQuestions(db) {
  if (await countOf(db, 'questions')) return;
  let sort = 0;
  for (const question of content.QUESTIONS) {
    sort += 1;
    const inserted = await db('questions').insert({
      flow: question.flow,
      title: question.title,
      sort,
      break_after: question.breakAfter || 0,
      confirm: !!question.confirm,
      active: true
    }).returning('id');
    const questionId = Array.isArray(inserted) ? (inserted[0].id || inserted[0]) : inserted;
    const options = [];
    question.groups.forEach((group, groupIndex) => {
      group.chips.forEach((chip, chipIndex) => {
        options.push({
          question_id: questionId,
          group_label: group.label || '',
          group_role: group.role || '',
          group_sort: groupIndex,
          text: chip.text,
          suggest: !!chip.suggest,
          sort: chipIndex
        });
      });
    });
    if (options.length) await db('question_options').insert(options);
  }
}

async function seedSettings(db) {
  const row = await db('settings').where({ key: 'discount_code' }).first();
  if (row) return;
  await db('settings').insert([
    { key: 'discount_code', value: 'GDL20' },
    { key: 'discount_percent', value: '20' }
  ]);
}

function designs(n) {
  return Array.from({ length: n }, (_, i) => ({ number: i + 1, selected: i === 0 }));
}

async function seedSamples(db) {
  if (process.env.NODE_ENV === 'production') return;
  if (await countOf(db, 'users')) return;
  const hash = await bcrypt.hash('12345678', 10);
  const past = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await db('users').insert([
    {
      id: 'yasin', phone: '09123456789', first_name: 'یاسین', last_name: 'شریفی',
      birth_d: 15, birth_m: 7, birth_y: 1372, password_hash: hash, theme: 'light',
      notify_sub_end: true, notify_new_session: true, gift_total: 50, gift_used: 18,
      message_left: 32, image_left: 0, paid_ok: false, blocked: false, created_at: past
    },
    {
      id: 'fresh', phone: '09120000000', first_name: 'سارا', last_name: 'نمونه',
      birth_d: 1, birth_m: 1, birth_y: 1380, password_hash: hash, theme: 'light',
      notify_sub_end: true, notify_new_session: true, gift_total: 50, gift_used: 0,
      message_left: 50, image_left: 0, paid_ok: false, blocked: false, created_at: recent
    }
  ]);

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
  const messages = [];
  let position = 0;
  ideaRows.forEach((row, i) => {
    position += 1;
    chats.push({
      id: 'idea-' + (ideaRows.length - i), user_id: 'yasin', kind: 'idea', title: row[0], when_label: row[1],
      project: row[2], dash: false, list: true, card: 1, answers_json: '{}', done: false, show_card: false,
      from_refine: false, position
    });
  });
  [
    ['گردنبند برگ زیتون', '۲ ساعت پیش'],
    ['انگشتر نشان مینیمال', 'دیروز'],
    ['پلاک حروف درهم', '۴ روز پیش']
  ].forEach((row, i) => {
    position += 1;
    const id = 'idea-dash-' + (i + 1);
    chats.push({
      id, user_id: 'yasin', kind: 'idea', title: row[0], when_label: row[1],
      project: false, dash: true, list: false, card: 2, answers_json: JSON.stringify({ 1: row[0] }),
      done: false, show_card: false, from_refine: false, position
    });
    messages.push({ chat_id: id, role: 'user', type: 'text', text: row[0], sort: 0 });
  });
  assistRows.forEach((row, i) => {
    position += 1;
    const id = 'asst-' + (assistRows.length - i);
    chats.push({
      id, user_id: 'yasin', kind: 'assistant', title: row[0], when_label: row[1],
      project: row[2], dash: false, list: true, card: 0, answers_json: '{}',
      done: false, show_card: false, from_refine: false, position
    });
    messages.push({ chat_id: id, role: 'user', type: 'text', text: row[0], sort: 0 });
  });
  [
    ['چطور انگشتر رو در ماتریکس متقارن کنم؟', '۲ ساعت پیش'],
    ['برای نگین اشکی چند چنگ مناسبه؟', 'دیروز'],
    ['فایل STL رو با چه دقتی خروجی بگیرم؟', '۳ روز پیش']
  ].forEach((row, i) => {
    position += 1;
    const id = 'asst-dash-' + (i + 1);
    chats.push({
      id, user_id: 'yasin', kind: 'assistant', title: row[0], when_label: row[1],
      project: false, dash: true, list: false, card: 0, answers_json: '{}',
      done: false, show_card: false, from_refine: false, position
    });
    messages.push({ chat_id: id, role: 'user', type: 'text', text: row[0], sort: 0 });
  });

  const projects = [
    { slug: 'olive-ring', title: 'انگشتر زیتون', when: 'امروز', stage: 'refine', shape: 'ring', summary: 'ایدهٔ اولیه: انگشتر با برگ زیتون.', designs: designs(4), blurb: ['چهار طرح اتودی ساخته شد.', 'انتخاب روی مدل ۱ است.'] },
    { slug: 'sara-pendant', title: 'آویز سارا', when: 'دیروز', stage: 'idea', shape: 'square', summary: 'ایدهٔ اولیه: آویز ساده.', designs: [], blurb: [] },
    { slug: 'drop-earring', title: 'گوشواره قطره', when: '۳ روز پیش', stage: 'assistant', shape: 'drop', summary: 'ایدهٔ اولیه: گوشوارهٔ قطره‌ای.', designs: designs(4), blurb: ['گفت‌وگوی طراحیار دربارهٔ تناسب قطره شروع شده.', ''] },
    { slug: 'eslimi-ring', title: 'انگشتر اسلیمی با نگین برلیان', when: 'امروز', stage: 'image', shape: 'ring', summary: 'ایدهٔ اولیه: انگشتر با نقوش اسلیمی و یک نگین برلیان در مرکز.', designs: designs(4), blurb: ['چهار طرح اتودی برای این انگشتر ساخته شد.', 'انتخاب روی مدل ۱ است و جزئیات نقش و تناسب نگین در حال اصلاح است.'], listStage: 'image' },
    { slug: 'necklace-rosegold', title: 'گردنبند مینیمال رزگلد', when: 'دیروز', stage: 'image', shape: 'pendant', summary: 'ایدهٔ اولیه: گردنبند مینیمال رزگلد.', designs: designs(2), blurb: ['تصویر محصول ساخته شد.', ''] },
    { slug: 'bracelet-twotone', title: 'دستبند زنجیری دورنگ', when: '۳ روز پیش', stage: 'assistant', shape: 'bar', summary: 'ایدهٔ اولیه: دستبند زنجیری دورنگ.', designs: designs(4), blurb: ['طراحیار در حال تکمیل زنجیر است.', ''] },
    { slug: 'earring-emerald', title: 'گوشوارهٔ آویز با نگین زمرد', when: '۵ روز پیش', stage: 'assistant', shape: 'drop', summary: 'ایدهٔ اولیه: گوشواره با زمرد.', designs: designs(4), blurb: ['سؤال دربارهٔ نشستن زمرد باز است.', ''] },
    { slug: 'bangle-gold', title: 'النگوی طلای زرد', when: '۱ هفته پیش', stage: 'refine', shape: 'ring', summary: 'ایدهٔ اولیه: النگوی پهن طلای زرد.', designs: designs(4), blurb: ['طرح‌ها برای انتخاب آماده‌اند.', ''] },
    { slug: 'pearl-set', title: 'نیم‌ست مروارید', when: '۲ هفته پیش', stage: 'idea', shape: 'square', summary: 'ایدهٔ اولیه: نیم‌ست مروارید.', designs: [], blurb: [] }
  ];
  await db('projects').insert(projects.map((p, i) => ({
    slug: p.slug, user_id: 'yasin', title: p.title, when_label: p.when, stage: p.stage,
    list_stage: p.listStage || null, shape: p.shape, summary: p.summary,
    designs_json: JSON.stringify(p.designs), blurb_json: JSON.stringify(p.blurb),
    thread_json: '[]', home: false, list: true, position: i + 1
  })));

  const shots = [1, 2, 3, 4, 5, 6].map((n) => ({
    id: 'shot-' + n,
    user_id: 'yasin',
    project: n === 1 || n === 3,
    chat_id: 'image-' + n,
    position: n
  }));
  shots.forEach((shot) => {
    position += 1;
    chats.push({
      id: shot.chat_id, user_id: 'yasin', kind: 'image', title: 'تصویر ' + shot.id, when_label: 'امروز',
      project: shot.project, dash: false, list: false, card: 1, answers_json: '{}',
      done: false, show_card: false, from_refine: false, position
    });
    messages.push({ chat_id: shot.chat_id, role: 'assistant', type: 'text', text: 'طرحت رسید! بگو تصویرش رو چطور بسازیم.', sort: 0 });
  });
  await db('chats').insert(chats);
  if (messages.length) await db('messages').insert(messages);
  await db('images').insert(shots);

  const courses = await db('courses').select('id', 'slug');
  const bySlug = Object.fromEntries(courses.map((c) => [c.slug, c.id]));
  const watched = { 'jewelry-skills': [1, 2, 3, 4], 'matrix-intro': [1] };
  for (const slug of Object.keys(watched)) {
    await db('enrollments').insert({ user_id: 'yasin', course_id: bySlug[slug] });
    const lessons = await db('lessons').where({ course_id: bySlug[slug] }).select('id', 'n');
    const rows = lessons.filter((lesson) => watched[slug].includes(lesson.n)).map((lesson) => ({
      user_id: 'yasin', lesson_id: lesson.id
    }));
    if (rows.length) await db('lesson_progress').insert(rows);
  }

  await db('activity').insert([
    { user_id: 'yasin', action: 'signup', summary: 'یاسین شریفی ثبت‌نام کرد.', created_at: past },
    { user_id: 'yasin', action: 'login', summary: 'یاسین شریفی وارد شد.', created_at: recent },
    { user_id: 'fresh', action: 'signup', summary: 'سارا نمونه ثبت‌نام کرد.', created_at: recent }
  ]);
  await db('counters').insert({ name: 'seq', value: 100 });
}

async function run(db) {
  await seedTexts(db);
  await seedPlans(db);
  await seedCourses(db);
  await seedQuestions(db);
  await seedSettings(db);
  await seedSamples(db);
  const counter = await db('counters').where({ name: 'seq' }).first();
  if (!counter) await db('counters').insert({ name: 'seq', value: 100 });
}

module.exports = { run };
