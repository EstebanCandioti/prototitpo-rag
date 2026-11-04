export function agrupar(lista, tamano) {
  if (tamano < 1) throw new Error("el tamaño del grupo tiene que ser al menos 1");
  const grupos = [];

  for (let i = 0; i < lista.length; i += tamano) {
    grupos.push(lista.slice(i, i + tamano));   // slice no se pasa del final
  }

  return grupos;
}