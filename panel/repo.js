const bcrypt = require('bcrypt');
const { getKnex } = require('./db');
const lib = require('./lib');
const texts = require('./texts');

const STAGES = ['idea', 'refine', 'assistant', 'image'];

function db() { return getKnex(); }

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (err) { return fallback; }
}

function bool(value) { return value === true || value === 1 || value === '1'; }

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    phone: row.phone,
    firstName: row.first_name,
    lastName: row.last_name,
    birth: { d: row.birth_d, m: row.birth_m, y: row.birth_y },
    passwordHash: row.password_hash,
    theme: row.theme || 'light',
    notifySubEnd: bool(row.notify_sub_end),
    notifyNewSession: bool(row.notify_new_session),
    giftTotal: row.gift_total,
    giftUsed: row.gift_used,
    messageLeft: row.message_left,
    imageLeft: row.image_left,
    paidOk: bool(row.paid_ok),
    blocked: bool(row.blocked),
    avatar: row.avatar || '',
    subscription: row.sub_name ? {
      name: row.sub_name,
      code: row.sub_code || '',
      start: row.sub_start || '',
      end: row.sub_end || '',
      pct: row.sub_pct || '',
      offset: row.sub_offset == null ? 0 : Number(row.sub_offset)
    } : null,
    createdAt: row.created_at
  };
}

function mapProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    userId: row.user_id,
    title: row.title,
    when: row.when_label,
    stage: row.stage,
    listStage: row.list_stage || '',
    shape: row.shape,
    summary: row.summary,
    designs: parseJson(row.designs_json, []),
    blurb: parseJson(row.blurb_json, []),
    thread: parseJson(row.thread_json, []),
    home: bool(row.home),
    list: bool(row.list),
    assistId: row.assist_chat_id || '',
    imageId: row.image_chat_id || '',
    position: row.position,
    createdAt: row.created_at
  };
}

function mapPlan(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    price: row.price,
    messageCount: row.message_count,
    imageCount: row.image_count,
    features: parseJson(row.features_json, []),
    featured: bool(row.featured),
    active: bool(row.active),
    sort: row.sort
  };
}

function mapChat(row, messages) {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    title: row.title,
    when: row.when_label,
    project: bool(row.project),
    dash: bool(row.dash),
    list: bool(row.list),
    card: row.card,
    answers: parseJson(row.answers_json, {}),
    done: bool(row.done),
    showCard: bool(row.show_card),
    fromRefine: bool(row.from_refine),
    position: row.position,
    createdAt: row.created_at,
    messages: (messages || []).map((m) => ({ id: m.id, role: m.role, type: m.type, text: m.text }))
  };
}

function giftLeft(user) {
  return Math.max(0, (user.giftTotal || 0) - (user.giftUsed || 0));
}

function stageIndex(stage) { return STAGES.indexOf(stage); }

function designs(n) {
  return Array.from({ length: n }, (_, i) => ({ number: i + 1, selected: i === 0 }));
}

async function nextSeq() {
  return db().transaction(async (trx) => {
    const row = await trx('counters').where({ name: 'seq' }).first();
    const value = (row ? Number(row.value) : 100) + 1;
    if (row) await trx('counters').where({ name: 'seq' }).update({ value });
    else await trx('counters').insert({ name: 'seq', value });
    return value;
  });
}

async function userById(id) {
  if (!id) return null;
  return mapUser(await db()('users').where({ id }).first());
}

async function userByPhone(phone) {
  return mapUser(await db()('users').where({ phone }).first());
}

async function log(userId, action, summary) {
  await db()('activity').insert({ user_id: userId || null, action, summary: summary || '' });
}

async function createUser(fields) {
  const id = 'u' + await nextSeq();
  const hash = await bcrypt.hash(lib.normalizePassword(fields.password), 10);
  await db()('users').insert({
    id,
    phone: fields.phone,
    first_name: fields.firstName,
    last_name: fields.lastName,
    birth_d: fields.birth.d,
    birth_m: fields.birth.m,
    birth_y: fields.birth.y,
    password_hash: hash,
    theme: 'light',
    notify_sub_end: true,
    notify_new_session: true,
    gift_total: 50,
    gift_used: 0,
    message_left: 50,
    image_left: 0,
    paid_ok: false,
    blocked: false
  });
  const user = await userById(id);
  await log(id, 'signup', user.firstName + ' ' + user.lastName + ' ثبت‌نام کرد.');
  return user;
}

