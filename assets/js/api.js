window.RetinaApi = (function () {
  'use strict';

  async function request(method, path, body) {
    const options = {
      method,
      credentials: 'same-origin',
      headers: { 'X-RetinaGuard-Client': 'browser' }
    };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetch(path, options);
    } catch (networkError) {
      const error = new Error('The RetinaGuard server did not respond. Run start.bat, then open http://127.0.0.1:8080.');
      error.cause = networkError;
      throw error;
    }
    const raw = await response.text();
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch (parseError) {
      payload = {};
    }
    if (!response.ok) {
      const looksLikeHtml = raw.trim().startsWith('<');
      const message = payload.error || (looksLikeHtml || response.status === 404
        ? 'Sign-in did not reach the RetinaGuard API (HTTP ' + response.status + '). Run start.bat and open http://127.0.0.1:8080. Accounts are stored by that server in a local SQLite file, not in Flask or MySQL.'
        : 'Sign-in was rejected (HTTP ' + response.status + ').');
      const error = new Error(message);
      error.status = response.status;
      error.needsSetup = Boolean(payload.needsSetup);
      throw error;
    }
    return payload;
  }

  return { request };
})();
