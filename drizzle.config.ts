import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit authors versioned SQL from the TS schema. Output goes to
 * src-tauri/migrations/ where the Rust tauri-plugin-sql migration list embeds
 * it (include_str!) and applies it at startup. drizzle-kit never touches the
 * live DB.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src-tauri/migrations',
});
