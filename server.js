require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const admin = require('firebase-admin');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

if (!admin.apps.length) {
  const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
  admin.initializeApp({
    credential: admin.credential.cert(firebaseConfig)
  });
}

const db = admin.firestore();
const SLEEP_COLLECTION = 'sleepLogs';
const FEEDING_COLLECTION = 'feedingLogs';
const DIAPER_COLLECTION = 'diaperLogs';
const MEDICATION_COLLECTION = 'medicationLogs';
const AUDIT_COLLECTION = 'auditLogs';
const DEVICE_TOKENS_COLLECTION = 'deviceTokens';

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_ATTEMPTS' }
});

app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
}));

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/'
  };
}

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });
}

function resolveCredential(username) {
  if (username === process.env.BABY_USENAME) {
    return { role: 'baby', hash: process.env.BABY_PASSWORD_HASH, userId: 'baby-marina' };
  }
  if (username === process.env.ADMIN_USENAME) {
    return { role: 'admin', hash: process.env.ADMIN_PASSWORD_HASH, userId: 'admin-owner' };
  }
  return null;
}

function authenticate(req, res, next) {
  const token = req.cookies && req.cookies.evano_token;
  if (!token) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'INVALID_TOKEN' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    next();
  };
}

function verifyCsrf(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.get('origin') || req.get('referer') || '';
    if (!origin) return res.status(403).json({ error: 'CSRF_ORIGIN_MISSING' });
    try {
      if (new URL(origin).host !== req.get('host')) {
        return res.status(403).json({ error: 'CSRF_ORIGIN_MISMATCH' });
      }
    } catch {
      return res.status(403).json({ error: 'CSRF_ORIGIN_INVALID' });
    }
  }
  next();
}

function sanitizeString(value, maxLen = 200) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t && t.length <= maxLen ? t : null;
}

