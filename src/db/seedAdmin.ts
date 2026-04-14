import 'dotenv/config';
import pool from '../config/database';

const email = process.env.ADMIN_EMAIL;

async function run(): Promise<void> {
  if (!email) {
    console.error('Error: ADMIN_EMAIL environment variable is required');
    process.exit(1);
  }

  try {
    const result = await pool.query(
      `UPDATE users SET role = 'admin' WHERE email = $1 RETURNING id, email, role`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      console.error(`No user found with email: ${email}`);
      process.exit(1);
    }

    console.log(`Admin role granted to: ${result.rows[0].email}`);
  } finally {
    await pool.end();
  }
}

run();
