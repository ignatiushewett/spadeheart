// Who lives in the camps and what they have to say. Pure data, read by dialogue.js and npcs.js.
//
// A topic: { id, ask (player's line), say (reply), then: [follow-up ids], sub: true (only reachable via `then`),
//   req: { standing, flag, notFlag, kills }, set: flag name, standing: +n, give: { item: n }, scrip: n,
//   daily: true (once per in-game day), once: true (never offered again), job: favour key, pay: favour key }
// A favour: { title, type: 'kill'|'fetch'|'hold', u, v, need, reward, bonus, desc }

export const LORE = {
  bryant: {
    motto: 'Everything has a price, and nobody gets shot over it.',
    jobIntro: 'Odalys keeps the board. Pays on time, every time.',
    cast: [
      {
        id: 'reyes', name: 'Odalys Reyes', role: 'leader', title: 'Mayor of the Market', weapon: 'pistol', wardrobe: 'civ',
        greet: {
          first: 'New face. Good. New faces buy things. I am Odalys, and before you ask, nobody elected me. I ran dispatch for the MTA for nineteen years, and when the trains stopped I was the only person who still knew where everybody was.',
          again: ['Back again. Market is open, wall is up, and I have a list.', 'You still have all your fingers. That makes you an asset.', 'Talk fast. I have two caravans and a bad generator.'],
          hurt: 'You are bleeding on my floor. See Doc Abara before you talk to me.',
          night: 'It is late. The wall crew gets nervous at night, so keep that thing pointed down.',
          trusted: 'There she is, or he, or whoever you are this week. People ask about you now. That is worth more than spades.',
        },
        topics: [
          { id: 'place', ask: 'What is this place?', say: 'Forty-one days ago it was a park on the lake with a lawn and a bandstand. We stacked every taxi we could tow around it. Now it is the only place between the river and the mountain where a can of beans has an agreed price.', then: ['scrip', 'rules'] },
          { id: 'scrip', sub: true, ask: 'Why spades? Why not just barter?', say: 'Because a man with forty cans of beans and a broken leg cannot walk to the man with the antibiotics. I printed the first batch on the library\'s letterpress, with a spade on every one, because that was the only block with its edges left. It is worth something because I say so, and because I have the wall and the guns to keep saying so. That is all money ever was.', then: ['rules'] },
          { id: 'rules', sub: true, ask: 'What are the rules here?', say: 'Three. No shooting on the market floor. No credit. And if you get bitten, you tell someone before you start feeling strange. People forgive the first two.', standing: 1, set: 'bryant_rules' },
          { id: 'library', ask: 'Why keep the library standing?', say: 'People here burned their furniture the first winter of this, and it is not even winter yet. Nobody has touched those books. I catch people in there at three in the morning reading about farming. That is the whole reason to keep a wall up, you understand? So somebody can read about farming.', standing: 1 },
          { id: 'signs', ask: 'Someone is keeping the Meridian Square signs lit.', say: 'Not us. We ran a cable that way in week two and the crew did not come back. It costs somebody a fortune in diesel to keep that up. Either they are insane or it is bait. In this city I no longer see a difference.' },
          { id: 'trust', ask: 'Can you get me anything off the books?', req: { standing: 25 }, say: 'For you, the quartermaster has a shelf behind the shelf. Take a case of rifle rounds. Do not make me write it down.', give: { ammo_rifle: 60, ammo_pistol: 48 }, daily: true },
          { id: 'cable', ask: 'Tell me about that lost cable crew.', req: { standing: 10 }, say: 'Six people, two of them mine. They were running line down 7th when the radio went. I want to know what happened, and I want the junction box back, because you cannot buy a junction box anymore. Go to where the line stops. Be quiet about it.', then: ['cable_yes'], once: true },
          { id: 'cable_yes', sub: true, ask: 'I will find out.', say: 'It is marked. If they are walking around out there, you do what you have to do. And thank you.', job: 'bryant_cable' },
          { id: 'cable_done', pay: 'bryant_cable', req: { flag: 'bryant_cable_done', notFlag: 'bryant_cable_paid' }, ask: 'I found your junction box. And your crew.', say: 'Do not tell me how they looked. Just tell me if it was quick. No? Then lie to me, and take this. Their names go on the wall tonight.', standing: 12 },
        ],
        favours: { bryant_cable: { title: 'The lost cable crew', type: 'fetch', u: .311, v: .215, reward: 340, bonus: 'medkit', desc: 'Find where the market\'s cable crew stopped on Kingsway and bring back the junction box.' } },
      },
      {
        id: 'abara', name: 'Doc Abara', role: 'medic', title: 'Field Medic', weapon: 'pistol', wardrobe: 'med',
        greet: { first: 'Sit down if you are dying, stand if you are shopping. I was a dentist in Astoria. Yes, a dentist. You want to see the other guy\'s diploma?', again: ['What hurts?', 'Open your mouth. Kidding. Mostly.'], hurt: 'Sit. Sit! How long has it been like that?' },
        topics: [
          { id: 'dentist', ask: 'A dentist is the settlement doctor?', say: 'A dentist is a doctor who is good with small tools and frightened people. I have taken off four fingers and one foot since August. The foot was harder than I expected. Nobody teaches you the sound.' },
          { id: 'bite', ask: 'Can you cure a bite?', say: 'No. Nobody can. I can slow it, and if you catch it early enough your body sometimes wins. Antibiotics help with the infection that comes along for the ride. It does not make sense, medically, and I have stopped asking it to.' },
        ],
      },
      {
        id: 'lucky', name: 'Lucky Chen', role: 'general', title: 'General Goods', weapon: 'smg', wardrobe: 'civ',
        greet: { first: 'Lucky. Three generations on Quay Street, and I am the first one who ever sold a can of peaches for more than a car. Do not haggle. I can see you are about to haggle.', again: ['What do you need? Everything is the same price, but sadder.', 'Back again. My favourite regular. I have two regulars.'] },
        topics: [{ id: 'lucky', ask: 'Why do they call you Lucky?', say: 'Because on the first day I closed early to go to a wedding in Flushing, my cousin. Everybody on my block who stayed open is out there walking around. My cousin did not make it either, so. Lucky. It is a joke. You can laugh, everyone else does.', standing: 1 }],
      },
      {
        id: 'saltz', name: 'Manny Saltz', role: 'arms', title: 'Arms Dealer', weapon: 'shotgun', wardrobe: 'scrap',
        greet: { first: 'Saltz. Forty years on Exchange Avenue selling diamonds. Turns out a gun is just a diamond with a purpose. What do you carry?', again: ['Ah, the customer returns.', 'For you, I have been saving something. I have been saving it for everyone, but still.'] },
        topics: [
          { id: 'where', ask: 'Where do you get all this?', say: 'The Guard left in a hurry. The police left in a bigger hurry. And up in Esperance you would be shocked what was in the closets. A lady on Belmont Road had a Browning with her initials on it.' },
          { id: 'tip', ask: 'What should I be carrying out there?', say: 'Rifle for distance, shotgun for the doorway, and something that does not make noise for when you are doing it right. The loudest thing out there should never be you.', standing: 1 },
        ],
      },
      {
        id: 'bits', name: 'Bits', role: 'junk', title: 'Scrap Merchant', weapon: 'machete', wardrobe: 'scrap',
        greet: { first: 'Hey. Hi. Do you have copper? Everyone says no and then they have copper. I am Bits. Not my real name. My real name was for someone with a different life.', again: ['Copper?', 'You came back. Most people do not come back, so that is nice.'] },
        topics: [{ id: 'name', ask: 'What was your real name?', say: 'You know, nobody has asked. I worked at the Apple Store on 5th. The glass one. I watched it fill up. I am going to go with Bits.', standing: 1 }],
      },
      {
        id: 'ramos', name: 'Sgt. Ramos', role: 'captain', title: 'Wall Captain', weapon: 'rifle', wardrobe: 'civ', spot: 'gate',
        greet: { first: 'Corrections officer, Rikers, nineteen years. Yes, I know how that sounds. Turns out it is the same job, only now they are all on the outside.', again: ['Wall is holding.', 'North side has been busy. Stay off the catwalk unless you are shooting.'] },
        topics: [
          { id: 'wall', ask: 'How does the wall hold up?', say: 'Stack two layers of cabs, fill the cracks, and put a rifle every twenty feet. They do not plan. They just lean, and leaning takes time. As long as we shoot faster than they lean, we sleep.', then: ['help'] },
          { id: 'help', sub: true, ask: 'Can I shoot from the wall?', say: 'Stairs are right beside each gate. Get up there any time. Aim for the head, the ammo is not free. Well, for you it is, you are spending your own.', standing: 1 },
        ],
      },
    ],
    barks: {
      guard: ["Eyes on the north side.", "They're still coming down 42nd.", "Don't shoot till they're on the stakes.", "Can someone bring me some water? It's been six hours.", "Is that the same guy from yesterday? With the tie?"],
      folk: ["Best price on the floor, I promise.", "Did you see what she's asking for batteries?", "My kid thinks the taxis are a fort. I let him.", "There was real coffee at stall three yesterday.", "Watch the kids.", "I used to eat lunch right here. Every day.", "I'm not paying that.", "Who's minding the stall?"],
    },
  },

  battery: {
    motto: 'Somebody is coming. Keep the light on.',
    jobIntro: 'The Harbormaster posts work when there is tide to spare.',
    cast: [
      {
        id: 'wen', name: 'Captain Wen Liu', role: 'leader', title: 'Harbormaster', weapon: 'shotgun', wardrobe: 'scrap',
        greet: {
          first: 'Wen Liu. Twenty-two years on the Severn Bay ferry, and I never once sank it. The boat behind you ran out of fuel in the third week with four hundred people on board. We walked them up the gangway and built a wall around the gangway.',
          again: ['Tide is turning. What do you need?', 'Any boats where you came from? No. Nobody ever has boats.'],
          hurt: 'You look like you swam here. Go sit by a fire.',
          night: 'We keep the signal lamp burning all night. Do not ask me who for.',
        },
        topics: [
          { id: 'ship', ask: 'What is everyone waiting for?', say: 'A Navy hospital ship came on the radio in week one. It said it would stand off the bay and send boats for survivors. It said that for nine days, and then it said nothing.', then: ['believe', 'staten'] },
          { id: 'believe', sub: true, ask: 'Do you think it is still out there?', say: 'I think that three hundred people sleep better for believing it. I think that if I stop lighting the lamp, somebody walks into the water. So. Do I think it is out there? I light the lamp.', standing: 2 },
          { id: 'staten', sub: true, ask: 'Have you tried getting across?', say: 'Twice, on rafts. The current in the mouth of the bay killed one crew. The second crew reached the spit and they signal us at dusk. Three flashes means alive. They did two last night.', set: 'battery_flashes' },
          { id: 'statue', ask: 'The lamp on Severn Rock is lit.', say: 'I know. I watch it every night. It started the same week the radio stopped. There is someone out there on purpose, and they either do not need us or they do not want us. If you swim it, you tell me which.' },
          { id: 'radio', ask: 'Is there anything I can do about that radio?', req: { standing: 10 }, say: 'The Coast Guard station has a proper transmitter, but the mast is out on the old pleasure pier and the unit up there needs someone to stand beside it long enough to send a burst. It makes a noise you can hear in Dayton. Everything for ten blocks will come to look.', then: ['radio_yes'], once: true },
          { id: 'radio_yes', sub: true, ask: 'I will hold it as long as it takes.', say: 'Forty seconds. Then get out. We will all be listening.', job: 'battery_radio' },
          { id: 'radio_done', pay: 'battery_radio', req: { flag: 'battery_radio_done', notFlag: 'battery_radio_paid' }, ask: 'The burst went out. Did you hear anything?', say: 'Static. Then nothing. Then, for eleven seconds, somebody keying a microphone. No voice. Just the click, twice. It might be nothing. Three hundred people are dancing outside right now, so do not tell them that.', standing: 14 },
          { id: 'trust', ask: 'Anything left in the hold?', req: { standing: 25 }, say: 'There is always something in the hold for a friend of the boat. Flare charges, medical. Take it before the kids find it.', give: { dynamite: 1, medkit: 2 }, daily: true },
        ],
        favours: { battery_radio: { title: 'One burst out to sea', type: 'hold', u: .8374, v: .7964, reward: 420, bonus: 'dynamite', desc: 'Hold the old transmitter on the pleasure pier for forty seconds, and try to survive the attention.' } },
      },
      {
        id: 'obi', name: 'Obi', role: 'general', title: 'Quartermaster', weapon: 'axe', wardrobe: 'civ',
        greet: { first: 'Welcome aboard. Well, not aboard. Everyone says that, and it stuck. I am Obi. I was a deckhand. Now I count cans.', again: ['Counting cans. It never ends.', 'Fresh fish, if you are not fussy about the river.'] },
        topics: [{ id: 'fish', ask: 'You are eating fish out of the bay?', say: 'The water is cleaner than it has been in a century. No boats, no factories. That is the sad joke of the thing. We have striped bass in the bay like it is 1640.' }],
      },
      {
        id: 'dutch', name: 'Dutch Vandermeer', role: 'junk', title: 'Salvage Boss', weapon: 'shotgun', wardrobe: 'scrap',
        greet: { first: 'Dutch. The yacht at North Cove used to belong to a hedge fund guy. Now it is about eleven hundred pounds of useful copper. You bring me scrap, I pay. Simple.', again: ['What did you drag in?', 'Tide brings me things. You bring me things. Everybody wins.'] },
        topics: [{ id: 'hedge', ask: 'What happened to the hedge fund guy?', say: 'He offered me two million dollars for a seat on a raft. I took his watch. Lovely watch. It stopped in October, and I still wear it.' }],
      },
      {
        id: 'maeve', name: 'Maeve', role: 'captain', title: 'Dockwatch', weapon: 'lmg', wardrobe: 'scrap', spot: 'gate',
        greet: { first: 'You came overland? Through that? You are either very good or very stupid, and I would like to know which before you stand behind me.', again: ['Still got your head.', 'Keep moving, you are in my field of fire.'] },
        topics: [{ id: 'gun', ask: 'Where did you get an LMG?', say: 'Off a Guard kid on Strand Avenue who did not need it anymore. I learned on my feet. Short bursts. It wants to climb, so you lean into it like a drunk uncle.' }],
      },
    ],
    barks: {
      guard: ["Watch the promenade, they come along the water.", "Container six is rattling again.", "Nothing on the water. As usual.", "East run's holding.", "Tide's coming in."],
      folk: ["I saw three flashes last night, I swear.", "If that ship ever comes you can have my tent.", "Smells like diesel out here.", "Can you mend that net? We need it tonight.", "My mom's down the coast somewhere. I keep watching for her boat.", "Any fish today?"],
    },
  },

  wash: {
    motto: 'Everyone gets a vote. Everyone stands a watch.',
    jobIntro: 'The Assembly votes on work each morning. It takes a long time.',
    cast: [
      {
        id: 'okafor', name: 'Prof. Adaeze Okafor', role: 'leader', title: 'Facilitator of the Assembly', weapon: 'crossbow', wardrobe: 'civ',
        greet: {
          first: 'Please do not call me the leader. The Assembly would have to discuss it for an hour. I taught political theory two blocks from here. I am now testing whether any of it was true.',
          again: ['The Assembly meets at sundown. You are welcome to observe.', 'Good timing. We have just lost a vote on latrines, and I would enjoy a distraction.'],
          hurt: 'Sit, sit. Someone find Tam. You are bleeding on the minutes.',
          trusted: 'Ah. The Assembly voted to give you a voice, you know. Eighty-one to six. The six are very sorry and would like you to know it is nothing personal.',
        },
        topics: [
          { id: 'vote', ask: 'You really vote on everything? With that outside?', say: 'We voted to build the wall. We voted on where to bury people. It is maddeningly slow, and when a decision is made, nobody here has to be made to obey it. Do you know how many people the strongman settlements lose to their own side? We have lost none.', then: ['slow', 'crisis'] },
          { id: 'slow', sub: true, ask: 'What happens when there is no time to vote?', say: 'Then the wall captain decides, and answers for it at sundown. It has only gone badly once. We voted on that too.', standing: 1 },
          { id: 'crisis', sub: true, ask: 'Has it ever nearly fallen apart?', say: 'Week three. Someone proposed locking the bitten in the arch and leaving them there. It nearly passed. It lost by four votes. I have not slept well since, and I have not been so proud of anyone either.', standing: 2 },
          { id: 'arch', ask: 'Why build the settlement around the arch?', say: 'Practically, it is the highest stone we have and we keep a lookout up there. Otherwise? The county put it up for the boys who went off to a war about ordinary people deciding their own affairs. I think they would be alarmed by us. And I think they would stay.' },
          { id: 'books', ask: 'Is there anything you need out there?', req: { standing: 10 }, say: 'The county extension office is on Church Street in Weston, a short walk east of the wall, and it holds the entire agricultural archive. We have sixty people growing tomatoes from a YouTube memory. Fetch the crate we packed before we lost that block, and you will have fed this settlement for ten years.', then: ['books_yes'], once: true },
          { id: 'books_yes', sub: true, ask: 'I will bring it back.', say: 'I would hold a vote of thanks, but I fear you have somewhere to be.', job: 'wash_books' },
          { id: 'books_done', pay: 'wash_books', req: { flag: 'wash_books_done', notFlag: 'wash_books_paid' }, ask: 'Here is your crate of farming manuals.', say: 'Soil pH. Crop rotation. Oh, these are beautiful. Thank you. I will tell the Assembly you carried this through all of that, for the sake of tomatoes. There may be a song.', standing: 14 },
          { id: 'trust', ask: 'Could the commune spare anything?', req: { standing: 25 }, say: 'There is a standing motion on your account. It passed. Tam packed you some things.', give: { medkit: 1, antibiotic: 1, ammo_rifle: 30 }, daily: true },
        ],
        favours: { wash_books: { title: 'The agricultural archive', type: 'fetch', u: .4956, v: .6177, reward: 300, bonus: 'antibiotic', desc: 'Recover the crate of farming manuals the commune left behind at the extension office on Church Street.' } },
      },
      {
        id: 'tam', name: 'Tam Nguyen', role: 'medic', title: 'Nursing Student', weapon: 'bat', wardrobe: 'med',
        greet: { first: 'Second-year nursing at Ballarat State. I am the most qualified person here, and I passed anatomy with a C. So. Hi. Where does it hurt?', again: ['Are you eating? You look like you are not eating.', 'Keep that wound dry.'] },
        topics: [{ id: 'scared', ask: 'How do you do this every day?', say: 'I decided around week two that I would be scared later. It has been forty days and it is still later. Ask me again when somebody else knows how to set a bone.', standing: 1 }],
      },
      {
        id: 'jules', name: 'Jules', role: 'general', title: 'Commune Stores', weapon: 'machete', wardrobe: 'civ',
        greet: { first: 'Everything in the stores is common property, except that you are not part of the commune, so it is spades for you. I do not make the rules. I voted against the rules.', again: ['Stores are open.', 'I voted against that too.'] },
        topics: [{ id: 'against', ask: 'Do you vote against everything?', say: 'I was a tenant organizer on Bleecker for thirty years. Somebody has to read the small print. It keeps them honest. Yesterday I got a sixty-word amendment through on compost.' }],
      },
      {
        id: 'esi', name: 'Esi Mensah', role: 'captain', title: 'Wall Captain', weapon: 'crossbow', wardrobe: 'civ', spot: 'gate',
        greet: { first: 'I coached the Ballarat State archery team. Fourteen months ago that was the least useful job in Ballarat. Crossbows do not bring company. That is the entire doctrine.', again: ['Quiet shots today.', 'Bolts are reusable, bullets are not. Think about that.'] },
        topics: [{ id: 'quiet', ask: 'Why not use rifles?', say: 'Every shot you fire is a dinner bell. We kept a rifle on each corner for emergencies, and the rest of us shoot quiet. Our wall has seen a quarter of what Fort Westpoint sees, and they have twice the guns.', standing: 1 }],
      },
    ],
    barks: {
      guard: ["Bolt.", "Keep it down up there, please.", "That one's mine.", "Don't forget the watch vote at sundown.", "Who's relieving me?"],
      folk: ["Point of order.", "I'll yield my time, whatever.", "That's the fourth amendment to the latrine thing.", "I wrote my thesis on Hobbes. Funny, right?", "Did someone water the tomatoes?", "Did you vote yet?", "That meeting went three hours."],
    },
  },

  union: {
    motto: 'Hold the line. Nobody else is coming.',
    jobIntro: 'Sergeant Whitaker hands out tasking at 0700. Be on time.',
    cast: [
      {
        id: 'whitaker', name: 'SSgt. Cole Whitaker', role: 'leader', title: 'Commanding', weapon: 'rifle', wardrobe: 'mil',
        greet: {
          first: 'Stand easy. Whitaker, 69th Infantry, what is left of it. Our orders on day nine were to fall back across the state line and blow the crossings behind us. There were eleven thousand civilians on this side. We got on the radio and said we could not read them. We are still having that radio trouble.',
          again: ['Report.', 'Make it quick, I have a perimeter to walk.', 'You are out of uniform, but I will let it go.'],
          hurt: 'Medic! No, belay that. Get yourself seen to and come back when you can stand at attention.',
          night: 'Night watch is doubled. Do not skyline yourself on the wall.',
          trusted: 'Good to see you. I do not say that to many.',
        },
        topics: [
          { id: 'orders', ask: 'You disobeyed orders?', say: 'I am aware. I think about the court-martial sometimes. I would quite like to be court-martialed. It would mean there was a court.', then: ['anyone', 'rank'] },
          { id: 'anyone', sub: true, ask: 'Have you heard from anyone in command?', say: 'A voice on the net in week two ordered every Guard unit to Atlanta. Sounded very sure of himself. We tried raising him last month. Now it is an automated tone. I had the men stop listening. It was bad for morale.', standing: 1 },
          { id: 'rank', sub: true, ask: 'Why are they still following you?', say: 'Because I walk the wall at 0300, and I eat last. I was a high school gym teacher in Yonkers six weeks a year, and a staff sergeant the other forty-six. The stripes do not mean anything now. So I have to.', standing: 2 },
          { id: 'civ', ask: 'What about the civilians in here?', say: 'Everyone gets a job and a rifle. Everyone trains at the range, including Mrs. Petrakis, who is seventy-three and shoots better than my corporals. I do not run a refugee settlement. I run a garrison, and they are the garrison.' },
          { id: 'drill', ask: 'Your people look sharp. Any advice?', say: 'Watch your six, watch your ammo, and do not go into a building you cannot get out of. Stack your block kits at the door behind you. Three seconds of plank has saved more lives here than I have.', standing: 1 },
          { id: 'depot', ask: 'Anything specific you need done?', req: { standing: 10 }, say: 'The armory on Carrow Avenue, in Albion. 69th Regiment, our home. We left in a hurry and there are crates of 5.56 behind a door we never got back to. It is thick with them around there. I cannot spare a squad. You look like you can count to forty.', then: ['depot_yes'], once: true },
          { id: 'depot_yes', sub: true, ask: 'Consider it done, Sergeant.', say: 'Clear the street first. I want it cold before I send a truck. Dismissed.', job: 'union_depot' },
          { id: 'depot_done', pay: 'union_depot', req: { flag: 'union_depot_done', notFlag: 'union_depot_paid' }, ask: 'Street outside the armory is clear.', say: 'Good. Truck rolls at first light. You did that alone, and I have men here who will not go into Albion in a squad. You ever want a stripe, you come see me. Here. It is a real M249, and it is not on anyone\'s books.', standing: 15, give: { lmg: 1, ammo_rifle: 200 } },
          { id: 'trust', ask: 'Request resupply, Sergeant.', req: { standing: 25 }, say: 'Granted. Sign for it. That is a joke, nobody has signed for anything since August.', give: { ammo_rifle: 90, grenade: 2 }, daily: true },
        ],
        favours: { union_depot: { title: 'Clear the 69th Armory', type: 'kill', u: .16, v: .30, need: 40, reward: 380, desc: 'Put down forty infected around the 69th Regiment Armory on Carrow Avenue, in Albion, so a truck can get in.' } },
      },
      {
        id: 'petrakis', name: 'Mrs. Petrakis', role: 'local', title: 'Marksman', weapon: 'sniper', wardrobe: 'civ', spot: 'hq',
        greet: { first: 'You stand like my late husband. He also could not shoot. Sit, I will tell you what you are doing wrong.', again: ['Your elbow is too high.', 'I shot in Crete, as a girl, against people who shot back. These do not even shoot back.'] },
        topics: [
          { id: 'crete', ask: 'Where did you learn to shoot?', say: 'My village, 1963. My father did not have sons, so I got the rifle. Then I came to Astoria, I had four children, and I did not fire a shot for fifty-eight years. And then one morning it was like riding a bicycle.', standing: 1 },
          { id: 'tips', ask: 'How do I get better?', say: 'Breathe out. Pick the one in front of the one in front. And never shoot the one nearest you unless he is actually touching you, because you always have one more second than you think.', standing: 1 },
        ],
      },
      {
        id: 'dwyer', name: 'Cpl. Dwyer', role: 'arms', title: 'Armorer', weapon: 'lmg', wardrobe: 'mil',
        greet: { first: 'Dwyer. I keep the guns running and the books honest, and the Sergeant keeps me from selling the guns. You have got spades? Then you are a coalition partner.', again: ['What can I do for our coalition partner?', 'Clean your weapon. I can smell it from here.'] },
        topics: [{ id: 'sell', ask: 'Why does the Guard sell guns?', say: 'Because we need antibiotics and the Market wants hardware, and spades are the only thing both sides can stand to hold. Also I am saving up for something. I do not know what. It is just nice to save.' }],
      },
      {
        id: 'hobbs', name: 'Hobbs', role: 'junk', title: 'Motor Pool', weapon: 'smg', wardrobe: 'mil',
        greet: { first: 'Motor pool. Hobbs. I have got three Humvees and fuel for one. If you find a fuel pump, I will love you, in a professional sense.', again: ['Fuel pump?', 'I can get number two running by Friday. There is no Friday anymore, but you get the idea.'] },
        topics: [{ id: 'friday', ask: 'Do you still keep track of days?', say: 'I keep a calendar on the wall. Day 41. My daughter\'s birthday is day 66. She is in Tucson with her mom, who hates me, and I hope is right about everything. I mark it off every morning.', standing: 1 }],
      },
    ],
    barks: {
      guard: ["Contact north. Single shots.", "Sector's clear.", "Check your fire, Ruiz!", "Radio check. Nothing, same as yesterday.", "Two more hours on this post."],
      folk: ["Formation in ten.", "Mrs. Petrakis outshot the whole squad again.", "Clean it again, he's gonna check.", "Beans again. Great.", "Civilians get the same ration we do, and that's fair.", "Anyone got a spare sock?", "Copy that."],
    },
  },

  sheep: {
    motto: 'Plant something. You are staying.',
    jobIntro: 'Judge Halloran posts community service on the hall door. She means it literally.',
    cast: [
      {
        id: 'halloran', name: 'Judge Miriam Halloran', role: 'leader', title: 'The Judge', weapon: 'pistol', wardrobe: 'civ',
        greet: {
          first: 'Miriam Halloran. Ballarat Superior Court, Albion County, retired against my will. You will find we have tomatoes and rules here, and you will find that the first depends on the second. Welcome to the Bastion. Do try not to be sentenced.',
          again: ['Good to see you. Wipe your boots.', 'You are in my way, dear, but only slightly.'],
          hurt: 'Good heavens. Go to the clinic before you ruin the rug. We do have a rug.',
          night: 'Curfew is at nine. It does not apply to you, but it does apply to my disapproval.',
          trusted: 'You have been a credit to us. I had a citation written up. It is a very nice citation, we have a calligrapher.',
        },
        topics: [
          { id: 'rules', ask: 'What rules are you talking about?', say: 'No theft, no violence, no weapons discharged inside the wall. Everyone works, everyone stands a watch, and anyone who breaks these faces a hearing. Anyone found guilty is walked to the gate and given three days of food and a head start.', then: ['exile', 'tried'] },
          { id: 'exile', sub: true, ask: 'You send people out there? That is a death sentence.', say: 'Yes. I know exactly what it is. I sent the first one myself, a man who had stolen insulin from a child. He had a lawyer, and I gave him one of ours, and he was walked out by daylight. I did not sleep, and I would do it again. A wall with no law inside it is only a prison that nobody has admitted to yet.', standing: 2 },
          { id: 'tried', sub: true, ask: 'Have you ever found anyone innocent?', say: 'Eleven of nineteen. People forget that part. The hearings are not a formality. If you ever need one, you shall have a very good defense.', standing: 1 },
          { id: 'food', ask: 'You really grow all this yourselves?', say: 'Eight hundred acres of it, once we are done. The Arnhem families spent a hundred and fifty years making the best soil in Ballarat, and the banks had most of it off them before any of this. There are six thousand mouths inside this wall and in the settlements that trade with us. In three months that is the only thing in the city that matters.', standing: 1 },
          { id: 'met', ask: 'What about the museums in Albion?', say: 'A Greek vase will not feed anyone. But I have sent two teams for the State House charter, because somebody must, and I will not explain myself further.' },
          { id: 'seed', ask: 'Is there a way I could serve the Bastion?', req: { standing: 10 }, say: 'There is. The Conservatory Garden moved its heirloom seed bank down to the Shakespeare Garden shed, just north of us. We have four strains of everything and that is not enough. It is dangerous ground, and you would be doing it for strangers\' grandchildren.', then: ['seed_yes'], once: true },
          { id: 'seed_yes', sub: true, ask: 'I will bring you the seeds.', say: 'I expected no less. Mind the Weston road.', job: 'sheep_seeds' },
          { id: 'seed_done', pay: 'sheep_seeds', req: { flag: 'sheep_seeds_done', notFlag: 'sheep_seeds_paid' }, ask: 'Your seed bank, Judge.', say: 'Do you know, in forty-one years on the bench, no one has ever handed me anything that made me cry? Sit down. You are getting the tomatoes. They are not on the market, those tomatoes. You are an honored citizen of the Bastion, and that is a court order.', standing: 16, give: { medkit: 2, beans: 6, water: 6 } },
          { id: 'trust', ask: 'Could the Bastion spare provisions?', req: { standing: 25 }, say: 'Citizens draw from the common stores. Here is your ration, and do not sell it, I would know.', give: { beans: 4, water: 4, medkit: 1 }, daily: true },
        ],
        favours: { sheep_seeds: { title: 'The heirloom seed bank', type: 'fetch', u: .514, v: .609, reward: 360, bonus: 'stim', desc: 'Recover the heirloom seed bank from the co-op store under the Weston elevator, north of the Bastion.' } },
      },
      {
        id: 'ellis', name: 'Ellis Boone', role: 'general', title: 'Farm Boss', weapon: 'shotgun', wardrobe: 'civ', spot: 'field',
        greet: { first: 'Ellis. Ran a community garden in Westmoor for twenty years, and every landlord in Albion told me it was not a real farm. Well. Look at it now. You want tomatoes? You will work for tomatoes.', again: ['Rain would be nice.', 'Mind the rows, those are somebody\'s supper.'] },
        topics: [
          { id: 'tom', ask: 'Are those really tomatoes?', say: 'Brandywines. We had a woman smuggle the seed in her bra through a police checkpoint. Taste one and tell me there is nothing left to fight for.', standing: 1, give: { beans: 1 }, once: true },
          { id: 'horde', ask: 'Do the zombies ever get into the crops?', say: 'They do not eat them. They do not eat anything but us. It took me a while, but I find that a comfort. This whole world still grows if you leave it alone.' },
        ],
      },
      {
        id: 'rennick', name: 'Rennick', role: 'arms', title: 'Bailiff', weapon: 'rifle', wardrobe: 'mil',
        greet: { first: 'Bailiff. Also sheriff, also the gun shop. The Judge says it is a conflict of interest, and we have a hearing on it next month.', again: ['Keep it holstered inside the wall.', 'Court is not in session.'] },
        topics: [{ id: 'walk', ask: 'You are the one who walks people to the gate?', say: 'Yes. All eight of them. I carry their bag. I tell them which way the river is. And I do not watch them go, because I tried that once. Do not ask me about it again.' }],
      },
      {
        id: 'halima', name: 'Dr. Halima Said', role: 'medic', title: 'Town Physician', weapon: 'pistol', wardrobe: 'med',
        greet: { first: 'I am a pediatrician. Please, I would like you to know how often I now have to say that to grown men with axes. Sit.', again: ['Temperature first.', 'Show me the bite. I know you are hiding one, everyone is.'] },
        topics: [{ id: 'kids', ask: 'How are the children doing here?', say: 'Do you know what is terrible? They are fine. They play at wall guard. There is a six-year-old here who can field-strip a pistol and will show you if you let him. They are fine, and I cannot decide if that is the best thing or the worst thing I have seen.', standing: 1 }],
      },
    ],
    barks: {
      guard: ["Movement over by the Great Lawn.", "No firing inside the wall, you know the rule.", "They're thin today.", "I can smell the kitchen from up here. It's killing me."],
      folk: ["Watch the rows!", "Hearing's at two.", "Is that a real rug?", "First frost's maybe six weeks out.", "I've got watch at four and weeding at six.", "She found him innocent, you know.", "Who left the greenhouse open?"],
    },
  },

  tompkins: {
    motto: 'No masters. No exceptions. No, you cannot borrow that.',
    jobIntro: 'Mother Rat does not give orders. She mentions things that need doing, and looks at you.',
    cast: [
      {
        id: 'rat', name: 'Mother Rat', role: 'leader', title: 'Nobody\'s Boss', weapon: 'bat', wardrobe: 'scrap',
        greet: {
          first: 'Oh, look. Another one who walked past the sign and thinks I am in charge. I am not. Nobody is. I have been squatting on Cannery Row since 1988, I fought the cops on this very dock in the strike, and I have been waiting for the end of the world my entire adult life. Frankly, it has been a little disappointing.',
          again: ['You again. Grab a paintbrush or get out of the way.', 'Did someone tell you I was in charge? Who was it, I will hit them.'],
          hurt: 'You look like hell. Go see Sprocket, she has got whiskey and staples.',
          night: 'Night is when you can hear the hummingbird feeders. No, I will not explain that.',
          trusted: 'You. I like you. I would never tell you that, so I did not say that.',
        },
        topics: [
          { id: 'ready', ask: 'People say you were ready for this.', say: 'We were ready for it because we had already been thrown out of it. No power on this block since the eighties. We grow our own, we fix our own, and we have been fighting landlords, cops and Giuliani for forty years. A zombie is easy. A zombie does not have a lawyer.', then: ['others', 'ever'] },
          { id: 'others', sub: true, ask: 'What do you make of the other settlements?', say: 'The Market is capitalism with better walls. The Judge is a nice old lady who murders people. Westpoint is a bunch of sweet boys saluting a dead government. They are all rebuilding the thing that was killing us already. And in six months they will all be trading with us anyway, because we are the only ones who know how to fix a bicycle.', standing: 1 },
          { id: 'ever', sub: true, ask: 'Did you ever want it to end?', say: 'Honey, I used to stand on this dock and scream for it. I lost my whole building in the first week, thirty-five years of neighbors. Ask me again when I am drunk.', standing: 2, set: 'rat_truth' },
          { id: 'paint', ask: 'Why paint the walls?', say: 'Because it is ours. Because Fort Westpoint is the color of a bureaucrat. And because when the dead come up to our wall, the last thing they see will be a twelve-foot pink rat with a middle finger. I am not saying they notice. I am saying I notice.' },
          { id: 'squat', ask: 'What needs doing?', req: { standing: 10 }, say: 'I am not asking you to do anything, because I do not do that. But there is a building on Foundry Street, the Foundry squat, that held out longer than anybody, and the people in there have gone quiet, and somebody ought to go kill everything on that block and see. I just think that is an interesting thing that a person could do.', then: ['squat_yes'], once: true },
          { id: 'squat_yes', sub: true, ask: 'I am the person who could do it.', say: 'Well, I did not ask you. Remember that when you tell it later. Bring a shotgun.', job: 'tompkins_csquat' },
          { id: 'squat_done', pay: 'tompkins_csquat', req: { flag: 'tompkins_csquat_done', notFlag: 'tompkins_csquat_paid' }, ask: 'The block around C-Squat is clear.', say: 'And the people? No. No, I can see from your face. They went out swinging? Of course they did. I was at their wedding, those two, in 1994, it had a tuba. Take this. It is hers, and she would hate you, and she would want you to have it.', standing: 15, give: { sledge: 1, dynamite: 3 } },
          { id: 'trust', ask: 'Anything in the free box?', req: { standing: 25 }, say: 'Everything in the free box is free. That is why it is the free box. Do not take the good stuff, I have been saving it. Ah, take the good stuff.', give: { dynamite: 1, ammo_shell: 24, whiskey: 1 }, daily: true },
        ],
        favours: { tompkins_csquat: { title: 'Clear the Foundry squat', type: 'kill', u: .813, v: .151, need: 35, reward: 320, desc: 'Kill thirty-five infected on the Foundry Street block around the squat, and find out what became of the people inside.' } },
      },
      {
        id: 'sprocket', name: 'Sprocket', role: 'junk', title: 'Bike Mechanic', weapon: 'axe', wardrobe: 'scrap',
        greet: { first: 'Sprocket. She/they, whatever, I have got my hands full. Bike courier, eight years, before all of it. I can get across this town without touching the ground, and I can fix anything with a chain.', again: ['You got parts? I will give you more than Bits does.', 'Hold this. No, not like that.'] },
        topics: [{ id: 'roofs', ask: 'Without touching the ground?', say: 'Roofs. Fire escapes. Below 14th it is one continuous playground if you are not afraid of it. They are not good on stairs when you have a lead. Their real trick is that they never get bored. Do not be there when they catch up.', standing: 1 }],
      },
      {
        id: 'bella', name: 'Bella Donna', role: 'general', title: 'Kitchen Witch', weapon: 'machete', wardrobe: 'scrap',
        greet: { first: 'Oh, you are skin and bones, darling. I used to do a show at the Pyramid Club, you know, until it fell over. Now I run the kitchen. Same audience, except these ones occasionally say thank you.', again: ['Have you eaten, darling?', 'Soup is soup. Do not ask.'] },
        topics: [{ id: 'show', ask: 'You still do a show?', say: 'Saturdays. You had better believe it, sweetheart. Sequins do not rot. The world can end if it wants, but I have still got a closing number, and it needs a full house.', standing: 1 }],
      },
      {
        id: 'hex', name: 'Hex', role: 'captain', title: 'Watches the Wall', weapon: 'crossbow', wardrobe: 'scrap', spot: 'gate',
        greet: { first: 'I am not a captain. Nobody is a captain. I just happen to stand here a lot and tell people where to shoot.', again: ['Keep it down, they are listening.', 'You want a paintbrush or a crossbow? It is the same answer.'] },
        topics: [{ id: 'skull', ask: 'Who painted the skulls?', say: 'Everyone. One for each of ours who turned. You paint your own friend. It helps. It also makes the wall stronger, because there is less of a gap. Nobody has ever understood that second part.' }],
      },
    ],
    barks: {
      guard: ["Pink side's quiet.", "Oh, that was a good one.", "Who's on the barrel? It's getting low.", "Nice try, grandpa."],
      folk: ["Nobody's in charge here. That's kind of the point.", "It's a statement. Also, yeah, it's a weapon.", "Who took my wrench?", "Free box is open.", "Soup's up!", "They came for the gardens in 2004 too. We won that one."],
    },
  },

  morning: {
    motto: 'Nobody gets turned away. Everybody gets checked.',
    jobIntro: 'Dr. Brandt needs supplies. She always needs supplies.',
    cast: [
      {
        id: 'brandt', name: 'Dr. Imani Brandt', role: 'leader', title: 'Chief of Medicine', weapon: 'pistol', wardrobe: 'med',
        greet: {
          first: 'Dr. Brandt, Albion General, emergency medicine. Hold out both your arms. Thank you. Turn. Thank you. Welcome to the Redoubt. Sorry, I do that to everyone, and I will do it again next time.',
          again: ['Arms, please. Good. What can I do for you?', 'I have twelve minutes, so choose carefully.'],
          hurt: 'Do not talk. Lie down. Who taught you to tie that? Do not tell me.',
          night: 'I have been up thirty hours. If I seem kind, it is a symptom.',
          trusted: 'You are the only person on my list who brings things back instead of bleeding on them.',
        },
        topics: [
          { id: 'clinic', ask: 'How many do you treat here?', say: 'Two hundred a week, walking in through the gate from every settlement this side of the mountain. Dayton people, east bank people, people from nowhere. Our rule is that nobody gets turned away, and everybody gets checked. We have had to hold that second rule at gunpoint more often than I would like.', then: ['checked', 'quar'] },
          { id: 'checked', sub: true, ask: 'What happens if someone is bitten?', say: 'They go to the white tent on the far side, and we tell them the truth. Then I sit with them. I have sat with one hundred and twelve people. It is the only part of medicine I have left that I am certain I do well.', standing: 2 },
          { id: 'quar', sub: true, ask: 'Do you know what this thing is?', say: 'I have a theory with no lab behind it. It is not a virus in any way I understand. Everyone carries it. Everyone. The bite only seems to speed up what is already in there. That is why we check the ones who die of ordinary things, too. Please do not repeat that outside these walls.', set: 'morning_truth', standing: 1 },
          { id: 'cure', ask: 'Do you think there will be a cure?', say: 'I used to be the kind of doctor who said no to that question quite gently. It is a yes-or-no question for a lab with electricity. Find me a working centrifuge and I will give you a better answer.' },
          { id: 'cent', ask: 'Where would I find you a centrifuge?', req: { standing: 10 }, say: 'St. Luke\'s, up on 125th. The third-floor path lab was still running on backup when we pulled out. We left a portable unit crated in the ambulance bay. Please do understand what you would be walking into. Everyone who died in that hospital is still in that hospital.', then: ['cent_yes'], once: true },
          { id: 'cent_yes', sub: true, ask: 'I will bring it.', say: 'Take a trauma kit. I will mark the ambulance bay. Thank you, and do not be brave.', job: 'morning_cent', give: { medkit: 1 } },
          { id: 'cent_done', pay: 'morning_cent', req: { flag: 'morning_cent_done', notFlag: 'morning_cent_paid' }, ask: 'I have your centrifuge.', say: 'You went into St. Luke\'s. And you are not bitten, I can see that from here, but hold out your arms anyway. Thank you. I will have a real answer for you within a month, and it may be a terrible one. It will be the first true thing anyone has known about this. Come here. I do not hug. Consider this an exception.', standing: 18, give: { antibiotic: 4, stim: 2 } },
          { id: 'trust', ask: 'Can you spare any supplies?', req: { standing: 25 }, say: 'You keep our patients alive by keeping yourself alive. It is not charity, it is triage. Take it.', give: { medkit: 2, antibiotic: 2 }, daily: true },
        ],
        favours: { morning_cent: { title: 'A centrifuge from St. Brigid\'s', type: 'fetch', u: .803, v: .215, reward: 400, bonus: 'antibiotic', desc: 'Recover the crated portable centrifuge from the ambulance bay at St. Brigid\'s, in the middle of Dayton.' } },
      },
      {
        id: 'tomasz', name: 'Tomasz Bielski', role: 'medic', title: 'Pharmacist', weapon: 'smg', wardrobe: 'med',
        greet: { first: 'Tomasz. Thirty years a pharmacist in Greenpoint. I have kept the inventory by hand in the same ledger since day one. Your prescription, please. That is a small joke. We have to have those.', again: ['What is it you need?', 'Antibiotics are the new gold. Do not tell Mr. Saltz.'] },
        topics: [{ id: 'run', ask: 'How long until the medicine runs out?', say: 'Antibiotics, four months. Insulin, three weeks, and that is after we made decisions I will not describe. After that, it is willow bark and hope, and I have a very good book on willow bark.', standing: 1 }],
      },
      {
        id: 'nia', name: 'Nia Coleman', role: 'general', title: 'Stores and Intake', weapon: 'pistol', wardrobe: 'med',
        greet: { first: 'Intake. Name, where from, any bites, any fevers. You have to answer honestly. We check anyway, it just makes it nicer for everybody.', again: ['Stores are open.', 'Still no fever? Good. Keep it that way.'] },
        topics: [{ id: 'why', ask: 'What did you do before?', say: 'I worked the front desk at Ballarat State admissions. I told people no for eleven years, in a very pleasant voice. Now I get to say yes to almost everybody, and I cry about once a day in that tent right there. It is honestly an improvement.', standing: 1 }],
      },
      {
        id: 'rook', name: 'Rook', role: 'captain', title: 'Gate Security', weapon: 'rifle', wardrobe: 'mil', spot: 'gate',
        greet: { first: 'Arms. Doc\'s rule. Good. Rook. I was with college campus security, go ahead and laugh, everyone does. I have since shot eleven patients who tried to walk back out of that white tent. So not everyone laughs.', again: ['Arms.', 'You good? Move along.'] },
        topics: [{ id: 'eleven', ask: 'Eleven patients?', say: 'They were not patients by then. I tell myself that. I also know their names. The Doc makes me write them down, and then she reads them to me, and she does not let me skip any.', standing: 1 }],
      },
    ],
    barks: {
      guard: ["Arms out as you come through, please.", "Ambulance three's shaking again, watch that side.", "Good shot.", "Keep it down near the white tent."],
      folk: ["Next, please.", "Take two of these and try not to get bitten.", "We need clean water in tent four.", "Did she sleep at all?", "Has anyone seen my gloves?", "I passed my boards the day it started."],
    },
  },

  garvey: {
    motto: 'Look after your block. Then look after the next one.',
    jobIntro: 'Coach Holloway knows every family on this side of 125th. When she blows the whistle, you move.',
    cast: [
      {
        id: 'loretta', name: 'Yvonne Holloway', role: 'leader', title: 'Block Captain', weapon: 'shotgun', wardrobe: 'civ',
        greet: {
          first: 'Hold it. Hands where I can see them, then come closer. Yvonne Holloway. Thirty years teaching gym at P.S. 197, twenty-two summers running the girls\' bracket at Rucker. Everybody this side of 125th either played for me or has a kid who did, which is the only reason any of them listen. You are new. New sits on the bench until I see what you do. Do not take it personal. Everybody starts on the bench.',
          again: ['Still on your feet. Good. Stay that way.', 'What do you need? Make it quick, I have a wall rotation to fix.', 'Drink some water. I am serious. Half the people who go down out there go down tired.', 'You again. Fine. Talk.'],
          hurt: 'Sit. No, sit down. Head between your knees. Somebody get me the kit and a towel. You do not walk this off. Nobody walks this off.',
          night: 'Lights out is ten and I check. The Reverend has service going if you want people around you. Go on. Nobody will make you sing.',
          trusted: 'You are starting now. Do not let it go to your head. Starters run the most.',
        },
        topics: [
          { id: 'block', ask: 'How did you get everyone organized so fast?', say: 'Same way you run a summer league with no money. Lists. Who has a car, who has a key to the gym, whose grandmother is on insulin, whose uncle has a gun he is not supposed to have. The east bank was keeping those lists long before anybody across the river cared. When the Guard pulled back, I blew one whistle on Mill Road and four hundred people knew where to stand.', then: ['city', 'lost', 'whistle'] },
          { id: 'city', sub: true, ask: 'Do you resent how the city treated the east bank?', say: 'Resent is a big word for a tired woman. The city closed our pool three summers running and then sent a man up here to give a speech about youth programs. Now the west bank sends us traders, and I take their spades and I feed them. A grudge burns calories. I am rationing.', standing: 2 },
          { id: 'lost', sub: true, ask: 'Have you lost many?', say: 'My husband, Leon, the first day, on the 2 train. My sister. Fourteen of my girls, that I know of. I keep their jersey numbers on the board in the church, not their names. I can read numbers. On Sunday the Reverend reads the names. It takes forty minutes now. Nobody has ever once complained.', standing: 2, set: 'loretta_names' },
          { id: 'whistle', sub: true, ask: 'What is the whistle for?', say: 'A whistle carries four blocks and never runs out of batteries. One long, get inside. Two short, get on the wall. Three, you run for the church and you do not stop for anybody, me included. The kids learned it in a day. Grown men took a week.', standing: 1 },
          { id: 'food', ask: 'Something smells incredible.', say: 'That is Big Tiny. It is mostly pigeon. Do not ask, eat. Everybody who comes through my gate gets one plate. No tryouts. It is the only rule I ever made that I never had to explain.', give: { beans: 1 }, once: true, standing: 1 },
          { id: 'court', ask: 'You kept the basketball court going?', say: 'In the middle of all this, yes. You know what a fifteen-year-old does with nothing to do and a dead city outside the wall? Neither do I, and I am not finding out. Next is called, losers run the stairs, and the wall crew plays winners on Sunday. The wall crew has not won since August.', standing: 1 },
          { id: 'kids', ask: 'What needs doing around here?', req: { standing: 10 }, say: 'P.S. 197, on 135th. That was my gym for thirty years. We got the buses out the first week, but some kids hid in there, the way kids do, and my assistant went back for them. Mr. Okoye. Taught sixth grade, kept the clock for me on Saturdays. That was a month ago. The other night somebody saw a light in the gym. It is probably nothing. It has got to be nothing. Would you go look?', then: ['kids_yes'], once: true },
          { id: 'kids_yes', sub: true, ask: 'I will go right now.', say: 'Take a radio. Get up in the bleachers, the high side, and hold the channel open as long as you can. If anybody is in there, they know my voice. Tell them Coach says come out.', job: 'garvey_school' },
          { id: 'kids_done', pay: 'garvey_school', req: { flag: 'garvey_school_done', notFlag: 'garvey_school_paid' }, ask: 'I held the radio at the school. Three kids came out.', say: 'Three. Okay. Okay. And Okoye? No. No, he would not have left them. He would have kept the clock right to the end. Sunday the Reverend reads his name, and you sit up front with me. That is not a request.', standing: 20, give: { riot: 1, medkit: 3 } },
          { id: 'trust', ask: 'Could you spare a little?', req: { standing: 25 }, say: 'For you? Take it. Shells, a kit, something to eat. And bring the bag back. I am not running a charity, I am running a team.', give: { medkit: 1, ammo_shell: 16, beans: 2 }, daily: true },
        ],
        favours: { garvey_school: { title: 'The light in Eastbank Elementary', type: 'hold', u: .469, v: .22, reward: 350, bonus: 'stim', desc: 'Go to Eastbank Elementary on Tanner Avenue and hold the radio open for anyone still hiding in the school.' } },
      },
      {
        id: 'tiny', name: 'Big Tiny', role: 'general', title: 'Pitmaster', weapon: 'axe', wardrobe: 'civ', spot: 'plaza',
        greet: { first: 'Tiny. I ran a barbecue joint on Mill Road for twenty-six years. I have got a smoker, a hickory tree from the park, and a very flexible definition of what is meat. Who is hungry?', again: ['Got a plate for you.', 'You look hungry. Everybody looks hungry. I am doing my best here.'] },
        topics: [{ id: 'meat', ask: 'What exactly is on the smoker?', say: 'Today? Pigeon, some squirrel, and a raccoon who made a poor life decision. Everything is good with enough sauce and enough time. I have made my peace with that, and that goes for a lot of things.' }],
      },
      {
        id: 'marcus', name: 'Marcus Tull', role: 'arms', title: 'Arms and Security', weapon: 'sniper', wardrobe: 'civ',
        greet: { first: 'Marcus. Two tours in Fallujah, and then I came home and drove the M60 bus to LaGuardia for twenty years. Coach asked me to look after the wall. I played for her in the nineties. You do not tell Coach no. What do you need?', again: ['Need something?', 'Water tower is mine at sundown. Do not walk the east side around then.'] },
        topics: [{ id: 'iraq', ask: 'Is this anything like Fallujah?', say: 'No. Over there, I never knew who was coming for me. Here I always know, and I can see them from a mile away. Nobody is confused about whose side anyone is on. I have got to say, I sleep better. Tell Coach I said that and I will deny it.', standing: 1 }],
      },
      {
        id: 'ray', name: 'Deacon Ray', role: 'junk', title: 'Keeps the Salvage', weapon: 'bat', wardrobe: 'scrap',
        greet: { first: 'Ray. Deacon at Abyssinian, and I had a chop shop on 145th for about thirty years. The Lord knew about both. Bring me scrap, and I will give you a fair price, which is more than I gave most people.', again: ['What have you got?', 'Coach says I have to give you a fair price. So I am.'] },
        topics: [{ id: 'shop', ask: 'A deacon with a chop shop?', say: 'Son, every car in this wall came through me. Half of them, I already knew. There is a Buick out on 124th I stole twice. I look at it and I say, well, look at you now, doing something useful. Same as me.', standing: 1 }],
      },
      {
        id: 'reverend', name: 'Rev. Isaiah Cole', role: 'local', title: 'Abyssinian Baptist', weapon: 'pistol', wardrobe: 'civ', spot: 'hq',
        greet: { first: 'Peace be with you. I am the Reverend Isaiah Cole. People ask me if this is the Rapture, and I tell them that the Lord does not usually do His work on the 2 train.', again: ['Peace.', 'Service at sundown, if you are in need. And even if you are not.'] },
        topics: [
          { id: 'faith', ask: 'Do you still believe, after all this?', say: 'I have buried two hundred people. I asked the Lord why at every one of them. He has not answered. I find I am not done asking, and I think that may be all that faith ever was. Are you carrying anything you would like to set down? I do not need to know what it is.', standing: 2 },
          { id: 'gun', ask: 'You carry a pistol, Reverend?', say: 'The Lord is my shepherd. Mr. Smith and Mr. Wesson are also very supportive.' },
        ],
      },
    ],
    barks: {
      guard: ["Coach says hold the line, so we hold the line.", "I got him, I got him.", "Buses are shaking on 124th.", "I can smell Tiny from up here. Lord."],
      folk: ["You eat yet?", "Choir's at five.", "Who's got next on the court?", "That boy's got a jump shot, I'm telling you.", "Coach said so.", "Y'all save me a plate.", "That's my grandbaby up on that wall."],
    },
  },

  tryon: {
    motto: 'Keep it quiet. Keep it standing.',
    jobIntro: 'Finch keeps the work list in a ledger, in a very nice hand. Here is what is left on it.',
    cast: [
      {
        id: 'finch', name: 'Tobias Finch', role: 'leader', title: 'Warden of the Keep', weapon: 'machete', wardrobe: 'civ',
        greet: {
          first: 'You came up the hill, then. Most do not. Tobias Finch. I was Assistant Curator of Medieval Art at the Abbey Museum, and now I run the place, and they call me Warden because someone has to be. A railroad man shipped these stones from France for the view. I am pleased to report they still work.',
          again: ['What news from the valley?', 'You find us in good order. We have just re-roofed the chapter house.'],
          hurt: 'You are bleeding on eight hundred years of masonry. Go and see the nurse. She is very good.',
          night: 'The watch is set. I still walk the wall myself. It is the only time I sleep afterwards.',
          trusted: 'Good to see you. People here ask after you, you know.',
        },
        topics: [
          { id: 'real', ask: 'Warden? The stone walls? You really run it like a castle?', say: 'Partly because it is one. And partly because of what these people were, six weeks ago: accountants, frightened ones. Give someone a post on a wall with a name and a history, and they will stand on it against a thousand dead. I had three years of graduate theory, and nothing else I tried worked as well.', then: ['actor', 'alone'] },
          { id: 'actor', sub: true, ask: 'So it is all an act.', say: 'Of course it is. What do you think a garrison ever was? Frightened men telling each other a story about who they are. It holds, though. And now, if you will excuse me, I have the east wall to look at.', standing: 2, set: 'finch_real' },
          { id: 'alone', sub: true, ask: 'Do you ever get to stop being the Warden?', say: 'My husband used to tell me when to stop. The first night, he went back for the cat. I find that if I am the Warden from dawn until dusk, there are only a few hours in which I have to be Toby. So. Yes. At those times.', standing: 2 },
          { id: 'why', ask: 'Why crossbows? You have guns.', say: 'Sound. Gunfire travels for miles. We are at the top of a very quiet hill, we have rather less company than the rest of you, and we would like to keep it that way. Also, you can get a bolt back. The rifles are for when it has already gone wrong.' },
          { id: 'tapestry', ask: 'Does the Keep need anything?', req: { standing: 10 }, say: 'There is one thing, and I know how it sounds. The Unicorn Tapestries were crated in May for restoration, and they were last seen at a conservator\'s lab on 175th. I have told these people that we are the ones who kept something of the old world safe. I would like to have actually done it.', then: ['tap_yes'], once: true },
          { id: 'tap_yes', sub: true, ask: 'I will go and get them.', say: 'Thank you. I mean that. Do bring them back flat.', job: 'tryon_tapestry' },
          { id: 'tap_done', pay: 'tryon_tapestry', req: { flag: 'tryon_tapestry_done', notFlag: 'tryon_tapestry_paid' }, ask: 'I have your Unicorn Tapestries.', say: 'Oh. Oh, look at them. Five hundred years. They survived the French Revolution in a barn, you know, covering potatoes. Here. Take these, from the armory, you have earned them. I am going to go somewhere private now for a few moments.', standing: 18, give: { axe: 1, stim: 2, dynamite: 2 } },
          { id: 'trust', ask: 'Could you spare anything from the armory?', req: { standing: 25 }, say: 'For you, within reason. Reggie! The usual for our friend!', give: { ammo_rifle: 40, grenade: 1, medkit: 1 }, daily: true },
        ],
        favours: { tryon_tapestry: { title: 'The Unicorn Tapestries', type: 'fetch', u: .2197, v: .781, reward: 450, bonus: 'stim', desc: 'Recover the crated Unicorn Tapestries from a conservator\'s studio on Court Street, down in Esperance, for reasons the Warden finds obvious.' } },
      },
      {
        id: 'reginald', name: 'Reggie Marsh', role: 'captain', title: 'North Gate Watch', weapon: 'spear', wardrobe: 'mil', spot: 'gate',
        greet: { first: 'Stop there. Let me see your hands. Fine, you are all right. Reggie Marsh. I did tax compliance at Deloitte, if you can believe it. Please do say something if I am doing this wrong.', again: ['Pass. Was that all right?', 'All quiet on this side.'] },
        topics: [
          { id: 'deloitte', ask: 'How is the gate treating you?', say: 'Do you know, I have killed more than two hundred of them with this thing? It is a pike. I built it out of a parking sign. In all my years at Deloitte I never had a single day when I knew I had helped anybody. I actually have a sense of purpose now. It is awful. I love it.', standing: 1 },
        ],
      },
      {
        id: 'bronwyn', name: 'Bronwyn', role: 'arms', title: 'Fletcher and Smith', weapon: 'crossbow', wardrobe: 'civ',
        greet: { first: 'I was a set designer at the Albion Opera. I can build most things from most other things, so now I build crossbows. The bolts are parking meter poles. They go through a skull very quietly.', again: ['Need something that goes through a skull? Quietly?', 'Bring me scrap. I can always use scrap.'] },
        topics: [{ id: 'finch', ask: 'What do you really think of him?', say: 'Toby? Everyone thinks he is a bit much. He is a bit much. And he has got three hundred people who should all be dead sleeping safely every night. I would follow him anywhere. Just do not ever tell him.', standing: 1 }],
      },
      {
        id: 'sister', name: 'Sister Agnes', role: 'general', title: 'Cellarer', weapon: 'machete', wardrobe: 'civ',
        greet: { first: 'Sister Agnes. Yes, a real one, with the Sisters of Charity in Dayton. I was the only one here who knew what these rooms were for. Mr. Finch asks me to keep the stores. I do so, and I pray for whoever is on the wall.', again: ['God keep you. Cellar is open.', 'Yes, it is real wine, and no.'] },
        topics: [{ id: 'real', ask: 'What do you make of this place?', say: 'A real cloister was once a place where frightened people shut the door on a terrible world, copied out the old books by hand, and waited for it all to be over. That seems to me fairly accurate. It is the first place in forty years I have felt entirely at home.', standing: 1 }],
      },
    ],
    barks: {
      guard: ["Bolt away.", "Save your rounds, use the bolts.", "Nothing moving in the Heather Garden.", "Phil, I need a relief, my feet are killing me.", "Quiet on the east side."],
      folk: ["Morning.", "I was in tax. Now I make arrows.", "Don't step on the herbs.", "Keep your voice down, it carries in here.", "Who took the good whetstone?"],
    },
  },
};

