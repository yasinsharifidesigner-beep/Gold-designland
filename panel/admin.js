const bcrypt = require('bcrypt');
const lib = require('./lib');
const repo = require('./repo');
const texts = require('./texts');
const { getKnex } = require('./db');

const PER = 12;
const NOTES = {
  saved: 'ذخیره شد.',
  deleted: 'حذف شد.',
  blocked: 'وضعیت حساب عوض شد.',
  granted: 'دسترسی دوره ثبت شد.',
  password: 'رمز تازه ثبت شد.'
};
const KINDS = { idea: 'ایده‌پردازی', assistant: 'طراحیار', image: 'ساخت تصویر' };
const STATUS = { paid: 'پرداخت‌شده', manual: 'دستی', failed: 'ناموفق' };
const GROUPS = {
  landing: 'صفحهٔ اصلی', auth: 'ورود و ثبت‌نام', nav: 'منو', common: 'مشترک', month: 'ماه‌ها',
  dash: 'میز کار', idea: 'ایده‌پردازی', assistant: 'طراحیار', image: 'ساخت تصویر',
  refine: 'اصلاح و انتخاب طرح', projects: 'پروژه‌ها', stage: 'مراحل پروژه', courses: 'دوره‌ها',
  sub: 'اشتراک', settings: 'تنظیمات'
};
const FLOWS = [
  ['idea', 'سؤال‌های انتخاب طرح'],
  ['assistant', 'سؤال طراحیار'],
  ['image', 'سؤال‌های ساخت تصویر']
];

const attempts = new Map();
let adminHashCache = '';

function knex() { return getKnex(); }
function enabled() {
  return !!(String(process.env.ADMIN_PHONE || '').trim() && (process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD_HASH));
}
function adminHash() {
  if (process.env.ADMIN_PASSWORD_HASH) return process.env.ADMIN_PASSWORD_HASH;
  if (!adminHashCache) adminHashCache = bcrypt.hashSync(String(process.env.ADMIN_PASSWORD), 10);
  return adminHashCache;
}
function limited(ip) {
  const now = Date.now();
  const row = attempts.get(ip) || { n: 0, at: now };
  if (now - row.at > 15 * 60 * 1000) { row.n = 0; row.at = now; }
  row.n += 1;
  attempts.set(ip, row);
  return row.n > 5;
}
function int(value, fallback) {
  const raw = lib.toLatinDigits(value == null ? '' : value).replace(/[^\d-]/g, '');
  if (!raw || raw === '-') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}
function flag(body, name) { return body && (body[name] === '1' || body[name] === 'on'); }
function noteOf(req) { return NOTES[String(req.query.ok || '')] || ''; }
function back(url, ok) {
  const join = url.indexOf('?') === -1 ? '?' : '&';
  return url + (ok ? join + 'ok=' + ok : '');
}
function pageQuery(req) {
  return {
    q: String(req.query.q || '').trim().slice(0, 80),
    page: Math.max(1, parseInt(req.query.p, 10) || 1)
  };
}
function hrefFor(path, q, extra) {
  return function (p) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (p > 1) params.set('p', String(p));
    Object.keys(extra || {}).forEach((key) => { if (extra[key]) params.set(key, extra[key]); });
    const text = params.toString();
    return path + (text ? '?' + text : '');
  };
}
async function pageRows(builder, page) {
  const counted = await builder.clone().clearOrder().clearSelect().count({ c: '*' }).first();
  const total = Number(counted && counted.c) || 0;
  const pages = Math.max(1, Math.ceil(total / PER));
  const safe = Math.min(page, pages);
  const rows = await builder.clone().limit(PER).offset((safe - 1) * PER);
  return { rows, page: safe, pages };
}
function userName(row) {
  if (!row || !row.first_name) return '—';
  return row.first_name + ' ' + row.last_name;
}
async function idOf(table, row) {
  if (knex().client.config.client === 'pg') {
    const inserted = await knex()(table).insert(row).returning('id');
    return inserted[0].id || inserted[0];
  }
  const inserted = await knex()(table).insert(row);
  return Array.isArray(inserted) ? inserted[0] : inserted;
}

