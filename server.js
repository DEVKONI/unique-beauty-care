import express from 'express';
import helmet from 'helmet';
import nodemailer from 'nodemailer';
import pg from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_BEFORE_DEPLOYMENT';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'sonidivyansh1592008@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Unique@2026Care!';

if (!DATABASE_URL) {
  console.warn('DATABASE_URL is not set. Configure PostgreSQL before production use.');
}
if (ADMIN_PASSWORD === 'Unique@2026Care!') {
  console.warn('Using the development admin password. Set ADMIN_PASSWORD before production deployment.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false }));

const defaultSettings = {
  salon_name: 'Unique Beauty Care',
  salon_tagline: 'Salon & Home Beauty Services',
  salon_email: ADMIN_EMAIL,
  salon_phone: '',
  salon_whatsapp: '',
  salon_address: 'Rakhial, Ahmedabad, Gujarat',
  salon_lat: '23.0200',
  salon_lng: '72.6370',
  home_radius_km: '20',
  opening_hours: 'Mon–Sun · 9:00 AM – 8:00 PM'
};

const defaultServices = [
  ['Hair Care','Hair','Haircuts, wash, styling and nourishing treatments.',299,60],
  ['Facial','Skin','Refreshing facial treatments for clean, glowing skin.',499,60],
  ['Manicure & Pedicure','Nails','Relaxing nail and foot care.',399,75],
  ['Head Massage','Wellness','A calming massage to relax and refresh.',299,45],
  ['Waxing','Beauty','Professional waxing services.',199,45],
  ['Makeup','Makeup','Party and occasion makeup.',999,90]
];

async function initDb() {
  if (!DATABASE_URL) return;
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  for (const [key, value] of Object.entries(defaultSettings)) {
    await pool.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING', [key, value]);
  }
  const count = await pool.query('SELECT COUNT(*)::int AS count FROM services');
  if (count.rows[0].count === 0) {
    for (const s of defaultServices) {
      await pool.query('INSERT INTO services(name,category,description,price,duration_minutes) VALUES($1,$2,$3,$4,$5)', s);
    }
  }
}

function parseCookies(req, _res, next) {
  const raw = req.headers.cookie || '';
  req.cookies = Object.fromEntries(raw.split(';').filter(Boolean).map(v => {
    const i = v.indexOf('=');
    if (i < 0) return [v.trim(), ''];
    return [decodeURIComponent(v.slice(0, i).trim()), decodeURIComponent(v.slice(i + 1).trim())];
  }));
  next();
}
app.use(parseCookies);

function authRequired(req, res, next) {
  const token = req.cookies?.ubc_admin;
  if (!token) return res.status(401).json({ error: 'Admin login required.' });
  try {
    const [head, payload, sig] = token.split('.');
    if (!head || !payload || !sig) throw new Error('Invalid token');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${payload}`).digest('base64url');
    if (expected !== sig) throw new Error('Invalid signature');
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp && Date.now() >= data.exp * 1000) throw new Error('Expired');
    if (data.role !== 'admin') throw new Error('Invalid role');
    req.admin = data;
    next();
  } catch {
    return res.status(401).json({ error: 'Admin session expired.' });
  }
}

function signAdminToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ role: 'admin', email: ADMIN_EMAIL, iat: now, exp: now + 12 * 60 * 60 })).toString('base64url');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*r) * Math.cos(lat2*r) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function bookingId() {
  return 'UBC-' + new Date().getFullYear() + '-' + crypto.randomInt(100000, 999999);
}

let mailer = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function sendEmail(to, subject, text, html) {
  if (!mailer) {
    console.log(`[EMAIL NOT SENT - SMTP NOT CONFIGURED] ${to} | ${subject}\n${text}`);
    return false;
  }
  await mailer.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text, html });
  return true;
}

async function getSettings() {
  const r = await pool.query('SELECT key,value FROM settings');
  return Object.fromEntries(r.rows.map(x => [x.key, x.value]));
}

app.get('/api/public/settings', async (_req,res) => {
  try {
    const s = await getSettings();
    res.json({
      salonName: s.salon_name, tagline: s.salon_tagline, email: s.salon_email,
      phone: s.salon_phone, whatsapp: s.salon_whatsapp, address: s.salon_address,
      lat: Number(s.salon_lat), lng: Number(s.salon_lng), radiusKm: Number(s.home_radius_km),
      openingHours: s.opening_hours
    });
  } catch (e) { res.status(500).json({error:'Unable to load settings.'}); }
});

app.get('/api/public/services', async (_req,res) => {
  try { const r=await pool.query('SELECT id,name,category,description,price,duration_minutes FROM services WHERE active=true ORDER BY id'); res.json(r.rows); }
  catch { res.status(500).json({error:'Unable to load services.'}); }
});

app.get('/api/public/offers', async (_req,res) => {
  try {
    const r=await pool.query(`SELECT id,title,description,discount_type,discount_value,valid_from,valid_to FROM offers
      WHERE active=true AND (valid_from IS NULL OR valid_from<=CURRENT_DATE) AND (valid_to IS NULL OR valid_to>=CURRENT_DATE) ORDER BY id DESC`);
    res.json(r.rows);
  } catch { res.status(500).json({error:'Unable to load offers.'}); }
});

app.post('/api/bookings', async (req,res) => {
  if (!DATABASE_URL) return res.status(503).json({error:'Booking database is not configured yet.'});
  const client = await pool.connect();
  try {
    const {customerName, phone, email, bookingType, address='', latitude, longitude, appointmentDate, appointmentTime, notes='', serviceIds=[], offerId=null} = req.body;
    if (!customerName || !phone || !email || !bookingType || !appointmentDate || !appointmentTime || !Array.isArray(serviceIds) || serviceIds.length===0) return res.status(400).json({error:'Please complete all required fields and choose at least one service.'});
    if (!['Salon Visit','Home Service'].includes(bookingType)) return res.status(400).json({error:'Invalid booking type.'});

    const settings = await getSettings();
    let distance = null;
    if (bookingType === 'Home Service') {
      if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return res.status(400).json({error:'Home service requires your current location.'});
      distance = haversineKm(Number(latitude), Number(longitude), Number(settings.salon_lat), Number(settings.salon_lng));
      if (distance > Number(settings.home_radius_km)) return res.status(400).json({error:`Home service is available only within ${settings.home_radius_km} km of the salon. Your location is approximately ${distance.toFixed(1)} km away.`});
      if (!address.trim()) return res.status(400).json({error:'Please enter your home-service address.'});
    }

    const services = await pool.query('SELECT id,name,price,duration_minutes FROM services WHERE active=true AND id = ANY($1::int[])', [serviceIds.map(Number)]);
    if (services.rows.length !== new Set(serviceIds.map(Number)).size) return res.status(400).json({error:'One or more selected services are unavailable.'});
    const subtotal = services.rows.reduce((a,x)=>a+Number(x.price),0);

    let discount = 0; let validOfferId = null;
    if (offerId) {
      const o = await pool.query(`SELECT id,discount_type,discount_value FROM offers WHERE id=$1 AND active=true AND (valid_from IS NULL OR valid_from<=CURRENT_DATE) AND (valid_to IS NULL OR valid_to>=CURRENT_DATE)`, [Number(offerId)]);
      if (o.rows[0]) {
        validOfferId = o.rows[0].id;
        discount = o.rows[0].discount_type === 'percent' ? subtotal * Number(o.rows[0].discount_value)/100 : Number(o.rows[0].discount_value);
        discount = Math.min(discount, subtotal);
      }
    }
    const total = subtotal-discount;

    let id; for (let i=0;i<5;i++){ const candidate=bookingId(); const c=await client.query('SELECT 1 FROM bookings WHERE booking_id=$1',[candidate]); if(!c.rowCount){id=candidate;break;} }
    if (!id) throw new Error('Unable to generate booking ID.');

    await client.query('BEGIN');
    const b = await client.query(`INSERT INTO bookings(booking_id,customer_name,phone,email,booking_type,address,latitude,longitude,distance_km,appointment_date,appointment_time,notes,subtotal,discount,total,offer_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [id,customerName.trim(),phone.trim(),email.trim().toLowerCase(),bookingType,address.trim(),latitude??null,longitude??null,distance,appointmentDate,appointmentTime,notes.trim(),subtotal,discount,total,validOfferId]);
    for (const s of services.rows) await client.query('INSERT INTO booking_items(booking_db_id,service_id,service_name,price,duration_minutes) VALUES($1,$2,$3,$4,$5)', [b.rows[0].id,s.id,s.name,s.price,s.duration_minutes]);
    await client.query('COMMIT');

    const servicesText=services.rows.map(s=>s.name).join(', ');
    await Promise.allSettled([
      sendEmail(email, `Unique Beauty Care Booking ${id}`, `Hello ${customerName},\n\nYour booking ID is ${id}.\nStatus: Pending\nServices: ${servicesText}\nDate: ${appointmentDate}\nTime: ${appointmentTime}\nType: ${bookingType}\nTotal: ₹${total.toFixed(2)}\n\nUse the Check Booking page to see updates.`, `<p>Hello ${customerName},</p><p>Your Unique Beauty Care booking ID is <strong>${id}</strong>.</p><p><strong>Status:</strong> Pending<br><strong>Services:</strong> ${servicesText}<br><strong>Date:</strong> ${appointmentDate}<br><strong>Time:</strong> ${appointmentTime}<br><strong>Type:</strong> ${bookingType}<br><strong>Total:</strong> ₹${total.toFixed(2)}</p>`),
      sendEmail(settings.salon_email, `New Unique Beauty Care Booking ${id}`, `New booking ${id}\nCustomer: ${customerName}\nPhone: ${phone}\nEmail: ${email}\nServices: ${servicesText}\nDate: ${appointmentDate}\nTime: ${appointmentTime}\nType: ${bookingType}\nAddress: ${address}\nTotal: ₹${total.toFixed(2)}`, `<p><strong>New booking ${id}</strong></p><p>${customerName}<br>${phone}<br>${email}</p><p>${servicesText}<br>${appointmentDate} at ${appointmentTime}<br>${bookingType}<br>${address}<br>Total ₹${total.toFixed(2)}</p>`)
    ]);

    res.status(201).json({bookingId:id,status:'Pending',total,distanceKm:distance});
  } catch(e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error(e); res.status(500).json({error:'Could not create booking.'});
  } finally { client.release(); }
});

app.get('/api/bookings/:id', async (req,res) => {
  if (!DATABASE_URL) return res.status(503).json({error:'Booking database is not configured yet.'});
  try {
    const b = await pool.query('SELECT booking_id,customer_name,booking_type,appointment_date,appointment_time,status,subtotal,discount,total,address,created_at FROM bookings WHERE booking_id=$1',[req.params.id.toUpperCase()]);
    if (!b.rows[0]) return res.status(404).json({error:'Booking not found.'});
    const items=await pool.query('SELECT service_name,price FROM booking_items WHERE booking_db_id=(SELECT id FROM bookings WHERE booking_id=$1)',[req.params.id.toUpperCase()]);
    res.json({...b.rows[0],services:items.rows});
  } catch { res.status(500).json({error:'Unable to check booking.'}); }
});

app.post('/api/admin/login', async (req,res) => {
  try {
    const {password}=req.body || {};
    const ok = typeof password === 'string' && password === ADMIN_PASSWORD;
    if (!ok) return res.status(401).json({error:'Incorrect admin password.'});
    const token = signAdminToken();
    res.setHeader('Set-Cookie', `ubc_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${process.env.NODE_ENV==='production'?'; Secure':''}`);
    res.json({ok:true,email:ADMIN_EMAIL});
  } catch { res.status(500).json({error:'Admin login is unavailable.'}); }
});
app.post('/api/admin/logout', (_req,res)=>{res.setHeader('Set-Cookie','ubc_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');res.json({ok:true});});
app.get('/api/admin/me',authRequired,(req,res)=>res.json({email:req.admin.email}));

app.get('/api/admin/bookings',authRequired,async(req,res)=>{
  try { const r=await pool.query(`SELECT b.*, COALESCE(json_agg(json_build_object('name',bi.service_name,'price',bi.price)) FILTER (WHERE bi.id IS NOT NULL),'[]') services
    FROM bookings b LEFT JOIN booking_items bi ON bi.booking_db_id=b.id GROUP BY b.id ORDER BY b.created_at DESC`); res.json(r.rows); }
  catch {res.status(500).json({error:'Unable to load bookings.'});}
});

app.patch('/api/admin/bookings/:id',authRequired,async(req,res)=>{
  const {status}=req.body;
  if(!['Pending','Accepted','Rejected','Cancelled'].includes(status)) return res.status(400).json({error:'Invalid status.'});
  try {
    const r=await pool.query('UPDATE bookings SET status=$1,updated_at=NOW() WHERE booking_id=$2 RETURNING *',[status,req.params.id.toUpperCase()]);
    if(!r.rows[0]) return res.status(404).json({error:'Booking not found.'});
    const b=r.rows[0]; const s=await getSettings();
    await sendEmail(b.email,`Unique Beauty Care Booking ${b.booking_id} — ${status}`,`Hello ${b.customer_name},\n\nYour booking ${b.booking_id} is now ${status}.\nDate: ${b.appointment_date}\nTime: ${b.appointment_time}\n\nThank you,\nUnique Beauty Care`,`<p>Hello ${b.customer_name},</p><p>Your booking <strong>${b.booking_id}</strong> is now <strong>${status}</strong>.</p><p>${b.appointment_date} at ${b.appointment_time}</p><p>Thank you,<br>${s.salon_name}</p>`);
    res.json({ok:true,status});
  } catch {res.status(500).json({error:'Unable to update booking.'});}
});

app.post('/api/admin/services',authRequired,async(req,res)=>{try{const {name,category='Beauty',description='',price,durationMinutes=60}=req.body;const r=await pool.query('INSERT INTO services(name,category,description,price,duration_minutes) VALUES($1,$2,$3,$4,$5) RETURNING *',[name,category,description,Number(price),Number(durationMinutes)]);res.status(201).json(r.rows[0]);}catch{res.status(400).json({error:'Could not create service.'})}});
app.patch('/api/admin/services/:id',authRequired,async(req,res)=>{try{const {name,category,description,price,durationMinutes,active}=req.body;const r=await pool.query('UPDATE services SET name=COALESCE($1,name),category=COALESCE($2,category),description=COALESCE($3,description),price=COALESCE($4,price),duration_minutes=COALESCE($5,duration_minutes),active=COALESCE($6,active),updated_at=NOW() WHERE id=$7 RETURNING *',[name,category,description,price==null?null:Number(price),durationMinutes==null?null:Number(durationMinutes),active==null?null:Boolean(active),req.params.id]);if(!r.rows[0])return res.status(404).json({error:'Service not found'});res.json(r.rows[0]);}catch{res.status(400).json({error:'Could not update service.'})}});
app.delete('/api/admin/services/:id',authRequired,async(req,res)=>{try{await pool.query('DELETE FROM services WHERE id=$1',[req.params.id]);res.json({ok:true});}catch{res.status(400).json({error:'Could not delete service.'})}});
app.get('/api/admin/services',authRequired,async(_req,res)=>{try{const r=await pool.query('SELECT * FROM services ORDER BY id');res.json(r.rows)}catch{res.status(500).json({error:'Unable to load services.'})}});

app.get('/api/admin/offers',authRequired,async(_req,res)=>{try{const r=await pool.query('SELECT * FROM offers ORDER BY id DESC');res.json(r.rows)}catch{res.status(500).json({error:'Unable to load offers.'})}});
app.post('/api/admin/offers',authRequired,async(req,res)=>{try{const {title,description='',discountType,discountValue,validFrom=null,validTo=null,active=true}=req.body;const r=await pool.query('INSERT INTO offers(title,description,discount_type,discount_value,valid_from,valid_to,active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[title,description,discountType,Number(discountValue),validFrom||null,validTo||null,active]);res.status(201).json(r.rows[0]);}catch{res.status(400).json({error:'Could not create offer.'})}});
app.patch('/api/admin/offers/:id',authRequired,async(req,res)=>{try{const {title,description,discountType,discountValue,validFrom,validTo,active}=req.body;const r=await pool.query('UPDATE offers SET title=COALESCE($1,title),description=COALESCE($2,description),discount_type=COALESCE($3,discount_type),discount_value=COALESCE($4,discount_value),valid_from=$5,valid_to=$6,active=COALESCE($7,active),updated_at=NOW() WHERE id=$8 RETURNING *',[title,description,discountType,discountValue==null?null:Number(discountValue),validFrom||null,validTo||null,active==null?null:Boolean(active),req.params.id]);if(!r.rows[0])return res.status(404).json({error:'Offer not found'});res.json(r.rows[0]);}catch{res.status(400).json({error:'Could not update offer.'})}});
app.delete('/api/admin/offers/:id',authRequired,async(req,res)=>{try{await pool.query('DELETE FROM offers WHERE id=$1',[req.params.id]);res.json({ok:true});}catch{res.status(400).json({error:'Could not delete offer.'})}});

app.get('/api/admin/settings',authRequired,async(_req,res)=>{try{res.json(await getSettings())}catch{res.status(500).json({error:'Unable to load settings.'})}});
app.patch('/api/admin/settings',authRequired,async(req,res)=>{try{for(const [k,v] of Object.entries(req.body)){if(!Object.keys(defaultSettings).includes(k))continue;await pool.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[k,String(v)])}res.json(await getSettings())}catch{res.status(400).json({error:'Could not update settings.'})}});

// Static public files and the private admin page.
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin',(_req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
// Express 5-safe SPA fallback; all API routes above have already been matched.
app.use((req,res,next)=>{
  if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(__dirname,'public','index.html'));
  next();
});

initDb().then(()=>app.listen(PORT,()=>console.log(`Unique Beauty Care running on port ${PORT}`))).catch(err=>{console.error('Database initialization failed',err);process.exit(1)});
