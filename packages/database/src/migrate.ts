import { closeDatabase, getDatabase } from "./database.js";
import { migrateConfiguredDatabase } from "./migrations.js";

const database = await getDatabase();
await migrateConfiguredDatabase(database);
console.log(`GridFlow database migration complete (${database.kind}).`);
await closeDatabase();