// Anybody without a written part still has a life. These combine into a person.
export const BEFORE = [
  'I drove the M15 for twenty-two years. You would be amazed how much of this job is the same. Everybody is screaming, and you keep your eyes on the road.',
  'I was a paralegal on Exchange Avenue. I had just paid off my loans. I think about that a lot.',
  'I sold hot dogs outside Union Terminal. I know, right? Now I am a very important person.',
  'I taught fourth grade in Northgate. A few of them made it. I keep count.',
  'Doorman. Thirty years, 9th and Kingsway. I knew every one of them by name. I saw a few of them on the way here, too.',
  'I was an actor. Well. I waited tables. I had a line on Law and Order once.',
  'I ran a nail salon on Dayton Avenue. I am still doing nails, in a way, you would not believe how often somebody loses one.',
  'I dug the Weston Tunnel. Eleven years of it. I know what is under that ridge. Do not go through it at night.',
  'Stockbroker. No, really. I know. Nobody will trade me anything for it.',
  'I delivered for Seamless. I can still tell you the fastest route between any two points in Albion. I was very, very good at it.',
  'ConEd lineman. Everyone asks if I can get the power back on. I can do that, in about nine years, with a staff of twenty thousand.',
  'I worked the Macy\'s perfume counter. It is amazing what I can still smell.',
  'FDNY. Engine 7. I do not want to talk about the first week.',
  'I was fourteen when this started. I do not know. I was at school. I guess this is what I do now.',
  'I was a barista on Bedford and I had a podcast. I am so sorry.',
  'I was in the city for a conference. A weekend. I am from Omaha. I keep thinking I should call my boss.',
  'I cooked at a starred place in the Old Quarter. I am very happy to tell you what is wrong with what you are eating.',
  'Pediatric nurse at Mount Sinai. I would rather talk about something else.',
];

