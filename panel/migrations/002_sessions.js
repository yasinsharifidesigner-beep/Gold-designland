exports.up = async function (knex) {
  for (const name of ['sessions', 'admin_sessions']) {
    const exists = await knex.schema.hasTable(name);
    if (exists) continue;
    await knex.schema.createTable(name, (table) => {
      table.string('sid').primary();
      table.text('sess').notNullable();
      table.timestamp('expired').index();
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('admin_sessions');
  await knex.schema.dropTableIfExists('sessions');
};
