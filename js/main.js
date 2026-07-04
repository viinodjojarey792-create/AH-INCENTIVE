// Entry point. Import every role module first (each registers itself with
// core/role-registry.js as a side effect of loading), then boot the app.
import './roles/technician.js';
import './roles/advisor.js';
import './roles/supervisor.js';
import './roles/floor-manager.js';
import './roles/workshop-manager.js';
import './roles/service-manager.js';
import './roles/store-manager.js';
import './roles/warranty.js';
import './roles/bodyshop.js';
import './roles/cre-crm.js';
import './roles/hr.js';

import { boot } from './core/boot.js';

document.addEventListener('DOMContentLoaded', boot);
