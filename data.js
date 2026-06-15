/**
 * ZAM Club — Demo-Datenlayer (Präsentations-Version)
 * ============================================================
 * Realistische Inhalte für das ZAM Freiham (München-West).
 * Alle Feldnamen in snake_case — Supabase-ready.
 *
 * Supabase-Migration:
 *   1. Tabellen anlegen (SQL in /supabase/schema.sql)
 *   2. Diese Dateien durch API-Calls ersetzen:
 *      const { data } = await supabase.from('events').select('*')
 *   3. window.ZAMData.* durch die API-Responses ersetzen
 * ============================================================
 */

'use strict';

// ============================================================
// TABLE: profiles
// Supabase: auth.users (id) → public.profiles (user_id)
// ============================================================
const profiles = [
  {
    id:                      'usr_001',
    user_id:                 'usr_001',
    display_name:            'Julia Maier',
    username:                '@juliamaier',
    email:                   'julia.maier@example.de',
    avatar_url:              null,
    initials:                'JM',
    member_since:            '2024-03-10',
    member_since_formatted:  'Mitglied seit März 2024',
    level:                   'gold',
    points:                  1840,
    stats: {
      visits:           47,
      events_attended:  12,
      deals_used:       29,
    },
  },
];

const currentUser = profiles[0];

// ============================================================
// TABLE: badges
// Supabase: public.badges
// ============================================================
const badges = [
  {
    id:          'badge_001',
    name:        'Erster Besuch',
    icon:        '🏆',
    description: 'Herzlich willkommen im ZAM Freiham!',
    color:       '#f59e0b',
    earned:      true,
    earned_date: '2024-03-10',
  },
  {
    id:          'badge_002',
    name:        'Stammgast',
    icon:        '⭐',
    description: '10 Besuche im ZAM',
    color:       '#7c3aed',
    earned:      true,
    earned_date: '2024-06-05',
  },
  {
    id:          'badge_003',
    name:        'Deal Hunter',
    icon:        '🎯',
    description: '10 Deals erfolgreich eingelöst',
    color:       '#10b981',
    earned:      true,
    earned_date: '2024-08-22',
  },
  {
    id:          'badge_004',
    name:        'Community Star',
    icon:        '💬',
    description: '5 Beiträge in der Community geteilt',
    color:       '#3b82f6',
    earned:      true,
    earned_date: '2024-10-14',
  },
  {
    id:          'badge_005',
    name:        'Freiham Urgestein',
    icon:        '🏘️',
    description: '1 Jahr treues ZAM-Club-Mitglied',
    color:       '#ef4444',
    earned:      false,
    earned_date: null,
  },
  {
    id:          'badge_006',
    name:        'Spin Master',
    icon:        '🎰',
    description: '7 Tage in Folge am Glücksrad gedreht',
    color:       '#a855f7',
    earned:      false,
    earned_date: null,
  },
  {
    id:          'badge_007',
    name:        'Event-Enthusiast',
    icon:        '🎟️',
    description: 'An 5 ZAM-Events teilgenommen',
    color:       '#f59e0b',
    earned:      false,
    earned_date: null,
  },
  {
    id:          'badge_008',
    name:        'Platin-Star',
    icon:        '💎',
    description: '3.000 Punkte gesammelt',
    color:       '#c084fc',
    earned:      false,
    earned_date: null,
  },
  {
    id:          'badge_009',
    name:        'Foodie',
    icon:        '🍕',
    description: '5 Food & Drinks Deals eingelöst',
    color:       '#f97316',
    earned:      false,
    earned_date: null,
  },
  {
    id:          'badge_010',
    name:        'Check-in König',
    icon:        '📍',
    description: '20× im ZAM eingecheckt',
    color:       '#06b6d4',
    earned:      false,
    earned_date: null,
  },
];

