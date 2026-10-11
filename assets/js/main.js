(function () {
  'use strict';

  // Adresse qui reçoit les demandes du formulaire.
  var CONTACT_EMAIL = 'contact@example.com';

  var root = document.documentElement;
  var nav = document.getElementById('nav');
  var toggle = nav.querySelector('.nav__toggle');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatEuros(value) {
    return value.toLocaleString('fr-FR').replace(/\s/g, ' ') + ' €';
  }

  // Menu mobile ------------------------------------------------------------

  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
  }

  toggle.addEventListener('click', function () {
    setMenu(!nav.classList.contains('is-open'));
  });

  nav.querySelectorAll('.nav__links a').forEach(function (link) {
    link.addEventListener('click', function () {
      setMenu(false);
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) {
      setMenu(false);
      toggle.focus();
    }
  });

  // Barre de navigation et progression de lecture --------------------------

  var ticking = false;

  function onScroll() {
    var y = window.scrollY;
    var max = root.scrollHeight - window.innerHeight;
    nav.classList.toggle('is-scrolled', y > 12);
    nav.style.setProperty('--progress', max > 0 ? (y / max).toFixed(4) : '0');
    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      window.requestAnimationFrame(onScroll);
      ticking = true;
    }
  }, { passive: true });

  onScroll();

  // Accueil : la souris tient le volant -------------------------------------

  var hero = document.querySelector('.hero');
  var scene = document.getElementById('scene');

  if (hero && scene && finePointer && !reduceMotion) {
    hero.addEventListener('pointermove', function (event) {
      var rect = scene.getBoundingClientRect();
      var centre = rect.left + rect.width / 2;
      var steer = clamp((event.clientX - centre) / (window.innerWidth / 2), -1, 1);
      var tiltX = clamp((event.clientY - (rect.top + rect.height / 2)) / window.innerHeight, -0.5, 0.5);
      scene.style.setProperty('--steer', steer.toFixed(3));
      scene.style.setProperty('--tilt-x', (tiltX * -6).toFixed(2) + 'deg');

      var heroRect = hero.getBoundingClientRect();
      hero.style.setProperty('--mx', ((event.clientX - heroRect.left) / heroRect.width * 100).toFixed(1) + '%');
      hero.style.setProperty('--my', ((event.clientY - heroRect.top) / heroRect.height * 100).toFixed(1) + '%');
    });

    hero.addEventListener('pointerleave', function () {
      scene.style.setProperty('--steer', '0');
      scene.style.setProperty('--tilt-x', '0deg');
    });
  }

  // Cartes en 3D qui suivent la souris --------------------------------------

  if (finePointer && !reduceMotion) {
    document.querySelectorAll('[data-tilt]').forEach(function (card) {
      var frame = 0;
      var maxAngle = card.classList.contains('tile') ? 12 : 8;

      card.addEventListener('pointermove', function (event) {
        var rect = card.getBoundingClientRect();
        var px = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        var py = clamp((event.clientY - rect.top) / rect.height, 0, 1);
        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(function () {
          card.classList.add('is-tilting');
          card.style.setProperty('--rx', ((0.5 - py) * maxAngle).toFixed(2) + 'deg');
          card.style.setProperty('--ry', ((px - 0.5) * maxAngle).toFixed(2) + 'deg');
          card.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
          card.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
        });
      });

      card.addEventListener('pointerleave', function () {
        window.cancelAnimationFrame(frame);
        card.classList.remove('is-tilting');
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  // Apparition au défilement et compteurs -----------------------------------

  function countUp(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (!target || reduceMotion) return;
    var start = null;
    var duration = 1100;
    function step(time) {
      if (start === null) start = time;
      var t = Math.min(1, (time - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(target * eased));
      if (t < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }

  function reveal(el) {
    el.classList.remove('reveal-pending');
    el.classList.add('is-visible');
    el.querySelectorAll('[data-count]').forEach(countUp);
  }

  var revealables = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));

  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          reveal(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });

    revealables.forEach(function (el) {
      // Seuls les blocs encore sous la ligne de flottaison sont masqués.
      if (!reduceMotion && el.getBoundingClientRect().top > window.innerHeight) {
        el.classList.add('reveal-pending');
      }
      observer.observe(el);
    });
  } else {
    revealables.forEach(reveal);
  }

  // Illustrations SVG animées : à l'arrêt si l'utilisateur réduit les animations.
  if (reduceMotion) {
    document.querySelectorAll('svg').forEach(function (svg) {
      if (typeof svg.pauseAnimations === 'function') svg.pauseAnimations();
    });
  }

  // Formulaire : forfait, option et total estimé -----------------------------

  var form = document.getElementById('contact-form');
  var planSelect = document.getElementById('f-plan');
  var optionSelect = document.getElementById('f-option');
  var optionHint = document.getElementById('option-hint');
  var totalEl = document.getElementById('total');

  function selectedPlan() {
    return planSelect.options[planSelect.selectedIndex];
  }

  function selectedOption() {
    return optionSelect.options[optionSelect.selectedIndex];
  }

  function updateTotal() {
    var plan = selectedPlan();
    var isCar = plan.hasAttribute('data-car');
    var undecided = !plan.hasAttribute('data-price');

    // Les options ne s'ajoutent qu'à un forfait voiture.
    optionSelect.disabled = !isCar && !undecided;
    if (optionSelect.disabled) optionSelect.value = 'Aucune';
    optionHint.hidden = !optionSelect.disabled;

    var text = 'À définir';
    if (!undecided) {
      var total = parseInt(plan.getAttribute('data-price'), 10) +
        (isCar ? parseInt(selectedOption().getAttribute('data-price'), 10) : 0);
      text = formatEuros(total);
    }

    if (totalEl.textContent !== text) {
      totalEl.textContent = text;
      totalEl.classList.remove('is-bumped');
      void totalEl.offsetWidth;
      totalEl.classList.add('is-bumped');
    }
  }

  planSelect.addEventListener('change', updateTotal);
  optionSelect.addEventListener('change', updateTotal);

  document.querySelectorAll('[data-plan]').forEach(function (button) {
    button.addEventListener('click', function () {
      planSelect.value = button.getAttribute('data-plan');
      updateTotal();
    });
  });

  document.querySelectorAll('[data-option]').forEach(function (button) {
    button.addEventListener('click', function () {
      // Une option demande un forfait voiture : on en propose un par défaut.
      if (!selectedPlan().hasAttribute('data-car')) {
        planSelect.value = 'Boîte manuelle – 20 heures';
      }
      updateTotal();
      optionSelect.value = button.getAttribute('data-option');
      updateTotal();
    });
  });

  updateTotal();

  // Envoi : le site est statique, la demande est rédigée dans la messagerie du visiteur.

  var status = document.getElementById('form-status');
  var nameInput = document.getElementById('f-name');
  var phoneInput = document.getElementById('f-phone');
  var emailInput = document.getElementById('f-email');
  var messageInput = document.getElementById('f-message');

  function showStatus(text, isError) {
    status.textContent = text;
    status.classList.toggle('is-error', Boolean(isError));
  }

  [nameInput, phoneInput, emailInput].forEach(function (input) {
    input.addEventListener('input', function () {
      input.removeAttribute('aria-invalid');
    });
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var name = nameInput.value.trim();
    var phone = phoneInput.value.trim();
    var email = emailInput.value.trim();
    var missing = [];

    if (!name) missing.push(nameInput);
    if (phone.replace(/\D/g, '').length < 10) missing.push(phoneInput);
    if (email && !emailInput.checkValidity()) missing.push(emailInput);

    [nameInput, phoneInput, emailInput].forEach(function (input) {
      if (missing.indexOf(input) === -1) {
        input.removeAttribute('aria-invalid');
      } else {
        input.setAttribute('aria-invalid', 'true');
      }
    });

    if (missing.length) {
      var first = missing[0];
      var hint = first === nameInput
        ? 'Indiquez votre nom et prénom.'
        : first === phoneInput
          ? 'Indiquez un numéro de téléphone à 10 chiffres pour que nous puissions vous rappeler.'
          : 'Vérifiez votre adresse e-mail, ou laissez ce champ vide.';
      showStatus(hint, true);
      first.focus();
      return;
    }

    var lines = [
      'Bonjour,',
      '',
      'Je souhaite m’inscrire à l’auto-école.',
      '',
      'Forfait : ' + planSelect.value
    ];
    if (!optionSelect.disabled && optionSelect.value !== 'Aucune') {
      lines.push('Option : ' + optionSelect.value + ' (+200 €)');
    }
    if (totalEl.textContent !== 'À définir') lines.push('Total estimé : ' + totalEl.textContent);
    lines.push('Nom : ' + name, 'Téléphone : ' + phone);
    if (email) lines.push('E-mail : ' + email);
    if (messageInput.value.trim()) lines.push('', messageInput.value.trim());

    var href = 'mailto:' + CONTACT_EMAIL +
      '?subject=' + encodeURIComponent('Demande d’inscription – ' + planSelect.value) +
      '&body=' + encodeURIComponent(lines.join('\n'));

    window.location.href = href;
    showStatus('Votre messagerie s’ouvre avec la demande prête à envoyer. Si rien ne s’ouvre, écrivez-nous à ' + CONTACT_EMAIL + '.');
  });

  // Année du pied de page ----------------------------------------------------

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
