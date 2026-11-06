import { Database } from '../packages/db/src/database.js';
const db = new Database({ dbPath: './data/youpi_pg.sqlite' });
const schema = db.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='payment_sessions'");
console.log(JSON.stringify(schema, null, 2));
db.close();