// ============================================================
// TABLE: merchants
// Supabase: public.merchants
// ============================================================
const merchants = [
  {
    id:             'mer_001',
    name:           'Café Freiham',
    icon:           '☕',
    category:       'Café & Bäckerei',
    category_color: '#f59e0b',
    location:       'EG, Eingang West',
    floor:          'EG',
    hours:          'Mo–Sa 07:30–20:00, So 09:00–18:00',
    phone:          '+49 89 4521-0110',
    description:    'Das gemütliche Herzstück des ZAM. Frische Backwaren aus der Region, handgefertigte Kaffeespezialitäten und ein großer Außensitzbereich zum Durchatmen.',
    current_promo:  '2. Heißgetränk für 1 €',
    promo_color:    '#f59e0b',
    is_open:        true,
    rating:         4.9,
    review_count:   318,
    tags:           ['Frühstück', 'Bio-Kaffee', 'Kuchen', 'Terrasse'],
  },
  {
    id:             'mer_002',
    name:           'Odeya Fashion',
    icon:           '👗',
    category:       'Mode & Accessoires',
    category_color: '#ec4899',
    location:       'OG 1, Shop 14',
    floor:          'OG 1',
    hours:          'Mo–Sa 10:00–20:00',
    phone:          '+49 89 4521-0214',
    description:    'Kuratierte Mode aus nachhaltiger Produktion – von lässig bis elegant. Exklusiv für München-West mit kleinen unabhängigen Designlabels aus Deutschland und Europa.',
    current_promo:  '20% auf Nachhaltigkeits-Labels',
    promo_color:    '#ec4899',
    is_open:        true,
    rating:         4.6,
    review_count:   204,
    tags:           ['Damen', 'Herren', 'Nachhaltig', 'Lokal'],
  },
  {
    id:             'mer_003',
    name:           'Levante Kitchen',
    icon:           '🥙',
    category:       'Restaurant',
    category_color: '#ef4444',
    location:       'Food Court, OG 2',
    floor:          'OG 2',
    hours:          'Mo–So 11:00–21:30',
    phone:          '+49 89 4521-0321',
    description:    'Mediterran-levantinische Küche mit frischen Zutaten aus dem Großmarkt. Hummus, Falafel, Shakshuka und hausgemachtes Pita – ein Stück Tel Aviv in Freiham.',
    current_promo:  'Business Lunch: Tagesgericht + Getränk 10,90 €',
    promo_color:    '#ef4444',
    is_open:        true,
    rating:         4.8,
    review_count:   441,
    tags:           ['Vegetarisch', 'Vegan', 'Halal', 'Mittagstisch'],
  },
  {
    id:             'mer_004',
    name:           'Westside Gym',
    icon:           '💪',
    category:       'Sport & Wellness',
    category_color: '#10b981',
    location:       'OG 3, gesamte Etage',
    floor:          'OG 3',
    hours:          'Mo–Fr 06:00–23:00, Sa–So 08:00–21:00',
    phone:          '+49 89 4521-0430',
    description:    'Münchens modernster Fitness-Hub direkt im ZAM. 200+ Geräte, 30+ Kursformate pro Woche, Rooftop-Sauna mit Blick über Freiham und zertifizierte Personal Trainer.',
    current_promo:  'Probetraining: 7 Tage kostenlos',
    promo_color:    '#10b981',
    is_open:        true,
    rating:         4.7,
    review_count:   582,
    tags:           ['Gym', 'Yoga', 'Sauna', 'Personal Training', 'Rooftop'],
  },
  {
    id:             'mer_005',
    name:           'Welt der Bücher',
    icon:           '📚',
    category:       'Bücher & Kreatives',
    category_color: '#3b82f6',
    location:       'OG 1, Shop 08',
    floor:          'OG 1',
    hours:          'Mo–Sa 09:30–20:00',
    phone:          '+49 89 4521-0108',
    description:    'Über 35.000 Titel, ein kuratiertes Kinderbuch-Paradies, Schreibwaren und eine gemütliche Leselounge. Jeden Samstag: Autorenlesung für Kinder ab 4 Jahren.',
    current_promo:  '10% auf alle Neuerscheinungen',
    promo_color:    '#3b82f6',
    is_open:        true,
    rating:         4.5,
    review_count:   173,
    tags:           ['Romane', 'Sachbücher', 'Kinder', 'Lesung', 'Schreibwaren'],
  },
  {
    id:             'mer_006',
    name:           'Freiham Apotheke',
    icon:           '💊',
    category:       'Gesundheit & Beauty',
    category_color: '#06b6d4',
    location:       'EG, Shop 03',
    floor:          'EG',
    hours:          'Mo–Sa 08:00–20:00',
    phone:          '+49 89 4521-0103',
    description:    'Ihre Gesundheitsapotheke im ZAM mit kompetenter Beratung, breitem Naturkosmetik-Sortiment und kostenlosem Blutdruck-Check jeden Mittwoch.',
    current_promo:  'Sonnenschutz-Set 3 für 2',
    promo_color:    '#06b6d4',
    is_open:        true,
    rating:         4.8,
    review_count:   267,
    tags:           ['Medikamente', 'Naturkosmetik', 'Beratung', 'Homöopathie'],
  },
];

