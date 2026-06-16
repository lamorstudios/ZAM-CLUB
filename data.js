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
    points:                  2460,
    stats: {
      visits:           63,
      events_attended:  18,
      deals_used:       41,
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
    title:          'Freiham Sommer-Markt 2026',
    category:       'Food & Lifestyle',
    category_color: '#f59e0b',
    date_iso:       '2026-06-21',
    date_formatted: 'Sa, 21. Juni 2026',
    time_start:     '10:00',
    time_end:       '19:00',
    time:           '10:00 – 19:00 Uhr',
    location:       'Vorplatz ZAM, Außenbereich',
    merchant_id:    null,
    description:    'Das größte Freiham-Event des Jahres: Regionale Erzeuger, Münchner Foodtrucks und Live-Musik von lokalen Bands. Über 40 Aussteller, Kinderbereich mit Hüpfburg und Mitmach-Aktionen. Eintritt frei – ZAM-Club-Mitglieder erhalten +80 Punkte beim Check-in!',
    spots_total:    999,
    spots_left:     999,
    points_reward:  80,
    is_featured:    true,
    image_url:      null,
  },
  {
    id:             'evt_002',
    title:          'Sommernacht-Konzert im ZAM',
    category:       'Kultur & Musik',
    category_color: '#FA4615',
    date_iso:       '2026-06-28',
    date_formatted: 'So, 28. Juni 2026',
    time_start:     '17:00',
    time_end:       '21:00',
    time:           '17:00 – 21:00 Uhr',
    location:       'Hauptbühne, EG – Mahatma-Gandhi-Platz',
    merchant_id:    null,
    description:    'Soul, Jazz und Singer-Songwriter aus München – vier Live-Acts auf der ZAM-Hauptbühne. Bar-Specials vom Café Freiham und Levante Kitchen ab 16 Uhr. Eintritt frei! Club-Mitglieder erhalten +45 Punkte und exklusiven Backstage-Zugang per QR-Code.',
    spots_total:    500,
    spots_left:     348,
    points_reward:  45,
    is_featured:    true,
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
    merchant_id:      'mer_004',
    store_name:       'Westside Gym',
    store_icon:       '💪',
    category:         'Sport & Wellness',
    category_color:   '#10b981',
    discount:         '7 Tage',
    title:            '7 Tage kostenlos trainieren',
    description:      'Teste den Westside Gym eine ganze Woche lang gratis – alle Geräte, alle Kurse, Rooftop-Sauna inklusive. Kein Abo, kein Risiko, einfach mit der ZAM-Club-App reinkommen.',
    expiry_date:      '2026-07-31',
    expiry_formatted: 'Gültig bis 31. Juli 2026',
    points_reward:    100,
    is_hot:           true,
    barcode:          '9901-2255-8843',
    image_url:        null,
  },
  {
    id:               'deal_002',
    merchant_id:      'mer_001',
    store_name:       'Café Freiham',
    store_icon:       '☕',
    category:         'Food & Drinks',
    category_color:   '#f59e0b',
    discount:         '2. für 1 €',
    title:            '2. Heißgetränk für 1 €',
    description:      'Hol dir deinen Lieblingskaffee – und das zweite Heißgetränk zahlst du nur 1 €. Gilt auf alle Kaffee- und Tee-Spezialitäten, auch auf Oat-Milk-Varianten. Täglich 07:30–11:00 Uhr.',
    expiry_date:      '2026-07-31',
    expiry_formatted: 'Gültig bis 31. Juli 2026',
    points_reward:    30,
    is_hot:           true,
    barcode:          '7821-4430-1190',
    image_url:        null,
  },
  {
    id:               'deal_003',
    merchant_id:      'mer_002',
    store_name:       'Odeya Fashion',
    store_icon:       '👗',
    category:         'Mode',
    category_color:   '#ec4899',
    discount:         '20%',
    title:            '20% Mitglieder-Rabatt auf alles',
    description:      'Exklusiv für ZAM-Club-Mitglieder: 20% Rabatt auf das gesamte Sortiment – nachhaltige Labels wie ARMEDANGELS, Recolution und Odeya-Eigenmarken. Einfach App zeigen, fertig.',
    expiry_date:      '2026-07-20',
    expiry_formatted: 'Gültig bis 20. Juli 2026',
    points_reward:    50,
    is_hot:           true,
    barcode:          '2210-9931-4482',
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
// TABLE: spin_merchant_rewards
// Supabase: public.spin_merchant_rewards
// Händler können Gewinne für den Lucky Spin einreichen.
// ============================================================
const spinMerchantRewards = [
  {
    id:                  'spr_001',
    merchant_id:         'mer_gelato',
    merchant_name:       'Gelato di Monaco',
    merchant_icon:       '🍦',
    banner_color:        '#0891b2',
    title:               'Gratis Eiskugel in der Waffel',
    description:         'Eine Kugel Eis deiner Wahl gratis – direkt an der Gelato-Station im ZAM-Erdgeschoss.',
    reward_type:         'gratis_product',
    total_quantity:      10,
    remaining_quantity:  7,
    active_from:         '2026-06-16',
    active_until:        '2026-06-26',
    redeem_within_days:  14,
    terms:               'Gilt für 1 Kugel. Nicht mit anderen Aktionen kombinierbar.',
    status:              'approved',
    probability:         0.04,
  },
  {
    id:                  'spr_002',
    merchant_id:         'mer_pitsburger',
    merchant_name:       'Pitsburger',
    merchant_icon:       '🍔',
    banner_color:        '#b91c1c',
    title:               '2 Menüs zum Preis von 1',
    description:         'Zwei Burger-Menüs (Burger + Beilage + Getränk) zum Preis von einem. Ideal für ein Lunch mit Freunden.',
    reward_type:         '2für1',
    total_quantity:      2,
    remaining_quantity:  2,
    active_from:         '2026-06-16',
    active_until:        '2026-06-23',
    redeem_within_days:  7,
    terms:               'Gilt für 2 Standardmenüs (max. Wert 18 €). Einmalig einlösbar.',
    status:              'approved',
    probability:         0.025,
  },
  {
    id:                  'spr_003',
    merchant_id:         'mer_001',
    merchant_name:       'Café Freiham',
    merchant_icon:       '☕',
    banner_color:        '#b45309',
    title:               'Gratis Heißgetränk',
    description:         'Ein Heißgetränk deiner Wahl gratis. Gilt auf alle Kaffee- und Tee-Spezialitäten, auch Oat-Milk-Varianten.',
    reward_type:         'gratis_product',
    total_quantity:      5,
    remaining_quantity:  4,
    active_from:         '2026-06-16',
    active_until:        '2026-06-30',
    redeem_within_days:  14,
    terms:               'Gilt für 1 Heißgetränk (max. Wert 5,50 €). Mo–Sa bis 11 Uhr.',
    status:              'approved',
    probability:         0.035,
  },
  {
    id:                  'spr_004',
    merchant_id:         'mer_asia',
    merchant_name:       'Asia Street Food',
    merchant_icon:       '🥢',
    banner_color:        '#065f46',
    title:               'Gratis Frühlingsrollen',
    description:         '2 hausgemachte Frühlingsrollen gratis zum Hauptgericht. Einzulösen bei Asia Street Food im Food Court OG 2.',
    reward_type:         'gratis_product',
    total_quantity:      3,
    remaining_quantity:  2,
    active_from:         '2026-06-16',
    active_until:        '2026-06-22',
    redeem_within_days:  7,
    terms:               '2 Frühlingsrollen gratis. Nur bei Kauf eines Hauptgerichts. Pro Person einmalig.',
    status:              'approved',
    probability:         0.03,
  },
  {
    id:                  'spr_005',
    merchant_id:         'mer_002',
    merchant_name:       'Odeya Fashion',
    merchant_icon:       '👗',
    banner_color:        '#be185d',
    title:               '30% Rabatt-Coupon',
    description:         'Exklusiver Spin-Gewinn: 30% auf deinen nächsten Einkauf bei Odeya Fashion – mehr als mit der Standard-Mitgliedschaft.',
    reward_type:         'discount',
    total_quantity:      3,
    remaining_quantity:  3,
    active_from:         '2026-06-16',
    active_until:        '2026-06-30',
    redeem_within_days:  10,
    terms:               'Gilt auf reguläre Artikel. Nicht auf Sale-Ware. Einmalig einlösbar.',
    status:              'pending',
    probability:         0.02,
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
// TABLE: challenges (monthly)
// ============================================================
const challenges = [
  { id: 'ch_001', title: 'Händler-Entdecker',  description: 'Checke bei 3 verschiedenen Händlern ein', icon: '🏪', target: 3, stat: 'visits',          reward_pts: 100 },
  { id: 'ch_002', title: 'Deal-Sammler',        description: 'Speichere oder sichere 5 Deals',          icon: '🏷️', target: 5, stat: 'deals_saved',     reward_pts: 150 },
  { id: 'ch_003', title: 'Event-Fan',           description: 'Nimm an 2 Events teil',                   icon: '🎟️', target: 2, stat: 'events_attended', reward_pts: 120 },
  { id: 'ch_004', title: 'Community-Starter',   description: 'Teile deinen ersten Beitrag',              icon: '💬', target: 1, stat: 'posts_created',   reward_pts:  75 },
  { id: 'ch_005', title: 'Spin-Profi',          description: '5× am Glücksrad drehen',                  icon: '🎰', target: 5, stat: 'spins',            reward_pts:  80 },
];

// ============================================================
// Global namespace
// Supabase-Migration: ersetze jeden Wert durch einen API-Call.
//
// Beispiel (später):
//   ZAMData.events = (await supabase.from('events').select('*')).data;
// ============================================================
window.ZAMData = {
  currentUser,            // → supabase.auth.getUser()  +  profiles.select()
  profiles,               // → supabase.from('profiles').select()
  badges,                 // → supabase.from('badges').select() + user_badges join
  merchants,              // → supabase.from('merchants').select()
  events,                 // → supabase.from('events').select()
  deals,                  // → supabase.from('deals').select()
  communityPosts,         // → supabase.from('community_posts').select('*, profiles(*)')
  spinRewards,            // → supabase.from('spin_rewards').select()
  spinMerchantRewards,    // → supabase.from('spin_merchant_rewards').select()
  challenges,             // → supabase.from('challenges').select()
};