export const WEAPON_TALK = {
  pistol: 'A nine. It does not do much, but it has never let me down either, which is more than I can say for my brother.',
  rifle: 'Guard issue, off a kid who did not need it anymore. I clean it every night, and I say his name when I do it.',
  shotgun: 'My uncle\'s. He kept it for burglars. He would be thrilled.',
  smg: 'Took it out of a wrecked ESU truck. It eats ammo like you would not believe, but I like having it near.',
  sniper: 'It is a deer rifle. There are a lot of deer up on the wall, if you take my meaning.',
  lmg: 'You carry this all day, and then you tell me about your back.',
  crossbow: 'Quiet, and I can reuse the bolts. Plus I look amazing.',
  bat: 'Louisville Slugger. Signed by Reggie Jackson. Yes, I know what it was worth. Yes, I know what it is worth now.',
  machete: 'Hardware store on Main Street. The man had a whole wall of them. Nobody ever asked him why.',
  katana: 'It came from a wall in Esperance. It was a decoration. I had it sharpened, and it turned out to be a very good decoration.',
  axe: 'Off a fire engine. People tend to let you go first when you are carrying one.',
  spear: 'Made it myself out of a stop sign pole. Reach is everything. Stay out of the arms and you live.',
};

export const STATUS_TALK = [
  'Wall is holding. That is all anybody asks me anymore. Wall is holding.',
  'I sleep about four hours. I do not dream, which is fine by me.',
  'There are worse places than this. I have seen them. I do not recommend them.',
  'I had a whole life. I think about the stupidest parts of it. My Tuesday pizza place.',
  'You get used to the noise from outside. It is the day it stops that I am scared of.',
  'People are mostly decent, if you feed them. I did not expect that.',
  'We lost two on the north side last week, and I am still not over the one. Well. You know.',
  'I will tell you what I miss. Being bored. Being really, deeply bored, on a train.',
];

