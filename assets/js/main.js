(function () {
  'use strict';

  // Adresse qui reçoit les demandes du formulaire.
  var CONTACT_EMAIL = 'contact@example.com';

  var nav = document.getElementById('nav');
  var toggle = nav.querySelector('.nav__toggle');
  var road = document.querySelector('.road');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  // Barre de navigation et marquage au sol au défilement -------------------

  var ticking = false;

  function onScroll() {
    var y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 8);
    if (road && !reduceMotion) {
      road.style.setProperty('--road-x', (-y * 0.6).toFixed(1) + 'px');
    }
    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      window.requestAnimationFrame(onScroll);
      ticking = true;
    }
  }, { passive: true });

  onScroll();

  // Choix d'un forfait → préremplit le formulaire ---------------------------

  var form = document.getElementById('contact-form');
  var planSelect = document.getElementById('f-plan');

  document.querySelectorAll('[data-plan]').forEach(function (button) {
    button.addEventListener('click', function () {
      planSelect.value = button.getAttribute('data-plan');
    });
  });

  // Formulaire de contact ---------------------------------------------------
  // Le site est statique : la demande est rédigée dans la messagerie du visiteur.

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
      'Forfait : ' + planSelect.value,
      'Nom : ' + name,
      'Téléphone : ' + phone
    ];
    if (email) lines.push('E-mail : ' + email);
    if (messageInput.value.trim()) lines.push('', messageInput.value.trim());

    var href = 'mailto:' + CONTACT_EMAIL +
      '?subject=' + encodeURIComponent('Demande d’inscription – ' + planSelect.value) +
      '&body=' + encodeURIComponent(lines.join('\n'));

    window.location.href = href;
    showStatus('Votre messagerie s’ouvre avec la demande prête à envoyer. Si rien ne s’ouvre, écrivez-nous à ' + CONTACT_EMAIL + '.');
  });

  // Année du pied de page -----------------------------------------------------

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