async function writeAudit(action, actorId, actorRole, details) {
  try {
    await db.collection(AUDIT_COLLECTION).add({
      action, actorId, actorRole,
      details: details || {},
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.error('audit_write_failed', e.message);
  }
}

async function sendPushToRole(role, title, body, data) {
  try {
    const snap = await db.collection(DEVICE_TOKENS_COLLECTION)
      .where('role', '==', role)
      .get();
    if (snap.empty) return { sent: 0, failed: 0 };
    const tokens = snap.docs
      .map(d => d.data().token)
      .filter(t => typeof t === 'string' && t.length > 10);
    if (!tokens.length) return { sent: 0, failed: 0 };

    const message = {
      notification: { title, body },
      data: data || {},
      tokens: tokens
    };
    const response = await admin.messaging().sendEachForMulticast(message);

    const invalidTokens = [];
    response.responses.forEach((r, idx) => {
      if (!r.success) {
        const errCode = r.error && r.error.code;
        if (
          errCode === 'messaging/invalid-registration-token' ||
          errCode === 'messaging/registration-token-not-registered'
        ) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    if (invalidTokens.length) {
      const batch = db.batch();
      const invalidSnap = await db.collection(DEVICE_TOKENS_COLLECTION)
        .where('token', 'in', invalidTokens)
        .get();
      invalidSnap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    return { sent: response.successCount, failed: response.failureCount };
  } catch (e) {
    console.error('send_push_error', e);
    return { sent: 0, failed: 0, error: e.message };
  }
}

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const username = sanitizeString(req.body && req.body.username, 120);
    const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';
    if (!username || !password) return res.status(400).json({ error: 'MISSING_CREDENTIALS' });
    const credential = resolveCredential(username);
    if (!credential || !credential.hash) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    const ok = await bcrypt.compare(password, credential.hash);
    if (!ok) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    const token = signToken({ role: credential.role, userId: credential.userId, username });
    res.cookie('evano_token', token, getCookieOptions());
    await writeAudit('login', credential.userId, credential.role, {});
    res.json({ role: credential.role, redirect: credential.role === 'admin' ? '/dashboard' : '/index' });
  } catch {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('evano_token', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/session', authenticate, (req, res) => {
  res.json({ role: req.user.role, userId: req.user.userId, username: req.user.username });
});

app.post('/api/devices/register', authenticate, verifyCsrf, async (req, res) => {
  try {
    const token = sanitizeString(req.body && req.body.token, 500);
    if (!token) return res.status(400).json({ error: 'INVALID_TOKEN' });
    const existing = await db.collection(DEVICE_TOKENS_COLLECTION)
      .where('token', '==', token)
      .limit(1)
      .get();
    if (existing.empty) {
      await db.collection(DEVICE_TOKENS_COLLECTION).add({
        token,
        role: req.user.role,
        userId: req.user.userId,
        platform: sanitizeString(req.body.platform, 20) || 'unknown',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      await existing.docs[0].ref.update({
        role: req.user.role,
        userId: req.user.userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('device_register_error', e);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

function todayRangeUtc() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start, end: new Date(start.getTime() + 86400000) };
}

function serializeValue(value) {
  if (value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return value;
}

function serializeDoc(doc) {
  const data = doc.data() || {};
  const out = { id: doc.id };
  Object.keys(data).forEach(k => { out[k] = serializeValue(data[k]); });
  return out;
}

function serializeRaw(id, data) {
  const out = { id };
  Object.keys(data || {}).forEach(k => { out[k] = serializeValue(data[k]); });
  return out;
}

async function listToday(collection) {
  const { start, end } = todayRangeUtc();
  const snap = await db.collection(collection)
    .where('recordedAt', '>=', admin.firestore.Timestamp.fromDate(start))
    .where('recordedAt', '<', admin.firestore.Timestamp.fromDate(end))
    .orderBy('recordedAt', 'desc')
    .get();
  return snap.docs.map(d => serializeRaw(d.id, d.data()));
}

async function listRecent(collection, limit = 50) {
  const snap = await db.collection(collection).orderBy('recordedAt', 'desc').limit(limit).get();
  return snap.docs.map(d => serializeRaw(d.id, d.data()));
}

app.get('/api/baby/overview', authenticate, requireRole('baby'), async (req, res) => {
  try {
    const [sleep, feeding, diaper, medication] = await Promise.all([
      listToday(SLEEP_COLLECTION), listToday(FEEDING_COLLECTION),
      listToday(DIAPER_COLLECTION), listToday(MEDICATION_COLLECTION)
    ]);
    res.json({ sleep, feeding, diaper, medication });
  } catch (e) {
    console.error('baby_overview_error', e);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/sleep', authenticate, requireRole('baby'), verifyCsrf, async (req, res) => {
  try {
    const minutes = Number(req.body && req.body.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) {
      return res.status(400).json({ error: 'INVALID_MINUTES' });
    }
    const ref = await db.collection(SLEEP_COLLECTION).add({
      userId: req.user.userId, minutes,
      recordedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await sendPushToRole('admin', 'Evano — Sleep logged', `Marina logged ${minutes} min of sleep`, {
      type: 'sleep', minutes: String(minutes)
    });
    res.json(serializeDoc(await ref.get()));
  } catch (e) {
    console.error('sleep_error', e);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/feeding', authenticate, requireRole('baby'), verifyCsrf, async (req, res) => {
  try {
    const type = sanitizeString(req.body && req.body.type, 40) || 'breast';
    const amountMl = Number(req.body && req.body.amountMl);
    if (amountMl && (!Number.isFinite(amountMl) || amountMl <= 0 || amountMl > 2000)) {
      return res.status(400).json({ error: 'INVALID_AMOUNT' });
    }
    const ref = await db.collection(FEEDING_COLLECTION).add({
      userId: req.user.userId, type,
      amountMl: Number.isFinite(amountMl) ? amountMl : 0,
      recordedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    const body = amountMl > 0 ? `Marina logged a ${amountMl} ml feed` : `Marina logged a nursing feed`;
    await sendPushToRole('admin', 'Evano — Feeding logged', body, {
      type: 'feeding', amountMl: String(amountMl || 0)
    });
    res.json(serializeDoc(await ref.get()));
  } catch (e) {
    console.error('feeding_error', e);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/diaper', authenticate, requireRole('baby'), verifyCsrf, async (req, res) => {
  try {
    const kind = sanitizeString(req.body && req.body.kind, 20);
    if (!['wet', 'dirty', 'both'].includes(kind)) {
      return res.status(400).json({ error: 'INVALID_KIND' });
    }
    const ref = await db.collection(DIAPER_COLLECTION).add({
      userId: req.user.userId, kind,
      recordedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await sendPushToRole('admin', 'Evano — Diaper change', `Marina logged a ${kind} diaper`, {
      type: 'diaper', kind
    });
    res.json(serializeDoc(await ref.get()));
  } catch (e) {
    console.error('diaper_error', e);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/medication', authenticate, requireRole('baby'), verifyCsrf, async (req, res) => {
  try {
    const medication = sanitizeString(req.body && req.body.medication, 20);
    if (!['iron', 'calcium'].includes(medication)) {
      return res.status(400).json({ error: 'INVALID_MEDICATION' });
    }
    const ref = await db.collection(MEDICATION_COLLECTION).add({
      userId: req.user.userId, medication, status: 'taken',
      recordedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await writeAudit('medication_taken', req.user.userId, 'baby', { medication });
    await sendPushToRole('admin', 'Evano — Medication taken', `Marina logged ${medication} as taken`, {
      type: 'medication', medication
    });
    res.json(serializeDoc(await ref.get()));
  } catch (e) {
    console.error('medication_error', e);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/medication/correct', authenticate, requireRole('baby'), verifyCsrf, async (req, res) => {
  try {
    const logId = sanitizeString(req.body && req.body.logId, 120);
    const medication = sanitizeString(req.body && req.body.medication, 20);
    if (!logId || !['iron', 'calcium'].includes(medication)) {
      return res.status(400).json({ error: 'INVALID_INPUT' });
    }
    const snap = await db.collection(MEDICATION_COLLECTION).doc(logId).get();
    if (!snap.exists) return res.status(404).json({ error: 'NOT_FOUND' });
    if (snap.data().userId !== req.user.userId) return res.status(403).json({ error: 'FORBIDDEN' });
    const ref = await db.collection(MEDICATION_COLLECTION).add({
      userId: req.user.userId, medication, status: 'corrected', correctedLogId: logId,
      recordedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await writeAudit('medication_corrected', req.user.userId, 'baby', { medication, correctedLogId: logId });
    res.json(serializeDoc(await ref.get()));
  } catch (e) {
    console.error('medication_correct_error', e);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/api/admin/overview', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const [sleepToday, feedingToday, diaperToday, medToday, medHistory, sleepHistory, feedHistory, diaperHistory] = await Promise.all([
      listToday(SLEEP_COLLECTION), listToday(FEEDING_COLLECTION), listToday(DIAPER_COLLECTION),
      listToday(MEDICATION_COLLECTION), listRecent(MEDICATION_COLLECTION, 60),
      listRecent(SLEEP_COLLECTION, 20), listRecent(FEEDING_COLLECTION, 20), listRecent(DIAPER_COLLECTION, 20)
    ]);
    res.json({
      today: { sleep: sleepToday, feeding: feedingToday, diaper: diaperToday, medication: medToday },
      history: { medication: medHistory, sleep: sleepHistory, feeding: feedHistory, diaper: diaperHistory }
    });
  } catch (e) {
    console.error('admin_overview_error', e);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.post('/api/admin/medication/reset', authenticate, requireRole('admin'), verifyCsrf, async (req, res) => {
  try {
    const medication = sanitizeString(req.body && req.body.medication, 20);
    if (!['iron', 'calcium'].includes(medication)) {
      return res.status(400).json({ error: 'INVALID_MEDICATION' });
    }
    const dateStr = req.body && req.body.date;
    let dayStart;
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-').map(Number);
      dayStart = new Date(Date.UTC(y, m - 1, d));
    } else {
      const now = new Date();
      dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    }
    const dayEnd = new Date(dayStart.getTime() + 86400000);

    const snap = await db.collection(MEDICATION_COLLECTION)
      .where('recordedAt', '>=', admin.firestore.Timestamp.fromDate(dayStart))
      .where('recordedAt', '<', admin.firestore.Timestamp.fromDate(dayEnd))
      .get();

    const takenDocs = snap.docs.filter(doc => {
      const d = doc.data();
      return d && d.status === 'taken' && d.medication === medication;
    });

    if (!takenDocs.length) {
      return res.status(404).json({ error: 'NO_RECORD_FOR_DAY' });
    }

    const batch = db.batch();
    takenDocs.forEach(doc => {
      batch.update(doc.ref, {
        status: 'reset',
        resetAt: admin.firestore.FieldValue.serverTimestamp(),
        resetBy: req.user.userId
      });
    });
    const marker = db.collection(MEDICATION_COLLECTION).doc();
    batch.set(marker, {
      userId: 'baby-marina',
      medication,
      status: 'reset_marker',
      resetForDay: dayStart.toISOString().slice(0, 10),
      recordedAt: admin.firestore.FieldValue.serverTimestamp(),
      resetBy: req.user.userId
    });
    await batch.commit();

    await writeAudit('medication_reset', req.user.userId, 'admin', {
      medication, date: dayStart.toISOString().slice(0, 10), count: takenDocs.length
    });

    res.json({ ok: true, resetCount: takenDocs.length, date: dayStart.toISOString().slice(0, 10) });
  } catch (e) {
    console.error('admin_medication_reset_error', e);
    res.status(500).json({ error: 'SERVER_ERROR', message: e && e.message ? e.message : 'unknown' });
  }
});

app.post('/api/admin/notify', authenticate, requireRole('admin'), verifyCsrf, async (req, res) => {
  try {
    const title = sanitizeString(req.body && req.body.title, 120);
    const body = sanitizeString(req.body && req.body.body, 400);
    if (!title || !body) {
      return res.status(400).json({ error: 'MISSING_FIELDS' });
    }
    const result = await sendPushToRole('baby', title, body, { type: 'manual' });
    await writeAudit('admin_notify', req.user.userId, 'admin', { title, body, result });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('admin_notify_error', e);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

app.get('/', (req, res) => res.redirect(302, '/login'));

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'NOT_FOUND' });
  res.status(404).sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use((err, req, res, next) => {
  console.error('unhandled', err);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'SERVER_ERROR' });
  res.status(500).send('Server error');
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Evano Sleepy running on port ${PORT}`));
}

module.exports = app;
