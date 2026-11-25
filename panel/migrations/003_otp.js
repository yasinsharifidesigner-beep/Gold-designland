exports.up = async function (knex) {
  await knex.schema.createTable('otp_codes', (t) => {
    t.increments('id');
    t.string('phone', 20).notNullable();
    t.string('purpose', 20).notNullable();
    t.string('code_hash').notNullable().defaultTo('');
    t.string('salt').notNullable().defaultTo('');
    t.integer('attempts').notNullable().defaultTo(0);
    t.bigInteger('expires_at').notNullable();
    t.bigInteger('created_at').notNullable();
    t.string('ip', 64).nullable();
    t.boolean('sent').notNullable().defaultTo(false);
    t.boolean('consumed').notNullable().defaultTo(false);
    t.index(['phone', 'created_at']);
    t.index(['phone', 'purpose']);
    t.index(['ip', 'created_at']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('otp_codes');
};
