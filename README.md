# Unique Beauty Care — Live Booking Website

This is a real dynamic Node.js + PostgreSQL salon booking app, designed mobile-first.

## Included
- Public customer website
- Private `/admin` dashboard
- Online PostgreSQL database
- Dynamic services and prices
- Multiple-service booking
- Dynamic offers/discounts
- Customer Booking ID status page (Booking ID only)
- Home-service location check against salon coordinates and configurable radius
- Admin booking acceptance/rejection/cancellation
- Customer email notifications and admin new-booking emails through SMTP
- WhatsApp Booking ID button
- Salon settings editable from admin panel

## Important before going live
1. Create a PostgreSQL database and set `DATABASE_URL`.
2. Set a strong `ADMIN_PASSWORD` and `JWT_SECRET`. For development only, the current fallback admin password is `Unique@2026Care!`.
3. In `/admin`, enter the exact salon latitude/longitude and keep the home radius at 20 km.
4. Configure SMTP credentials so booking and status emails are actually sent.
5. Deploy this Node service using Render, Railway, or another Node/PostgreSQL host.

The default salon location is only a placeholder around Rakhial, Ahmedabad. Replace it with the exact salon coordinates in Admin → Salon Settings before accepting home-service bookings.

## Local run
```bash
npm install
cp .env.example .env
# fill .env
npm start
```
Then open `http://localhost:3000` and `http://localhost:3000/admin`. Do not open `public/admin.html` directly as a `file://` page.
