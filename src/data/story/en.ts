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
    'pass-run': {
      headline: 'The Sunrise Will Not Wait',
      stamp: 'Mountain run',
      quick: { problem: 'They slept through every alarm.', goal: 'Swap guests at the viewpoint, then reach the summit plaza.', challenge: 'A long climb: fuel, slow trucks, gravel, mud and ice.' },
      ending: { done: 'They caught the sunrise. Wesley has forgiven the rooster.', failed: 'The sun came up without them. An earlier alarm, perhaps.' },
      text: [
        'Ingrid and Wesley booked the sunrise tour, then slept through three alarms, two wake-up calls and a very persistent rooster. Now the whole village is awake and the pass is a long way up.',
        'Collect them in the village, pick up Fiona at the trailhead, let her off at the viewpoint cafe, take on Priya and carry on over the pass to the summit plaza. Top up at the service area: it is a long climb.',
      ],
      passengers: ['sunrise-hikers', 'backpacker', 'archery-fan'],
      objectives: [
        'Stop in each yellow zone: the village hotel, the trailhead lay-by and the viewpoint.',
        'Drop Fiona off at the viewpoint cafe, then take Priya on board.',
        'Refuel at the service area if you need to, and drive through every checkpoint.',
        'Stop in the summit plaza so everyone can get out.',
      ],
      watchOut: [
        'Slow trucks and cyclists share the road: overtake only when it is clear.',
        'Gravel, mud and ice cut your grip. Brake before them, not on them.',
        'The service area has fuel and a workshop; the viewpoint kiosk sells tea and fuel.',
      ],
    },
    'thimphu-pickup': {
      headline: 'The Group Chat Has Gone Quiet',
      stamp: 'City run',
      quick: { problem: 'The guests are scattered and the city is rush-hour busy.', goal: 'Collect and drop off guests, then reach Buddha Dordenma.', challenge: 'Police signals, crossings, queues and a steep finish climb.' },
      ending: { done: 'The whole party stood beneath the Buddha, and dinner is still hot.', failed: 'The traffic won this time. Find a faster line through town.' },
      text: [
        'Dorji the tour guide has lost his group across Thimphu. A couple are at the Babesa guesthouse, a late guest is still in a hotel lobby, and Dorji himself is on a corner somewhere near the Clock Tower.',
        'Drive through the residential lanes and the busy commercial streets, obey the officer at the junction, give way to people crossing, sit out the queue, drop Fiona at the Memorial Chorten, and then climb out of town to the Buddha Dordenma viewpoint at Kuenselphodrang.',
      ],
      passengers: ['honeymooners', 'backpacker', 'shopper'],
      objectives: [
        'Stop in each yellow zone: the Babesa guesthouse, the hotel entrance, the Memorial Chorten (a drop-off) and the tour guide.',
        'Obey the traffic officer and give way at zebra crossings.',
        'Refuel in town or at the viewpoint kiosk if you need to, and drive through every checkpoint.',
        'Stop in the viewpoint plaza so everyone can get out.',
      ],
      watchOut: [
        'Traffic stops for the officer and for pedestrians: so should you.',
        'A queue and a delivery truck can block your lane for a while. Be patient.',
        'The narrow residential lane has cars parked on both sides: take it slowly.',
        'The climb after the city is steeper than it looks.',
      ],
    },
    'airport-dash': {
      headline: 'The Very Famous Mountain',
      stamp: 'Airport transfer',
      quick: { problem: 'The flight is closing and the group is still at the hotel.', goal: 'Load the tourists and reach Paro Airport before check-in closes.', challenge: 'A long highway, a narrow gorge, roadworks and slow trucks.' },
      ending: { done: 'Checked in with minutes to spare, and the mountain waves goodbye.', failed: 'The plane left without them. Find a faster line.' },
      text: [
        'Three tourists have spent three hours photographing the same mountain. It has not changed. They are thrilled.',
        'Their flight leaves from Paro, their luggage is in the hotel lobby, and a fourth guest is waiting at a bus stop on the way out of town. The Zangmo Express, a rival tour coach, left an hour ago with far calmer passengers.',
        'Drive the Thimphu to Paro highway: the river road, the Chuzom confluence, the gorge, the roadworks and the open valley. Keep them comfortable, and stop at Departures before check-in closes.',
      ],
      passengers: ['photographers', 'shopper'],
      objectives: [
        'Collect the group (and their luggage) at the hotel entrance.',
        'Pick up the late guest at the roadside bus stop.',
        'Reach Departures and stop in the drop-off zone before check-in closes.',
        'Optional: keep the ride smooth, use a fuel stop, and beat the Zangmo Express.',
      ],
      watchOut: [
        'Slow trucks on the highway: overtake only when the road ahead is clear.',
        'Rocks fall in the gorge and on the slopes near the confluence. Watch for the warning signs.',
        'Roadworks mean gravel, potholes and wet asphalt. Slow down and pick a line.',
        'Fog and rain can roll in. Hard braking and fast corners upset the passengers.',
      ],
    },
    'punakha-valley': {
      headline: 'Five Stars or Nothing',
      stamp: 'Scenic tour',
      quick: { problem: 'Five guests, five ideas of the perfect day, and one very long valley.', goal: 'Run the tour and reach the Punakha Dzong before the light goes.', challenge: 'Sudden rain, mud, a narrow bridge, a ford and farm traffic.' },
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
      quick: { problem: 'The guests stayed too long on the pass, and the storm did not wait.', goal: 'Shelter one guest, rescue another, and reach the valley lodge.', challenge: 'Fog, rain, ice, a landslide, and brakes that fade on the long descent.' },
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
      quick: { problem: 'Tourists need Trongsa, and the only road is a ledge above a gorge.', goal: 'Run the gorge and deliver the group to the Trongsa Dzong.', challenge: 'Cliffs, a one-lane bridge, rockfalls, brake fade and a rough climb.' },
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
      headline: 'It Is Only a Little Snow',
      stamp: 'High pass',
      quick: { problem: 'The guests want Chele La, and the snow wants the road.', goal: 'Rescue guests on the way up and reach Chele La before the weather.', challenge: 'Frost, ice, packed snow and slush, fourteen hairpins, wind and fog.' },
      ending: { done: 'The cloud opened, the prayer flags snapped in the wind, and the guests forgot to complain about the cold.', failed: 'The pass closed first. Try a gentler touch on the throttle.' },
      text: [
        'The Chele La pass is the highest road in Bhutan, and the guests are certain it will be lovely. It begins lovely: sunshine, tarmac, a lodge, a cup of tea. Then the forest closes in, the road tilts upward, and the first frost appears on the corners.',
        'Collect the trekkers and a snow photographer, set one down at the rhododendron viewpoint, climb through the hairpins, pick up two visitors whose car is "resting" at the snowline, leave the photographer at the shelter for tea, and fight on up the steep, icy climb, across the windy ridge and up the last six hairpins to the viewpoint.',
        'The main road is ploughed and a careful driver can climb it in 4x2. The deeper snow, the slush and the ice reward four-wheel drive and a gentle foot.',
      ],
      passengers: ['trekkers', 'photographers', 'sunrise-hikers'],
      objectives: [
        'Pick up the trekkers at the lodge and the photographer in the forest.',
        'Drop one trekker at the rhododendron viewpoint, pick up the stranded visitors at the snowline, and drop the photographer at the mountain shelter.',
        'Drive through the checkpoints, in order, up the pass.',
        'Stop at the Chele La viewpoint so the guests can get out.',
      ],
      watchOut: [
        'Throttle and brakes smoothly on frost, ice and slush: wheels spin and slide easily.',
        'Press F (or the 4x4 chip) for four-wheel drive on the steep, snowy climbs. It uses more fuel.',
        'Snow clearing is slow work: stay behind the plough and wait for a gap. Drifts leave a gap to drive through.',
        'Fuel runs out faster on slopes and snow: use every pump.',
      ],
    },
    'bumthang-night': {
      headline: 'Do Not Stop For The Lantern',
      stamp: 'Night run',
      quick: { problem: 'They left Bumthang far too late, and the forest road is not empty.', goal: 'Rescue the guests and reach the mountain resort before midnight.', challenge: 'Darkness, fog, narrow bridges, fallen trees and things in the lights.' },
      ending: { done: 'The resort lamps came up out of the fog, the guests cheered, and nobody mentioned the figure with the lantern.', failed: 'The forest got the better of the night. Try a steadier hand, and a closer look at the road.' },
      text: [
        'The honeymooners were told it was a short drive. The sun, which is the only reason the road looks friendly, was already going down when they left.',
        'The road runs through forest, remote villages, two narrow bridges, a midnight forest, a foggy settlement and a stretch where the huts have been abandoned for a reason. Your headlights light forty metres of it. What is beyond them is fog, trees and opinions.',
        'Pick up a lost hiker, rescue a film crew whose car "stopped by itself", and watch the road: there are ghosts that hang in it, shamblers that follow slow cars, a lantern figure that is not there when you arrive, bears, yetis, fallen trees and one very unlit truck. It is all cartoon-friendly, and all real enough to hit.',
      ],
      passengers: ['honeymooners', 'night-hikers', 'film-crew'],
      objectives: [
        'Pick up the guests at the town hotel and the lost hiker in the forest.',
        'Drop the hiker at his village, rescue the film crew on the forest road, and drop one guest at the foggy guesthouse.',
        'Drive through the checkpoints, in order, through the dark.',
        'Stop at the mountain resort so the guests can get out.',
      ],
      watchOut: [
        'Your headlights show about forty metres. Slow down: what you cannot see can still be in the road.',
        'Wait for the green signal at the bridges. Oncoming headlights dazzle: slow down and keep left.',
        'Do not stop for shamblers: drive on and they lose interest. Ghosts hang in the road, so slow down and go round or through.',
        'Fuel is low at the start. Use every pump: the road is long and the forest is empty.',
      ],
    },
    'remote-expedition': {
      headline: 'The Bridge Is In The River',
      stamp: 'Expedition',
      quick: { problem: 'The camp is at the end of a muddy road, and the bridge fell in.', goal: 'Collect the team, rescue the stranded crew, and reach the camp.', challenge: 'Mud, fords, rockfalls, fading brakes and worsening rain.' },
      ending: { done: 'Tents, lamps, a campfire and a team that still has most of its gear. The expedition is on.', failed: 'The track won this time. Try a steadier line, and the right drivetrain.' },
      text: [
        'A documentary team has forty cases of gear, a deadline, and a camp at the end of a road that has been described, kindly, as "optional". The rains have come early, and the bridge has gone to join the river.',
        'Collect the film crew, take the local guide in the forest, leave the camera operator at the survey post, pick up the medic at the field clinic, deliver the supplies at the lookout, and rescue the team stranded by the landslides.',
        'The tracks are mud, rock, loose gravel and broken asphalt. Four-wheel drive is not a luxury. The rain gets worse, then the light goes.',
      ],
      passengers: ['film-crew', 'trekkers', 'botanist'],
      objectives: [
        'Pick up the film crew at the base camp and the guide at the forest trailhead.',
        'Drop the camera operator at the survey post, pick up the medic, and drop the supplies at the lookout.',
        'Rescue the stranded team after the landslide area, and drive through the checkpoints in order.',
        'Stop at the expedition camp so the team can get out.',
      ],
      watchOut: [
        'Switch to 4x4 (F) before the mud and the climbs. It uses more fuel: top up at every station.',
        'Cross fords straight and steady: the ranger can wade 0.5 m, the cruiser 0.8.',
        'On the loose descent the brakes fade: brake early, in short bursts.',
        'Every blockage leaves a gap, but rocks hurt. Go easy over the rough stuff.',
      ],
    },
    'gmc-plains': {
      headline: 'The Last Manifest',
      stamp: 'The finale',
      quick: { problem: 'A long guest list, a very long road, and strangers wanting a lift.', goal: 'Carry the manifest guests, check IDs and reach Gelephu on time.', challenge: 'Fading brakes, landslides, mud, rivers, creatures and a storm.' },
      ending: { done: 'The hall glowed at dusk, the flags snapped, the crowd cheered, and the manifest was complete. Ten missions, one kingdom: well driven.', failed: 'The road got the better of the plan. Check the manifest, mind the fuel, and try again.' },
      text: [
        'Gelephu Mindfulness City is hosting the arrival of its first great tourist group, and you have the manifest: the Dorji family, a late guest called Sonam, a film crew somewhere under a landslide, a medic, a pair of elderly Tsherings, Pema with the orange cap and a guide with a lanyard.',
        'The road there is the whole of Bhutan in one go: a mountain descent that cooks your brakes, a corridor of landslides, a mud detour, four rivers in flood, a wildlife corridor in which not everything is wildlife, a monsoon storm, a fast highway and a very busy town.',
        'Along the way, people will wave you down who are not on the list. Stop, press E, and check their ID against the manifest. An impostor who gets in the car will be found out later, and will cost you time and the guests\' good opinion.',
      ],
      passengers: ['photo-nomads', 'film-crew', 'doctor'],
      objectives: [
        'Pick up the Dorji family and Sonam at the lodge, and drop Sonam at the forest viewpoint.',
        'Rescue the film crew after the landslides, drop them at the camp truck, and collect Dr Lhamo at the river.',
        'Drop Dr Lhamo at the ranger station, then collect the Tsherings in the storm, Pema on the highway, and the guide in town.',
        'Drop the Dorji family at the hotel, and stop at the Gelephu arrival hall with the rest.',
      ],
      watchOut: [
        'Never carry more than five: every stranger who boards takes a seat until they are found out.',
        'Press E at a roadside guest to check their ID before they board. Clues are on the label.',
        'Brake early and in bursts on the long descent: the brakes fade. Wait for green at the bridges.',
        'Use 4x4 (F) on the mud and the fords (0.45 m at most). Fuel runs out quickly: use every pump.',
      ],
    },
  },
};
