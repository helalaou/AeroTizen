import { h, render } from 'preact';
import { Settings } from './Settings.jsx';
import { createNavigation } from './navigation.js';
import { createSettingsController } from './controller.js';

const A = window.AeroTizen;
const navigation = createNavigation(A);
const controller = createSettingsController(A, navigation, snapshot => {
  // Synchronous root rendering keeps the DOM ready for the next remote event.
  render(<Settings A={A} {...snapshot} actions={controller.actions} />, A.$('editor'));
});
A.settingsUi = controller;
window.addEventListener('resize', controller.resize);
