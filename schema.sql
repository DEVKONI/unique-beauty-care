CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  parent_service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'Beauty',
  description TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offers (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  discount_type TEXT NOT NULL DEFAULT 'percent',
  discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  valid_from DATE,
  valid_to DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  offer_kind TEXT NOT NULL DEFAULT 'Regular',
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  banner_text TEXT DEFAULT '',
  coupon_code TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  booking_id TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  booking_type TEXT NOT NULL CHECK (booking_type IN ('Salon Visit','Home Service')),
  address TEXT DEFAULT '',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  distance_km NUMERIC(8,2),
  appointment_date DATE NOT NULL,
  appointment_time TEXT NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Accepted','Rejected','Cancelled')),
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  offer_id INTEGER REFERENCES offers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booking_items (
  id BIGSERIAL PRIMARY KEY,
  booking_db_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
  service_name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60
);

CREATE TABLE IF NOT EXISTS site_images (
  id SERIAL PRIMARY KEY,
  placement TEXT NOT NULL,
  title TEXT DEFAULT '',
  mime_type TEXT NOT NULL,
  image_data TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backward-compatible migrations for existing installations.
ALTER TABLE services ADD COLUMN IF NOT EXISTS parent_service_id INTEGER REFERENCES services(id) ON DELETE SET NULL;
ALTER TABLE services ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE services ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE services ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE offers ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'percent';
ALTER TABLE offers ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS offer_kind TEXT NOT NULL DEFAULT 'Regular';
ALTER TABLE offers ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS banner_text TEXT DEFAULT '';
ALTER TABLE offers ADD COLUMN IF NOT EXISTS coupon_code TEXT DEFAULT '';
ALTER TABLE offers ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE offers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_services_parent ON services(parent_service_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(appointment_date);
CREATE INDEX IF NOT EXISTS idx_booking_items_booking ON booking_items(booking_db_id);
CREATE INDEX IF NOT EXISTS idx_site_images_placement ON site_images(placement);
