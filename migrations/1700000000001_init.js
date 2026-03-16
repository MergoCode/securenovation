/* eslint-disable camelcase */

export const shorthands = {
  id: {
    type: "serial",
    primaryKey: true,
  },
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export function up(pgm) {
  pgm.createTable("users", {
    id: "id",
    uid: { type: "text", notNull: true, unique: true },
    username: { type: "text", notNull: true },
    is_admin: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createTable("logs", {
    id: "id",
    event: { type: "text", notNull: true },
    timestamp: { type: "timestamptz", notNull: true },
    nfc_id: { type: "text" },
    message: { type: "text" },
  });

  pgm.createTable("lock_status", {
    id: "id",
    status: { type: "boolean", notNull: true },
    message: { type: "text" },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  // initial lock status: locked
  pgm.sql(
    "INSERT INTO lock_status (status, message) VALUES (false, 'Initial locked state');",
  );
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export function down(pgm) {
  pgm.dropTable("lock_status");
  pgm.dropTable("logs");
  pgm.dropTable("users");
}

