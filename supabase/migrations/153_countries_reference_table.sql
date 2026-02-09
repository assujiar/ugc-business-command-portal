-- Migration 153: Countries Reference Table
-- Creates a reference table with all countries grouped by continent
-- Used for shipment detail country selection with search and continent grouping

-- =====================================================
-- PART 1: Create countries table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.countries (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  iso_code_2 CHAR(2) NOT NULL UNIQUE,
  continent TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_countries_continent ON public.countries(continent, name);
CREATE INDEX IF NOT EXISTS idx_countries_active ON public.countries(is_active, continent, name);

-- =====================================================
-- PART 2: Seed data - All countries by continent
-- =====================================================

-- Asia
INSERT INTO public.countries (name, iso_code_2, continent, sort_order) VALUES
  ('Afghanistan', 'AF', 'Asia', 1),
  ('Armenia', 'AM', 'Asia', 2),
  ('Azerbaijan', 'AZ', 'Asia', 3),
  ('Bahrain', 'BH', 'Asia', 4),
  ('Bangladesh', 'BD', 'Asia', 5),
  ('Bhutan', 'BT', 'Asia', 6),
  ('Brunei', 'BN', 'Asia', 7),
  ('Cambodia', 'KH', 'Asia', 8),
  ('China', 'CN', 'Asia', 9),
  ('Cyprus', 'CY', 'Asia', 10),
  ('Georgia', 'GE', 'Asia', 11),
  ('Hong Kong', 'HK', 'Asia', 12),
  ('India', 'IN', 'Asia', 13),
  ('Indonesia', 'ID', 'Asia', 14),
  ('Iran', 'IR', 'Asia', 15),
  ('Iraq', 'IQ', 'Asia', 16),
  ('Israel', 'IL', 'Asia', 17),
  ('Japan', 'JP', 'Asia', 18),
  ('Jordan', 'JO', 'Asia', 19),
  ('Kazakhstan', 'KZ', 'Asia', 20),
  ('Kuwait', 'KW', 'Asia', 21),
  ('Kyrgyzstan', 'KG', 'Asia', 22),
  ('Laos', 'LA', 'Asia', 23),
  ('Lebanon', 'LB', 'Asia', 24),
  ('Macao', 'MO', 'Asia', 25),
  ('Malaysia', 'MY', 'Asia', 26),
  ('Maldives', 'MV', 'Asia', 27),
  ('Mongolia', 'MN', 'Asia', 28),
  ('Myanmar', 'MM', 'Asia', 29),
  ('Nepal', 'NP', 'Asia', 30),
  ('North Korea', 'KP', 'Asia', 31),
  ('Oman', 'OM', 'Asia', 32),
  ('Pakistan', 'PK', 'Asia', 33),
  ('Palestine', 'PS', 'Asia', 34),
  ('Philippines', 'PH', 'Asia', 35),
  ('Qatar', 'QA', 'Asia', 36),
  ('Saudi Arabia', 'SA', 'Asia', 37),
  ('Singapore', 'SG', 'Asia', 38),
  ('South Korea', 'KR', 'Asia', 39),
  ('Sri Lanka', 'LK', 'Asia', 40),
  ('Syria', 'SY', 'Asia', 41),
  ('Taiwan', 'TW', 'Asia', 42),
  ('Tajikistan', 'TJ', 'Asia', 43),
  ('Thailand', 'TH', 'Asia', 44),
  ('Timor-Leste', 'TL', 'Asia', 45),
  ('Turkey', 'TR', 'Asia', 46),
  ('Turkmenistan', 'TM', 'Asia', 47),
  ('United Arab Emirates', 'AE', 'Asia', 48),
  ('Uzbekistan', 'UZ', 'Asia', 49),
  ('Vietnam', 'VN', 'Asia', 50),
  ('Yemen', 'YE', 'Asia', 51)
ON CONFLICT (name) DO NOTHING;

-- Europe
INSERT INTO public.countries (name, iso_code_2, continent, sort_order) VALUES
  ('Albania', 'AL', 'Europe', 1),
  ('Andorra', 'AD', 'Europe', 2),
  ('Austria', 'AT', 'Europe', 3),
  ('Belarus', 'BY', 'Europe', 4),
  ('Belgium', 'BE', 'Europe', 5),
  ('Bosnia and Herzegovina', 'BA', 'Europe', 6),
  ('Bulgaria', 'BG', 'Europe', 7),
  ('Croatia', 'HR', 'Europe', 8),
  ('Czech Republic', 'CZ', 'Europe', 9),
  ('Denmark', 'DK', 'Europe', 10),
  ('Estonia', 'EE', 'Europe', 11),
  ('Finland', 'FI', 'Europe', 12),
  ('France', 'FR', 'Europe', 13),
  ('Germany', 'DE', 'Europe', 14),
  ('Greece', 'GR', 'Europe', 15),
  ('Hungary', 'HU', 'Europe', 16),
  ('Iceland', 'IS', 'Europe', 17),
  ('Ireland', 'IE', 'Europe', 18),
  ('Italy', 'IT', 'Europe', 19),
  ('Kosovo', 'XK', 'Europe', 20),
  ('Latvia', 'LV', 'Europe', 21),
  ('Liechtenstein', 'LI', 'Europe', 22),
  ('Lithuania', 'LT', 'Europe', 23),
  ('Luxembourg', 'LU', 'Europe', 24),
  ('Malta', 'MT', 'Europe', 25),
  ('Moldova', 'MD', 'Europe', 26),
  ('Monaco', 'MC', 'Europe', 27),
  ('Montenegro', 'ME', 'Europe', 28),
  ('Netherlands', 'NL', 'Europe', 29),
  ('North Macedonia', 'MK', 'Europe', 30),
  ('Norway', 'NO', 'Europe', 31),
  ('Poland', 'PL', 'Europe', 32),
  ('Portugal', 'PT', 'Europe', 33),
  ('Romania', 'RO', 'Europe', 34),
  ('Russia', 'RU', 'Europe', 35),
  ('San Marino', 'SM', 'Europe', 36),
  ('Serbia', 'RS', 'Europe', 37),
  ('Slovakia', 'SK', 'Europe', 38),
  ('Slovenia', 'SI', 'Europe', 39),
  ('Spain', 'ES', 'Europe', 40),
  ('Sweden', 'SE', 'Europe', 41),
  ('Switzerland', 'CH', 'Europe', 42),
  ('Ukraine', 'UA', 'Europe', 43),
  ('United Kingdom', 'GB', 'Europe', 44),
  ('Vatican City', 'VA', 'Europe', 45)
ON CONFLICT (name) DO NOTHING;

-- Africa
INSERT INTO public.countries (name, iso_code_2, continent, sort_order) VALUES
  ('Algeria', 'DZ', 'Africa', 1),
  ('Angola', 'AO', 'Africa', 2),
  ('Benin', 'BJ', 'Africa', 3),
  ('Botswana', 'BW', 'Africa', 4),
  ('Burkina Faso', 'BF', 'Africa', 5),
  ('Burundi', 'BI', 'Africa', 6),
  ('Cameroon', 'CM', 'Africa', 7),
  ('Cape Verde', 'CV', 'Africa', 8),
  ('Central African Republic', 'CF', 'Africa', 9),
  ('Chad', 'TD', 'Africa', 10),
  ('Comoros', 'KM', 'Africa', 11),
  ('Congo (DRC)', 'CD', 'Africa', 12),
  ('Congo (Republic)', 'CG', 'Africa', 13),
  ('Cote d''Ivoire', 'CI', 'Africa', 14),
  ('Djibouti', 'DJ', 'Africa', 15),
  ('Egypt', 'EG', 'Africa', 16),
  ('Equatorial Guinea', 'GQ', 'Africa', 17),
  ('Eritrea', 'ER', 'Africa', 18),
  ('Eswatini', 'SZ', 'Africa', 19),
  ('Ethiopia', 'ET', 'Africa', 20),
  ('Gabon', 'GA', 'Africa', 21),
  ('Gambia', 'GM', 'Africa', 22),
  ('Ghana', 'GH', 'Africa', 23),
  ('Guinea', 'GN', 'Africa', 24),
  ('Guinea-Bissau', 'GW', 'Africa', 25),
  ('Kenya', 'KE', 'Africa', 26),
  ('Lesotho', 'LS', 'Africa', 27),
  ('Liberia', 'LR', 'Africa', 28),
  ('Libya', 'LY', 'Africa', 29),
  ('Madagascar', 'MG', 'Africa', 30),
  ('Malawi', 'MW', 'Africa', 31),
  ('Mali', 'ML', 'Africa', 32),
  ('Mauritania', 'MR', 'Africa', 33),
  ('Mauritius', 'MU', 'Africa', 34),
  ('Morocco', 'MA', 'Africa', 35),
  ('Mozambique', 'MZ', 'Africa', 36),
  ('Namibia', 'NA', 'Africa', 37),
  ('Niger', 'NE', 'Africa', 38),
  ('Nigeria', 'NG', 'Africa', 39),
  ('Rwanda', 'RW', 'Africa', 40),
  ('Sao Tome and Principe', 'ST', 'Africa', 41),
  ('Senegal', 'SN', 'Africa', 42),
  ('Seychelles', 'SC', 'Africa', 43),
  ('Sierra Leone', 'SL', 'Africa', 44),
  ('Somalia', 'SO', 'Africa', 45),
  ('South Africa', 'ZA', 'Africa', 46),
  ('South Sudan', 'SS', 'Africa', 47),
  ('Sudan', 'SD', 'Africa', 48),
  ('Tanzania', 'TZ', 'Africa', 49),
  ('Togo', 'TG', 'Africa', 50),
  ('Tunisia', 'TN', 'Africa', 51),
  ('Uganda', 'UG', 'Africa', 52),
  ('Zambia', 'ZM', 'Africa', 53),
  ('Zimbabwe', 'ZW', 'Africa', 54)
ON CONFLICT (name) DO NOTHING;

-- North America
INSERT INTO public.countries (name, iso_code_2, continent, sort_order) VALUES
  ('Antigua and Barbuda', 'AG', 'North America', 1),
  ('Bahamas', 'BS', 'North America', 2),
  ('Barbados', 'BB', 'North America', 3),
  ('Belize', 'BZ', 'North America', 4),
  ('Canada', 'CA', 'North America', 5),
  ('Costa Rica', 'CR', 'North America', 6),
  ('Cuba', 'CU', 'North America', 7),
  ('Dominica', 'DM', 'North America', 8),
  ('Dominican Republic', 'DO', 'North America', 9),
  ('El Salvador', 'SV', 'North America', 10),
  ('Grenada', 'GD', 'North America', 11),
  ('Guatemala', 'GT', 'North America', 12),
  ('Haiti', 'HT', 'North America', 13),
  ('Honduras', 'HN', 'North America', 14),
  ('Jamaica', 'JM', 'North America', 15),
  ('Mexico', 'MX', 'North America', 16),
  ('Nicaragua', 'NI', 'North America', 17),
  ('Panama', 'PA', 'North America', 18),
  ('Saint Kitts and Nevis', 'KN', 'North America', 19),
  ('Saint Lucia', 'LC', 'North America', 20),
  ('Saint Vincent and the Grenadines', 'VC', 'North America', 21),
  ('Trinidad and Tobago', 'TT', 'North America', 22),
  ('United States', 'US', 'North America', 23)
ON CONFLICT (name) DO NOTHING;

-- South America
INSERT INTO public.countries (name, iso_code_2, continent, sort_order) VALUES
  ('Argentina', 'AR', 'South America', 1),
  ('Bolivia', 'BO', 'South America', 2),
  ('Brazil', 'BR', 'South America', 3),
  ('Chile', 'CL', 'South America', 4),
  ('Colombia', 'CO', 'South America', 5),
  ('Ecuador', 'EC', 'South America', 6),
  ('Guyana', 'GY', 'South America', 7),
  ('Paraguay', 'PY', 'South America', 8),
  ('Peru', 'PE', 'South America', 9),
  ('Suriname', 'SR', 'South America', 10),
  ('Uruguay', 'UY', 'South America', 11),
  ('Venezuela', 'VE', 'South America', 12)
ON CONFLICT (name) DO NOTHING;

-- Oceania
INSERT INTO public.countries (name, iso_code_2, continent, sort_order) VALUES
  ('Australia', 'AU', 'Oceania', 1),
  ('Fiji', 'FJ', 'Oceania', 2),
  ('Kiribati', 'KI', 'Oceania', 3),
  ('Marshall Islands', 'MH', 'Oceania', 4),
  ('Micronesia', 'FM', 'Oceania', 5),
  ('Nauru', 'NR', 'Oceania', 6),
  ('New Zealand', 'NZ', 'Oceania', 7),
  ('Palau', 'PW', 'Oceania', 8),
  ('Papua New Guinea', 'PG', 'Oceania', 9),
  ('Samoa', 'WS', 'Oceania', 10),
  ('Solomon Islands', 'SB', 'Oceania', 11),
  ('Tonga', 'TO', 'Oceania', 12),
  ('Tuvalu', 'TV', 'Oceania', 13),
  ('Vanuatu', 'VU', 'Oceania', 14)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- PART 3: RLS policies - countries is public read
-- =====================================================
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "countries_select_all"
  ON public.countries
  FOR SELECT
  USING (true);

-- Only admins can modify
CREATE POLICY "countries_admin_modify"
  ON public.countries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('super admin', 'Director')
    )
  );

-- Grant read access
GRANT SELECT ON public.countries TO authenticated;
GRANT SELECT ON public.countries TO anon;
