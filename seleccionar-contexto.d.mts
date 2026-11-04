import type { PlanContexto, Recuperacion, SeleccionContexto, Fuente, Fragmento, AlcanceConsulta } from './frontend/src/types';
export const limitesContexto: Readonly<{ candidatos: number; fragmentos: number; caracteres: number }>;
export function clasificarConsulta(pregunta: string, juego: string): AlcanceConsulta;
export function construirPlanContexto(datos: { pregunta: string; juego: string; resultados: Fragmento[]; fragmentos: Fuente[] }): PlanContexto;
export function seleccionarContexto(recuperacion: Recuperacion | null, umbral: number, modo?: 'secciones' | 'fragmentos'): SeleccionContexto;
