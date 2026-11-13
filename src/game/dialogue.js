// Conversation logic. Works out what someone says to you and what you can say back, based on who
// they are, what they remember, and where you stand with their camp.
import { LORE, BEFORE, WEAPON_TALK, STATUS_TALK, ACTIVITY_TALK, KID_BEFORE } from './camplore.js';
import { ITEMS } from './items.js';

export const STANDING = [[60, 'Family'], [25, 'Trusted'], [10, 'Known'], [-5, 'Stranger'], [-30, 'Distrusted'], [-999, 'Marked']];
export const standingName = (v) => STANDING.find(([min]) => v >= min)[1];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Dialogue {
  constructor(game) {
    this.g = game;
  }

  standing(campId) {
    const P = this.g.player;
    return (P.campRep[campId] || 0) + Math.min(0, P.rep);
  }

  addStanding(campId, n) {
    if (campId < 0 || !n) return;
    const P = this.g.player;
    const before = P.campRep[campId] || 0;
    P.campRep[campId] = before + n;
    const a = standingName(before), b = standingName(before + n);
    if (a !== b && n > 0) this.g.ui.banner(`${this.g.layout.camps[campId].name}: ${b}`, b === 'Known' ? 'They know your name now, and they have started to ask you for favours.' : b === 'Trusted' ? 'Better prices, and their leader will share supplies with you each day.' : 'You belong here now.');
  }

  loreOf(npc) { return npc.campKey ? LORE[npc.campKey] : null; }

  // Opening line.
  greeting(npc) {
    const P = this.g.player, flags = P.dlg.met;
    const key = npc.loreId || npc.personaId;
    // Once you are Trusted somewhere, everybody there knows who you are, whether or not you have spoken before.
    const first = !flags[key] && !(npc.camp >= 0 && this.standing(npc.camp) >= 25);
    flags[key] = (flags[key] || 0) + 1;
    if (npc.kind === 'roamer' && P.wanted[-1] > 0) return 'You have got some nerve, after that.';
    if (npc.kind === 'roamer' && npc.factionId && this.g.npcs.owesBail(npc.factionId - 1)) {
      const id = npc.factionId - 1, wait = this.g.npcs.bailWait(id);
      if (wait > 0) return `After what you did? Nobody at ${npc.campName} is taking your money today. Come back when it has cooled off, and it will cost you ${this.g.npcs.bailFor(id)}.`;
      return `You are on the list at ${npc.campName}. ${this.g.npcs.bailFor(id)} spades squares it, then you can walk back in. Nobody out here is going to shoot you over it, so long as you don't start anything.`;
    }
    if (npc.camp >= 0 && npc.kind !== 'follower' && this.g.npcs.hostileCamp(npc.camp)) return 'Keep walking. Everyone knows what you did.';
    if (npc.camp >= 0) {
      // Nobody has time for small talk while the wall is failing.
      const S = this.g.campSim.state[npc.camp];
      if (npc.threat || S.inside >= 25) return pick(['They are inside the wall! If you can shoot, shoot!', 'Not now! Not now, they are inside!', 'Grab a gun or get out of the way!']);
      if (S.breaches.length && npc.kind !== 'resident') return pick(['We have got a hole in the wall. Make it quick.', 'You see that breach? Talk fast.']);
      if (S.drawing && S.pool > 0) return pick(['We are under attack. Get on the wall, or get out of the way.', 'Hear that? That is the whole neighbourhood coming. Make it quick.']);
    }
    const standing = npc.camp >= 0 ? this.standing(npc.camp) : 0;
    if (standing < -5) return 'You have got some nerve showing your face here.';
    if (npc.kid) return first ? pick(['Are you from outside? Is it true about the bridges?', `I am ${npc.name}. Is that a real gun? Can I hold it?`, 'My mom says I am not supposed to talk to people from outside. Hi.', 'Are you a soldier?', 'You have mud all over you.', 'Have you got any candy? Anything?', 'I can climb the wall, you know. I am not allowed to.']) : pick(['Hi again!', 'You came back!', 'Did you kill any today?']);
    if (npc.kind === 'wanderer') {
      const from = npc.fromCamp >= 0 ? this.g.layout.camps[npc.fromCamp] : null, dest = npc.dest >= 0 ? this.g.layout.camps[npc.dest] : null;
      if (from) return first ? `${from.name} is finished. We got out with what we could carry.${dest ? ` We are making for ${dest.name}.` : ''} You should not stay out here either.` : 'Keep moving. It is the only thing that has worked so far.';
      if (npc.role) return first ? `I do not have a wall, but I do have goods. Want to see?` : 'Back again. Same deal.';
      return first ? pick(['Easy. I am not with anybody, and I am not looking for trouble.', 'Nobody\'s wall, nobody\'s rules. Keep your gun down and we will get along fine.', `${npc.name}. Just passing through. Everyone is, now.`]) : pick(['Still out here, then.', 'You again. Good sign, I suppose.', 'Any trouble that way?']);
    }
    const G = npc.part && npc.part.greet;
    if (npc.doctor && !G) return P.health < 60 || P.infection > 15 ? pick(['You are bleeding on my floor. Sit down.', 'Let me see that. No, sit down first.', 'Who did the bandage? It needs doing again.']) : first ? pick([`${npc.name}. I keep people alive here, with whatever I can get. Try not to need me.`, 'You look all right. For now. Let us keep it that way.', 'Sit if you need to. If you do not, do not take up a chair.', 'Wash your hands before you touch anything in here.', 'New? Then listen: a bite gets cleaned the same hour, or it does not get cleaned at all.']) : pick(['What hurts?', 'Back again. What is it this time?', 'Make it quick, I have people waiting.']);
    if (npc.kind === 'clerk') {
      const op = this.g.campSim.state[npc.camp].op;
      if (op) return pick([`Operation ${op.name}. Are you signing, or are you in the way?`, `This is Operation ${op.name}, ${this.g.campSim.opDayOf(op).text.toLowerCase()}. ${this.g.campSim.opDayOf(op).over ? 'It was meant to be over by now.' : 'Contracts are open.'}`]);
      const posted = this.g.campSim.state[npc.camp].opNext;
      if (posted) return `Operation ${posted.name} just went up on the board. It is not too early to sign.`;
      return first ? pick([`${npc.name}, Town Clerk. Commissions and contracts all go through me, and I write everything down.`, 'Looking for work? You found the right desk.', 'New face. I will need a name for the book, sooner or later.', 'The board is up behind me. Commissions, contracts, the lot. It all goes through me.', 'If you are here to complain about the rations, that is not my desk.']) : pick(['Back again. Here is the board.', 'Everything is in the book. What do you need?', 'Yes?']);
    }
    if (npc.kind === 'vendor' && !G) return first ? pick(['Have a look. Everything works, or it did when I got it.', 'What are you after?', `${npc.name}. Prices are fair and I do not do credit.`, 'Do not touch what you are not buying.', 'You look like someone who needs ammunition.', 'First time at my stall? Then you have not been robbed yet. Kidding.']) : pick(['What do you need?', 'Back again. Have a look.', 'You buying or just looking?']);
    if (G) {
      if (first) return G.first;
      if (P.health < 40 && G.hurt) return G.hurt;
      if (G.trusted && standing >= 25 && Math.random() < .5) return G.trusted;
      if (G.night && this.g.isNight && Math.random() < .6) return G.night;
      return pick(G.again);
    }
    if (P.health < 40) return 'You are hurt. There is a medic near the plaza, go on, I am not going anywhere.';
    if (!first && P.kills > 400 && Math.random() < .3) return `I have heard about you. ${P.kills.toLocaleString('en-US')}, they say, and you are still walking around.`;
    if (npc.kind === 'guard' || npc.kind === 'sentry') return first ? pick([`${npc.name}. I have the watch. If you are coming up on the wall, stay out of my lane.`, 'Keep your weapon down inside the wall and we will get along.', 'New face. Do not come up on the walkway without asking.', 'You armed? Good. We might need you before the night is out.', 'Quiet so far. Do not say it.', 'Eyes out, not on me. What do you want?']) : pick(['Still quiet on this side. Mostly.', 'Back again.', 'Watch your step up here.']);
    if (npc.kind === 'roamer') return first ? pick([`${npc.name}. We are out of ${npc.campName || 'nowhere in particular'}. Keep your voice down, and we will be gone in a minute.`, 'Hold up. You are not one of them, at least.', 'Easy with that. We are friendly.', 'Out here on your own? Brave, or the other thing.', `${npc.campName || 'Camp'} patrol. Keep it quiet out here.`, 'Watch the side streets. That is where they come from.']) : 'Still alive, then. Good for you.';
    return first ? pick([`${npc.name}. You are new. Everybody here was new once, some of them not too long ago.`, 'Have not seen you before. Just in?', 'Mind the mud. It gets into everything.', 'You look like you have been walking a long time.', 'Another new face. Good. We need the hands.', 'Do not mind me, I am trying to get this done before dark.', 'Welcome to the wall. It is not much, but it holds.', 'If you are looking for the Town Hall, ask anyone. Everyone ends up there.']) : pick(['Hey. It is you.', 'You again. How is it out there?', 'Hey, you made it back.']);
  }

  meets(req) {
    if (!req) return true;
    const P = this.g.player;
    const f = P.dlg.flags;
    if (req.standing !== undefined && this.standing(this.current.camp) < req.standing) return false;
    if (req.flag && !f[req.flag]) return false;
    if (req.notFlag && f[req.notFlag]) return false;
    if (req.kills && P.kills < req.kills) return false;
    return true;
  }

  // Topics for the current conversation. `then` means we are following a thread.
  topics(npc, thread) {
    this.current = npc;
    const P = this.g.player;
    const part = npc.part;
    if (!part) return this.personaTopics(npc, thread);
    const all = part.topics || [];
    const seen = P.dlg.flags;
    const usable = (t) => {
      if (!this.meets(t.req)) return false;
      if (t.once && seen[`seen_${part.id}_${t.id}`]) return false;
      if (t.daily && P.dlg.day[`${part.id}_${t.id}`] === this.g.day) return false;
      if (t.job && this.g.jobs.active.some((j) => j.favour === t.job)) return false;
      return true;
    };
    if (thread) return thread.map((id) => all.find((t) => t.id === id)).filter((t) => t && usable(t));
    return all.filter((t) => !t.sub && usable(t));
  }

  personaTopics(npc, thread) {
    if (thread) return [];
    const g = this.g, P = g.player;
    const kind = npc.task && npc.arrived ? npc.task.kind : null;
    const list = [];
    if (npc.kind === 'wanderer') {
      const c = npc.dest >= 0 ? g.layout.camps[npc.dest] : null, from = npc.fromCamp >= 0 ? g.layout.camps[npc.fromCamp] : null;
      list.push({ id: 'road', ask: 'Where are you headed?', say: c ? (from ? `${c.name}, if they will have us. I keep telling everyone it will be better there. Somebody has to.` : `${c.name}. I heard they are still taking people. I have heard a lot of things.`) : pick(['Nowhere. That is the point. The dead go where the people are, and I have stopped being where the people are.', 'Wherever is quiet this week. I had a good roof on 96th until a crowd moved in.', 'Walls just give them something to lean on. I have seen what is left of the ones that fell.']) });
      list.push({ id: 'news', ask: 'What is still standing out there?', say: this.news(npc), reveal: true });
    }
    if (kind && ACTIVITY_TALK[kind]) list.push({ id: 'doing', ask: kind === 'sit' ? 'Mind if I join you?' : kind === 'class' || npc.kid ? 'What are you up to?' : 'What are you working on?', say: pick(ACTIVITY_TALK[kind]), rest: kind === 'sit' });
    list.push({ id: 'before', ask: npc.kid ? 'Where did you live before?' : 'What did you do before all this?', say: npc.persona.before });
    if (npc.weaponName) list.push({ id: 'weapon', ask: `Where did you get the ${npc.weaponLabel}?`, say: WEAPON_TALK[npc.weaponName] });
    list.push({ id: 'status', ask: 'How are you holding up?', say: npc.persona.status });
    // A can of beans means something here.
    const food = ['beans', 'water', 'whiskey'].find((id) => P.count(id));
    if (food && !npc.fed) list.push({ id: 'share', ask: `Here, take this. (${ITEMS[food].name})`, say: pick(['Oh. Thank you. You do not know what that means.', 'I will not forget that. People say that a lot. I mean it.', 'You are all right, you know that?']), food, standing: 1 });
    if (npc.kind === 'roamer' && npc.factionId && !g.npcs.admitted(npc.factionId - 1)) list.push({ id: 'papers', ask: `How does anyone get into ${npc.campName}?`, say: `They don't, not without papers. ${g.npcs.citizenFee(npc.factionId - 1).toLocaleString('en-US')} spades, one time, and any of us out here can sign you up. It's good until you die. Don't try the wall, either. They'll shoot you and they'll remember you.` });
    if (npc.kind === 'follower') list.push({ id: 'dismiss', ask: 'Head on home. I will be all right from here.', say: 'If you are sure. Watch yourself out there.', dismiss: true });
    else if (npc.kind === 'wanderer' && npc.armed && !npc.kid && !npc.role && g.npcs.followers.length < 3) list.push({ id: 'recruit', ask: 'Walk with me for a while.', say: pick(['Safer in numbers. All right, for now.', 'Why not. I was not getting anywhere on my own.', 'You look like you know how to stay alive. I will take that.']), recruit: true });
    else if (npc.armed && !npc.kid && npc.kind !== 'vendor' && npc.camp >= 0 && g.npcs.followers.length < 3 && this.standing(npc.camp) >= 10) list.push({ id: 'recruit', ask: 'I could use someone watching my back out there.', say: pick(['You know what? Let me grab my things. I am tired of looking at these walls.', 'All right. But I shoot first and you owe me a drink.', 'I have been waiting for someone to ask.']), recruit: true });
    return list;
  }

  // What someone on the road has heard. It is usually about right.
  news(npc) {
    const g = this.g, sim = g.campSim, near = this.nearestCamps(npc);
    if (!near.length) return 'I have not heard a radio in days. If there is anyone still behind a wall, they are not saying so.';
    const parts = near.slice(0, 3).map((c) => {
      const line = sim.statusLine(c.id);
      return `${c.name} ${line === 'Holding' ? 'is holding' : line === 'Rebuilding' || line === 'Resettling' ? `is ${line.toLowerCase()}` : `is in trouble: ${line.toLowerCase()}`}`;
    });
    const fallen = g.layout.camps.filter((c) => sim.state[c.id].status === 'overrun');
    return `${parts.join('. ')}.${fallen.length ? ` ${fallen[0].name} is gone, ${fallen.length > 1 ? `and ${fallen.length - 1} more besides` : 'I watched the smoke'}.` : ''}`;
  }

  nearestCamps(npc) {
    const g = this.g;
    return g.layout.camps.filter((c) => g.campSim.state[c.id].status === 'holding').sort((a, b) => Math.hypot(a.cx - npc.x, a.cz - npc.z) - Math.hypot(b.cx - npc.x, b.cz - npc.z));
  }

  // They tell you where it is, too, if you did not know.
  reveal(npc) {
    const P = this.g.player, c = this.nearestCamps(npc).find((k) => !P.discovered[k.id]);
    if (!c) return;
    P.discovered[c.id] = true;
    this.g.ui.toast(`${c.name} marked on your map`, 'good');
  }

  // Apply a chosen topic. Returns the text to show and what comes next.
  choose(npc, t) {
    const g = this.g, P = g.player, part = npc.part;
    if (part) {
      P.dlg.flags[`seen_${part.id}_${t.id}`] = 1;
      if (t.daily) P.dlg.day[`${part.id}_${t.id}`] = g.day;
    }
    // Asked to come along, half of them would rather not. They make up their mind once a day; asking again does not change it.
    if (t.recruit) {
      if (npc.refusedDay === g.day) return { text: pick(['I already told you. No.', 'Still no. Ask me another day.', 'Same answer as before.']), then: null };
      if (Math.random() < .5) {
        npc.refusedDay = g.day;
        return { text: pick(['No. I have got people here who need me.', 'Not a chance. I have seen what is out there.', 'Thanks, but no. I am staying put.', 'Maybe another time. Not today.', 'I do not know you well enough for that.']), then: null };
      }
    }
    if (t.food) { P.remove(t.food, 1); npc.fed = true; }
    if (t.reveal) this.reveal(npc);
    if (t.recruit) g.npcs.recruit(npc);
    if (t.dismiss) g.npcs.dismiss(npc);
    if (t.rest) { P.health = Math.min(100, P.health + 6); if (!npc.fed2) { npc.fed2 = true; this.addStanding(npc.camp, 1); } }
    if (t.set) P.dlg.flags[t.set] = 1;
    if (t.standing && !(part && P.dlg.flags[`rep_${part.id}_${t.id}`])) {
      if (part) P.dlg.flags[`rep_${part.id}_${t.id}`] = 1;
      this.addStanding(npc.camp, t.standing);
    }
    const lines = [];
    if (t.give) {
      for (const id in t.give) { P.gain(id, t.give[id]); lines.push(`${t.give[id]} ${ITEMS[id].name}`); }
    }
    if (t.scrip) { P.scrip += t.scrip; lines.push(`${t.scrip} spades`); }
    if (t.job) g.jobs.startFavour(npc, t.job);
    if (t.pay) {
      const reward = g.jobs.payFavour(t.pay);
      if (reward) lines.push(...reward);
    }
    if (lines.length) { g.ui.toast(`Received ${lines.join(', ')}`, 'good'); g.audio.simple('pickup'); }
    return { text: t.say, then: t.then || null };
  }
}

export function makePersona(seed, kid) {
  return {
    before: kid ? KID_BEFORE[seed % KID_BEFORE.length] : BEFORE[seed % BEFORE.length],
    status: STATUS_TALK[(seed >> 5) % STATUS_TALK.length],
  };
}

export { LORE };
