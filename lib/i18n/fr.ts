import type { Key } from './en';

// French UI strings. **x** renders bold; {name} is a variable.
const fr: Partial<Record<Key, string>> = {
  // header / common
  'hd.rules': 'Règles', 'hd.music_on': 'Musique activée', 'hd.music_off': 'Musique coupée', 'hd.mute': 'Couper le son', 'hd.unmute': 'Remettre le son',
  'hd.settings': 'Réglages', 'hd.home': 'Accueil Letterlock',

  // home
  'home.tag1': 'Réponds au thème. Évite tes lettres interdites.',
  'home.tag2': 'À chaque manche survécue, une nouvelle lettre se verrouille.',
  'home.name': 'Ton pseudo', 'home.name_ph': 'ex. Zab', 'home.avatar': 'Ton avatar', 'home.class': 'Choisis ta classe',
  'home.create': 'Créer une partie', 'home.duel': 'Duel 1v1', 'home.or_join': 'OU REJOINS', 'home.code_ph': 'CODE', 'home.code': 'Code de la partie',
  'home.join': 'Rejoindre', 'home.footer': '2–12 joueurs · chacun sur son appareil ·', 'home.rules': 'Lire les règles',
  'home.err_class': 'Choisis d’abord une classe.', 'home.err_name': 'Entre ton pseudo.', 'home.err_code': 'Les codes font 4 caractères.',

  // room page
  'room.not_found': 'Partie introuvable', 'room.conn': 'Problème de connexion', 'room.back': 'Retour à l’accueil', 'room.seat': 'Installation…',
  'room.err': 'Entre un pseudo et choisis une classe.', 'room.joining': 'Tu rejoins la partie', 'room.join': 'Rejoindre la partie',

  // avatar picker
  'av.uploading': 'Envoi…', 'av.change': 'Changer la photo', 'av.upload': 'Ajouter une photo', 'av.default': 'Avatar par défaut',
  'av.hint_photo': 'Ta photo s’affiche à la place de ta classe.', 'av.hint_default': 'Avatar par défaut — ta classe reste secrète.',
  'av.failed': 'Échec de l’envoi',

  // class picker / sheet
  'cp.more': 'Astuces →', 'cs.power': 'Pouvoir', 'cs.price': 'Prix', 'cs.how': 'Comment ça se joue', 'cs.tips': 'Trucs & astuces',
  'cs.counter': 'Comment la contrer', 'cs.easy': 'Facile', 'cs.medium': 'Moyen', 'cs.hard': 'Difficile', 'cs.difficulty': 'Difficulté',
  'cs.choose': 'Choisir {name}', 'cs.selected': '{name} choisi', 'cs.prev': 'Classe précédente', 'cs.next': 'Classe suivante', 'cs.close': 'Fermer',

  // lobby
  'lb.code': 'Code de la partie', 'lb.copied': 'Lien copié', 'lb.share': 'Partager le lien d’invitation', 'lb.share_title': 'Rejoins ma partie de Letterlock',
  'lb.share_text': 'Partie {code}', 'lb.secret': 'secret', 'lb.waiting_seat': 'En attente d’un joueur…', 'lb.avatar': 'Ton avatar',
  'lb.class': 'Ta classe — secrète jusqu’à la fin', 'lb.duel_tag': 'duel 1v1', 'lb.answers': 'réponses en {n} s',
  'lb.shrinking': ', de plus en plus court', 'lb.guesses': 'devinettes en {n} s', 'lb.strike1': '1 faute et c’est fini', 'lb.strikes': '{n} fautes et c’est fini',
  'lb.cards_on': 'Cartes activées', 'lb.cards_off': 'Cartes désactivées', 'lb.perks_on': 'Pouvoirs activés', 'lb.perks_off': 'Pouvoirs désactivés',
  'lb.words_in': 'Mots en {lang}',
  'lb.wait_challenger': 'En attente d’un adversaire…', 'lb.wait_more': 'Il faut au moins 1 joueur de plus…', 'lb.fight': 'COMBAT !',
  'lb.start': 'Lancer · {n} joueurs', 'lb.host_hint': 'C’est toi l’hôte. Règle la partie avec l’engrenage, puis lance quand tout le monde est là.',
  'lb.wait_host': 'En attente de l’hôte… ({n}/{max})', 'lb.leave': 'Quitter la partie', 'lb.share_code': 'Partage le code',
  'lb.your_secret': 'Ta classe est secrète', 'lb.secret_class': 'Classe secrète', 'lb.host': 'Hôte',

  // settings
  'st.title': 'Réglages', 'st.rules': 'Règles de la partie', 'st.host_note': 'C’est toi l’hôte — les changements s’appliquent à tous.',
  'st.only_host': 'Seul l’hôte peut modifier ça.', 'st.locked': 'Verrouillé pendant une partie.',
  'st.mode': 'Mode de jeu', 'st.classic': 'Classique', 'st.duel': 'Duel 1v1', 'st.duel_needs2': 'Le 1v1 demande exactement 2 joueurs',
  'st.max': 'Joueurs max', 'st.fewer': 'Moins de joueurs', 'st.more': 'Plus de joueurs',
  'st.answer': 'Temps de réponse', 'st.guess': 'Temps pour deviner', 'st.cards_phase': 'Phase des cartes', 'st.duel_rounds': 'Manches de duel',
  'st.strikes': 'Fautes avant élimination', 'st.shrink': 'Le temps de réponse diminue à chaque manche', 'st.cards': 'Cartes (Attaque / Bouclier / Purge)',
  'st.perks': 'Pouvoirs de classe', 'st.device': 'Cet appareil', 'st.music': 'Musique', 'st.sfx': 'Effets sonores', 'st.voice': 'Voix du présentateur',
  'st.howto': 'Comment jouer (vidéo)', 'st.lang': 'Langue', 'st.ui_lang': 'Menus & présentateur',
  'st.word_lang': 'Langue des mots', 'st.word_lang_hint': 'Tout le monde répond dans cette langue. Les lettres restent A–Z : accents facultatifs, le japonais se tape en romaji et le chinois en pinyin.',

  // game shell
  'gm.home': 'Accueil', 'gm.quit': 'Abandonner', 'gm.leave': 'Quitter',
  'gm.out': 'Tu es éliminé — mode spectateur. Tu vois maintenant les lettres de tout le monde.',
  'gm.spectator': 'Partie en cours — tu regardes en spectateur.',
  'gm.quit_title': 'Rage quit ?', 'gm.quit_body': 'Tu es éliminé pour le reste de la partie, et tout le monde saura que tu t’es dégonflé.',
  'gm.keep': 'Continuer', 'gm.quit_anyway': 'Abandonner quand même',

  // phases
  'ph.round': 'Manche {n}', 'ph.1v1': '1v1', 'ph.final_duel': 'Duel final', 'ph.answer': 'Réponse', 'ph.reveal': 'Révélation',
  'ph.guess': 'Devine', 'ph.cards': 'Cartes', 'ph.prompt': 'Le thème', 'ph.hint': 'Manche {n} : {text}',
  'ph.oracle_locked': 'L’Oracle **{name}** a validé **{word}**',
  'ph.hacked': 'Tu t’es fait hacker — tes verrous sont cachés cette manche. Joue prudemment.',
  'ph.hacked_trace': 'Tu t’es fait hacker — tes verrous sont cachés cette manche. Joue prudemment, et traque le hacker depuis ton rack.',
  'ph.type': 'tape un mot', 'ph.your_answer': 'Ta réponse',
  'ph.banned': 'Ce mot utilise une de tes lettres verrouillées — ça te coûtera une faute.',
  'ph.change': 'Changer', 'ph.lock': 'Valider', 'ph.allin_on': 'TAPIS — quitte ou double',
  'ph.allin': 'Faire tapis (points ×2, −10 si tu rates)', 'ph.allin_ok': 'Tapis ! Quitte ou double',
  'ph.locked_in': '**{word}** validé pour +{n}. Tu peux changer jusqu’à la fin du chrono.',
  'ph.rejected': '**{word}** — {reason}. Essaie autre chose.', 'ph.that': 'Ce mot', 'ph.used': 'Déjà utilisés : {list}',
  'ph.spec_answer': 'Spectateur — tout le monde répond.', 'ph.spec_guess': 'Spectateur — les joueurs devinent.',
  'ph.input_ja': 'Tape en romaji (neko) ou en japonais (猫)', 'ph.input_zh': 'Tape en pinyin (mao) ou en chinois (猫)',
  'ph.input_accents': 'Accents facultatifs',
  'ph.strike': 'faute', 'ph.eliminated': 'éliminé',
  'ph.crack': 'Crack le verrou de quelqu’un', 'ph.crack_sub': 'Un seul essai. Touche une lettre interdite et tu pioches une carte.',
  'ph.cracked': 'Cracké ! **{name}** ne peut plus utiliser « {l} ». Tu as pioché une carte si tu avais de la place.',
  'ph.miss': 'Raté — {name} peut utiliser « {l} ».', 'ph.guess_btn': 'Tenter « {l} » sur {name}', 'ph.pick': 'Choisis un joueur et une lettre',
  'ph.play_cards': 'Joue tes cartes', 'ph.quiet': 'Manche calme — personne n’a rien cracké.',
  'ph.feed_cracked': '**{a}** a cracké le « {l} » de **{b}**', 'ph.feed_missed': '**{a}** a raté {b}',
  'ph.ninja_pen': 'Pénalité Ninja : **{name}** prend +{n} lettres',
  'ph.hacks': '**{a}** hacke **{b}** (+{n}, verrous cachés la manche suivante)', 'ph.attacks': '**{a}** attaque **{b}** (+{n})',
  'ph.someone': 'Quelqu’un', 'ph.the_cls': '{cls}', 'ph.absorbed_by': ' — encaissé par {name}', 'ph.blocked': ' — bloqué',
  'ph.take_hit': 'Encaisser le coup (+5)', 'ph.absorbed_ok': 'Encaissé ! +5 points',
  'ph.under_attack': 'Tu es attaqué — joue ton Bouclier depuis ton rack ci-dessous.',
  'ph.waiting': 'En attente des autres…', 'ph.skip': 'J’ai fini — on passe',
  'ph.cards_note': 'À la fin du chrono, les attaques tombent et chaque survivant de la manche gagne un nouveau verrou.',

  // duel
  'du.1v1': 'Duel 1v1', 'du.final': 'Duel final', 'du.fight': 'COMBAT !', 'du.pts': '{n} pts',
  'du.rules': '+1 lettre chacun · manches de {n} secondes · les fautes ne se réinitialisent jamais. Le dernier debout gagne.',
  'du.hero': 'Le retour du Héros : réduit à une seule lettre.', 'du.you': 'Toi', 'du.hidden': 'Classe cachée',
  'du.secret': '{cls} · secret', 'du.ready': 'Prépare-toi', 'du.lives': '{n} vies sur {max}',

  // finished
  'fn.wins': '{name} gagne !', 'fn.champ': 'Champion', 'fn.champ_sub': 'Dernier debout', 'fn.ein': 'Albert Einstein',
  'fn.ein_sub': 'Le plus de lettres jouées', 'fn.vil': 'Le Méchant', 'fn.vil_sub': 'A collé le plus de lettres aux autres',
  'fn.nobody': 'Personne', 'fn.locks': 'Les verrous de chacun', 'fn.was': 'était {cls}', 'fn.again': 'Rejouer',
  'fn.wait': 'En attente de l’hôte pour la revanche…',

  // rack
  'rk.locks': 'Verrous', 'rk.cards': 'Cartes', 'rk.intel': 'Infos', 'rk.points': 'POINTS', 'rk.trace': 'Traquer le hacker',
  'rk.who_hacked': 'Qui t’a hacké ? Un seul essai.', 'rk.hacked_title': 'Hacké — tu ne vois pas tes verrous cette manche',
  'rk.draw': 'Cracke un verrou pour piocher', 'rk.cards_off': 'Cartes désactivées', 'rk.attack2': '+2 lettres', 'rk.anon': 'Hack anonyme',
  'rk.hack_who': 'Hacker qui ?', 'rk.attack_who': 'Attaquer qui ?', 'rk.hack_q': 'Hack prévu sur {name}', 'rk.attack_q': 'Attaque prévue sur {name}',
  'rk.blocked': 'Bloqué !', 'rk.cleansed': 'Une lettre purgée', 'rk.in_play': 'En jeu', 'rk.round': 'Manche {n} :',

  // perks
  'pk.used': 'Utilisé', 'pk.unlock3': 'Dispo dès la manche 3', 'pk.ninja': 'Voir toutes les lettres en jeu', 'pk.ninja_ok': 'Vision Ninja activée',
  'pk.mm': 'Espionner un joueur', 'pk.mm_t': 'Espionner qui ?', 'pk.mm_ok': 'Espionné — une lettre a fuité à tout le monde',
  'pk.mimic': 'Copier une classe', 'pk.mimic_t': 'Devenir qui ?', 'pk.mimic_ok': 'Transformé !',
  'pk.bet_on': 'Tapis cette manche', 'pk.bet': 'Parier sur ton mot (×2)', 'pk.bet_later': 'Pari pendant les réponses',
  'pk.latched': 'Accroché à {name}', 'pk.latch': 'S’accrocher à un joueur', 'pk.latch_t': 'S’accrocher à qui ?', 'pk.latch_ok': 'Accroché',
  'pk.oracle': 'Voir le prochain thème', 'pk.oracle_ok': 'L’avenir est révélé',
  'pk.jester': 'Échanger les verrous', 'pk.jester_t': 'Échanger avec qui ?', 'pk.jester_ok': 'Tour de passe-passe !',
  'pk.off': 'Pouvoirs désactivés', 'pk.villain': 'Passif : attaques ×2', 'pk.hacker': 'Passif : attaques = hacks',
  'pk.thief': 'Passif : vole des cartes', 'pk.wildcard': 'Passif : chaos à chaque manche', 'pk.hero': 'Encaisser un coup pendant les cartes',

  // scoreboard chips
  'hu.host': 'Hôte', 'hu.out': 'Éliminé', 'hu.chicken': 'poule mouillée', 'hu.chicken_t': 'Rage quit', 'hu.exposed': 'démasqué',
  'hu.exposed_t': 'Pris en train de hacker', 'hu.hacked': 'hacké', 'hu.hacked_t': 'Hacké — ne voit pas ses propres verrous',
  'hu.mimic': 'imitateur', 'hu.mimic_t': 'Imitateur déguisé', 'hu.allin': 'tapis', 'hu.allin_t': 'Tapis cette manche',
  'hu.latched_t': 'Parasite accroché', 'hu.letters': 'Lettres interdites', 'hu.perk_used': 'Pouvoir utilisé', 'hu.done': 'Fini',
  'hu.strikes': '{n} fautes sur {of}', 'hu.scoreboard': 'Classement',

  // action banners
  'fd.you': 'Toi', 'fd.someone': 'Quelqu’un', 'fd.the': '{cls}',
  'fd.attacked': '**{a}** a attaqué **{b}**', 'fd.lock1': '+1 verrou', 'fd.locks': '+{n} verrous',
  'fd.got': '**{b}** s’est fait', 'fd.hacked_word': 'HACKER', 'fd.by': 'par {name}', 'fd.by_someone': 'par quelqu’un…',
  'fd.blocked_ninja': '**{a}** a bloqué la pénalité Ninja', 'fd.blocked': '**{a}** a bloqué **{b}**', 'fd.a_hack': 'un hack',
  'fd.cleansed': '**{a}** a purgé un verrou', 'fd.absorbed': '**{a}** a encaissé le coup pour **{b}**',
  'fd.caught': '**{a}** a démasqué le Hacker : **{b}**', 'fd.exposed': 'démasqué', 'fd.traced': '**{a}** a traqué **{b}**',
  'fd.wrong': 'mauvaise pioche', 'fd.chicken': '**{a}** s’est dégonflé', 'fd.rage': 'rage quit',
  'fd.bet': '**{a}** a fait **tapis**', 'fd.bet_sub': 'quitte ou double', 'fd.cashout': '**{a}** a encaissé', 'fd.plus_pts': '+{n} points',
  'fd.bust': '**{a}** a tout perdu', 'fd.minus_pts': '−{n} points', 'fd.steal': '**{a}** a volé une carte à **{b}**',
  'fd.drop': '**{a}** a lâché une carte à **{b}**', 'fd.latch': '**{a}** s’est accroché à **{b}**', 'fd.parasite': 'parasite',
  'fd.drain': '**{a}** s’est nourri de **{b}**', 'fd.minus_lock1': '−1 verrou', 'fd.minus_locks': '−{n} verrous',
  'fd.host_down': '**{a}** a perdu son hôte **{b}**', 'fd.strike': 'faute', 'fd.mimic': '**{a}** a copié **{b}**', 'fd.now_a': 'devient {cls}',
  'fd.oracle': '**{a}** a vu l’avenir', 'fd.oracle_sub': 'son prochain mot sera public',
  'fd.swap': '**{a}** a échangé ses verrous avec **{b}**', 'fd.switcheroo': 'passe-passe', 'fd.wildcard': 'JOKER :',

  // announcer (spoken)
  'an.chicken': '{name} s’est dégonflé ! Cot cot codet !', 'an.caught': 'Hacker démasqué ! C’était {name} !', 'an.hacked': 'Tu t’es fait hacker !',
  'an.wild': 'Joker ! {name} ! {text}', 'an.mimic': '{a} se transforme : {cls} !', 'an.swap': 'Tour de passe-passe !', 'an.bust': '{name} perd tout !',
  'an.duel_round': 'Manche de duel ! {prompt}', 'an.round': 'Manche {n} ! {prompt}', 'an.times_up': 'Temps écoulé ! Voyons ces mots.',
  'an.crack': 'Crackez leurs verrous !', 'an.cards': 'Jouez vos cartes !', 'an.vs': '{a}, contre, {b} ! Combat !',
  'an.wins': '{name} gagne ! Voici votre champion !', 'an.over': 'Partie terminée !', 'an.rematch': 'Revanche ! Retour au salon.',
  'an.out_one': '{names} est éliminé !', 'an.out_many': '{names} sont éliminés !', 'an.you_out': 'Tu es éliminé !', 'an.and': ' et ',
  'an.five': 'Cinq secondes !', 'an.the': '{cls}', 'an.The': '{cls}', 'an.cls_name': '{cls} {name}',
  'an.the_mimic': 'L’Imitateur', 'an.the_gambler': 'Le Parieur', 'an.them': 'lui', 'an.someone': 'Quelqu’un',

  // reactions
  'rx.emoji': 'Emoji', 'rx.memes': 'Mèmes', 'rx.gifs': 'GIF', 'rx.powered': 'Propulsé par GIPHY', 'rx.close': 'Fermer les réactions',
  'rx.send': 'Envoyer une réaction', 'rx.search': 'Chercher des GIF', 'rx.search_memes': 'Chercher des mèmes',

  // errors (friendly)
  'er.BAD_NAME': 'Choisis un pseudo de 1 à 20 caractères.', 'er.CLASS_REQUIRED': 'Choisis d’abord une classe.',
  'er.ROOM_NOT_FOUND': 'Cette partie n’existe pas. Vérifie le code.', 'er.GAME_IN_PROGRESS': 'La partie a déjà commencé — tu peux regarder en spectateur.',
  'er.ROOM_FULL': 'Cette partie est complète.', 'er.NAME_TAKEN': 'Quelqu’un dans la partie a déjà ce pseudo.',
  'er.BAD_TOKEN': 'Ta place dans cette partie a été perdue. Rejoins depuis l’accueil.', 'er.NOT_HOST': 'Seul l’hôte peut faire ça.',
  'er.NEED_TWO_PLAYERS': 'Il faut au moins 2 joueurs pour lancer.', 'er.WRONG_PHASE': 'Tu ne peux pas faire ça maintenant.',
  'er.TIME_UP': 'Temps écoulé pour cette manche.', 'er.ELIMINATED': 'Tu es éliminé — mode spectateur.', 'er.TARGET_NOT_FOUND': 'Choisis un joueur.',
  'er.CANNOT_TARGET_SELF': 'Tu ne peux pas te cibler toi-même.', 'er.TARGET_ELIMINATED': 'Ce joueur est déjà éliminé.',
  'er.BAD_LETTER': 'Choisis une lettre A–Z.', 'er.ALREADY_GUESSED': 'Tu as déjà deviné cette manche.',
  'er.ALREADY_REVEALED': 'Cette lettre a déjà été crackée — choisis-en une autre.', 'er.CARD_NOT_AVAILABLE': 'Cette carte n’est pas disponible.',
  'er.VILLAIN_NO_SHIELD': 'Les Méchants ne peuvent pas utiliser de Bouclier.', 'er.NOTHING_TO_BLOCK': 'Rien ne te vise, rien à bloquer.',
  'er.AT_MINIMUM': 'Tu n’as déjà plus qu’une lettre — rien à purger.', 'er.PERK_USED': 'Tu as déjà utilisé ton pouvoir.',
  'er.PERK_NOT_READY': 'La vision Ninja se débloque à la manche 3.', 'er.NOTHING_TO_ABSORB': 'Rien ne vise ce joueur.',
  'er.NO_ACTIVE_PERK': 'Ton pouvoir est passif — il s’active quand tu joues une carte Attaque.', 'er.PERKS_OFF': 'Les pouvoirs de classe sont désactivés dans cette partie.',
  'er.NOT_HACKED': 'Tu n’es pas hacké en ce moment.', 'er.ALREADY_TRACED': 'Tu as déjà utilisé ta traque cette manche.',
  'er.SLOW_DOWN': 'Doucement — une chose à la fois.', 'er.TOO_MANY_FOR_DUEL': 'Le 1v1 demande exactement 2 joueurs dans la partie.',
  'er.ALREADY_BET': 'Tu as déjà fait tapis cette manche.', 'er.ALREADY_LATCHED': 'Tu t’es déjà accroché cette manche.',
  'er.CANNOT_MIMIC_MIMIC': 'Tu ne peux pas copier un autre Imitateur.', 'er.network': 'Problème de connexion — nouvelle tentative…',
  'er.generic': 'Oups, un problème. Réessaie.', 'er.BAD_AVATAR': 'Cette image ne peut pas être utilisée.',

  // answer rejection reasons
  'rs.BLANK': 'Pas de réponse', 'rs.NOT_LETTERS': 'Lettres uniquement', 'rs.TOO_SHORT': 'Trop court (3 lettres min.)', 'rs.NOT_A_WORD': 'Pas dans le dictionnaire',
  'rs.REPEAT': 'Mot déjà utilisé', 'rs.BANNED_LETTER': 'Lettre interdite utilisée', 'rs.CHAOS_NO_E': 'E utilisé pendant une manche sans E',
  'rs.OFF_TOPIC': 'Hors sujet',

  // cards
  'cd.attack': 'Attaque', 'cd.attack_t': 'Ajoute une lettre à quelqu’un', 'cd.shield': 'Bouclier', 'cd.shield_t': 'Bloque une lettre qui te vise',
  'cd.cleanse': 'Purge', 'cd.cleanse_t': 'Retire une de tes lettres',

  // chaos twists
  'cx.swap': 'Échange de verrous', 'cx.swap_t': 'Chacun a passé un verrou au joueur à sa gauche.',
  'cx.no_e': 'Manche sans E', 'cx.no_e_t': 'Personne n’a le droit d’utiliser la lettre E cette manche.',
  'cx.shuffle': 'Mélange des cartes', 'cx.shuffle_t': 'Toutes les cartes en jeu ont été redistribuées.',
  'cx.double': 'Points doublés', 'cx.double_t': 'Chaque mot valide rapporte double cette manche.',
  'cx.amnesty': 'Amnistie', 'cx.amnesty_t': 'Tout le monde a perdu un verrou.',
  'cx.speed': 'Manche éclair', 'cx.speed_t': 'Moitié moins de temps pour répondre. Go !',

  // classes
  'cl.ninja': 'Ninja', 'cl.ninja.tag': 'Voit dans le noir',
  'cl.ninja.perk': 'Une fois, dès la manche 3 : vois toutes les lettres interdites en jeu (sans savoir à qui elles sont).',
  'cl.ninja.cost': 'Si quelqu’un cracke une de tes lettres, tu prends +3 lettres (max une fois par manche).',
  'cl.mastermind': 'Cerveau', 'cl.mastermind.tag': 'En sait trop',
  'cl.mastermind.perk': 'Une fois : espionne la liste complète des lettres d’un joueur.',
  'cl.mastermind.cost': 'Une lettre espionnée fuite à tout le monde comme indice. Si personne d’autre ne devine juste cette manche, tu prends une faute.',
  'cl.hero': 'Héros', 'cl.hero.tag': 'Encaisse les coups',
  'cl.hero.perk': 'Une fois : encaisse une lettre destinée à un autre pour +5 points.',
  'cl.hero.cost': 'Classe de come-back — si tu atteins le duel final, tu y arrives avec 1 seule lettre.',
  'cl.villain': 'Méchant', 'cl.villain.tag': 'Canon de verre',
  'cl.villain.perk': 'Tes cartes Attaque ajoutent 2 lettres au lieu d’1.', 'cl.villain.cost': 'Tu ne peux pas utiliser de Bouclier.',
  'cl.hacker': 'Hacker', 'cl.hacker.tag': 'Fantôme dans la machine',
  'cl.hacker.perk': 'Tes cartes Attaque sont des hacks anonymes : la victime joue la manche suivante sans voir ses propres verrous.',
  'cl.hacker.cost': 'Un joueur hacké a droit à une traque. S’il te nomme, tu es démasqué et tes propres verrous deviennent invisibles pendant une manche.',
  'cl.mimic': 'Imitateur', 'cl.mimic.tag': 'Porte ton visage',
  'cl.mimic.perk': 'Une fois : prends la classe d’un autre joueur pour le reste de la partie — avec un pouvoir tout neuf.',
  'cl.mimic.cost': 'Tu hérites aussi de son défaut. Pas de retour en arrière.',
  'cl.gambler': 'Parieur', 'cl.gambler.tag': 'Tapis à chaque manche',
  'cl.gambler.perk': 'À chaque phase de réponse, tu peux parier sur ton mot : valide = points doublés.',
  'cl.gambler.cost': 'Si tu rates, tu perds 10 points en plus de la faute — et tout le monde te voit parier.',
  'cl.thief': 'Voleur', 'cl.thief.tag': 'Doigts de fée',
  'cl.thief.perk': 'Cracke le verrou de quelqu’un et tu lui voles une carte au lieu de piocher.',
  'cl.thief.cost': 'Rate une devinette et tu lâches une de tes cartes dans sa main.',
  'cl.parasite': 'Parasite', 'cl.parasite.tag': 'Se nourrit des forts',
  'cl.parasite.perk': 'À chaque manche, accroche-toi à un joueur : pour chaque verrou qu’il gagne, tu en perds un.',
  'cl.parasite.cost': 'Si ton hôte est éliminé cette manche, tu prends une faute. L’accroche est publique.',
  'cl.oracle': 'Oracle', 'cl.oracle.tag': 'L’avait vu venir',
  'cl.oracle.perk': 'Une fois : vois le thème de la manche suivante une manche à l’avance.',
  'cl.oracle.cost': 'À la manche suivante, ton mot est montré à tous dès que tu le valides.',
  'cl.wildcard': 'Joker', 'cl.wildcard.tag': 'Chaos pur',
  'cl.wildcard.perk': 'Tant que tu es en vie, chaque manche commence par un twist aléatoire : échange de verrous, manche sans E, mélange des cartes, points doublés, amnistie ou manche éclair.',
  'cl.wildcard.cost': 'Le chaos te frappe exactement aussi fort que les autres.',
  'cl.jester': 'Bouffon', 'cl.jester.tag': 'Passe-passe',
  'cl.jester.perk': 'Une fois : échange tout ton rack de verrous avec un autre joueur.',
  'cl.jester.cost': 'Chaque verrou que tu reçois est révélé à tout le monde.',
};

export default fr;
