import type { PlayerClass } from '../../types';
import type { GuideText } from '../../classGuide';

const g: Partial<Record<PlayerClass, GuideText>> = {
  ninja: {
    style: 'Explorador',
    how: 'Juegas callado dos rondas y, desde la ronda 3, activas una vez la visión ninja y ves todas las letras prohibidas de la mesa. No sabes de quién es cada una, así que tienes que deducirlo por cómo responde la gente.',
    tips: [
      'Guarda la visión hasta que haya 8+ bloqueos en la mesa: más letras, más info por un solo uso.',
      'Cruza la visión con la revelación: quien sigue esquivando una letra probablemente la tiene.',
      'Tus propios bloqueos son un riesgo (+3 si los rompen). Límpialos pronto, no tarde.',
      'Responde con palabras largas y variadas para que nadie note qué letras evitas.',
    ],
    counter: 'Ve a por las letras del Ninja con todo: cada acierto le cuesta tres.',
  },
  mastermind: {
    style: 'Espionaje',
    how: 'Una vez por partida lees todos los bloqueos de un jugador. Una de esas letras se filtra a la sala como pista y, si nadie más rompe un bloqueo esa ronda, recibes un fallo.',
    tips: [
      'Espía al líder: romper sus bloqueos cambia toda la partida.',
      'Úsalo en una ronda en la que los demás ya estén adivinando bien, para que el fallo nunca llegue.',
      'La pista filtrada ayuda a todos; adivina las letras que NO se filtraron.',
      'Guarda los ataques hasta después de espiar, así sabrás quién está más cerca de caer.',
    ],
    counter: 'No adivines la ronda en que espía: haz que se coma el fallo.',
  },
  hero: {
    style: 'Apoyo',
    how: 'Cuando atacan a alguien, puedes lanzarte y recibir la letra tú por +5 puntos. Es una máquina de puntos con trampa: si llegas al duelo final, solo llevas un bloqueo.',
    tips: [
      'Absorbe cuando el ataque sacaría al objetivo de un rival fuerte: tú decides quién sobrevive.',
      'Recibe golpes pronto mientras tienes margen; al final cada bloqueo duele.',
      'Acumula cartas de Limpieza para quitarte las letras que absorbes.',
      'Un bloqueo en el duelo es una debilidad: mantén la ventaja en puntos para que el duelo no importe.',
    ],
    counter: 'Ataca al Héroe directamente: absorber no lo protege a él.',
  },
  villain: {
    style: 'Agresivo',
    how: 'Cada carta de Ataque que juegas añade dos letras en vez de una. No puedes usar Escudos, así que vives de la presión: mantén a los rivales ocupados esquivando.',
    tips: [
      'Acumula Ataques y suéltalos sobre quien esté a un bloqueo del desastre.',
      'Olvídate de los Escudos: son cartas muertas, así que juega Limpieza.',
      'Las respuestas cortas están bien; tu daño está en las cartas, no en la puntuación.',
      'Los golpes de dos letras obligan a usar palabras raras. Ve a por quien ya tenga más bloqueos.',
    ],
    counter: 'Guarda un Escudo para el Villano: bloquear un golpe frena dos letras.',
  },
  hacker: {
    style: 'Sigilo',
    how: 'Tus ataques son hackeos anónimos. La víctima juega la próxima ronda a ciegas, sin ver sus propios bloqueos. Tiene un rastreo: si te nombra, quedas expuesto y los que se oscurecen son tus bloqueos.',
    tips: [
      'Hackea a alguien a quien nunca hayas atacado. Los patrones se rastrean.',
      'Hackea a quien tenga muchos bloqueos: jugar a ciegas con 5 es brutal.',
      'Actúa normal en el chat y las reacciones. El feed nunca muestra tu nombre.',
      'Reparte los hackeos entre jugadores para que nadie tenga un motivo claro.',
    ],
    counter: 'Rastrea a quien más ganó con tu mala ronda: al hacker le encanta el líder.',
  },
  mimic: {
    style: 'Flexible',
    how: 'Una vez por partida copias para siempre la clase de otro jugador, con un poder nuevo. También heredas su desventaja, y no hay vuelta atrás.',
    tips: [
      'Mira el feed primero. Los avisos revelan clases: copia la que va ganando.',
      'Copiar un poder ya usado te da uno nuevo: roba un espionaje de Mente maestra después de que lo gaste.',
      'El Villano es una buena copia tardía: ataques de doble daño al instante.',
      'No esperes demasiado; un poder copiado en la última ronda se desperdicia.',
    ],
    counter: 'Oculta tu clase: no le des al Imitador un objetivo que valga la pena copiar.',
  },
  gambler: {
    style: 'Riesgo',
    how: 'En cada fase de respuesta puedes ir con todo por tu palabra. Si es válida, puntúas doble; si falla, pierdes 10 puntos además del fallo. Todos ven que apuestas.',
    tips: [
      'Apuesta solo por palabras que seguro existen, encajan en la categoría y esquivan tus bloqueos.',
      'Apuesta fuerte en consignas fáciles y pasa en las raras.',
      'Apostar le dice a la sala que vas seguro. Úsalo para farolear cuando no apuestes.',
      'Si vas perdiendo al final, apostar es tu botón de remontada.',
    ],
    counter: 'Ataca al Apostador justo antes de que apueste: más bloqueos, más quiebras.',
  },
  thief: {
    style: 'Economía',
    how: 'Cuando rompes el bloqueo de alguien, le robas una carta de la mano en vez de robar del mazo. Si fallas una adivinanza, sueltas una de tus cartas en su mano.',
    tips: [
      'Adivina con quien tenga más cartas: mano más grande, mejor botín.',
      'Adivina solo cuando estés bastante seguro; los fallos alimentan a tus rivales.',
      'Robar Escudos deja al objetivo sin defensa y te da una a ti.',
      'Usa letras comunes (E, A, R, S, T) al principio, cuando las probabilidades son mejores.',
    ],
    counter: 'Gasta tus cartas rápido: una mano vacía no tiene nada que robar.',
  },
  parasite: {
    style: 'Sanguijuela',
    how: 'Cada ronda te pegas a un jugador. Por cada bloqueo que gane esa ronda, tú sueltas uno de los tuyos. Si tu huésped queda eliminado esa ronda, recibes un fallo, y el enganche es público.',
    tips: [
      'Pégate a quien esté a punto de ser atacado: el líder, el objetivo del Villano.',
      'Nunca te pegues a alguien en su último fallo.',
      'El enganche es público: puede hacer que otros ataquen a tu huésped por ti.',
      'Combínalo con tus propias cartas de Ataque contra tu huésped para drenar seguro.',
    ],
    counter: 'No ataques al huésped del Parásito, o elimínalo para que el Parásito reciba un fallo.',
  },
  oracle: {
    style: 'Preparación',
    how: 'Una vez por partida ves la consigna de la próxima ronda con una ronda completa de antelación. El precio: tu próxima palabra se muestra a todos en cuanto la fijas.',
    tips: [
      'Usa el tiempo extra para encontrar una palabra larga que puntúe mucho y esquive tus bloqueos.',
      'Tu palabra será pública, así que no delates qué letras estás esquivando.',
      'Fíjala tarde en la ronda para que nadie pueda reaccionar a tu palabra.',
      'Guárdalo para rondas en las que tengas muchos bloqueos: ahí es cuando más importa prepararse.',
    ],
    counter: 'Lee la palabra pública del Oráculo: las letras que faltan son una pista.',
  },
  wildcard: {
    style: 'Caos',
    how: 'Mientras sigas vivo, cada ronda empieza con un giro al azar: cambio de bloqueos, ronda sin E, barajar cartas, puntos dobles, amnistía o ronda rápida. Te golpea igual que a cualquiera.',
    tips: [
      'El caos es justo, pero tú sabes que viene. Sé flexible y ten listas palabras sin E.',
      'Las rondas de puntos dobles son tu momento para responder largo.',
      'Los cambios de bloqueos te ayudan cuando tienes más bloqueos que tu vecino.',
      'Sigue vivo: los giros se acaban en cuanto quedas fuera.',
    ],
    counter: 'Elimina pronto al Comodín para frenar el caos.',
  },
  jester: {
    style: 'Embaucador',
    how: 'Una vez por partida intercambias todos tus bloqueos con otro jugador. Cada bloqueo que recibes se revela a toda la sala.',
    tips: [
      'Deja que se te acumulen bloqueos y luego cámbialos con quien tenga menos.',
      'Cámbialos con alguien a punto de ser atacado para hacer el máximo daño.',
      'Tus bloqueos revelados son públicos, así que responde con cuidado tras un cambio.',
      'El cambio reinicia tu peligro; úsalo la ronda antes de quedar fuera.',
    ],
    counter: 'Mantén pocos bloqueos hasta que el Bufón haya usado su cambio.',
  },
};

export default g;
