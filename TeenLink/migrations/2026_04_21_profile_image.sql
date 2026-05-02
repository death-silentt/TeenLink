-- Add profile_image_url column to users table
-- For existing databases; new databases auto-create via SQLAlchemy metadata.create_all
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url VARCHAR(512) DEFAULT NULL;
