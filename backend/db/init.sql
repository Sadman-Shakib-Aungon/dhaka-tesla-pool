CREATE TABLE users (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('PASSENGER','DRIVER'))
);
CREATE TABLE vehicles (id SERIAL PRIMARY KEY, driver_id INT UNIQUE REFERENCES users(id), name TEXT NOT NULL, capacity INT NOT NULL CHECK (capacity > 0), online BOOLEAN NOT NULL DEFAULT true);
CREATE TABLE pools (id SERIAL PRIMARY KEY, vehicle_id INT REFERENCES vehicles(id), pickup_zone TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'MATCHED' CHECK (status IN ('MATCHED','DRIVER_ARRIVED','STARTED','COMPLETED','CANCELLED')), created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE rides (id SERIAL PRIMARY KEY, passenger_id INT NOT NULL REFERENCES users(id), pool_id INT REFERENCES pools(id), pickup_zone TEXT NOT NULL, destination TEXT NOT NULL, seats INT NOT NULL CHECK (seats > 0), distance_km INT NOT NULL, fare_paisa INT NOT NULL, status TEXT NOT NULL DEFAULT 'MATCHED' CHECK (status IN ('MATCHED','DRIVER_ARRIVED','STARTED','COMPLETED','CANCELLED')), created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX rides_pool_idx ON rides(pool_id); CREATE INDEX rides_passenger_idx ON rides(passenger_id);
INSERT INTO users(name,email,password,role) VALUES
('Nusrat','nusrat@tesla.local','demo123','PASSENGER'),('Rafiq','rafiq@tesla.local','demo123','PASSENGER'),('Shirin','shirin@tesla.local','demo123','PASSENGER'),('Jashim','jashim@tesla.local','demo123','DRIVER');
INSERT INTO vehicles(driver_id,name,capacity) VALUES (4,'Bullet',3);
