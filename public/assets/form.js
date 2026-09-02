(function () {
  var form = document.getElementById('enquiry');
  if (!form) return;

  var status = document.getElementById('f-status');
  var button = document.getElementById('f-submit');
  var openedAt = Date.now();

  function say(text, tone) {
    status.textContent = text;
    status.className = 'form-note' + (tone ? ' ' + tone : '');
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    // Anything filled in under two seconds is a script, not a reader.
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
    say('Sending.');

    fetch('/api/enquiries', {
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
          say('Sent. We will come back to you ourselves.', 'ok');
          return;
        }
        if (result.status === 422 && result.data.fields) {
          var first = Object.keys(result.data.fields)[0];
          say(result.data.fields[first], 'bad');
          return;
        }
        say(result.data.error || 'That did not go through. Email works instead.', 'bad');
      })
      .catch(function () {
        say('No connection to the server. Email works instead.', 'bad');
      })
      .finally(function () {
        button.disabled = false;
        openedAt = Date.now();
      });
  });
})();