// ============================================================
// TABLE: events
// Supabase: public.events
// ============================================================
const events = [
  {
    id:             'evt_001',
    title:          'Morgen-Yoga im Atrium',
    category:       'Sport & Wellness',
    category_color: '#10b981',
    date_iso:       '2026-06-18',
    date_formatted: 'Mi, 18. Juni 2026',
    time_start:     '08:00',
    time_end:       '09:00',
    time:           '08:00 – 09:00 Uhr',
    location:       'Atrium, Erdgeschoss',
    merchant_id:    'mer_004',
    description:    'Starte deinen Mittwoch mit Energie: Eine Stunde Yoga für alle Levels – direkt unter dem Glasdach des ZAM-Atriums. Keine Vorkenntnisse nötig, Matte gerne mitbringen (Leihmatten vorhanden).',
    spots_total:    40,
    spots_left:     8,
    points_reward:  60,
    is_featured:    true,
    image_url:      null,
  },
  {
    id:             'evt_002',
    title:          'Freiham Sommer-Markt',
    category:       'Food & Lifestyle',
    category_color: '#f59e0b',
    date_iso:       '2026-06-21',
    date_formatted: 'Sa, 21. Juni 2026',
    time_start:     '10:00',
    time_end:       '19:00',
    time:           '10:00 – 19:00 Uhr',
    location:       'Vorplatz ZAM, Außenbereich',
    merchant_id:    null,
    description:    'Regionale Erzeuger, Münchner Foodtrucks und Live-Musik von Freihaimer Bands. Über 40 Aussteller, Kinderbereich mit Hüpfburg und kostenlose Sonnencreme-Station. Eintritt frei!',
    spots_total:    999,
    spots_left:     999,
    points_reward:  80,
    is_featured:    true,
    image_url:      null,
  },
  {
    id:             'evt_003',
    title:          'Kids Kreativ-Werkstatt',
    category:       'Familie',
    category_color: '#ec4899',
    date_iso:       '2026-06-25',
    date_formatted: 'Do, 25. Juni 2026',
    time_start:     '14:30',
    time_end:       '16:30',
    time:           '14:30 – 16:30 Uhr',
    location:       'Kinderbereich, OG 1',
    merchant_id:    null,
    description:    'Basteln, malen, stempeln: Eine kreative Werkstatt für Kinder von 4 bis 10 Jahren. Thema diesen Monat: „Unser Freiham" – Kinder gestalten ihr Viertel aus Papier und Farbe. Alle Materialien inklusive.',
    spots_total:    18,
    spots_left:     4,
    points_reward:  35,
    is_featured:    false,
    image_url:      null,
  },
  {
    id:             'evt_004',
    title:          'Live-Konzert: Sommernacht-Beats',
    category:       'Kultur & Musik',
    category_color: '#7c3aed',
    date_iso:       '2026-06-28',
    date_formatted: 'So, 28. Juni 2026',
    time_start:     '17:00',
    time_end:       '20:00',
    time:           '17:00 – 20:00 Uhr',
    location:       'Hauptbühne, EG',
    merchant_id:    null,
    description:    'Soul, Jazz und Singer-Songwriter aus München – drei Acts live auf der ZAM-Bühne. Perfekter Sonntagsabend-Ausklang mit Bar-Specials vom Café Freiham. Eintritt frei!',
    spots_total:    300,
    spots_left:     182,
    points_reward:  45,
    is_featured:    false,
    image_url:      null,
  },
  {
    id:             'evt_005',
    title:          'Nachhaltigkeits-Workshop',
    category:       'Community',
    category_color: '#06b6d4',
    date_iso:       '2026-07-03',
    date_formatted: 'Do, 3. Juli 2026',
    time_start:     '18:00',
    time_end:       '19:30',
    time:           '18:00 – 19:30 Uhr',
    location:       'Eventfläche, OG 2',
    merchant_id:    null,
    description:    'Gemeinsam mit dem ZAM und Partnern aus dem Viertel: Repair Café, Zero-Waste-Tipps und eine offene Runde zu nachhaltiger Nachbarschaft. Kostenlos, ohne Anmeldung.',
    spots_total:    60,
    spots_left:     31,
    points_reward:  50,
    is_featured:    false,
    image_url:      null,
  },
];