export const COMMON_BARKS = {
  guard: ["Stay sharp.", "Still coming.", "Reloading.", "Got him.", "You ever get used to this? Yeah, me neither.", "Long shift.", "What time is it?", "Anybody got a light?", "My back is killing me.", "Quiet tonight. Don't like it."],
  alarm: ["Heads up! They're on the wall!", "We've got a lot of them out here!", "Everybody on the wall, now!", "They're stacking up on the stakes!", "I need more guns on this side!"],
  folk: ["Stay safe out there.", "You new here?", "Long day.", "Careful with that thing.", "Is it true about the bridges?", "Excuse me.", "Sorry, coming through.", "God, I'm tired.", "Have you seen Sam?", "It's colder than yesterday.", "Where did I put that.", "Hm.", "Okay. Okay, fine."],
  shots: ["Hey! Save it for the wall!", "What are you shooting at? Put that away!", "Whoa, not in here!", "Are you out of your mind?"],
  thanks: ["Nice shooting.", "We could use more like you.", "Good one."],
};

// What someone is doing right now colours what they will say about it.
export const ACTIVITY_TALK = {
  sit: ['Just getting off my feet. Sit, if you want. Nobody here is going to bother you.', 'We do this every night. Somebody tells a story, and somebody corrects it. It is about the only thing that has not changed.', 'I had four hours on the wall. This fire is the best thing that has happened to me all week.'],
  sleep: ['Mmph.', 'Come back tomorrow.'],
  work: ['Same as yesterday: fix what broke. Something always broke.', 'If I keep my hands busy I do not have to think. It works about half the time.', 'We need this done before dark. Everything here needs doing before dark.'],
  farm: ['Blight on the south rows again. I am not a farmer. I sold insurance. But I am getting there.', 'People laugh until they get hungry.', 'A garden is the only thing here that gets better if you leave it alone for a day.'],
  shop: ['Prices went up again. I blame the Market. Everyone blames the Market.', 'Trying to trade a car battery for a pair of boots that fit. Wish me luck.', 'Just looking. You look at things, you remember what it was like to want things.'],
  talk: ['We were just saying. You ever think about how there used to be a whole department for parking?', 'Trading stories. It is that or trade complaints.', 'Oh, you know. Who is sleeping with who, who took whose blanket. Same as any town.'],
  class: ['Miss says I have to know my times tables in case there is a test. There is always a test.', 'Today we did Ballarat history. Nobody knows how it ends.'],
  teach: ['We do reading and sums, and which end of a rifle is which. In that order, I insist.', 'They are going to need to know what the world was, or they will not know what to build.'],
  mourn: ['I come here most days. I do not say anything. It just seems rude not to.', 'That one is my sister. They got the spelling wrong and I never had the heart to say.'],
  stand: ['Just taking a minute. You get about one a day.', 'Quiet today. I will take it.'],
  play: ['You cannot catch me!', 'Are you a real soldier? Can I hold that?'],
};

