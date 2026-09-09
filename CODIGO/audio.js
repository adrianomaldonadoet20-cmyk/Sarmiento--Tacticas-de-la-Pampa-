// audio.js — Música de fondo + control de volumen desde Configuración
(function () {
    const CLAVES = {
        general: 'volumen-general',
        musica: 'volumen-musica',
        efectos: 'volumen-efectos'
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

    function iniciarMusica() {
        const audio = document.getElementById('musica-fondo');
        if (!audio) return null;

        audio.loop = true;
        audio.volume = volumenMusicaFinal();

        const intentarReproducir = () => {
            audio.play().catch(() => {
                // El navegador bloqueó el autoplay: se reintenta
                // apenas el usuario haga clic en cualquier parte.
            });
        };

        intentarReproducir();

        document.addEventListener('click', function primerClick() {
            intentarReproducir();
            document.removeEventListener('click', primerClick);
        }, { once: true });

        return audio;
    }

    function actualizarVolumen(audio) {
        if (audio) audio.volume = volumenMusicaFinal();
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
    });
})();
