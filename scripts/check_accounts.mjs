import { Database } from '../packages/db/src/database.js';
const db = new Database({ dbPath: './data/youpi_pg.sqlite' });
const accounts = db.query("SELECT * FROM payment_receiving_accounts LIMIT 5");
console.log('Receiving accounts:', JSON.stringify(accounts, null, 2));
db.close();