ACTIVITY_TALK.browse = ACTIVITY_TALK.shop;
ACTIVITY_TALK.patrol = ['Walking the inside of the wall. If something is getting through, you hear it down here first.', 'Twice round, then I get to sit down. That is the deal.', 'Up top they can see further. Down here we are the ones who actually get there.'];

export const ACTIVITY_BARKS = {
  market: ["You looking for something?", "Not here. Round the back.", "Keep walking if you're not buying.", "Who sent you?", "I didn't see anything.", "Quiet tonight. Good.", "Got something you'd like, if you've got the spades."],
  patrol: ["All quiet this side.", "Coming through.", "You hear that? No? Okay.", "One more lap.", "Who left this here?"],
  browse: ["How much? For that?", "I'll give you two cans.", "What else have you got?", "Is that real? Let me see it.", "My sister paid half that at the Market.", "I'm just looking.", "Hm. Maybe tomorrow."],
  sit: ["Anyway, that's when he told me it was his mother-in-law.", "Pass that over, would you?", "Remember brunch? Fourteen dollars for an egg.", "They sound louder tonight.", "I'd kill for a cold beer.", "Sing that one again.", "My feet are finished.", "So what happened after that?"],
  work: ["Hold this. No, the other end.", "Who keeps taking my hammer?", "That'll hold. For now.", "Almost got it.", "Hand me that, would you?", "This is on crooked.", "Ow. Damn it."],
  farm: ["Come on, you little beauties.", "Mind the rows.", "We could use some rain.", "These are coming in okay.", "Something's been at these."],
  shop: ["How much? For that?", "I'll give you two cans.", "Is that fresh? Don't lie to me.", "Line starts back there.", "You got any more of those?"],
  talk: ["I told him, you can't fix that with tape.", "No, listen, it gets worse.", "Is it true about the bridges?", "She said that? To your face?", "I don't know, maybe.", "That's what I said."],
  teach: ["Eyes up here, please.", "Seven times eight. Anyone?", "Who can tell me what that word means?"],
  class: ["Fifty-six!", "Can we go outside now?", "He's copying me!"],
  mourn: ["Miss you, you old fool.", "I lit one for you.", "Kids are fine. They ask about you."],
  kid: ["You can't catch me!", "Tag, you're it!", "My dad got a hundred of them.", "I'm not scared. I'm not!", "Is that a real gun?", "Are you from outside? What's it like?", "That's not fair, I wasn't ready!"],
};