// ============================================================
// TABLE: deals
// Supabase: public.deals
// ============================================================
const deals = [
  {
    id:               'deal_001',
    merchant_id:      'mer_001',
    store_name:       'Café Freiham',
    store_icon:       '☕',
    category:         'Food & Drinks',
    category_color:   '#f59e0b',
    discount:         '2. für 1 €',
    title:            '2. Heißgetränk nur 1 Euro',
    description:      'Kauf ein Heißgetränk und bezahl für dein zweites nur 1 €. Gilt auf alle Kaffee- und Tee-Spezialitäten – auch auf Oat-Milk-Varianten.',
    expiry_date:      '2026-06-30',
    expiry_formatted: 'Gültig bis 30. Juni 2026',
    points_reward:    20,
    is_hot:           true,
    barcode:          '7821-4430-1190',
    image_url:        null,
  },
  {
    id:               'deal_002',
    merchant_id:      'mer_002',
    store_name:       'Odeya Fashion',
    store_icon:       '👗',
    category:         'Mode',
    category_color:   '#ec4899',
    discount:         '20%',
    title:            '20% auf nachhaltige Labels',
    description:      'Exklusiv für ZAM-Club-Mitglieder: 20% Rabatt auf alle Artikel der Nachhaltigkeits-Labels ARMEDANGELS, Recolution und Rewoolution.',
    expiry_date:      '2026-07-20',
    expiry_formatted: 'Gültig bis 20. Juli 2026',
    points_reward:    30,
    is_hot:           false,
    barcode:          '2210-9931-4482',
    image_url:        null,
  },
  {
    id:               'deal_003',
    merchant_id:      'mer_003',
    store_name:       'Levante Kitchen',
    store_icon:       '🥙',
    category:         'Restaurant',
    category_color:   '#ef4444',
    discount:         'Gratis',
    title:            'Gratis Hummus zu jedem Hauptgericht',
    description:      'Als ZAM-Club-Mitglied bekommst du zu jedem Hauptgericht eine Portion hausgemachten Hummus mit Pita gratis dazu. Mo–Fr, Mittagszeit (11–15 Uhr).',
    expiry_date:      '2026-06-29',
    expiry_formatted: 'Gültig bis 29. Juni 2026',
    points_reward:    25,
    is_hot:           true,
    barcode:          '3308-7742-6610',
    image_url:        null,
  },
  {
    id:               'deal_004',
    merchant_id:      'mer_004',
    store_name:       'Westside Gym',
    store_icon:       '💪',
    category:         'Sport & Wellness',
    category_color:   '#10b981',
    discount:         '7 Tage',
    title:            '7 Tage kostenlos trainieren',
    description:      'Teste den Westside Gym eine ganze Woche lang gratis – alle Geräte, alle Kurse, Sauna inklusive. Kein Abo, kein Risiko, einfach reinkommen.',
    expiry_date:      '2026-07-31',
    expiry_formatted: 'Gültig bis 31. Juli 2026',
    points_reward:    100,
    is_hot:           true,
    barcode:          '9901-2255-8843',
    image_url:        null,
  },
  {
    id:               'deal_005',
    merchant_id:      'mer_005',
    store_name:       'Welt der Bücher',
    store_icon:       '📚',
    category:         'Bücher & Kultur',
    category_color:   '#3b82f6',
    discount:         '10%',
    title:            '10% auf alle Neuerscheinungen',
    description:      'Alle Neuerscheinungen des Monats mit 10% Mitgliederrabatt – inklusive vorbestellter Titel. Gilt auch für Hörbuch-CDs und eBook-Codes.',
    expiry_date:      '2026-06-30',
    expiry_formatted: 'Gültig bis 30. Juni 2026',
    points_reward:    15,
    is_hot:           false,
    barcode:          '5512-3390-7721',
    image_url:        null,
  },
  {
    id:               'deal_006',
    merchant_id:      'mer_006',
    store_name:       'Freiham Apotheke',
    store_icon:       '💊',
    category:         'Gesundheit & Beauty',
    category_color:   '#06b6d4',
    discount:         '3 für 2',
    title:            'Sonnenschutz-Set: 3 für 2',
    description:      'Sommer-Special: Kaufe 3 Sonnenschutz-Produkte und bezahle nur 2. Günstigstes Produkt ist gratis. Gilt auf alle Marken von La Roche-Posay bis Altapharma.',
    expiry_date:      '2026-07-15',
    expiry_formatted: 'Gültig bis 15. Juli 2026',
    points_reward:    20,
    is_hot:           false,
    barcode:          '6643-8821-0057',
    image_url:        null,
  },
];