module.exports = function admin(app, tools) {
  const wrap = tools.asyncRoute;
  const csrf = tools.csrf;

  function guard(req, res, next) {
    if (!enabled()) return res.redirect('/admin/login');
    if (!req.session.admin) return res.redirect('/admin/login');
    next();
  }
  function get(path, handler) { app.get(path, guard, wrap(handler)); }
  function post(path, handler) { app.post(path, guard, csrf, wrap(handler)); }

  app.get('/admin/login', function (req, res) {
    if (req.session.admin && enabled()) return res.redirect('/admin');
    res.render('admin/login', { bare: true, enabled: enabled(), error: '', phone: '' });
  });
  app.post('/admin/login', csrf, wrap(async function (req, res) {
    if (!enabled()) return res.render('admin/login', { bare: true, enabled: false, error: '', phone: '' });
    const phone = lib.normalizePhone(req.body.phone);
    const expected = lib.normalizePhone(process.env.ADMIN_PHONE);
    const passwordOk = await bcrypt.compare(String(req.body.password || ''), adminHash());
    if (phone !== expected || !passwordOk) {
      const tooMany = limited(req.ip || 'local');
      return res.status(tooMany ? 429 : 401).render('admin/login', {
        bare: true,
        enabled: true,
        phone: req.body.phone || '',
        error: tooMany ? 'چند بار رمز را اشتباه زدی. چند دقیقه بعد دوباره تلاش کن.' : 'شماره یا رمز درست نیست.'
      });
    }
    req.session.admin = true;
    res.redirect('/admin');
  }));
  app.post('/admin/logout', csrf, function (req, res) {
    req.session.destroy(function () { res.redirect('/admin/login'); });
  });

  get('/admin', async function (req, res) {
    const counts = await repo.counts();
    const activity = await knex()('activity')
      .leftJoin('users', 'users.id', 'activity.user_id')
      .select('activity.*', 'users.first_name', 'users.last_name')
      .orderBy('activity.id', 'desc')
      .limit(12);
    res.render('admin/dash', { note: noteOf(req), counts, activity });
  });

  get('/admin/users', async function (req, res) {
    const query = pageQuery(req);
    let builder = knex()('users').orderBy('created_at', 'desc').orderBy('id', 'desc');
    if (query.q) {
      const parts = query.q.split(/\s+/).filter(Boolean);
      builder = builder.where(function () {
        parts.forEach((part) => {
          this.orWhere('first_name', 'like', '%' + part + '%').orWhere('last_name', 'like', '%' + part + '%');
        });
        const phone = lib.normalizePhone(query.q);
        if (phone) this.orWhere('phone', 'like', '%' + phone + '%');
      });
    }
    const listed = await pageRows(builder, query.page);
    res.render('admin/users', {
      note: noteOf(req), q: query.q, rows: listed.rows.map(repo.mapUser),
      page: listed.page, pages: listed.pages, pageHref: hrefFor('/admin/users', query.q)
    });
  });

  get('/admin/users/:id', async function (req, res) {
    const person = await repo.userById(req.params.id);
    if (!person) return res.redirect('/admin/users');
    const courses = await repo.coursesWithLessons();
    const enrolled = await repo.enrollments(person.id);
    const progress = await knex()('lesson_progress').where({ user_id: person.id }).select('lesson_id');
    const seen = new Set(progress.map((row) => Number(row.lesson_id)));
    const projects = await repo.projectsOf(person.id);
    const chats = await repo.chatsOf(person.id);
    const images = await repo.shotsOf(person.id);
    const purchases = await knex()('purchases').where({ user_id: person.id }).orderBy('id', 'desc');
    const activity = await repo.activityFor(person.id, 30);
    const errors = {
      profile: 'نام، شماره یا تاریخ تولد درست نیست.',
      phone: 'این شماره برای کاربر دیگری است.',
      password: 'رمز را حداقل چهار نویسه بنویس.'
    };
    res.render('admin/user', {
      note: noteOf(req), error: errors[req.query.err] || '', person,
      courses: courses.map((course) => Object.assign({}, course, {
        enrolled: !!enrolled[course.slug],
        sessions: course.sessions.map((lesson) => Object.assign({}, lesson, { seen: seen.has(Number(lesson.id)) }))
      })),
      projects,
      chats: chats.map((chat) => Object.assign({}, chat, { kindLabel: KINDS[chat.kind] || chat.kind })),
      images, purchases, activity
    });
  });

  post('/admin/users/:id', async function (req, res) {
    const person = await repo.userById(req.params.id);
    if (!person) return res.redirect('/admin/users');
    const phone = lib.normalizePhone(req.body.phone);
    const first = String(req.body.first || '').trim();
    const last = String(req.body.last || '').trim();
    const d = int(req.body.d, 0);
    const m = int(req.body.m, 0);
    const y = int(req.body.y, 0);
    const other = await repo.userByPhone(phone);
    if (!first || !last || !/^09\d{9}$/.test(phone) || d < 1 || d > 31 || m < 1 || m > 12 || y < 1320 || y > 1405) {
      return res.redirect('/admin/users/' + person.id + '?err=profile');
    }
    if (other && other.id !== person.id) return res.redirect('/admin/users/' + person.id + '?err=phone');
    await repo.updateUser(person.id, { phone, firstName: first, lastName: last, birth: { d, m, y } });
    await repo.log(person.id, 'admin_profile', 'مدیر مشخصات را ویرایش کرد.');
    res.redirect(back('/admin/users/' + person.id, 'saved'));
  });

  post('/admin/users/:id/password', async function (req, res) {
    const person = await repo.userById(req.params.id);
    if (!person) return res.redirect('/admin/users');
    const password = String(req.body.password || '');
    if (password.length < 4) return res.redirect('/admin/users/' + person.id + '?err=password');
    await repo.setPassword(person.id, password);
    await repo.log(person.id, 'admin_password', 'مدیر رمز را عوض کرد.');
    res.redirect(back('/admin/users/' + person.id, 'password'));
  });

  post('/admin/users/:id/block', async function (req, res) {
    const person = await repo.userById(req.params.id);
    if (!person) return res.redirect('/admin/users');
    await repo.updateUser(person.id, { blocked: !person.blocked });
    await repo.log(person.id, 'admin_block', person.blocked ? 'مدیر مسدودی را برداشت.' : 'مدیر حساب را مسدود کرد.');
    res.redirect(back('/admin/users/' + person.id, 'blocked'));
  });

  post('/admin/users/:id/quota', async function (req, res) {
    const person = await repo.userById(req.params.id);
    if (!person) return res.redirect('/admin/users');
    const clear = flag(req.body, 'clear_sub');
    const name = String(req.body.sub_name || '').trim();
    const subscription = clear || !name ? null : {
      name,
      code: String(req.body.sub_code || '').trim(),
      start: String(req.body.sub_start || '').trim(),
      end: String(req.body.sub_end || '').trim(),
      pct: String(req.body.sub_pct || '').trim(),
      offset: person.subscription ? person.subscription.offset : 19.5
    };
    if (clear) await knex()('user_subscriptions').where({ user_id: person.id, status: 'active' }).update({ status: 'ended' });
    await repo.updateUser(person.id, {
      subscription,
      paidOk: !clear && !!name,
      giftTotal: Math.max(0, int(req.body.gift_total, person.giftTotal)),
      giftUsed: Math.max(0, int(req.body.gift_used, person.giftUsed)),
      messageLeft: int(req.body.message_left, person.messageLeft),
      imageLeft: int(req.body.image_left, person.imageLeft)
    });
    await repo.log(person.id, 'admin_quota', 'مدیر اشتراک و سهمیه را ویرایش کرد.');
    res.redirect(back('/admin/users/' + person.id, 'saved'));
  });

  post('/admin/users/:id/courses', async function (req, res) {
    const person = await repo.userById(req.params.id);
    if (!person) return res.redirect('/admin/users');
    const courses = await repo.coursesWithLessons();
    for (const course of courses) {
      await repo.setEnrollment(person.id, course.id, flag(req.body, 'course_' + course.id));
      for (const lesson of course.sessions) {
        await repo.setProgress(person.id, lesson.id, flag(req.body, 'seen_' + lesson.id));
      }
    }
    await repo.log(person.id, 'admin_course', 'مدیر دسترسی دوره‌ها را ویرایش کرد.');
    res.redirect(back('/admin/users/' + person.id, 'saved'));
  });

  get('/admin/projects', async function (req, res) {
    const query = pageQuery(req);
    let builder = knex()('projects')
      .leftJoin('users', 'users.id', 'projects.user_id')
      .select('projects.*', 'users.first_name', 'users.last_name')
      .orderBy('projects.id', 'desc');
    if (query.q) {
      builder = builder.where(function () {
        this.where('projects.title', 'like', '%' + query.q + '%')
          .orWhere('users.first_name', 'like', '%' + query.q + '%')
          .orWhere('users.last_name', 'like', '%' + query.q + '%');
      });
    }
    const listed = await pageRows(builder, query.page);
    res.render('admin/projects', {
      note: noteOf(req), q: query.q, page: listed.page, pages: listed.pages,
      pageHref: hrefFor('/admin/projects', query.q),
      rows: listed.rows.map((row) => ({
        slug: row.slug, title: row.title, stage: KINDS[row.stage] || row.stage,
        when: row.when_label, userName: userName(row)
      }))
    });
  });

  get('/admin/projects/:slug', async function (req, res) {
    const project = await repo.projectBySlug(req.params.slug);
    if (!project) return res.redirect('/admin/projects');
    const person = await repo.userById(project.userId);
    res.render('admin/project', {
      note: noteOf(req), error: '', project,
      userName: person ? person.firstName + ' ' + person.lastName : '—',
      stages: repo.STAGES.map((key) => [key, KINDS[key] || key])
    });
  });
  post('/admin/projects/:slug', async function (req, res) {
    const project = await repo.projectBySlug(req.params.slug);
    if (!project) return res.redirect('/admin/projects');
    const stage = repo.STAGES.indexOf(req.body.stage) === -1 ? project.stage : req.body.stage;
    project.title = String(req.body.title || '').trim() || project.title;
    project.when = String(req.body.when || '');
    project.stage = stage;
    project.shape = String(req.body.shape || project.shape);
    project.summary = String(req.body.summary || '');
    project.blurb = String(req.body.blurb || '').split(/\r?\n/);
    await repo.saveProject(project);
    res.redirect(back('/admin/projects/' + project.slug, 'saved'));
  });
  post('/admin/projects/:slug/delete', async function (req, res) {
    await repo.deleteProject(req.params.slug);
    res.redirect(back('/admin/projects', 'deleted'));
  });

  async function chatList(req, res, opts) {
    const query = pageQuery(req);
    const kind = opts.kind || (['idea', 'assistant', 'image'].indexOf(req.query.kind) === -1 ? '' : req.query.kind);
    let builder = knex()('chats')
      .leftJoin('users', 'users.id', 'chats.user_id')
      .select('chats.*', 'users.first_name', 'users.last_name')
      .orderBy('chats.id', 'desc');
    if (kind) builder = builder.where('chats.kind', kind);
    if (query.q) {
      builder = builder.where(function () {
        this.where('chats.title', 'like', '%' + query.q + '%')
          .orWhere('users.first_name', 'like', '%' + query.q + '%')
          .orWhere('users.last_name', 'like', '%' + query.q + '%');
      });
    }
    const listed = await pageRows(builder, query.page);
    const ids = listed.rows.map((row) => row.id);
    const counts = ids.length
      ? await knex()('messages').whereIn('chat_id', ids).select('chat_id').count({ c: '*' }).groupBy('chat_id')
      : [];
    const countOf = Object.fromEntries(counts.map((row) => [row.chat_id, Number(row.c) || 0]));
    res.render('admin/chats', {
      note: noteOf(req), q: query.q, kind, base: opts.base, title: opts.title, active: opts.active,
      page: listed.page, pages: listed.pages,
      pageHref: hrefFor(opts.base, query.q, kind && !opts.kind ? { kind } : {}),
      tabs: opts.tabs ? [{ id: '', label: 'همه' }].concat(FLOWS.map((flow) => ({ id: flow[0], label: flow[1] }))).map((tab) => ({
        label: tab.id ? KINDS[tab.id] : 'همه',
        on: tab.id === kind,
        href: tab.id ? opts.base + '?kind=' + tab.id : opts.base
      })) : null,
      rows: listed.rows.map((row) => ({
        id: row.id, title: row.title, when: row.when_label, userName: userName(row),
        kindLabel: KINDS[row.kind] || row.kind, messages: countOf[row.id] || 0
      }))
    });
  }
  get('/admin/ideas', function (req, res) {
    return chatList(req, res, { kind: 'idea', base: '/admin/ideas', title: 'ایده‌ها', active: 'ideas', tabs: false });
  });
  get('/admin/chats', function (req, res) {
    return chatList(req, res, { base: '/admin/chats', title: 'گفت‌وگوها', active: 'chats', tabs: true });
  });
  get('/admin/chats/:id', async function (req, res) {
    const chat = await repo.chatById(req.params.id);
    if (!chat) return res.redirect('/admin/chats');
    const person = await repo.userById(chat.userId);
    res.render('admin/chat', {
      note: noteOf(req), error: '', chat,
      userName: person ? person.firstName + ' ' + person.lastName : '—',
      kindLabel: KINDS[chat.kind] || chat.kind
    });
  });
  post('/admin/chats/:id', async function (req, res) {
    const chat = await repo.chatById(req.params.id);
    if (!chat) return res.redirect('/admin/chats');
    chat.title = String(req.body.title || '').trim() || chat.title;
    chat.when = String(req.body.when || '');
    delete chat.messages;
    await repo.saveChat(chat);
    res.redirect(back('/admin/chats/' + chat.id, 'saved'));
  });
  post('/admin/chats/:id/delete', async function (req, res) {
    await knex()('images').where({ chat_id: req.params.id }).delete();
    await repo.deleteChat(req.params.id);
    res.redirect(back('/admin/chats', 'deleted'));
  });
  post('/admin/chats/:id/messages', async function (req, res) {
    const chat = await repo.chatById(req.params.id);
    if (!chat) return res.redirect('/admin/chats');
    const max = await knex()('messages').where({ chat_id: chat.id }).max({ m: 'sort' }).first();
    await knex()('messages').insert({
      chat_id: chat.id,
      role: req.body.role === 'assistant' ? 'assistant' : 'user',
      type: 'text',
      text: String(req.body.text || ''),
      sort: (Number(max && max.m) || 0) + 1
    });
    res.redirect(back('/admin/chats/' + chat.id, 'saved'));
  });
  post('/admin/chats/:id/messages/:mid', async function (req, res) {
    if (flag(req.body, 'remove')) {
      await knex()('messages').where({ id: req.params.mid, chat_id: req.params.id }).delete();
    } else {
      await knex()('messages').where({ id: req.params.mid, chat_id: req.params.id }).update({
        role: req.body.role === 'assistant' ? 'assistant' : 'user',
        text: String(req.body.text || '')
      });
    }
    res.redirect(back('/admin/chats/' + req.params.id, 'saved'));
  });

  get('/admin/plans', async function (req, res) {
    res.render('admin/plans', { note: noteOf(req), rows: await repo.plans({ all: true }) });
  });
  get('/admin/plans/new', function (req, res) {
    res.render('admin/plan', { note: noteOf(req), error: '', plan: null });
  });
  get('/admin/plans/:id', async function (req, res) {
    const plan = await repo.planById(req.params.id);
    if (!plan) return res.redirect('/admin/plans');
    res.render('admin/plan', { note: noteOf(req), error: '', plan });
  });
  async function savePlan(req, existing) {
    const code = String((existing && existing.code) || req.body.code || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();
    if (!existing && !/^[a-z0-9-]{2,32}$/.test(code)) return 'کد را با حرف انگلیسی بنویس.';
    if (!name) return 'نام را بنویس.';
    const features = String(req.body.features || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const row = {
      name,
      price: Math.max(0, int(req.body.price, 0)),
      message_count: flag(req.body, 'message_unlimited') ? -1 : Math.max(0, int(req.body.message_count, 0)),
      image_count: flag(req.body, 'image_unlimited') ? -1 : Math.max(0, int(req.body.image_count, 0)),
      features_json: JSON.stringify(features),
      featured: flag(req.body, 'featured'),
      active: flag(req.body, 'active'),
      sort: int(req.body.sort, existing ? existing.sort : 0)
    };
    if (existing) await knex()('plans').where({ id: existing.id }).update(row);
    else {
      row.code = code;
      await knex()('plans').insert(row);
    }
    return '';
  }
  post('/admin/plans', async function (req, res) {
    const error = await savePlan(req, null);
    if (error) return res.render('admin/plan', { note: '', error, plan: null });
    res.redirect(back('/admin/plans', 'saved'));
  });
  post('/admin/plans/:id', async function (req, res) {
    const plan = await repo.planById(req.params.id);
    if (!plan) return res.redirect('/admin/plans');
    const error = await savePlan(req, plan);
    if (error) return res.render('admin/plan', { note: '', error, plan });
    res.redirect(back('/admin/plans/' + plan.id, 'saved'));
  });
  post('/admin/plans/:id/delete', async function (req, res) {
    await knex()('plans').where({ id: req.params.id }).delete();
    res.redirect(back('/admin/plans', 'deleted'));
  });

  async function purchaseView(res, data) {
    res.render('admin/purchase', Object.assign({
      note: '', error: '', row: null, phone: '', planCode: '', amount: '', discount: 0,
      status: 'manual', memo: '', grant: true, plans: await repo.plans({ all: true })
    }, data));
  }
  get('/admin/purchases', async function (req, res) {
    const query = pageQuery(req);
    let builder = knex()('purchases')
      .leftJoin('users', 'users.id', 'purchases.user_id')
      .select('purchases.*', 'users.first_name', 'users.last_name', 'users.phone')
      .orderBy('purchases.id', 'desc');
    if (query.q) {
      builder = builder.where(function () {
        this.where('purchases.plan_name', 'like', '%' + query.q + '%')
          .orWhere('users.first_name', 'like', '%' + query.q + '%')
          .orWhere('users.last_name', 'like', '%' + query.q + '%')
          .orWhere('users.phone', 'like', '%' + (lib.normalizePhone(query.q) || query.q) + '%');
      });
    }
    const listed = await pageRows(builder, query.page);
    res.render('admin/purchases', {
      note: noteOf(req), q: query.q, page: listed.page, pages: listed.pages,
      pageHref: hrefFor('/admin/purchases', query.q),
      rows: listed.rows.map((row) => Object.assign(row, { userName: userName(row), statusLabel: STATUS[row.status] || row.status }))
    });
  });
  get('/admin/purchases/new', async function (req, res) {
    await purchaseView(res, { phone: String(req.query.phone || ''), grant: true, note: noteOf(req), memo: '' });
  });
  get('/admin/purchases/:id', async function (req, res) {
    const row = await knex()('purchases').where({ id: req.params.id }).first();
    if (!row) return res.redirect('/admin/purchases');
    const person = await repo.userById(row.user_id);
    await purchaseView(res, {
      row, phone: person ? person.phone : '', planCode: row.plan_code || '', amount: row.amount,
      discount: row.discount, status: row.status, memo: row.note, grant: false, note: noteOf(req)
    });
  });
  async function applyPurchase(req, existing) {
    const person = existing
      ? await repo.userById(existing.user_id)
      : await repo.userByPhone(lib.normalizePhone(req.body.phone));
    if (!person) return { error: 'کاربری با این شماره نیست.' };
    const plan = req.body.plan ? await repo.planByCode(req.body.plan) : null;
    const status = STATUS[req.body.status] ? req.body.status : 'manual';
    const amount = req.body.amount === '' && plan ? plan.price : Math.max(0, int(req.body.amount, 0));
    const discount = Math.max(0, int(req.body.discount, 0));
    const note = String(req.body.note || '');
    const fields = {
      plan_code: plan ? plan.code : null,
      plan_name: plan ? plan.name : (existing ? existing.plan_name : 'دستی'),
      amount, discount, status, note
    };
    let id = existing && existing.id;
    if (existing) await knex()('purchases').where({ id }).update(fields);
    else id = await idOf('purchases', Object.assign({ user_id: person.id, discount_code: null }, fields));
    if (flag(req.body, 'grant') && plan && status !== 'failed') {
      await repo.grantPlan(person, plan);
      await repo.log(person.id, 'purchase', 'مدیر اشتراک ' + plan.name + ' را برای ' + person.firstName + ' ثبت کرد.');
    }
    return { id, error: '' };
  }
  post('/admin/purchases', async function (req, res) {
    const result = await applyPurchase(req, null);
    if (result.error) return purchaseView(res, { error: result.error, phone: req.body.phone || '', grant: true });
    res.redirect(back('/admin/purchases/' + result.id, 'saved'));
  });
  post('/admin/purchases/:id', async function (req, res) {
    const row = await knex()('purchases').where({ id: req.params.id }).first();
    if (!row) return res.redirect('/admin/purchases');
    const result = await applyPurchase(req, row);
    if (result.error) {
      const person = await repo.userById(row.user_id);
      return purchaseView(res, { error: result.error, row, phone: person ? person.phone : '' });
    }
    res.redirect(back('/admin/purchases/' + row.id, 'saved'));
  });

  get('/admin/courses', async function (req, res) {
    res.render('admin/courses', { note: noteOf(req), rows: await repo.coursesWithLessons() });
  });
  get('/admin/courses/new', function (req, res) {
    res.render('admin/course', { note: noteOf(req), error: '', course: null });
  });
  get('/admin/courses/:id', async function (req, res) {
    const course = await repo.courseById(req.params.id);
    if (!course) return res.redirect('/admin/courses');
    res.render('admin/course', { note: noteOf(req), error: '', course });
  });
  post('/admin/courses', async function (req, res) {
    const title = String(req.body.title || '').trim();
    const slug = String(req.body.slug || '').trim().toLowerCase();
    if (!title || !/^[a-z0-9-]{2,40}$/.test(slug)) {
      return res.render('admin/course', { note: '', error: 'عنوان و یک شناسهٔ انگلیسی لازم است.', course: null });
    }
    if (await knex()('courses').where({ slug }).first()) {
      return res.render('admin/course', { note: '', error: 'این شناسه قبلاً استفاده شده.', course: null });
    }
    const id = await idOf('courses', {
      slug, title, description: String(req.body.description || ''),
      sort: int(req.body.sort, 0), active: flag(req.body, 'active')
    });
    res.redirect(back('/admin/courses/' + id, 'saved'));
  });
  post('/admin/courses/:id', async function (req, res) {
    const course = await repo.courseById(req.params.id);
    if (!course) return res.redirect('/admin/courses');
    const title = String(req.body.title || '').trim();
    if (!title) return res.render('admin/course', { note: '', error: 'عنوان را بنویس.', course });
    await knex()('courses').where({ id: course.id }).update({
      title, description: String(req.body.description || ''),
      sort: int(req.body.sort, course.sort), active: flag(req.body, 'active')
    });
    res.redirect(back('/admin/courses/' + course.id, 'saved'));
  });
  post('/admin/courses/:id/delete', async function (req, res) {
    await knex()('courses').where({ id: req.params.id }).delete();
    res.redirect(back('/admin/courses', 'deleted'));
  });
  post('/admin/courses/:id/grant', async function (req, res) {
    const course = await repo.courseById(req.params.id);
    if (!course) return res.redirect('/admin/courses');
    const person = await repo.userByPhone(lib.normalizePhone(req.body.phone));
    if (!person) return res.render('admin/course', { note: '', error: 'کاربری با این شماره نیست.', course });
    await repo.setEnrollment(person.id, course.id, req.body.mode !== 'revoke');
    await repo.log(person.id, 'admin_course', req.body.mode === 'revoke'
      ? 'مدیر دورهٔ «' + course.title + '» را گرفت.'
      : 'مدیر دورهٔ «' + course.title + '» را داد.');
    res.redirect(back('/admin/courses/' + course.id, 'granted'));
  });

  get('/admin/courses/:id/lessons/new', async function (req, res) {
    const course = await repo.courseById(req.params.id);
    if (!course) return res.redirect('/admin/courses');
    const nextN = course.sessions.reduce((max, lesson) => Math.max(max, lesson.n), 0) + 1;
    res.render('admin/lesson', { note: noteOf(req), error: '', course, lesson: null, nextN });
  });
  get('/admin/courses/:id/lessons/:lessonId', async function (req, res) {
    const course = await repo.courseById(req.params.id);
    const lesson = course && course.sessions.find((item) => String(item.id) === String(req.params.lessonId));
    if (!lesson) return res.redirect('/admin/courses/' + req.params.id);
    res.render('admin/lesson', { note: noteOf(req), error: '', course, lesson, nextN: lesson.n });
  });
  async function saveLesson(req, course, lesson) {
    const title = String(req.body.title || '').trim();
    const n = int(req.body.n, lesson ? lesson.n : 0);
    if (!title || n < 1) return 'عنوان و شماره را بنویس.';
    const clash = await knex()('lessons').where({ course_id: course.id, n }).first();
    if (clash && (!lesson || Number(clash.id) !== Number(lesson.id))) return 'این شماره برای جلسهٔ دیگری است.';
    const access = ['free', 'gift', 'locked'].indexOf(req.body.access) === -1 ? 'gift' : req.body.access;
    const row = {
      title, n, description: String(req.body.description || ''),
      duration: String(req.body.duration || ''), video_url: String(req.body.video_url || ''),
      access, sort: int(req.body.sort, n)
    };
    if (lesson) await knex()('lessons').where({ id: lesson.id }).update(row);
    else await knex()('lessons').insert(Object.assign({ course_id: course.id }, row));
    return '';
  }
  post('/admin/courses/:id/lessons', async function (req, res) {
    const course = await repo.courseById(req.params.id);
    if (!course) return res.redirect('/admin/courses');
    const error = await saveLesson(req, course, null);
    if (error) {
      const nextN = course.sessions.reduce((max, lesson) => Math.max(max, lesson.n), 0) + 1;
      return res.render('admin/lesson', { note: '', error, course, lesson: null, nextN });
    }
    res.redirect(back('/admin/courses/' + course.id, 'saved'));
  });
  post('/admin/courses/:id/lessons/:lessonId', async function (req, res) {
    const course = await repo.courseById(req.params.id);
    const lesson = course && course.sessions.find((item) => String(item.id) === String(req.params.lessonId));
    if (!lesson) return res.redirect('/admin/courses');
    const error = await saveLesson(req, course, lesson);
    if (error) return res.render('admin/lesson', { note: '', error, course, lesson, nextN: lesson.n });
    res.redirect(back('/admin/courses/' + course.id + '/lessons/' + lesson.id, 'saved'));
  });
  post('/admin/courses/:id/lessons/:lessonId/delete', async function (req, res) {
    await knex()('lessons').where({ id: req.params.lessonId, course_id: req.params.id }).delete();
    res.redirect(back('/admin/courses/' + req.params.id, 'deleted'));
  });
  post('/admin/courses/:id/lessons/:lessonId/move', async function (req, res) {
    await moveRows('lessons', { course_id: req.params.id }, req.params.lessonId, req.body.dir);
    res.redirect('/admin/courses/' + req.params.id);
  });

  async function moveRows(table, where, id, dir) {
    const rows = await knex()(table).where(where).orderBy('sort', 'asc').orderBy('id', 'asc');
    const index = rows.findIndex((row) => String(row.id) === String(id));
    const next = dir === 'up' ? index - 1 : index + 1;
    if (index < 0 || next < 0 || next >= rows.length) return;
    const copy = rows.slice();
    const item = copy.splice(index, 1)[0];
    copy.splice(next, 0, item);
    for (let i = 0; i < copy.length; i++) await knex()(table).where({ id: copy[i].id }).update({ sort: i + 1 });
    if (table === 'questions') repo.clearQuestions();
  }

  get('/admin/questions', async function (req, res) {
    const flow = ['idea', 'assistant', 'image'].indexOf(req.query.flow) === -1 ? 'idea' : req.query.flow;
    const rows = await repo.allQuestions(flow);
    res.render('admin/questions', {
      note: noteOf(req), flow, rows,
      flows: FLOWS.map((item) => ({ id: item[0], label: item[1], on: item[0] === flow }))
    });
  });
  get('/admin/questions/new', function (req, res) {
    const flow = ['idea', 'assistant', 'image'].indexOf(req.query.flow) === -1 ? 'idea' : req.query.flow;
    res.render('admin/question', { note: noteOf(req), error: '', question: null, flow });
  });
  get('/admin/questions/:id', async function (req, res) {
    const question = await repo.questionById(req.params.id);
    if (!question) return res.redirect('/admin/questions');
    res.render('admin/question', { note: noteOf(req), error: '', question, flow: question.flow });
  });
  post('/admin/questions', async function (req, res) {
    const flow = ['idea', 'assistant', 'image'].indexOf(req.body.flow) === -1 ? 'idea' : req.body.flow;
    const title = String(req.body.title || '').trim();
    if (!title) return res.render('admin/question', { note: '', error: 'متن سؤال را بنویس.', question: null, flow });
    const max = await knex()('questions').where({ flow }).max({ m: 'sort' }).first();
    const id = await idOf('questions', {
      flow, title, sort: (Number(max && max.m) || 0) + 1,
      break_after: Math.max(0, int(req.body.break_after, 0)),
      confirm: flag(req.body, 'confirm'), active: flag(req.body, 'active')
    });
    repo.clearQuestions();
    res.redirect(back('/admin/questions/' + id, 'saved'));
  });
  post('/admin/questions/:id', async function (req, res) {
    const question = await repo.questionById(req.params.id);
    if (!question) return res.redirect('/admin/questions');
    const title = String(req.body.title || '').trim();
    if (!title) return res.render('admin/question', { note: '', error: 'متن سؤال را بنویس.', question, flow: question.flow });
    await knex()('questions').where({ id: question.id }).update({
      title, break_after: Math.max(0, int(req.body.break_after, 0)),
      confirm: flag(req.body, 'confirm'), active: flag(req.body, 'active')
    });
    const count = int(req.body.opt_count, 0);
    let groupSort = -1;
    let previous = null;
    for (let i = 0; i < count; i++) {
      const label = String(req.body['opt_group_' + i] || '');
      if (label !== previous) { groupSort += 1; previous = label; }
      const role = ['style', 'count'].indexOf(req.body['opt_role_' + i]) === -1 ? '' : req.body['opt_role_' + i];
      await knex()('question_options').where({ id: req.body['opt_id_' + i], question_id: question.id }).update({
        text: String(req.body['opt_text_' + i] || ''),
        group_label: label,
        group_role: role,
        group_sort: groupSort,
        suggest: req.body['opt_suggest_' + i] === '1',
        sort: i
      });
    }
    repo.clearQuestions();
    res.redirect(back('/admin/questions/' + question.id, 'saved'));
  });
  post('/admin/questions/:id/options', async function (req, res) {
    const max = await knex()('question_options').where({ question_id: req.params.id }).max({ m: 'sort' }).first();
    await knex()('question_options').insert({
      question_id: req.params.id, text: 'گزینهٔ تازه', group_label: '', group_role: '',
      group_sort: 0, suggest: false, sort: (Number(max && max.m) || 0) + 1
    });
    repo.clearQuestions();
    res.redirect(back('/admin/questions/' + req.params.id, 'saved'));
  });
  post('/admin/questions/:id/options/:oid/delete', async function (req, res) {
    await knex()('question_options').where({ id: req.params.oid, question_id: req.params.id }).delete();
    repo.clearQuestions();
    res.redirect(back('/admin/questions/' + req.params.id, 'deleted'));
  });
  post('/admin/questions/:id/delete', async function (req, res) {
    const question = await repo.questionById(req.params.id);
    await knex()('questions').where({ id: req.params.id }).delete();
    repo.clearQuestions();
    res.redirect(back('/admin/questions?flow=' + (question ? question.flow : 'idea'), 'deleted'));
  });
  post('/admin/questions/:id/move', async function (req, res) {
    const question = await repo.questionById(req.params.id);
    if (question) await moveRows('questions', { flow: question.flow }, question.id, req.body.dir);
    res.redirect('/admin/questions?flow=' + (question ? question.flow : 'idea'));
  });

  get('/admin/texts', async function (req, res) {
    const query = pageQuery(req);
    const group = GROUPS[req.query.g] ? req.query.g : '';
    let builder = knex()('texts').orderBy('grp', 'asc').orderBy('key', 'asc');
    if (group) builder = builder.where({ grp: group });
    if (query.q) {
      builder = builder.where(function () {
        this.where('key', 'like', '%' + query.q + '%')
          .orWhere('value', 'like', '%' + query.q + '%')
          .orWhere('label', 'like', '%' + query.q + '%');
      });
    }
    const listed = await pageRows(builder, query.page);
    res.render('admin/texts', {
      note: noteOf(req), q: query.q, group, page: listed.page, pages: listed.pages,
      pageHref: hrefFor('/admin/texts', query.q, group ? { g: group } : {}),
      groups: Object.keys(GROUPS).map((id) => ({ id, label: GROUPS[id] })),
      rows: listed.rows.map((row) => ({ key: row.key, value: row.value, groupLabel: GROUPS[row.grp] || row.label }))
    });
  });
  get('/admin/texts/:key', async function (req, res) {
    const row = await knex()('texts').where({ key: req.params.key }).first();
    if (!row) return res.redirect('/admin/texts');
    res.render('admin/text', { note: noteOf(req), row, groupLabel: GROUPS[row.grp] || row.label });
  });
  post('/admin/texts/:key', async function (req, res) {
    const row = await knex()('texts').where({ key: req.params.key }).first();
    if (!row) return res.redirect('/admin/texts');
    const value = String(req.body.value == null ? '' : req.body.value);
    await knex()('texts').where({ key: row.key }).update({ value });
    texts.set(row.key, value);
    res.redirect(back('/admin/texts/' + encodeURIComponent(row.key), 'saved'));
  });
};
