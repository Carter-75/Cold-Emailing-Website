const mongoose = require('mongoose');

const CronStateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  lastWindowKey: String,
  lockedUntil: Date,
  lastStartedAt: Date,
  lastFinishedAt: Date,
  lastRunAt: Date
}, { timestamps: true });

module.exports = mongoose.model('CronState', CronStateSchema);
