(function () {
    "use strict";

    /* =========================================================
       CONFIGURACIÓN DEL NIVEL 4 — LA QUEMAZÓN DEL PAJONAL
       Novedad única: PAJONAL EN LLAMAS. Cada cierto tiempo aparece
       humo en algunas casillas; el turno siguiente esas casillas
       arden y queman a TODA unidad que esté encima (jugador o
       enemigos). Los enemigos esquivan el humo al avanzar.
       ========================================================= */

    const CONFIG = {
        columnas: 10,
        filas: 6,

        jugador: { vidaMax: 70, danoMin: 8, danoMax: 14, defensa: 3 },

        federal: {
            nombre: "Federal", letra: "F",
            vidaMax: 22, danoMin: 4, danoMax: 8, defensa: 1,
            movimiento: 1, deteccion: 4, bonusCarga: 0
        },

        montonero: {
            nombre: "Montonero", letra: "M",
            vidaMax: 18, danoMin: 5, danoMax: 9, defensa: 0,
            movimiento: 2, deteccion: 99, bonusCarga: 3
        },

        /* Rocas [x, y] */
        rocas: [[3, 1], [3, 4], [6, 2], [6, 3]],

        /* NUEVO — Pajonal en llamas:
           intervalo = cada cuántos turnos se levanta humo,
           casillas  = cuántas casillas se marcan,
           dano      = daño fijo del fuego (ignora defensa) */
        fuego: { intervalo: 2, casillas: 4, dano: 9, duracionMs: 650 },

        enemigosIniciales: ["federal", "federal", "montonero"],

        /* Oleadas de refuerzos (turno en que llegan) */
        oleadas: [
            { turno: 5, tipos: ["federal"] },
            { turno: 9, tipos: ["federal", "montonero"] }
        ],

        probabilidadCritico: 0.15,
        multiplicadorCritico: 1.5,

        pausaCortaMs: 100,
        pausaLargaMs: 250,
        pausaAvisoTurnoMs: 600,
        pausaMovimientoMs: 280
    };

    const ARMAS = {
        facon:     { nombre: "Facón",      danoExtra: 2, alcance: 1, usos: Infinity },
        boleadora: { nombre: "Boleadoras", danoExtra: 4, alcance: 2, usos: 3 },
        carabina:  { nombre: "Carabina",   danoExtra: 6, alcance: 3, usos: 4 }
    };

    const IDS_ARMAS = {
        facon: "armaFacon",
        boleadora: "armaBoleadora",
        carabina: "armaCarabina"
    };

    const DIRS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

    const estado = {
        jugador: null,
        enemigos: [],
        turno: 1,
        fase: "jugador",
        terminado: false,
        aparecidos: 0,
        totalPrevisto: 0,
        armaActual: "facon",
        usos: {},
        rocas: new Set(),
        humo: new Set()
    };

    const el = {};
    let idCorrelativo = 0;

    /* =========================================================
       UTILIDADES
       ========================================================= */

    function generarId(p) { idCorrelativo++; return p + "-" + idCorrelativo; }
    function distancia(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
    function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function dentro(x, y) { return x >= 0 && x < CONFIG.columnas && y >= 0 && y < CONFIG.filas; }
    function esRoca(x, y) { return estado.rocas.has(x + "," + y); }

    function unidadEn(x, y) {
        const j = estado.jugador;
        if (j && j.vida > 0 && j.x === x && j.y === y) return j;
        return estado.enemigos.find(function (e) { return e.vida > 0 && e.x === x && e.y === y; }) || null;
    }

    /* Casilla transitable: dentro del mapa, sin roca y sin unidad */
    function celdaLibre(x, y) { return dentro(x, y) && !esRoca(x, y) && !unidadEn(x, y); }

    /* NUEVO: línea de tiro. Una roca en el trayecto la bloquea. */
    function lineaDespejada(a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const n = Math.max(Math.abs(dx), Math.abs(dy));
        for (let i = 1; i < n; i++) {
            const x = Math.round(a.x + dx * i / n);
            const y = Math.round(a.y + dy * i / n);
            if (esRoca(x, y)) return false;
        }
        return true;
    }

    function puedeAtacar(enemigo) {
        const arma = ARMAS[estado.armaActual];
        const d = distancia(estado.jugador, enemigo);
        return d > 0 && d <= arma.alcance && lineaDespejada(estado.jugador, enemigo);
    }

    function filaLibreEnColumna(col) {
        const libres = [];
        for (let y = 0; y < CONFIG.filas; y++) if (celdaLibre(col, y) && !estado.humo.has(col + "," + y)) libres.push(y);
        return libres.length ? libres[rnd(0, libres.length - 1)] : null;
    }

    /* =========================================================
       CREACIÓN DE UNIDADES
       ========================================================= */

    function crearJugador(x, y) {
        const c = CONFIG.jugador;
        return {
            id: generarId("unitario"), tipo: "unitario", nombre: "Unitario",
            x: x, y: y, vida: c.vidaMax, vidaMax: c.vidaMax,
            danoMin: c.danoMin, danoMax: c.danoMax, defensa: c.defensa
        };
    }

    function crearEnemigo(tipo, x, y) {
        const c = CONFIG[tipo];
        return {
            id: generarId(tipo), tipo: tipo, nombre: c.nombre, letra: c.letra,
            x: x, y: y, vida: c.vidaMax, vidaMax: c.vidaMax,
            danoMin: c.danoMin, danoMax: c.danoMax, defensa: c.defensa,
            movimiento: c.movimiento, deteccion: c.deteccion, bonusCarga: c.bonusCarga,
            cargando: false
        };
    }

    function aparecerEnemigo(tipo) {
        const fila = filaLibreEnColumna(CONFIG.columnas - 1);
        if (fila === null) return false;
        estado.enemigos.push(crearEnemigo(tipo, CONFIG.columnas - 1, fila));
        estado.aparecidos++;
        return true;
    }

    /* =========================================================
       TABLERO Y RENDER
       ========================================================= */

    function construirTablero() {
        const t = el.tablero;
        t.innerHTML = "";
        t.style.setProperty("--columnas", CONFIG.columnas);
        t.style.setProperty("--filas", CONFIG.filas);
        for (let y = 0; y < CONFIG.filas; y++) {
            for (let x = 0; x < CONFIG.columnas; x++) {
                const c = document.createElement("button");
                c.type = "button";
                c.className = "celda-tablero";
                c.dataset.x = x;
                c.dataset.y = y;
                if (esRoca(x, y)) {
                    c.classList.add("celda--roca");
                    c.innerHTML = '<span class="roca"></span>';
                    c.setAttribute("aria-label", "Roca");
                }
                c.addEventListener("click", function () { manejarClick(x, y); });
                t.appendChild(c);
            }
        }
    }

    function obtenerCelda(x, y) {
        return el.tablero.querySelector('.celda-tablero[data-x="' + x + '"][data-y="' + y + '"]');
    }

    function htmlUnidad(u) {
        const pct = Math.max(0, Math.round(u.vida / u.vidaMax * 100));
        const figura = u.tipo === "unitario"
            ? '<img src="../RECURSOS GRAFICOS/Imgunitario.png" alt="Unitario">'
            : u.letra;
        const clases = u.tipo === "unitario"
            ? "unidad unidad--unitario"
            : "unidad unidad--federal unidad--" + u.tipo + (u.cargando ? " unidad--carga" : "");
        return '<div class="' + clases + '" data-id="' + u.id + '">' +
            '<div class="unidad__figura">' + figura + '</div>' +
            '<div class="unidad__mini-vida"><div class="unidad__mini-vida-relleno" style="width:' + pct + '%"></div></div>' +
            '</div>';
    }

    function renderUnidades() {
        el.tablero.querySelectorAll(".unidad").forEach(function (n) { n.remove(); });
        const todas = [estado.jugador].concat(estado.enemigos);
        todas.forEach(function (u) {
            if (!u || u.vida <= 0) return;
            const c = obtenerCelda(u.x, u.y);
            if (c) c.insertAdjacentHTML("beforeend", htmlUnidad(u));
        });
        actualizarBarraJugador();
        pintarHumo();
        if (estado.fase === "jugador" && !estado.terminado) pintarDisponibles();
        else limpiarResaltados();
        el.tablero.classList.toggle("tablero--bloqueado", estado.fase !== "jugador");
    }

    /* NUEVO: marca visualmente las casillas con humo */
    function pintarHumo() {
        el.tablero.querySelectorAll(".celda--humo").forEach(function (c) { c.classList.remove("celda--humo"); });
        estado.humo.forEach(function (k) {
            const p = k.split(",");
            const c = obtenerCelda(+p[0], +p[1]);
            if (c) c.classList.add("celda--humo");
        });
    }

    function limpiarResaltados() {
        el.tablero.querySelectorAll(".celda-tablero").forEach(function (c) {
            c.classList.remove("celda--movimiento", "celda--ataque", "celda--bloqueado");
        });
    }

    function pintarDisponibles() {
        limpiarResaltados();
        const j = estado.jugador;
        DIRS.forEach(function (d) {
            const x = j.x + d.x, y = j.y + d.y;
            if (celdaLibre(x, y)) obtenerCelda(x, y).classList.add("celda--movimiento");
        });
        const arma = ARMAS[estado.armaActual];
        estado.enemigos.forEach(function (e) {
            if (e.vida <= 0) return;
            const d = distancia(j, e);
            if (d > arma.alcance) return;
            obtenerCelda(e.x, e.y).classList.add(lineaDespejada(j, e) ? "celda--ataque" : "celda--bloqueado");
        });
    }

    function actualizarBarraJugador() {
        const j = estado.jugador;
        el.vidaRelleno.style.width = Math.max(0, j.vida / j.vidaMax * 100) + "%";
        el.vidaTexto.textContent = Math.max(0, j.vida) + " / " + j.vidaMax;
    }

    function actualizarHud() {
        el.hudContador.textContent = "Turno " + estado.turno;
        const federal = estado.fase === "federal";
        el.hudTurno.className = "hud__turno " + (federal ? "hud__turno--federal" : "hud__turno--jugador");
        el.hudTurno.textContent = estado.fase === "fin" ? "Fin del combate"
            : federal ? "Turno enemigo" : "Turno del jugador";
    }

    async function mostrarAviso(texto, clase) {
        el.aviso.textContent = texto;
        el.aviso.className = "aviso-turno aviso-turno--visible aviso-turno--" + clase;
        await esperar(CONFIG.pausaAvisoTurnoMs);
        el.aviso.className = "aviso-turno";
        await esperar(180);
    }

    function registrar(texto, tipo) {
        const li = document.createElement("li");
        li.textContent = texto;
        if (tipo) li.className = "registro__" + tipo;
        el.registro.appendChild(li);
        while (el.registro.children.length > 60) el.registro.removeChild(el.registro.firstChild);
        el.registro.scrollTop = el.registro.scrollHeight;
    }

    function animarGolpe(id) {
        const n = el.tablero.querySelector('[data-id="' + id + '"]');
        if (!n) return;
        n.classList.add("unidad--golpeada");
        setTimeout(function () { n.classList.remove("unidad--golpeada"); }, 300);
    }

    async function animarCaida(id) {
        const n = el.tablero.querySelector('[data-id="' + id + '"]');
        if (n) n.classList.add("unidad--caida");
        await esperar(350);
        renderUnidades();
    }

    /* =========================================================
       ARMAS
       ========================================================= */

    function actualizarArmasVisual() {
        Object.keys(IDS_ARMAS).forEach(function (k) {
            const b = document.getElementById(IDS_ARMAS[k]);
            const activa = k === estado.armaActual;
            b.classList.toggle("arma--activa", activa);
            b.classList.toggle("arma--agotada", estado.usos[k] <= 0);
            b.setAttribute("aria-pressed", activa ? "true" : "false");
        });
        const n = estado.usos.boleadora, m = estado.usos.carabina;
        document.getElementById("usosBoleadora").textContent = n + (n === 1 ? " uso" : " usos");
        document.getElementById("usosCarabina").textContent = m + (m === 1 ? " disparo" : " disparos");
        el.statArma.textContent = ARMAS[estado.armaActual].nombre;
    }

    function seleccionarArma(k) {
        if (estado.fase !== "jugador" || estado.terminado) return;
        if (estado.usos[k] <= 0) {
            registrar("No quedan usos de " + ARMAS[k].nombre + ".", "federal");
            return;
        }
        estado.armaActual = k;
        actualizarArmasVisual();
        pintarDisponibles();
    }

    /* =========================================================
       TURNO DEL JUGADOR
       ========================================================= */

    function manejarClick(x, y) {
        if (estado.fase !== "jugador" || estado.terminado) return;
        if (esRoca(x, y)) { registrar("Una roca bloquea el paso.", "federal"); return; }
        const u = unidadEn(x, y);
        if (u && u.tipo !== "unitario") { atacarEnemigo(u); return; }
        if (!u) moverJugador(x, y);
    }

    async function moverJugador(x, y) {
        if (distancia(estado.jugador, { x: x, y: y }) !== 1) {
            registrar("El Unitario solo puede moverse una casilla.", "federal");
            return;
        }
        estado.fase = "espera";
        estado.jugador.x = x;
        estado.jugador.y = y;
        renderUnidades();
        registrar("El Unitario avanzó.", "unitario");
        await esperar(CONFIG.pausaMovimientoMs);
        turnoEnemigo();
    }

    async function atacarEnemigo(e) {
        const arma = ARMAS[estado.armaActual];
        const d = distancia(estado.jugador, e);
        if (d > arma.alcance) {
            registrar(e.nombre + " fuera del alcance de " + arma.nombre + ".", "federal");
            return;
        }
        if (!lineaDespejada(estado.jugador, e)) {
            registrar("Una roca bloquea el tiro de " + arma.nombre + ".", "federal");
            return;
        }
        if (estado.usos[estado.armaActual] <= 0) {
            seleccionarArma("facon");
            return;
        }

        estado.fase = "espera";
        let dano = rnd(estado.jugador.danoMin, estado.jugador.danoMax) + arma.danoExtra;
        const critico = Math.random() < CONFIG.probabilidadCritico;
        if (critico) dano = Math.round(dano * CONFIG.multiplicadorCritico);
        dano = Math.max(1, dano - e.defensa);
        e.vida = Math.max(0, e.vida - dano);
        if (estado.usos[estado.armaActual] !== Infinity) estado.usos[estado.armaActual]--;

        registrar("El Unitario atacó a un " + e.nombre + " con " + arma.nombre + " e hizo " + dano +
            " de daño" + (critico ? " (CRÍTICO)" : "") + ".", "unitario");
        actualizarArmasVisual();
        renderUnidades();
        animarGolpe(e.id);
        await esperar(CONFIG.pausaCortaMs);

        if (e.vida <= 0) {
            registrar("Un " + e.nombre + " fue derrotado.", "unitario");
            await animarCaida(e.id);
            await esperar(CONFIG.pausaLargaMs);
            if (estado.aparecidos >= estado.totalPrevisto &&
                estado.enemigos.every(function (n) { return n.vida <= 0; })) {
                finalizar(true);
                return;
            }
        }
        if (estado.usos[estado.armaActual] <= 0) estado.armaActual = "facon";
        actualizarArmasVisual();
        turnoEnemigo();
    }

    /* =========================================================
       TURNO ENEMIGO
       ========================================================= */

    /* Camino más corto (esquivando rocas y unidades) hasta una casilla pegada al jugador */
    function caminoHaciaJugador(e) {
        const j = estado.jugador;
        const key = function (x, y) { return x + "," + y; };
        const prev = new Map([[key(e.x, e.y), null]]);
        const cola = [{ x: e.x, y: e.y }];
        let meta = null;
        while (cola.length) {
            const c = cola.shift();
            if (distancia(c, j) === 1) { meta = c; break; }
            for (let i = 0; i < DIRS.length; i++) {
                const nx = c.x + DIRS[i].x, ny = c.y + DIRS[i].y, k = key(nx, ny);
                if (prev.has(k) || !celdaLibre(nx, ny) || estado.humo.has(k)) continue;
                prev.set(k, c);
                cola.push({ x: nx, y: ny });
            }
        }
        if (!meta) return [];
        const ruta = [];
        let c = meta;
        while (c && !(c.x === e.x && c.y === e.y)) { ruta.unshift(c); c = prev.get(key(c.x, c.y)); }
        return ruta;
    }

    function pasoAleatorio(e) {
        const opciones = DIRS.map(function (d) { return { x: e.x + d.x, y: e.y + d.y }; })
            .filter(function (p) { return celdaLibre(p.x, p.y) && !estado.humo.has(p.x + "," + p.y); });
        return opciones.length ? [opciones[rnd(0, opciones.length - 1)]] : [];
    }

    async function turnoEnemigo() {
        if (estado.terminado) return;
        estado.fase = "federal";
        actualizarHud();
        renderUnidades();
        await mostrarAviso("Turno enemigo", "federal");

        const lista = estado.enemigos.slice();
        for (let i = 0; i < lista.length; i++) {
            const e = lista[i];
            if (e.vida <= 0 || estado.terminado) continue;
            let movidos = 0;

            if (distancia(e, estado.jugador) > 1) {
                let ruta = distancia(e, estado.jugador) <= e.deteccion ? caminoHaciaJugador(e) : pasoAleatorio(e);
                if (!ruta.length) ruta = pasoAleatorio(e);
                ruta = ruta.slice(0, e.movimiento);
                for (let p = 0; p < ruta.length; p++) {
                    e.x = ruta[p].x; e.y = ruta[p].y; movidos++;
                    e.cargando = e.bonusCarga > 0 && movidos >= 2;
                    renderUnidades();
                    await esperar(CONFIG.pausaMovimientoMs * 0.7);
                }
            }

            if (distancia(e, estado.jugador) === 1) {
                await atacarJugador(e, movidos);
                if (estado.terminado) return;
            }
            e.cargando = false;
        }

        estado.turno++;
        await resolverIncendio();
        if (estado.terminado) return;
        await generarHumo();
        await aparecerRefuerzos();
        estado.fase = "jugador";
        actualizarHud();
        renderUnidades();
    }

    async function atacarJugador(e, movidos) {
        const carga = e.bonusCarga > 0 && movidos >= 2;
        let dano = rnd(e.danoMin, e.danoMax) + (carga ? e.bonusCarga : 0);
        dano = Math.max(1, dano - estado.jugador.defensa);
        estado.jugador.vida = Math.max(0, estado.jugador.vida - dano);
        renderUnidades();
        animarGolpe(estado.jugador.id);
        registrar((carga ? "¡Un Montonero cargó contra el Unitario! " : "Un " + e.nombre + " atacó al Unitario. ") +
            "Daño: " + dano + ".", "federal");
        await esperar(CONFIG.pausaLargaMs);
        if (estado.jugador.vida <= 0) finalizar(false);
    }

    /* ---------- NUEVO: PAJONAL EN LLAMAS ---------- */

    function todosDerrotados() {
        return estado.aparecidos >= estado.totalPrevisto &&
            estado.enemigos.every(function (n) { return n.vida <= 0; });
    }

    /* Las casillas con humo arden y dañan a quien esté encima */
    async function resolverIncendio() {
        if (!estado.humo.size) return;
        const F = CONFIG.fuego;
        const ardiendo = Array.from(estado.humo);
        estado.humo = new Set();
        pintarHumo();

        ardiendo.forEach(function (k) {
            const p = k.split(",");
            const c = obtenerCelda(+p[0], +p[1]);
            if (c) c.classList.add("celda--fuego");
        });
        registrar("¡El pajonal arde!", "federal");
        await esperar(F.duracionMs);

        ardiendo.forEach(function (k) {
            const p = k.split(",");
            const u = unidadEn(+p[0], +p[1]);
            if (!u) return;
            u.vida = Math.max(0, u.vida - F.dano);
            if (u.tipo === "unitario") registrar("El fuego quema al Unitario: -" + F.dano + " de vida.", "federal");
            else registrar("El fuego quema a un " + u.nombre + ": -" + F.dano + " de vida.", "unitario");
        });

        el.tablero.querySelectorAll(".celda--fuego").forEach(function (c) { c.classList.remove("celda--fuego"); });
        renderUnidades();
        await esperar(CONFIG.pausaLargaMs);

        if (estado.jugador.vida <= 0) { finalizar(false); return; }
        if (todosDerrotados()) { finalizar(true); }
    }

    /* Marca nuevas casillas con humo (avisan: arderán el próximo turno) */
    async function generarHumo() {
        const F = CONFIG.fuego;
        if (estado.turno % F.intervalo !== 0) return;
        const candidatas = [];
        for (let y = 0; y < CONFIG.filas; y++) {
            for (let x = 0; x < CONFIG.columnas; x++) {
                if (!esRoca(x, y)) candidatas.push(x + "," + y);
            }
        }
        for (let i = 0; i < F.casillas && candidatas.length; i++) {
            const idx = rnd(0, candidatas.length - 1);
            estado.humo.add(candidatas.splice(idx, 1)[0]);
        }
        registrar("Se levanta humo en el pajonal: esas casillas arderán el próximo turno.", null);
        renderUnidades();
        await mostrarAviso("¡Humo en el pajonal!", "federal");
    }

    async function aparecerRefuerzos() {
        const o = CONFIG.oleadas.find(function (w) { return w.turno === estado.turno; });
        if (!o) return;
        let alguno = false;
        o.tipos.forEach(function (t) { if (aparecerEnemigo(t)) alguno = true; });
        if (!alguno) return;
        registrar("Llegaron refuerzos enemigos.", "federal");
        renderUnidades();
        await mostrarAviso("Llegaron refuerzos", "federal");
    }

    /* =========================================================
       FIN Y ARRANQUE
       ========================================================= */

    function finalizar(gano) {
        estado.terminado = true;
        estado.fase = "fin";
        actualizarHud();
        renderUnidades();
        const b = el.banner;
        b.hidden = false;
        b.className = "banner-resultado" + (gano ? "" : " banner-resultado--derrota");
        b.innerHTML = (gano ? "¡Victoria en el Pajonal!" : "Unidad caída. El combate terminó.") +
            '<button type="button" id="btnReintentar">REINTENTAR</button>';
        document.getElementById("btnReintentar").addEventListener("click", iniciarPartida);
        registrar(gano ? "¡Victoria! Sobreviviste a la quemazón del pajonal." : "Derrota. El Unitario fue vencido.", null);
    }

    function iniciarPartida() {
        el.tablero = document.getElementById("tablero");
        el.registro = document.getElementById("registro");
        el.hudTurno = document.getElementById("hudTurno");
        el.hudContador = document.getElementById("hudContador");
        el.vidaRelleno = document.getElementById("vidaJugadorRelleno");
        el.vidaTexto = document.getElementById("vidaJugadorTexto");
        el.banner = document.getElementById("bannerResultado");
        el.aviso = document.getElementById("avisoTurno");
        el.statArma = document.getElementById("statArmaJugador");

        estado.rocas = new Set(CONFIG.rocas.map(function (r) { return r[0] + "," + r[1]; }));
        estado.humo = new Set();
        estado.jugador = crearJugador(0, Math.floor(CONFIG.filas / 2));
        estado.enemigos = [];
        estado.turno = 1;
        estado.fase = "jugador";
        estado.terminado = false;
        estado.aparecidos = 0;
        estado.totalPrevisto = CONFIG.enemigosIniciales.length +
            CONFIG.oleadas.reduce(function (s, o) { return s + o.tipos.length; }, 0);
        estado.armaActual = "facon";
        estado.usos = { facon: Infinity, boleadora: ARMAS.boleadora.usos, carabina: ARMAS.carabina.usos };

        el.registro.innerHTML = "";
        el.banner.hidden = true;
        el.aviso.className = "aviso-turno";

        document.getElementById("statDanoJugador").textContent = CONFIG.jugador.danoMin + " – " + CONFIG.jugador.danoMax;
        document.getElementById("statDefensaJugador").textContent = CONFIG.jugador.defensa;

        construirTablero();
        CONFIG.enemigosIniciales.forEach(aparecerEnemigo);
        actualizarArmasVisual();
        actualizarHud();
        renderUnidades();
        registrar("Comienza la batalla. Cuidado: el pajonal se incendia. Salí del humo antes de que arda.", null);
    }

    document.addEventListener("DOMContentLoaded", function () {
        Object.keys(IDS_ARMAS).forEach(function (k) {
            document.getElementById(IDS_ARMAS[k]).addEventListener("click", function () { seleccionarArma(k); });
        });
    });

    window.addEventListener("nivel4:iniciado", iniciarPartida);
})();
