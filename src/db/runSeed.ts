import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pool from '../config/database';

async function runSeed(): Promise<void> {
  const sql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf-8');
  try {
    await pool.query(sql);
    console.log('Seed data inserted');
  } finally {
    await pool.end();
  }
}

runSeed();