export const KID_BEFORE = [
  'I was in third grade at P.S. 11. My teacher had a turtle. I hope somebody got the turtle.',
  'I do not remember much about before. There was a lot of TV.',
  'My mom says we are going home when it is over. I do not think she knows when that is.',
  'I was going to be a marine biologist. I still am. There is a lot of fish now.',
];

// Things people say to each other. Each entry is one exchange, taken in turns by whoever is standing together.
// {name} is whoever the line is said to. Mostly it's small: people talk about their feet and their dinner far
// more than the end of the world.
export const CONVERSATIONS = {
  // After dark the stalls keep going, quietly, and nobody asks where anything came from.
  nightmarket: [
    ["You got the thing?", "Keep your voice down.", "Do you have it or not?", "Behind the crates. Ten minutes."],
    ["Where'd you get this?", "You don't want to know.", "I kind of do.", "No. You don't."],
    ["That's Fort Westpoint ammo.", "It's ammo.", "It's got their stamp on it.", "Then don't shoot it at them."],
    ["Antibiotics. Real ones.", "Sealed?", "Mostly.", "What's mostly?"],
    ["I never saw you, {name}.", "Saw who?", "Good."],
    ["Who's that guy watching us?", "Nobody. Keep walking.", "He's still looking.", "So look less."],
    ["Does the council know about this?", "The council buys from me.", "Huh.", "Yeah."],
    ["How much for the whole box?", "You can't afford the whole box.", "Try me.", "Forty spades and you forget my name."],
    ["These came off a body.", "Everything comes off a body now.", "Fair."],
    ["You're out late.", "Can't sleep. You?", "Can't sleep, and I've got a shipment.", "Same as usual, then."],
    ["Careful with that one, it's been cut with something.", "Cut with what?", "Nobody's died yet.", "Yet?"],
    ["I heard you can get a way out of the city.", "From who?", "That's what I'm paying you to tell me.", "Not here."],
    ["Same price as last night?", "Last night nobody was looking for it.", "And tonight?", "Tonight it's double."],
    ["Put that away, there's a guard.", "He's a customer.", "Oh.", "Everybody's a customer, {name}."],
  ],
  general: [
    ["You sleep at all?", "Couple hours.", "Yeah, same."],
    ["How's the leg?", "Better. Still can't do stairs.", "You should get off it.", "Yeah, I know."],
    ["Whose turn is it on the latrines?", "I think it's yours.", "I did it last week.", "Then I don't know, ask Dee."],
    ["{name}, you got a minute?", "Not really. What's up?", "It can wait."],
    ["I keep thinking I left my stove on.", "In your apartment?", "Up on 86th. I know. It's stupid."],
    ["Do you think anybody's coming?", "I stopped thinking about it.", "Yeah.", "Hand me that wrench."],
    ["I dreamed about a sandwich last night.", "What kind?", "Pastrami. It was really good.", "I hate you."],
    ["They're saying the water's okay now.", "Who's saying that?", "Everyone, I don't know.", "I'm still boiling mine."],
    ["You still got that radio?", "Battery's dead.", "Did you ever get anything on it?", "Static, mostly. Some guy reading numbers."],
    ["Your kid's getting tall.", "I know. Nothing fits her.", "I might have a jacket somewhere.", "That'd be great, thanks."],
    ["What day is it?", "Tuesday, I think.", "You think?", "It's Tuesday. Let's say it's Tuesday."],
    ["You miss the bus?", "Every day.", "You hated the bus.", "I know I did."],
    ["I saw a guy from my old office out there.", "Alive?", "No. Still had his lanyard on.", "Jesus."],
    ["Heard the wall took a hit last night.", "North side?", "I think so. They fixed it by morning."],
    ["You should get that looked at.", "It's a scratch.", "So it won't take long.", "Okay, okay."],
    ["Is that coffee?", "Sort of. It's hot.", "Can I have some?", "Bring your own cup."],
    ["They need people on the east side.", "To do what?", "They didn't say.", "So, carrying stuff."],
    ["Somebody took my boots.", "Left one's by the fire.", "And the other one?", "No idea, sorry."],
    ["My sister would've loved this place.", "The mud?", "The arguing. She loved arguing."],
    ["You look terrible.", "Thanks.", "No, seriously, are you okay?", "I'm fine. Just tired."],
    ["Did you ever call her back?", "Who?", "Before. Your mom.", "No. I was going to on Sunday."],
    ["What did you do, anyway? Before.", "Insurance.", "Oh.", "Yeah. Funny, right?"],
    ["I can't remember the last time I was warm.", "August.", "Very funny."],
    ["{name}! Hey! Did you find it?", "Find what?", "The thing, the, for the pump.", "Oh. No, not yet."],
    ["Have you seen Marcus?", "Not since this morning.", "He owes me a can of peaches.", "Good luck with that."],
    ["You hungry?", "Always.", "There's some rice left, I think.", "Seriously? Don't tell anyone else."],
    ["I think I'm getting a cold.", "Stay away from me.", "It's just a cold.", "That's what they all said."],
    ["So are you two still fighting?", "We're not fighting.", "She moved her bed.", "Okay, we're fighting."],
    ["It's so quiet without the traffic.", "I still can't sleep without it.", "Me neither. Isn't that weird?"],
    ["Did they say when the next run is?", "Thursday, maybe.", "You going?", "If they make me."],
    ["Want to split this?", "What is it?", "No label.", "Sure, why not."],
    ["I found a book.", "Any good?", "Half of it's missing.", "Which half?", "I'll let you know."],
    ["Remember when we complained about the rent?", "I'd pay it now.", "I'd pay double."],
    ["You've got something on your face.", "Where?", "No, other side. There you go."],
    ["Is he always like that?", "Like what?", "You know.", "Oh. Yeah. You get used to it."],
    ["Can I ask you something?", "Sure.", "Never mind. It's dumb.", "Now you have to tell me."],
    ["I traded my watch for a jar of honey.", "Was it a good watch?", "It was my dad's.", "Was it good honey?", "Yeah. It was."],
    ["They moved the kitchen again.", "Why?", "Nobody knows. Just follow the line."],
    ["You still doing that thing with your knee?", "What thing?", "That. You just did it.", "Huh. I guess so."],
    ["Thanks for the other day.", "Don't mention it.", "No, really.", "Really. Don't mention it. He'll want one too."],
    ["I think that's the same pigeon.", "What?", "It comes every morning.", "You named it, didn't you?", "...Gerald."],
    ["You got any smokes?", "Quit.", "Since when?", "Since I ran out."],
  ],
  market: [
    ["How much for the batteries?", "Twelve.", "Twelve? For those?", "They work. You want them or not?"],
    ["This has been opened.", "Everything's been opened.", "I'll give you four.", "Six."],
    ["Is this real antibiotic?", "Says so on the box.", "That's not what I asked."],
    ["You got any boots in a ten?", "Got a nine and an eleven.", "Same pair?", "Nope."],
    ["Didn't you have coffee yesterday?", "Yesterday, yeah.", "Any more coming?", "Ask me Friday."],
    ["What do you want for the knife?", "What've you got?", "Four cigarettes.", "Eight, and I'll throw in the sheath."],
    ["These beans are dented.", "So don't buy them.", "I'm just saying. How much?"],
    ["You take spades from the coast?", "Spades are spades.", "You said no last week.", "Last week I had more beans."],
    ["Anything new?", "Some guy brought in a box of rounds.", "Where is he?", "Gone. It went fast."],
    ["That's way too much.", "That's what it costs.", "It was half that last week.", "So go back to last week."],
    ["Can you hold that for me till tonight?", "You got a deposit?", "I've got my word.", "So, no."],
    ["Do these come in anything but green?", "Are you serious?", "No. I'll take them."],
    ["Who made this?", "Guy on the east side.", "It's pretty good.", "He's got more, if you can find him."],
    ["You open tomorrow?", "If I'm alive.", "So, yes?", "Yes."],
    ["I'll give you three for it.", "Five.", "Four and I don't tell her where you got it.", "...Four."],
    ["Is that all you've got left?", "Came in light this week.", "Why?", "Ask the guys who didn't come back."],
    ["Hey, {name}, how's business?", "Slow.", "It's always slow.", "It's always slow."],
    ["Does this work?", "It did this morning.", "That's not really an answer.", "It's the one I've got."],
    ["Have you got thread?", "White or black?", "Either.", "Neither, actually. I've got fishing line."],
    ["Sorry, are you in line?", "I think so. I don't know what for.", "Me neither."],
  ],
  fire: [
    ["Move over, you're hogging the heat.", "I got here first.", "I've been on the wall all night.", "Okay, okay."],
    ["Remember restaurants?", "Don't.", "Somebody just brought you food.", "I said don't."],
    ["Tell the one about the bus.", "You've all heard it.", "Tell it anyway."],
    ["Getting cold.", "Yeah.", "Is there more wood?", "Not till tomorrow."],
    ["Who were you, before?", "Dental hygienist.", "Really?", "Yeah. Your teeth are a disaster, by the way."],
    ["Listen. You hear that?", "What?", "Nothing. It's quiet for once.", "Don't say that."],
    ["I think I'm used to the smell.", "That's worse, you know."],
    ["Pass the bottle.", "It's empty.", "Pass it anyway."],
    ["You could never see stars from here before.", "Not once.", "It's kind of nice.", "It's really not."],
    ["Sing that one again.", "I only know one verse.", "That's fine, so do we."],
    ["How many have you got now?", "I stopped counting.", "No you didn't.", "Two hundred and six."],
    ["Think it'll rain?", "Hope so, the tanks are low."],
    ["My kid asked me what a dog was.", "What'd you say?", "I said I'd show her one someday."],
    ["Do you ever think about your old place?", "I think about my couch.", "Just the couch?", "It was a really good couch."],
    ["You warm enough?", "Yeah. You?", "Yeah. Here, take this anyway."],
    ["What's the first thing you'd eat?", "If what?", "If it all went back.", "Fries. Hot ones. Too much salt."],
    ["I used to do this on purpose, you know. Camping.", "Why?", "I honestly can't remember."],
    ["So then what happened?", "Then nothing. She left.", "That's it?", "That's it. It's not a good story."],
    ["You're quiet tonight, {name}.", "Just tired.", "You sure?", "Yeah. I'm sure."],
    ["Did you try the stew?", "What's in it?", "I didn't ask.", "Smart."],
    ["Who taught you to whistle like that?", "My grandfather.", "It's terrible.", "So was he."],
    ["One more and I'm going to bed.", "You said that an hour ago.", "I meant it then too."],
  ],
  work: [
    ["Hold that end.", "This end?", "The other one. There, don't move."],
    ["Is this level?", "Close enough.", "That's what you said about the last one.", "And it's still up."],
    ["We're out of nails.", "We've got those bent ones.", "Yeah, okay, straighten some out."],
    ["Want a hand with that?", "Please.", "On three?", "One, two, go."],
    ["How long is this going to take?", "How long've you got?", "Till dark.", "Then till dark."],
    ["Who built this?", "Don't look at me.", "It's upside down.", "Huh. So it is."],
    ["Break?", "We just had a break.", "Another break, then."],
    ["Careful, that's sharp.", "I know it's sharp.", "You're bleeding.", "I know I'm bleeding."],
    ["You've done this before?", "No, but I've watched a lot of videos.", "Great. That's great."],
    ["This'll never hold.", "It only has to hold till spring.", "Then what?", "Then we fix it again."],
    ["{name}, pass me that thing.", "Which thing?", "The, you know. The thing.", "This?", "Thanks."],
    ["Is that blight?", "Could be. Look at the leaves.", "That's not good.", "No."],
    ["We're getting more this year, I think.", "From that row?", "From that row, anyway."],
    ["I've got blisters on my blisters.", "Wrap them up.", "With what?", "Good question."],
  ],
  guard: [
    ["Anything?", "Nope.", "Good."],
    ["How long till you're off?", "Two hours.", "Want me to cover you for ten?", "You're a saint."],
    ["See that one by the car?", "The one with the coat?", "It's been standing there since yesterday.", "Yeah, I've been watching it."],
    ["Got any gum?", "Where would I get gum?", "I'm just asking."],
    ["You hear about the new rota?", "What about it?", "We're on nights.", "Great. Of course we are."],
    ["Is your scope off, or is it me?", "It's you.", "Thanks."],
    ["Don't fall asleep up here.", "I'm not asleep.", "Your eyes were closed.", "I was resting them."],
    ["How many rounds did they give you?", "Forty.", "They gave me thirty.", "You missed more."],
    ["Who's on after us?", "Eddie, I think.", "He'd better be on time.", "He won't be."],
    ["Think they know we're up here?", "I don't think they know much of anything."],
    ["It's weird how you stop seeing them after a while.", "I still see them.", "Yeah. I guess I do too."],
    ["Your turn to go for water.", "I went last time.", "No, I went last time.", "Fine. Flip for it."],
    ["Did you hit that?", "Maybe.", "It's still walking.", "Then maybe not."],
    ["{name}, you're on my side of the wall again.", "It's a wall.", "It's my side of it."],
    ["My kid wants to come up here.", "What'd you tell her?", "Not till she's forty."],
  ],
  rain: [
    ["Here it comes.", "Are the tanks out?", "I think so.", "Go check."],
    ["I'm soaked through.", "Everyone's soaked through.", "Doesn't help."],
    ["My tent's leaking again.", "Where?", "Everywhere, mostly."],
    ["At least it keeps the smell down.", "Does it?", "A little."],
    ["This is going to turn everything to mud.", "It's already mud.", "More mud, then."],
    ["Think they mind the rain?", "I don't think they mind anything."],
    ["You'll catch your death out here.", "Very funny.", "I wasn't joking. Get under something."],
  ],
  night: [
    ["Can't sleep?", "No. You?", "Nope."],
    ["Who's snoring like that?", "Otis.", "Can we move him?", "We tried."],
    ["Keep it down, people are sleeping.", "Sorry.", "It's fine. Just, you know."],
    ["You hear that one, way off?", "Yeah. It's been at it for an hour.", "I wish it would stop."],
    ["You should go lie down.", "In a minute.", "That's what you said an hour ago."],
    ["It's so dark now.", "I know. I never knew it got this dark here.", "It used to be so bright you couldn't sleep."],
    ["What time do you think it is?", "Late.", "Helpful."],
  ],
  alarm: [
    ["They're coming through!", "How many?", "I don't know, a lot!"],
    ["Where do you want me?", "Anywhere you can see them!", "I can see them everywhere!"],
    ["I'm almost out!", "Here, take mine! Go!"],
    ["Get the kids to the middle!", "They're already there!", "Then get back on your gun!"],
    ["Hold it here!", "Hold what? There's nothing here!", "Just hold it!"],
    ["Behind you!", "Got it!", "There's more!"],
    ["Reloading!", "Hurry up!"],
    ["Who left that open?", "Does it matter?", "Just shoot!"],
    ["Fall back to the tents!", "They're at the tents!", "Then keep going!"],
    ["Have you seen my brother?", "Not now! Get down!"],
    ["Go for the heads!", "I'm going for whatever's closest!"],
    ["Somebody block that hole!", "With what?", "Anything! Move!"],
    ["They just keep coming!", "So keep shooting!"],
    ["I'm hit!", "Bitten?", "I don't know!", "Keep firing till you do!"],
    ["Left side! Left side!", "I see them!"],
    ["Where are the guards?", "I think we're it!"],
    ["Get off the street!", "And go where?", "Up! Anywhere up!"],
    ["Stay with me, {name}!", "I'm right here!", "Don't stop moving!"],
    ["That's the last of the crate!", "There's got to be more!", "That's the last of it!"],
    ["Oh God. Oh God.", "Hey! Look at me! Keep shooting!"],
  ],
  patrol: [
    ["Keep your eyes open on this block.", "They're open.", "Then keep your voice down."],
    ["How far are we going?", "Corner and back.", "You said that two corners ago."],
    ["See anything?", "Pigeons.", "Good. Means nothing's close."],
    ["Slow down. Listen first.", "I don't hear anything.", "That's what I want to hear."],
    ["My feet are killing me.", "We're nearly back.", "You always say that."],
    ["Think there's anything left in there?", "Not worth finding out.", "Yeah, you're right."],
    ["I used to live two blocks from here.", "You want to go look?", "No. No, I don't."],
    ["Stop kicking stuff.", "I didn't kick anything.", "Well, somebody did."],
    ["We should head back soon.", "Yeah. It's getting dark.", "One more block, then."],
  ],
  raider: [
    ["This block's picked clean.", "I told you it would be.", "You didn't tell me anything."],
    ["Where'd Mace go?", "Mace isn't coming back.", "He owes me.", "Well, go ask him."],
    ["We could just ask to join a settlement.", "After last month?", "Right. Forget it."],
    ["Quiet. Someone's out there.", "Carrying anything?", "Let's go find out."],
    ["I'm so sick of canned peaches.", "So stop stealing canned peaches."],
    ["How much have we got?", "Enough for a week.", "A real week?", "If you stop eating so much."],
    ["You ever feel bad about it?", "About what?", "...Never mind."],
    ["Whose idea was this?", "Yours.", "Well, it's a bad idea."],
    ["Think they saw us?", "If they did we'd know.", "Would we?"],
  ],
};

