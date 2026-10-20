// Entity column types are fixed when the module graph loads. The PostgreSQL
// suite points the whole process at the integration database.
process.env.DATABASE_URL = process.env.TEST_POSTGRES_URL || "postgres://localhost/postgres";
process.env.TZ = "UTC";
