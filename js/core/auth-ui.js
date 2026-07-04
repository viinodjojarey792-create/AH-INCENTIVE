import { APP, SESSION } from './state.js';
import { SUPABASE_OK } from './config.js';
import { Store } from './store.js';
import { escapeHtml, uid, toast } from './utils.js';
import { isLoggedIn, loginWithEmail, loginWithMobile, generateOtp, defaultPermissions } from './auth.js';
import { proceedAfterLogin } from './personal-dashboard.js';

export function renderAuthGate() {
  const gate = document.getElementById('authGate');
  if (isLoggedIn()) { gate.classList.add('hidden'); proceedAfterLogin(); return; }
  gate.classList.remove('hidden');
  const card = document.getElementById('authCard');
  if (APP.users.length === 0 && SUPABASE_OK) renderFirstRunSetup(card);
  else renderLoginChoice(card);
}

function renderFirstRunSetup(card) {
  // Detect if this looks like a returning user (data exists but user list is empty)
  const hasData = APP.employees.length > 0 || Object.keys(APP.months || {}).length > 0;
  const recoveryBanner = hasData ? `
    <div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12.5px;color:#92400E;">
      <b>⚠ It looks like your data already exists</b> — the Admin login was set up before but didn't save properly. Create it again below using the <b>same name and password</b> you originally chose. Your incentive data is safe.
    </div>` : '';

  card.innerHTML = `
    <div class="auth-brand"><div class="brand-dot"></div><div class="auth-title">Workshop Incentive</div></div>
    <div class="auth-sub">First-time setup — create the Admin account. Other logins are managed from the Users tab afterwards.</div>
    ${recoveryBanner}
    <div class="field"><label>Full Name</label><input type="text" id="fr-name" placeholder="e.g. Dhawal Sir"></div>
    <div class="field"><label>Designation</label><input type="text" id="fr-desig" placeholder="e.g. Workshop Manager"></div>
    <div class="field"><label>Mobile Number</label><input type="text" inputmode="numeric" id="fr-mobile" placeholder="10-digit mobile number"></div>
    <div class="field"><label>Email (optional)</label><input type="email" id="fr-email" placeholder="admin@workshop.com"></div>
    <div class="field"><label>Password</label><input type="password" id="fr-pass" placeholder="Set a strong password"></div>
    <div class="auth-error" id="fr-error"></div>
    <button class="btn" id="fr-create" style="width:100%;margin-top:6px;">Create Admin Account</button>
    <div class="auth-security-note">This password only prevents accidental changes — anyone with access to this file can read its data regardless of login.</div>
  `;
  const submit = () => {
    const name = document.getElementById('fr-name').value.trim();
    const desig = document.getElementById('fr-desig').value.trim();
    const mobile = document.getElementById('fr-mobile').value.replace(/\D/g,'');
    const email = document.getElementById('fr-email').value.trim().toLowerCase();
    const pass = document.getElementById('fr-pass').value;
    const err = document.getElementById('fr-error');
    if (!name) { err.textContent = 'Enter your name.'; return; }
    if (mobile.length < 10) { err.textContent = 'Enter a valid 10-digit mobile number.'; return; }
    if (pass.length < 4) { err.textContent = 'Password must be at least 4 characters.'; return; }
    const u = {
      id: uid('u'), name, designation: desig, mobile, email,
      password: pass, role: 'ADMIN',
      permissions: defaultPermissions('ADMIN'),
      _otp: String(Math.floor(100000 + Math.random() * 900000)),
      createdAt: new Date().toISOString()
    };
    APP.users.push(u);
    // Write immediately — no debounce. If this write fails the user gets a
    // clear message and can retry before the page is closed.
    Store.set('users', APP.users).then(ok => {
      if (!ok) toast('⚠ Save failed — do NOT close the app yet. Click retry now in the topbar.', true);
    });
    SESSION.userId = u.id;
    toast('Admin account created — welcome, ' + name);
    renderAuthGate();
  };
  document.getElementById('fr-create').addEventListener('click', submit);
  document.getElementById('fr-pass').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
}

