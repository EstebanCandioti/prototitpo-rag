import { embeddingsEnLote, pedidos } from "./api.mjs";

const [a, b] = await embeddingsEnLote(["hola", "chau"]);
console.log("Cantidad de números de cada vector:", a.length, b.length);
console.log("Los primeros cinco de 'hola':", a.slice(0, 5));
console.log("Pedidos:", pedidos);