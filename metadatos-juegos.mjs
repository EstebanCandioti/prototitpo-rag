// Revisión manual de corpus/reglas_fournier.txt (sección Baraja de cartas).
// Describe la variante documentada, no todas las variantes posibles del juego.
// Las barajas catalanas y de poker español no se equiparan automáticamente.
const espanola = ['La Brisca', 'El Chinchón', 'El Envite canario', 'La Escoba',
  'El Guiñote', 'El Julepe', 'El Mus', 'La Pocha', 'El Pumba', 'Los Seises',
  'El Tomate', 'Tresillo', 'El Truc', 'El Truco', 'Tute'];
const inglesaFrancesa = ['El Belote', 'La Canasta', 'Gin Rummy', 'El Pináculo',
  'Poker', 'Punto banca', 'Samba', 'Texas Hold’em'];
const generales = {
  'La Butifarra': 'El corpus especifica cartas catalanas de 48 cartas.',
  'La Manilla': 'El corpus especifica cartas catalanas de 48 cartas.',
  'Continental': 'Admite poker español o inglés; requiere confirmar la variante.',
  'Remigio': 'El corpus especifica poker español de 52 cartas; categoría pendiente de confirmar.',
};
export function metadatoJuego(juego) {
  const baraja = espanola.includes(juego) ? 'espanola'
    : inglesaFrancesa.includes(juego) ? 'inglesa-francesa' : 'general';
  return {
    baraja,
    nota: generales[juego] ?? (baraja === 'general'
      ? 'Sin clasificación revisada; se usa el reemplazo general.'
      : 'Clasificación de la variante documentada en el corpus local.'),
  };
}
