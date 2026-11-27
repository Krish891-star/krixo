import mongoose from 'mongoose';

const guideSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 140 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  excerpt: { type: String, required: true, maxlength: 320 },
  body: { type: String, required: true, maxlength: 30000 },
  category: { type: String, default: 'Guides', maxlength: 50 },
  published: { type: Boolean, default: false },
  seoTitle: { type: String, maxlength: 160 },
  seoDescription: { type: String, maxlength: 320 }
}, { timestamps: true });

const presetSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  category: { type: String, enum: ['photo', 'signature', 'thumb', 'document'], default: 'photo' },
  width: { type: Number, min: 1, max: 10000 },
  height: { type: Number, min: 1, max: 10000 },
  minKB: { type: Number, min: 0, max: 50000 },
  maxKB: { type: Number, min: 1, max: 50000 },
  format: { type: String, enum: ['jpg', 'png', 'webp', 'pdf'], default: 'jpg' },
  notes: { type: String, maxlength: 500 },
  sourceUrl: { type: String, maxlength: 1000 },
  checkedAt: { type: Date },
  published: { type: Boolean, default: false }
}, { timestamps: true });

const feedbackSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 100 },
  email: { type: String, trim: true, lowercase: true, maxlength: 180 },
  type: { type: String, enum: ['bug', 'idea', 'other'], default: 'other' },
  message: { type: String, required: true, maxlength: 3000 },
  status: { type: String, enum: ['new', 'reviewed', 'closed'], default: 'new' }
}, { timestamps: true });

const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'admin' }
}, { timestamps: true });

export const Guide = mongoose.models.Guide || mongoose.model('Guide', guideSchema);
export const Preset = mongoose.models.Preset || mongoose.model('Preset', presetSchema);
export const Feedback = mongoose.models.Feedback || mongoose.model('Feedback', feedbackSchema);
export const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);
