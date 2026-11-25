const path = require('path');
const session = require('express-session');
const DbSessionStore = require('./session-store');
const repo = require('./repo');
const otp = require('./otp');
const lib = require('./lib');
const texts = require('./texts');
const { getKnex } = require('./db');

function asyncRoute(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function fill(now) {
  return ['0%', '33.333%', '66.667%', '100%'][now] || '0%';
}

module.exports = function mount(app) {
  const knex = getKnex();
  const secret = process.env.SESSION_SECRET || 'gdl-panel-dev';
  const cookie = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  };
  const userSession = session({
    name: 'gdl.sid',
    secret,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie,
    store: new DbSessionStore(knex, 'sessions')
  });
  const adminSession = session({
    name: 'gdl.admin',
    secret,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie,
    store: new DbSessionStore(knex, 'admin_sessions')
  });

  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(function (req, res, next) {
    if (req.path === '/admin' || req.path.startsWith('/admin/')) return adminSession(req, res, next);
    return userSession(req, res, next);
  });

  app.use(asyncRoute(async function (req, res, next) {
    const admin = req.path === '/admin' || req.path.startsWith('/admin/');
    if (req.path !== '/') res.locals.csrf = lib.csrfToken(req);
    res.locals.fa = lib.faDigits;
    res.locals.money = lib.faMoney;
    res.locals.t = texts.t;
    res.locals.months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => texts.t('month.' + n));
    res.locals.when = lib.faWhen;
    if (admin) {
      res.set('X-Robots-Tag', 'noindex, nofollow');
      res.locals.adminOn = !!req.session.admin;
      return next();
    }
    res.locals.user = req.session.userId ? await repo.userById(req.session.userId) : null;
    next();
  }));

  function guard(req, res, next) {
    if (!req.session.userId || !res.locals.user) return res.redirect('/auth/login');
    if (res.locals.user.blocked) {
      return req.session.destroy(function () { res.redirect('/auth/login'); });
    }
    next();
  }
  function csrf(req, res, next) {
    if (!lib.checkCsrf(req)) return res.status(403).send(texts.t('error.csrf'));
    next();
  }

  app.get('/', function (req, res) {
    res.render('landing');
  });

  function passwordPairError(a, b) {
    if (lib.normalizePassword(a) !== lib.normalizePassword(b)) return texts.t('auth.errPass');
    if (!lib.passwordOk(a)) return texts.t('auth.errPassRule');
    return '';
  }

  function authView(res, mode, extra) {
    res.render('auth', Object.assign({
      mode,
      error: '',
      phone: '',
      phoneShow: '',
      left: 60,
      first: '',
      last: '',
      d: '',
      m: '',
      y: ''
    }, extra || {}));
  }

  function otpDigits(body) {
    return [0, 1, 2, 3, 4].map((i) => lib.toLatinDigits((body && body['d' + i]) || '').replace(/\D/g, '').slice(-1)).join('');
  }

  function clientIp(req) {
    return req.ip || '';
  }

  function signupReady(req, step) {
    return !!(req.session.signup && req.session.signup.step >= step && req.session.signup.phone);
  }

  async function showCode(res, mode, phone, extra) {
    authView(res, mode, Object.assign({
      phoneShow: lib.phoneSpaced(phone),
      left: await otp.cooldownLeft(phone)
    }, extra || {}));
  }

  app.get('/auth/login', function (req, res) { authView(res, 'login'); });
  app.get('/auth/signup', function (req, res) {
    authView(res, 'signup1', { phone: (req.session.signup && req.session.signup.phone) || '' });
  });
  app.post('/auth/signup', csrf, asyncRoute(async function (req, res) {
    const phone = lib.normalizePhone(req.body.phone);
    if (!/^09\d{9}$/.test(phone)) return authView(res, 'signup1', { error: texts.t('auth.errPhone'), phone: req.body.phone });
    if (await repo.userByPhone(phone)) return authView(res, 'signup1', { error: texts.t('auth.errExists'), phone: req.body.phone });
    const sent = await otp.issue({ phone, purpose: 'signup', ip: clientIp(req) });
    if (!sent.ok) return authView(res, 'signup1', { error: otp.message(sent.reason), phone: req.body.phone });
    req.session.signup = { phone, step: 2 };
    res.redirect('/auth/signup/verify');
  }));
  app.get('/auth/signup/verify', asyncRoute(async function (req, res) {
    if (!signupReady(req, 2)) return res.redirect('/auth/signup');
    const phone = req.session.signup.phone;
    let error = '';
    if (req.query.resend === '1') {
      const sent = await otp.issue({ phone, purpose: 'signup', ip: clientIp(req) });
      if (!sent.ok) error = otp.message(sent.reason);
    }
    await showCode(res, 'signup2', phone, { error });
  }));
  app.post('/auth/signup/verify', csrf, asyncRoute(async function (req, res) {
    if (!signupReady(req, 2)) return res.redirect('/auth/signup');
    const phone = req.session.signup.phone;
    const result = await otp.check({ phone, purpose: 'signup', code: otpDigits(req.body) });
    if (!result.ok) return showCode(res, 'signup2', phone, { error: otp.message(result.reason) });
    req.session.signup.step = 3;
    res.redirect('/auth/signup/profile');
  }));
  app.get('/auth/signup/profile', function (req, res) {
    if (!signupReady(req, 3)) return res.redirect('/auth/signup');
    const s = req.session.signup;
    authView(res, 'signup3', { first: s.first || '', last: s.last || '', d: s.d || '', m: s.m || '', y: s.y || '' });
  });
  app.post('/auth/signup/profile', csrf, function (req, res) {
    if (!signupReady(req, 3)) return res.redirect('/auth/signup');
    const first = String(req.body.first || '').trim();
    const last = String(req.body.last || '').trim();
    const d = +req.body.d;
    const m = +req.body.m;
    const y = +req.body.y;
    const dateOk = Number.isInteger(d) && d >= 1 && d <= 31 && Number.isInteger(m) && m >= 1 && m <= 12 && Number.isInteger(y) && y >= 1320 && y <= 1405;
    if (!first || !last || !dateOk) {
      return authView(res, 'signup3', {
        error: texts.t('auth.errProfile'),
        first: req.body.first || '',
        last: req.body.last || '',
        d: req.body.d || '',
        m: req.body.m || '',
        y: req.body.y || ''
      });
    }
    Object.assign(req.session.signup, { first, last, d, m, y, step: 4 });
    res.redirect('/auth/signup/password');
  });
  app.get('/auth/signup/password', function (req, res) {
    if (!signupReady(req, 4)) return res.redirect('/auth/signup');
    authView(res, 'signup4');
  });
  app.post('/auth/signup/password', csrf, asyncRoute(async function (req, res) {
    if (!signupReady(req, 4)) return res.redirect('/auth/signup');
    const passError = passwordPairError(req.body.password, req.body.again);
    if (passError) return authView(res, 'signup4', { error: passError });
    const s = req.session.signup;
    if (await repo.userByPhone(s.phone)) {
      req.session.signup = null;
      return authView(res, 'signup1', { error: texts.t('auth.errExists'), phone: s.phone });
    }
    const user = await repo.createUser({
      phone: s.phone, firstName: s.first, lastName: s.last,
      birth: { d: s.d, m: s.m, y: s.y }, password: req.body.password
    });
    req.session.userId = user.id;
    req.session.authMethod = 'password';
    req.session.signup = null;
    res.redirect('/panel');
  }));

  app.post('/auth/login', csrf, asyncRoute(async function (req, res) {
    const phone = lib.normalizePhone(req.body.phone);
    const user = await repo.userByPhone(phone);
    if (!/^09\d{9}$/.test(phone)) return authView(res, 'login', { error: texts.t('auth.errPhone'), phone: req.body.phone });
    if (!user) return authView(res, 'login', { error: texts.t('auth.errNoUser'), phone: req.body.phone });
    if (user.blocked) return authView(res, 'login', { error: texts.t('auth.errBlocked'), phone: req.body.phone });
    if (!(await repo.checkPassword(user, req.body.password))) return authView(res, 'login', { error: texts.t('auth.errBadPass'), phone: req.body.phone });
    req.session.userId = user.id;
    req.session.authMethod = 'password';
    await repo.log(user.id, 'login', user.firstName + ' ' + user.lastName + ' وارد شد.');
    res.redirect('/panel');
  }));

  app.get('/auth/forgot', function (req, res) { authView(res, 'forgot1', { phone: (req.session.forgot && req.session.forgot.phone) || '' }); });
  app.post('/auth/forgot', csrf, asyncRoute(async function (req, res) {
    const phone = lib.normalizePhone(req.body.phone);
    const user = await repo.userByPhone(phone);
    if (!user) return authView(res, 'forgot1', { error: texts.t('auth.errNoUser'), phone: req.body.phone });
    if (user.blocked) return authView(res, 'forgot1', { error: texts.t('auth.errBlocked'), phone: req.body.phone });
    const sent = await otp.issue({ phone, purpose: 'login', ip: clientIp(req) });
    if (!sent.ok) return authView(res, 'forgot1', { error: otp.message(sent.reason), phone: req.body.phone });
    req.session.forgot = { phone, userId: user.id };
    res.redirect('/auth/forgot/code');
  }));
  app.get('/auth/forgot/code', asyncRoute(async function (req, res) {
    if (!req.session.forgot || !req.session.forgot.phone) return res.redirect('/auth/forgot');
    const phone = req.session.forgot.phone;
    let error = '';
    if (req.query.resend === '1') {
      const sent = await otp.issue({ phone, purpose: 'login', ip: clientIp(req) });
      if (!sent.ok) error = otp.message(sent.reason);
    }
    await showCode(res, 'forgot2', phone, { error });
  }));
  app.post('/auth/forgot/verify', csrf, asyncRoute(async function (req, res) {
    if (!req.session.forgot || !req.session.forgot.phone) return res.redirect('/auth/forgot');
    const phone = req.session.forgot.phone;
    const result = await otp.check({ phone, purpose: 'login', code: otpDigits(req.body) });
    if (!result.ok) return showCode(res, 'forgot2', phone, { error: otp.message(result.reason) });
    const user = await repo.userById(req.session.forgot.userId);
    req.session.userId = req.session.forgot.userId;
    req.session.authMethod = 'otp';
    req.session.forgot = null;
    if (user) await repo.log(user.id, 'login_otp', user.firstName + ' ' + user.lastName + ' با کد وارد شد.');
    res.redirect('/panel');
  }));
  app.post('/auth/logout', csrf, function (req, res) {
    req.session.destroy(function () { res.redirect('/auth/login'); });
  });

  app.get('/panel', guard, asyncRoute(async function (req, res) {
    const user = res.locals.user;
    const empty = !(await repo.hasWork(user.id));
    const mine = await repo.projectsOf(user.id, { home: true });
    const ideas = (await repo.chatsOf(user.id, { kind: 'idea', dash: true }));
    const asks = await repo.chatsOf(user.id, { kind: 'assistant', dash: true });
    const shots = await repo.shotsOf(user.id, 4);
    res.render('dash', {
      empty, ideas, asks, shots, giftLeft: repo.giftLeft(user),
      projects: mine.map((p) => {
        const now = repo.stageIndex(p.stage);
        return Object.assign({}, p, { now, fill: fill(now) });
      })
    });
  }));

  async function rowsOf(user, kind) {
    const list = await repo.chatsOf(user.id, { kind, list: true });
    return list.map((c, i) => {
      const fromEnd = list.length - 1 - i;
      const fade = fromEnd === 0 ? 'f50' : fromEnd === 1 ? 'f30' : fromEnd === 2 ? 'f14' : 'f08';
      const base = kind === 'idea' ? '/panel/chats/idea/' : '/panel/chats/assistant/';
      return { title: c.title, when: c.when, project: c.project, fade, href: base + c.id };
    });
  }

  app.get('/panel/chats/idea', guard, asyncRoute(async function (req, res) {
    const user = res.locals.user;
    const rows = await rowsOf(user, 'idea');
    res.render('calm', {
      active: 'idea', heading: texts.t('nav.idea'), sub: texts.t('idea.sub'), rows,
      hello: rows.length ? '' : texts.t('idea.hello'), kind: 'idea', icon: 'lamp',
      placeholder: texts.t('idea.placeholder'), post: '/panel/chats/idea', start: '/panel/chats/idea/new', shots: []
    });
  }));
  app.get('/panel/chats/assistant', guard, asyncRoute(async function (req, res) {
    const user = res.locals.user;
    const rows = await rowsOf(user, 'assistant');
    res.render('calm', {
      active: 'assistant', heading: texts.t('nav.assistant'), sub: texts.t('assistant.sub'), rows,
      hello: rows.length ? '' : texts.t('assistant.hello'), kind: 'assistant', icon: 'box',
      placeholder: texts.t('assistant.placeholder'), post: '/panel/chats/assistant', start: '', shots: []
    });
  }));
  app.get('/panel/chats/image', guard, asyncRoute(async function (req, res) {
    const user = res.locals.user;
    const shots = await repo.shotsOf(user.id);
    res.render('calm', {
      active: 'image', heading: texts.t('nav.image'), sub: texts.t('image.sub'), rows: [], hello: '',
      kind: 'image', icon: 'cam', placeholder: texts.t('image.placeholder'), post: '/panel/chats/image', start: '', shots
    });
  }));

  async function newChat(user, kind, text) {
    const welcome = texts.t('idea.welcome', { name: user.firstName });
    const messages = [];
    if (text) messages.push({ role: 'user', type: 'text', text });
    if (kind === 'idea') messages.push({ role: 'assistant', type: 'text', text: welcome });
    const titles = { idea: texts.t('idea.freshTitle'), assistant: texts.t('assistant.freshTitle'), image: texts.t('assistant.freshTitle') };
    const chat = await repo.createChat({
      userId: user.id, kind, title: text || titles[kind] || titles.assistant,
      when: 'امروز', project: false, dash: false, list: true, messages, card: 1, answers: {}, done: false
    });
    const labels = { idea: 'یک ایده ساخت.', assistant: 'یک گفت‌وگوی طراحیار ساخت.', image: 'یک گفت‌وگوی تصویر ساخت.' };
    await repo.log(user.id, kind, user.firstName + ' ' + labels[kind]);
    return chat.id;
  }

  app.post('/panel/chats/idea', guard, csrf, asyncRoute(async function (req, res) {
    const id = await newChat(res.locals.user, 'idea', (req.body.text || '').trim());
    res.redirect('/panel/chats/idea/' + id);
  }));
  app.get('/panel/chats/idea/new', guard, asyncRoute(async function (req, res) {
    const id = await newChat(res.locals.user, 'idea', '');
    res.redirect('/panel/chats/idea/' + id);
  }));
  app.post('/panel/chats/assistant', guard, csrf, asyncRoute(async function (req, res) {
    const user = res.locals.user;
    const text = (req.body.text || '').trim();
    const id = await newChat(user, 'assistant', text);
    if (text) await repo.updateUser(user.id, { giftUsed: user.giftUsed + 1 });
    res.redirect('/panel/chats/assistant/' + id);
  }));
  app.post('/panel/chats/image', guard, csrf, asyncRoute(async function (req, res) {
    const id = await newChat(res.locals.user, 'image', (req.body.text || '').trim());
    res.redirect('/panel/chats/image/' + id);
  }));

  async function renderChat(req, res, chat) {
    const kind = chat.kind;
    let card = null;
    if (kind === 'idea' && !chat.done) {
      const cards = await repo.questionCards('idea');
      const spec = cards[chat.card - 1];
      if (spec) {
        card = Object.assign({
          side: false,
          picked: chat.answers,
          progress: {
            label: lib.faDigits(chat.card) + ' از ' + lib.faDigits(cards.length),
            pct: (cards.length ? Math.round(chat.card / cards.length * 100) : 0) + '%'
          }
        }, spec);
      }
    }
    if (kind === 'image') {
      const cards = await repo.questionCards('image');
      const spec = cards[chat.card - 1];
      if (spec) {
        card = { side: true, title: spec.title, chips: spec.chips, picked: {}, build: chat.card === cards.length && chat.answers[chat.card] };
      }
    }
    if (kind === 'assistant' && chat.showCard) {
      const cards = await repo.questionCards('assistant');
      const spec = cards[0];
      if (spec) card = { side: true, title: spec.title, chips: spec.chips, picked: {} };
    }
    const back = kind === 'idea' ? { href: '/panel/chats/idea', label: texts.t('nav.idea') } : null;
    const heading = kind === 'idea' ? texts.t('idea.freshTitle') : (kind === 'assistant' ? texts.t('nav.assistant') : texts.t('nav.image'));
    const active = kind === 'idea' ? 'idea' : (kind === 'assistant' ? 'assistant' : 'image');
    const placeholder = kind === 'assistant' ? texts.t('assistant.placeholder') : (kind === 'image' ? texts.t('image.placeholder') : texts.t('idea.composer'));
    res.render('chat', {
      active, heading, back, messages: chat.messages, card, placeholder, action: req.path,
      error: req.query.e === 'style' ? texts.t('idea.needStyle') : '', typing: false
    });
  }

  app.get('/panel/chats/:kind/:id', guard, asyncRoute(async function (req, res) {
    const chat = await repo.chatById(req.params.id, req.session.userId);
    if (!chat) return res.redirect('/panel/chats/' + req.params.kind);
    await renderChat(req, res, chat);
  }));

  app.post('/panel/chats/:kind/:id', guard, csrf, asyncRoute(async function (req, res) {
    const user = res.locals.user;
    const chat = await repo.chatById(req.params.id, user.id);
    if (!chat) return res.redirect('/panel');
    const back = '/panel/chats/' + chat.kind + '/' + chat.id;
    if (req.body.confirm && chat.kind === 'idea') {
      const cards = await repo.questionCards('idea');
      const spec = cards.find((item) => item.confirm) || cards[cards.length - 1] || {};
      const styleKey = spec.styleGroup || 'سبک خروجی';
      const countKey = spec.countGroup || 'تعداد نمونه';
      const style = chat.answers[styleKey];
      const countChip = chat.answers[countKey];
      if (!style || !countChip) return res.redirect(back + '?e=style');
      const latin = lib.toLatinDigits(countChip);
      const count = '1234'.indexOf(latin) + 1 || 4;
      const seq = await repo.nextSeq();
      const slug = 'p' + seq;
      await repo.saveProject({
        slug, userId: user.id, title: chat.title, when: 'امروز', stage: 'refine', shape: 'ring', home: false, list: true,
        summary: texts.t('idea.summary', { title: chat.title }),
        designs: repo.designs(count),
        blurb: [texts.t('idea.blurb1'), texts.t('idea.blurb2')],
        thread: []
      });
      chat.done = true;
      chat.project = true;
      chat.messages.push({ role: 'assistant', type: 'text', text: texts.t('idea.done', { title: chat.title }) });
      await repo.saveChat(chat);
      await repo.log(user.id, 'project', user.firstName + ' پروژهٔ «' + chat.title + '» را ساخت.');
      return res.redirect('/panel/projects/' + slug + '/refine');
    }
    if (req.body.build && chat.kind === 'image') {
      chat.messages.push({ role: 'assistant', type: 'text', text: texts.t('image.ready') });
      chat.messages.push({ role: 'assistant', type: 'photo', text: '' });
      await repo.addShot({ userId: user.id, project: !!chat.project, chatId: chat.id });
      const imageCards = await repo.questionCards('image');
      chat.card = imageCards.length + 1;
      await repo.saveChat(chat);
      await repo.log(user.id, 'image', user.firstName + ' یک تصویر ساخت.');
      return res.redirect(back);
    }
    const text = (req.body.text || req.body.chip || '').trim();
    if (!text) return res.redirect(back);
    const flowCards = await repo.questionCards(chat.kind === 'assistant' ? 'assistant' : chat.kind);
    const phrases = [];
    flowCards.forEach((spec) => (spec.suggest || []).forEach((phrase) => { if (phrases.indexOf(phrase) === -1) phrases.push(phrase); }));
    if (phrases.indexOf(text) !== -1) return res.redirect(back);
    chat.messages.push({ role: 'user', type: 'text', text });
    if (chat.kind === 'assistant') {
      await repo.updateUser(user.id, { giftUsed: Math.min(user.giftTotal, user.giftUsed + 1) });
      chat.messages.push({ role: 'assistant', type: 'text', text: texts.t('assistant.reply') });
      chat.showCard = false;
    } else if (chat.kind === 'idea') {
      const total = flowCards.length || 11;
      if (chat.card === total && req.body.group) chat.answers[req.body.group] = req.body.chip;
      else if (chat.card < total) { chat.answers[chat.card] = text; chat.card += 1; }
    } else if (chat.kind === 'image') {
      const total = flowCards.length || 3;
      if (chat.card <= total) {
        chat.answers[chat.card] = text;
        if (chat.card < total) chat.card += 1;
      }
    } else {
      chat.messages.push({ role: 'assistant', type: 'text', text: texts.t('image.generic') });
    }
    await repo.saveChat(chat);
    res.redirect(back);
  }));

  app.get('/panel/refine', guard, asyncRoute(async function (req, res) {
    const mine = await repo.projectsOf(res.locals.user.id);
    const map = (p) => {
      const now = repo.stageIndex(p.stage);
      return Object.assign({}, p, { now, fill: fill(now) });
    };
    res.render('refine-home', {
      pending: mine.filter((p) => p.stage === 'refine').map(map),
      picked: mine.filter((p) => p.designs && p.designs.some((d) => d.selected) && p.stage !== 'refine').map(map)
    });
  }));

  app.get('/panel/projects', guard, asyncRoute(async function (req, res) {
    const projects = (await repo.projectsOf(res.locals.user.id)).filter((p) => p.list !== false).map((p) => {
      const stage = p.listStage || p.stage;
      const now = repo.stageIndex(stage);
      const keys = ['idea', 'refine', 'assistant', 'image'];
      const links = [0, 1, 2, 3].map((i) => i < now ? '/panel/projects/' + p.slug + '?stage=' + keys[i] : '');
      return Object.assign({}, p, { now, fill: fill(now), links });
    });
    res.render('projects', { projects });
  }));

  app.get('/panel/projects/:slug', guard, asyncRoute(async function (req, res) {
    const p = await repo.projectBySlug(req.params.slug, req.session.userId);
    if (!p) return res.redirect('/panel/projects');
    const now = repo.stageIndex(p.stage);
    const names = [texts.t('stage.idea'), texts.t('stage.refine'), texts.t('stage.assistant'), texts.t('stage.image')];
    const icons = ['lamp', 'check', 'box', 'cam'];
    const keys = ['idea', 'refine', 'assistant', 'image'];
    const hrefs = keys.map((key) => '/panel/projects/' + p.slug + '/' + key);
    const steps = names.map((title, i) => {
      const state = i < now ? 'done' : i === now ? 'now' : 'wait';
      return { title, state, icon: icons[i], key: keys[i], href: hrefs[i], summary: p.summary, lines: p.blurb || ['', ''], designs: i === now ? p.designs : [] };
    });
    res.render('project', { project: p, steps, cont: hrefs[now] || hrefs[0], highlight: req.query.stage || '' });
  }));

  app.get('/panel/projects/:slug/refine', guard, asyncRoute(async function (req, res) {
    const p = await repo.projectBySlug(req.params.slug, req.session.userId);
    if (!p) return res.redirect('/panel/refine');
    if (!p.assistId) {
      const assist = await repo.createChat({
        userId: p.userId, kind: 'assistant', title: p.title, when: 'امروز', project: true, list: true, dash: false,
        messages: [
          { role: 'user', type: 'photo', text: '' },
          { role: 'assistant', type: 'text', text: texts.t('assistant.refineIntro') }
        ],
        card: 0, answers: {}, showCard: true, done: false
      });
      const image = await repo.createChat({
        userId: p.userId, kind: 'image', title: p.title, when: 'امروز', project: true, list: false, dash: false,
        messages: [
          { role: 'user', type: 'photo', text: '' },
          { role: 'assistant', type: 'text', text: texts.t('image.intro') }
        ],
        card: 1, answers: {}, done: false
      });
      p.assistId = assist.id;
      p.imageId = image.id;
      await repo.saveProject(p);
    }
    res.render('refine', {
      project: p, messages: p.thread || [], back: '/panel/chats/idea',
      assistId: p.assistId, imageId: p.imageId,
      share: req.protocol + '://' + req.get('host') + '/share/' + p.slug
    });
  }));
  app.post('/panel/projects/:slug/select', guard, csrf, asyncRoute(async function (req, res) {
    const p = await repo.projectBySlug(req.params.slug, req.session.userId);
    if (p) {
      p.designs.forEach((d) => { d.selected = String(d.number) === String(req.body.n); });
      await repo.saveProject(p);
    }
    res.redirect('/panel/projects/' + req.params.slug + '/refine');
  }));
  app.post('/panel/projects/:slug/refine', guard, csrf, asyncRoute(async function (req, res) {
    const p = await repo.projectBySlug(req.params.slug, req.session.userId);
    if (p && req.body.text) {
      p.thread = p.thread || [];
      p.thread.push({ role: 'user', text: req.body.text });
      p.thread.push({ role: 'assistant', text: texts.t('refine.got') });
      await repo.saveProject(p);
    }
    res.redirect('/panel/projects/' + req.params.slug + '/refine');
  }));
  app.post('/panel/projects/:slug/more', guard, csrf, asyncRoute(async function (req, res) {
    const p = await repo.projectBySlug(req.params.slug, req.session.userId);
    if (p) {
      p.thread = p.thread || [];
      p.thread.push({ role: 'assistant', text: texts.t('refine.more') });
      await repo.saveProject(p);
    }
    res.redirect('/panel/projects/' + req.params.slug + '/refine');
  }));
  app.get('/panel/projects/:slug/download', guard, function (req, res) {
    res.type('svg').send('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#F7F1E6"/><circle cx="200" cy="150" r="70" fill="none" stroke="#8A6F2C" stroke-width="3"/></svg>');
  });
  app.get('/panel/projects/:slug/:stage', guard, asyncRoute(async function (req, res) {
    if (req.params.stage === 'refine') return res.redirect('/panel/projects/' + req.params.slug + '/refine');
    const p = await repo.projectBySlug(req.params.slug, req.session.userId);
    if (!p) return res.redirect('/panel/projects');
    const kind = req.params.stage === 'idea' ? 'idea' : req.params.stage;
    const chats = await repo.chatsOf(p.userId, { kind, project: true });
    const chat = chats[0] || {
      messages: [{ role: 'assistant', type: 'text', text: p.summary }],
      kind: req.params.stage, id: 'tmp', card: 99, done: true, answers: {}, showCard: false
    };
    await renderChat(req, res, chat);
  }));

  app.get('/panel/courses', guard, asyncRoute(async function (req, res) {
    const user = res.locals.user;
    const en = await repo.enrollments(user.id);
    const all = await repo.coursesWithLessons();
    const courses = all.filter((c) => en[c.slug]).map((c) => {
      const pct = c.sessions.length ? Math.round((en[c.slug] || []).length / c.sessions.length * 100) : 0;
      return Object.assign({}, c, { pct: lib.faDigits(pct) + '٪' });
    });
    res.render('courses', { courses });
  }));
  app.get('/panel/courses/:slug', guard, function (req, res) { res.redirect('/panel/courses/' + req.params.slug + '/next'); });
  app.get('/panel/courses/:slug/:n', guard, asyncRoute(async function (req, res) {
    const user = res.locals.user;
    const course = await repo.courseBySlug(req.params.slug);
    const en = await repo.enrollments(user.id);
    const watched = en[req.params.slug];
    if (!course || !watched) return res.redirect('/panel/courses');
    const ordered = course.sessions;
    let current = req.params.n === 'next'
      ? (ordered.find((s) => watched.indexOf(s.n) === -1) || ordered[0])
      : (ordered.find((s) => s.n === +req.params.n) || ordered[0]);
    const idx = ordered.findIndex((s) => s.n === current.n);
    const pct = lib.faDigits(ordered.length ? Math.round(watched.length / ordered.length * 100) : 0) + '٪';
    res.render('course', {
      course, watched, current, pct,
      prev: idx > 0 ? ordered[idx - 1].n : 0,
      next: idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1].n : 0
    });
  }));
  app.post('/panel/courses/:slug/:n/seen', guard, asyncRoute(async function (req, res) {
    await repo.markSeen(req.session.userId, req.params.slug, +req.params.n);
    res.json({ ok: true });
  }));

  app.get('/panel/subscription', guard, asyncRoute(async function (req, res) {
    const user = res.locals.user;
    res.render('sub', { plans: await repo.plans(), giftLeft: repo.giftLeft(user) });
  }));
  app.get('/panel/subscription/success', guard, function (req, res) {
    const user = res.locals.user;
    if (!user.paidOk) return res.redirect('/panel/subscription');
    res.render('success', { name: user.subscription.name, end: user.subscription.end });
  });
  app.get('/panel/subscription/:code', guard, asyncRoute(async function (req, res) {
    const plan = await repo.planByCode(req.params.code);
    if (!plan || !plan.active) return res.redirect('/panel/subscription');
    const discount = req.session.discount && req.session.discount.plan === plan.code ? req.session.discount.amount : 0;
    res.render('checkout', {
      plan, discount, finalAmount: plan.price - discount,
      code: req.session.discount && req.session.discount.code,
      error: req.query.fail ? texts.t('sub.fail') : (req.query.bad ? texts.t('sub.badCode') : ''),
      ok: discount ? texts.t('sub.codeOk') : ''
    });
  }));
  app.post('/panel/subscription/:code/discount', guard, csrf, asyncRoute(async function (req, res) {
    const plan = await repo.planByCode(req.params.code);
    const offer = await repo.discount();
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!plan) return res.redirect('/panel/subscription');
    if (code !== String(offer.code || '').toUpperCase()) {
      req.session.discount = null;
      return res.redirect('/panel/subscription/' + plan.code + '?bad=1');
    }
    req.session.discount = { plan: plan.code, code, amount: Math.round(plan.price * offer.percent / 100) };
    res.redirect('/panel/subscription/' + plan.code);
  }));
  app.post('/panel/subscription/pay', guard, csrf, asyncRoute(async function (req, res) {
    const plan = await repo.planByCode(req.body.plan);
    const user = await repo.userById(req.session.userId);
    if (!plan) return res.redirect('/panel/subscription');
    const discount = req.session.discount && req.session.discount.plan === plan.code ? req.session.discount.amount : 0;
    if (process.env.PAYMENT_MOCK_RESULT === 'fail') {
      await repo.recordPurchase({
        userId: user.id, planCode: plan.code, planName: plan.name,
        amount: plan.price - discount, discount, discountCode: req.session.discount && req.session.discount.code,
        status: 'failed', note: ''
      });
      await repo.log(user.id, 'purchase_failed', 'پرداخت اشتراک ' + plan.name + ' انجام نشد.');
      return res.redirect('/panel/subscription/' + plan.code + '?fail=1');
    }
    await repo.grantPlan(user, plan);
    await repo.recordPurchase({
      userId: user.id, planCode: plan.code, planName: plan.name,
      amount: plan.price - discount, discount, discountCode: req.session.discount && req.session.discount.code,
      status: 'paid', note: ''
    });
    await repo.log(user.id, 'purchase', user.firstName + ' اشتراک ' + plan.name + ' را خرید.');
    req.session.discount = null;
    res.redirect('/panel/subscription/success');
  }));

  function settingsPage(req, res, extra) {
    const phone = extra && extra.newPhone != null ? extra.newPhone : (req.session.newPhone || '');
    res.render('settings', Object.assign({
      tab: 'account',
      showCurrent: req.session.authMethod !== 'otp',
      masked: lib.phoneMasked(res.locals.user.phone),
      changePhone: req.query.phone === '1',
      codeSent: req.query.code === '1',
      newPhone: phone,
      phoneShow: phone ? lib.phoneSpaced(phone) : '',
      error: '', ok: ''
    }, extra || {}));
  }

  app.get('/panel/settings', guard, function (req, res) {
    settingsPage(req, res);
  });
  app.post('/panel/settings/avatar', guard, function (req, res) {
    req.on('data', function () {});
    req.on('end', function () { res.redirect('/panel/settings'); });
  });
  app.post('/panel/settings/account', guard, csrf, asyncRoute(async function (req, res) {
    const user = res.locals.user;
    await repo.updateUser(user.id, {
      firstName: req.body.first || user.firstName,
      lastName: req.body.last || user.lastName,
      birth: { d: +req.body.d || user.birth.d, m: +req.body.m || user.birth.m, y: +req.body.y || user.birth.y }
    });
    if (req.body.newPhone) req.session.newPhone = lib.normalizePhone(req.body.newPhone);
    res.redirect('/panel/settings#account');
  }));
  app.post('/panel/settings/phone', guard, csrf, asyncRoute(async function (req, res) {
    const phone = lib.normalizePhone(req.body.newPhone || req.session.newPhone);
    if (!/^09\d{9}$/.test(phone)) return res.redirect('/panel/settings?phone=1');
    const sent = await otp.issue({ phone, purpose: 'phone', ip: clientIp(req) });
    if (!sent.ok) {
      req.session.newPhone = phone;
      return settingsPage(req, res, { changePhone: true, codeSent: false, newPhone: phone, error: otp.message(sent.reason) });
    }
    req.session.newPhone = phone;
    res.redirect('/panel/settings?phone=1&code=1');
  }));
  app.post('/panel/settings/phone/verify', guard, csrf, asyncRoute(async function (req, res) {
    const phone = req.session.newPhone;
    if (!phone) return res.redirect('/panel/settings?phone=1');
    const result = await otp.check({ phone, purpose: 'phone', code: otpDigits(req.body) });
    if (!result.ok) {
      return settingsPage(req, res, {
        changePhone: true, codeSent: true, newPhone: phone,
        phoneShow: lib.phoneSpaced(phone), error: otp.message(result.reason)
      });
    }
    const taken = await repo.userByPhone(phone);
    if (taken && taken.id !== req.session.userId) {
      return settingsPage(req, res, { changePhone: true, codeSent: false, newPhone: phone, error: texts.t('auth.errExists') });
    }
    await repo.updateUser(req.session.userId, { phone });
    await repo.log(req.session.userId, 'phone', 'شمارهٔ موبایل عوض شد.');
    req.session.newPhone = '';
    res.redirect('/panel/settings');
  }));
  app.post('/panel/settings/password', guard, csrf, asyncRoute(async function (req, res) {
    const user = res.locals.user;
    if (req.session.authMethod !== 'otp' && user.passwordHash && !(await repo.checkPassword(user, req.body.current))) {
      return settingsPage(req, res, { tab: 'password', error: texts.t('auth.errBadPass') });
    }
    const passError = passwordPairError(req.body.next, req.body.again);
    if (passError) return settingsPage(req, res, { tab: 'password', error: passError });
    await repo.setPassword(user.id, req.body.next);
    req.session.authMethod = 'password';
    await repo.log(user.id, 'password', 'رمز عبور عوض شد.');
    res.redirect('/panel/settings#password');
  }));
  app.post('/panel/settings/appearance', guard, csrf, asyncRoute(async function (req, res) {
    await repo.updateUser(req.session.userId, { theme: req.body.theme === 'dark' ? 'dark' : 'light' });
    res.redirect('/panel/settings#appearance');
  }));
  app.post('/panel/theme', guard, csrf, asyncRoute(async function (req, res) {
    const user = res.locals.user;
    await repo.updateUser(user.id, { theme: user.theme === 'dark' ? 'light' : 'dark' });
    res.redirect(req.get('referer') || '/panel');
  }));
  app.post('/panel/settings/notifications', guard, csrf, asyncRoute(async function (req, res) {
    const user = res.locals.user;
    if (req.body.key === 'sub') await repo.updateUser(user.id, { notifySubEnd: !user.notifySubEnd });
    if (req.body.key === 'session') await repo.updateUser(user.id, { notifyNewSession: !user.notifyNewSession });
    res.redirect('/panel/settings#notifications');
  }));

  require('./admin')(app, { asyncRoute, csrf });

  app.use(function (err, req, res, next) {
    console.error(err);
    if (res.headersSent) return next(err);
    res.status(500).type('text/plain').send(texts.t('common.serverError'));
  });
};
