require('dotenv').config();

module.exports = {
  REDIS_URL: process.env.REDIS_URL || '',
  REDIS_TOKEN: process.env.REDIS_TOKEN || '',
  SHEETS_ID: process.env.SHEETS_ID || '',
  GOOGLE_CREDS_JSON: process.env.GOOGLE_CREDS_JSON || '{}',
  PANEL_PASSWORD: process.env.PANEL_PASSWORD || '',
  PORT: process.env.PORT || 10000,
};
