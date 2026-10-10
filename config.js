/*
 * Configuración del sitio.
 * Pega aquí la URL de tu aplicación web de Google Apps Script (termina en /exec).
 * Si la dejas vacía, los juegos quedan abiertos sin aprobación.
 */
window.MUDAS_CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbySCwd1IaT4e1JeIB5rt55pUWnHgdwbY-CUMfQgxBI1ILxa3aLqrItnW_S5x4xFqJLU/exec",
  // Cada cuántos segundos revisa el juego si ya fue aprobado el estudiante.
  CONSULTA_SEGUNDOS: 10
};
