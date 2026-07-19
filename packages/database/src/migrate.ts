import { closeDatabase, getDatabase } from "./database.js";
import { migrateDatabase } from "./migrations.js";

const database = await getDatabase();
await migrateDatabase(database);
console.log(`GridFlow database migration complete (${database.kind}).`);
await closeDatabase();
