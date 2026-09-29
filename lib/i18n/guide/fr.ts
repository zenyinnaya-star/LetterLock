import type { PlayerClass } from '../../types';
import type { GuideText } from '../../classGuide';

const g: Partial<Record<PlayerClass, GuideText>> = {
  ninja: {
    style: 'Éclaireur',
    how: 'Tu joues discret pendant deux manches, puis dès la manche 3 tu actives une fois la vision Ninja et tu vois toutes les lettres interdites sur la table. Tu ne sais pas à qui elles sont : à toi de recouper avec les réponses des autres.',
    tips: [
      'Garde ta vision jusqu’à ce qu’il y ait 8+ verrous sur la table — plus de lettres, plus d’infos pour un seul usage.',
      'Recoupe ta vision avec la révélation : un joueur qui évite toujours une lettre la possède sûrement.',
      'Tes propres verrous sont un risque (+3 si on les cracke). Purge tôt plutôt que tard.',
      'Réponds avec des mots longs et variés pour que personne ne devine quelles lettres tu évites.',
    ],
    counter: 'Vise les lettres du Ninja à fond — un seul crack lui en coûte trois.',
  },
  mastermind: {
    style: 'Espion',
    how: 'Une fois par partie, tu lis tout le rack de verrous d’un joueur. Une de ces lettres fuite à tout le monde comme indice, et si personne d’autre ne cracke de verrou cette manche, tu prends une faute.',
    tips: [
      'Espionne le leader — cracker ses verrous peut renverser la partie.',
      'Utilise-le quand les autres devinent déjà bien, pour ne jamais prendre la faute.',
      'L’indice qui fuite aide tout le monde ; devine plutôt les lettres qui n’ont PAS fuité.',
      'Garde tes attaques pour après ton espionnage, pour savoir qui est le plus proche de sortir.',
    ],
    counter: 'Retiens tes devinettes la manche où il espionne — fais-lui manger la faute.',
  },
  hero: {
    style: 'Soutien',
    how: 'Quand quelqu’un se fait attaquer, tu peux plonger et prendre la lettre à sa place pour +5 points. Une vraie machine à points, avec un piège : au duel final, tu n’arrives qu’avec un seul verrou.',
    tips: [
      'Encaisse quand l’attaque éliminerait la cible d’un rival fort — c’est toi qui choisis qui survit.',
      'Prends des coups tôt tant que tu as de la marge ; en fin de partie, chaque verrou fait mal.',
      'Accumule les cartes Purge pour effacer les lettres que tu encaisses.',
      'Un seul verrou en duel, c’est une faiblesse — garde ton avance aux points pour que le duel ne compte pas.',
    ],
    counter: 'Attaque directement le Héros — encaisser ne le protège pas lui-même.',
  },
  villain: {
    style: 'Agressif',
    how: 'Chaque carte Attaque que tu joues ajoute deux lettres au lieu d’une. Tu ne peux pas utiliser de Bouclier, donc tu vis de la pression : occupe tes ennemis à esquiver.',
    tips: [
      'Garde tes Attaques et balance-les sur celui qui est à un verrou de la catastrophe.',
      'Oublie tes Boucliers — ce sont des cartes mortes, joue Purge à la place.',
      'Des réponses courtes, ça passe ; tes dégâts sont dans les cartes, pas dans le score.',
      'Les coups à deux lettres forcent des mots bizarres. Vise ceux qui ont déjà le plus de verrous.',
    ],
    counter: 'Garde un Bouclier pour le Méchant — bloquer un coup stoppe deux lettres.',
  },
  hacker: {
    style: 'Furtif',
    how: 'Tes attaques sont des hacks anonymes. La victime joue la manche suivante à l’aveugle, sans voir ses propres verrous. Elle a droit à une traque — si elle te nomme, tu es démasqué et ce sont tes verrous qui deviennent invisibles.',
    tips: [
      'Hacke quelqu’un que tu n’as jamais attaqué. Les habitudes se font traquer.',
      'Hacke les joueurs qui ont beaucoup de verrous — jouer à l’aveugle avec 5 verrous, c’est brutal.',
      'Reste naturel dans le chat et les réactions. Le fil n’affiche jamais ton nom.',
      'Répartis tes hacks entre les joueurs pour que personne n’ait de mobile évident.',
    ],
    counter: 'Traque celui qui a le plus profité de ta mauvaise manche — les hackers adorent le leader.',
  },
  mimic: {
    style: 'Polyvalent',
    how: 'Une fois par partie, tu copies pour de bon la classe d’un autre joueur, avec un pouvoir tout neuf. Tu récupères aussi son défaut, et pas de retour en arrière.',
    tips: [
      'Observe d’abord le fil. Les bannières révèlent les classes — copie celle qui gagne.',
      'Copier un pouvoir déjà utilisé t’en donne un neuf — pique un espionnage de Cerveau après qu’il a utilisé le sien.',
      'Le Méchant est une bonne copie tardive : attaques à double dégâts immédiates.',
      'N’attends pas trop ; un pouvoir copié à la dernière manche est gâché.',
    ],
    counter: 'Cache ta classe — ne donne pas à l’Imitateur une cible qui vaut la peine d’être copiée.',
  },
  gambler: {
    style: 'Risque',
    how: 'À chaque phase de réponse, tu peux faire tapis sur ton mot. S’il est valide, tu marques double ; si tu rates, tu perds 10 points en plus de la faute. Tout le monde te voit parier.',
    tips: [
      'Ne parie que sur des mots dont tu es sûr : réels, dans le thème et sans tes verrous.',
      'Mise gros sur les thèmes faciles, passe ton tour sur les bizarres.',
      'Parier montre que tu es confiant. Sers-t’en pour bluffer quand tu ne paries pas.',
      'Quand tu es à la traîne en fin de partie, parier, c’est ton bouton come-back.',
    ],
    counter: 'Attaque le Parieur juste avant qu’il parie — plus de verrous, plus de ratés.',
  },
  thief: {
    style: 'Économie',
    how: 'Quand tu crackes le verrou de quelqu’un, tu lui voles une carte au lieu de piocher. Si tu rates une devinette, tu lâches une de tes cartes dans sa main.',
    tips: [
      'Vise les joueurs qui ont le plus de cartes — grosse main, gros butin.',
      'Ne devine que quand tu es assez sûr ; tes ratés nourrissent tes ennemis.',
      'Voler un Bouclier coupe la défense de ta cible et t’en donne un.',
      'Joue les lettres courantes (E, A, R, S, T) tôt, quand les chances sont les meilleures.',
    ],
    counter: 'Dépense tes cartes vite — une main vide, il n’y a rien à voler.',
  },
  parasite: {
    style: 'Sangsue',
    how: 'À chaque manche, tu t’accroches à un joueur. Pour chaque verrou qu’il gagne cette manche, tu en perds un. Si ton hôte est éliminé cette manche, tu prends une faute, et l’accroche est publique.',
    tips: [
      'Accroche-toi à celui qui va se faire attaquer — le leader, la cible du Méchant.',
      'Ne t’accroche jamais à quelqu’un qui en est à sa dernière faute.',
      'L’accroche est publique : ça peut pousser les autres à attaquer ton hôte pour toi.',
      'Combine avec tes propres cartes Attaque sur ton hôte pour un drain garanti.',
    ],
    counter: 'N’attaque pas l’hôte du Parasite — ou élimine-le pour lui coller une faute.',
  },
  oracle: {
    style: 'Préparation',
    how: 'Une fois par partie, tu vois le thème de la manche suivante une manche entière à l’avance. Le prix : ton prochain mot est montré à tous dès que tu le valides.',
    tips: [
      'Profite du temps en plus pour trouver un mot long et rentable qui évite tes verrous.',
      'Ton mot devient public, alors ne trahis pas les lettres que tu évites.',
      'Valide tard dans la manche pour que les autres ne puissent pas réagir à ton mot.',
      'Garde-le pour les manches où tu as plein de verrous — c’est là que la préparation compte.',
    ],
    counter: 'Lis le mot public de l’Oracle — les lettres absentes sont un indice pour deviner.',
  },
  wildcard: {
    style: 'Chaos',
    how: 'Tant que tu es en vie, chaque manche commence par un twist aléatoire : échange de verrous, manche sans E, mélange des cartes, points doublés, amnistie ou manche éclair. Ça te frappe aussi fort que les autres.',
    tips: [
      'Le chaos est équitable — mais toi, tu le vois venir. Reste flexible et garde des mots sans E sous le coude.',
      'Les manches à points doublés, c’est le moment de sortir des mots longs.',
      'Les échanges de verrous t’arrangent quand tu en as plus que ton voisin.',
      'Reste en vie : les twists s’arrêtent dès que tu es éliminé.',
    ],
    counter: 'Élimine le Joker tôt pour arrêter le chaos.',
  },
  jester: {
    style: 'Filou',
    how: 'Une fois par partie, tu échanges tout ton rack de verrous avec un autre joueur. Chaque verrou que tu reçois est révélé à tout le monde.',
    tips: [
      'Laisse les verrous s’empiler sur toi, puis échange avec celui qui en a le moins.',
      'Échange avec quelqu’un sur le point de se faire attaquer pour faire un max de dégâts.',
      'Tes verrous révélés sont publics, alors réponds prudemment après un échange.',
      'L’échange remet ton danger à zéro ; utilise-le la manche avant de sortir.',
    ],
    counter: 'Garde ton rack léger tant que le Bouffon n’a pas utilisé son échange.',
  },
};

export default g;
