(function () {

    "use strict";


    /* =========================================================
       CONFIGURACIÓN DEL NIVEL 2
       ========================================================= */

    const CONFIG = {

        columnas: 10,
        filas: 6,

        jugador: {

            vidaMax: 55,

            danoMin: 8,
            danoMax: 14,

            defensa: 3

        },


        federal: {

            vidaMax: 22,

            danoMin: 4,
            danoMax: 8,

            defensa: 1

        },


        /* Menos enemigos al comenzar */

        enemigosIniciales: 2,


        /* Los refuerzos aparecen más tarde */

        turnosDeAparicion: [
            5,
            9
        ],


        /* Radio menor = enemigos menos agresivos */

        radioDeteccion: 3,


        probabilidadCritico: 0.15,

        multiplicadorCritico: 1.5,


        pausaCortaMs: 300,

        pausaLargaMs: 450,

        pausaAvisoTurnoMs: 2000,

        /* Tiempo visible entre cada movimiento */
        pausaMovimientoMs: 800

    };



    /* =========================================================
       ARMAS
       ========================================================= */

    const ARMAS = {

        facon: {

            nombre: "Facón",

            danoExtra: 2,

            alcance: 1,

            usos: Infinity

        },


        boleadora: {

            nombre: "Boleadoras",

            danoExtra: 4,

            alcance: 2,

            usos: 2

        },


        carabina: {

            nombre: "Carabina",

            danoExtra: 6,

            alcance: 3,

            usos: 3

        }

    };



    /* =========================================================
       ESTADO
       ========================================================= */

    const estado = {

        jugador: null,

        enemigos: [],

        turno: 1,

        fase: "jugador",

        terminado: false,

        totalAparecidos: 0,

        armaActual: "facon",

        usos: {

            facon: Infinity,

            boleadora: 2,

            carabina: 3

        },

        celdasResaltadas: new Map()

    };



    let idCorrelativo = 0;



    function generarId(prefijo) {

        idCorrelativo++;

        return prefijo + "-" + idCorrelativo;

    }



    /* =========================================================
       REFERENCIAS HTML
       ========================================================= */

    const elementos = {};



    function inicializarReferencias() {

        elementos.tablero =
            document.getElementById("tablero");

        elementos.registro =
            document.getElementById("registro");

        elementos.hudTurno =
            document.getElementById("hudTurno");

        elementos.hudContador =
            document.getElementById("hudContador");

        elementos.vidaJugadorRelleno =
            document.getElementById("vidaJugadorRelleno");

        elementos.vidaJugadorTexto =
            document.getElementById("vidaJugadorTexto");

        elementos.statDanoJugador =
            document.getElementById("statDanoJugador");

        elementos.statDefensaJugador =
            document.getElementById("statDefensaJugador");

        elementos.bannerResultado =
            document.getElementById("bannerResultado");

        elementos.avisoTurno =
            document.getElementById("avisoTurno");

        elementos.statArmaJugador =
            document.getElementById("statArmaJugador");

    }



    /* =========================================================
       UTILIDADES
       ========================================================= */

    function distanciaManhattan(a, b) {

        return Math.abs(a.x - b.x) +
               Math.abs(a.y - b.y);

    }



    function enteroAleatorio(min, max) {

        return Math.floor(
            Math.random() * (max - min + 1)
        ) + min;

    }



    function dentroDelTablero(x, y) {

        return (
            x >= 0 &&
            x < CONFIG.columnas &&
            y >= 0 &&
            y < CONFIG.filas
        );

    }



    function unidadEnCelda(x, y) {

        if (
            estado.jugador &&
            estado.jugador.x === x &&
            estado.jugador.y === y &&
            estado.jugador.vida > 0
        ) {

            return estado.jugador;

        }


        return estado.enemigos.find(function (enemigo) {

            return (
                enemigo.x === x &&
                enemigo.y === y &&
                enemigo.vida > 0
            );

        }) || null;

    }



    function celdaLibre(x, y) {

        return (
            dentroDelTablero(x, y) &&
            !unidadEnCelda(x, y)
        );

    }



    function esperar(ms) {

        return new Promise(function (resolve) {

            setTimeout(resolve, ms);

        });

    }



    /* =========================================================
       CREAR JUGADOR
       ========================================================= */

    function crearJugador(x, y) {

        return {

            id: generarId("unitario"),

            tipo: "unitario",

            nombre: "Unitario",

            x: x,
            y: y,

            vida: CONFIG.jugador.vidaMax,

            vidaMax: CONFIG.jugador.vidaMax,

            danoMin: CONFIG.jugador.danoMin,

            danoMax: CONFIG.jugador.danoMax,

            defensa: CONFIG.jugador.defensa

        };

    }



    /* =========================================================
       CREAR FEDERAL
       ========================================================= */

    function crearFederal(x, y) {

        return {

            id: generarId("federal"),

            tipo: "federal",

            nombre: "Federal",

            x: x,
            y: y,

            vida: CONFIG.federal.vidaMax,

            vidaMax: CONFIG.federal.vidaMax,

            danoMin: CONFIG.federal.danoMin,

            danoMax: CONFIG.federal.danoMax,

            defensa: CONFIG.federal.defensa,

            esNueva: true

        };

    }



    /* =========================================================
       POSICIÓN LIBRE
       ========================================================= */

    function posicionLibreEnColumna(columna) {

        const posiciones = [];


        for (
            let y = 0;
            y < CONFIG.filas;
            y++
        ) {

            if (celdaLibre(columna, y)) {

                posiciones.push(y);

            }

        }


        if (posiciones.length === 0) {

            return null;

        }


        return posiciones[
            enteroAleatorio(
                0,
                posiciones.length - 1
            )
        ];

    }



    /* =========================================================
       SELECCIONAR ARMA
       ========================================================= */

    function seleccionarArma(nombreArma) {

        if (!ARMAS[nombreArma]) {

            return;

        }


        if (
            estado.usos[nombreArma] <= 0
        ) {

            registrarEvento(
                "No quedan usos de " +
                ARMAS[nombreArma].nombre +
                ".",
                "federal"
            );

            return;

        }


        estado.armaActual = nombreArma;


        if (elementos.statArmaJugador) {

            elementos.statArmaJugador.textContent =
                ARMAS[nombreArma].nombre;

        }


        document
            .querySelectorAll(".arma")
            .forEach(function (boton) {

                boton.classList.remove(
                    "arma--activa"
                );

                boton.setAttribute(
                    "aria-pressed",
                    "false"
                );

            });


        const boton = document.getElementById(
            nombreArma === "facon"
                ? "armaFacon"
                : nombreArma === "boleadora"
                    ? "armaBoleadora"
                    : "armaCarabina"
        );


        if (boton) {

            boton.classList.add(
                "arma--activa"
            );

            boton.setAttribute(
                "aria-pressed",
                "true"
            );

        }


        registrarEvento(
            "Arma seleccionada: " +
            ARMAS[nombreArma].nombre +
            ".",
            "unitario"
        );


        actualizarArmasVisual();

        limpiarResaltados();

        renderUnidades();

    }



    /* =========================================================
       ACTUALIZAR USOS DE ARMAS
       ========================================================= */

    function actualizarArmasVisual() {

        const boleadora =
            document.getElementById(
                "usosBoleadora"
            );

        const carabina =
            document.getElementById(
                "usosCarabina"
            );


        if (boleadora) {

            boleadora.textContent =
                estado.usos.boleadora +
                " usos";

        }


        if (carabina) {

            carabina.textContent =
                estado.usos.carabina +
                " disparos";

        }


        const botones = {

            boleadora:
                document.getElementById(
                    "armaBoleadora"
                ),

            carabina:
                document.getElementById(
                    "armaCarabina"
                )

        };


        Object.keys(botones).forEach(function (arma) {

            if (!botones[arma]) {

                return;

            }


            if (estado.usos[arma] <= 0) {

                botones[arma].disabled = true;

                botones[arma].style.opacity = "0.45";

                botones[arma].style.cursor =
                    "not-allowed";

            } else {

                botones[arma].disabled = false;

                botones[arma].style.opacity = "1";

                botones[arma].style.cursor =
                    "pointer";

            }

        });


        if (
            estado.usos[estado.armaActual] <= 0
        ) {

            seleccionarArma("facon");

        }

    }



    /* =========================================================
       TABLERO
       ========================================================= */

    function construirTablero() {

        elementos.tablero.innerHTML = "";

        elementos.tablero.style.setProperty(
            "--columnas",
            CONFIG.columnas
        );

        elementos.tablero.style.setProperty(
            "--filas",
            CONFIG.filas
        );


        for (
            let y = 0;
            y < CONFIG.filas;
            y++
        ) {

            for (
                let x = 0;
                x < CONFIG.columnas;
                x++
            ) {

                const celda =
                    document.createElement("button");


                celda.type = "button";

                celda.className =
                    "celda-tablero";


                celda.dataset.x = x;

                celda.dataset.y = y;


                celda.setAttribute(
                    "role",
                    "gridcell"
                );


                celda.addEventListener(
                    "click",
                    function () {

                        manejarClickCelda(
                            x,
                            y
                        );

                    }
                );


                elementos.tablero.appendChild(
                    celda
                );

            }

        }

    }



    /* =========================================================
       OBTENER CELDA
       ========================================================= */

    function obtenerCelda(x, y) {

        return elementos.tablero.querySelector(
            `.celda-tablero[data-x="${x}"][data-y="${y}"]`
        );

    }



    /* =========================================================
       MOVIMIENTO
       ========================================================= */

    async function moverJugador(x, y) {

        if (
            estado.fase !== "jugador" ||
            estado.terminado
        ) {

            return;

        }


        if (!celdaLibre(x, y)) {

            return;

        }


        const distancia =
            distanciaManhattan(
                estado.jugador,
                {
                    x: x,
                    y: y
                }
            );


        if (distancia !== 1) {

            registrarEvento(
                "El Unitario solo puede moverse una casilla.",
                "federal"
            );

            return;

        }


        estado.jugador.x = x;

        estado.jugador.y = y;


        limpiarResaltados();

        renderUnidades();


        registrarEvento(
            "El Unitario avanzó.",
            "unitario"
        );

        /* Pausa visible después del movimiento del jugador */
        await esperar(CONFIG.pausaMovimientoMs);

        finalizarTurnoJugador();

    }



    /* =========================================================
       ATAQUE
       ========================================================= */

    async function atacarEnemigo(enemigo) {

        if (
            estado.fase !== "jugador" ||
            estado.terminado
        ) {

            return;

        }


        if (
            !enemigo ||
            enemigo.vida <= 0
        ) {

            return;

        }


        const arma =
            ARMAS[estado.armaActual];


        const distancia =
            distanciaManhattan(
                estado.jugador,
                enemigo
            );


        if (
            distancia > arma.alcance
        ) {

            registrarEvento(
                "El enemigo está fuera del alcance del " +
                arma.nombre +
                ".",
                "federal"
            );

            return;

        }


        if (
            distancia === 0
        ) {

            return;

        }


        if (
            estado.usos[estado.armaActual] <= 0
        ) {

            registrarEvento(
                "No quedan usos de " +
                arma.nombre +
                ".",
                "federal"
            );

            seleccionarArma("facon");

            return;

        }


        estado.fase = "espera";

        limpiarResaltados();

        actualizarHud();


        let dano =
            enteroAleatorio(
                estado.jugador.danoMin,
                estado.jugador.danoMax
            );


        dano += arma.danoExtra;


        let critico = false;


        if (
            Math.random() <
            CONFIG.probabilidadCritico
        ) {

            critico = true;

            dano = Math.round(
                dano *
                CONFIG.multiplicadorCritico
            );

        }


        dano = Math.max(
            1,
            dano - enemigo.defensa
        );


        enemigo.vida =
            Math.max(
                0,
                enemigo.vida - dano
            );


        if (
            estado.usos[estado.armaActual] !== Infinity
        ) {

            estado.usos[estado.armaActual]--;

        }


        animarGolpe(
            enemigo.id
        );


        registrarEvento(
            "El Unitario atacó con " +
            arma.nombre +
            " e hizo " +
            dano +
            " de daño" +
            (
                critico
                    ? " (CRÍTICO)"
                    : ""
            ) +
            ".",
            "unitario"
        );


        actualizarArmasVisual();

        actualizarBarrasDeVida();

        renderUnidades();


        await esperar(
            CONFIG.pausaCortaMs
        );


        if (
            enemigo.vida <= 0
        ) {

            animarCaida(
                enemigo.id
            );


            registrarEvento(
                "Un Federal fue derrotado.",
                "unitario"
            );


            await esperar(
                CONFIG.pausaLargaMs
            );


            if (
                estado.enemigos.every(
                    function (e) {
                        return e.vida <= 0;
                    }
                ) &&
                estado.totalAparecidos >=
                CONFIG.enemigosIniciales +
                CONFIG.turnosDeAparicion.length
            ) {

                finalizarPartida(true);

                return;

            }

        }


        finalizarTurnoJugador();

    }



    /* =========================================================
       CLICK EN CELDA
       ========================================================= */

    function manejarClickCelda(x, y) {

        if (
            estado.fase !== "jugador" ||
            estado.terminado
        ) {

            return;

        }


        const unidad =
            unidadEnCelda(x, y);


        if (
            unidad &&
            unidad.tipo === "federal"
        ) {

            atacarEnemigo(unidad);

            return;

        }


        if (
            unidad &&
            unidad.tipo === "unitario"
        ) {

            return;

        }


        moverJugador(x, y);

    }



    /* =========================================================
       RESALTADOS
       ========================================================= */

    function limpiarResaltados() {

        estado.celdasResaltadas.clear();


        document
            .querySelectorAll(
                ".celda-tablero"
            )
            .forEach(function (celda) {

                celda.classList.remove(
                    "celda--movimiento"
                );

                celda.classList.remove(
                    "celda--ataque"
                );

            });

    }



    function pintarCeldasDisponibles() {

        limpiarResaltados();


        if (
            !estado.jugador ||
            estado.terminado
        ) {

            return;

        }


        const arma =
            ARMAS[estado.armaActual];


        for (
            let y = 0;
            y < CONFIG.filas;
            y++
        ) {

            for (
                let x = 0;
                x < CONFIG.columnas;
                x++
            ) {

                const distancia =
                    distanciaManhattan(
                        estado.jugador,
                        {
                            x: x,
                            y: y
                        }
                    );


                const celda =
                    obtenerCelda(x, y);


                if (!celda) {

                    continue;

                }


                const unidad =
                    unidadEnCelda(x, y);


                if (
                    !unidad &&
                    distancia === 1
                ) {

                    celda.classList.add(
                        "celda--movimiento"
                    );

                    estado.celdasResaltadas.set(
                        x + "-" + y,
                        "movimiento"
                    );

                }


                if (
                    unidad &&
                    unidad.tipo === "federal" &&
                    unidad.vida > 0 &&
                    distancia <= arma.alcance
                ) {

                    celda.classList.add(
                        "celda--ataque"
                    );

                    estado.celdasResaltadas.set(
                        x + "-" + y,
                        "ataque"
                    );

                }

            }

        }

    }



    /* =========================================================
       RENDERIZAR UNIDADES
       ========================================================= */

    function renderUnidades() {

        if (
            !elementos.tablero
        ) {

            return;

        }


        elementos.tablero
            .querySelectorAll(
                ".unidad"
            )
            .forEach(function (unidad) {

                unidad.remove();

            });


        for (
            let y = 0;
            y < CONFIG.filas;
            y++
        ) {

            for (
                let x = 0;
                x < CONFIG.columnas;
                x++
            ) {

                const celda =
                    obtenerCelda(x, y);


                if (!celda) {

                    continue;

                }


                const unidad =
                    unidadEnCelda(x, y);


                if (
                    !unidad
                ) {

                    continue;

                }


                const nodo =
                    document.createElement("div");


                nodo.className =
                    "unidad " +
                    (
                        unidad.tipo === "unitario"
                            ? "unidad--unitario"
                            : "unidad--federal"
                    );


                nodo.dataset.idUnidad =
                    unidad.id;


                nodo.setAttribute(
                    "aria-label",
                    unidad.nombre +
                    ", vida " +
                    unidad.vida +
                    " de " +
                    unidad.vidaMax
                );


                const figura =
                    document.createElement("div");


                figura.className =
                    "unidad__figura";


                if (unidad.tipo === "unitario") {

                    const imagen =
                        document.createElement("img");

                    imagen.src =
                        "../RECURSOS GRAFICOS/Imgunitario.png";

                    imagen.alt = "Unitario";

                    figura.appendChild(imagen);

                } else {

                    figura.textContent = "F";

                }


                nodo.appendChild(
                    figura
                );


                const nombre =
                    document.createElement("span");


                nombre.className =
                    "unidad__nombre";


                nombre.textContent =
                    unidad.nombre;


                nodo.appendChild(
                    nombre
                );


                const miniVida =
                    document.createElement("div");


                miniVida.className =
                    "unidad__mini-vida";


                const relleno =
                    document.createElement("div");


                relleno.className =
                    "unidad__mini-vida-relleno";


                relleno.style.width =
                    (
                        unidad.vida /
                        unidad.vidaMax *
                        100
                    ) + "%";


                miniVida.appendChild(
                    relleno
                );


                nodo.appendChild(
                    miniVida
                );


                celda.appendChild(
                    nodo
                );


                unidad.esNueva = false;

            }

        }


        if (
            estado.fase === "jugador" &&
            !estado.terminado
        ) {

            pintarCeldasDisponibles();

        }

    }



    /* =========================================================
       VIDA
       ========================================================= */

    function actualizarBarrasDeVida() {

        if (
            !estado.jugador
        ) {

            return;

        }


        const porcentaje =
            Math.max(
                0,
                (
                    estado.jugador.vida /
                    estado.jugador.vidaMax
                ) * 100
            );


        elementos.vidaJugadorRelleno.style.width =
            porcentaje + "%";


        elementos.vidaJugadorTexto.textContent =
            estado.jugador.vida +
            " / " +
            estado.jugador.vidaMax;


        renderUnidades();

    }



    /* =========================================================
       HUD
       ========================================================= */

    function actualizarHud() {

        if (
            !elementos.hudTurno
        ) {

            return;

        }


        const jugador =
            estado.fase === "jugador";


        elementos.hudTurno.textContent =
            jugador
                ? "Turno del jugador"
                : "Turno de los Federales";


        elementos.hudTurno.classList.toggle(
            "hud__turno--jugador",
            jugador
        );


        elementos.hudTurno.classList.toggle(
            "hud__turno--federal",
            !jugador
        );


        elementos.hudContador.textContent =
            "Turno " +
            estado.turno;


        elementos.tablero.classList.toggle(
            "tablero--bloqueado",
            !jugador
        );

    }



    /* =========================================================
       AVISO DE TURNO
       ========================================================= */

    let avisoTimeout = null;


    function mostrarAvisoTurno(
        texto,
        tipo
    ) {

        if (
            !elementos.avisoTurno
        ) {

            return;

        }


        clearTimeout(
            avisoTimeout
        );


        elementos.avisoTurno.textContent =
            texto;


        elementos.avisoTurno.className =
            "aviso-turno aviso-turno--visible aviso-turno--" +
            tipo;


        avisoTimeout =
            setTimeout(
                function () {

                    elementos.avisoTurno.classList.remove(
                        "aviso-turno--visible"
                    );

                },
                CONFIG.pausaAvisoTurnoMs + 250
            );

    }



    /* =========================================================
       REGISTRO
       ========================================================= */

    function registrarEvento(
        texto,
        tipo
    ) {

        if (
            !elementos.registro
        ) {

            return;

        }


        const item =
            document.createElement("li");


        item.textContent =
            texto;


        if (tipo) {

            item.classList.add(
                "registro__" + tipo
            );

        }


        elementos.registro.appendChild(
            item
        );


        elementos.registro.scrollTop =
            elementos.registro.scrollHeight;

    }



    /* =========================================================
       ANIMACIÓN GOLPE
       ========================================================= */

    function animarGolpe(idUnidad) {

        const nodo =
            document.querySelector(
                `.unidad[data-id-unidad="${idUnidad}"]`
            );


        if (!nodo) {

            return;

        }


        nodo.classList.add(
            "unidad--golpeada"
        );


        setTimeout(
            function () {

                nodo.classList.remove(
                    "unidad--golpeada"
                );

            },
            300
        );

    }



    /* =========================================================
       ANIMACIÓN CAÍDA
       ========================================================= */

    function animarCaida(idUnidad) {

        const nodo =
            document.querySelector(
                `.unidad[data-id-unidad="${idUnidad}"]`
            );


        if (!nodo) {

            return;

        }


        nodo.classList.add(
            "unidad--caida"
        );

    }



    /* =========================================================
       TURNO DEL JUGADOR
       ========================================================= */

    async function finalizarTurnoJugador() {

        if (
            estado.terminado
        ) {

            return;

        }


        estado.fase = "federal";


        limpiarResaltados();

        actualizarHud();


        mostrarAvisoTurno(
            "Turno de los Federales",
            "federal"
        );


        await esperar(
            CONFIG.pausaAvisoTurnoMs
        );


        await turnoFederales();


        if (
            estado.terminado
        ) {

            return;

        }


        estado.turno++;


        aparecerRefuerzos();


        if (
            estado.terminado
        ) {

            return;

        }


        estado.fase = "jugador";


        actualizarHud();

        renderUnidades();


        mostrarAvisoTurno(
            "Tu turno",
            "jugador"
        );

    }



    /* =========================================================
       TURNO FEDERALES
       ========================================================= */

    async function turnoFederales() {

        const enemigosVivos =
            estado.enemigos.filter(
                function (enemigo) {

                    return enemigo.vida > 0;

                }
            );


        for (
            const enemigo of enemigosVivos
        ) {

            if (
                estado.terminado ||
                estado.jugador.vida <= 0
            ) {

                return;

            }


            await accionFederal(
                enemigo
            );


            await esperar(
                CONFIG.pausaCortaMs
            );

        }

    }



    /* =========================================================
       ACCIÓN FEDERAL
       ========================================================= */

    async function accionFederal(enemigo) {

        if (
            enemigo.vida <= 0
        ) {

            return;

        }


        const distancia =
            distanciaManhattan(
                enemigo,
                estado.jugador
            );


        if (
            distancia === 1
        ) {

            atacarJugador(
                enemigo
            );

            return;

        }


        if (
            distancia <= CONFIG.radioDeteccion
        ) {

            const movimiento =
                calcularMovimientoHaciaJugador(
                    enemigo
                );


            if (
                movimiento
            ) {

                enemigo.x =
                    movimiento.x;

                enemigo.y =
                    movimiento.y;


                renderUnidades();

                registrarEvento(
                    "Un Federal avanzó.",
                    "federal"
                );

                /* Pausa visible para que se vea el movimiento */
                await esperar(CONFIG.pausaMovimientoMs);

                const nuevaDistancia =
                    distanciaManhattan(
                        enemigo,
                        estado.jugador
                    );


                if (
                    nuevaDistancia === 1
                ) {

                    await esperar(
                        CONFIG.pausaCortaMs
                    );


                    atacarJugador(
                        enemigo
                    );

                }

                return;

            }

        }


        /* Si está lejos, se mueve de forma limitada */

        const movimientoAleatorio =
            calcularMovimientoAleatorio(
                enemigo
            );


        if (
            movimientoAleatorio
        ) {

            enemigo.x =
                movimientoAleatorio.x;

            enemigo.y =
                movimientoAleatorio.y;


            renderUnidades();

            registrarEvento(
                "Un Federal se movió.",
                "federal"
            );

            /* Pausa visible para que se vea el movimiento */
            await esperar(CONFIG.pausaMovimientoMs);

        }

    }



    /* =========================================================
       MOVIMIENTO HACIA JUGADOR
       ========================================================= */

    function calcularMovimientoHaciaJugador(
        enemigo
    ) {

        const opciones = [];


        const dx =
            estado.jugador.x -
            enemigo.x;


        const dy =
            estado.jugador.y -
            enemigo.y;


        if (
            Math.abs(dx) >=
            Math.abs(dy)
        ) {

            if (
                dx !== 0
            ) {

                opciones.push({
                    x:
                        enemigo.x +
                        Math.sign(dx),

                    y:
                        enemigo.y
                });

            }


            if (
                dy !== 0
            ) {

                opciones.push({
                    x:
                        enemigo.x,

                    y:
                        enemigo.y +
                        Math.sign(dy)
                });

            }

        } else {

            if (
                dy !== 0
            ) {

                opciones.push({
                    x:
                        enemigo.x,

                    y:
                        enemigo.y +
                        Math.sign(dy)
                });

            }


            if (
                dx !== 0
            ) {

                opciones.push({
                    x:
                        enemigo.x +
                        Math.sign(dx),

                    y:
                        enemigo.y
                });

            }

        }


        for (
            const opcion of opciones
        ) {

            if (
                celdaLibre(
                    opcion.x,
                    opcion.y
                )
            ) {

                return opcion;

            }

        }


        return null;

    }



    /* =========================================================
       MOVIMIENTO ALEATORIO
       ========================================================= */

    function calcularMovimientoAleatorio(
        enemigo
    ) {

        const direcciones = [

            {
                x: 1,
                y: 0
            },

            {
                x: -1,
                y: 0
            },

            {
                x: 0,
                y: 1
            },

            {
                x: 0,
                y: -1
            }

        ];


        direcciones.sort(
            function () {

                return Math.random() - 0.5;

            }
        );


        for (
            const direccion of direcciones
        ) {

            const nuevoX =
                enemigo.x +
                direccion.x;


            const nuevoY =
                enemigo.y +
                direccion.y;


            if (
                celdaLibre(
                    nuevoX,
                    nuevoY
                )
            ) {

                return {

                    x: nuevoX,

                    y: nuevoY

                };

            }

        }


        return null;

    }



    /* =========================================================
       ATAQUE DEL FEDERAL
       ========================================================= */

    function atacarJugador(
        enemigo
    ) {

        if (
            estado.jugador.vida <= 0
        ) {

            return;

        }


        let dano =
            enteroAleatorio(
                enemigo.danoMin,
                enemigo.danoMax
            );


        dano = Math.max(
            1,
            dano -
            estado.jugador.defensa
        );


        estado.jugador.vida =
            Math.max(
                0,
                estado.jugador.vida -
                dano
            );


        animarGolpe(
            estado.jugador.id
        );


        registrarEvento(
            "Un Federal atacó al Unitario e hizo " +
            dano +
            " de daño.",
            "federal"
        );


        actualizarBarrasDeVida();


        if (
            estado.jugador.vida <= 0
        ) {

            finalizarPartida(false);

        }

    }



    /* =========================================================
       REFUERZOS
       ========================================================= */

    function aparecerRefuerzos() {

        const indice =
            CONFIG.turnosDeAparicion.indexOf(
                estado.turno
            );


        if (
            indice === -1
        ) {

            return;

        }


        const cantidad =
            indice + 1;


        for (
            let i = 0;
            i < cantidad;
            i++
        ) {

            const fila =
                posicionLibreEnColumna(
                    CONFIG.columnas - 1
                );


            if (
                fila !== null
            ) {

                estado.enemigos.push(

                    crearFederal(
                        CONFIG.columnas - 1,
                        fila
                    )

                );


                estado.totalAparecidos++;

            }

        }


        registrarEvento(
            "Llegaron refuerzos Federales.",
            "federal"
        );


        mostrarAvisoTurno(
            "Llegaron refuerzos",
            "federal"
        );


        renderUnidades();

    }



    /* =========================================================
       FINALIZAR PARTIDA
       ========================================================= */

    function finalizarPartida(gano) {

        estado.terminado = true;

        estado.fase = "fin";


        limpiarResaltados();

        actualizarHud();


        elementos.bannerResultado.hidden =
            false;


        elementos.bannerResultado.textContent =
            gano
                ? "¡Victoria táctica!"
                : "Unidad caída. El combate terminó.";


        elementos.bannerResultado.classList.add(

            gano
                ? "banner-resultado--victoria"
                : "banner-resultado--derrota"

        );


        registrarEvento(

            gano
                ? "¡Victoria! Los Federales fueron derrotados."
                : "Derrota. El Unitario fue vencido.",

            null

        );

    }



    /* =========================================================
       INICIAR PARTIDA
       ========================================================= */

    function iniciarPartida() {

        inicializarReferencias();


        estado.jugador =
            crearJugador(
                0,
                Math.floor(
                    CONFIG.filas / 2
                )
            );


        estado.enemigos = [];


        estado.turno = 1;


        estado.fase =
            "jugador";


        estado.terminado =
            false;


        estado.totalAparecidos =
            CONFIG.enemigosIniciales;


        estado.armaActual =
            "facon";


        estado.usos = {

            facon: Infinity,

            boleadora: 2,

            carabina: 3

        };


        estado.celdasResaltadas =
            new Map();


        if (
            elementos.registro
        ) {

            elementos.registro.innerHTML =
                "";

        }


        if (
            elementos.bannerResultado
        ) {

            elementos.bannerResultado.hidden =
                true;


            elementos.bannerResultado.classList.remove(
                "banner-resultado--victoria",
                "banner-resultado--derrota"
            );

        }


        for (
            let i = 0;
            i < CONFIG.enemigosIniciales;
            i++
        ) {

            const fila =
                posicionLibreEnColumna(
                    CONFIG.columnas - 1
                );


            if (
                fila !== null
            ) {

                estado.enemigos.push(

                    crearFederal(
                        CONFIG.columnas - 1,
                        fila
                    )

                );

            }

        }


        elementos.statDanoJugador.textContent =
            CONFIG.jugador.danoMin +
            " – " +
            CONFIG.jugador.danoMax;


        elementos.statDefensaJugador.textContent =
            CONFIG.jugador.defensa;


        if (
            elementos.statArmaJugador
        ) {

            elementos.statArmaJugador.textContent =
                ARMAS[
                    estado.armaActual
                ].nombre;

        }


        construirTablero();

        actualizarBarrasDeVida();

        actualizarHud();

        actualizarArmasVisual();

        renderUnidades();


        registrarEvento(
            "Comienza el combate. Elegí un arma y atacá a los Federales.",
            null
        );

    }



    /* =========================================================
       BOTONES DE ARMAS
       ========================================================= */

    document.addEventListener(
        "DOMContentLoaded",
        function () {

            const facon =
                document.getElementById(
                    "armaFacon"
                );


            const boleadora =
                document.getElementById(
                    "armaBoleadora"
                );


            const carabina =
                document.getElementById(
                    "armaCarabina"
                );


            if (
                facon
            ) {

                facon.addEventListener(
                    "click",
                    function () {

                        seleccionarArma(
                            "facon"
                        );

                    }
                );

            }


            if (
                boleadora
            ) {

                boleadora.addEventListener(
                    "click",
                    function () {

                        seleccionarArma(
                            "boleadora"
                        );

                    }
                );

            }


            if (
                carabina
            ) {

                carabina.addEventListener(
                    "click",
                    function () {

                        seleccionarArma(
                            "carabina"
                        );

                    }
                );

            }

        }
    );



    /* =========================================================
       ARRANQUE
       ========================================================= */

    /*
       La partida comienza SOLO cuando se pulsa
       INICIAR en la portada del Nivel 2.
    */

    window.addEventListener(
        "nivel2:iniciado",
        iniciarPartida
    );

})();