async function updateUser(id, patch) {
  const row = {};
  const map = {
    phone: 'phone', firstName: 'first_name', lastName: 'last_name', theme: 'theme',
    notifySubEnd: 'notify_sub_end', notifyNewSession: 'notify_new_session',
    giftTotal: 'gift_total', giftUsed: 'gift_used', messageLeft: 'message_left', imageLeft: 'image_left',
    paidOk: 'paid_ok', blocked: 'blocked', avatar: 'avatar', passwordHash: 'password_hash'
  };
  Object.keys(map).forEach((key) => { if (patch[key] !== undefined) row[map[key]] = patch[key]; });
  if (patch.birth) {
    row.birth_d = patch.birth.d;
    row.birth_m = patch.birth.m;
    row.birth_y = patch.birth.y;
  }
  if (patch.subscription === null) {
    row.sub_name = null;
    row.sub_code = null;
    row.sub_start = null;
    row.sub_end = null;
    row.sub_pct = null;
    row.sub_offset = null;
  } else if (patch.subscription) {
    row.sub_name = patch.subscription.name || '';
    row.sub_code = patch.subscription.code || '';
    row.sub_start = patch.subscription.start || '';
    row.sub_end = patch.subscription.end || '';
    row.sub_pct = patch.subscription.pct || '';
    row.sub_offset = patch.subscription.offset == null ? 0 : patch.subscription.offset;
  }
  if (Object.keys(row).length) await db()('users').where({ id }).update(row);
  return userById(id);
}

async function setPassword(id, plain) {
  const hash = await bcrypt.hash(lib.normalizePassword(plain), 10);
  await updateUser(id, { passwordHash: hash });
}

async function checkPassword(user, plain) {
  if (!user || !user.passwordHash) return false;
  const raw = String(plain == null ? '' : plain);
  const normalized = lib.normalizePassword(raw);
  if (await bcrypt.compare(normalized, user.passwordHash)) return true;
  if (normalized !== raw) return bcrypt.compare(raw, user.passwordHash);
  return false;
}

async function hasWork(userId) {
  const [project, chat, image] = await Promise.all([
    db()('projects').where({ user_id: userId }).first(),
    db()('chats').where({ user_id: userId }).first(),
    db()('images').where({ user_id: userId }).first()
  ]);
  return !!(project || chat || image);
}

async function projectsOf(userId, filter) {
  let q = db()('projects').where({ user_id: userId }).orderBy('position', 'asc');
  if (filter && filter.home) q = q.where({ home: true });
  const rows = await q;
  return rows.map(mapProject).filter((p) => !filter || filter.list === undefined || (filter.list ? p.list : true));
}

async function projectBySlug(slug, userId) {
  const q = db()('projects').where({ slug });
  if (userId) q.where({ user_id: userId });
  return mapProject(await q.first());
}

function projectRow(project) {
  return {
    slug: project.slug,
    user_id: project.userId,
    title: project.title || '',
    when_label: project.when || '',
    stage: project.stage || 'idea',
    list_stage: project.listStage || null,
    shape: project.shape || 'ring',
    summary: project.summary || '',
    designs_json: JSON.stringify(project.designs || []),
    blurb_json: JSON.stringify(project.blurb || []),
    thread_json: JSON.stringify(project.thread || []),
    home: !!project.home,
    list: project.list !== false,
    assist_chat_id: project.assistId || null,
    image_chat_id: project.imageId || null,
    position: project.position || 0
  };
}

async function saveProject(project) {
  const existing = await db()('projects').where({ slug: project.slug }).first();
  const row = projectRow(project);
  if (existing) {
    delete row.slug;
    await db()('projects').where({ slug: project.slug }).update(row);
  } else {
    const max = await db()('projects').max({ m: 'position' }).first();
    row.position = (Number(max && max.m) || 0) + 1;
    await db()('projects').insert(row);
  }
  return projectBySlug(project.slug);
}

async function deleteProject(slug) {
  await db()('projects').where({ slug }).delete();
}

async function attachMessages(rows) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const messages = await db()('messages').whereIn('chat_id', ids).orderBy('sort', 'asc').orderBy('id', 'asc');
  const grouped = {};
  messages.forEach((message) => {
    if (!grouped[message.chat_id]) grouped[message.chat_id] = [];
    grouped[message.chat_id].push(message);
  });
  return rows.map((row) => mapChat(row, grouped[row.id] || []));
}

async function chatsOf(userId, filter) {
  let q = db()('chats').where({ user_id: userId }).orderBy('position', 'asc');
  if (filter && filter.kind) q = q.where({ kind: filter.kind });
  if (filter && filter.dash) q = q.where({ dash: true });
  if (filter && filter.list) q = q.where({ list: true });
  if (filter && filter.project) q = q.where({ project: true });
  return attachMessages(await q);
}

