USE `db_lottery`;

DELETE FROM `giveaways` WHERE `id` = 7 OR `slug` = 'sorteo-relampago-prueba-10k-efectivo';

INSERT INTO `giveaways` (
  `uuid`,
  `title`,
  `slug`,
  `description`,
  `primary_image_url`,
  `image_urls`,
  `package_options`,
  `ticket_price`,
  `total_tickets`,
  `available_tickets`,
  `currency`,
  `status`,
  `start_date`,
  `end_date`,
  `min_threshold_pct`,
  `countdown_hours`,
  `threshold_reached_at`
) VALUES (
  'e8a1b2c3-d4e5-4f6a-9b8c-1d2e3f4a5b6c',
  'Sorteo Relámpago 24 Horas: $15,000 MXN en Efectivo',
  'sorteo-relampago-24-horas-15k',
  '¡Sorteo relámpago de prueba con duración de 24 horas! Participa por la bolsa garantizada de $15,000 MXN en efectivo transferidos directo a tu cuenta bancaria. Boletos a solo $10 MXN con selección certificada.',
  'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?auto=format&fit=crop&w=800&q=80',
  '["https://images.unsplash.com/photo-1580519542036-c47de6196ba5?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=800&q=80"]',
  '[1, 5, 10, 20]',
  10.00,
  500,
  500,
  'MXN',
  'active',
  NOW(),
  DATE_ADD(NOW(), INTERVAL 24 HOUR),
  0,
  24,
  NOW()
)
ON DUPLICATE KEY UPDATE
  `title` = VALUES(`title`),
  `status` = 'active',
  `start_date` = VALUES(`start_date`),
  `end_date` = VALUES(`end_date`);

SET @new_id = (SELECT `id` FROM `giveaways` WHERE `slug` = 'sorteo-relampago-24-horas-15k');

INSERT INTO `giveaway_bank_accounts` (`giveaway_id`, `bank_account_id`, `is_active`)
VALUES (@new_id, 1, 1), (@new_id, 2, 1), (@new_id, 3, 1)
ON DUPLICATE KEY UPDATE `is_active` = 1;
