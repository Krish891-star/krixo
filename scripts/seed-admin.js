import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Admin } from '../server/models.js';

const { MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!MONGODB_URI || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Missing MONGODB_URI, ADMIN_EMAIL or ADMIN_PASSWORD in .env');
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 12) {
  console.error('ADMIN_PASSWORD must be at least 12 characters.');
  process.exit(1);
}
const email = ADMIN_EMAIL.toLowerCase();
await mongoose.connect(MONGODB_URI, { family: 4 });
try {
  const existing = await Admin.findOne({ email }).lean();
  if (existing) {
    console.log('Admin account already exists; leaving its password and role unchanged.');
  } else {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await Admin.create({ email, passwordHash, role: 'admin' });
    console.log('Admin account created.');
  }
} finally {
  await mongoose.disconnect();
}
