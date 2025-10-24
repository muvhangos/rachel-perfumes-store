Rachel Perfumes - Heroku deployment quick start

1. Unzip the project and cd into the folder.
2. (Optional) Copy .env.example to .env and fill values if running locally.
3. Create a Heroku app (if you haven't):
   heroku create your-app-name

4. Add config vars to Heroku (replace values):
   heroku config:set SESSION_SECRET="a_long_random_secret"
   heroku config:set ADMIN_USER="admin"
   heroku config:set ADMIN_PASS="mysecurepassword"
   heroku config:set NOTIFY_EMAIL="you@yourdomain.com"
   heroku config:set SMTP_HOST="smtp.gmail.com"
   heroku config:set SMTP_PORT="587"
   heroku config:set SMTP_USER="your_email@gmail.com"
   heroku config:set SMTP_PASS="your_app_password"
   # optional:
   heroku config:set STRIPE_SECRET_KEY="sk_test_xxx"

5. Push to Heroku:
   git init
   git add .
   git commit -m "Heroku deploy"
   heroku git:remote -a your-app-name
   git push heroku main

6. Open the app:
   heroku open

Notes:
- Heroku's filesystem is ephemeral. SQLite (orders.db) will not persist across dyno restarts or deployments.
  For production, consider using Heroku Postgres or another external DB. If you want, I can migrate the app to use Postgres.
- Keep secrets (SESSION_SECRET, SMTP_PASS, STRIPE keys) private.
- If using Gmail, create an App Password for SMTP (recommended) and use that in SMTP_PASS.
