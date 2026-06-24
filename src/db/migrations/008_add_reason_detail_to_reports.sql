-- H9: texto libre cuando reason = 'other', para no perder el detalle de denuncias
-- que no encajan en las categorías fijas.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reason_detail VARCHAR(500);
