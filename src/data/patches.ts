export type Stat = {
  label: string;
  value: string;
  note?: string;
  tone?: 'error' | 'primary' | 'tertiary';
};

export type Patch = {
  slug: string;
  tag: string;
  tagClass: string;
  code: string;
  title: string;
  body: string;
  classes: string[];
  stats: Stat[];
  notice?: string;
  gmNote: string;
};

export const filters = [
  { id: 'all', label: 'ALL RELEASES' },
  { id: 'transport', label: 'TRANSPORT REBALANCE' },
  { id: 'agri', label: 'AGRI-ECONOMY' },
  { id: 'heat', label: 'HEAT INDEX ALERT' },
  { id: 'utilities', label: 'PUBLIC UTILITIES' },
  { id: 'culture', label: 'POP CULTURE & BINI' },
];

export const patches: Patch[] = [
  {
    slug: 'transport',
    tag: 'TRANSPORT REBALANCE',
    tagClass: 'bg-secondary text-on-secondary',
    code: 'LTFRB-2025',
    title:
      'Jeepney Modernization System Overhaul; Traditional Carts Phaseout Postponed',
    body: 'Pursuant to DOTr & LTFRB GM directives, all Blacksmith and Merchant guilds are mandated to transition traditional Diesel Poring Carts to Air-conditioned Euro-4 Mado Carts. Consolidation deadline extended for the 8th consecutive time following nationwide PISTON strike protests.',
    classes: ['Merchant', 'Blacksmith', 'Novice'],
    stats: [
      {
        label: 'Modern Cart Upgrade Fee',
        value: '+500,000 Zeny Co-op Equity',
        note: 'Mandatory consolidated franchise fee',
        tone: 'error',
      },
      {
        label: 'Traditional Jeepney HP',
        value: 'Nerfed by -15% Max Durability',
        note: 'Smoke-belching emissions penalty applied',
        tone: 'error',
      },
      {
        label: 'Beep Card Tap Lag',
        value: '2.4s Tap-In Turnstile Delay',
        note: 'Frequent offline RFID gateway errors',
        tone: 'error',
      },
    ],
    notice:
      "[Traffic GM Notice] Unregistered 'Colorum' carts caught ferrying Novices along Commonwealth Avenue will be impounded at Camp Crame dungeon.",
    gmNote:
      'We are told the 500,000 Zeny equity fee is "affordable." We heard that from a guild master with three accounts. Phaseout is postponed to whenever the next strike ends. — GM_Trapik',
  },
  {
    slug: 'agri',
    tag: 'AGRI-ECONOMY',
    tagClass: 'bg-primary text-on-primary',
    code: 'DA-ONION',
    title:
      'Red Onion & Rice Market Price Floor Exploit Fixed; Divisoria Vending Caps Imposed',
    body: 'Smuggled Red Onion items from foreign servers discovered stored inside Cold Storage dungeons in Subic & Manila Harbor. Department of Agriculture GMs impose strict price caps on Sinangag & Sisig culinary consumables across all Divisoria street vendors.',
    classes: ['Merchant', 'Alchemist', 'Blacksmith'],
    stats: [
      {
        label: 'Card Item: Golden Sibuyas',
        value: '+20 LUK Buff',
        note: 'MVP consumable · 250 SP per Sinangag plate',
      },
      {
        label: 'Market Cost (Divisoria NPC)',
        value: '800 Zeny each',
        note: '+300% inflation vs. base vendor price',
        tone: 'error',
      },
      {
        label: 'Farm Harvest Drop Rate',
        value: '0.02% base',
        note: 'Nueva Ecija map · hoarding guilds face BOC warehouse forfeiture',
        tone: 'error',
      },
    ],
    gmNote:
      'Onion drop rates were never meant to fund a private jet. We are nerfing the cartel, not the farmers. If your warehouse is colder than the map, expect a visit from a BOC raid party. — GM_Agri',
  },
  {
    slug: 'heat',
    tag: 'HEAT INDEX ALERT',
    tagClass: 'bg-secondary-container text-on-secondary-container',
    code: 'PAGASA-HEAT',
    title:
      "Heat Index Danger Level Event: 44°C 'El Niño' Debuff Active Nationwide",
    body: 'PAGASA weather mages issue extreme Heat Index warnings across all zones (Tuguegarao, Cavite, Dagupan). Novice classes are forced to conduct asynchronous modular training inside save point homes to avoid the heat exhaustion status effect.',
    classes: ['All classes', 'Novice'],
    stats: [
      {
        label: "'Pasa-Pasada' Commuter Stamina",
        value: 'Drains 3x Faster Under Sunlight',
        note: 'Walking under 11:00 ~ 15:00 sun inflicts continuous dehydration HP loss.',
        tone: 'error',
      },
      {
        label: 'Halo-Halo Consumable Buff',
        value: '+50 Heat Resistance (15 min)',
        note: 'Ube ice cream and crushed ice provide instantaneous thermal relief.',
        tone: 'primary',
      },
      {
        label: 'Electric Fan Durability',
        value: '-20% Daily Degradation',
        note: 'Desk fans operating on #3 setting risk overheating motor failure.',
        tone: 'tertiary',
      },
    ],
    gmNote:
      '44°C is a debuff, not a personality. Halo-Halo remains the only sanctioned counter-buff. Electric fans on setting 3 are now classified as consumable items. — GM_Banlik',
  },
  {
    slug: 'utilities',
    tag: 'PUBLIC UTILITIES',
    tagClass: 'bg-tertiary text-on-tertiary',
    code: 'MAYNILAD-ROLLOUT',
    title:
      'Meralco & Water Interruption Scheduled Downtime (Maynilad Pipeline Maintenance)',
    body: 'Scheduled rolling blackouts and water pressure drops across West Manila & Caloocan maps due to an algal bloom in the Angat Dam lake dungeon. All Alchemist potion brewing success rate decreased by 10% during low pressure hours.',
    classes: ['Alchemist', 'Acolyte'],
    stats: [
      {
        label: 'Rolling Blackout Window',
        value: '09:00 ~ 12:00 / 14:00 ~ 17:00 PHT',
        note: 'Rotating two-hour blocks across West Manila & Caloocan',
        tone: 'error',
      },
      {
        label: 'Alchemist Brew Success Rate',
        value: '-10% During Low Pressure',
        note: 'Angat Dam algal bloom event active',
        tone: 'error',
      },
    ],
    notice:
      'Mandatory water storing notice: fill blue drums (timba at tabo) before 21:00 PHT daily. Unstocked potion labs face temporary closure.',
    gmNote:
      'Angat Dam is at 178.4m. We know. You know. Meralco knows. Please store water, and please stop watering the driveway at 6 AM. — GM_Utilities',
  },
  {
    slug: 'culture',
    tag: 'POP CULTURE & BINI',
    tagClass: 'bg-surface-tint text-on-primary',
    code: 'BINI-FEVER',
    title:
      "P-Pop & BINI Spell Fever: 'Pantropiko' Dance Emote Added to All Classes",
    body: 'Grand cultural festival event across Mall of Asia open grounds! New global emote command /pantropiko grants +5 ASPD and +10% party morale when performed in synchronized groups of 8 Blooms across all Philippine server towns.',
    classes: ['All classes', 'Bard / Dancer'],
    stats: [
      {
        label: '/pantropiko Global Emote',
        value: '+5 ASPD · +10% Party Morale',
        note: 'Requires 8 Blooms in synchronized formation',
        tone: 'primary',
      },
      {
        label: 'Cherry On Top Headgear',
        value: 'Limited Summer Drop',
        note: 'Hourly flash mobs at Prontera Fountain & Luneta Park map',
        tone: 'primary',
      },
    ],
    gmNote:
      'Yes, the emote stacks. No, you cannot use it to skip the MRT queue. BINI has not agreed to buff your farm rate, please stop asking. — GM_Festival',
  },
];
