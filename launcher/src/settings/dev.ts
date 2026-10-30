import '../index';

// The legacy boot script must run after the Settings controller is registered.
// Keep it a classic script so development has the same global APIs as the widget.
const boot = document.createElement('script');
boot.src = '/js/main.js';
document.body.appendChild(boot);
