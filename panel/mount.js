const path = require('path');
const session = require('express-session');
const store = require('./store');
const lib = require('./lib');

const WELCOME = 'سلام {name} عزیز. با چند سؤال کوتاه، ایده‌ات رو با هم به یک طرح روشن می‌رسونیم. هر جا خواستی، به‌جای انتخاب گزینه‌ها خودت بنویس.';

function fill(now) {
  return ['0%', '33.333%', '66.667%', '100%'][now] || '0%';
}

module.exports = function mount(app) {
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use(session({
    secret: process.env.SESSION_SECRET || 'gdl-panel-dev',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }
  }));

  app.use(function (req, res, next) {
    res.locals.csrf = lib.csrfToken(req);
    res.locals.fa = lib.faDigits;
    res.locals.money = lib.faMoney;
    res.locals.months = lib.MONTHS;
    res.locals.user = req.session.userId ? store.userById(req.session.userId) : null;
    next();
  });

  function guard(req, res, next) {
    if (!req.session.userId) return res.redirect('/auth/login');
    next();
  }
  function csrf(req, res, next) {
    if (!lib.checkCsrf(req)) return res.status(403).send('نشست منقضی شد. صفحه را تازه کن.');
    next();
  }

  function authView(res, mode, extra) {
    res.render('auth', Object.assign({
      mode: mode,
      error: '',
      phone: '',
      phoneShow: '',
      left: 58,
      first: '',
      last: '',
      d: '',
      m: '',
      y: ''
    }, extra || {}));
  }

  function otpDigits(body) {
    return [0, 1, 2, 3, 4].map(function (i) {
      return lib.toLatinDigits((body && body['d' + i]) || '');
    }).join('');
  }

  function signupReady(req, step) {
    return !!(req.session.signup && req.session.signup.step >= step && req.session.signup.phone);
  }

  app.get('/auth/login', function (req, res) { authView(res, 'login'); });
  app.get('/auth/signup', function (req, res) {
    authView(res, 'signup1', { phone: (req.session.signup && req.session.signup.phone) || '' });
  });
  app.post('/auth/signup', csrf, function (req, res) {
    const phone = lib.normalizePhone(req.body.phone);
    if (!/^09\d{9}$/.test(phone)) return authView(res, 'signup1', { error: 'شماره درست نیست. مثل ۰۹۱۲۳۴۵۶۷۸۹ بنویس.', phone: req.body.phone });
    if (store.userByPhone(phone)) return authView(res, 'signup1', { error: 'این شماره قبلاً حساب دارد. از صفحهٔ ورود وارد شو.', phone: req.body.phone });
    req.session.signup = { phone: phone, step: 2 };
    req.session.otpUntil = Date.now() + 60000;
    res.redirect('/auth/signup/verify');
  });
  app.get('/auth/signup/verify', function (req, res) {
    if (!signupReady(req, 2)) return res.redirect('/auth/signup');
    authView(res, 'signup2', { phoneShow: lib.phoneSpaced(req.session.signup.phone), left: 58 });
  });
  app.post('/auth/signup/verify', csrf, function (req, res) {
    if (!signupReady(req, 2)) return res.redirect('/auth/signup');
    const code = otpDigits(req.body);
    if (code !== store.DEMO_CODE) {
      return authView(res, 'signup2', {
        error: 'کد درست نیست. دوباره امتحان کن.',
        phoneShow: lib.phoneSpaced(req.session.signup.phone),
        left: 58
      });
    }
    req.session.signup.step = 3;
    res.redirect('/auth/signup/profile');
  });
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
        error: 'نام، نام خانوادگی و تاریخ تولد را کامل کن.',
        first: req.body.first || '',
        last: req.body.last || '',
        d: req.body.d || '',
        m: req.body.m || '',
        y: req.body.y || ''
      });
    }
    Object.assign(req.session.signup, { first: first, last: last, d: d, m: m, y: y, step: 4 });
    res.redirect('/auth/signup/password');
  });
  app.get('/auth/signup/password', function (req, res) {
    if (!signupReady(req, 4)) return res.redirect('/auth/signup');
    authView(res, 'signup4');
  });
  app.post('/auth/signup/password', csrf, function (req, res) {
    if (!signupReady(req, 4)) return res.redirect('/auth/signup');
    if (!req.body.password || req.body.password !== req.body.again) return authView(res, 'signup4', { error: 'رمز و تکرارش یکی نیستند. هر دو را دوباره بنویس.' });
    const s = req.session.signup;
    if (store.userByPhone(s.phone)) {
      req.session.signup = null;
      return authView(res, 'signup1', { error: 'این شماره قبلاً حساب دارد. از صفحهٔ ورود وارد شو.', phone: s.phone });
    }
    const user = store.createUser({ phone: s.phone, firstName: s.first, lastName: s.last, birth: { d: s.d, m: s.m, y: s.y }, password: req.body.password });
    req.session.userId = user.id;
    req.session.authMethod = 'password';
    req.session.signup = null;
    res.redirect('/panel');
  });

  app.post('/auth/login', csrf, function (req, res) {
    const phone = lib.normalizePhone(req.body.phone);
    const user = store.userByPhone(phone);
    if (!/^09\d{9}$/.test(phone)) return authView(res, 'login', { error: 'شماره درست نیست. مثل ۰۹۱۲۳۴۵۶۷۸۹ بنویس.', phone: req.body.phone });
    if (!user) return authView(res, 'login', { error: 'حسابی با این شماره نیست. اول ثبت‌نام کن.', phone: req.body.phone });
    if (user.password !== req.body.password) return authView(res, 'login', { error: 'رمز درست نیست. دوباره امتحان کن یا با کد پیامکی وارد شو.', phone: req.body.phone });
    req.session.userId = user.id;
    req.session.authMethod = 'password';
    res.redirect('/panel');
  });

  app.get('/auth/forgot', function (req, res) { authView(res, 'forgot1', { phone: (req.session.forgot && req.session.forgot.phone) || '' }); });
  app.post('/auth/forgot', csrf, function (req, res) {
    const phone = lib.normalizePhone(req.body.phone);
    const user = store.userByPhone(phone);
    if (!user) return authView(res, 'forgot1', { error: 'حسابی با این شماره نیست. اول ثبت‌نام کن.', phone: req.body.phone });
    req.session.forgot = { phone, userId: user.id };
    res.redirect('/auth/forgot/code');
  });
  app.get('/auth/forgot/code', function (req, res) {
    if (!req.session.forgot || !req.session.forgot.phone) return res.redirect('/auth/forgot');
    authView(res, 'forgot2', { phoneShow: lib.phoneSpaced(req.session.forgot.phone), left: 58 });
  });
  app.post('/auth/forgot/verify', csrf, function (req, res) {
    if (!req.session.forgot || !req.session.forgot.phone) return res.redirect('/auth/forgot');
    const code = otpDigits(req.body);
    if (code !== store.DEMO_CODE) {
      return authView(res, 'forgot2', {
        error: 'کد درست نیست. دوباره امتحان کن.',
        phoneShow: lib.phoneSpaced(req.session.forgot.phone),
        left: 58
      });
    }
    req.session.userId = req.session.forgot.userId;
    req.session.authMethod = 'otp';
    req.session.forgot = null;
    res.redirect('/panel');
  });
  app.post('/auth/logout', csrf, function (req, res) {
    req.session.destroy(function () { res.redirect('/auth/login'); });
  });

  app.get('/panel', guard, function (req, res) {
    const user = store.userById(req.session.userId);
    const empty = !store.hasWork(user);
    const mine = store.db.projects.filter((p) => p.userId === user.id && p.home);
    const ideas = store.db.chats.filter((c) => c.userId === user.id && c.kind === 'idea' && c.dash);
    const asks = store.db.chats.filter((c) => c.userId === user.id && c.kind === 'assistant' && c.dash);
    const shots = store.db.shots.filter((s) => s.userId === user.id).slice(0, 4);
    res.render('dash', {
      empty, ideas, asks, shots, giftLeft: store.giftLeft(user),
      projects: mine.map(function (p) { const now = store.stageIndex(p.stage); return Object.assign({}, p, { now, fill: fill(now) }); })
    });
  });

  function rowsOf(user, kind) {
    const list = store.db.chats.filter((c) => c.userId === user.id && c.kind === kind && c.list);
    return list.map(function (c, i) {
      const fromEnd = list.length - 1 - i;
      const fade = fromEnd === 0 ? 'f50' : fromEnd === 1 ? 'f30' : fromEnd === 2 ? 'f14' : 'f08';
      const base = kind === 'idea' ? '/panel/chats/idea/' : '/panel/chats/assistant/';
      return { title: c.title, when: c.when, project: c.project, fade, href: base + c.id };
    });
  }

  app.get('/panel/chats/idea', guard, function (req, res) {
    const user = store.userById(req.session.userId);
    const rows = rowsOf(user, 'idea');
    res.render('calm', { active: 'ایده‌پردازی', heading: 'ایده‌پردازی', sub: 'ایده‌ات رو بنویس، یا فقط بگو ایده می‌خوای؛ با هم به یک طرح ارزشمند می‌رسیم.', rows, hello: rows.length ? '' : 'سلام! ایده‌ات رو بنویس تا با هم شروعش کنیم.', kind: 'idea', icon: 'lamp', placeholder: 'ایده یا درخواستت رو بنویس…', post: '/panel/chats/idea', start: '/panel/chats/idea/new', shots: [] });
  });
  app.get('/panel/chats/assistant', guard, function (req, res) {
    const user = store.userById(req.session.userId);
    const rows = rowsOf(user, 'assistant');
    res.render('calm', { active: 'طراحیار', heading: 'طراحیار', sub: 'طراحیت رو بنویس، یا فقط بگو چه مدلی می‌خوای؛ با هم به یک طرح ارزشمند می‌رسیم.', rows, hello: rows.length ? '' : 'سلام! هر سؤالی دربارهٔ طراحیت داری، همین‌جا بپرس.', kind: 'assistant', icon: 'box', placeholder: 'طراحیت یا درخواستت رو بنویس…', post: '/panel/chats/assistant', start: '', shots: [] });
  });
  app.get('/panel/chats/image', guard, function (req, res) {
    const user = store.userById(req.session.userId);
    const shots = store.db.shots.filter((s) => s.userId === user.id);
    res.render('calm', { active: 'ساخت تصویر', heading: 'ساخت تصویر', sub: 'تصویری که در ذهنت داری رو بنویس، یا عکس طرحت رو بفرست؛ با هم یک تصویر زیبا می‌سازیم.', rows: [], hello: '', kind: 'image', icon: 'cam', placeholder: 'تصویری که می‌خوای رو بنویس…', post: '/panel/chats/image', start: '', shots });
  });

  function newChat(user, kind, text) {
    const id = kind + '-' + (++store.db.seq);
    const welcome = WELCOME.replace('{name}', user.firstName);
    const messages = [];
    if (text) messages.push({ role: 'user', type: 'text', text });
    if (kind === 'idea') messages.push({ role: 'assistant', type: 'text', text: welcome });
    store.db.chats.push({
      id, userId: user.id, kind, title: text || (kind === 'idea' ? 'ایده‌پردازی تازه' : 'گفت‌وگوی تازه'),
      when: 'امروز', project: false, dash: false, list: true, messages, card: 1, answers: {}, done: false
    });
    return id;
  }

  app.post('/panel/chats/idea', guard, csrf, function (req, res) {
    const id = newChat(store.userById(req.session.userId), 'idea', (req.body.text || '').trim());
    res.redirect('/panel/chats/idea/' + id);
  });
  app.get('/panel/chats/idea/new', guard, function (req, res) {
    const id = newChat(store.userById(req.session.userId), 'idea', '');
    res.redirect('/panel/chats/idea/' + id);
  });
  app.post('/panel/chats/assistant', guard, csrf, function (req, res) {
    const user = store.userById(req.session.userId);
    const id = newChat(user, 'assistant', (req.body.text || '').trim());
    if ((req.body.text || '').trim()) user.giftUsed += 1;
    res.redirect('/panel/chats/assistant/' + id);
  });
  app.post('/panel/chats/image', guard, csrf, function (req, res) {
    const id = newChat(store.userById(req.session.userId), 'image', (req.body.text || '').trim());
    res.redirect('/panel/chats/image/' + id);
  });

  function renderChat(req, res, chat) {
    const user = store.userById(req.session.userId);
    const kind = chat.kind;
    let card = null;
    if (kind === 'idea' && !chat.done) {
      const spec = store.IDEA_CARDS[chat.card - 1];
      card = Object.assign({ side: false, picked: chat.answers, progress: { label: lib.faDigits(chat.card) + ' از ۱۱', pct: Math.round(chat.card / 11 * 100) + '%' } }, spec);
    }
    if (kind === 'image' && chat.card >= 1 && chat.card <= 3) {
      const spec = store.IMAGE_CARDS[chat.card - 1];
      card = { side: true, title: spec.title, chips: spec.chips, picked: {}, build: chat.card === 3 && chat.answers[3] };
    }
    if (kind === 'assistant' && chat.showCard) {
      card = { side: true, title: store.ASSIST_CARD.title, chips: store.ASSIST_CARD.chips, picked: {} };
    }
    const back = kind === 'idea' ? { href: '/panel/chats/idea', label: 'ایده‌پردازی' } : null;
    const heading = kind === 'idea' ? 'ایده‌پردازی تازه' : (kind === 'assistant' ? 'طراحیار' : 'ساخت تصویر');
    const active = kind === 'idea' ? 'ایده‌پردازی' : (kind === 'assistant' ? 'طراحیار' : 'ساخت تصویر');
    const placeholder = kind === 'assistant' ? 'طراحیت یا درخواستت رو بنویس…' : (kind === 'image' ? 'تصویری که می‌خوای رو بنویس…' : 'یا هر چی در ذهنت هست رو بنویس…');
    res.render('chat', { active, heading, back, messages: chat.messages, card, placeholder, action: req.path, error: req.query.e || '', typing: false });
  }

  app.get('/panel/chats/:kind/:id', guard, function (req, res) {
    const chat = store.db.chats.find((c) => c.id === req.params.id && c.userId === req.session.userId);
    if (!chat) return res.redirect('/panel/chats/' + req.params.kind);
    renderChat(req, res, chat);
  });

  app.post('/panel/chats/:kind/:id', guard, csrf, function (req, res) {
    const user = store.userById(req.session.userId);
    const chat = store.db.chats.find((c) => c.id === req.params.id && c.userId === user.id);
    if (!chat) return res.redirect('/panel');
    const back = '/panel/chats/' + chat.kind + '/' + chat.id;
    if (req.body.confirm && chat.kind === 'idea') {
      const style = chat.answers['سبک خروجی'];
      const countChip = chat.answers['تعداد نمونه'];
      if (!style || !countChip) return res.redirect(back + '?e=' + encodeURIComponent('سبک خروجی و تعداد نمونه را انتخاب کن.'));
      const count = '۱۲۳۴'.indexOf(countChip) + 1 || 4;
      const slug = 'p' + (++store.db.seq);
      store.db.projects.push({
        slug, userId: user.id, title: chat.title, when: 'امروز', stage: 'refine', shape: 'ring', home: false, list: true,
        summary: 'ایدهٔ اولیه: ' + chat.title + '.',
        designs: store.designs(count),
        blurb: ['نمونه‌ها ساخته شد.', 'انتخاب روی مدل ۱ است.']
      });
      chat.done = true;
      chat.project = true;
      chat.messages.push({ role: 'assistant', type: 'text', text: 'ایده‌ات روشن شد: ' + chat.title + '. حالا طرح‌ها را ببین و یکی را انتخاب کن.' });
      return res.redirect('/panel/projects/' + slug + '/refine');
    }
    if (req.body.build && chat.kind === 'image') {
      chat.messages.push({ role: 'assistant', type: 'text', text: 'تصویرها آماده شد.' });
      chat.messages.push({ role: 'assistant', type: 'photo', text: '' });
      const shot = { id: 'shot-' + (++store.db.seq), userId: user.id, project: !!chat.project, chatId: chat.id };
      store.db.shots.unshift(shot);
      chat.card = 4;
      return res.redirect(back);
    }
    const text = (req.body.text || req.body.chip || '').trim();
    if (!text) return res.redirect(back);
    if (text === 'خودت پیشنهاد بده') return res.redirect(back);
    chat.messages.push({ role: 'user', type: 'text', text });
    if (chat.kind === 'assistant') {
      user.giftUsed = Math.min(user.giftTotal, user.giftUsed + 1);
      chat.messages.push({ role: 'assistant', type: 'text', text: 'باشه. قدم بعدی را با هم برمی‌داریم.' });
      chat.showCard = false;
    } else if (chat.kind === 'idea' && chat.card <= 11) {
      if (chat.card === 11 && req.body.group) chat.answers[req.body.group] = req.body.chip;
      else if (chat.card < 11) { chat.answers[chat.card] = text; chat.card += 1; }
    } else if (chat.kind === 'image' && chat.card <= 3) {
      chat.answers[chat.card] = text;
      if (chat.card < 3) chat.card += 1;
    } else {
      chat.messages.push({ role: 'assistant', type: 'text', text: 'نوشته‌ات را دیدم و در طرح بعدی در نظر می‌گیرم.' });
    }
    res.redirect(back);
  });

  app.get('/panel/refine', guard, function (req, res) {
    const user = store.userById(req.session.userId);
    const mine = store.db.projects.filter((p) => p.userId === user.id);
    const map = (p) => { const now = store.stageIndex(p.stage); return Object.assign({}, p, { now, fill: fill(now) }); };
    res.render('refine-home', {
      pending: mine.filter((p) => p.stage === 'refine').map(map),
      picked: mine.filter((p) => p.designs && p.designs.some((d) => d.selected) && p.stage !== 'refine').map(map)
    });
  });

  app.get('/panel/projects', guard, function (req, res) {
    const user = store.userById(req.session.userId);
    const projects = store.db.projects.filter((p) => p.userId === user.id && p.list !== false).map(function (p) {
      const stage = p.listStage || p.stage;
      const now = store.stageIndex(stage);
      const keys = ['idea', 'refine', 'assistant', 'image'];
      const links = [0, 1, 2, 3].map((i) => i < now ? '/panel/projects/' + p.slug + '?stage=' + keys[i] : '');
      return Object.assign({}, p, { now, fill: fill(now), links });
    });
    res.render('projects', { projects });
  });

  app.get('/panel/projects/:slug', guard, function (req, res) {
    const p = store.db.projects.find((x) => x.slug === req.params.slug && x.userId === req.session.userId);
    if (!p) return res.redirect('/panel/projects');
    const now = store.stageIndex(p.stage);
    const names = ['ایده‌پردازی', 'اصلاح و انتخاب طرح', 'طراحیار', 'ساخت تصویر'];
    const icons = ['lamp', 'check', 'box', 'cam'];
    const keys = ['idea', 'refine', 'assistant', 'image'];
    const hrefs = ['/panel/projects/' + p.slug + '/idea', '/panel/projects/' + p.slug + '/refine', '/panel/projects/' + p.slug + '/assistant', '/panel/projects/' + p.slug + '/image'];
    const steps = names.map(function (title, i) {
      const state = i < now ? 'done' : i === now ? 'now' : 'wait';
      return { title, state, icon: icons[i], key: keys[i], href: hrefs[i], summary: p.summary, lines: p.blurb || ['', ''], designs: i === now ? p.designs : [] };
    });
    const cont = hrefs[now] || hrefs[0];
    res.render('project', { project: p, steps, cont, highlight: req.query.stage || '' });
  });

  app.get('/panel/projects/:slug/refine', guard, function (req, res) {
    const p = store.db.projects.find((x) => x.slug === req.params.slug && x.userId === req.session.userId);
    if (!p) return res.redirect('/panel/refine');
    if (!p.assistId) {
      p.assistId = 'asst-' + (++store.db.seq);
      store.db.chats.push({ id: p.assistId, userId: p.userId, kind: 'assistant', title: p.title, when: 'امروز', project: true, list: true, dash: false, messages: [{ role: 'user', type: 'photo', text: '' }, { role: 'assistant', type: 'text', text: 'طرحت رسید و خیلی قشنگه!\nبگو کجای این طرح رو می‌خوای تغییر بدی، یا چه سؤالی داری، تا با هم کاملش کنیم.' }], card: 0, answers: {}, showCard: true, done: false });
      p.imageId = 'image-' + (++store.db.seq);
      store.db.chats.push({ id: p.imageId, userId: p.userId, kind: 'image', title: p.title, when: 'امروز', project: true, list: false, dash: false, messages: [{ role: 'user', type: 'photo', text: '' }, { role: 'assistant', type: 'text', text: 'طرحت رسید! بگو تصویرش رو چطور بسازیم.' }], card: 1, answers: {}, done: false });
    }
    res.render('refine', { project: p, messages: p.thread || [], back: '/panel/chats/idea', assistId: p.assistId, imageId: p.imageId, share: req.protocol + '://' + req.get('host') + '/share/' + p.slug });
  });
  app.post('/panel/projects/:slug/select', guard, csrf, function (req, res) {
    const p = store.db.projects.find((x) => x.slug === req.params.slug && x.userId === req.session.userId);
    if (p) p.designs.forEach((d) => { d.selected = String(d.number) === String(req.body.n); });
    res.redirect('/panel/projects/' + req.params.slug + '/refine');
  });
  app.post('/panel/projects/:slug/refine', guard, csrf, function (req, res) {
    const p = store.db.projects.find((x) => x.slug === req.params.slug && x.userId === req.session.userId);
    if (p && req.body.text) {
      p.thread = p.thread || [];
      p.thread.push({ role: 'user', text: req.body.text });
      p.thread.push({ role: 'assistant', text: 'خواسته‌ات را گرفتم. اگر همین باشد، نمونه‌های تازه را می‌سازم.' });
    }
    res.redirect('/panel/projects/' + req.params.slug + '/refine');
  });
  app.post('/panel/projects/:slug/more', guard, csrf, function (req, res) {
    const p = store.db.projects.find((x) => x.slug === req.params.slug && x.userId === req.session.userId);
    if (p) {
      p.thread = p.thread || [];
      p.thread.push({ role: 'assistant', text: 'می‌خوای خود طرح عوض شود یا فقط سبک تصویر؟ هر چه در ذهن داری بنویس.' });
    }
    res.redirect('/panel/projects/' + req.params.slug + '/refine');
  });
  app.get('/panel/projects/:slug/download', guard, function (req, res) {
    res.type('svg').send('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#F7F1E6"/><circle cx="200" cy="150" r="70" fill="none" stroke="#8A6F2C" stroke-width="3"/></svg>');
  });
  app.get('/panel/projects/:slug/:stage', guard, function (req, res) {
    if (req.params.stage === 'refine') return res.redirect('/panel/projects/' + req.params.slug + '/refine');
    const p = store.db.projects.find((x) => x.slug === req.params.slug && x.userId === req.session.userId);
    if (!p) return res.redirect('/panel/projects');
    const chat = store.db.chats.find((c) => c.userId === p.userId && c.kind === (req.params.stage === 'idea' ? 'idea' : req.params.stage) && c.project) || { messages: [{ role: 'assistant', type: 'text', text: p.summary }], kind: req.params.stage, id: 'tmp', card: 99, done: true, answers: {} };
    renderChat(req, res, chat);
  });

  function courseOf(user, slug) {
    const course = store.db.courses.find((c) => c.slug === slug);
    const en = store.enrollments(user.id)[slug];
    if (!course || !en) return null;
    return { course, watched: en };
  }
  app.get('/panel/courses', guard, function (req, res) {
    const user = store.userById(req.session.userId);
    const en = store.enrollments(user.id);
    const courses = store.db.courses.filter((c) => en[c.slug]).map((c) => {
      const pct = Math.round(en[c.slug].length / c.sessions.length * 100);
      return Object.assign({}, c, { pct: lib.faDigits(pct) + '٪' });
    });
    res.render('courses', { courses });
  });
  app.get('/panel/courses/:slug', guard, function (req, res) { res.redirect('/panel/courses/' + req.params.slug + '/next'); });
  app.get('/panel/courses/:slug/:n', guard, function (req, res) {
    const user = store.userById(req.session.userId);
    const found = courseOf(user, req.params.slug);
    if (!found) return res.redirect('/panel/courses');
    let n = req.params.n === 'next' ? (found.course.sessions.find((s) => !found.watched.includes(s.n)) || found.course.sessions[0]).n : +req.params.n;
    const current = found.course.sessions.find((s) => s.n === n) || found.course.sessions[0];
    const pct = lib.faDigits(Math.round(found.watched.length / found.course.sessions.length * 100)) + '٪';
    res.render('course', { course: found.course, watched: found.watched, current, pct, prev: current.n > 1 ? current.n - 1 : 0, next: current.n < found.course.sessions.length ? current.n + 1 : 0 });
  });
  app.post('/panel/courses/:slug/:n/seen', guard, function (req, res) {
    const en = store.enrollments(req.session.userId)[req.params.slug];
    const n = +req.params.n;
    if (en && !en.includes(n)) en.push(n);
    res.json({ ok: true });
  });

  app.get('/panel/subscription', guard, function (req, res) {
    const user = store.userById(req.session.userId);
    res.render('sub', { plans: store.db.plans, giftLeft: store.giftLeft(user) });
  });
  app.get('/panel/subscription/success', guard, function (req, res) {
    const user = store.userById(req.session.userId);
    if (!user.paidOk) return res.redirect('/panel/subscription');
    res.render('success', { name: user.subscription.name, end: user.subscription.end });
  });
  app.get('/panel/subscription/:code', guard, function (req, res) {
    const plan = store.db.plans.find((p) => p.code === req.params.code);
    if (!plan) return res.redirect('/panel/subscription');
    const discount = req.session.discount && req.session.discount.plan === plan.code ? req.session.discount.amount : 0;
    res.render('checkout', { plan, discount, finalAmount: plan.price - discount, code: req.session.discount && req.session.discount.code, error: req.query.fail ? 'پرداخت انجام نشد. می‌توانی دوباره تلاش کنی.' : (req.query.bad ? 'این کد تخفیف معتبر نیست.' : ''), ok: discount ? 'کد تخفیف اعمال شد.' : '' });
  });
  app.post('/panel/subscription/:code/discount', guard, csrf, function (req, res) {
    const plan = store.db.plans.find((p) => p.code === req.params.code);
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!plan) return res.redirect('/panel/subscription');
    if (code !== store.db.discount.code) {
      req.session.discount = null;
      return res.redirect('/panel/subscription/' + plan.code + '?bad=1');
    }
    req.session.discount = { plan: plan.code, code, amount: Math.round(plan.price * store.db.discount.percent / 100) };
    res.redirect('/panel/subscription/' + plan.code);
  });
  app.post('/panel/subscription/pay', guard, csrf, function (req, res) {
    const plan = store.db.plans.find((p) => p.code === req.body.plan);
    const user = store.userById(req.session.userId);
    if (!plan) return res.redirect('/panel/subscription');
    if (process.env.PAYMENT_MOCK_RESULT === 'fail') return res.redirect('/panel/subscription/' + plan.code + '?fail=1');
    user.subscription = { name: plan.name, code: plan.code, start: '۲۵ آبان ۱۴۰۵', end: '۲۵ آذر ۱۴۰۵', pct: '۸۰٪', offset: 19.5 };
    user.paidOk = true;
    res.redirect('/panel/subscription/success');
  });

  app.get('/panel/settings', guard, function (req, res) {
    const tab = (req.query.phone ? 'account' : String(req.url.split('#')[1] || 'account'));
    const hash = req.headers.referer || '';
    res.render('settings', {
      tab: 'account',
      showCurrent: req.session.authMethod !== 'otp',
      masked: lib.phoneMasked(store.userById(req.session.userId).phone),
      changePhone: req.query.phone === '1',
      codeSent: req.query.code === '1',
      newPhone: req.session.newPhone || '',
      phoneShow: req.session.newPhone ? lib.phoneSpaced(req.session.newPhone) : '',
      error: '', ok: ''
    });
  });
  app.post('/panel/settings/avatar', guard, function (req, res) {
    req.on('data', function () {});
    req.on('end', function () { res.redirect('/panel/settings'); });
  });
  app.post('/panel/settings/account', guard, csrf, function (req, res) {
    const user = store.userById(req.session.userId);
    user.firstName = req.body.first || user.firstName;
    user.lastName = req.body.last || user.lastName;
    user.birth = { d: +req.body.d || user.birth.d, m: +req.body.m || user.birth.m, y: +req.body.y || user.birth.y };
    if (req.body.newPhone) req.session.newPhone = lib.normalizePhone(req.body.newPhone);
    res.redirect('/panel/settings#account');
  });
  app.post('/panel/settings/phone', guard, csrf, function (req, res) {
    const phone = lib.normalizePhone(req.body.newPhone || req.session.newPhone);
    if (!/^09\d{9}$/.test(phone)) return res.redirect('/panel/settings?phone=1');
    req.session.newPhone = phone;
    res.redirect('/panel/settings?phone=1&code=1');
  });
  app.post('/panel/settings/phone/verify', guard, csrf, function (req, res) {
    const code = [0, 1, 2, 3, 4].map((i) => lib.toLatinDigits(req.body['d' + i] || '')).join('');
    if (code === store.DEMO_CODE && req.session.newPhone) store.userById(req.session.userId).phone = req.session.newPhone;
    req.session.newPhone = '';
    res.redirect('/panel/settings');
  });
  app.post('/panel/settings/password', guard, csrf, function (req, res) {
    const user = store.userById(req.session.userId);
    if (req.session.authMethod !== 'otp' && user.password && user.password !== req.body.current) return res.redirect('/panel/settings#password');
    if (!req.body.next || req.body.next !== req.body.again) return res.redirect('/panel/settings#password');
    user.password = req.body.next;
    req.session.authMethod = 'password';
    res.redirect('/panel/settings#password');
  });
  app.post('/panel/settings/appearance', guard, csrf, function (req, res) {
    store.userById(req.session.userId).theme = req.body.theme === 'dark' ? 'dark' : 'light';
    res.redirect('/panel/settings#appearance');
  });
  app.post('/panel/theme', guard, csrf, function (req, res) {
    const user = store.userById(req.session.userId);
    user.theme = user.theme === 'dark' ? 'light' : 'dark';
    res.redirect(req.get('referer') || '/panel');
  });
  app.post('/panel/settings/notifications', guard, csrf, function (req, res) {
    const user = store.userById(req.session.userId);
    if (req.body.key === 'sub') user.notifySubEnd = !user.notifySubEnd;
    if (req.body.key === 'session') user.notifyNewSession = !user.notifyNewSession;
    res.redirect('/panel/settings#notifications');
  });
};
