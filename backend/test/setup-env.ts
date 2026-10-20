// Entity column types are fixed when the module graph loads. Tests use the
// SQLite layout; individual fixtures then point DATABASE_URL at their own file.
process.env.DATABASE_URL = "sqlite:///./test-column-types.sqlite3";
