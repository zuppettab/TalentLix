// utils/sports.js
const sports = [
  // 🔹 Sport Olimpici principali
  { value: 'Athletics', label: 'Athletics' },
  { value: 'Archery', label: 'Archery' },
  { value: 'Badminton', label: 'Badminton' },
  { value: 'Baseball', label: 'Baseball' },
  { value: 'Basketball', label: 'Basketball' },
  { value: 'Boxing', label: 'Boxing' },
  { value: 'Canoeing', label: 'Canoeing' },
  { value: 'Cycling', label: 'Cycling' },
  { value: 'Diving', label: 'Diving' },
  { value: 'Equestrian', label: 'Equestrian' },
  { value: 'Fencing', label: 'Fencing' },
  { value: 'Field_hockey', label: 'Field Hockey' },
  { value: 'Football', label: 'Football (Soccer)' },
  { value: 'Golf', label: 'Golf' },
  { value: 'Gymnastics', label: 'Gymnastics' },
  { value: 'Handball', label: 'Handball' },
  { value: 'Judo', label: 'Judo' },
  { value: 'Karate', label: 'Karate' },
  { value: 'Rowing', label: 'Rowing' },
  { value: 'Rugby', label: 'Rugby' },
  { value: 'Sailing', label: 'Sailing' },
  { value: 'Shooting', label: 'Shooting' },
  { value: 'Skateboarding', label: 'Skateboarding' },
  { value: 'Softball', label: 'Softball' },
  { value: 'Sport_climbing', label: 'Sport Climbing' },
  { value: 'Surfing', label: 'Surfing' },
  { value: 'Swimming', label: 'Swimming' },
  { value: 'Table_tennis', label: 'Table Tennis' },
  { value: 'Taekwondo', label: 'Taekwondo' },
  { value: 'Tennis', label: 'Tennis' },
  { value: 'Triathlon', label: 'Triathlon' },
  { value: 'Volleyball', label: 'Volleyball' },
  { value: 'Water_polo', label: 'Water Polo' },
  { value: 'Weightlifting', label: 'Weightlifting' },
  { value: 'Wrestling', label: 'Wrestling' },

  // 🔹 Sport Invernali
  { value: 'Alpine_skiing', label: 'Alpine Skiing' },
  { value: 'Biathlon', label: 'Biathlon' },
  { value: 'Bobsleigh', label: 'Bobsleigh' },
  { value: 'Cross_country_skiing', label: 'Cross-Country Skiing' },
  { value: 'Curling', label: 'Curling' },
  { value: 'Figure_skating', label: 'Figure Skating' },
  { value: 'Freestyle_skiing', label: 'Freestyle Skiing' },
  { value: 'Ice_hockey', label: 'Ice Hockey' },
  { value: 'Luge', label: 'Luge' },
  { value: 'Nordic_combined', label: 'Nordic Combined' },
  { value: 'Short_track', label: 'Short Track Speed Skating' },
  { value: 'Skeleton', label: 'Skeleton' },
  { value: 'Ski_jumping', label: 'Ski Jumping' },
  { value: 'Snowboarding', label: 'Snowboarding' },
  { value: 'Speed_skating', label: 'Speed Skating' },

  // 🔹 Sport da Combattimento & Arti Marziali
  { value: 'Aikido', label: 'Aikido' },
  { value: 'Brazilian_jiu_jitsu', label: 'Brazilian Jiu-Jitsu' },
  { value: 'Capoeira', label: 'Capoeira' },
  { value: 'Kung_fu', label: 'Kung Fu' },
  { value: 'Mixed_martial_arts', label: 'Mixed Martial Arts (MMA)' },
  { value: 'Muay_thai', label: 'Muay Thai' },
  { value: 'Sambo', label: 'Sambo' },
  { value: 'Sumo', label: 'Sumo' },

  // 🔹 Sport Acquatici
  { value: 'Canoe_polo', label: 'Canoe Polo' },
  { value: 'Kayaking', label: 'Kayaking' },
  { value: 'Kitesurfing', label: 'Kitesurfing' },
  { value: 'Open_water_swimming', label: 'Open Water Swimming' },
  { value: 'Scuba_diving', label: 'Scuba Diving' },
  { value: 'Synchronized_swimming', label: 'Synchronized Swimming' },
  { value: 'Windsurfing', label: 'Windsurfing' },

  // 🔹 Sport con Racchetta
  { value: 'Paddle', label: 'Paddle Tennis' },
  { value: 'Pickleball', label: 'Pickleball' },
  { value: 'Squash', label: 'Squash' },

  // 🔹 Sport Motoristici
  { value: 'Formula1', label: 'Formula 1' },
  { value: 'Moto_gp', label: 'MotoGP' },
  { value: 'Rally', label: 'Rally' },
  { value: 'Karting', label: 'Karting' },
  { value: 'Motocross', label: 'Motocross' },

  // 🔹 Sport di Precisione
  { value: 'Billiards', label: 'Billiards' },
  { value: 'Bowling', label: 'Bowling' },
  { value: 'Chess', label: 'Chess' },
  { value: 'Darts', label: 'Darts' },

  // 🔹 Sport Outdoor & Estremi
  { value: 'Climbing', label: 'Climbing' },
  { value: 'Mountaineering', label: 'Mountaineering' },
  { value: 'Orienteering', label: 'Orienteering' },
  { value: 'Paragliding', label: 'Paragliding' },
  { value: 'Parkour', label: 'Parkour' },
  { value: 'Skating', label: 'Skating' },
  { value: 'Ultimate_frisbee', label: 'Ultimate Frisbee' },

  // 🔹 Altri sport popolari
  { value: 'American_football', label: 'American Football' },
  { value: 'Australian_rules', label: 'Australian Rules Football' },
  { value: 'Cricket', label: 'Cricket' },
  { value: 'Gaelic_football', label: 'Gaelic Football' },
  { value: 'Lacrosse', label: 'Lacrosse' },
  { value: 'Netball', label: 'Netball' },
  { value: 'Polo', label: 'Polo' },
  { value: 'Roller_hockey', label: 'Roller Hockey' },
  { value: 'Sepaktakraw', label: 'Sepak Takraw' },
  { value: 'Water_skiing', label: 'Water Skiing' }
];

export default sports;
