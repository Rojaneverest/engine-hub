/* Atlas: magazine features about each engine layout.
   Every dated claim in a timeline carries a source. Photos are keys into credits.json (Wikimedia Commons, freely
   licensed, credited on the page); renders are the app's own model (scripts/render-atlas.mjs). Engineering facts
   (firing order, interval, balance, pros and cons) come from the shared ARCHS content, so the Atlas and the
   Engine page never disagree. */
const W = t => 'https://en.wikipedia.org/wiki/' + t;

export const ATLAS_INTRO = {
  title: 'Atlas',
  strap: 'Six ways to arrange a four-stroke engine, and the machines that made them famous.',
  lede: 'Every engine in this Atlas runs the same four-stroke cycle. What changes is how many cylinders there are and where they sit: in a row, in a V, lying flat. That arrangement decides how an engine feels, how it sounds, where it fits and which cars it ended up in.',
};

export const ATLAS = [
  {
    id: 'origins', kicker: 'Opening story', title: 'Four strokes that moved the world',
    dek: 'Before there were layouts there was a cycle: draw in, squeeze, burn, push out. It was patented on paper in 1862, made to run in 1876, and put on wheels in 1886.',
    photo: 'otto_engine', photoCaption: 'A four-stroke gas engine built by Crossley Brothers to Nicolaus Otto’s design, 1876–77. Stationary engines like this ran workshops long before one moved a car.',
    body: [
      ['An idea on paper', 'In 1862 the French engineer Alphonse Beau de Rochas patented the concept of a four-cycle engine: draw in a charge, compress it, burn it, and push the burned gas out. He never built one. The idea waited for someone to make it work.'],
      ['Otto makes it run', 'Nicolaus Otto had founded N.A. Otto & Cie with Eugen Langen in 1864, the first company devoted entirely to internal combustion engines. In 1876 his compressed-charge four-stroke engine appeared and was an immediate success. Compressing the charge before lighting it made the engine far more efficient than the gas engines of the day, and the cycle it ran still carries his name.'],
      ['Onto the road', 'Karl Benz filed the patent for his Patent-Motorwagen on 29 January 1886. It was a three-wheeler driven by a single-cylinder four-stroke of 954 cc, making about two-thirds of a horsepower at 400 rpm. In August 1888 Bertha Benz took one on a long-distance drive to see her family, a journey that showed the world, and her husband, what the car could do and where it struggled: going up hills.'],
    ],
    quote: 'Every engine since has run the same four strokes. What changed is how many cylinders share them.',
    timeline: [
      { year: '1862', text: 'Beau de Rochas patents the concept of the four-cycle engine.', src: W('Nicolaus_Otto') },
      { year: '1864', text: 'Nicolaus Otto and Eugen Langen found N.A. Otto & Cie.', src: W('Nicolaus_Otto') },
      { year: '1876', text: 'Otto’s compressed-charge four-stroke engine appears and is an immediate success.', src: W('Nicolaus_Otto') },
      { year: '1886', text: 'Karl Benz files the patent for the Patent-Motorwagen (29 January).', src: W('Benz_Patent-Motorwagen') },
      { year: '1888', text: 'Bertha Benz takes a Motorwagen on a long-distance drive.', src: W('Benz_Patent-Motorwagen') },
    ],
    legends: [
      { photo: 'benz_motorwagen', name: 'Benz Patent-Motorwagen', years: '1886', engine: '954 cc single-cylinder four-stroke, about ⅔ hp at 400 rpm', why: 'Widely regarded as the first practical automobile, and the first car to be put into production.' },
    ],
  },
  {
    id: 'single', arch: 'single', kicker: 'Feature 01', title: 'One cylinder, the whole story',
    dek: 'One piston, one power stroke every two turns of the crank. The simplest engine there is, and still the most produced.',
    photo: 'benz_engine', photoCaption: 'The Benz Patent-Motorwagen’s single cylinder lies flat, with a large horizontal flywheel to carry the crank through the three strokes that do not push.',
    body: [
      ['The whole cycle, alone', 'A single-cylinder engine does everything the four-stroke cycle asks with one piston. It fires once every 720° of crank rotation, so for three strokes out of four the crank is coasting. A heavy flywheel stores the energy of each power stroke and gives it back through the rest of the cycle; without one, a single would stall between beats.'],
      ['Why not just make it bigger?', 'One cylinder is the lightest, cheapest and simplest way to build an engine, which is why it powers scooters, small motorcycles and garden machinery. But scaling it up runs into trouble: a big piston is heavy, and the forces from moving it back and forth grow with its mass and with the square of engine speed. The flame also takes longer to cross a wide bore. Splitting the same displacement into several smaller cylinders lets an engine rev higher, burn faster and deliver smoother torque. That is the story of every other layout in this Atlas.'],
      ['Living with the shake', 'A lone piston cannot cancel its own motion, so singles shake. Counterweights on the crank and, in larger modern singles, balance shafts calm it down. What remains is part of the character: the distinct thump of a single at idle is each combustion event, heard one at a time.'],
    ],
    quote: 'For three strokes out of four the crank is coasting on the flywheel.',
    timeline: [
      { year: '1886', text: 'The Benz Patent-Motorwagen runs on a single cylinder.', src: W('Benz_Patent-Motorwagen') },
      { year: '1932', text: 'Royal Enfield introduces the Bullet, a four-stroke single.', src: W('Royal_Enfield_Bullet') },
      { year: '1958', text: 'Honda launches the Super Cub with a 49 cc four-stroke single.', src: W('Honda_Super_Cub') },
      { year: '2017', text: 'Super Cub production passes 100 million, the most produced motor vehicle in history.', src: W('Honda_Super_Cub') },
    ],
    legends: [
      { photo: 'super_cub', name: 'Honda Super Cub', years: '1958 on', engine: '49 cc four-stroke single at launch', why: 'In continuous production since 1958. Passing 100 million units in 2017 made it the most produced motor vehicle in history.' },
      { photo: 'enfield_bullet', name: 'Royal Enfield Bullet', years: '1932 on', engine: 'Overhead-valve four-stroke single', why: 'Continuously in production since 1932: the longest production run of any motorcycle.' },
      { photo: 'ktm690', name: 'KTM 690 Duke', years: 'Modern', engine: '690 cc single with balance shafts', why: 'A large modern single that relies on balance shafts to keep its vibration in check.' },
    ],
  },
  {
    id: 'i4', arch: 'i4', kicker: 'Feature 02', title: 'The engine of everyday life',
    dek: 'Four cylinders in a row on a flat crankshaft. Cheap to build, short enough to turn sideways, and under the bonnet of most of the cars on the road.',
    photo: 'model_t_engine', photoCaption: 'The Ford Model T’s engine: 2.9 litres, four cylinders in a row, 20 horsepower. Over fifteen million were built.',
    body: [
      ['Four beats to a cycle', 'With four cylinders sharing the cycle, one of them fires every 180°, twice per crank revolution. The crankshaft is flat: the outer two pistons rise while the inner two fall, so their main forces cancel. What does not cancel is a smaller shake at twice crank speed, because pistons move faster at the top of their stroke than at the bottom. Larger four-cylinder engines add a pair of balance shafts to quieten it.'],
      ['Why it won', 'An inline-4 needs one cylinder head and one row of valves. It is short enough to mount sideways across the front of a front-wheel-drive car, and it gives enough power for almost any everyday job. That combination of low cost and compact size is why it became the default engine of the modern world.'],
      ['Built to rev', 'Small cylinders mean light pistons, and light pistons can move fast. Built for it, an inline-4 is a high-revving engine: Honda’s F20C spun to over 9,000 rpm and made about 125 horsepower per litre without a turbocharger.'],
    ],
    quote: 'One head, one row of valves, short enough to turn sideways: the default engine of the modern world.',
    timeline: [
      { year: '1908', text: 'Ford begins building the Model T with a 2.9-litre inline-4.', src: W('Ford_Model_T') },
      { year: '1913', text: 'Ford’s moving assembly line starts; build time falls from 12½ hours to 93 minutes by 1914.', src: W('Ford_Model_T') },
      { year: '1927', text: 'The fifteen-millionth Model T is built.', src: W('Ford_Model_T') },
      { year: '1976', text: 'The Golf GTI’s fuel-injected 1.6-litre four reaches showrooms.', src: W('Volkswagen_Golf_Mk1') },
      { year: '1996–99', text: 'Tommi Mäkinen wins four World Rally titles in a row in the Lancer Evolution.', src: W('Tommi_M%C3%A4kinen') },
      { year: '1999', text: 'Honda’s F20C debuts in the S2000: 125 hp per litre, 9,150 rpm limit.', src: W('Honda_F20C') },
    ],
    legends: [
      { photo: 'model_t', name: 'Ford Model T', years: '1908–1927', engine: '2.9 L inline-4, 20 hp', why: 'Built on the first moving assembly line and sold in the millions, it put the world on four cylinders.' },
      { photo: 'golf_gti', name: 'Volkswagen Golf GTI (Mk1)', years: '1976 on', engine: '1.6 L inline-4, Bosch K-Jetronic injection, 110 PS', why: 'Considered by many to be the archetypal hot hatch: a light family car with a fuel-injected four.' },
      { photo: 'evo', name: 'Mitsubishi Lancer Evolution', years: 'Evo VI, 1999–2001', engine: '2.0 L turbocharged inline-4 (4G63T)', why: 'The rally car’s road twin. Tommi Mäkinen won four drivers’ titles in Evolutions; this Evo VI edition was named for him.' },
      { photo: 's2000', name: 'Honda S2000', years: '1999–2009', engine: '2.0 L F20C, 9,000 rpm redline in early cars', why: 'Its specific output was a record for a naturally aspirated production engine under $100,000 until the Ferrari 458 arrived.' },
    ],
  },
  {
    id: 'i6', arch: 'i6', kicker: 'Feature 03', title: 'The smooth one',
    dek: 'Six in a row is the rare layout that balances itself completely. The price is length.',
    photo: 'xk_engine', photoCaption: 'Jaguar’s XK six, twin overhead camshafts under polished alloy covers. It stayed in production from 1949 to 1992.',
    body: [
      ['Balance for free', 'Split an inline-6 down the middle and the front three cylinders mirror the rear three. Every force and every rocking motion made by one half is cancelled by the other, so the engine is balanced without counterweights doing the work. A cylinder fires every 120°, so one power stroke begins before the last has finished: the delivery is continuous, which is why straight-sixes are described as silky or turbine-like.'],
      ['The price is length', 'Six cylinders in a row make a long engine and a long crankshaft that has to be stiff. It fits lengthwise in a rear-drive car but rarely sideways in a front-drive one, which is why many makers moved to the V6. The layout never went away: BMW, Toyota, Nissan and Mercedes-Benz built their reputations on it, and some have returned to it.'],
      ['From racing to the road', 'The first car with a six-cylinder engine was a racer, the Spyker 60 HP of 1903. Half a century later Jaguar’s XK six won Le Mans five times in seven years, and Mercedes-Benz fitted one with direct fuel injection in the 300 SL.'],
    ],
    quote: 'The front three cylinders mirror the rear three, so everything one half does, the other undoes.',
    timeline: [
      { year: '1903', text: 'Spyker 60 HP: the first car with a six-cylinder engine, and the first petrol four-wheel drive car.', src: W('Spyker_60_HP') },
      { year: '1948', text: 'Jaguar’s XK six is unveiled in the XK120 at the London Motor Show.', src: W('Jaguar_XK6_engine') },
      { year: '1951', text: 'The C-Type wins Le Mans at its first attempt; it wins again in 1953, the first Le Mans won at over 100 mph.', src: W('Jaguar_C-Type') },
      { year: '1954', text: 'The Mercedes-Benz 300 SL: one of the first cars with mechanical direct fuel injection.', src: W('Mercedes-Benz_300_SL') },
      { year: '1955–57', text: 'The XK-powered D-Type wins Le Mans three years running.', src: W('Jaguar_D-Type') },
      { year: '1992', text: 'The XK engine ends production after six decades.', src: W('Jaguar_XK6_engine') },
    ],
    legends: [
      { photo: 'spyker', name: 'Spyker 60 HP', years: '1903', engine: '8.8 L inline-6', why: '“The car of three firsts”: the first six-cylinder car, the first petrol four-wheel drive car and the first with four-wheel brakes.' },
      { photo: 'e_type', name: 'Jaguar E-Type', years: '1961 on', engine: 'Jaguar XK inline-6, 3.8 L at launch', why: 'The road car that carried the XK six after it had won Le Mans in the C-Type and D-Type.' },
      { photo: 'sl300', name: 'Mercedes-Benz 300 SL', years: '1954–1957', engine: '3.0 L straight-six, direct injection, 240 hp', why: 'Its tubular frame ran so high along the sides that doors hinged at the roof were the only practical way in.' },
      { photo: 'm3_e46', name: 'BMW M3 (E46)', years: '2000–2006', engine: '3.2 L S54, 8,000 rpm redline', why: 'A naturally aspirated straight-six built to rev like a racing engine.' },
      { photo: 'supra', name: 'Toyota Supra (A80)', years: '1993–2002', engine: '3.0 L 2JZ-GTE twin-turbo', why: 'A famously strong straight-six that tuners pushed far beyond its factory output.' },
      { photo: 'skyline', name: 'Nissan Skyline GT-R (R34)', years: '1999–2002', engine: '2.6 L RB26DETT twin-turbo', why: 'The last of the straight-six GT-Rs before the R35 moved to a V6.' },
    ],
  },
  {
    id: 'v6', arch: 'v6', kicker: 'Feature 04', title: 'Six cylinders, half the length',
    dek: 'Fold a straight-six into two banks of three and it fits almost anywhere. It gives up a little smoothness to do it.',
    photo: 'dino_engine', photoCaption: 'The Dino V6. The same engine family powered the Lancia Stratos to three World Rally Championships.',
    body: [
      ['Two banks of three', 'A V6 is two inline-3 engines sharing one crankshaft. At a 60° angle between the banks a cylinder still fires every 120°, as in a straight-six, but the engine is only half as long. It fits sideways in a front-wheel-drive car or in the middle of a sports car, where a straight-six would not.'],
      ['Not quite perfect', 'Each bank of three leaves a rocking motion that the other bank does not fully cancel. Counterweights on the crank, and sometimes a balance shaft, take care of most of it. A well-made V6 is smooth; it simply has to work for it, where a straight-six gets it free. Its sound varies more than any other layout, depending on the bank angle and how the exhausts are joined.'],
      ['From Lancia to the supercar', 'Lancia built one of the first series-production V6s in 1950. Ferrari named its V6 after Enzo Ferrari’s son Dino, who proposed it before he died in 1956; that engine family later won rallies in the Lancia Stratos. In 1990 Honda put a V6 behind the seats of the NSX.'],
    ],
    quote: 'Two inline-3s on one crank: half the length of a straight-six, with a little rocking left over.',
    timeline: [
      { year: '1950', text: 'The Lancia Aurelia uses one of the first series-production V6 engines, a 60° design by Francesco de Virgilio.', src: W('Lancia_Aurelia') },
      { year: '1956', text: 'Alfredo “Dino” Ferrari, who proposed a V6 for Formula 2, dies aged 24.', src: W('Ferrari_Dino_engine') },
      { year: '1957', text: 'The Dino V6 races for the first time, in the Dino 156 F2 at the Naples Grand Prix.', src: W('Ferrari_Dino_engine') },
      { year: '1974–76', text: 'The Dino-powered Lancia Stratos wins three World Rally Championships in a row.', src: W('Lancia_Stratos') },
      { year: '1990', text: 'The Honda NSX goes into production with a 3.0-litre V6 and the first all-aluminium production car body.', src: W('Honda_NSX_(first_generation)') },
    ],
    legends: [
      { photo: 'aurelia', name: 'Lancia Aurelia B20 GT', years: '1950–1958', engine: '60° V6, 1.8 to 2.5 L', why: 'One of the first series-production V6s: an all-alloy pushrod design with its camshaft between the banks.' },
      { photo: 'stratos', name: 'Lancia Stratos HF', years: '1973–1978', engine: '2.4 L Ferrari Dino V6, mid-mounted', why: 'Built to win rallies, and did: world champion in 1974, 1975 and 1976.' },
      { photo: 'nsx', name: 'Honda NSX', years: '1990 on', engine: '3.0 L C30A V6 with VTEC and titanium connecting rods', why: 'The first production car with an all-aluminium body, developed with extensive testing at the Nürburgring.' },
      { photo: 'gtr35', name: 'Nissan GT-R (R35)', years: '2007 on', engine: '3.8 L VR38DETT twin-turbo V6', why: 'Where earlier GT-Rs used a straight-six, the R35 moved to a V6.' },
    ],
  },
  {
    id: 'v8', arch: 'v8', kicker: 'Feature 05', title: 'Two banks, one beat',
    dek: 'The V8 is short, powerful and loud. Its famous burble is not a sound effect: it is the firing order.',
    photo: 'flathead', photoCaption: 'A Ford flathead V8 (1949–53). The first flathead of 1932 put a V8 within reach of ordinary buyers, and later of hot rodders.',
    body: [
      ['Where the burble comes from', 'In an American-style V8 the crankpins sit at 90° to each other: the cross-plane crank, introduced by Cadillac in 1923 to make the engine smoother. The engine as a whole fires evenly, every 90°. But each bank of four does not: its cylinders fire at uneven gaps. Each bank has its own exhaust, so each exhaust hears an irregular beat. That is the V8 burble. Turn on the Engine’s sound in Real speed mode and you can hear it come from the model’s firing order.'],
      ['Flat-plane: the other V8', 'Lay the crankpins flat at 180°, as Ferrari does, and each bank fires evenly, like two inline-4s joined together. The exhaust note turns into a higher, harder wail, and the lighter crank lets the engine rev to 9,000 rpm. The cost is some vibration that the cross-plane design cancels.'],
      ['Power in a small space', 'Eight cylinders in two short banks make a compact engine for its displacement, with power strokes always overlapping. That is why the V8 became the engine of American performance cars, of luxury saloons, and of the Ford GT40s that beat Ferrari at Le Mans.'],
    ],
    quote: 'Each bank of four fires at uneven gaps, and each bank has its own exhaust. That irregular beat is the burble.',
    timeline: [
      { year: '1902', text: 'Léon Levavasseur patents the V8 configuration; Antoinette V8s go on to power speedboats and early aircraft.', src: W('Antoinette_(manufacturer)') },
      { year: '1914', text: 'Cadillac introduces the Type 51, the first mass-produced V8, as standard for its 1915 models.', src: W('Cadillac_V8_engine') },
      { year: '1923', text: 'Cadillac adopts the cross-plane crankshaft for better balance and smoothness.', src: W('Cadillac_V8_engine') },
      { year: '1932', text: 'Ford’s flathead V8 arrives: the first affordable V8.', src: W('Ford_flathead_V8_engine') },
      { year: '1955', text: 'Chevrolet’s small-block V8 appears; over 100 million are built by 2011.', src: W('Chevrolet_small-block_engine_(first-_and_second-generation)') },
      { year: '1966', text: 'Ford GT40s finish 1-2-3 at Le Mans, ending Ferrari’s six-year winning streak.', src: W('Ford_GT40') },
    ],
    legends: [
      { photo: 'cadillac_v8', name: 'Cadillac Type 51', years: '1915 model year', engine: '5.1 L V8, 70 hp', why: 'The first mass-produced V8 engine, standard in every 1915 Cadillac.' },
      { photo: 'ford32', name: 'Ford V8 (Model 18)', years: '1932', engine: 'Flathead V8', why: 'So identified with its engine that it was simply called the “Ford V-8”. Its flathead became a staple of 1950s hot rodders.' },
      { photo: 'corvette', name: 'Chevrolet Corvette C1 “Fuelie”', years: '1957', engine: '283 cu in small-block V8 with mechanical fuel injection', why: 'The fuel-injected 283 made one horsepower per cubic inch, an impressive feat at the time.' },
      { photo: 'gt40', name: 'Ford GT40 Mk II', years: '1966', engine: '7.0 L V8', why: 'Built to beat Ferrari at Le Mans. It won in 1966 with a 1-2-3 finish, and Ford won every year until 1969.' },
      { photo: 'f458', name: 'Ferrari 458 Italia', years: '2009–2015', engine: '4.5 L flat-plane V8, 570 PS at 9,000 rpm', why: 'The flat-plane alternative: each bank fires evenly, trading the burble for a high-revving wail.' },
    ],
  },
  {
    id: 'flat6', arch: 'flat6', kicker: 'Feature 06', title: 'Low, wide, and nearly perfect',
    dek: 'Lay the cylinders flat, facing each other, and the pistons cancel each other out. The flat-six is the sports car’s engine and the aeroplane’s.',
    photo: 'porsche_engine', photoCaption: 'Porsche’s Typ 901-01 flat-six of 1963, cut open at the Porsche Museum: the first engine of the 911.',
    body: [
      ['Pistons that cancel', 'In a flat-six, or boxer, each piston has a partner directly opposite, moving the other way at the same moment. Their forces cancel, like two boxers’ fists meeting. The pairs sit slightly offset along the crank, so a small rocking motion remains, but a flat-six is nearly as smooth as a straight-six and a cylinder still fires every 120°.'],
      ['Low and short', 'Lying flat makes the engine very low, which lowers the car’s centre of gravity, and much shorter than an inline-6. It is wide, though. Porsche hung one behind the rear axle of the 911; aircraft makers used flat engines because they are compact and easy to cool.'],
      ['Cooled by air', 'Flat engines expose their cylinders to the airflow, and many early ones were air-cooled. The Tucker 48 used a flat-six designed for aircraft, converted to water cooling. The Chevrolet Corvair and the early Porsche 911 kept air cooling, with finned cylinders and a big fan.'],
    ],
    quote: 'Each piston has a partner opposite, moving the other way: their forces meet and cancel.',
    timeline: [
      { year: '1948', text: 'The Tucker 48 uses a rear-mounted 5.5-litre flat-six from Air Cooled Motors, converted to water cooling. Only 51 are built.', src: W('Tucker_48') },
      { year: '1960', text: 'Chevrolet launches the Corvair with a rear-mounted, air-cooled flat-six.', src: W('Chevrolet_Corvair') },
      { year: '1963', text: 'The Porsche 901 is shown at the Frankfurt Motor Show; a trademark claim by Peugeot turns it into the 911.', src: W('Porsche_911_(classic)') },
      { year: '1964', text: '911 production begins, with a 2.0-litre air-cooled flat-six of 130 PS.', src: W('Porsche_911_(classic)') },
      { year: '1965', text: 'Ralph Nader’s Unsafe at Any Speed criticises the early Corvair; a 1972 NHTSA report later disagrees.', src: W('Chevrolet_Corvair') },
    ],
    legends: [
      { photo: 'porsche911', name: 'Porsche 911', years: '1964 on', engine: '2.0 L air-cooled flat-six at launch, 130 PS', why: 'A flat-six hung behind the rear axle: the layout that defines the 911.' },
      { photo: 'tucker', name: 'Tucker 48', years: '1947–1948', engine: '5.5 L flat-six, 166 hp, rear-mounted', why: 'Only 51 were made before the company closed in 1949. Its engine began as an aircraft design.' },
      { photo: 'tucker_engine', name: 'The Tucker’s flat-six', years: '1948', engine: 'Air Cooled Motors O-335, converted to water cooling', why: 'Few of the original aircraft engine’s parts survived Tucker’s conversion for road use.' },
      { photo: 'corvair', name: 'Chevrolet Corvair', years: '1960–1969', engine: '2.3 L air-cooled flat-six at launch, 80 hp', why: 'A rear-engined, air-cooled compact: an unconventional car for Detroit.' },
    ],
  },
];