// ============================================================
// TABLE: community_posts
// Supabase: public.community_posts  +  public.profiles (join)
// ============================================================
const communityPosts = [
  {
    id:         'post_001',
    user_id:    'usr_042',
    author: {
      name:         'Mia K.',
      initials:     'MK',
      avatar_color: '#7c3aed',
      level:        'Gold Member',
    },
    content:    'Der Sommer-Markt am Samstag war einfach ein Traum ☀️ Die Holunderlimo vom Freihaimer Biohof, Livemusik unter freiem Himmel – genau so soll ein Wochenende aussehen. Danke ZAM! 💜',
    tags:       ['FreihamMarkt', 'ZAMSommer', 'FreihamLeben'],
    image_url:  null,
    likes:      61,
    comments:   9,
    created_at: '2026-06-15T08:30:00Z',
    time_ago:   'vor 1 Stunde',
    is_liked:   false,
  },
  {
    id:         'post_002',
    user_id:    'usr_017',
    author: {
      name:         'Felix B.',
      initials:     'FB',
      avatar_color: '#10b981',
      level:        'Silber Member',
    },
    content:    'Morgen-Yoga im Atrium – ich war skeptisch, ob das im Einkaufszentrum funktioniert. Aber wow: Glasdach, Morgenlicht, kein Lärm. Absolut entspannt und gut geführt. Nächste Woche wieder dabei! 🧘‍♂️',
    tags:       ['ZAMYoga', 'WestsideGym', 'MorgenRoutine'],
    image_url:  null,
    likes:      38,
    comments:   6,
    created_at: '2026-06-14T09:15:00Z',
    time_ago:   'vor 23 Stunden',
    is_liked:   false,
  },
  {
    id:         'post_003',
    user_id:    'usr_088',
    author: {
      name:         'Sarah L.',
      initials:     'SL',
      avatar_color: '#ec4899',
      level:        'Platin Member',
    },
    content:    'Tipp für alle Foodie-Club-Mitglieder: Das Business Lunch bei Levante Kitchen (Tagesgericht + Getränk 10,90 €) ist der beste Mittagstisch in ganz Freiham. Heute gab es Shakshuka mit frischem Pita – einfach unfassbar gut 🍳',
    tags:       ['LevanteKitchen', 'ZAMDeals', 'Freiham'],
    image_url:  null,
    likes:      54,
    comments:   12,
    created_at: '2026-06-13T13:00:00Z',
    time_ago:   'gestern',
    is_liked:   true,
  },
  {
    id:         'post_004',
    user_id:    'usr_031',
    author: {
      name:         'Tom W.',
      initials:     'TW',
      avatar_color: '#f59e0b',
      level:        'Gold Member',
    },
    content:    '7 Tage Westside Gym ausprobiert – und jetzt habe ich direkt eine Jahresmitgliedschaft abgeschlossen 😅 Die Rooftop-Sauna nach dem Training mit Blick über Freiham ist einfach unschlagbar. Deal aus der App hat sich mega gelohnt!',
    tags:       ['WestsideGym', 'ZAMClub', 'Fitnessziele'],
    image_url:  null,
    likes:      47,
    comments:   8,
    created_at: '2026-06-12T18:30:00Z',
    time_ago:   'vor 2 Tagen',
    is_liked:   false,
  },
  {
    id:         'post_005',
    user_id:    'usr_055',
    author: {
      name:         'Anna P.',
      initials:     'AP',
      avatar_color: '#3b82f6',
      level:        'Silber Member',
    },
    content:    'Meine Tochter (6) war heute bei der Kids Kreativ-Werkstatt – sie hat 2 Stunden lang gebastelt und wollte gar nicht mehr gehen 🎨 Das Betreuungsteam ist super lieb und geduldig. Absolute Empfehlung für Familien in Freiham!',
    tags:       ['KidsWorkshop', 'ZAMFamilie', 'FreihamKinder'],
    image_url:  null,
    likes:      39,
    comments:   5,
    created_at: '2026-06-11T17:00:00Z',
    time_ago:   'vor 4 Tagen',
    is_liked:   false,
  },
];

