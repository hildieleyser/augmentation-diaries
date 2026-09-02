(function () {
  var form = document.getElementById('enquiry');
  if (!form) return;

  // The form needs the Node backend. On a static host (GitHub Pages) there is
  // none, so it stays hidden and the email line does the job instead.
  fetch('healthz', { method: 'GET' })
    .then(function (response) {
      if (response.ok) form.hidden = false;
    })
    .catch(function () {
      /* no backend here, leave the form hidden */
    });

  var status = document.getElementById('f-status');
  var button = document.getElementById('f-submit');
  var openedAt = Date.now();

  var FIELDS = { name: 'f-name', email: 'f-email', message: 'f-message' };

  function say(text, tone) {
    status.textContent = text;
    status.className = 'form-note' + (tone ? ' ' + tone : '');
  }

  function clearErrors() {
    Object.keys(FIELDS).forEach(function (key) {
      var input = document.getElementById(FIELDS[key]);
      var slot = document.getElementById('e-' + key);
      if (input) input.removeAttribute('aria-invalid');
      if (slot) {
        slot.textContent = '';
        slot.hidden = true;
      }
    });
  }

  // Errors go next to the field they belong to, and the first bad field takes
  // focus, so a screen reader announces the label and the message together.
  function showErrors(fields) {
    var firstBad = null;
    Object.keys(fields).forEach(function (key) {
      var input = document.getElementById(FIELDS[key]);
      var slot = document.getElementById('e-' + key);
      if (!input || !slot) return;
      input.setAttribute('aria-invalid', 'true');
      slot.textContent = fields[key];
      slot.hidden = false;
      if (firstBad === null) firstBad = input;
    });
    if (firstBad !== null) {
      firstBad.focus();
      say('That did not send. Check the message under the field.', 'bad');
    } else {
      var first = Object.keys(fields)[0];
      say(fields[first], 'bad');
    }
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    clearErrors();

    // Anything completed in under two seconds is a script, not a reader.
    if (Date.now() - openedAt < 2000) {
      say('Give that another moment, then send again.', 'bad');
      return;
    }

    var payload = {
      name: form.elements.name.value,
      email: form.elements.email.value,
      message: form.elements.message.value,
      kind: form.elements.kind.value,
      role: form.elements.role.value,
    };

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    say('Sending.');

    fetch('api/enquiries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (response) {
        return response.json().then(function (data) {
          return { status: response.status, data: data };
        });
      })
      .then(function (result) {
        if (result.status === 201 || result.status === 202) {
          form.reset();
          // role="status" announces this on its own, so leave focus alone.
          say('Sent. We will come back to you ourselves.', 'ok');
          return;
        }
        if (result.status === 422 && result.data.fields) {
          showErrors(result.data.fields);
          return;
        }
        say(result.data.error || 'That did not go through. Email works instead.', 'bad');
      })
      .catch(function () {
        say('No connection to the server. Email works instead.', 'bad');
      })
      .finally(function () {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        openedAt = Date.now();
      });
  });
})();
