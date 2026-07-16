// Detecta señales de urgencia/dolor para escalar a humano con prioridad.
const DISTRESS = /(fallec[ií]o|muri[oó]|no quiero vivir|suicid|emergencia|ayuda urgente)/i;

export function detectDistress(text: string): boolean {
  return DISTRESS.test(text);
}
