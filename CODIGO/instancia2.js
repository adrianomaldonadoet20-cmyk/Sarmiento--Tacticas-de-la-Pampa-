/**
 * ============================================================================
 * INSTANCIA JUGABLE — Sarmiento: Tácticas de la Pampa
 * ----------------------------------------------------------------------------
 * Núcleo funcional del combate táctico (Sprint 3 - "Mecánicas Centrales de
 * Combate"). Este módulo NO incluye pantalla de inicio, puntaje ni resultado
 * final: solo la mecánica jugable aislada, tal como exige la consigna.
 *
 * Contiene:
 *  - Un tablero en grilla donde el jugador controla a un Unitario.
 *  - Enemigos Federales que patrullan el mapa y atacan al detectar al jugador.
 *  - Un sistema de daño con Vida / Daño / Defensa y variación aleatoria.
 *  - Aparición temporal de nuevas amenazas a medida que avanza la partida.
 *
 * El código está organizado en secciones (config, estado, lógica de combate,
 * IA de enemigos, render, entrada del usuario) para favorecer la
 * mantenibilidad y la escalabilidad exigidas en los requerimientos no
 * funcionales del proyecto.
 * ============================================================================
 */

(function () {
    "use strict";

    // ------------------------------------------------------------------
    // 1. CONFIGURACIÓN
    // ------------------------------------------------------------------

    const CONFIG = {
        columnas: 10,
        filas: 6,

        jugador: {
            vidaMax: 40,
            danoMin: 6,
            danoMax: 12,
            defensa: 2,
        },

        // Federales más resistentes y más dañinos que en el Nivel 1.
        federal: {
            vidaMax: 26,
            danoMin: 6,
            danoMax: 11,
            defensa: 2,
        },

        // Más enemigos desde el arranque de la partida.
        enemigosIniciales: 3,

        // Refuerzos más seguidos que en el Nivel 1 (antes: [4, 8]).
        turnosDeAparicion: [3, 5, 7, 9],

        // Detectan al jugador desde más lejos: menos margen para
        // esquivarlos por el mapa.
        radioDeteccion: 4,

        // Golpes certeros más frecuentes y más fuertes.
        probabilidadCritico: 0.22,
        multiplicadorCritico: 1.6,

        // Pausas para que la secuencia de turnos se pueda seguir visualmente.
        pausaCortaMs: 380,
        pausaLargaMs: 550,

        // Cuánto se muestra en pantalla el aviso grande de cambio de turno
        // ("Turno de los Federales" / "Tu turno") antes de que actúen.
        pausaAvisoTurnoMs: 700,
    };


    // ------------------------------------------------------------------
    // 2. ESTADO DEL JUEGO
    // ------------------------------------------------------------------

    /** @type {{jugador: object, enemigos: object[], turno: number, fase: string,
     *          totalAparecidos: number, terminado: boolean, celdaSeleccionable: Set<string>}} */
    const estado = {
        jugador: null,
        enemigos: [],
        turno: 1,
        fase: "jugador", // "jugador" | "enemigos" | "fin"
        totalAparecidos: 0,
        terminado: false,
        celdasResaltadas: new Map(), // "x,y" -> "mover" | "atacar"
    };

    let idCorrelativo = 0;
    function generarId(prefijo) {
        idCorrelativo += 1;
        return `${prefijo}-${idCorrelativo}`;
    }


    // ------------------------------------------------------------------
    // 3. UTILIDADES
    // ------------------------------------------------------------------

    function distanciaManhattan(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    function enteroAleatorio(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function dentroDelTablero(x, y) {
        return x >= 0 && x < CONFIG.columnas && y >= 0 && y < CONFIG.filas;
    }

    function unidadEnCelda(x, y) {
        if (estado.jugador && estado.jugador.x === x && estado.jugador.y === y && estado.jugador.vida > 0) {
            return estado.jugador;
        }
        return estado.enemigos.find((e) => e.x === x && e.y === y && e.vida > 0) || null;
    }

    function celdaLibre(x, y) {
        return dentroDelTablero(x, y) && !unidadEnCelda(x, y);
    }

    function esperar(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }


    // ------------------------------------------------------------------
    // 4. CREACIÓN DE UNIDADES
    // ------------------------------------------------------------------

    function crearJugador(x, y) {
        return {
            id: generarId("unitario"),
            tipo: "unitario",
            nombre: "Unitario",
            x, y,
            vida: CONFIG.jugador.vidaMax,
            vidaMax: CONFIG.jugador.vidaMax,
            danoMin: CONFIG.jugador.danoMin,
            danoMax: CONFIG.jugador.danoMax,
            defensa: CONFIG.jugador.defensa,
        };
    }

    function crearFederal(x, y) {
        return {
            id: generarId("federal"),
            tipo: "federal",
            nombre: "Federal",
            x, y,
            vida: CONFIG.federal.vidaMax,
            vidaMax: CONFIG.federal.vidaMax,
            danoMin: CONFIG.federal.danoMin,
            danoMax: CONFIG.federal.danoMax,
            defensa: CONFIG.federal.defensa,
            esNueva: true,
        };
    }

    function posicionLibreEnColumna(columna) {
        const filasPosibles = [];
        for (let y = 0; y < CONFIG.filas; y += 1) {
            if (celdaLibre(columna, y)) filasPosibles.push(y);
        }
        if (filasPosibles.length === 0) return null;
        return filasPosibles[enteroAleatorio(0, filasPosibles.length - 1)];
    }


    // ------------------------------------------------------------------
    // 5. SISTEMA DE COMBATE (daño / impacto)
    // ------------------------------------------------------------------

    /**
     * Calcula y aplica el daño de un ataque. Devuelve el detalle para poder
     * registrar la acción y animar el resultado.
     */
    function resolverAtaque(atacante, objetivo) {
        const golpeBase = enteroAleatorio(atacante.danoMin, atacante.danoMax);
        const esCritico = Math.random() < CONFIG.probabilidadCritico;
        const golpeConCritico = esCritico ? Math.round(golpeBase * CONFIG.multiplicadorCritico) : golpeBase;
        const danoFinal = Math.max(1, golpeConCritico - objetivo.defensa);

        objetivo.vida = Math.max(0, objetivo.vida - danoFinal);

        return {
            danoFinal,
            esCritico,
            objetivoDerrotado: objetivo.vida === 0,
        };
    }


    // ------------------------------------------------------------------
    // 6. IA DE PATRULLAJE / PERSECUCIÓN DE LOS FEDERALES
    // ------------------------------------------------------------------

    /**
     * Devuelve la próxima celda hacia la que se moverá un Federal:
     * - Si el jugador está adyacente, no se mueve (atacará en su lugar).
     * - Si el jugador está dentro del radio de detección, avanza un paso
     *   reduciendo la distancia (persecución).
     * - Si no, patrulla moviéndose a una celda libre adyacente al azar.
     */
    function calcularMovimientoFederal(federal) {
        const distanciaAlJugador = distanciaManhattan(federal, estado.jugador);

        const direcciones = [
            { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
            { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        ];

        if (distanciaAlJugador <= CONFIG.radioDeteccion) {
            // Perseguir: elegir el movimiento que más reduce la distancia.
            let mejor = null;
            let mejorDistancia = distanciaAlJugador;

            for (const { dx, dy } of direcciones) {
                const nx = federal.x + dx;
                const ny = federal.y + dy;
                if (!celdaLibre(nx, ny)) continue;

                const nuevaDistancia = distanciaManhattan({ x: nx, y: ny }, estado.jugador);
                if (nuevaDistancia < mejorDistancia) {
                    mejorDistancia = nuevaDistancia;
                    mejor = { x: nx, y: ny };
                }
            }
            return mejor; // null si no hay forma de acercarse
        }

        // Patrullaje aleatorio.
        const opciones = direcciones
            .map(({ dx, dy }) => ({ x: federal.x + dx, y: federal.y + dy }))
            .filter(({ x, y }) => celdaLibre(x, y));

        if (opciones.length === 0) return null;
        return opciones[enteroAleatorio(0, opciones.length - 1)];
    }


    // ------------------------------------------------------------------
    // 7. TURNOS
    // ------------------------------------------------------------------

    async function procesarTurnoEnemigos() {
        estado.fase = "enemigos";
        actualizarHud();
        limpiarResaltados();

        // Aviso grande + tablero bloqueado/oscurecido ANTES de que se
        // mueva el primer Federal: así se ve con claridad que terminó
        // el turno del jugador y ahora es el turno del rival, en vez
        // de que las unidades se muevan apenas se hace click (lo que
        // se sentía como un enfrentamiento en tiempo real).
        mostrarAvisoTurno("Turno de los Federales", "federal");
        await esperar(CONFIG.pausaAvisoTurnoMs);

        for (const federal of estado.enemigos) {
            if (federal.vida <= 0 || estado.terminado) continue;

            const distancia = distanciaManhattan(federal, estado.jugador);

            if (distancia === 1) {
                const resultado = resolverAtaque(federal, estado.jugador);
                registrarEvento(
                    `${federal.nombre} ataca al Unitario: -${resultado.danoFinal} HP${resultado.esCritico ? " (¡golpe certero!)" : ""}.`,
                    "federal"
                );
                animarGolpe(estado.jugador.id);
                actualizarBarrasDeVida();

                await esperar(CONFIG.pausaCortaMs);

                if (estado.jugador.vida <= 0) {
                    finalizarPartida(false);
                    return;
                }
            } else {
                const destino = calcularMovimientoFederal(federal);
                if (destino) {
                    federal.x = destino.x;
                    federal.y = destino.y;
                    renderUnidades();
                    await esperar(CONFIG.pausaCortaMs);
                }
            }
        }

        estado.enemigos = estado.enemigos.filter((e) => e.vida > 0);

        if (estado.enemigos.length === 0 && estado.totalAparecidos >= (CONFIG.enemigosIniciales + CONFIG.turnosDeAparicion.length)) {
            finalizarPartida(true);
            return;
        }

        estado.turno += 1;
        gestionarAparicionDeAmenazas();

        estado.fase = "jugador";
        actualizarHud();
        renderUnidades();
        mostrarAvisoTurno("Tu turno", "jugador");
    }

    function gestionarAparicionDeAmenazas() {
        if (!CONFIG.turnosDeAparicion.includes(estado.turno)) return;

        const columna = CONFIG.columnas - 1;
        const fila = posicionLibreEnColumna(columna);
        if (fila === null) return;

        const nuevo = crearFederal(columna, fila);
        estado.enemigos.push(nuevo);
        estado.totalAparecidos += 1;

        registrarEvento(`Un nuevo Federal aparece en el mapa (turno ${estado.turno}).`, "federal");
    }


    // ------------------------------------------------------------------
    // 8. ENTRADA DEL JUGADOR
    // ------------------------------------------------------------------

    function calcularCeldasDisponibles() {
        const disponibles = new Map();
        const { x, y } = estado.jugador;

        const vecinos = [
            { x: x, y: y - 1 }, { x: x, y: y + 1 },
            { x: x - 1, y: y }, { x: x + 1, y: y },
        ];

        for (const v of vecinos) {
            if (!dentroDelTablero(v.x, v.y)) continue;

            const ocupante = unidadEnCelda(v.x, v.y);
            if (!ocupante) {
                disponibles.set(`${v.x},${v.y}`, "mover");
            } else if (ocupante.tipo === "federal") {
                disponibles.set(`${v.x},${v.y}`, "atacar");
            }
        }

        return disponibles;
    }

    async function manejarClickCelda(x, y) {
        if (estado.terminado || estado.fase !== "jugador") return;

        const clave = `${x},${y}`;
        const accion = estado.celdasResaltadas.get(clave);
        if (!accion) return;

        if (accion === "mover") {
            estado.jugador.x = x;
            estado.jugador.y = y;
            registrarEvento(`El Unitario avanza hacia (${x + 1}, ${y + 1}).`, "unitario");
            renderUnidades();
        } else if (accion === "atacar") {
            const objetivo = unidadEnCelda(x, y);
            const resultado = resolverAtaque(estado.jugador, objetivo);

            registrarEvento(
                `El Unitario ataca a ${objetivo.nombre}: -${resultado.danoFinal} HP${resultado.esCritico ? " (¡golpe certero!)" : ""}.`,
                "unitario"
            );
            animarGolpe(objetivo.id);
            actualizarBarrasDeVida();

            if (resultado.objetivoDerrotado) {
                registrarEvento(`${objetivo.nombre} ha sido derrotado.`, "unitario");
                animarCaida(objetivo.id);
            }
        }

        limpiarResaltados();
        await esperar(CONFIG.pausaLargaMs);

        if (estado.terminado) return;

        await procesarTurnoEnemigos();
    }

    function limpiarResaltados() {
        estado.celdasResaltadas = new Map();
        document.querySelectorAll(".celda--movible, .celda--atacable").forEach((celda) => {
            celda.classList.remove("celda--movible", "celda--atacable");
            celda.removeAttribute("tabindex");
        });
    }

    function pintarCeldasDisponibles() {
        estado.celdasResaltadas = calcularCeldasDisponibles();

        estado.celdasResaltadas.forEach((accion, clave) => {
            const celda = document.querySelector(`.celda[data-clave="${clave}"]`);
            if (!celda) return;
            celda.classList.add(accion === "mover" ? "celda--movible" : "celda--atacable");
            celda.setAttribute("tabindex", "0");
        });
    }


    // ------------------------------------------------------------------
    // 9. RENDER
    // ------------------------------------------------------------------

    const elementos = {};

    function inicializarReferenciasDom() {
        elementos.tablero = document.getElementById("tablero");
        elementos.registro = document.getElementById("registro");
        elementos.hudTurno = document.getElementById("hudTurno");
        elementos.hudContador = document.getElementById("hudContador");
        elementos.vidaJugadorRelleno = document.getElementById("vidaJugadorRelleno");
        elementos.vidaJugadorTexto = document.getElementById("vidaJugadorTexto");
        elementos.statDanoJugador = document.getElementById("statDanoJugador");
        elementos.statDefensaJugador = document.getElementById("statDefensaJugador");
        elementos.bannerResultado = document.getElementById("bannerResultado");
        elementos.avisoTurno = document.getElementById("avisoTurno");
    }

    function construirTablero() {
        elementos.tablero.innerHTML = "";
        elementos.tablero.style.setProperty("--columnas", CONFIG.columnas);
        elementos.tablero.style.setProperty("--filas", CONFIG.filas);

        for (let y = 0; y < CONFIG.filas; y += 1) {
            for (let x = 0; x < CONFIG.columnas; x += 1) {
                const celda = document.createElement("div");
                celda.className = "celda" + (((x + y) % 2 === 0) ? " celda--par" : "");
                celda.dataset.clave = `${x},${y}`;
                celda.setAttribute("role", "gridcell");

                celda.addEventListener("click", () => manejarClickCelda(x, y));
                celda.addEventListener("keydown", (evento) => {
                    if (evento.key === "Enter" || evento.key === " ") {
                        evento.preventDefault();
                        manejarClickCelda(x, y);
                    }
                });

                elementos.tablero.appendChild(celda);
            }
        }
    }

    function renderUnidades() {
        // Elimina unidades previas y vuelve a dibujar todo (simple y
        // suficiente para el tamaño de tablero de este prototipo).
        elementos.tablero.querySelectorAll(".unidad").forEach((nodo) => nodo.remove());

        const todas = [estado.jugador, ...estado.enemigos].filter(Boolean);

        todas.forEach((unidad) => {
            const celda = document.querySelector(`.celda[data-clave="${unidad.x},${unidad.y}"]`);
            if (!celda) return;

            const nodo = document.createElement("div");
            nodo.className = `unidad unidad--${unidad.tipo}` + (unidad.esNueva ? " unidad--nueva" : "");
            nodo.dataset.idUnidad = unidad.id;
            nodo.textContent = unidad.tipo === "unitario" ? "U" : "F";
            nodo.title = `${unidad.nombre} — ${unidad.vida}/${unidad.vidaMax} HP`;

            const miniVida = document.createElement("div");
            miniVida.className = "unidad__mini-vida";
            const relleno = document.createElement("div");
            relleno.className = "unidad__mini-vida-relleno";
            relleno.style.width = `${(unidad.vida / unidad.vidaMax) * 100}%`;
            miniVida.appendChild(relleno);
            nodo.appendChild(miniVida);

            celda.appendChild(nodo);
            unidad.esNueva = false;
        });

        if (estado.fase === "jugador" && !estado.terminado) {
            pintarCeldasDisponibles();
        }
    }

    function actualizarBarrasDeVida() {
        const porcentaje = Math.max(0, (estado.jugador.vida / estado.jugador.vidaMax) * 100);
        elementos.vidaJugadorRelleno.style.width = `${porcentaje}%`;
        elementos.vidaJugadorTexto.textContent = `${estado.jugador.vida} / ${estado.jugador.vidaMax}`;
        elementos.vidaJugadorRelleno.closest(".barra-vida").setAttribute("aria-valuenow", String(Math.round(porcentaje)));

        renderUnidades();
    }

    function actualizarHud() {
        const esTurnoJugador = estado.fase === "jugador";

        elementos.hudTurno.textContent = esTurnoJugador ? "Turno del jugador" : "Turno de los Federales";
        elementos.hudTurno.classList.toggle("hud__turno--jugador", esTurnoJugador);
        elementos.hudTurno.classList.toggle("hud__turno--federal", !esTurnoJugador);
        elementos.hudContador.textContent = `Turno ${estado.turno}`;

        // El tablero se oscurece y deja de responder a clicks mientras
        // no es el turno del jugador, para que la alternancia de
        // turnos se note a simple vista.
        elementos.tablero.classList.toggle("tablero--bloqueado", !esTurnoJugador);
    }

    let avisoTurnoTimeout = null;

    function mostrarAvisoTurno(texto, tipo) {
        if (!elementos.avisoTurno) return;

        clearTimeout(avisoTurnoTimeout);
        elementos.avisoTurno.textContent = texto;
        elementos.avisoTurno.className = `aviso-turno aviso-turno--visible aviso-turno--${tipo}`;

        avisoTurnoTimeout = setTimeout(() => {
            elementos.avisoTurno.classList.remove("aviso-turno--visible");
        }, CONFIG.pausaAvisoTurnoMs + 250);
    }

    function registrarEvento(texto, tipo) {
        const item = document.createElement("li");
        item.textContent = texto;
        if (tipo) item.classList.add(`registro__${tipo}`);
        elementos.registro.appendChild(item);
        elementos.registro.scrollTop = elementos.registro.scrollHeight;
    }

    function animarGolpe(idUnidad) {
        const nodo = document.querySelector(`.unidad[data-id-unidad="${idUnidad}"]`);
        if (!nodo) return;
        nodo.classList.add("unidad--golpeada");
        setTimeout(() => nodo.classList.remove("unidad--golpeada"), 300);
    }

    function animarCaida(idUnidad) {
        const nodo = document.querySelector(`.unidad[data-id-unidad="${idUnidad}"]`);
        if (!nodo) return;
        nodo.classList.add("unidad--caida");
    }

    function finalizarPartida(gano) {
        estado.terminado = true;
        estado.fase = "fin";
        limpiarResaltados();
        actualizarHud();

        elementos.bannerResultado.hidden = false;
        elementos.bannerResultado.textContent = gano
            ? "¡Victoria táctica! Amenazas neutralizadas."
            : "Unidad caída. El combate ha terminado.";
        elementos.bannerResultado.classList.add(gano ? "banner-resultado--victoria" : "banner-resultado--derrota");

        registrarEvento(gano ? "Combate finalizado: victoria." : "Combate finalizado: derrota.", null);
    }


    // ------------------------------------------------------------------
    // 10. INICIALIZACIÓN
    // ------------------------------------------------------------------

    function iniciarPartida() {
        inicializarReferenciasDom();

        estado.jugador = crearJugador(0, Math.floor(CONFIG.filas / 2));
        estado.enemigos = [];
        estado.turno = 1;
        estado.fase = "jugador";
        estado.totalAparecidos = CONFIG.enemigosIniciales;
        estado.terminado = false;

        for (let i = 0; i < CONFIG.enemigosIniciales; i += 1) {
            const fila = posicionLibreEnColumna(CONFIG.columnas - 1);
            if (fila !== null) {
                estado.enemigos.push(crearFederal(CONFIG.columnas - 1, fila));
            }
        }

        elementos.statDanoJugador.textContent = `${CONFIG.jugador.danoMin} – ${CONFIG.jugador.danoMax}`;
        elementos.statDefensaJugador.textContent = String(CONFIG.jugador.defensa);

        construirTablero();
        actualizarBarrasDeVida();
        actualizarHud();
        renderUnidades();

        registrarEvento("Comienza el combate. Elegí una celda resaltada para moverte o atacar.", null);
    }

    document.addEventListener("DOMContentLoaded", iniciarPartida);
})();