function renderLoginChoice(card) {
  card.innerHTML = `
    <div class="auth-brand"><div class="brand-dot"></div><div class="auth-title">Workshop Incentive</div></div>
    <div class="auth-sub" style="margin-bottom:18px;">Enter your mobile number to receive an OTP, or use email &amp; password.</div>
    <div style="display:flex;gap:8px;margin-bottom:6px;">
      <button class="btn" id="loginByMobile" style="flex:1;">📱 Mobile + OTP</button>
      <button class="btn secondary" id="loginByEmail" style="flex:1;">📧 Email + Password</button>
    </div>
    <div id="loginForm" style="margin-top:16px;"></div>
    <div class="auth-security-note">These credentials only control edits within this tool — they're not real account security.</div>
  `;
  document.getElementById('loginByMobile').addEventListener('click', () => {
    document.getElementById('loginByMobile').classList.remove('secondary');
    document.getElementById('loginByEmail').classList.add('secondary');
    renderMobileOtpForm();
  });
  document.getElementById('loginByEmail').addEventListener('click', () => {
    document.getElementById('loginByEmail').classList.remove('secondary');
    document.getElementById('loginByMobile').classList.add('secondary');
    renderEmailLoginForm();
  });
  renderMobileOtpForm(); // default
}

function renderEmailLoginForm() {
  document.getElementById('loginForm').innerHTML = `
    <div class="field"><label>Email Address</label><input type="email" id="lg-email" placeholder="your@email.com" autocomplete="username"></div>
    <div class="field"><label>Password</label><input type="password" id="lg-pass" placeholder="Your password" autocomplete="current-password"></div>
    <div class="auth-error" id="lg-error"></div>
    <button class="btn" id="lg-submit" style="width:100%;margin-top:4px;">Log In</button>
  `;
  const submit = () => {
    const r = loginWithEmail(document.getElementById('lg-email').value, document.getElementById('lg-pass').value);
    if (!r.ok) { document.getElementById('lg-error').textContent = r.error; return; }
    renderAuthGate();
  };
  document.getElementById('lg-submit').addEventListener('click', submit);
  document.getElementById('lg-pass').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  document.getElementById('lg-email').focus();
}

function renderMobileOtpForm() {
  document.getElementById('loginForm').innerHTML = `
    <div class="field"><label>Mobile Number</label>
      <div style="display:flex;gap:8px;">
        <input type="text" inputmode="numeric" id="lg-mobile" placeholder="10-digit number" style="flex:1;">
        <button class="btn secondary" id="lg-getotp" style="white-space:nowrap;">Get OTP</button>
      </div>
    </div>
    <div id="lg-otp-wrap" style="display:none;">
      <div class="field"><label>OTP (6-digit code)</label><input type="text" inputmode="numeric" id="lg-otp" placeholder="Enter OTP" maxlength="6"></div>
    </div>
    <div class="auth-error" id="lg-error"></div>
    <button class="btn" id="lg-submit" style="width:100%;margin-top:4px;display:none;">Log In</button>
  `;
  document.getElementById('lg-getotp').addEventListener('click', () => {
    const mobile = document.getElementById('lg-mobile').value.replace(/\D/g,'');
    const err = document.getElementById('lg-error');
    if (mobile.length < 10) { err.textContent = 'Enter a valid 10-digit mobile number.'; return; }
    const u = APP.users.find(x => (x.mobile||'').replace(/\D/g,'') === mobile);
    if (!u) { err.textContent = 'No account found with that mobile number.'; return; }
    const otp = generateOtp(u.id);
    err.textContent = '';
    // Show OTP on-screen (Admin shares via WhatsApp)
    document.getElementById('lg-otp-wrap').style.display = '';
    document.getElementById('lg-submit').style.display = '';
    // Show a dismissible OTP display (for Admin to share with the user)
    const wrap = document.getElementById('lg-otp-wrap');
    const existing = document.getElementById('lg-otp-display');
    if (existing) existing.remove();
    const display = document.createElement('div');
    display.id = 'lg-otp-display';
    display.style.cssText = 'background:var(--amber);color:#fff;border-radius:10px;padding:12px 16px;text-align:center;margin-bottom:10px;';
    display.innerHTML = `<div style="font-size:11px;opacity:.85;margin-bottom:4px;">OTP for ${escapeHtml(u.name)} — share via WhatsApp</div><div style="font-size:28px;font-weight:700;letter-spacing:10px;font-family:var(--font-mono);">${otp}</div>`;
    wrap.insertBefore(display, wrap.firstChild);
    document.getElementById('lg-otp').focus();
  });
  document.getElementById('loginForm').addEventListener('click', e => {
    if (e.target.id === 'lg-submit') {
      const mobile = document.getElementById('lg-mobile').value;
      const otp = document.getElementById('lg-otp').value.trim();
      const r = loginWithMobile(mobile, otp);
      if (!r.ok) { document.getElementById('lg-error').textContent = r.error; return; }
      renderAuthGate();
    }
  });
}
