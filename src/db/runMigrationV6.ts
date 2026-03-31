import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pool from '../config/database';

async function run(): Promise<void> {
  const sql = fs.readFileSync(path.join(__dirname, 'migration_v6.sql'), 'utf-8');
  try {
    await pool.query(sql);
    console.log('Migration v6 complete: skills, target_job_titles, job_types, summary added to users');
  } finally {
    await pool.end();
  }
}

run();
