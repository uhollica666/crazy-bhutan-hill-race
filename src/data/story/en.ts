import type { StoryBook } from './types';

/**
 * English story content. Pure data: no game logic. To add a language, copy this file to `<lang>.ts`, translate the
 * strings, and register it in `index.ts`; missing levels or keys fall back to English.
 */
export const EN: StoryBook = {
  cast: {
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
    'pass-run': {
      headline: 'The Sunrise Will Not Wait',
      stamp: 'Mountain run',
      text: [
        'Ingrid and Wesley booked the sunrise tour. Then they slept through three alarms, two wake-up calls and a very persistent rooster.',
        'The sunrise at the pass lasts about eleven minutes. Collect them from the Hotel Tashi lay-by, climb through four hairpins, and get them to the summit while the sky is still doing something interesting.',
      ],
      passengers: ['sunrise-hikers'],
      objectives: [
        'Pull into the Hotel Tashi lay-by and stop so they can climb in.',
        'Drive through every checkpoint, in order.',
        'Reach the summit viewpoint before time runs out.',
      ],
      watchOut: ['Brake before each hairpin, then power out.', 'The mist thickens near the top.'],
    },
    'thimphu-pickup': {
      headline: 'The Group Chat Has Gone Quiet',
      stamp: 'City pickup',
      text: [
        'Dorji the tour guide has lost his group. Not lost lost: just spread across town, each person certain they were meant to wait somewhere else.',
        'Fiona is at the cafe, Hassan is at the craft market buying something large, and Priya is still at the archery ground cheering for people she has never met. Gather all three and deliver them to Clock Tower Square before dinner.',
      ],
      passengers: ['backpacker', 'shopper', 'archery-fan'],
      objectives: [
        'Stop beside each tourist to pick them up, in the order you reach them.',
        'The finish only counts once everybody is on board.',
        'Pull up in Clock Tower Square and stay still while they climb out.',
      ],
      watchOut: [
        'Town traffic is slow but busy. Leave room, and brake early.',
        'A broken-down lorry blocks one lane. Pass it wide.',
        'The town fuel station is optional, but your tank is only three-quarters full.',
      ],
    },
    'airport-dash': {
      headline: 'The Very Famous Mountain',
      stamp: 'Airport transfer',
      text: [
        'Four tourists have spent three hours photographing the same mountain. It has not changed. They are thrilled.',
        'Their flight leaves soon, and they have only just remembered that their luggage is at the hotel, their tickets are in someone\'s other jacket, and the tour company\'s car is running on half a tank. The Zangmo Express, a rival tour coach, left an hour ago with far calmer passengers.',
        'Collect them, keep them comfortable, and get them to Paro Departures before check-in closes.',
      ],
      passengers: ['photographers'],
      objectives: [
        'Pick up all four photographers at the viewpoint.',
        'Reach Departures and stop in the drop-off zone before the flight leaves.',
        'Optional: keep the ride smooth, top up in Market Town, and beat the Zangmo Express.',
      ],
      watchOut: [
        'Half a tank will not make it all the way. The fuel pump in Market Town takes a few seconds.',
        'Hard braking and fast corners upset the passengers (and your medal).',
        'There is light traffic, and the Zangmo Express is on the same road.',
      ],
    },
    'chelela-climb': {
      headline: 'The Cheese Emergency',
      stamp: 'Hill climb',
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