async function chatById(id, userId) {
  const q = db()('chats').where({ id });
  if (userId) q.where({ user_id: userId });
  const row = await q.first();
  if (!row) return null;
  const messages = await db()('messages').where({ chat_id: id }).orderBy('sort', 'asc').orderBy('id', 'asc');
  return mapChat(row, messages);
}

async function createChat(fields) {
  const id = fields.id || (fields.kind + '-' + await nextSeq());
  const max = await db()('chats').max({ m: 'position' }).first();
  await db()('chats').insert({
    id,
    user_id: fields.userId,
    kind: fields.kind,
    title: fields.title || '',
    when_label: fields.when || 'امروز',
    project: !!fields.project,
    dash: !!fields.dash,
    list: !!fields.list,
    card: fields.card == null ? 1 : fields.card,
    answers_json: JSON.stringify(fields.answers || {}),
    done: !!fields.done,
    show_card: !!fields.showCard,
    from_refine: !!fields.fromRefine,
    position: (Number(max && max.m) || 0) + 1
  });
  if (fields.messages && fields.messages.length) {
    await db()('messages').insert(fields.messages.map((m, i) => ({
      chat_id: id, role: m.role, type: m.type || 'text', text: m.text || '', sort: i
    })));
  }
  return chatById(id);
}

async function saveChat(chat) {
  await db()('chats').where({ id: chat.id }).update({
    title: chat.title || '',
    when_label: chat.when || '',
    project: !!chat.project,
    dash: !!chat.dash,
    list: !!chat.list,
    card: chat.card || 0,
    answers_json: JSON.stringify(chat.answers || {}),
    done: !!chat.done,
    show_card: !!chat.showCard,
    from_refine: !!chat.fromRefine,
    kind: chat.kind
  });
  if (chat.messages) {
    await db()('messages').where({ chat_id: chat.id }).delete();
    if (chat.messages.length) {
      await db()('messages').insert(chat.messages.map((m, i) => ({
        chat_id: chat.id, role: m.role, type: m.type || 'text', text: m.text || '', sort: i
      })));
    }
  }
  return chatById(chat.id);
}

async function deleteChat(id) {
  await db()('messages').where({ chat_id: id }).delete();
  await db()('chats').where({ id }).delete();
}

async function shotsOf(userId, limit) {
  let q = db()('images').where({ user_id: userId }).orderBy('position', 'asc');
  if (limit) q = q.limit(limit);
  const rows = await q;
  return rows.map((row) => ({ id: row.id, userId: row.user_id, project: bool(row.project), chatId: row.chat_id, createdAt: row.created_at }));
}

async function addShot(shot) {
  const min = await db()('images').where({ user_id: shot.userId }).min({ m: 'position' }).first();
  const id = shot.id || ('shot-' + await nextSeq());
  await db()('images').insert({
    id,
    user_id: shot.userId,
    project: !!shot.project,
    chat_id: shot.chatId || null,
    position: min && min.m != null ? Number(min.m) - 1 : 1
  });
  return { id, userId: shot.userId, project: !!shot.project, chatId: shot.chatId };
}

let questionCache = null;

function clearQuestions() { questionCache = null; }

async function questionCards(flow) {
  if (!questionCache) questionCache = Object.create(null);
  if (questionCache[flow]) return questionCache[flow];
  const questions = await db()('questions').where({ flow }).orderBy('sort', 'asc').orderBy('id', 'asc');
  const active = questions.filter((q) => bool(q.active));
  const ids = active.map((q) => q.id);
  const options = ids.length
    ? await db()('question_options').whereIn('question_id', ids).orderBy('group_sort', 'asc').orderBy('sort', 'asc').orderBy('id', 'asc')
    : [];
  const cards = active.map((question) => {
    const mine = options.filter((opt) => Number(opt.question_id) === Number(question.id));
    const groups = [];
    mine.forEach((opt) => {
      const label = opt.group_label || '';
      let group = groups[groups.length - 1];
      if (!group || group.label !== label) {
        group = { label, role: opt.group_role || '', chips: [], suggest: [] };
        groups.push(group);
      }
      if (opt.group_role) group.role = opt.group_role;
      group.chips.push(opt.text);
      if (bool(opt.suggest)) group.suggest.push(opt.text);
    });
    const suggest = [];
    groups.forEach((group) => group.suggest.forEach((text) => { if (suggest.indexOf(text) === -1) suggest.push(text); }));
    const spec = {
      id: question.id,
      title: question.title,
      confirm: bool(question.confirm),
      suggest,
      styleGroup: '',
      countGroup: ''
    };
    groups.forEach((group) => {
      if (group.role === 'style') spec.styleGroup = group.label;
      if (group.role === 'count') spec.countGroup = group.label;
    });
    if (groups.length <= 1 && (!groups[0] || !groups[0].label)) {
      spec.chips = groups[0] ? groups[0].chips : [];
    } else {
      spec.groups = groups.map((group, index) => ({
        label: group.label,
        role: group.role,
        chips: group.chips,
        breakAfter: index === 0 ? (question.break_after || 0) : 0
      }));
    }
    return spec;
  });
  questionCache[flow] = cards;
  return cards;
}

