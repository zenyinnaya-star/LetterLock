// English source strings. **x** renders bold; {name} is a variable.
const en = {
  // header / common
  'hd.rules': 'Rules', 'hd.music_on': 'Music on', 'hd.music_off': 'Music off', 'hd.mute': 'Mute', 'hd.unmute': 'Unmute',
  'hd.settings': 'Settings', 'hd.home': 'Letterlock home',

  // home
  'home.tag1': 'Answer the prompt. Dodge your banned letters.',
  'home.tag2': 'Every round you survive, another letter gets locked.',
  'home.name': 'Your name', 'home.name_ph': 'e.g. Zab', 'home.avatar': 'Your avatar', 'home.class': 'Pick your class',
  'home.create': 'Create a room', 'home.duel': '1v1 Duel', 'home.or_join': 'OR JOIN', 'home.code_ph': 'CODE', 'home.code': 'Room code',
  'home.join': 'Join', 'home.footer': '2–12 players · each on their own device ·', 'home.rules': 'Read the rules',
  'home.err_class': 'Pick a class first.', 'home.err_name': 'Enter your name.', 'home.err_code': 'Room codes are 4 characters.',

  // room page
  'room.not_found': 'Room not found', 'room.conn': 'Connection problem', 'room.back': 'Back home', 'room.seat': 'Taking your seat…',
  'room.err': 'Enter a name and pick a class.', 'room.joining': 'Joining room', 'room.join': 'Join game', 'room.loading': 'Loading room {code}…',

  // avatar picker
  'av.uploading': 'Uploading…', 'av.change': 'Change photo', 'av.upload': 'Upload photo', 'av.default': 'Use default',
  'av.hint_photo': 'Your photo shows instead of your class.', 'av.hint_default': 'Default avatar — your class stays secret.',
  'av.failed': 'Upload failed',

  // class picker / sheet
  'cp.more': 'Tips & tricks →', 'cs.power': 'Power', 'cs.price': 'Price', 'cs.how': 'How it plays', 'cs.tips': 'Tips & tricks',
  'cs.counter': 'How to beat it', 'cs.easy': 'Easy', 'cs.medium': 'Medium', 'cs.hard': 'Hard', 'cs.difficulty': 'Difficulty',
  'cs.choose': 'Choose {name}', 'cs.selected': '{name} selected', 'cs.prev': 'Previous class', 'cs.next': 'Next class', 'cs.close': 'Close',

  // lobby
  'lb.code': 'Room code', 'lb.copied': 'Link copied', 'lb.share': 'Share invite link', 'lb.share_title': 'Join my Letterlock game',
  'lb.share_text': 'Room {code}', 'lb.secret': 'secret', 'lb.waiting_seat': 'Waiting for a player…', 'lb.avatar': 'Your avatar',
  'lb.class': 'Your class — secret until the game ends', 'lb.duel_tag': '1v1 duel', 'lb.answers': '{n}s answers',
  'lb.shrinking': ', shrinking', 'lb.guesses': '{n}s guesses', 'lb.strike1': '1 strike and out', 'lb.strikes': '{n} strikes and out',
  'lb.cards_on': 'Cards on', 'lb.cards_off': 'Cards off', 'lb.perks_on': 'Perks on', 'lb.perks_off': 'Perks off',
  'lb.words_in': 'Words in {lang}',
  'lb.wait_challenger': 'Waiting for a challenger…', 'lb.wait_more': 'Waiting for at least 1 more player…', 'lb.fight': 'FIGHT!',
  'lb.start': 'Start game · {n} players', 'lb.host_hint': 'You’re the host. Tweak the rules with the gear, then start when everyone’s in.',
  'lb.wait_host': 'Waiting for the host to start… ({n}/{max})', 'lb.leave': 'Leave room', 'lb.share_code': 'Share the code',
  'lb.your_secret': 'Your class is secret', 'lb.secret_class': 'Secret class', 'lb.host': 'Host',

  // settings
  'st.title': 'Settings', 'st.rules': 'Room rules', 'st.host_note': 'You’re the host — changes apply to everyone.',
  'st.only_host': 'Only the host can change these.', 'st.locked': 'Locked while a game is running.',
  'st.mode': 'Game mode', 'st.classic': 'Classic', 'st.duel': '1v1 Duel', 'st.duel_needs2': '1v1 needs exactly 2 players',
  'st.max': 'Max players', 'st.fewer': 'Fewer players', 'st.more': 'More players',
  'st.answer': 'Answer time', 'st.guess': 'Guess time', 'st.cards_phase': 'Cards phase', 'st.duel_rounds': 'Duel rounds',
  'st.strikes': 'Strikes to go out', 'st.shrink': 'Answer time shrinks each round', 'st.cards': 'Cards (Attack / Shield / Cleanse)',
  'st.perks': 'Class perks', 'st.device': 'This device', 'st.music': 'Music', 'st.sfx': 'Sound effects', 'st.voice': 'Announcer voice',
  'st.howto': 'How to play (video)', 'st.lang': 'Language', 'st.ui_lang': 'Menus & announcer',
  'st.word_lang': 'Word language', 'st.word_lang_hint': 'Everyone answers in this language. Letters stay A–Z: accents are optional, Japanese is typed in romaji and Chinese in pinyin.',

  // game shell
  'gm.home': 'Home', 'gm.quit': 'Quit', 'gm.leave': 'Leave',
  'gm.out': 'You’re out — spectating. Everyone’s letters are visible to you now.',
  'gm.spectator': 'Game in progress — you’re watching as a spectator.',
  'gm.quit_title': 'Rage quit?', 'gm.quit_body': 'You’re out for the rest of this game, and the whole room hears that you chickened out.',
  'gm.keep': 'Keep playing', 'gm.quit_anyway': 'Quit anyway',

  // phases
  'ph.round': 'Round {n}', 'ph.1v1': '1v1', 'ph.final_duel': 'Final duel', 'ph.answer': 'Answer', 'ph.reveal': 'Reveal',
  'ph.guess': 'Guess', 'ph.cards': 'Cards', 'ph.prompt': 'The prompt', 'ph.hint': 'Round {n}: {text}', 'ph.leak': 'Intel leak: somebody is locked out of “{l}”.',
  'ph.oracle_locked': 'The Oracle **{name}** locked in **{word}**',
  'ph.hacked': 'You’ve been hacked — your locks are hidden this round. Play carefully.',
  'ph.hacked_trace': 'You’ve been hacked — your locks are hidden this round. Play carefully, and trace the hacker from your rack.',
  'ph.type': 'type a word', 'ph.your_answer': 'Your answer',
  'ph.banned': 'That uses one of your locked letters — it’ll cost you a strike.',
  'ph.change': 'Change answer', 'ph.lock': 'Lock it in', 'ph.allin_on': 'ALL IN — double or bust',
  'ph.allin': 'Go all in (×2 points, −10 if you bust)', 'ph.allin_ok': 'All in! Double or bust',
  'ph.locked_in': 'Locked in **{word}** for +{n}. You can change it until time runs out.',
  'ph.rejected': '**{word}** — {reason}. Try another.', 'ph.that': 'That', 'ph.used': 'Already used: {list}',
  'ph.spec_answer': 'Spectating — watching everyone answer.', 'ph.spec_guess': 'Spectating — players are guessing.',
  'ph.input_ja': 'Type in romaji (neko) or Japanese (猫)', 'ph.input_zh': 'Type in pinyin (mao) or Chinese (猫)',
  'ph.input_accents': 'Accents are optional',
  'ph.strike': 'strike', 'ph.eliminated': 'eliminated',
  'ph.crack': 'Crack someone’s lock', 'ph.crack_sub': 'One guess. Hit a banned letter and you draw a card.',
  'ph.cracked': 'Cracked! **{name}** is locked out of “{l}”. You drew a card if you had room.',
  'ph.miss': 'Miss — {name} can use “{l}”.', 'ph.guess_btn': 'Guess “{l}” on {name}', 'ph.pick': 'Pick a player and a letter',
  'ph.play_cards': 'Play your cards', 'ph.quiet': 'Quiet round — nobody cracked anything.',
  'ph.feed_cracked': '**{a}** cracked **{b}**’s “{l}”', 'ph.feed_missed': '**{a}** missed on {b}',
  'ph.ninja_pen': 'Ninja penalty: **{name}** takes +{n} letters',
  'ph.hacks': '**{a}** hacks **{b}** (+{n}, locks hidden next round)', 'ph.attacks': '**{a}** attacks **{b}** (+{n})',
  'ph.someone': 'Someone', 'ph.the_cls': 'The {cls}', 'ph.absorbed_by': ' — absorbed by {name}', 'ph.blocked': ' — blocked',
  'ph.take_hit': 'Take the hit (+5)', 'ph.absorbed_ok': 'Absorbed! +5 points',
  'ph.under_attack': 'You’re under attack — play your Shield from the rack below.',
  'ph.waiting': 'Waiting for the others…', 'ph.skip': 'I’m done — skip ahead',
  'ph.cards_note': 'When the clock ends, attacks land and everyone who survived the round gains a new lock.',

  // duel
  'du.1v1': '1v1 Duel', 'du.final': 'Final duel', 'du.fight': 'FIGHT!', 'du.pts': '{n} pts',
  'du.rules': '+1 letter each · {n}-second rounds · strikes never reset. Last one standing wins.',
  'du.hero': 'The Hero’s comeback: cut down to a single letter.', 'du.you': 'You', 'du.hidden': 'Class hidden',
  'du.secret': '{cls} · secret', 'du.ready': 'Get ready', 'du.lives': '{n} of {max} lives left',

  // finished
  'fn.wins': '{name} wins!', 'fn.champ': 'Champion', 'fn.champ_sub': 'Last one standing', 'fn.ein': 'Albert Einstein',
  'fn.ein_sub': 'Most letters played', 'fn.vil': 'The Villain', 'fn.vil_sub': 'Stacked the most letters on others',
  'fn.nobody': 'Nobody', 'fn.locks': 'Everyone’s locks', 'fn.was': 'was {cls}', 'fn.again': 'Play again',
  'fn.wait': 'Waiting for the host to start a rematch…',

  // rack
  'rk.locks': 'Locks', 'rk.cards': 'Cards', 'rk.intel': 'Intel', 'rk.points': 'POINTS', 'rk.trace': 'Trace hacker',
  'rk.who_hacked': 'Who hacked you? One guess.', 'rk.hacked_title': 'Hacked — you can’t see your locks this round',
  'rk.draw': 'Crack a lock to draw one', 'rk.cards_off': 'Cards are off', 'rk.attack2': '+2 letters', 'rk.anon': 'Anonymous hack',
  'rk.hack_who': 'Hack who?', 'rk.attack_who': 'Attack who?', 'rk.hack_q': 'Hack queued on {name}', 'rk.attack_q': 'Attack queued on {name}',
  'rk.blocked': 'Blocked!', 'rk.cleansed': 'Cleansed a letter', 'rk.in_play': 'In play', 'rk.round': 'Round {n}:',

  // perks
  'pk.used': 'Used', 'pk.unlock3': 'Unlocks round 3', 'pk.ninja': 'See all letters in play', 'pk.ninja_ok': 'Ninja vision activated',
  'pk.mm': 'Peek at one player', 'pk.mm_t': 'Peek at who?', 'pk.mm_ok': 'Peeked — one letter leaked to the room',
  'pk.mimic': 'Copy a class', 'pk.mimic_t': 'Become who?', 'pk.mimic_ok': 'Transformed!',
  'pk.bet_on': 'All in this round', 'pk.bet': 'Bet on your word (×2)', 'pk.bet_later': 'Bet during answers',
  'pk.latched': 'Latched to {name}', 'pk.latch': 'Latch onto a player', 'pk.latch_t': 'Latch onto who?', 'pk.latch_ok': 'Latched on',
  'pk.oracle': 'See next prompt', 'pk.oracle_ok': 'The future is revealed',
  'pk.jester': 'Swap lock racks', 'pk.jester_t': 'Swap racks with who?', 'pk.jester_ok': 'Switcheroo!',
  'pk.off': 'Perks are off', 'pk.villain': 'Passive: attacks hit ×2', 'pk.hacker': 'Passive: attacks hack',
  'pk.thief': 'Passive: steal cards', 'pk.wildcard': 'Passive: chaos every round', 'pk.hero': 'Absorb a hit in the cards phase',

  // scoreboard chips
  'hu.host': 'Host', 'hu.out': 'Eliminated', 'hu.chicken': 'chicken', 'hu.chicken_t': 'Rage quit', 'hu.exposed': 'exposed',
  'hu.exposed_t': 'Caught hacking', 'hu.hacked': 'hacked', 'hu.hacked_t': 'Hacked — can’t see their own locks',
  'hu.mimic': 'mimic', 'hu.mimic_t': 'Mimic in disguise', 'hu.allin': 'all in', 'hu.allin_t': 'All in this round',
  'hu.latched_t': 'Parasite latched on', 'hu.letters': 'Banned letters', 'hu.perk_used': 'Perk used', 'hu.done': 'Done',
  'hu.strikes': '{n} of {of} strikes', 'hu.scoreboard': 'Scoreboard',

  // action banners
  'fd.you': 'You', 'fd.someone': 'Someone', 'fd.the': 'The {cls}',
  'fd.attacked': '**{a}** attacked **{b}**', 'fd.lock1': '+1 lock', 'fd.locks': '+{n} locks',
  'fd.got': '**{b}** got', 'fd.hacked_word': 'HACKED', 'fd.by': 'by {name}', 'fd.by_someone': 'by someone…',
  'fd.blocked_ninja': '**{a}** blocked the Ninja penalty', 'fd.blocked': '**{a}** blocked **{b}**', 'fd.a_hack': 'a hack',
  'fd.cleansed': '**{a}** cleansed a lock', 'fd.absorbed': '**{a}** took the hit for **{b}**',
  'fd.caught': '**{a}** caught the Hacker: **{b}**', 'fd.exposed': 'exposed', 'fd.traced': '**{a}** traced **{b}**',
  'fd.wrong': 'wrong guess', 'fd.chicken': '**{a}** chickened out', 'fd.rage': 'rage quit',
  'fd.bet': '**{a}** went **all in**', 'fd.bet_sub': 'double or bust', 'fd.cashout': '**{a}** cashed out', 'fd.plus_pts': '+{n} points',
  'fd.bust': '**{a}** busted', 'fd.minus_pts': '−{n} points', 'fd.steal': '**{a}** stole a card from **{b}**',
  'fd.drop': '**{a}** fumbled a card to **{b}**', 'fd.latch': '**{a}** latched onto **{b}**', 'fd.parasite': 'parasite',
  'fd.drain': '**{a}** fed on **{b}**', 'fd.minus_lock1': '−1 lock', 'fd.minus_locks': '−{n} locks',
  'fd.host_down': '**{a}** lost their host **{b}**', 'fd.strike': 'strike', 'fd.mimic': '**{a}** copied **{b}**', 'fd.now_a': 'now a {cls}',
  'fd.oracle': '**{a}** saw the future', 'fd.oracle_sub': 'their next word goes public',
  'fd.swap': '**{a}** swapped locks with **{b}**', 'fd.switcheroo': 'switcheroo', 'fd.wildcard': 'WILDCARD:',

  // announcer (spoken)
  'an.chicken': '{name} chickened out! Bawk bawk!', 'an.caught': 'Hacker caught! It was {name}!', 'an.hacked': 'You’ve been hacked!',
  'an.wild': 'Wildcard! {name}! {text}', 'an.mimic': '{a} became the {cls}!', 'an.swap': 'Switcheroo!', 'an.bust': '{name} busts!',
  'an.duel_round': 'Duel round! {prompt}', 'an.round': 'Round {n}! {prompt}', 'an.times_up': 'Time’s up! Let’s see those words.',
  'an.crack': 'Crack their locks!', 'an.cards': 'Play your cards!', 'an.vs': '{a}, versus, {b}! Fight!',
  'an.wins': '{name} wins! Your champion!', 'an.over': 'Game over!', 'an.rematch': 'Rematch! Back to the lobby.',
  'an.out_one': '{names} is out!', 'an.out_many': '{names} are out!', 'an.you_out': 'You are out!', 'an.and': ' and ',
  'an.five': 'Five seconds!', 'an.the': 'the {cls}', 'an.The': 'The {cls}', 'an.cls_name': '{cls} {name}',
  'an.the_mimic': 'The Mimic', 'an.the_gambler': 'The Gambler', 'an.them': 'them', 'an.someone': 'Someone',

  // reactions
  'rx.emoji': 'Emoji', 'rx.memes': 'Memes', 'rx.gifs': 'GIFs', 'rx.powered': 'Powered by GIPHY', 'rx.close': 'Close reactions',
  'rx.send': 'Send a reaction', 'rx.search': 'Search GIFs', 'rx.search_memes': 'Search memes',

  // errors (friendly)
  'er.BAD_NAME': 'Pick a name between 1 and 20 characters.', 'er.CLASS_REQUIRED': 'Pick a class first.',
  'er.ROOM_NOT_FOUND': 'That room doesn’t exist. Check the code.', 'er.GAME_IN_PROGRESS': 'That game already started — you can watch as a spectator.',
  'er.ROOM_FULL': 'That room is full.', 'er.NAME_TAKEN': 'Someone in the room already has that name.',
  'er.BAD_TOKEN': 'Your seat in this room was lost. Rejoin from the home page.', 'er.NOT_HOST': 'Only the host can do that.',
  'er.NEED_TWO_PLAYERS': 'You need at least 2 players to start.', 'er.WRONG_PHASE': 'You can’t do that right now.',
  'er.TIME_UP': 'Time’s up for this round.', 'er.ELIMINATED': 'You’re out — spectating now.', 'er.TARGET_NOT_FOUND': 'Pick a player.',
  'er.CANNOT_TARGET_SELF': 'You can’t target yourself.', 'er.TARGET_ELIMINATED': 'That player is already out.',
  'er.BAD_LETTER': 'Pick a letter A–Z.', 'er.ALREADY_GUESSED': 'You already guessed this round.',
  'er.ALREADY_REVEALED': 'That letter’s already been cracked — pick another.', 'er.CARD_NOT_AVAILABLE': 'That card isn’t available.',
  'er.VILLAIN_NO_SHIELD': 'Villains can’t use Shields.', 'er.NOTHING_TO_BLOCK': 'Nothing is aimed at you to block.',
  'er.AT_MINIMUM': 'You already have just 1 letter — nothing to cleanse.', 'er.PERK_USED': 'You’ve already used your perk.',
  'er.PERK_NOT_READY': 'Ninja vision unlocks from round 3.', 'er.NOTHING_TO_ABSORB': 'Nothing is aimed at that player.',
  'er.NO_ACTIVE_PERK': 'Your perk is passive — it kicks in when you play an Attack card.', 'er.PERKS_OFF': 'Class perks are switched off in this room.',
  'er.NOT_HACKED': 'You’re not hacked right now.', 'er.ALREADY_TRACED': 'You already used your trace this round.',
  'er.SLOW_DOWN': 'Easy — one at a time.', 'er.TOO_MANY_FOR_DUEL': '1v1 needs exactly 2 players in the room.',
  'er.ALREADY_BET': 'You’re already all in this round.', 'er.ALREADY_LATCHED': 'You already latched on this round.',
  'er.CANNOT_MIMIC_MIMIC': 'You can’t copy another Mimic.', 'er.network': 'Connection problem — retrying…',
  'er.generic': 'Something went wrong. Try again.', 'er.BAD_AVATAR': 'That picture couldn’t be used.',

  // answer rejection reasons
  'rs.BLANK': 'No answer', 'rs.NOT_LETTERS': 'Letters only', 'rs.TOO_SHORT': 'Too short (3+ letters)', 'rs.NOT_A_WORD': 'Not in the dictionary',
  'rs.REPEAT': 'Already used that word', 'rs.BANNED_LETTER': 'Used a banned letter', 'rs.CHAOS_NO_E': 'Used E in a no-E round',
  'rs.OFF_TOPIC': 'Doesn’t fit the prompt',

  // cards
  'cd.attack': 'Attack', 'cd.attack_t': 'Add a letter to someone', 'cd.shield': 'Shield', 'cd.shield_t': 'Block a letter aimed at you',
  'cd.cleanse': 'Cleanse', 'cd.cleanse_t': 'Remove one of your letters',

  // chaos twists
  'cx.swap': 'Lock swap', 'cx.swap_t': 'Everyone passed one lock to the player on their left.',
  'cx.no_e': 'No-E round', 'cx.no_e_t': 'Nobody may use the letter E this round.',
  'cx.shuffle': 'Card shuffle', 'cx.shuffle_t': 'Every card in play was dealt out again.',
  'cx.double': 'Double points', 'cx.double_t': 'Every valid word scores double this round.',
  'cx.amnesty': 'Amnesty', 'cx.amnesty_t': 'Everyone lost one lock.',
  'cx.speed': 'Speed round', 'cx.speed_t': 'Half the answer time. Go!',

  // classes
  'cl.ninja': 'Ninja', 'cl.ninja.tag': 'Sees in the dark',
  'cl.ninja.perk': 'Once, from round 3: see every banned letter in play (not who owns them).',
  'cl.ninja.cost': 'If anyone cracks one of your letters, you take +3 letters (max once a round).',
  'cl.mastermind': 'Mastermind', 'cl.mastermind.tag': 'Knows too much',
  'cl.mastermind.perk': 'Once: peek at one player’s full letter list.',
  'cl.mastermind.cost': 'One peeked letter leaks to the room as a hint. If nobody else guesses right that round, you take a strike.',
  'cl.hero': 'Hero', 'cl.hero.tag': 'Takes the hit',
  'cl.hero.perk': 'Once: absorb a letter aimed at someone else for +5 points.',
  'cl.hero.cost': 'Comeback class — if you reach the final duel, you arrive with only 1 letter.',
  'cl.villain': 'Villain', 'cl.villain.tag': 'Glass cannon',
  'cl.villain.perk': 'Your Attack cards add 2 letters instead of 1.', 'cl.villain.cost': 'You can’t use Shield cards.',
  'cl.hacker': 'Hacker', 'cl.hacker.tag': 'Ghost in the machine',
  'cl.hacker.perk': 'Your Attack cards are anonymous hacks: the victim plays next round without seeing their own locks.',
  'cl.hacker.cost': 'A hacked player gets one trace. If they name you, you are exposed and your own locks go dark for a round.',
  'cl.mimic': 'Mimic', 'cl.mimic.tag': 'Wears your face',
  'cl.mimic.perk': 'Once: become another player’s class for the rest of the game — with a fresh perk.',
  'cl.mimic.cost': 'You inherit their downside too. No going back.',
  'cl.gambler': 'Gambler', 'cl.gambler.tag': 'All in, every round',
  'cl.gambler.perk': 'Each answer phase you may bet on your word: valid = double points.',
  'cl.gambler.cost': 'Bust and you lose 10 points on top of the strike — and everyone sees you betting.',
  'cl.thief': 'Thief', 'cl.thief.tag': 'Sticky fingers',
  'cl.thief.perk': 'Crack someone’s lock and you steal a card from their hand instead of drawing.',
  'cl.thief.cost': 'Miss a guess and you drop one of your cards into their hand.',
  'cl.parasite': 'Parasite', 'cl.parasite.tag': 'Feeds on the strong',
  'cl.parasite.perk': 'Each round, latch onto a player: for every lock they gain, you shed one of yours.',
  'cl.parasite.cost': 'If your host gets knocked out that round, you take a strike. The latch is public.',
  'cl.oracle': 'Oracle', 'cl.oracle.tag': 'Saw it coming',
  'cl.oracle.perk': 'Once: see next round’s prompt a whole round early.',
  'cl.oracle.cost': 'Next round, your word is shown to everyone the moment you lock it in.',
  'cl.wildcard': 'Wildcard', 'cl.wildcard.tag': 'Pure chaos',
  'cl.wildcard.perk': 'While you live, every round opens with a random twist: lock swap, no-E round, card shuffle, double points, amnesty or speed round.',
  'cl.wildcard.cost': 'The chaos hits you exactly as hard as everyone else.',
  'cl.jester': 'Jester', 'cl.jester.tag': 'Switcheroo',
  'cl.jester.perk': 'Once: swap your entire lock rack with another player.',
  'cl.jester.cost': 'Every lock you receive is revealed to the whole room.',
} as const;

export type Key = keyof typeof en;
export default en;
