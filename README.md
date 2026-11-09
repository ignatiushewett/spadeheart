# Spadeheart

A singleplayer voxel sandbox FPS set on Manhattan, 41 days after the outbreak. Think Ace of Spades / OpenSpades
destruction and look, with very dense zombie hordes, and Fallout-style trading and looting with no levels or XP.

No dependencies, no build step, no assets. All geometry and sound are generated at runtime.

## Run

Needs [Node.js](https://nodejs.org) and a WebGL2 browser (Chrome or Edge recommended).

```bash
node server.js
```

Then open http://localhost:8173, or double-click `start.bat` on Windows. Use the server rather than opening
`index.html` directly: browsers block ES modules and workers on `file://`.

## Publish on GitHub Pages

The game is a static site with no build step, so GitHub Pages can serve this folder as it is.

1. Push this repository to GitHub.
2. In the repository, open **Settings → Pages**, set **Source** to *Deploy from a branch*, pick `main` and `/ (root)`, and save.
3. After a minute or so it is live at `https://<your-name>.github.io/<repository>/`.

`server.js` sends two headers (COOP/COEP) that let the map workers share memory. A static host cannot send headers, so
`coi.js` adds them through a small service worker. The page reloads once on the first visit, then runs the same as locally.
Saves are kept in each player's browser, per site.

## Controls

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| WASD | Move | Shift | Sprint |
| Space | Jump, swim up | C | Crouch (quieter) |
| LMB | Fire, swing, throw, place | RMB | Aim, place block |
| R | Reload | E | Search, talk, trade |
| 1-9, wheel | Change weapon | G | Quick grenade |
| H | Quick heal | F | Flashlight |
| B | Cycle building blocks | | |
| Tab, I | Inventory | M | City map and jobs |
| Esc | Pause | F3 | Performance overlay |

## What is in it

- **The city.** One 1536 x 6400 x 256 voxel map of Manhattan: coastline, the avenue and street grid, Broadway's
  diagonal, skewed lower Manhattan, Central Park with its reservoir, piers, broken bridges, Times Square signs, the
  Empire State, Chrysler, One WTC and Flatiron, and the Statue of Liberty if you can swim that far. About 9,000
  buildings with floors, stairwells, rooms and loot.
- **Buildings.** The doors are long gone. Most buildings are shut up from the inside instead: shutters down, room doorways boarded over, and the stairs filled in with whatever people could carry. Break through with a melee tool, and it stays open behind you, so plan your route. Board it back up yourself if you want to sleep.
- **Starting out.** Pick a kit and a camp: Easy is the full sandbox, Medium is equipped by your faction, and Hard has a crowbar and has to earn the rest. Poorer factions are the longer climb. Survival starts you at Garvey Yard with its basic gear and one life, no natural healing and a slow appetite to feed: when you die that character is gone for good, and you carry on as someone new at a random poor camp in the same city.
- **Raiders.** One of the main dangers outside the walls, and more so as the days go on. Crews run from a couple of hungry scavengers to war parties of a dozen or more with a boss: rushers with blades, shotgunners, marksmen who see you first, machine gunners and bombers who throw grenades. Some come looking for you, though the dead come first: they only turn their guns on you when the infected leave them a moment. They stay well away from the walls, carry what they use, and camp leaders post bounties on them.
- **Weather.** Long spells of dry, drizzle and downpour, with wind, wet streets and lightning.
- **Citizenship.** Bryant Park, Fort Union and Sheep Meadow only open their gates to citizens. Their patrols sell papers for a one-time fee: you carry them in your inventory, they can't be sold or dropped, and they are gone when you die. Break in or sneak in without them and you pay for it in reputation, and in bullets. The camp you start in is always home.
- **The director.** Like one of RimWorld's storytellers, a director paces the whole city around the camp you belong to. Every camp has an eventual fate: the poor go first (Garvey Yard falls by day 15) and the richest last well past day 50. A camp wins most of its fights and looks strong for a long time, and it fights back between them: supply runs, survivors walking in, repairs, and sorties that hit the crowd first. It climbs back after a bad night, but never quite as far as before, and families start leaving once they have buried enough people. After any horde or raid, a report lists who was lost, who is left and how many of the dead went down. Big assaults are announced on the radio, gather in plain sight past the wall, and tend to arrive at dusk with the weather coming in. On the last evening the crowd comes from every side and the wall fails all the way round. Once the dead are through the camp and enough people are dead, somebody finally opens the gates and everyone runs for whichever way out they think of. Defending a camp buys it a little time, and only a little. The order to run is a judgement call: how many are through, how many are dead, and whether they are being pushed back. A camp gets a chance to turn it round, and if it can't, the order comes in time for a fair number to get out. Crews seal idle breaches faster the more of them are open, and you can hold E at one yourself once nobody is coming through it. The dead chew through shacks and stalls once they are inside; people rebuild them afterwards, and a vendor who dies is replaced the next day. A camp in its last stand gets torn apart much faster, and worst of all once it is lost: for ten seconds before the order to run goes out, the crowd brings the outer wall down along its length and pours through the gaps. A fallen camp stays wrecked, even if it fell while you were on the other side of the city.
- **Moving on.** When your camp falls, the survivors make for the nearest wall still standing, and you are marked to go with them. Stay with them and they walk the whole way and in through the next gate, though the dead will catch most of them on the road. Ask its leader to join and that camp becomes home, and the next fight you care about. You can also join another camp you are known at by choice.
- **Raids.** Much rarer than hordes, and they come in the quiet after a fight: a small masked crew blows a hole in a camp's wall and goes for the stores. They go for the people and the dead first, but stand close or shoot one and a few will turn on you. They hit softer and go down faster than street crews. All that gunfire can bring a horde down afterwards.
- **Wanderers.** Civilians with no faction, on the road or just surviving. Some are refugees heading for the next camp, and some have given up on walls. They can tell you what is still standing, mark it on your map, trade, or walk with you for a while.
- **The dead migrate.** Clear a block and packs drift in up the street from the blocks around it. Nowhere stays empty: there are always a few left on the roads and in the buildings, and the city's crowd thickens as the days go by.
- **Sleeping.** You can sleep in a camp's beds through the day until night, or through the night until morning, unless the dead are on top of you, raiders are inside, or the siren is going. The guards deal with crowds at the wall while you sleep, and it takes a breach or a raid to wake you. Take a sleeping pill first and you can even lie down through the siren: only three or more breaches, or a crowd to match, will get you up. Doctors sell them.
- **Reputation.** Shoot enough of a camp's people and it will shoot you inside its wall, even after you die. Outside the wall you are left alone. Pay your bail to one of its patrols or its leader to be let back in; a rich market charges more than a poor commune.
- **Destruction.** Every voxel except bedrock can be broken. Anything cut off from the ground falls and leaves rubble.
  Each building stands alone, so take out its ground floor and it comes down. A structure of more than 16,000 connected
  voxels is treated as supported, so the big towers survive.
- **The horde.** One zombie type with varied clothing (office, scrubs, hard hats, NYPD, Guard and more). Speed, horde
  size, damage and loot are set per game. They hunt by noise and sight, use stairs, climb walls and chew through
  barricades. They are numerous but individually weak: two rifle rounds, or one to the head.
- **The camps.** Nine walled towns, about 200 to 380 voxels across and packed like slums: plot after plot of shacks, tents and
  lean-tos, split by narrow alleys, around a central plaza with a bonfire and a memorial wall. Each has its own wall, flag,
  emblem and landmark: stacked taxis around the Bryant Park market, ferries and cranes at Battery Landing, a palisade around the
  Washington Square arch, Guard tents and a firing range at Fort Union, crops and windmills at Sheep Meadow, a painted scrap wall
  at Tompkins Square, white hospital tents at Morningside, a church and a basketball court at Garvey Yard, and a stone keep at
  Fort Tryon. Gates open as you approach, and stairs beside them lead up to the catwalk.
- **Camps can fall.** Hordes move on camps every few minutes, whether you are there or not. Crowds pressed against a wall
  break real holes in it, push through gates you leave open, and climb over their own dead when deep enough. Guards die,
  ammunition runs out, and the bitten get back up inside the wall. A camp that loses enough people is overrun: it burns, its
  named cast die or flee to other camps, and it stays infested until you clear it, after which survivors resettle it.
  Far from the player the same battles are resolved in numbers. Radio traffic and the map keep you informed, and you can go
  and help, or donate ammunition.
- **The people.** Up to several hundred in each camp, with a faction armband and nearly all of them armed. Everyone has a bed
  and a routine: work, farm, queue at the kitchen, talk in groups, sit at fires and tables in the evening, sleep at night. Children
  go to school under a tarp. Each camp has dozens of market stalls, a leader and a named cast with branching conversations and
  personal favours. Anyone can be talked to, fed, sat with, or (once you are known) asked to come along. What someone is for comes
  first when you talk to them: trade with a vendor, treatment from the doctor, work from the leader. A small mark over their heads picks out the people who matter.
  The watch walks each side of the wall and runs to wherever the crowd is thickest. Patrols are thickest under the wall and thin out over the neighbourhood.
- **The RPG layer.** Spades (the currency), items, weight, armour and infection. Standing with each camp grows from Stranger to Known,
  Trusted and Family, improving prices and unlocking favours and daily supplies. Job boards and paid fast travel at
  every camp, and a doctor who will patch you up for a price. Jobs can be abandoned from the map screen. Anyone's kills count towards a job to clear a block. Shoot people and the camps turn on you.
- **Sandbox.** Building materials are plentiful: tear them out of the city with a melee tool, find them on the dead, or buy them for next to nothing. Use them to bridge over a horde or wall yourself in. Nights are truly dark: the camps are the main light left on the island, so carry a flashlight. Survival characters have to buy or find one.
- **Cinematics.** HDR rendering with cascaded sun shadows, voxel AO, SSAO, bloom, god rays, lens flare, motion blur,
  depth of field, ACES grading, film grain, chromatic aberration, dynamic lights and soft smoke.

## How the zombie counts work

The whole island's population lives in a coarse density grid (about 430,000). Only the bubble around the player becomes real entities, and those update in tiers:

| Distance | Update rate | Navigation |
| --- | --- | --- |
| Under 40 voxels | Every frame, with voxel collision | Voxel-accurate 3D path field, including stairs |
| 40 to 105 | Every 4th frame | 2D flow field |
| Over 105 | Every 16th frame | 2D flow field |

Zombies are drawn with GPU instancing in three levels of detail. Measured on an RTX 5070: 60,000 active zombies, about
45,000 of them hunting, at 60 fps with about 8 ms of CPU per frame.

Adjust the load in Settings with **Max active zombies**, **Voxel view distance**, the graphics preset and render scale.

## Code map

```
src/shared/   layout.js (city plan)  camps.js (settlements)  gen.js (voxels)  mesher.js  worker.js  materials.js
src/engine/   renderer.js + shaders.js  world.js (streaming, destruction)  farcity.js  actors.js  particles.js
src/game/     director.js (pacing, fates)  campsim.js (battles, raids)  horde.js  player.js  npcs.js (survivors, jobs)  camplore.js (cast, dialogue)  dialogue.js  items.js  ui.js  audio.js  viewmodel.js
src/main.js   boot, state machine, main loop, saving
```

Saves go to the browser's IndexedDB, including every voxel you changed. Autosave runs each minute and on pause.
