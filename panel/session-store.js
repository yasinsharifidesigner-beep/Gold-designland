const session = require('express-session');

const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;

class DbSessionStore extends session.Store {
  constructor(knex, tableName) {
    super();
    this.knex = knex;
    this.table = tableName;
  }

  get(sid, cb) {
    this.knex(this.table).where({ sid }).first().then((row) => {
      if (!row) return cb(null, null);
      if (row.expired && new Date(row.expired).getTime() <= Date.now()) {
        return this.knex(this.table).where({ sid }).del().then(() => cb(null, null));
      }
      const data = typeof row.sess === 'string' ? JSON.parse(row.sess) : row.sess;
      cb(null, data);
    }).catch(cb);
  }

  set(sid, sess, cb) {
    const maxAge = sess.cookie && sess.cookie.maxAge;
    const expired = sess.cookie && sess.cookie.expires
      ? new Date(sess.cookie.expires)
      : new Date(Date.now() + (maxAge || TWO_WEEKS));
    const payload = JSON.stringify(sess);
    this.knex(this.table)
      .insert({ sid, sess: payload, expired })
      .onConflict('sid')
      .merge({ sess: payload, expired })
      .then(() => cb && cb())
      .catch(cb);
  }

  destroy(sid, cb) {
    this.knex(this.table).where({ sid }).del().then(() => cb && cb()).catch(cb);
  }

  touch(sid, sess, cb) {
    this.set(sid, sess, cb);
  }
}

module.exports = DbSessionStore;