// What each place talks about when it isn't talking about food.
export const CAMP_TALK = {
  bryant: [
    ["Did Reyes raise the stall rent again?", "Ten percent.", "For what?", "For being here, I guess."],
    ["My kid's on top of the taxis again.", "Which one?", "Mine. The yellow one.", "They're all yellow."],
    ["They had a real library card in the free bin.", "What for?", "That's what I said. I took it anyway."],
    ["You still got a stall by the fountain?", "Moved. Too many people just looking."],
  ],
  battery: [
    ["See anything out there?", "Three flashes again.", "That's a boat?", "I'm saying it's a boat."],
    ["When do you think the ferry could run?", "With what fuel?", "I'm just asking.", "I know you are."],
    ["Nets came up empty again.", "Try the other pier.", "That's the other pier."],
    ["You can see clear across the bay today.", "Think anybody's looking back?", "I wave, sometimes."],
  ],
  wash: [
    ["Are you going to the meeting?", "Is it the same meeting?", "It's still about the latrines.", "Then no."],
    ["I wrote a motion about the bolts.", "Of course you did.", "It's a good motion.", "I'm sure it is."],
    ["Who's chairing tonight?", "Whoever's still awake."],
    ["I used to teach right over there.", "What?", "Sociology.", "How's that going?"],
  ],
  union: [
    ["Did you clean it?", "Twice.", "He's going to check.", "I know he's going to check."],
    ["Ruiz nearly took my ear off yesterday.", "Again?", "I'm starting to think it's personal."],
    ["Heard anything from command?", "There's no command.", "I know. I still ask."],
    ["Mrs. Petrakis wants to run the range now.", "Honestly, let her."],
  ],
  sheep: [
    ["Have you seen the tomatoes?", "They're coming along.", "I'd kill for one right now.", "They've got a judge for that."],
    ["You going to the hearing?", "Whose is it?", "The guy with the goat.", "Oh, I'm going."],
    ["Who left the greenhouse open again?", "It wasn't me.", "Well, it wasn't the goat."],
    ["I got weeding at six.", "You got out of watch?", "No. That's at four."],
  ],
  tompkins: [
    ["Who's in charge of soup?", "Nobody's in charge of anything.", "So is there soup?", "Yeah, Jo made some."],
    ["They painted over my bit of the wall.", "It's everybody's wall.", "I know, but that was my bit."],
    ["Is the free box any good today?", "One shoe and a toaster."],
    ["You still in that band?", "We've got a bucket and a guy who yells.", "So, yes."],
  ],
  morning: [
    ["How's tent four?", "Full.", "How's tent five?", "Don't ask."],
    ["When did you last sleep?", "What day is it?", "Go lie down. I've got this."],
    ["We're down to the last of the gauze.", "Boil the old stuff.", "Already am."],
    ["He asked about his wife again.", "What'd you say?", "Same as yesterday."],
  ],
  garvey: [
    ["You coming to choir?", "I can't sing.", "Neither can Tiny. Come anyway."],
    ["Who's got next?", "Me and him.", "You two? Y'all can't shoot.", "Watch me."],
    ["Coach wants you.", "What'd I do?", "I don't know, but she used the whistle."],
    ["Did you save me a plate?", "I saved you half a plate.", "Who got the other half?", "Don't worry about it."],
  ],
  tryon: [
    ["Finch wants another count of the bolts.", "We counted yesterday.", "He wants another count."],
    ["I did taxes for a living, you know.", "You've mentioned.", "Now I make arrows.", "You've mentioned that too."],
    ["Reggie says the east side's quiet.", "Reggie says that every day.", "It's usually true."],
    ["Who keeps going through the cloister garden?", "Kids, probably.", "The kids don't eat rosemary."],
  ],
};

