import type { StoryBook } from './types';

/**
 * English story content. Pure data: no game logic. To add a language, copy this file to `<lang>.ts`, translate the
 * strings, and register it in `index.ts`; missing levels or keys fall back to English.
 */
export const EN: StoryBook = {
  cast: {
    botanist: {
      name: 'Dr Aiko Mori',
      line: 'Is that a rhododendron? Stop. No, keep going. No, stop!',
      portrait: { skin: 0xe9c3a0, hair: 0x1c1613, hat: 0x6b7f3f, glasses: true, scarf: 0x2e9c4f },
    },
    honeymooners: {
      name: 'Marta & Jonas',
      line: 'We booked the scenic route. Is this the scenic route? It looks scenic.',
      portrait: { skin: 0xf0c8a0, hair: 0x8a5a2b, hat: null, glasses: false, scarf: 0xd6322b },
    },
    grandparents: {
      name: 'The Okafors',
      line: 'Slow down for the cows, dear. And speed up for the tea.',
      portrait: { skin: 0x8a5a3c, hair: 0xd9d9d9, hat: 0xf0c23a, glasses: true, scarf: 0xe39a1c },
    },
    'photo-nomads': {
      name: 'The Light Chasers',
      line: 'Wait for the cloud break! ...Never mind, the cloud has broken us.',
      portrait: { skin: 0xd3a27c, hair: 0x3a2a1f, hat: 0x2f6fd0, glasses: true, scarf: 0xf6f4ee },
    },
    doctor: {
      name: 'Dr Lhamo',
      line: 'Calm, steady, and never above the speed of the worst corner.',
      portrait: { skin: 0xc58b62, hair: 0x14100e, hat: null, glasses: true, scarf: 0xf6f4ee },
    },
    'night-hikers': {
      name: 'Anders & Ilse',
      line: 'We have walked nineteen kilometres. We would like a chair now.',
      portrait: { skin: 0xf2d0b0, hair: 0xb8a37a, hat: 0x7a2c20, glasses: false, scarf: 0x2e9c4f },
    },
    'sunrise-hikers': {
      name: 'Ingrid & Wesley',
      line: 'Is that the sun already?! Quick, quick, quick!',
      portrait: { skin: 0xf0c8a0, hair: 0xc9c9c9, hat: 0x2f6fd0, glasses: true, scarf: 0xd6322b },
    },
    backpacker: {
      name: 'Fiona',
      line: 'One coffee, I said. I may have had four.',
      portrait: { skin: 0xe8b890, hair: 0x7a3b1d, hat: null, glasses: false, scarf: 0x2e9c4f },
    },
    shopper: {
      name: 'Hassan',
      line: 'Do not worry about the prayer wheel. It is mostly packing material.',
      portrait: { skin: 0xb37a52, hair: 0x1d1512, hat: 0xf0c23a, glasses: true, scarf: 0xd6322b },
    },
    'archery-fan': {
      name: 'Priya',
      line: 'Sorry! I was cheering. Is cheering a delay?',
      portrait: { skin: 0xa9693f, hair: 0x14100e, hat: null, glasses: false, scarf: 0xf0c23a },
    },
    photographers: {
      name: 'The Photography Club',
      line: 'It looked different at 2 o\'clock! No, wait. It looked exactly the same.',
      portrait: { skin: 0xf2d0b0, hair: 0x3b2a20, hat: 0x8c2a20, glasses: true, scarf: 0x2f6fd0 },
    },
    trekkers: {
      name: 'Brigitta, Anil & Mei',
      line: 'Nobody touch the cheese bag. It has been through enough.',
      portrait: { skin: 0xd9a47a, hair: 0x2a1c14, hat: 0x2e9c4f, glasses: false, scarf: 0xf6f4ee },
    },
    'film-crew': {
      name: 'Leo & Dolma',
      line: 'Forty cases of gear! Please do not drive through anything wet. (Everything is wet.)',
      portrait: { skin: 0xc58b62, hair: 0x241912, hat: 0x1d2f5c, glasses: true, scarf: 0xe39a1c },
    },
  },
  levels: {
    'punakha-valley': {
      headline: 'Five Stars or Nothing',
      stamp: 'Scenic tour',
      quick: { problem: 'Five guests, five ideas of the perfect day, and one very long valley.', goal: 'Run the tour, collect and drop off the groups, and reach the Punakha Dzong parking before the light goes.', challenge: 'Sudden rain, mud, a narrow bridge, a ford and farm traffic.' },
      ending: { done: 'Two happy guests, one very good review, and the dzong glowing where the rivers meet.', failed: 'The light went before the dzong did. Find a faster line next time.' },
      text: [
        'The guesthouse review page is a battlefield. Five guests, five different ideas of the perfect day, and one of them has written "must see the dzong at golden hour" on a postcard and mailed it to themselves.',
        'Collect the honeymooners at the Wangdue lodge and Pema the guide in the village, drop the honeymooners at the viewpoint, collect lunch (and two very hungry grandparents) at the restaurant, leave Pema at the picnic spot for one photograph, and take everyone left to the dzong where the two rivers meet.',
        'It will rain, the village lane will turn to mud, a tractor will stop for a chat, and the bridge is only wide enough for one patient driver at a time.',
      ],
      passengers: ['honeymooners', 'botanist', 'grandparents'],
      objectives: [
        'Pick up the honeymooners at the Wangdue lodge and the guide in the village.',
        'Drop the honeymooners at the viewpoint, collect the grandparents at the restaurant, and drop the guide at the picnic spot.',
        'Drive through the checkpoints, in order, down the valley, along the river and over the bridge.',
        'Stop in the dzong parking so the last guests can get out.',
      ],
      watchOut: [
        'Heavy braking on the wet descent will upset the passengers and your medal.',
        'The narrow bridge and the village lanes only fit one vehicle at a time: wait, do not push.',
        'The ford is shallow but the hatchback should still take it slowly and straight.',
        'Fuel is limited: the route is long, and there is a pump in the village, by the river, in Punakha and a tea stall on the rural track.',
      ],
    },
    'dochula-storm': {
      headline: 'The Storm Came Early',
      stamp: 'Storm descent',
      quick: { problem: 'The guests stayed too long on the pass, and the storm did not wait.', goal: 'Collect the guests, shelter one visitor, give a stranded guest a lift, and reach the valley lodge.', challenge: 'Fog, rain, ice, a landslide, and brakes that fade on the long descent.' },
      ending: { done: 'Down at the lodge the guests cheered under the porch, and the storm finally began to clear.', failed: 'The storm got there first. Try a calmer line down.' },
      text: [
        'The 108 chortens were so beautiful that nobody noticed the weather. The coaches have gone, the stall owner is closing up, and a mountain storm is rolling in over the pass.',
        'Collect the photographers and the very last visitor, then go down: cold ice at the top, a ladder of hairpins in the forest, a fog bank with trucks creeping around the blind corners, a landslide that has taken half the road, and the storm corridor below it.',
        'One guest will insist on waiting at the emergency shelter. A stranded traveller will be waiting in the lower valley. Everyone is excited about the scenery and increasingly concerned about the weather.',
      ],
      passengers: ['photo-nomads', 'shopper', 'archery-fan'],
      objectives: [
        'Pick up the photographers at the coach park and the late visitor at the stall.',
        'Drop one guest at the emergency shelter, and pick up the stranded guest in the lower valley.',
        'Drive through the checkpoints, in order, down the pass.',
        'Stop at the valley lodge so the guests can get out.',
      ],
      watchOut: [
        'Hard, long braking heats the brakes and they fade: brake in short bursts and let them cool.',
        'Fog hides the trucks. Slow right down and follow the glowing marker posts.',
        'Rocks fall near the warning signs. The landslide leaves a gap: take it slowly, the other lane may be in use.',
        'Heavy rain means long braking distances and slippery corners.',
      ],
    },
    'trongsa-gorge': {
      headline: 'The Road With the Drop',
      stamp: 'Gorge run',
      quick: { problem: 'Tourists need Trongsa, and the only road is a ledge above a gorge.', goal: 'Run the gorge: collect, drop and collect again, then deliver the group to the Trongsa Dzong viewpoint.', challenge: 'Narrow cliffs, a one-lane bridge, rockfalls, brake fade and a rough climb.' },
      ending: { done: 'The dzong came out of the cloud, the guests came out of the car, and nobody mentioned the cliff.', failed: 'The gorge won this time. Find a calmer line.' },
      text: [
        'The tourists have a booking at Trongsa, one of the great dzongs, and the road there is narrow, patched and not entirely sure it wants to be a road. It begins at a mountain lodge and winds along the high ridge, then clings to a cliff with the river a very long way below.',
        'Take them down the gorge on a long descent that will cook your brakes, wait your turn at the one-lane bridge, pick your way through the rockfall corridor, then climb the rough road out the other side, with mud and loose stone, to the town above.',
        'Drop one guest at the viewpoint for a photograph, another at a gorge-side hamlet, and collect two more who have been stranded by the rocks. Everyone is delighted by the views, and increasingly interested in the handbrake.',
      ],
      passengers: ['sunrise-hikers', 'archery-fan', 'grandparents'],
      objectives: [
        'Pick up the group at the mountain lodge and the guide at the village junction.',
        'Drop a guest at the cliff viewpoint, and another at the gorge-side hamlet.',
        'Collect the stranded travellers after the rockfall corridor.',
        'Stop in the Trongsa dzong parking so the guests can get out.',
      ],
      watchOut: [
        'Hot brakes fade on the long gorge descent: brake in short bursts and let them cool.',
        'The bridge is one lane: wait for the green signal, and do not push in against oncoming traffic.',
        'Rocks fall near the warning signs. Every blockage leaves a gap, but the cliff edge does not forgive.',
        'The climb is rough and muddy: 4x4 helps, but patience and a steady throttle will do it.',
      ],
    },
    'chelela-climb': {
      headline: 'The Cheese Emergency',
      stamp: 'Hill climb',
      quick: { problem: 'A very delicate cheese needs to reach the pass.', goal: 'Collect the trekkers and climb to the top.', challenge: 'Nine hairpins, snow, rockfall and a shy yeti.' },
      ending: { done: 'The cheese survived. Mostly.', failed: 'The cheese is at a delicate stage and so is the schedule.' },
      text: [
        'Anil has carried twelve kilos of very serious cheese halfway around the world for a picnic at the Chelela pass. The cheese is, in his words, "at a delicate stage".',
        'Brigitta and Mei have already made it clear that this is the last time they will trek with a cheese. You need a proper 4x4, a steady nerve and a reasonable explanation for the snow, the rockfall, and whatever the locals say lives near the top.',
      ],
      passengers: ['trekkers'],
      objectives: [
        'Collect all three trekkers at the tea hut.',
        'Climb the nine hairpins; the rockfall may block half the road.',
        'Reach the pass. Yeti crossings are to be respected.',
      ],
      watchOut: [
        'Only the SUV and the flagship 4x4 are strong enough. Use 4x4 (X) on the steep, slippery parts.',
        'Fuel is only just enough. The halfway chai shack can fuel and repair.',
        'The yeti is friendly, shy, and extremely unhurried. Let it cross.',
      ],
    },
    'remote-expedition': {
      headline: 'Forty Cases of Camera Gear',
      stamp: 'Expedition',
      quick: { problem: 'Forty cases of gear and a festival at noon.', goal: 'Reach the festival ground before the dances begin.', challenge: 'Mud, a ford, and a tractor in the way.' },
      ending: { done: 'Forty cases of gear and not one dance missed.', failed: 'The masks waited for nobody. Back to base camp.' },
      text: [
        'Leo and Dolma are filming the festival masks, and the masks wait for nobody. They have forty cases of gear, a thermos of tea, and an unshakable belief that the road "is probably fine".',
        'It is not fine. The rains came early, the track is mud, a tractor has made itself at home in the middle of it, and the river has opinions. The festival starts at noon.',
      ],
      passengers: ['film-crew'],
      objectives: [
        'Collect the crew at base camp.',
        'Follow the track through dirt, rocks and mud, and cross the ford.',
        'Reach the festival ground before the dances begin.',
      ],
      watchOut: [
        'Mud and rocks: switch to 4x4 (X), and go easy on the rough stretches.',
        'The ford is shallow but real: cross straight and steady.',
        'A stuck tractor and a monsoon rockfall will each make you choose a line.',
      ],
    },
  },
};
