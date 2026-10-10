/*
 * Control de acceso para los juegos de Mudas Lean.
 * - Si config.js no tiene APPS_SCRIPT_URL, no hace nada (los juegos quedan abiertos).
 * - Si la tiene, bloquea el juego hasta que el administrador apruebe al estudiante.
 * Una aprobación sirve para todos los juegos publicados en el mismo sitio.
 */
(function () {
  "use strict";
  var CFG = window.MUDAS_CONFIG || {};
  var URL_API = (CFG.APPS_SCRIPT_URL || "").trim();
  if (!URL_API) return;

  var JUEGO = document.body.getAttribute("data-juego") || document.title;
  var KEY = "mudas_acceso_v1";
  var POLL_MS = (CFG.CONSULTA_SEGUNDOS || 10) * 1000;
  var pollTimer = null;

  /* ---------- almacenamiento local (puede fallar en modo privado) ---------- */
  function leer() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function guardar(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
  function borrar() { try { localStorage.removeItem(KEY); } catch (e) {} }
  var memoria = leer();
  function nuevoToken() {
    var a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }

  /* ---------- llamadas al servidor ---------- */
  function api(params) {
    var q = Object.keys(params).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]); }).join("&");
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    return fetch(URL_API + (URL_API.indexOf("?") < 0 ? "?" : "&") + q, { method: "GET", redirect: "follow", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) { clearTimeout(t); if (!j || j.ok === false) throw new Error((j && j.error) || "Respuesta inválida"); return j; })
      .catch(function (e) { clearTimeout(t); throw e; });
  }

  /* ---------- interfaz ---------- */
  var css = "" +
    ".mg-wrap{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(9,14,17,.88);overflow:auto;font:15px/1.5 'IBM Plex Sans',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#edf2f3}" +
    ".mg-card{width:100%;max-width:460px;background:#121a1f;border:1px solid #2c3b44;border-radius:12px;padding:24px;display:grid;gap:14px;box-shadow:0 20px 60px rgba(0,0,0,.45)}" +
    ".mg-eye{font:500 .72rem/1 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#f2b705}" +
    ".mg-card h2{margin:0;font:800 1.6rem/1.15 'Bricolage Grotesque',system-ui,sans-serif;text-wrap:balance}" +
    ".mg-card p{margin:0;color:#b6c5cc}" +
    ".mg-card label{display:grid;gap:6px;font-weight:500;color:#edf2f3}" +
    ".mg-card input{font:inherit;padding:10px 12px;border:1.5px solid #2c3b44;border-radius:8px;background:#1b262d;color:#edf2f3;width:100%;box-sizing:border-box}" +
    ".mg-card input:focus{outline:3px solid #f2b705;outline-offset:1px}" +
    ".mg-row{display:flex;flex-wrap:wrap;gap:8px}" +
    ".mg-btn{font:600 15px/1 inherit;font-family:inherit;border:0;border-radius:8px;padding:12px 18px;cursor:pointer;background:#f2b705;color:#1a1400}" +
    ".mg-btn[disabled]{opacity:.5;cursor:wait}" +
    ".mg-btn.mg-ghost{background:transparent;color:#edf2f3;border:1.5px solid #2c3b44}" +
    ".mg-btn:focus-visible{outline:3px solid #f2b705;outline-offset:2px}" +
    ".mg-state{display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:8px;background:#1b262d;font-weight:600}" +
    ".mg-dot{width:10px;height:10px;border-radius:50%;flex:none;background:#f2b705}" +
    ".mg-state.ok .mg-dot{background:#4cc77a}.mg-state.bad .mg-dot{background:#ef6a5e}" +
    "@media (prefers-reduced-motion:no-preference){.mg-state.wait .mg-dot{animation:mgp 1.2s ease-in-out infinite}}" +
    "@keyframes mgp{50%{opacity:.25}}" +
    ".mg-err{color:#ef6a5e!important;font-size:.92rem}" +
    ".mg-small{font-size:.85rem}" +
    ".mg-link{background:none;border:0;padding:0;color:#9fb0b8;text-decoration:underline;cursor:pointer;font:inherit;font-size:.85rem}";
  var style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);
  var wrap = document.createElement("div"); wrap.className = "mg-wrap"; wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true");
  document.body.appendChild(wrap);
  // bloquea el teclado del juego mientras la puerta está cerrada
  function bloqueaTeclas(e) { if (!wrap.contains(e.target)) { e.stopPropagation(); e.preventDefault(); } }
  window.addEventListener("keydown", bloqueaTeclas, true);
  window.addEventListener("keyup", bloqueaTeclas, true);

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function pinta(html) { wrap.innerHTML = '<div class="mg-card">' + html + "</div>"; }
  function para() { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } }

  function vistaFormulario(msgError) {
    para();
    var m = memoria || {};
    pinta(
      '<p class="mg-eye">Acceso con aprobación del docente</p>' +
      "<h2>Solicita tu ingreso</h2>" +
      "<p>Escribe tu nombre como aparece en la lista del curso. El docente recibirá tu solicitud y, cuando la apruebe, el juego se abrirá en esta misma pantalla.</p>" +
      '<form id="mgForm" class="mg-card" style="padding:0;border:0;box-shadow:none;background:none">' +
      '<label for="mgNombre">Nombre completo<input id="mgNombre" name="nombre" required minlength="3" maxlength="80" autocomplete="name" value="' + esc(m.nombre) + '" placeholder="Ej.: Valentina Ruiz Gómez"></label>' +
      '<label for="mgIdent">Código o documento (opcional)<input id="mgIdent" name="ident" maxlength="40" value="' + esc(m.ident) + '" placeholder="Ej.: 1023456789"></label>' +
      (msgError ? '<p class="mg-err" role="alert">' + esc(msgError) + "</p>" : "") +
      '<div class="mg-row"><button class="mg-btn" id="mgEnviar" type="submit">Solicitar acceso</button></div>' +
      "</form>" +
      '<p class="mg-small">Tu nombre y código se guardan solo en la hoja del docente.</p>'
    );
    var f = document.getElementById("mgForm");
    document.getElementById("mgNombre").focus();
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var nombre = document.getElementById("mgNombre").value.replace(/\s+/g, " ").trim();
      var ident = document.getElementById("mgIdent").value.replace(/\s+/g, " ").trim();
      if (nombre.length < 3) { vistaFormulario("Escribe tu nombre completo (mínimo 3 letras)."); return; }
      var btn = document.getElementById("mgEnviar"); btn.disabled = true; btn.textContent = "Enviando…";
      var token = nuevoToken();
      api({ accion: "solicitar", token: token, nombre: nombre, ident: ident, juego: JUEGO })
        .then(function (j) {
          memoria = { token: token, nombre: j.nombre || nombre, ident: ident };
          guardar(memoria);
          decide(j.estado, j.nombre || nombre);
        })
        .catch(function () { memoria = { nombre: nombre, ident: ident }; vistaFormulario("No se pudo enviar la solicitud. Revisa tu conexión a internet e inténtalo de nuevo."); });
    });
  }

  function vistaEspera(nombre, nota) {
    pinta(
      '<p class="mg-eye">Solicitud enviada</p>' +
      "<h2>Esperando aprobación</h2>" +
      '<div class="mg-state wait"><span class="mg-dot"></span>Pendiente: ' + esc(nombre) + "</div>" +
      "<p>El docente ya recibió tu solicitud. No cierres esta página: el juego se abrirá solo cuando te aprueben.</p>" +
      (nota ? '<p class="mg-err">' + esc(nota) + "</p>" : "") +
      '<div class="mg-row"><button class="mg-btn mg-ghost" id="mgRevisar" type="button">Revisar ahora</button></div>' +
      '<button class="mg-link" id="mgOtro" type="button">¿No eres ' + esc(nombre) + "? Cambiar de estudiante</button>"
    );
    document.getElementById("mgRevisar").onclick = function () { this.disabled = true; consulta(true); };
    document.getElementById("mgOtro").onclick = cambiar;
    para(); pollTimer = setTimeout(function () { consulta(false); }, POLL_MS);
  }

  function vistaRechazo(nombre) {
    para();
    pinta(
      '<p class="mg-eye">Acceso no aprobado</p>' +
      "<h2>Tu solicitud fue rechazada</h2>" +
      '<div class="mg-state bad"><span class="mg-dot"></span>' + esc(nombre) + "</div>" +
      "<p>Si crees que es un error, habla con el docente. Puedes enviar una nueva solicitud.</p>" +
      '<div class="mg-row"><button class="mg-btn" id="mgNueva" type="button">Enviar nueva solicitud</button></div>'
    );
    document.getElementById("mgNueva").onclick = function () { memoria = { nombre: nombre, ident: (memoria || {}).ident }; guardar(memoria); vistaFormulario(); };
  }

  function vistaCargando(txt) { pinta('<p class="mg-eye">Acceso con aprobación del docente</p><h2>' + esc(txt) + '</h2><div class="mg-state wait"><span class="mg-dot"></span>Conectando…</div>'); }

  function vistaSinConexion(nombre) {
    para();
    pinta(
      '<p class="mg-eye">Sin conexión</p><h2>No pudimos verificar tu acceso</h2>' +
      "<p>Revisa tu conexión a internet y vuelve a intentarlo.</p>" +
      '<div class="mg-row"><button class="mg-btn" id="mgReint" type="button">Reintentar</button></div>' +
      '<button class="mg-link" id="mgOtro" type="button">Cambiar de estudiante' + (nombre ? " (" + esc(nombre) + ")" : "") + "</button>"
    );
    document.getElementById("mgReint").onclick = function () { inicia(); };
    document.getElementById("mgOtro").onclick = cambiar;
  }

  function cambiar() { para(); borrar(); memoria = null; vistaFormulario(); }

  function abrir(nombre) {
    para();
    window.GATE_NAME = nombre;
    window.removeEventListener("keydown", bloqueaTeclas, true);
    window.removeEventListener("keyup", bloqueaTeclas, true);
    wrap.remove();
    try { if (typeof window.onGateApproved === "function") window.onGateApproved(nombre); } catch (e) {}
  }

  function decide(estado, nombre) {
    if (estado === "Aprobado") abrir(nombre);
    else if (estado === "Rechazado") vistaRechazo(nombre);
    else if (estado === "Pendiente") vistaEspera(nombre);
    else { memoria = { nombre: nombre, ident: (memoria || {}).ident }; guardar(memoria); vistaFormulario("No encontramos tu solicitud. Envíala de nuevo."); }
  }

  var fallos = 0;
  function consulta(manual) {
    if (!memoria || !memoria.token) { vistaFormulario(); return; }
    api({ accion: "estado", token: memoria.token })
      .then(function (j) { fallos = 0; if (j.nombre && j.nombre !== memoria.nombre) { memoria.nombre = j.nombre; guardar(memoria); } decide(j.estado, memoria.nombre); })
      .catch(function () {
        fallos++;
        if (fallos >= 3 || manual) vistaEspera(memoria.nombre, "Sin conexión con el servidor. Se volverá a intentar en unos segundos.");
        else vistaEspera(memoria.nombre);
      });
  }

  function inicia() {
    if (memoria && memoria.token) {
      vistaCargando("Verificando tu acceso");
      api({ accion: "estado", token: memoria.token })
        .then(function (j) { decide(j.estado, j.nombre || memoria.nombre); })
        .catch(function () { vistaSinConexion(memoria.nombre); });
    } else vistaFormulario();
  }
  inicia();
})();