// Leaders keep it short. A first hello is who they are and what the place is; past that they talk about the place, what they need from
// you, and whether they can spare you anything. The rest of what they used to say is cut.
const SHORT_FIRST = {
  bryant: 'So you made it in. This is Lakeshore Market, and I am Odalys Reyes: I keep it running. Trade fair and keep the peace.',
  battery: 'Welcome aboard, such as it is. Captain Wen Liu. We hold the pier at Severn Landing and we watch the water.',
  wash: 'A new arrival? Good. Adaeze Okafor. I chair the Commune, which mostly means I count the votes.',
  union: 'Stop there. This is Fort Westpoint, and it runs like a post. I am Staff Sergeant Whitaker. Follow the rules and you can stay.',
  sheep: 'Arnhem has laws, and I am the one who keeps them. Miriam Halloran. Keep to them and you will eat well.',
  tompkins: 'Nobody is in charge of the Collective. Which means you talk to me. They call me Mother Rat.',
  morning: 'You are not hurt? Good, then you can wait. Imani Brandt. The Redoubt is a clinic first and a settlement second.',
  garvey: 'Look who walked in. Everybody here pulls their weight, and so will you. I am Yvonne Holloway; I run Carver Yard.',
  tryon: 'Welcome to Abbey Keep. We kept these old stones standing, and we will keep you too. Tobias Finch, at your service.',
};
for (const key in LORE) {
  const lead = LORE[key].cast.find((m) => m.role === 'leader');
  if (!lead) continue;
  if (SHORT_FIRST[key]) lead.greet.first = SHORT_FIRST[key];
  let flavour = 0;
  lead.topics = lead.topics.filter((t) => {
    if (t.id === 'food') return false;
    if (t.job || t.pay || t.give || t.req) return true;
    if (t.sub) return false;
    return flavour++ < 1;
  });
  // Nothing points on to a question that is no longer there.
  const ids = new Set(lead.topics.map((t) => t.id));
  for (const t of lead.topics) if (t.then) { t.then = t.then.filter((id) => ids.has(id)); if (!t.then.length) delete t.then; }
}
