import type { PlayerClass } from '../../types';
import type { GuideText } from '../../classGuide';

const g: Partial<Record<PlayerClass, GuideText>> = {
  ninja: {
    style: 'Späher',
    how: 'Zwei Runden spielst du leise, dann schaltest du ab Runde 3 einmal den Ninja-Blick an und siehst jeden verbotenen Buchstaben auf dem Tisch. Wem welcher gehört, erfährst du nicht – das musst du aus den Antworten der anderen zusammenpuzzeln.',
    tips: [
      'Heb dir den Blick auf, bis 8+ Sperren im Spiel sind – mehr Buchstaben, mehr Infos für einen Einsatz.',
      'Gleich den Blick mit der Auflösung ab: Wer einem Buchstaben ständig ausweicht, hat ihn wahrscheinlich.',
      'Deine eigenen Sperren sind ein Risiko (+3, wenn geknackt). Lieber früh reinigen als spät.',
      'Antworte mit langen, abwechslungsreichen Wörtern, damit keiner merkt, welche Buchstaben du meidest.',
    ],
    counter: 'Rate die Buchstaben des Ninjas aggressiv – ein Treffer kostet ihn drei.',
  },
  mastermind: {
    style: 'Infos',
    how: 'Einmal pro Spiel siehst du die komplette Sperrenleiste eines Spielers. Einer dieser Buchstaben sickert als Hinweis an den Raum durch, und knackt in der Runde sonst niemand eine Sperre, kassierst du einen Strike.',
    tips: [
      'Späh beim Führenden – seine Sperren zu knacken dreht das ganze Spiel.',
      'Nutz es in einer Runde, in der die anderen schon gut raten, damit der Strike nie kommt.',
      'Der Hinweis hilft allen – rate die Buchstaben, die NICHT durchgesickert sind.',
      'Heb dir Angriffe bis nach dem Spähen auf, dann weißt du, wer kurz vorm Ausscheiden ist.',
    ],
    counter: 'Halt dich in der Spähen-Runde mit Raten zurück – lass es den Strike schlucken.',
  },
  hero: {
    style: 'Support',
    how: 'Wird jemand angegriffen, kannst du dazwischengehen und den Buchstaben selbst nehmen – für +5 Punkte. Eine Punktemaschine mit Haken: Im Finalduell hast du nur eine Sperre.',
    tips: [
      'Fang ab, wenn der Angriff das Ziel eines starken Rivalen rauswerfen würde – du bestimmst, wer überlebt.',
      'Steck früh ein, solange du Platz hast; später tut jede Sperre weh.',
      'Sammle Reinigungskarten, um aufgesaugte Buchstaben wieder loszuwerden.',
      'Eine Sperre im Duell ist eine Schwäche – bau deinen Punktevorsprung aus, damit das Duell egal ist.',
    ],
    counter: 'Greif den Helden direkt an – Abfangen schützt ihn selbst nicht.',
  },
  villain: {
    style: 'Aggro',
    how: 'Jede Angriffskarte gibt zwei Buchstaben statt einem. Schilde kannst du nicht nutzen, also lebst du vom Druck: Halt deine Gegner mit Ausweichen beschäftigt.',
    tips: [
      'Horte Angriffe und wirf sie auf alle, die kurz vor Problemen stehen.',
      'Vergiss deine Schilde – das sind tote Karten, spiel lieber Reinigung.',
      'Kurze Antworten reichen; dein Schaden steckt in den Karten, nicht im Punktestand.',
      'Doppeltreffer erzwingen seltsame Wörter. Geh auf die Spieler mit den meisten Sperren.',
    ],
    counter: 'Heb ein Schild für den Schurken auf – ein Block stoppt zwei Buchstaben.',
  },
  hacker: {
    style: 'Tarnung',
    how: 'Deine Angriffe sind anonyme Hacks. Das Opfer spielt die nächste Runde blind, ohne die eigenen Sperren zu sehen. Es hat einen Tipp – nennt es dich, bist du enttarnt und deine Sperren werden unsichtbar.',
    tips: [
      'Hack jemanden, den du noch nie angegriffen hast. Muster werden durchschaut.',
      'Hack Spieler mit vielen Sperren – blind mit 5 Sperren spielen ist brutal.',
      'Verhalte dich im Chat und bei Reaktionen normal. Der Feed zeigt nie deinen Namen.',
      'Verteil Hacks auf mehrere Spieler, damit keiner ein klares Motiv hat.',
    ],
    counter: 'Tipp auf den, der am meisten von deiner schlechten Runde hatte – Hacker lieben den Führenden.',
  },
  mimic: {
    style: 'Flex',
    how: 'Einmal pro Spiel kopierst du dauerhaft die Klasse eines anderen Spielers, mit frischem Perk. Du bekommst auch deren Nachteil, und es gibt kein Zurück.',
    tips: [
      'Beobachte erst den Feed. Banner verraten Klassen – kopier die, die gerade gewinnt.',
      'Ein benutzter Perk wird beim Kopieren frisch – schnapp dir das Spähen vom Superhirn, nachdem es seins verbraucht hat.',
      'Schurke ist eine starke späte Kopie: sofort Angriffe mit doppeltem Schaden.',
      'Warte nicht zu lange; ein Perk, den du in der letzten Runde kopierst, ist verschenkt.',
    ],
    counter: 'Versteck deine Klasse – gib dem Nachahmer kein lohnendes Ziel.',
  },
  gambler: {
    style: 'Risiko',
    how: 'In jeder Antwortphase kannst du auf dein Wort all in gehen. Ist es gültig, gibt’s doppelte Punkte; platzt es, verlierst du 10 Punkte zusätzlich zum Strike. Alle sehen, dass du setzt.',
    tips: [
      'Setz nur auf Wörter, bei denen du sicher bist: echt, passend zur Kategorie und frei von deinen Sperren.',
      'Setz groß bei leichten Aufgaben, lass es bei schrägen.',
      'Setzen zeigt dem Raum, dass du dir sicher bist. Nutz das zum Bluffen, wenn du nicht setzt.',
      'Liegst du spät hinten, ist Setzen dein Comeback-Knopf.',
    ],
    counter: 'Greif den Zocker kurz vorm Setzen an – mehr Sperren heißt mehr Pleiten.',
  },
  thief: {
    style: 'Wirtschaft',
    how: 'Knackst du eine Sperre, klaust du eine Karte aus der Hand des Opfers, statt zu ziehen. Rätst du daneben, wandert eine deiner Karten in dessen Hand.',
    tips: [
      'Rate bei Spielern mit den meisten Karten – größere Hand, bessere Beute.',
      'Rate nur, wenn du dir ziemlich sicher bist; Fehlversuche füttern deine Gegner.',
      'Geklaute Schilde nehmen dem Ziel die Abwehr und geben dir eine.',
      'Nimm früh häufige Buchstaben (E, A, R, S, T), dann sind die Chancen am besten.',
    ],
    counter: 'Spiel deine Karten schnell aus – aus einer leeren Hand kann man nichts klauen.',
  },
  parasite: {
    style: 'Blutsauger',
    how: 'Jede Runde heftest du dich an einen Spieler. Für jede Sperre, die er in der Runde bekommt, verlierst du eine. Fliegt dein Wirt in der Runde raus, kassierst du einen Strike – und das Anheften ist öffentlich.',
    tips: [
      'Häng dich an den, der gleich angegriffen wird – den Führenden, das Ziel des Schurken.',
      'Heft dich nie an jemanden auf seinem letzten Strike.',
      'Das Anheften ist öffentlich: Vielleicht greifen andere deinen Wirt für dich an.',
      'Kombinier es mit eigenen Angriffskarten auf deinen Wirt für sichere Abzüge.',
    ],
    counter: 'Greif den Wirt des Parasiten nicht an – oder wirf den Wirt raus, damit der Parasit einen Strike kassiert.',
  },
  oracle: {
    style: 'Planung',
    how: 'Einmal pro Spiel siehst du die Aufgabe der nächsten Runde eine ganze Runde früher. Der Preis: Dein nächstes Wort wird allen gezeigt, sobald du es einloggst.',
    tips: [
      'Nutz die Extrazeit für ein langes, punktestarkes Wort, das deinen Sperren ausweicht.',
      'Dein Wort wird öffentlich, also verrat nicht, welchen Buchstaben du ausweichst.',
      'Logg spät in der Runde ein, damit die anderen nicht auf dein Wort reagieren können.',
      'Heb es dir für Runden mit vielen Sperren auf – da zählt Vorbereitung am meisten.',
    ],
    counter: 'Lies das öffentliche Wort des Orakels – die fehlenden Buchstaben sind ein Ratetipp.',
  },
  wildcard: {
    style: 'Chaos',
    how: 'Solange du lebst, startet jede Runde mit einem zufälligen Twist: Sperrentausch, Ohne-E-Runde, Kartenmix, doppelte Punkte, Amnestie oder Turborunde. Er trifft dich genauso hart wie alle anderen.',
    tips: [
      'Chaos ist fair – aber du weißt, dass es kommt. Bleib flexibel und halt Wörter ohne E bereit.',
      'In Runden mit doppelten Punkten solltest du lang antworten.',
      'Sperrentausch hilft dir, wenn du mehr Sperren hast als dein Nachbar.',
      'Bleib am Leben: Die Twists hören auf, sobald du raus bist.',
    ],
    counter: 'Wirf den Joker früh raus, um das Chaos zu stoppen.',
  },
  jester: {
    style: 'Trickser',
    how: 'Einmal pro Spiel tauschst du deine komplette Sperrenleiste mit einem anderen Spieler. Jede Sperre, die du bekommst, wird dem ganzen Raum gezeigt.',
    tips: [
      'Lass Sperren sich bei dir stapeln und tausch dann mit dem, der die wenigsten hat.',
      'Tausch mit jemandem, der gleich angegriffen wird – maximaler Schmerz.',
      'Deine gezeigten Sperren sind öffentlich, also antworte nach einem Tausch vorsichtig.',
      'Der Tausch setzt deine Gefahr zurück; nutz ihn in der Runde, bevor du rausfliegen würdest.',
    ],
    counter: 'Halt deine Leiste klein, bis der Narr seinen Tausch verbraucht hat.',
  },
};

export default g;
