// audio.js — Música de fondo + control de volumen desde Configuración
(function () {
    const CLAVES = {
        general: 'volumen-general',
        musica: 'volumen-musica',
        efectos: 'volumen-efectos',
        pantallaCompleta: 'pantalla-completa',
        tiempoMusica: 'musica-tiempo'
    };

    function obtenerValor(clave, porDefecto) {
        const valor = localStorage.getItem(clave);
        return valor !== null ? Number(valor) : porDefecto;
    }

    // El volumen final de la música combina el slider "Música"
    // con el slider "Volumen General" (0.0 a 1.0).
    // audio.volume es LINEAL, pero el oído percibe el volumen de forma
    // logarítmica: con una escala lineal, bajar el slider a la mitad casi
    // no se nota. Por eso se eleva al cuadrado (curva perceptual), así
    // cada movimiento del slider se escucha de verdad.
    function volumenMusicaFinal() {
        const general = obtenerValor(CLAVES.general, 80) / 100;
        const musica = obtenerValor(CLAVES.musica, 70) / 100;
        const nivel = Math.min(1, Math.max(0, general * musica));
        // Piso de silencio: con los sliders casi a cero el resultado es
        // inaudible, así que se fuerza a 0 exacto (y se silencia, ver abajo).
        if (nivel < 0.02) return 0;
        return nivel * nivel;
    }

    // Restaura el punto exacto (en segundos) donde había quedado la
    // música en la pantalla anterior, para que al cambiar de página
    // no vuelva a arrancar desde 0.
    function restaurarTiempoMusica(audio) {
        const guardado = parseFloat(localStorage.getItem(CLAVES.tiempoMusica));
        tiempoRestaurado = true;

        if (!isNaN(guardado) && guardado > 0) {
            // Si la canción es más corta que el tiempo guardado (por el
            // loop), usamos el resto de la división para no pasarnos.
            const duracion = audio.duration;
            audio.currentTime = (duracion && duracion > 0)
                ? guardado % duracion
                : guardado;
        }
    }

    // Guarda el tiempo actual de la música. Se llama periódicamente y
    // justo antes de salir de la página (click en un link, cerrar, etc.)
    let tiempoRestaurado = false;

    function guardarTiempoMusica(audio) {
        // No se guarda hasta haber restaurado el tiempo anterior; si no,
        // se pisaba el valor guardado con 0 antes de leerlo.
        if (audio && tiempoRestaurado && !isNaN(audio.currentTime)) {
            localStorage.setItem(CLAVES.tiempoMusica, audio.currentTime);
        }
    }

    function iniciarMusica() {
        const audio = document.getElementById('musica-fondo');
        if (!audio) return null;

        // Si el archivo no se encuentra con el nombre del src, se
        // prueban automáticamente variantes comunes del nombre (con
        // y sin doble extensión, con guion bajo en vez de espacio).
        // Así no hay que tocar 4 HTML distintos si se renombra el mp3.
        const srcOriginal = audio.getAttribute('src');
        const alternativas = [
            srcOriginal.replace(/\.mp3$/i, '.mp3.mp3'),
            srcOriginal.replace(/\.mp3\.mp3$/i, '.mp3'),
            srcOriginal.replace(/ /g, '_'),
            srcOriginal.replace(/ /g, '_').replace(/\.mp3$/i, '.mp3.mp3')
        ].filter((ruta) => ruta !== srcOriginal);

        let intento = 0;
        audio.addEventListener('error', function siguienteRuta() {
            if (intento < alternativas.length) {
                audio.src = alternativas[intento];
                intento++;
                audio.load();
            } else {
                console.warn(
                    '[Sarmiento] No se encontró el archivo de música. Probé:\n'
                    + [srcOriginal].concat(alternativas).join('\n')
                );
            }
        });

        audio.loop = true;
        aplicarVolumen(audio);
        // Se reaplica cuando el audio realmente arranca/carga.
        ['loadedmetadata', 'play', 'playing'].forEach((ev) => {
            audio.addEventListener(ev, () => aplicarVolumen(audio));
        });
        // Si cambia el volumen en otra pestaña/ventana del juego.
        window.addEventListener('storage', () => actualizarVolumen(audio));

        // Los navegadores bloquean el autoplay al cambiar de página hasta
        // que el jugador interactúa. Se reintenta en CADA gesto (click,
        // toque, tecla) hasta que la música efectivamente empieza.
        const EVENTOS_GESTO = ['pointerdown', 'click', 'touchstart', 'keydown'];

        const quitarGestos = () => {
            EVENTOS_GESTO.forEach((e) => document.removeEventListener(e, alGesto, true));
        };

        function alGesto() {
            if (!audio.paused) { quitarGestos(); return; }
            if (volumenMusicaFinal() === 0) return;
            const p = audio.play();
            if (p && p.then) {
                p.then(quitarGestos).catch(() => { /* se reintenta en el próximo gesto */ });
            }
        }

        const intentarReproducir = () => {
            if (volumenMusicaFinal() === 0) return; // volumen al mínimo: no suena
            const p = audio.play();
            if (p && p.catch) {
                p.then(quitarGestos).catch(() => {
                    // Autoplay bloqueado: queda esperando el primer gesto.
                });
            }
        };

        EVENTOS_GESTO.forEach((e) => document.addEventListener(e, alGesto, true));

        const arrancar = () => {
            restaurarTiempoMusica(audio);
            intentarReproducir();
        };

        // "loadedmetadata" asegura que audio.duration ya esté
        // disponible antes de restaurar el tiempo.
        if (audio.readyState >= 1) {
            arrancar();
        } else {
            audio.addEventListener('loadedmetadata', arrancar, { once: true });
        }

        // Si la pestaña vuelve a primer plano y la música quedó pausada
        // por el navegador, se intenta retomar.
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && audio.paused) intentarReproducir();
        });

        // Guarda el progreso cada 1 segundo mientras suena...
        setInterval(() => guardarTiempoMusica(audio), 1000);

        // ...y también justo antes de que la página se descargue
        // (por ejemplo, al hacer click en "Volver" o "Ayuda"), que es
        // el momento más importante para no perder el segundo exacto.
        window.addEventListener('pagehide', () => guardarTiempoMusica(audio));
        window.addEventListener('beforeunload', () => guardarTiempoMusica(audio));

        return audio;
    }

    // Aplica volumen y mute según los sliders (sin pausar ni reanudar).
    function aplicarVolumen(audio) {
        if (!audio) return;
        const vol = volumenMusicaFinal();
        audio.volume = vol;
        audio.muted = vol === 0;
    }

    // Se usa al mover los sliders: con la perilla en el mínimo la
    // música se CORTA (pausa); al subirla de nuevo, se reanuda.
    function actualizarVolumen(audio) {
        if (!audio) return;
        aplicarVolumen(audio);
        if (volumenMusicaFinal() === 0) {
            if (!audio.paused) audio.pause();
        } else if (audio.paused) {
            const p = audio.play();
            if (p && p.catch) p.catch(() => { /* se reanuda en el próximo gesto */ });
        }
    }

    // ==========================================================
    // PANTALLA COMPLETA
    // ==========================================================
    function hayPantallaCompletaActiva() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }

    function entrarPantallaCompleta() {
        const el = document.documentElement;
        const solicitar = el.requestFullscreen
            || el.webkitRequestFullscreen
            || el.msRequestFullscreen;
        if (!solicitar) {
            console.warn('Este navegador no soporta la API de pantalla completa.');
            return;
        }
        solicitar.call(el).catch((error) => {
            console.warn('No se pudo activar pantalla completa:', error);
        });
    }

    function salirPantallaCompleta() {
        const salir = document.exitFullscreen
            || document.webkitExitFullscreen
            || document.msExitFullscreen;
        if (salir) salir.call(document).catch(() => {});
    }

    function inicializarPantallaCompleta() {
        const checkbox = document.getElementById('pantalla-completa');

        // Preferencia guardada (existe en Configuración Y en Menu,
        // porque el navegador trata cada página file:// como un
        // origen aparte y no arrastra el estado de pantalla completa).
        const prefiereCompleta = localStorage.getItem(CLAVES.pantallaCompleta) === 'true';

        if (checkbox) {
            // Estamos en Configuración: reflejar preferencia guardada.
            checkbox.checked = prefiereCompleta;

            checkbox.addEventListener('change', () => {
                localStorage.setItem(CLAVES.pantallaCompleta, checkbox.checked);
                if (checkbox.checked) {
                    entrarPantallaCompleta();
                } else {
                    salirPantallaCompleta();
                }
            });
        }

        // En CUALQUIER página: si el usuario sale de pantalla completa
        // con Esc, se actualiza la preferencia guardada para que no
        // intente forzarla de nuevo al cambiar de pantalla.
        ['fullscreenchange', 'webkitfullscreenchange'].forEach((evento) => {
            document.addEventListener(evento, () => {
                const activa = hayPantallaCompletaActiva();
                localStorage.setItem(CLAVES.pantallaCompleta, activa);
                if (checkbox) checkbox.checked = activa;
            });
        });

        // En CUALQUIER página (Menu o Configuración): si la
        // preferencia es "pantalla completa" y todavía no lo está,
        // se reintenta apenas el usuario hace el primer clic (los
        // navegadores exigen un gesto del usuario para activarla).
        if (prefiereCompleta && !hayPantallaCompletaActiva()) {
            document.addEventListener('click', function primerClicPantalla() {
                if (!hayPantallaCompletaActiva()) entrarPantallaCompleta();
                document.removeEventListener('click', primerClicPantalla);
            }, { once: true });
        }
    }

    // ==========================================================
    // BOTÓN SALIR
    // ==========================================================
    function inicializarBotonSalir() {
        const boton = document.querySelector('.boton-salir');
        if (!boton) return;

        boton.addEventListener('click', (evento) => {
            evento.preventDefault();

            // window.close() solo funciona si el navegador permite
            // cerrar esta pestaña (por ejemplo, si fue abierta por
            // script). En una pestaña abierta a mano, la mayoría de
            // los navegadores lo bloquea sin avisar.
            window.close();

            // Si seguimos acá después de un instante, es que el
            // navegador bloqueó el cierre: avisamos al jugador.
            setTimeout(() => {
                alert('Para salir del juego, cerrá esta pestaña o ventana del navegador.');
            }, 200);
        });
    }

    // ==========================================================
    // VENTANA DE CONFIGURACIÓN DENTRO DE LOS NIVELES (engranaje)
    // ==========================================================
    function inicializarConfigNivel() {
        const boton = document.getElementById('btnConfigNivel');
        const modal = document.getElementById('modalConfigNivel');
        if (!boton || !modal) return;

        const cerrar = document.getElementById('btnCerrarConfig');
        const abrir = () => { modal.hidden = false; };
        const ocultar = () => { modal.hidden = true; };

        boton.addEventListener('click', abrir);
        if (cerrar) cerrar.addEventListener('click', ocultar);
        modal.addEventListener('click', (e) => { if (e.target === modal) ocultar(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.hidden) ocultar();
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        const audio = iniciarMusica();

        const sliderGeneral = document.getElementById('volumen-general');
        const sliderMusica = document.getElementById('volumen-musica');
        const sliderEfectos = document.getElementById('volumen-efectos');

        // Si estamos en la pantalla de Configuración, cargar los
        // valores guardados y reaccionar a los cambios en vivo.
        if (sliderGeneral) {
            sliderGeneral.value = obtenerValor(CLAVES.general, 80);
            sliderGeneral.addEventListener('input', () => {
                localStorage.setItem(CLAVES.general, sliderGeneral.value);
                actualizarVolumen(audio);
            });
        }

        if (sliderMusica) {
            sliderMusica.value = obtenerValor(CLAVES.musica, 70);
            sliderMusica.addEventListener('input', () => {
                localStorage.setItem(CLAVES.musica, sliderMusica.value);
                actualizarVolumen(audio);
            });
        }

        if (sliderEfectos) {
            sliderEfectos.value = obtenerValor(CLAVES.efectos, 70);
            sliderEfectos.addEventListener('input', () => {
                localStorage.setItem(CLAVES.efectos, sliderEfectos.value);
            });
        }

        inicializarPantallaCompleta();
        inicializarBotonSalir();
        inicializarConfigNivel();
    });
})();
