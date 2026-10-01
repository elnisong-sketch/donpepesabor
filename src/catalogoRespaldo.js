/**
 * Copia de seguridad del catálogo, tal como estaba el 01/10/2026.
 *
 * Existe porque un dispositivo con datos antiguos llegó a sobrescribir el catálogo
 * entero en la nube. Desde Inventario se puede volver a este estado con un botón.
 * Los precios y presentaciones son los que había; el stock se deja en 10 (pruebas).
 */

const b = (presentacion, precio) => ({ presentacion, precio, stock: 10, lotes: [], etiqueta: "" });

export const CATALOGO_RESPALDO = [
  { id: "p1",  categoria: "Tequeños",   nombre: "Tequeños Tradicionales",                       variantes: [b("Bandeja 25", 12), b("Bandeja 50", 22)] },
  { id: "p2",  categoria: "Tequeños",   nombre: "Tequeños de Guayaba y Queso",                  variantes: [b("Bandeja 25", 22)] },
  { id: "p3",  categoria: "Tequeños",   nombre: "Tequeños de Salchicha",                        variantes: [b("Bandeja 25", 20)] },
  { id: "p4",  categoria: "Tequeños",   nombre: "Tequeños de Plátano con Queso",                variantes: [b("Bandeja 25", 20)] },
  { id: "p5",  categoria: "Tequeños",   nombre: "Tequeños de Jamón y Queso",                    variantes: [b("Bandeja 25", 22)] },
  { id: "p6",  categoria: "Tequeños",   nombre: "Tequeños de Chocolate",                        variantes: [b("Bandeja 25", 22)] },
  { id: "mub7ld1yuuuwetb22n", categoria: "Tequeños", nombre: "Tequeños Tradicionales con Oregano y Aceite de Oliva", variantes: [b("Bandeja 25", 22)] },
  { id: "p7",  categoria: "Pastelitos", nombre: "Pastelito de Pollo",                           variantes: [b("Bandeja 25", 22)] },
  { id: "p8",  categoria: "Pastelitos", nombre: "Pastelito de Carne Molida",                    variantes: [b("Bandeja 25", 22)] },
  { id: "p9",  categoria: "Pastelitos", nombre: "Pastelito de Carne Mechada",                   variantes: [b("Bandeja 25", 22)] },
  { id: "p10", categoria: "Pastelitos", nombre: "Pastelito de Jamón y Queso",                   variantes: [b("Bandeja 25", 22)] },
  { id: "p11", categoria: "Pastelitos", nombre: "Pastelito de Carne Mechada con Queso Amarillo", variantes: [b("Bandeja 25", 22)] },
  { id: "p12", categoria: "Pastelitos", nombre: "Pastelito de Pollo con Queso Amarillo",        variantes: [b("Bandeja 25", 22)] },
  { id: "p13", categoria: "Empanadas",  nombre: "Empanada de Carne Molida",                     variantes: [b("Bandeja 25", 21)] },
  { id: "p14", categoria: "Empanadas",  nombre: "Empanada de Pollo",                            variantes: [b("Bandeja 25", 21)] },
  { id: "p15", categoria: "Empanadas",  nombre: "Empanada de Carne Mechada",                    variantes: [b("Bandeja 25", 21)] },
  { id: "p16", categoria: "Empanadas",  nombre: "Empanada de Queso",                            variantes: [b("Bandeja 25", 21)] },
  { id: "p17", categoria: "Empanadas",  nombre: "Empanada de Jamón y Queso",                    variantes: [b("Bandeja 25", 21)] },
  { id: "p18", categoria: "Otros",      nombre: "Cachitos",                                     variantes: [b("Bandeja 6", 18)] },
];