// ============================================================
// TABLE: spin_rewards  (config table)
// Supabase: public.spin_rewards
// ============================================================
const spinRewards = [
  { id: 'spin_001', label: '10 Punkte',      points: 10,  probability: 0.30 },
  { id: 'spin_002', label: '25 Punkte',      points: 25,  probability: 0.28 },
  { id: 'spin_003', label: '50 Punkte',      points: 50,  probability: 0.22 },
  { id: 'spin_004', label: '100 Punkte',     points: 100, probability: 0.12 },
  { id: 'spin_005', label: '250 Punkte',     points: 250, probability: 0.06 },
  { id: 'spin_006', label: '🎉 Jackpot 500', points: 500, probability: 0.02 },
];

// ============================================================
// Global namespace
// Supabase-Migration: ersetze jeden Wert durch einen API-Call.
//
// Beispiel (später):
//   ZAMData.events = (await supabase.from('events').select('*')).data;
// ============================================================
window.ZAMData = {
  currentUser,       // → supabase.auth.getUser()  +  profiles.select()
  profiles,          // → supabase.from('profiles').select()
  badges,            // → supabase.from('badges').select() + user_badges join
  merchants,         // → supabase.from('merchants').select()
  events,            // → supabase.from('events').select()
  deals,             // → supabase.from('deals').select()
  communityPosts,    // → supabase.from('community_posts').select('*, profiles(*)')
  spinRewards,       // → supabase.from('spin_rewards').select()
};
