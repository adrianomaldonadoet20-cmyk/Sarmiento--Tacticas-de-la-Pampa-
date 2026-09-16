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
    // con el slider "Volumen General" (0.0 a 1.0)
    function volumenMusicaFinal() {
        const general = obtenerValor(CLAVES.general, 80) / 100;
        const musica = obtenerValor(CLAVES.musica, 70) / 100;
        return Math.min(1, Math.max(0, general * musica));
    }

    // Restaura el punto exacto (en segundos) donde había quedado la
    // música en la pantalla anterior, para que al cambiar de página
    // no vuelva a arrancar desde 0.
    function restaurarTiempoMusica(audio) {
        const guardado = parseFloat(localStorage.getItem(CLAVES.tiempoMusica));

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
    function guardarTiempoMusica(audio) {
        if (audio && !isNaN(audio.currentTime)) {
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
        audio.volume = volumenMusicaFinal();

        const intentarReproducir = () => {
            audio.play().catch(() => {
                // El navegador bloqueó el autoplay: se reintenta
                // apenas el usuario haga clic en cualquier parte.
            });
        };

        const arrancar = () => {
            restaurarTiempoMusica(audio);
            intentarReproducir();
        };

        // "loadedmetadata" asegura que audio.duration ya esté
        // disponible antes de intentar restaurar el tiempo (si lo
        // hacemos antes, currentTime podría no aplicarse bien en
        // algunos navegadores).
        if (audio.readyState >= 1) {
            // Los metadatos ya están cargados (puede pasar si el
            // audio viene de caché).
            arrancar();
        } else {
            audio.addEventListener('loadedmetadata', arrancar, { once: true });
        }

        document.addEventListener('click', function primerClick() {
            intentarReproducir();
            document.removeEventListener('click', primerClick);
        }, { once: true });

        // Guarda el progreso cada 1 segundo mientras suena...
        setInterval(() => guardarTiempoMusica(audio), 1000);

        // ...y también justo antes de que la página se descargue
        // (por ejemplo, al hacer click en "Volver" o "Ayuda"), que es
        // el momento más importante para no perder el segundo exacto.
        window.addEventListener('pagehide', () => guardarTiempoMusica(audio));
        window.addEventListener('beforeunload', () => guardarTiempoMusica(audio));

        return audio;
    }

    function actualizarVolumen(audio) {
        if (audio) audio.volume = volumenMusicaFinal();
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
    });
})();
