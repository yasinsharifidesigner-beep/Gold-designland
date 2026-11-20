exports.up = async function up(knex) {
  await knex.schema.createTable('users', (t) => {
    t.string('id').primary();
    t.string('phone').notNullable().unique();
    t.string('first_name').notNullable().defaultTo('');
    t.string('last_name').notNullable().defaultTo('');
    t.integer('birth_d').notNullable().defaultTo(1);
    t.integer('birth_m').notNullable().defaultTo(1);
    t.integer('birth_y').notNullable().defaultTo(1370);
    t.string('password_hash').notNullable().defaultTo('');
    t.string('theme').notNullable().defaultTo('light');
    t.boolean('notify_sub_end').notNullable().defaultTo(true);
    t.boolean('notify_new_session').notNullable().defaultTo(true);
    t.integer('gift_total').notNullable().defaultTo(50);
    t.integer('gift_used').notNullable().defaultTo(0);
    t.integer('message_left').notNullable().defaultTo(50);
    t.integer('image_left').notNullable().defaultTo(0);
    t.boolean('paid_ok').notNullable().defaultTo(false);
    t.boolean('blocked').notNullable().defaultTo(false);
    t.string('avatar').nullable();
    t.string('sub_name').nullable();
    t.string('sub_code').nullable();
    t.string('sub_start').nullable();
    t.string('sub_end').nullable();
    t.string('sub_pct').nullable();
    t.float('sub_offset').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('projects', (t) => {
    t.increments('id');
    t.string('slug').notNullable().unique();
    t.string('user_id').notNullable().index();
    t.string('title').notNullable().defaultTo('');
    t.string('when_label').notNullable().defaultTo('');
    t.string('stage').notNullable().defaultTo('idea');
    t.string('list_stage').nullable();
    t.string('shape').notNullable().defaultTo('ring');
    t.text('summary').notNullable().defaultTo('');
    t.text('designs_json').notNullable().defaultTo('[]');
    t.text('blurb_json').notNullable().defaultTo('[]');
    t.text('thread_json').notNullable().defaultTo('[]');
    t.boolean('home').notNullable().defaultTo(false);
    t.boolean('list').notNullable().defaultTo(true);
    t.string('assist_chat_id').nullable();
    t.string('image_chat_id').nullable();
    t.integer('position').notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('chats', (t) => {
    t.string('id').primary();
    t.string('user_id').notNullable().index();
    t.string('kind').notNullable().index();
    t.string('title').notNullable().defaultTo('');
    t.string('when_label').notNullable().defaultTo('');
    t.boolean('project').notNullable().defaultTo(false);
    t.boolean('dash').notNullable().defaultTo(false);
    t.boolean('list').notNullable().defaultTo(false);
    t.integer('card').notNullable().defaultTo(1);
    t.text('answers_json').notNullable().defaultTo('{}');
    t.boolean('done').notNullable().defaultTo(false);
    t.boolean('show_card').notNullable().defaultTo(false);
    t.boolean('from_refine').notNullable().defaultTo(false);
    t.integer('position').notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('messages', (t) => {
    t.increments('id');
    t.string('chat_id').notNullable().index().references('id').inTable('chats').onDelete('CASCADE');
    t.string('role').notNullable();
    t.string('type').notNullable().defaultTo('text');
    t.text('text').notNullable().defaultTo('');
    t.integer('sort').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('images', (t) => {
    t.string('id').primary();
    t.string('user_id').notNullable().index();
    t.boolean('project').notNullable().defaultTo(false);
    t.string('chat_id').nullable();
    t.integer('position').notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('courses', (t) => {
    t.increments('id');
    t.string('slug').notNullable().unique();
    t.string('title').notNullable();
    t.text('description').notNullable().defaultTo('');
    t.integer('sort').notNullable().defaultTo(0);
    t.boolean('active').notNullable().defaultTo(true);
  });

  await knex.schema.createTable('lessons', (t) => {
    t.increments('id');
    t.integer('course_id').notNullable().references('id').inTable('courses').onDelete('CASCADE');
    t.integer('n').notNullable();
    t.string('title').notNullable();
    t.text('description').notNullable().defaultTo('');
    t.string('duration').notNullable().defaultTo('');
    t.string('video_url').notNullable().defaultTo('');
    t.string('access').notNullable().defaultTo('gift');
    t.integer('sort').notNullable().defaultTo(0);
    t.unique(['course_id', 'n']);
  });

  await knex.schema.createTable('enrollments', (t) => {
    t.increments('id');
    t.string('user_id').notNullable().index();
    t.integer('course_id').notNullable().references('id').inTable('courses').onDelete('CASCADE');
    t.unique(['user_id', 'course_id']);
  });

  await knex.schema.createTable('lesson_progress', (t) => {
    t.increments('id');
    t.string('user_id').notNullable().index();
    t.integer('lesson_id').notNullable().references('id').inTable('lessons').onDelete('CASCADE');
    t.unique(['user_id', 'lesson_id']);
  });

  await knex.schema.createTable('plans', (t) => {
    t.increments('id');
    t.string('code').notNullable().unique();
    t.string('name').notNullable();
    t.integer('price').notNullable().defaultTo(0);
    t.integer('message_count').notNullable().defaultTo(0);
    t.integer('image_count').notNullable().defaultTo(0);
    t.text('features_json').notNullable().defaultTo('[]');
    t.boolean('featured').notNullable().defaultTo(false);
    t.boolean('active').notNullable().defaultTo(true);
    t.integer('sort').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('user_subscriptions', (t) => {
    t.increments('id');
    t.string('user_id').notNullable().index();
    t.string('plan_code').nullable();
    t.string('name').notNullable().defaultTo('');
    t.string('start_label').notNullable().defaultTo('');
    t.string('end_label').notNullable().defaultTo('');
    t.string('pct').notNullable().defaultTo('');
    t.float('offset_val').notNullable().defaultTo(0);
    t.string('status').notNullable().defaultTo('active');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('purchases', (t) => {
    t.increments('id');
    t.string('user_id').notNullable().index();
    t.string('plan_code').nullable();
    t.string('plan_name').notNullable().defaultTo('');
    t.integer('amount').notNullable().defaultTo(0);
    t.integer('discount').notNullable().defaultTo(0);
    t.string('discount_code').nullable();
    t.string('status').notNullable().defaultTo('paid');
    t.text('note').notNullable().defaultTo('');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('texts', (t) => {
    t.string('key').primary();
    t.string('grp').notNullable().defaultTo('');
    t.string('label').notNullable().defaultTo('');
    t.text('value').notNullable().defaultTo('');
  });

  await knex.schema.createTable('questions', (t) => {
    t.increments('id');
    t.string('flow').notNullable().index();
    t.string('title').notNullable().defaultTo('');
    t.integer('sort').notNullable().defaultTo(0);
    t.integer('break_after').notNullable().defaultTo(0);
    t.boolean('confirm').notNullable().defaultTo(false);
    t.boolean('active').notNullable().defaultTo(true);
  });

  await knex.schema.createTable('question_options', (t) => {
    t.increments('id');
    t.integer('question_id').notNullable().references('id').inTable('questions').onDelete('CASCADE');
    t.string('group_label').notNullable().defaultTo('');
    t.string('group_role').notNullable().defaultTo('');
    t.integer('group_sort').notNullable().defaultTo(0);
    t.string('text').notNullable().defaultTo('');
    t.boolean('suggest').notNullable().defaultTo(false);
    t.integer('sort').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('activity', (t) => {
    t.increments('id');
    t.string('user_id').nullable().index();
    t.string('action').notNullable();
    t.string('summary').notNullable().defaultTo('');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index('created_at');
  });

  await knex.schema.createTable('settings', (t) => {
    t.string('key').primary();
    t.text('value').notNullable().defaultTo('');
  });

  await knex.schema.createTable('counters', (t) => {
    t.string('name').primary();
    t.integer('value').notNullable().defaultTo(0);
  });
};

exports.down = async function down(knex) {
  const tables = ['counters', 'settings', 'activity', 'question_options', 'questions', 'texts', 'purchases', 'user_subscriptions', 'plans', 'lesson_progress', 'enrollments', 'lessons', 'courses', 'images', 'messages', 'chats', 'projects', 'users'];
  for (const name of tables) await knex.schema.dropTableIfExists(name);
};
