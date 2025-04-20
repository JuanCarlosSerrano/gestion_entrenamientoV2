
let Atletas;
let Calendario;
let Entrenamientos;

document.addEventListener('DOMContentLoaded', () => {
    console.log("main.js cargado");

    const ruta = window.location.pathname;
    
    // Inicializar las funcionalidades solo en la página correspondiente
    if (ruta.endsWith('atletas.html')) {
        import ('./atletas.js').then(module=> {
            Atletas = module;
            Atletas.init();
        }).catch(error => {
            console.error("Error cargando atletas.js", error);
        });   
    } else if (ruta.endsWith('entrenamientos.html')) {
        console.log("Cargando entrenamientos.init()");
        import ('./entrenamientos.js').then(module=> {
            Entrenamientos = module;
            Entrenamientos.init();
        }).catch(error => {
            console.error("Error cargando entrenamientos.js", error);
        });  
    } else if (window.location.pathname.endsWith('calendario.html')) {
        import('./calendario.js').then(module => {
            Calendario = module;
            Calendario.initCalendario();
        }).catch(error => {
            console.error("Error cargando calendario.js", error);
        });
    }
    
});