import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pool from '../config/database';

async function runSchema(): Promise<void> {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  try {
    await pool.query(sql);
    console.log('Schema applied');
  } finally {
    await pool.end();
  }
}

runSchema();
