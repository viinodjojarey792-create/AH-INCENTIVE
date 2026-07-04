// Plugin registry mapping an employee `category` to that role's calc/dashboard
// functions. This file never imports a role module — each roles/*.js module
// imports registerRole() from here and registers itself on load. main.js is
// the only place that imports every role module (for the registration side
// effect) before boot() runs.
const registry = new Map();

export function registerRole(category, api) {
  registry.set(category, api);
}
export function getRole(category) {
  return registry.get(category) || null;
}
