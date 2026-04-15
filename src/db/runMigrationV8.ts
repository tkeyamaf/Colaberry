import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pool from '../config/database';

async function run(): Promise<void> {
  const sql = fs.readFileSync(path.join(__dirname, 'migration_v8.sql'), 'utf-8');
  try {
    await pool.query(sql);
    console.log('Migration v8 complete: discovery_runs table created');
  } finally {
    await pool.end();
  }
}

run();
