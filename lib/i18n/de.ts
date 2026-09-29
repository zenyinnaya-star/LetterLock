// German UI strings. **x** renders bold; {name} is a variable.
import type { Key } from './en';

const de: Partial<Record<Key, string>> = {
  // header / common
  'hd.rules': 'Regeln', 'hd.music_on': 'Musik an', 'hd.music_off': 'Musik aus', 'hd.mute': 'Stumm', 'hd.unmute': 'Ton an',
  'hd.settings': 'Einstellungen', 'hd.home': 'Letterlock-Startseite',

  // home
  'home.tag1': 'Beantworte die Frage. Weich deinen verbotenen Buchstaben aus.',
  'home.tag2': 'Jede Runde, die du überlebst, wird ein weiterer Buchstabe gesperrt.',
  'home.name': 'Dein Name', 'home.name_ph': 'z. B. Zab', 'home.avatar': 'Dein Avatar', 'home.class': 'Wähl deine Klasse',
  'home.create': 'Raum erstellen', 'home.duel': '1v1-Duell', 'home.or_join': 'ODER BEITRETEN', 'home.code_ph': 'CODE', 'home.code': 'Raumcode',
  'home.join': 'Beitreten', 'home.footer': '2–12 Spieler · jeder am eigenen Gerät ·', 'home.rules': 'Regeln lesen',
  'home.err_class': 'Wähl zuerst eine Klasse.', 'home.err_name': 'Gib deinen Namen ein.', 'home.err_code': 'Raumcodes haben 4 Zeichen.',

  // room page
  'room.not_found': 'Raum nicht gefunden', 'room.conn': 'Verbindungsproblem', 'room.back': 'Zur Startseite', 'room.seat': 'Du nimmst Platz…',
  'room.err': 'Gib einen Namen ein und wähl eine Klasse.', 'room.joining': 'Raum beitreten', 'room.join': 'Mitspielen',

  // avatar picker
  'av.uploading': 'Lädt hoch…', 'av.change': 'Foto ändern', 'av.upload': 'Foto hochladen', 'av.default': 'Standard nutzen',
  'av.hint_photo': 'Dein Foto wird statt deiner Klasse angezeigt.', 'av.hint_default': 'Standard-Avatar – deine Klasse bleibt geheim.',
  'av.failed': 'Upload fehlgeschlagen',

  // class picker / sheet
  'cp.more': 'Tipps & Tricks →', 'cs.power': 'Stärke', 'cs.price': 'Preis', 'cs.how': 'So spielt sie sich', 'cs.tips': 'Tipps & Tricks',
  'cs.counter': 'So schlägst du sie', 'cs.easy': 'Leicht', 'cs.medium': 'Mittel', 'cs.hard': 'Schwer', 'cs.difficulty': 'Schwierigkeit',
  'cs.choose': '{name} wählen', 'cs.selected': '{name} gewählt', 'cs.prev': 'Vorherige Klasse', 'cs.next': 'Nächste Klasse', 'cs.close': 'Schließen',

  // lobby
  'lb.code': 'Raumcode', 'lb.copied': 'Link kopiert', 'lb.share': 'Einladungslink teilen', 'lb.share_title': 'Spiel Letterlock mit mir',
  'lb.share_text': 'Raum {code}', 'lb.secret': 'geheim', 'lb.waiting_seat': 'Warte auf Spieler…', 'lb.avatar': 'Dein Avatar',
  'lb.class': 'Deine Klasse – geheim bis Spielende', 'lb.duel_tag': '1v1-Duell', 'lb.answers': '{n}s Antworten',
  'lb.shrinking': ', schrumpfend', 'lb.guesses': '{n}s Raten', 'lb.strike1': '1 Strike und raus', 'lb.strikes': '{n} Strikes und raus',
  'lb.cards_on': 'Karten an', 'lb.cards_off': 'Karten aus', 'lb.perks_on': 'Perks an', 'lb.perks_off': 'Perks aus',
  'lb.words_in': 'Wörter auf {lang}',
  'lb.wait_challenger': 'Warte auf Herausforderer…', 'lb.wait_more': 'Warte auf mindestens 1 weiteren Spieler…', 'lb.fight': 'KAMPF!',
  'lb.start': 'Starten · {n} Spieler', 'lb.host_hint': 'Du bist Host. Pass die Regeln übers Zahnrad an und starte, wenn alle da sind.',
  'lb.wait_host': 'Warte auf den Host… ({n}/{max})', 'lb.leave': 'Raum verlassen', 'lb.share_code': 'Code teilen',
  'lb.your_secret': 'Deine Klasse ist geheim', 'lb.secret_class': 'Geheime Klasse', 'lb.host': 'Host',

  // settings
  'st.title': 'Einstellungen', 'st.rules': 'Raumregeln', 'st.host_note': 'Du bist Host – Änderungen gelten für alle.',
  'st.only_host': 'Nur der Host kann das ändern.', 'st.locked': 'Gesperrt, solange ein Spiel läuft.',
  'st.mode': 'Spielmodus', 'st.classic': 'Klassisch', 'st.duel': '1v1-Duell', 'st.duel_needs2': '1v1 braucht genau 2 Spieler',
  'st.max': 'Max. Spieler', 'st.fewer': 'Weniger Spieler', 'st.more': 'Mehr Spieler',
  'st.answer': 'Antwortzeit', 'st.guess': 'Ratezeit', 'st.cards_phase': 'Kartenphase', 'st.duel_rounds': 'Duellrunden',
  'st.strikes': 'Strikes bis raus', 'st.shrink': 'Antwortzeit schrumpft jede Runde', 'st.cards': 'Karten (Angriff / Schild / Reinigung)',
  'st.perks': 'Klassen-Perks', 'st.device': 'Dieses Gerät', 'st.music': 'Musik', 'st.sfx': 'Soundeffekte', 'st.voice': 'Ansagerstimme',
  'st.howto': 'So wird’s gespielt (Video)', 'st.lang': 'Sprache', 'st.ui_lang': 'Menüs & Ansager',
  'st.word_lang': 'Wortsprache', 'st.word_lang_hint': 'Alle antworten in dieser Sprache. Buchstaben bleiben A–Z: Akzente sind optional, Japanisch wird in Romaji und Chinesisch in Pinyin getippt.',

  // game shell
  'gm.home': 'Start', 'gm.quit': 'Aufgeben', 'gm.leave': 'Verlassen',
  'gm.out': 'Du bist raus – du schaust zu. Du siehst jetzt alle Buchstaben.',
  'gm.spectator': 'Spiel läuft – du schaust als Zuschauer zu.',
  'gm.quit_title': 'Rage-Quit?', 'gm.quit_body': 'Du bist für den Rest des Spiels raus, und der ganze Raum erfährt, dass du gekniffen hast.',
  'gm.keep': 'Weiterspielen', 'gm.quit_anyway': 'Trotzdem aufgeben',

  // phases
  'ph.round': 'Runde {n}', 'ph.1v1': '1v1', 'ph.final_duel': 'Finalduell', 'ph.answer': 'Antworten', 'ph.reveal': 'Auflösung',
  'ph.guess': 'Raten', 'ph.cards': 'Karten', 'ph.prompt': 'Die Aufgabe', 'ph.hint': 'Runde {n}: {text}',
  'ph.oracle_locked': 'Das Orakel **{name}** hat **{word}** eingeloggt',
  'ph.hacked': 'Du wurdest gehackt – deine Sperren sind diese Runde versteckt. Spiel vorsichtig.',
  'ph.hacked_trace': 'Du wurdest gehackt – deine Sperren sind diese Runde versteckt. Spiel vorsichtig und spür den Hacker über deine Leiste auf.',
  'ph.type': 'Wort eingeben', 'ph.your_answer': 'Deine Antwort',
  'ph.banned': 'Das enthält einen deiner gesperrten Buchstaben – kostet dich einen Strike.',
  'ph.change': 'Antwort ändern', 'ph.lock': 'Einloggen', 'ph.allin_on': 'ALL IN – doppelt oder nichts',
  'ph.allin': 'All in (×2 Punkte, −10 wenn’s platzt)', 'ph.allin_ok': 'All in! Doppelt oder nichts',
  'ph.locked_in': '**{word}** eingeloggt für +{n}. Du kannst es ändern, bis die Zeit abläuft.',
  'ph.rejected': '**{word}** – {reason}. Versuch ein anderes.', 'ph.that': 'Das', 'ph.used': 'Schon benutzt: {list}',
  'ph.spec_answer': 'Zuschauen – alle antworten gerade.', 'ph.spec_guess': 'Zuschauen – die Spieler raten.',
  'ph.input_ja': 'In Romaji (neko) oder Japanisch (猫) tippen', 'ph.input_zh': 'In Pinyin (mao) oder Chinesisch (猫) tippen',
  'ph.input_accents': 'Akzente sind optional',
  'ph.strike': 'Strike', 'ph.eliminated': 'ausgeschieden',
  'ph.crack': 'Knack eine Sperre', 'ph.crack_sub': 'Ein Versuch. Triffst du einen verbotenen Buchstaben, ziehst du eine Karte.',
  'ph.cracked': 'Geknackt! **{name}** ist für „{l}“ gesperrt. Du hast eine Karte gezogen, falls Platz war.',
  'ph.miss': 'Daneben – {name} darf „{l}“ benutzen.', 'ph.guess_btn': '„{l}“ bei {name} raten', 'ph.pick': 'Wähl Spieler und Buchstaben',
  'ph.play_cards': 'Spiel deine Karten', 'ph.quiet': 'Ruhige Runde – niemand hat was geknackt.',
  'ph.feed_cracked': '**{a}** hat „{l}“ von **{b}** geknackt', 'ph.feed_missed': '**{a}** lag bei {b} daneben',
  'ph.ninja_pen': 'Ninja-Strafe: **{name}** bekommt +{n} Buchstaben',
  'ph.hacks': '**{a}** hackt **{b}** (+{n}, Sperren nächste Runde versteckt)', 'ph.attacks': '**{a}** greift **{b}** an (+{n})',
  'ph.someone': 'Jemand', 'ph.the_cls': '{cls}', 'ph.absorbed_by': ' – abgefangen von {name}', 'ph.blocked': ' – geblockt',
  'ph.take_hit': 'Treffer einstecken (+5)', 'ph.absorbed_ok': 'Abgefangen! +5 Punkte',
  'ph.under_attack': 'Du wirst angegriffen – spiel dein Schild aus der Leiste unten.',
  'ph.waiting': 'Warte auf die anderen…', 'ph.skip': 'Fertig – weiter',
  'ph.cards_note': 'Wenn die Zeit abläuft, landen die Angriffe und alle Überlebenden bekommen eine neue Sperre.',

  // duel
  'du.1v1': '1v1-Duell', 'du.final': 'Finalduell', 'du.fight': 'KAMPF!', 'du.pts': '{n} Pkt.',
  'du.rules': '+1 Buchstabe pro Spieler · {n}-Sekunden-Runden · Strikes bleiben. Wer zuletzt steht, gewinnt.',
  'du.hero': 'Das Comeback des Helden: runter auf einen einzigen Buchstaben.', 'du.you': 'Du', 'du.hidden': 'Klasse verdeckt',
  'du.secret': '{cls} · geheim', 'du.ready': 'Mach dich bereit', 'du.lives': 'Noch {n} von {max} Leben',

  // finished
  'fn.wins': '{name} gewinnt!', 'fn.champ': 'Champion', 'fn.champ_sub': 'Als Letzte(r) übrig', 'fn.ein': 'Albert Einstein',
  'fn.ein_sub': 'Meiste Buchstaben gespielt', 'fn.vil': 'Der Schurke', 'fn.vil_sub': 'Hat anderen die meisten Buchstaben aufgebrummt',
  'fn.nobody': 'Niemand', 'fn.locks': 'Alle Sperren', 'fn.was': 'war {cls}', 'fn.again': 'Nochmal spielen',
  'fn.wait': 'Warte, bis der Host eine Revanche startet…',

  // rack
  'rk.locks': 'Sperren', 'rk.cards': 'Karten', 'rk.intel': 'Infos', 'rk.points': 'PUNKTE', 'rk.trace': 'Hacker aufspüren',
  'rk.who_hacked': 'Wer hat dich gehackt? Ein Versuch.', 'rk.hacked_title': 'Gehackt – du siehst deine Sperren diese Runde nicht',
  'rk.draw': 'Knack eine Sperre, um zu ziehen', 'rk.cards_off': 'Karten sind aus', 'rk.attack2': '+2 Buchstaben', 'rk.anon': 'Anonymer Hack',
  'rk.hack_who': 'Wen hacken?', 'rk.attack_who': 'Wen angreifen?', 'rk.hack_q': 'Hack auf {name} geplant', 'rk.attack_q': 'Angriff auf {name} geplant',
  'rk.blocked': 'Geblockt!', 'rk.cleansed': 'Buchstabe entfernt', 'rk.in_play': 'Im Spiel', 'rk.round': 'Runde {n}:',

  // perks
  'pk.used': 'Benutzt', 'pk.unlock3': 'Ab Runde 3', 'pk.ninja': 'Alle Buchstaben im Spiel sehen', 'pk.ninja_ok': 'Ninja-Blick aktiviert',
  'pk.mm': 'Bei einem Spieler spähen', 'pk.mm_t': 'Bei wem spähen?', 'pk.mm_ok': 'Gespäht – ein Buchstabe ist durchgesickert',
  'pk.mimic': 'Klasse kopieren', 'pk.mimic_t': 'Wer willst du werden?', 'pk.mimic_ok': 'Verwandelt!',
  'pk.bet_on': 'All in diese Runde', 'pk.bet': 'Auf dein Wort setzen (×2)', 'pk.bet_later': 'Setzen beim Antworten',
  'pk.latched': 'Hängt an {name}', 'pk.latch': 'An Spieler heften', 'pk.latch_t': 'An wen heften?', 'pk.latch_ok': 'Angeheftet',
  'pk.oracle': 'Nächste Aufgabe sehen', 'pk.oracle_ok': 'Die Zukunft ist enthüllt',
  'pk.jester': 'Sperren tauschen', 'pk.jester_t': 'Mit wem tauschen?', 'pk.jester_ok': 'Rollentausch!',
  'pk.off': 'Perks sind aus', 'pk.villain': 'Passiv: Angriffe ×2', 'pk.hacker': 'Passiv: Angriffe hacken',
  'pk.thief': 'Passiv: Karten klauen', 'pk.wildcard': 'Passiv: jede Runde Chaos', 'pk.hero': 'Treffer in der Kartenphase abfangen',

  // scoreboard chips
  'hu.host': 'Host', 'hu.out': 'Raus', 'hu.chicken': 'feigling', 'hu.chicken_t': 'Rage-Quit', 'hu.exposed': 'enttarnt',
  'hu.exposed_t': 'Beim Hacken erwischt', 'hu.hacked': 'gehackt', 'hu.hacked_t': 'Gehackt – sieht die eigenen Sperren nicht',
  'hu.mimic': 'nachahmer', 'hu.mimic_t': 'Nachahmer in Verkleidung', 'hu.allin': 'all in', 'hu.allin_t': 'All in diese Runde',
  'hu.latched_t': 'Parasit hängt dran', 'hu.letters': 'Verbotene Buchstaben', 'hu.perk_used': 'Perk benutzt', 'hu.done': 'Fertig',
  'hu.strikes': '{n} von {of} Strikes', 'hu.scoreboard': 'Punktestand',

  // action banners
  'fd.you': 'Du', 'fd.someone': 'Jemand', 'fd.the': '{cls}',
  'fd.attacked': '**{a}** hat **{b}** angegriffen', 'fd.lock1': '+1 Sperre', 'fd.locks': '+{n} Sperren',
  'fd.got': '**{b}** wurde', 'fd.hacked_word': 'GEHACKT', 'fd.by': 'von {name}', 'fd.by_someone': 'von jemandem…',
  'fd.blocked_ninja': '**{a}** hat die Ninja-Strafe geblockt', 'fd.blocked': '**{a}** hat **{b}** geblockt', 'fd.a_hack': 'einen Hack',
  'fd.cleansed': '**{a}** hat eine Sperre entfernt', 'fd.absorbed': '**{a}** hat den Treffer für **{b}** eingesteckt',
  'fd.caught': '**{a}** hat den Hacker erwischt: **{b}**', 'fd.exposed': 'enttarnt', 'fd.traced': '**{a}** tippte auf **{b}**',
  'fd.wrong': 'falsch geraten', 'fd.chicken': '**{a}** hat gekniffen', 'fd.rage': 'Rage-Quit',
  'fd.bet': '**{a}** geht **all in**', 'fd.bet_sub': 'doppelt oder nichts', 'fd.cashout': '**{a}** kassiert ab', 'fd.plus_pts': '+{n} Punkte',
  'fd.bust': '**{a}** hat sich verzockt', 'fd.minus_pts': '−{n} Punkte', 'fd.steal': '**{a}** hat **{b}** eine Karte geklaut',
  'fd.drop': '**{a}** hat **{b}** eine Karte zugespielt', 'fd.latch': '**{a}** heftet sich an **{b}**', 'fd.parasite': 'Parasit',
  'fd.drain': '**{a}** zehrt von **{b}**', 'fd.minus_lock1': '−1 Sperre', 'fd.minus_locks': '−{n} Sperren',
  'fd.host_down': '**{a}** hat den Wirt **{b}** verloren', 'fd.strike': 'Strike', 'fd.mimic': '**{a}** hat **{b}** kopiert', 'fd.now_a': 'jetzt {cls}',
  'fd.oracle': '**{a}** hat die Zukunft gesehen', 'fd.oracle_sub': 'das nächste Wort wird öffentlich',
  'fd.swap': '**{a}** hat Sperren mit **{b}** getauscht', 'fd.switcheroo': 'Rollentausch', 'fd.wildcard': 'JOKER:',

  // announcer (spoken)
  'an.chicken': '{name} hat gekniffen! Gack gack!', 'an.caught': 'Hacker erwischt! Es war {name}!', 'an.hacked': 'Du wurdest gehackt!',
  'an.wild': 'Joker! {name}! {text}', 'an.mimic': '{a} ist jetzt {cls}!', 'an.swap': 'Rollentausch!', 'an.bust': '{name} hat sich verzockt!',
  'an.duel_round': 'Duellrunde! {prompt}', 'an.round': 'Runde {n}! {prompt}', 'an.times_up': 'Zeit ist um! Zeigt her, eure Wörter.',
  'an.crack': 'Knackt ihre Sperren!', 'an.cards': 'Spielt eure Karten!', 'an.vs': '{a}, gegen, {b}! Kämpft!',
  'an.wins': '{name} gewinnt! Euer Champion!', 'an.over': 'Spiel vorbei!', 'an.rematch': 'Revanche! Zurück in die Lobby.',
  'an.out_one': '{names} ist raus!', 'an.out_many': '{names} sind raus!', 'an.you_out': 'Du bist raus!', 'an.and': ' und ',
  'an.five': 'Noch fünf Sekunden!', 'an.the': '{cls}', 'an.The': '{cls}', 'an.cls_name': '{cls} {name}',
  'an.the_mimic': 'Der Nachahmer', 'an.the_gambler': 'Der Zocker', 'an.them': 'jemanden', 'an.someone': 'Jemand',

  // reactions
  'rx.emoji': 'Emoji', 'rx.memes': 'Memes', 'rx.gifs': 'GIFs', 'rx.powered': 'Powered by GIPHY', 'rx.close': 'Reaktionen schließen',
  'rx.send': 'Reaktion senden', 'rx.search': 'GIFs suchen', 'rx.search_memes': 'Memes suchen',

  // errors (friendly)
  'er.BAD_NAME': 'Wähl einen Namen mit 1 bis 20 Zeichen.', 'er.CLASS_REQUIRED': 'Wähl zuerst eine Klasse.',
  'er.ROOM_NOT_FOUND': 'Diesen Raum gibt’s nicht. Prüf den Code.', 'er.GAME_IN_PROGRESS': 'Das Spiel läuft schon – du kannst zuschauen.',
  'er.ROOM_FULL': 'Der Raum ist voll.', 'er.NAME_TAKEN': 'Jemand im Raum hat schon diesen Namen.',
  'er.BAD_TOKEN': 'Dein Platz in diesem Raum ist weg. Tritt über die Startseite neu bei.', 'er.NOT_HOST': 'Das darf nur der Host.',
  'er.NEED_TWO_PLAYERS': 'Zum Starten braucht ihr mindestens 2 Spieler.', 'er.WRONG_PHASE': 'Das geht gerade nicht.',
  'er.TIME_UP': 'Die Zeit für diese Runde ist um.', 'er.ELIMINATED': 'Du bist raus – du schaust jetzt zu.', 'er.TARGET_NOT_FOUND': 'Wähl einen Spieler.',
  'er.CANNOT_TARGET_SELF': 'Du kannst dich nicht selbst wählen.', 'er.TARGET_ELIMINATED': 'Dieser Spieler ist schon raus.',
  'er.BAD_LETTER': 'Wähl einen Buchstaben A–Z.', 'er.ALREADY_GUESSED': 'Du hast diese Runde schon geraten.',
  'er.ALREADY_REVEALED': 'Der Buchstabe ist schon geknackt – nimm einen anderen.', 'er.CARD_NOT_AVAILABLE': 'Diese Karte ist nicht verfügbar.',
  'er.VILLAIN_NO_SHIELD': 'Schurken können keine Schilde nutzen.', 'er.NOTHING_TO_BLOCK': 'Nichts zielt auf dich, das du blocken könntest.',
  'er.AT_MINIMUM': 'Du hast nur noch 1 Buchstaben – nichts zu entfernen.', 'er.PERK_USED': 'Du hast deinen Perk schon benutzt.',
  'er.PERK_NOT_READY': 'Den Ninja-Blick gibt’s erst ab Runde 3.', 'er.NOTHING_TO_ABSORB': 'Nichts zielt auf diesen Spieler.',
  'er.NO_ACTIVE_PERK': 'Dein Perk ist passiv – er wirkt, wenn du eine Angriffskarte spielst.', 'er.PERKS_OFF': 'Klassen-Perks sind in diesem Raum aus.',
  'er.NOT_HACKED': 'Du bist gerade nicht gehackt.', 'er.ALREADY_TRACED': 'Du hast diese Runde schon getippt.',
  'er.SLOW_DOWN': 'Langsam – eins nach dem anderen.', 'er.TOO_MANY_FOR_DUEL': '1v1 braucht genau 2 Spieler im Raum.',
  'er.ALREADY_BET': 'Du bist diese Runde schon all in.', 'er.ALREADY_LATCHED': 'Du hast dich diese Runde schon angeheftet.',
  'er.CANNOT_MIMIC_MIMIC': 'Du kannst keinen anderen Nachahmer kopieren.', 'er.network': 'Verbindungsproblem – neuer Versuch…',
  'er.generic': 'Etwas ist schiefgelaufen. Versuch’s nochmal.', 'er.BAD_AVATAR': 'Dieses Bild kann nicht verwendet werden.',

  // answer rejection reasons
  'rs.BLANK': 'Keine Antwort', 'rs.NOT_LETTERS': 'Nur Buchstaben', 'rs.TOO_SHORT': 'Zu kurz (3+ Buchstaben)', 'rs.NOT_A_WORD': 'Nicht im Wörterbuch',
  'rs.REPEAT': 'Wort schon benutzt', 'rs.BANNED_LETTER': 'Verbotener Buchstabe', 'rs.CHAOS_NO_E': 'E in einer Ohne-E-Runde',
  'rs.OFF_TOPIC': 'Passt nicht zur Aufgabe',

  // cards
  'cd.attack': 'Angriff', 'cd.attack_t': 'Jemandem einen Buchstaben geben', 'cd.shield': 'Schild', 'cd.shield_t': 'Buchstaben gegen dich blocken',
  'cd.cleanse': 'Reinigung', 'cd.cleanse_t': 'Einen deiner Buchstaben entfernen',

  // chaos twists
  'cx.swap': 'Sperrentausch', 'cx.swap_t': 'Alle haben eine Sperre an den linken Nachbarn weitergegeben.',
  'cx.no_e': 'Ohne-E-Runde', 'cx.no_e_t': 'Niemand darf diese Runde den Buchstaben E benutzen.',
  'cx.shuffle': 'Kartenmix', 'cx.shuffle_t': 'Alle Karten im Spiel wurden neu verteilt.',
  'cx.double': 'Doppelte Punkte', 'cx.double_t': 'Jedes gültige Wort zählt diese Runde doppelt.',
  'cx.amnesty': 'Amnestie', 'cx.amnesty_t': 'Alle haben eine Sperre verloren.',
  'cx.speed': 'Turborunde', 'cx.speed_t': 'Halbe Antwortzeit. Los!',

  // classes
  'cl.ninja': 'Ninja', 'cl.ninja.tag': 'Sieht im Dunkeln',
  'cl.ninja.perk': 'Einmal, ab Runde 3: Sieh alle verbotenen Buchstaben im Spiel (aber nicht, wem sie gehören).',
  'cl.ninja.cost': 'Knackt jemand einen deiner Buchstaben, bekommst du +3 Buchstaben (max. einmal pro Runde).',
  'cl.mastermind': 'Superhirn', 'cl.mastermind.tag': 'Weiß zu viel',
  'cl.mastermind.perk': 'Einmal: Sieh die komplette Buchstabenliste eines Spielers.',
  'cl.mastermind.cost': 'Ein gesehener Buchstabe sickert als Hinweis an den Raum durch. Rät in der Runde sonst niemand richtig, kassierst du einen Strike.',
  'cl.hero': 'Held', 'cl.hero.tag': 'Steckt ein',
  'cl.hero.perk': 'Einmal: Fang einen Buchstaben ab, der auf jemand anderen zielt, für +5 Punkte.',
  'cl.hero.cost': 'Comeback-Klasse – erreichst du das Finalduell, startest du mit nur 1 Buchstaben.',
  'cl.villain': 'Schurke', 'cl.villain.tag': 'Glaskanone',
  'cl.villain.perk': 'Deine Angriffskarten geben 2 Buchstaben statt 1.', 'cl.villain.cost': 'Du kannst keine Schildkarten nutzen.',
  'cl.hacker': 'Hacker', 'cl.hacker.tag': 'Geist in der Maschine',
  'cl.hacker.perk': 'Deine Angriffe sind anonyme Hacks: Das Opfer spielt die nächste Runde, ohne die eigenen Sperren zu sehen.',
  'cl.hacker.cost': 'Gehackte haben einen Tipp. Nennen sie dich, bist du enttarnt und deine Sperren werden eine Runde lang unsichtbar.',
  'cl.mimic': 'Nachahmer', 'cl.mimic.tag': 'Trägt dein Gesicht',
  'cl.mimic.perk': 'Einmal: Übernimm für den Rest des Spiels die Klasse eines anderen Spielers – mit frischem Perk.',
  'cl.mimic.cost': 'Du erbst auch deren Nachteil. Kein Zurück.',
  'cl.gambler': 'Zocker', 'cl.gambler.tag': 'Jede Runde all in',
  'cl.gambler.perk': 'In jeder Antwortphase darfst du auf dein Wort setzen: gültig = doppelte Punkte.',
  'cl.gambler.cost': 'Platzt es, verlierst du 10 Punkte zusätzlich zum Strike – und alle sehen, dass du setzt.',
  'cl.thief': 'Dieb', 'cl.thief.tag': 'Lange Finger',
  'cl.thief.perk': 'Knackst du eine Sperre, klaust du eine Karte aus der Hand des Opfers, statt zu ziehen.',
  'cl.thief.cost': 'Rätst du daneben, wandert eine deiner Karten in deren Hand.',
  'cl.parasite': 'Parasit', 'cl.parasite.tag': 'Lebt von den Starken',
  'cl.parasite.perk': 'Häng dich jede Runde an einen Spieler: Für jede Sperre, die er bekommt, verlierst du eine.',
  'cl.parasite.cost': 'Fliegt dein Wirt in der Runde raus, kassierst du einen Strike. Das Anheften ist öffentlich.',
  'cl.oracle': 'Orakel', 'cl.oracle.tag': 'Hat’s kommen sehen',
  'cl.oracle.perk': 'Einmal: Sieh die Aufgabe der nächsten Runde eine ganze Runde früher.',
  'cl.oracle.cost': 'Nächste Runde wird dein Wort allen gezeigt, sobald du es einloggst.',
  'cl.wildcard': 'Joker', 'cl.wildcard.tag': 'Pures Chaos',
  'cl.wildcard.perk': 'Solange du lebst, startet jede Runde mit einem zufälligen Twist: Sperrentausch, Ohne-E-Runde, Kartenmix, doppelte Punkte, Amnestie oder Turborunde.',
  'cl.wildcard.cost': 'Das Chaos trifft dich genauso hart wie alle anderen.',
  'cl.jester': 'Narr', 'cl.jester.tag': 'Rollentausch',
  'cl.jester.perk': 'Einmal: Tausch deine komplette Sperrenleiste mit einem anderen Spieler.',
  'cl.jester.cost': 'Jede Sperre, die du bekommst, wird dem ganzen Raum gezeigt.',
};

export default de;