async function allQuestions(flow) {
  let q = db()('questions').orderBy('sort', 'asc').orderBy('id', 'asc');
  if (flow) q = q.where({ flow });
  const questions = await q;
  const ids = questions.map((question) => question.id);
  const options = ids.length
    ? await db()('question_options').whereIn('question_id', ids).orderBy('group_sort', 'asc').orderBy('sort', 'asc').orderBy('id', 'asc')
    : [];
  return questions.map((question) => ({
    id: question.id,
    flow: question.flow,
    title: question.title,
    sort: question.sort,
    breakAfter: question.break_after || 0,
    confirm: bool(question.confirm),
    active: bool(question.active),
    options: options.filter((opt) => Number(opt.question_id) === Number(question.id)).map((opt) => ({
      id: opt.id,
      groupLabel: opt.group_label || '',
      groupRole: opt.group_role || '',
      groupSort: opt.group_sort || 0,
      text: opt.text,
      suggest: bool(opt.suggest),
      sort: opt.sort
    }))
  }));
}

async function questionById(id) {
  const all = await allQuestions();
  return all.find((question) => String(question.id) === String(id)) || null;
}

async function enrollments(userId) {
  const rows = await db()('enrollments').where({ user_id: userId });
  const courses = await db()('courses').select('id', 'slug');
  const byId = Object.fromEntries(courses.map((c) => [c.id, c.slug]));
  const progress = await db()('lesson_progress').where({ user_id: userId });
  const lessons = await db()('lessons').select('id', 'course_id', 'n');
  const lessonById = Object.fromEntries(lessons.map((lesson) => [lesson.id, lesson]));
  const out = {};
  rows.forEach((row) => {
    const slug = byId[row.course_id];
    if (!slug) return;
    out[slug] = [];
  });
  progress.forEach((row) => {
    const lesson = lessonById[row.lesson_id];
    if (!lesson) return;
    const slug = byId[lesson.course_id];
    if (!slug || !out[slug]) return;
    if (out[slug].indexOf(lesson.n) === -1) out[slug].push(lesson.n);
  });
  return out;
}

async function coursesWithLessons() {
  const courses = await db()('courses').orderBy('sort', 'asc').orderBy('id', 'asc');
  const lessons = await db()('lessons').orderBy('sort', 'asc').orderBy('n', 'asc');
  return courses.map((course) => ({
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description || '',
    sort: course.sort,
    active: bool(course.active),
    sessions: lessons.filter((lesson) => Number(lesson.course_id) === Number(course.id)).map((lesson) => ({
      id: lesson.id,
      n: lesson.n,
      title: lesson.title,
      description: lesson.description || '',
      duration: lesson.duration || '',
      videoUrl: lesson.video_url || '',
      access: lesson.access || 'gift',
      sort: lesson.sort
    }))
  }));
}

async function courseBySlug(slug) {
  const all = await coursesWithLessons();
  return all.find((course) => course.slug === slug) || null;
}

async function courseById(id) {
  const all = await coursesWithLessons();
  return all.find((course) => String(course.id) === String(id)) || null;
}

async function markSeen(userId, slug, n) {
  const course = await db()('courses').where({ slug }).first();
  if (!course) return;
  const enrolled = await db()('enrollments').where({ user_id: userId, course_id: course.id }).first();
  if (!enrolled) return;
  const lesson = await db()('lessons').where({ course_id: course.id, n }).first();
  if (!lesson) return;
  const exists = await db()('lesson_progress').where({ user_id: userId, lesson_id: lesson.id }).first();
  if (!exists) await db()('lesson_progress').insert({ user_id: userId, lesson_id: lesson.id });
}

async function setEnrollment(userId, courseId, on) {
  const exists = await db()('enrollments').where({ user_id: userId, course_id: courseId }).first();
  if (on && !exists) await db()('enrollments').insert({ user_id: userId, course_id: courseId });
  if (!on && exists) await db()('enrollments').where({ id: exists.id }).delete();
}

