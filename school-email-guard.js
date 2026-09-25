/* Stops NYC school student addresses (@nycstudents.net) on every email field.
   That mail system rejects email from outside senders ("550 5.7.1 E-mail
   Rejected"), so a diagnostic link, a score report or a booking invite sent
   there never arrives. On 2026-09-24 one family asked for the SHSAT link three
   times and all three bounced. Near misspellings of the domain are caught too
   (one edit anywhere, or two edits after "nyc"), since those bounce as well.

   Two modes, set per form:
   - default: block, and ask for a personal or parent email.
   - data-school-email="warn" (the booking forms, which also require a phone):
     warn once, and let a second press through with the same address, so a
     family with only a school email can still book and be reached by phone.

   Runs in the capture phase on document, so it sees every form before the
   page's own submit handler (several forms are novalidate and validate in JS).
   The message language follows <html lang> at the moment it is shown, because
   seminar.html switches EN/中文 after load. */
(function () {
  var DOMAIN = 'nycstudents.net';
  var MSG = {
    block: {
      en: 'Please use a personal or parent email. We can’t deliver to @nycstudents.net school accounts.',
      zh: '请改用个人或家长的邮箱。@nycstudents.net 学校邮箱会拒收外部邮件，我们发的邮件无法送达。'
    },
    warn: {
      en: 'We can’t email @nycstudents.net school accounts, so please use a personal or parent email. To book anyway, press the button again and we’ll reach you by phone.',
      zh: '我们无法向 @nycstudents.net 学校邮箱发送邮件，请改用个人或家长的邮箱。如仍要预约，请再次点击按钮，我们会通过电话与您联系。'
    }
  };
  var ALL = [MSG.block.en, MSG.block.zh, MSG.warn.en, MSG.warn.zh];

  function distance(a, b) {
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function isSchoolAddress(value) {
    var m = /@([^@\s]+)$/.exec(String(value || '').trim().toLowerCase());
    if (!m) return false;
    var d = m[1].replace(/\.+$/, '');
    if (d === DOMAIN || d.slice(-(DOMAIN.length + 1)) === '.' + DOMAIN) return true;
    var k = distance(d, DOMAIN);
    return k <= 1 || (k === 2 && d.slice(0, 3) === 'nyc');
  }

  function lang() {
    return /^zh/i.test(document.documentElement.getAttribute('lang') || '') ? 'zh' : 'en';
  }

  function isEmailField(el) {
    return !!el && el.tagName === 'INPUT' && (el.getAttribute('type') || '').toLowerCase() === 'email';
  }

  function isOurs(text) {
    return ALL.indexOf(text) !== -1;
  }

  // The form's own inline error line (book, consulting, seminar, refer, the
  // diagnostics). A form without one gets one, so the message never depends
  // only on the native bubble, which fades or is closed by the warn-mode reset.
  function showInline(form, text) {
    if (!form) return;
    var el = form.querySelector('[role="alert"]');
    if (!el) {
      el = document.createElement('p');
      el.setAttribute('role', 'alert');
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('data-school-guard', '');
      el.style.cssText = 'margin:12px 0 0;font-size:14px;line-height:1.5;color:#B3261E;';
      var btn = form.querySelector('[type="submit"], button:not([type])');
      if (btn && btn.parentNode) btn.parentNode.insertBefore(el, btn); else form.appendChild(el);
    }
    el.textContent = text;
    el.style.display = 'block';
  }
  function clearInline(form) {
    var el = form && form.querySelector('[role="alert"]');
    if (el && isOurs(el.textContent)) { el.textContent = ''; el.style.display = 'none'; }
  }

  function clearField(input) {
    if (isOurs(input.validationMessage)) input.setCustomValidity('');
    input.removeAttribute('aria-invalid');
  }

  // Typing clears our message (only ours) so the field is never stuck.
  document.addEventListener('input', function (e) {
    if (!isEmailField(e.target)) return;
    clearField(e.target);
    if (!isSchoolAddress(e.target.value)) clearInline(e.target.form);
  }, true);

  // Leaving the field flags it early on block-mode forms (warn-mode forms only speak up on submit).
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!isEmailField(t) || (t.form && t.form.getAttribute('data-school-email') === 'warn')) return;
    if (isSchoolAddress(t.value)) t.setCustomValidity(MSG.block[lang()]);
  }, true);

  // Forms without novalidate stop at the browser's own check, so the submit
  // listener below never runs for them. Mirror our message into the page there.
  document.addEventListener('invalid', function (e) {
    var t = e.target;
    if (!isEmailField(t) || !isOurs(t.validationMessage)) return;
    var kind = (t.validationMessage === MSG.warn.en || t.validationMessage === MSG.warn.zh) ? 'warn' : 'block';
    var text = MSG[kind][lang()];
    t.setCustomValidity(text);
    t.setAttribute('aria-invalid', 'true');
    showInline(t.form, text);
  }, true);

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.querySelectorAll) return;
    var warnMode = form.getAttribute('data-school-email') === 'warn';
    var fields = form.querySelectorAll('input[type="email"]');
    var firstBad = null;
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      clearField(f);
      if (!isSchoolAddress(f.value)) continue;
      var value = f.value.trim().toLowerCase();
      if (warnMode && f.getAttribute('data-school-warned') === value) continue; // second press: let it through
      if (!firstBad) firstBad = f;
    }
    if (!firstBad) { clearInline(form); return; }
    var text = MSG[warnMode ? 'warn' : 'block'][lang()];
    if (warnMode) firstBad.setAttribute('data-school-warned', firstBad.value.trim().toLowerCase());
    firstBad.setCustomValidity(text);
    firstBad.setAttribute('aria-invalid', 'true');
    e.preventDefault();
    e.stopImmediatePropagation();
    showInline(form, text);
    try { firstBad.focus(); } catch (err) {}
    try { firstBad.reportValidity(); } catch (err) {}
    // Warn mode: the warning must not block the page's own validation on the second press.
    if (warnMode) setTimeout(function () { firstBad.setCustomValidity(''); }, 0);
  }, true);

  window.ivpIsSchoolEmail = isSchoolAddress;
})();
