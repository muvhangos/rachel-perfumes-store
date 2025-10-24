/* Heroku-ready server (trimmed header)
   Env vars required: SESSION_SECRET
   Optional env: ADMIN_USER, ADMIN_PASS, SMTP_*, NOTIFY_EMAIL, STRIPE_SECRET_KEY
*/
const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const session = require('express-session');
const nodemailer = require('nodemailer');
const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, 'orders.db');
const db = new sqlite3.Database(dbPath);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    perfume TEXT,
    flavour TEXT,
    quantity INTEGER,
    address TEXT,
    birthday TEXT,
    total REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});
app.use(bodyParser.json());
app.use('/static', express.static(path.join(__dirname, 'static')));
if (!process.env.SESSION_SECRET) {
  console.error('Please set SESSION_SECRET env var for session security.');
  process.exit(1);
}
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));
function requireAuth(req, res, next) {
  if (req.session && req.session.user === process.env.ADMIN_USER) return next();
  return res.redirect('/admin/login');
}
app.get('/admin/login', (req, res) => {
  res.send(`
    <h2>Admin Login</h2>
    <form method="POST" action="/admin/login">
      <label>Username: <input name="username" /></label><br/><br/>
      <label>Password: <input name="password" type="password" /></label><br/><br/>
      <button type="submit">Sign in</button>
    </form>
    <p><a href="/">Back to store</a></p>
  `);
});
app.use(express.urlencoded({ extended: true }));
app.post('/admin/login', (req, res) => {
  const user = req.body.username;
  const pass = req.body.password;
  const ADMIN_USER = process.env.ADMIN_USER || 'admin';
  const ADMIN_PASS = process.env.ADMIN_PASS || 'mysecurepassword';
  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    req.session.user = ADMIN_USER;
    return res.redirect('/admin/orders');
  }
  res.send('Invalid credentials. <a href="/admin/login">Try again</a>');
});
app.get('/admin/logout', (req, res) => { req.session.destroy(() => res.redirect('/')); });
app.get('/admin/orders', requireAuth, (req, res) => {
  db.all('SELECT * FROM orders ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).send('DB error');
    let html = '<h2>Orders</h2><a href="/admin/logout">Logout</a><br/><br>';
    html += '<table border="1" cellpadding="8" cellspacing="0"><tr><th>ID</th><th>Perfume</th><th>Flavour</th><th>Qty</th><th>Address</th><th>Total</th><th>Time</th></tr>';
    for (const r of rows) {
      html += `<tr><td>${r.id}</td><td>${r.perfume}</td><td>${r.flavour}</td><td>${r.quantity}</td><td>${r.address}</td><td>R${r.total.toFixed(2)}</td><td>${r.created_at}</td></tr>`;
    }
    html += '</table>';
    res.send(html);
  });
});
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/api/reverse-geocode', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'RachelPerfumes/1.0 (+https://example.com)' }});
    const json = await r.json();
    const address = json.display_name || '';
    res.json({ address });
  } catch (e) {
    res.status(500).json({ error: 'reverse geocode failed' });
  }
});
let mailer = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  mailer = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: parseInt(process.env.SMTP_PORT || '587', 10), secure: false, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  console.log('Email notifications enabled.');
} else {
  console.log('Email not configured. To enable, set SMTP_HOST, SMTP_USER, SMTP_PASS.');
}
app.post('/api/orders', async (req, res) => {
  const { numPerfumes, perfumeType, flavour, address, birthday, total } = req.body;
  if (!numPerfumes || !perfumeType || !address) return res.status(400).json({ error: 'missing fields' });
  const stmt = db.prepare('INSERT INTO orders (perfume, flavour, quantity, address, birthday, total) VALUES (?, ?, ?, ?, ?, ?)');
  stmt.run(perfumeType, flavour, numPerfumes, address, birthday, total, function(err) {
    if (err) { console.error(err); return res.status(500).json({ error: 'db error' }); }
    const orderId = this.lastID;
    if (mailer && process.env.NOTIFY_EMAIL) {
      const mailOptions = { from: process.env.NOTIFY_EMAIL, to: process.env.NOTIFY_EMAIL, subject: `New order #${orderId} — ${perfumeType}`, text: `New order received.\nOrder ID: ${orderId}\nPerfume: ${perfumeType}\nFlavour: ${flavour}\nQuantity: ${numPerfumes}\nAddress: ${address}\nTotal: R${total}\n` };
      mailer.sendMail(mailOptions, (err, info) => { if (err) console.error('Send mail error', err); else console.log('Notification sent', info.response || info); });
    }
    if (process.env.STRIPE_SECRET_KEY) {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price_data: { currency: 'zar', product_data: { name: perfumeType + ' x' + numPerfumes }, unit_amount: Math.round((total / numPerfumes) * 100) }, quantity: numPerfumes }],
        mode: 'payment',
        success_url: req.protocol + '://' + req.get('host') + '/?paid=1&order=' + orderId,
        cancel_url: req.protocol + '://' + req.get('host') + '/?paid=0&order=' + orderId,
      }).then(session => { res.json({ orderId, checkoutUrl: session.url }); }).catch(err => { console.error('Stripe error', err); res.json({ orderId }); });
    } else { res.json({ orderId }); }
  });
});
app.get('/api/orders', requireAuth, (req, res) => { db.all('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200', (err, rows) => { if (err) return res.status(500).json({ error: 'db error' }); res.json(rows); }); });
app.listen(PORT, () => { console.log('Server running on port', PORT); });