async function setProgress(userId, lessonId, on) {
  const exists = await db()('lesson_progress').where({ user_id: userId, lesson_id: lessonId }).first();
  if (on && !exists) await db()('lesson_progress').insert({ user_id: userId, lesson_id: lessonId });
  if (!on && exists) await db()('lesson_progress').where({ id: exists.id }).delete();
}

async function plans(opts) {
  let q = db()('plans').orderBy('sort', 'asc').orderBy('id', 'asc');
  if (!opts || !opts.all) q = q.where({ active: true });
  return (await q).map(mapPlan);
}

async function planByCode(code) {
  return mapPlan(await db()('plans').where({ code }).first());
}

async function planById(id) {
  return mapPlan(await db()('plans').where({ id }).first());
}

async function discount() {
  const rows = await db()('settings').whereIn('key', ['discount_code', 'discount_percent']);
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return { code: map.discount_code || '', percent: Number(map.discount_percent) || 0 };
}

function addQuota(current, amount) {
  if (amount < 0) return -1;
  if (current < 0) return -1;
  return (Number(current) || 0) + amount;
}

async function recordPurchase(fields) {
  const inserted = await db()('purchases').insert({
    user_id: fields.userId,
    plan_code: fields.planCode || null,
    plan_name: fields.planName || '',
    amount: fields.amount || 0,
    discount: fields.discount || 0,
    discount_code: fields.discountCode || null,
    status: fields.status || 'paid',
    note: fields.note || ''
  }).returning('id');
  return Array.isArray(inserted) ? (inserted[0].id || inserted[0]) : inserted;
}

async function grantPlan(user, plan, extra) {
  const start = (extra && extra.start) || texts.t('sub.mockStart');
  const end = (extra && extra.end) || texts.t('sub.mockEnd');
  const pct = (extra && extra.pct) || texts.t('sub.mockPct');
  const offset = extra && extra.offset != null ? Number(extra.offset) : 19.5;
  await db()('user_subscriptions').where({ user_id: user.id, status: 'active' }).update({ status: 'replaced' });
  await db()('user_subscriptions').insert({
    user_id: user.id,
    plan_code: plan.code,
    name: plan.name,
    start_label: start,
    end_label: end,
    pct,
    offset_val: offset,
    status: 'active'
  });
  await updateUser(user.id, {
    paidOk: true,
    messageLeft: addQuota(user.messageLeft, plan.messageCount),
    imageLeft: addQuota(user.imageLeft, plan.imageCount),
    subscription: { name: plan.name, code: plan.code, start, end, pct, offset }
  });
}

async function activityFor(userId, limit) {
  let q = db()('activity').orderBy('created_at', 'desc').orderBy('id', 'desc');
  if (userId) q = q.where({ user_id: userId });
  if (limit) q = q.limit(limit);
  return q;
}

async function counts() {
  const week = tehranWeekStart();
  const users = await db()('users').count({ c: '*' }).first();
  const fresh = await db()('users').where('created_at', '>=', week).count({ c: '*' }).first();
  const subs = await db()('users').whereNotNull('sub_name').count({ c: '*' }).first();
  const purchases = await db()('purchases').whereIn('status', ['paid', 'manual']).count({ c: '*' }).first();
  return {
    users: Number(users.c) || 0,
    week: Number(fresh.c) || 0,
    subs: Number(subs.c) || 0,
    purchases: Number(purchases.c) || 0
  };
}

function tehranWeekStart() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const weekdays = { Sat: 0, Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6 };
  const back = weekdays[parts.weekday] || 0;
  const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) - back * 86400000);
  const y = day.getUTCFullYear();
  const m = String(day.getUTCMonth() + 1).padStart(2, '0');
  const d = String(day.getUTCDate()).padStart(2, '0');
  return new Date(y + '-' + m + '-' + d + 'T00:00:00+03:30');
}

module.exports = {
  STAGES, giftLeft, stageIndex, designs, log, nextSeq,
  userById, userByPhone, createUser, updateUser, setPassword, checkPassword, hasWork,
  projectsOf, projectBySlug, saveProject, deleteProject,
  chatsOf, chatById, createChat, saveChat, deleteChat,
  shotsOf, addShot,
  questionCards, allQuestions, questionById, clearQuestions,
  enrollments, coursesWithLessons, courseBySlug, courseById, markSeen, setEnrollment, setProgress,
  plans, planByCode, planById, discount, recordPurchase, grantPlan, activityFor, counts, mapUser, mapPlan
};
