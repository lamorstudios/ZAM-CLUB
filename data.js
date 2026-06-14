/**
 * ZAM Club — Mock Data Layer
 * ============================================================
 * Jedes Objekt entspricht einer zukünftigen Supabase-Tabelle.
 * Feldnamen sind in snake_case gehalten (PostgreSQL-Konvention).
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
    user_id:                 'usr_001',          // Foreign key → auth.users.id
    display_name:            'Max Müller',
    username:                '@maxmueller',
    email:                   'max.mueller@example.de',
    avatar_url:              null,               // Storage URL (Supabase Storage)
    initials:                'MM',
    member_since:            '2023-03-15',       // ISO date
    member_since_formatted:  'Mitglied seit März 2023',
    level:                   'gold',             // enum: bronze | silver | gold | platinum
    points:                  1247,
    stats: {
      visits:            34,
      events_attended:   8,
      deals_used:        21,
    },
  },
];

// Active user (single-user demo; replaced by auth.user() in Supabase)
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
    description: 'Dein erster Besuch im ZAM!',
    color:       '#f59e0b',
    // TABLE: user_badges (join)
    earned:      true,
    earned_date: '2023-03-15',
  },
  {
    id:          'badge_002',
    name:        'Super Fan',
    icon:        '⭐',
    description: '10 Besuche absolviert',
    color:       '#7c3aed',
    earned:      true,
    earned_date: '2023-05-20',
  },
  {
    id:          'badge_003',
    name:        'Deal Hunter',
    icon:        '🎯',
    description: '10 Deals eingelöst',
    color:       '#10b981',
    earned:      true,
    earned_date: '2023-07-11',
  },
  {
    id:          'badge_004',
    name:        'Community Star',
    icon:        '💬',
    description: '5 Beiträge in der Community gepostet',
    color:       '#3b82f6',
    earned:      true,
    earned_date: '2023-09-03',
  },
  {
    id:          'badge_005',
    name:        'Treue Seele',
    icon:        '❤️',
    description: '1 Jahr Mitglied im ZAM Club',
    color:       '#ef4444',
    earned:      false,
    earned_date: null,
  },
  {
    id:          'badge_006',
    name:        'Spin Master',
    icon:        '🎰',
    description: '7 Tage in Folge gedreht',
    color:       '#a855f7',
    earned:      false,
    earned_date: null,
  },
  {
    id:          'badge_007',
    name:        'Event Pro',
    icon:        '🎟️',
    description: 'An 5 Events teilgenommen',
    color:       '#f59e0b',
    earned:      false,
    earned_date: null,
  },
  {
    id:          'badge_008',
    name:        'Platin Star',
    icon:        '💎',
    description: '2.000 Punkte erreicht',
    color:       '#c084fc',
    earned:      false,
    earned_date: null,
  },
  {
    id:          'badge_009',
    name:        'Foodie',
    icon:        '🍕',
    description: '3 Food & Drinks Deals eingelöst',
    color:       '#f97316',
    earned:      false,
    earned_date: null,
  },
  {
    id:          'badge_010',
    name:        'Check-in King',
    icon:        '📍',
    description: '10× eingecheckt',
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
    name:           'Café Aroma',
    icon:           '☕',
    category:       'Café & Bäckerei',
    category_color: '#f59e0b',
    location:       'EG, Shop 12',
    floor:          'EG',
    hours:          'Mo–Sa 08:00–20:00, So 09:00–18:00',
    phone:          '+49 89 12345678',
    description:    'Ihr Wohlfühl-Café im ZAM mit hausgemachten Kuchen, fair-trade Kaffee und einem warmen Lächeln.',
    current_promo:  '20% auf alle Heißgetränke',
    promo_color:    '#f59e0b',
    is_open:        true,
    rating:         4.8,
    review_count:   247,
    tags:           ['Frühstück', 'Mittagsmenü', 'Kuchen', 'Vegetarisch'],
  },
  {
    id:             'mer_002',
    name:           'FashionHub',
    icon:           '👗',
    category:       'Mode & Accessoires',
    category_color: '#ec4899',
    location:       'OG 1, Shop 34',
    floor:          'OG 1',
    hours:          'Mo–Sa 10:00–20:00',
    phone:          '+49 89 23456789',
    description:    'Trendige Mode für die ganze Familie – von Casual bis Formal, von Urban bis Classic.',
    current_promo:  '15% Sommerrabatt',
    promo_color:    '#ec4899',
    is_open:        true,
    rating:         4.5,
    review_count:   183,
    tags:           ['Damen', 'Herren', 'Kinder', 'Sale'],
  },
  {
    id:             'mer_003',
    name:           'Trattoria Bella',
    icon:           '🍕',
    category:       'Restaurant',
    category_color: '#ef4444',
    location:       'Food Court, OG 2',
    floor:          'OG 2',
    hours:          'Mo–So 11:00–22:00',
    phone:          '+49 89 34567890',
    description:    'Authentische italienische Küche mit frischen Zutaten. Selbstgemachte Pasta, knusprige Pizza aus dem Steinofen.',
    current_promo:  '2+1 Pizza-Aktion',
    promo_color:    '#ef4444',
    is_open:        true,
    rating:         4.7,
    review_count:   312,
    tags:           ['Pizza', 'Pasta', 'Vegetarisch', 'Familienfreundlich'],
  },
  {
    id:             'mer_004',
    name:           'FitZone',
    icon:           '💪',
    category:       'Sport & Wellness',
    category_color: '#10b981',
    location:       'OG 3, gesamte Etage',
    floor:          'OG 3',
    hours:          'Mo–Fr 06:00–22:00, Sa–So 08:00–20:00',
    phone:          '+49 89 45678901',
    description:    'Modernster Fitnessbereich mit über 150 Geräten, Gruppenklassen, Sauna und Wellnessbereich.',
    current_promo:  '1 Monat gratis testen',
    promo_color:    '#10b981',
    is_open:        true,
    rating:         4.6,
    review_count:   428,
    tags:           ['Gym', 'Yoga', 'Sauna', 'Personal Training'],
  },
  {
    id:             'mer_005',
    name:           'Buchreich',
    icon:           '📚',
    category:       'Bücher & Papeterie',
    category_color: '#3b82f6',
    location:       'OG 1, Shop 21',
    floor:          'OG 1',
    hours:          'Mo–Sa 09:00–20:00',
    phone:          '+49 89 56789012',
    description:    'Große Auswahl an Büchern, Zeitschriften und Schreibwaren. Mit gemütlicher Leseecke und Café-Bar.',
    current_promo:  '10% auf alle Bestseller',
    promo_color:    '#3b82f6',
    is_open:        true,
    rating:         4.4,
    review_count:   156,
    tags:           ['Romane', 'Sachbücher', 'Kinder', 'Schreibwaren'],
  },
];

// ============================================================
// TABLE: events
// Supabase: public.events
// ============================================================
const events = [
  {
    id:             'evt_001',
    title:          'Fitness Morning – Yoga im Atrium',
    category:       'Sport',
    category_color: '#10b981',
    date_iso:       '2026-06-18',
    date_formatted: 'Mi, 18. Juni 2026',
    time_start:     '09:00',
    time_end:       '10:30',
    time:           '09:00 – 10:30 Uhr',
    location:       'Atrium, EG',
    merchant_id:    null,
    description:    'Starte energetisch in den Tag mit einer Yoga-Session mitten im Einkaufszentrum. Für alle Levels geeignet – Matte mitbringen!',
    spots_total:    30,
    spots_left:     7,
    points_reward:  50,
    is_featured:    true,
    image_url:      null,             // Supabase Storage URL
  },
  {
    id:             'evt_002',
    title:          'Street Food Festival',
    category:       'Food & Drinks',
    category_color: '#f59e0b',
    date_iso:       '2026-06-21',
    date_formatted: 'Sa, 21. Juni 2026',
    time_start:     '11:00',
    time_end:       '20:00',
    time:           '11:00 – 20:00 Uhr',
    location:       'Außenbereich West',
    merchant_id:    null,
    description:    'Internationale Küche, lokale Köstlichkeiten und Live-Cooking-Shows. Über 15 Food-Trucks warten auf euch!',
    spots_total:    500,
    spots_left:     312,
    points_reward:  75,
    is_featured:    true,
    image_url:      null,
  },
  {
    id:             'evt_003',
    title:          'Kids Workshop: Basteln & Malen',
    category:       'Familie',
    category_color: '#ec4899',
    date_iso:       '2026-06-25',
    date_formatted: 'Do, 25. Juni 2026',
    time_start:     '14:00',
    time_end:       '16:00',
    time:           '14:00 – 16:00 Uhr',
    location:       'Kinderparadies, OG 1',
    merchant_id:    null,
    description:    'Kreative Nachmittagsgestaltung für Kinder von 4–10 Jahren. Material wird gestellt. Anmeldung erforderlich.',
    spots_total:    20,
    spots_left:     5,
    points_reward:  30,
    is_featured:    false,
    image_url:      null,
  },
  {
    id:             'evt_004',
    title:          'Live Musik: Summer Vibes',
    category:       'Musik',
    category_color: '#7c3aed',
    date_iso:       '2026-06-28',
    date_formatted: 'So, 28. Juni 2026',
    time_start:     '15:00',
    time_end:       '18:00',
    time:           '15:00 – 18:00 Uhr',
    location:       'Hauptbühne, EG',
    merchant_id:    null,
    description:    'Genieße entspannte Summer-Beats von lokalen Künstlern. Eintritt frei – einfach vorbeikommen!',
    spots_total:    200,
    spots_left:     150,
    points_reward:  40,
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
    id:              'deal_001',
    merchant_id:     'mer_001',
    store_name:      'Café Aroma',
    store_icon:      '☕',
    category:        'Food & Drinks',
    category_color:  '#f59e0b',
    discount:        '20%',
    title:           '20% auf alle Heißgetränke',
    description:     'Gültig auf Kaffee, Cappuccino, Latte und alle Tee-Spezialitäten.',
    expiry_date:     '2026-06-30',
    expiry_formatted:'Gültig bis 30. Juni 2026',
    points_reward:   15,
    is_hot:          true,
    barcode:         '1234-5678-9012',
    image_url:       null,
  },
  {
    id:              'deal_002',
    merchant_id:     'mer_002',
    store_name:      'FashionHub',
    store_icon:      '👗',
    category:        'Mode',
    category_color:  '#ec4899',
    discount:        '15%',
    title:           '15% Rabatt auf Sommerkollektion',
    description:     'Auf die gesamte Sommerkollektion 2026 – Damen, Herren und Kinder.',
    expiry_date:     '2026-07-15',
    expiry_formatted:'Gültig bis 15. Juli 2026',
    points_reward:   25,
    is_hot:          false,
    barcode:         '2345-6789-0123',
    image_url:       null,
  },
  {
    id:              'deal_003',
    merchant_id:     'mer_003',
    store_name:      'Trattoria Bella',
    store_icon:      '🍕',
    category:        'Restaurant',
    category_color:  '#ef4444',
    discount:        '2+1',
    title:           '2 Pizzen kaufen, 1 gratis',
    description:     'Günstigste Pizza gratis bei Kauf von zwei Pizzen. Gültig Di–Do vor 18 Uhr.',
    expiry_date:     '2026-06-22',
    expiry_formatted:'Gültig bis 22. Juni 2026',
    points_reward:   30,
    is_hot:          true,
    barcode:         '3456-7890-1234',
    image_url:       null,
  },
  {
    id:              'deal_004',
    merchant_id:     'mer_005',
    store_name:      'Buchreich',
    store_icon:      '📚',
    category:        'Bücher',
    category_color:  '#3b82f6',
    discount:        '10%',
    title:           '10% auf Bestseller',
    description:     'Auf alle Spiegel-Bestseller des Monats Juni.',
    expiry_date:     '2026-06-30',
    expiry_formatted:'Gültig bis 30. Juni 2026',
    points_reward:   10,
    is_hot:          false,
    barcode:         '4567-8901-2345',
    image_url:       null,
  },
  {
    id:              'deal_005',
    merchant_id:     'mer_004',
    store_name:      'FitZone',
    store_icon:      '💪',
    category:        'Sport & Fitness',
    category_color:  '#10b981',
    discount:        '1 Monat',
    title:           '1 Monat gratis Probetraining',
    description:     'Teste alle Geräte, Kurse und den Wellness-Bereich gratis für einen Monat.',
    expiry_date:     '2026-07-31',
    expiry_formatted:'Gültig bis 31. Juli 2026',
    points_reward:   100,
    is_hot:          true,
    barcode:         '5678-9012-3456',
    image_url:       null,
  },
];

// ============================================================
// TABLE: community_posts
// Supabase: public.community_posts  +  public.profiles (join)
// ============================================================
const communityPosts = [
  {
    id:         'post_001',
    user_id:    'usr_002',
    author: {
      name:         'Lisa K.',
      initials:     'LK',
      avatar_color: '#7c3aed',
      level:        'Gold Member',
    },
    content:    'Das Street Food Festival war absolut der Hammer! Die koreanischen Tteokbokki vom letzten Jahr haben mich nicht losgelassen – hoffe dieses Jahr sind die auch wieder da 🔥',
    tags:       ['StreetFood', 'ZAMFestival'],
    image_url:  null,
    likes:      24,
    comments:   5,
    created_at: '2026-06-14T10:00:00Z',
    time_ago:   'vor 2 Stunden',
    is_liked:   false,              // client-side state (user_post_likes table in Supabase)
  },
  {
    id:         'post_002',
    user_id:    'usr_003',
    author: {
      name:         'Thomas R.',
      initials:     'TR',
      avatar_color: '#10b981',
      level:        'Silber Member',
    },
    content:    'Heute beim Yoga-Kurs mitgemacht – was für ein tolles Erlebnis direkt im Atrium! Die Atmosphäre war unglaublich. Nächste Woche bin ich auf jeden Fall wieder dabei. 🧘‍♂️',
    tags:       ['Yoga', 'Fitness', 'ZAMLife'],
    image_url:  null,
    likes:      18,
    comments:   3,
    created_at: '2026-06-14T06:00:00Z',
    time_ago:   'vor 6 Stunden',
    is_liked:   false,
  },
  {
    id:         'post_003',
    user_id:    'usr_004',
    author: {
      name:         'Sarah M.',
      initials:     'SM',
      avatar_color: '#ec4899',
      level:        'Platin Member',
    },
    content:    'Den FitZone Gutschein (1 Monat gratis) eingelöst und schon am ersten Tag bereut – bereut dass ich nicht früher angefangen habe! Die Anlage ist top, Personal super freundlich. 💪',
    tags:       ['FitZone', 'Deals', 'Empfehlung'],
    image_url:  null,
    likes:      41,
    comments:   9,
    created_at: '2026-06-13T14:00:00Z',
    time_ago:   'gestern',
    is_liked:   true,
  },
  {
    id:         'post_004',
    user_id:    'usr_005',
    author: {
      name:         'Michael B.',
      initials:     'MB',
      avatar_color: '#f59e0b',
      level:        'Gold Member',
    },
    content:    'Hat jemand die neue Sommerkollektion bei FashionHub gesehen? Die Auswahl ist dieses Jahr wirklich stark! Mit dem 15%-Deal ein echtes Schnäppchen gemacht 🛍️',
    tags:       ['Fashion', 'Shopping', 'ZAMDeals'],
    image_url:  null,
    likes:      12,
    comments:   2,
    created_at: '2026-06-13T09:00:00Z',
    time_ago:   'gestern',
    is_liked:   false,
  },
  {
    id:         'post_005',
    user_id:    'usr_006',
    author: {
      name:         'Anna W.',
      initials:     'AW',
      avatar_color: '#3b82f6',
      level:        'Silber Member',
    },
    content:    'Kids Workshop letzten Donnerstag – meine Tochter (7) hatte eine Riesenfreude! Die Betreuer waren so geduldig und kreativ. Absolute Empfehlung für Familien ⭐',
    tags:       ['Kids', 'Familie', 'Workshop'],
    image_url:  null,
    likes:      33,
    comments:   7,
    created_at: '2026-06-11T18:00:00Z',
    time_ago:   'vor 3 Tagen',
    is_liked:   false,
  },
];

// ============================================================
// TABLE: spin_rewards  (config table, seldom changes)
// Supabase: public.spin_rewards
// ============================================================
const spinRewards = [
  { id: 'spin_001', label: '10 Punkte',     points: 10,  probability: 0.30 },
  { id: 'spin_002', label: '25 Punkte',     points: 25,  probability: 0.30 },
  { id: 'spin_003', label: '50 Punkte',     points: 50,  probability: 0.20 },
  { id: 'spin_004', label: '100 Punkte',    points: 100, probability: 0.12 },
  { id: 'spin_005', label: '200 Punkte',    points: 200, probability: 0.06 },
  { id: 'spin_006', label: 'Jackpot! 500P', points: 500, probability: 0.02 },
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
