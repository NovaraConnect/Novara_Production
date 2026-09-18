import Foundation

/// The JavaScript the native shell injects into every page load.
///
/// WHY THIS EXISTS AT ALL
/// ---------------------
/// The shell loads the live production web app from app.novaraconnect.group.
/// That means the native binary and the web app ship on completely separate
/// schedules: a TestFlight build can be installed days before, or days after,
/// the matching web deploy reaches Render.
///
/// So this script is written to work against the web app *as already deployed*,
/// using nothing but standard DOM and History APIs:
///
///   • `navigate()` drives the existing wouter router with pushState + a
///     popstate event, which wouter already listens for. No web change needed.
///   • route reporting patches history.pushState/replaceState, which every
///     client-side router calls. No web change needed.
///   • the legacy bottom nav is hidden from here, so the native tab bar is
///     never shown next to a second, redundant web one.
///
/// A web build that knows about the shell sets `window.__NOVARA_NATIVE_AWARE__`
/// (see src/lib/nativeBridge.ts). When it does, this script stops hiding the
/// web nav — the web app is doing it itself — and the richer features
/// (`pickContact`, `scanCard`) become available to it.
///
/// KEEP THIS SCRIPT DEFENSIVE. It runs before the app's own code on a page we
/// do not control the release timing of; anything it throws would break Novara
/// on a real user's phone with no way to hot-fix it.
enum NovaraBridgeScript {

    /// Bumped whenever the message contract below changes, so the web side can
    /// feature-detect instead of assuming.
    static let version = 1

    static let source: String = """
    (function () {
      'use strict';
      if (window.NovaraNative && window.NovaraNative.version) { return; }

      var VERSION = \(version);
      var pending = {};
      var nextId = 0;

      function post(message) {
        try {
          window.webkit.messageHandlers.novara.postMessage(message);
        } catch (e) {
          // No handler (e.g. the page opened outside the shell). Never throw.
        }
      }

      function currentPath() {
        try {
          return window.location.pathname + window.location.search + window.location.hash;
        } catch (e) {
          return '/';
        }
      }

      var lastReported = null;
      function reportRoute() {
        var path = currentPath();
        if (path === lastReported) { return; }
        lastReported = path;
        post({ name: 'route', path: path });
        hideLegacyNav();
      }

      // ---- navigation -------------------------------------------------------
      // pushState alone does not notify a router; wouter (like every
      // history-based router) listens for popstate, so we dispatch one.
      function go(path, replace) {
        try {
          if (replace) { window.history.replaceState({}, '', path); }
          else { window.history.pushState({}, '', path); }
          window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        } catch (e) {
          window.location.href = path;
        }
        reportRoute();
      }

      // ---- native -> web ----------------------------------------------------
      function settle(id, ok, payload) {
        var entry = pending[id];
        if (!entry) { return; }
        delete pending[id];
        if (ok) { entry.resolve(payload); }
        else { entry.reject(new Error((payload && payload.message) || 'Native request failed')); }
      }

      function emit(name, detail) {
        try {
          window.dispatchEvent(new CustomEvent('novara:' + name, { detail: detail }));
        } catch (e) { /* ignore */ }
      }

      // ---- web -> native requests -------------------------------------------
      function request(method, params) {
        return new Promise(function (resolve, reject) {
          var id = 'n' + (++nextId);
          pending[id] = { resolve: resolve, reject: reject };
          post({ name: 'request', id: id, method: method, params: params || {} });
        });
      }

      window.NovaraNative = {
        version: VERSION,
        platform: 'ios',
        navigate: function (path) { go(path, false); },
        replace: function (path) { go(path, true); },
        back: function () { try { window.history.back(); } catch (e) {} },
        haptic: function (style) { post({ name: 'haptic', style: style || 'selection' }); },
        pickContact: function () { return request('pickContact'); },
        scanCard: function () { return request('scanCard'); },
        openSettings: function () { post({ name: 'openAppSettings' }); },
        _settle: settle,
        _emit: emit
      };

      // ---- route reporting ---------------------------------------------------
      ['pushState', 'replaceState'].forEach(function (method) {
        var original = window.history[method];
        if (typeof original !== 'function') { return; }
        window.history[method] = function () {
          var result = original.apply(this, arguments);
          try { reportRoute(); } catch (e) {}
          return result;
        };
      });
      window.addEventListener('popstate', reportRoute);
      window.addEventListener('hashchange', reportRoute);

      // ---- redundant web navigation ------------------------------------------
      // Only while the deployed web build does not yet know it is running in
      // the shell. Once it does, it renders no bottom nav and this is inert.
      var STYLE_ID = 'novara-native-shell-style';
      function ensureStyle() {
        if (document.getElementById(STYLE_ID) || !document.head) { return; }
        var style = document.createElement('style');
        style.id = STYLE_ID;
        // The web pages pad their bottom to clear the web nav bar. With the
        // native tab bar living outside the web view, that padding is dead
        // space, so it is reduced to ordinary breathing room.
        style.textContent =
          'html.novara-native .pb-24 { padding-bottom: 1.5rem !important; }' +
          'html.novara-native .pb-nav { padding-bottom: 1.5rem !important; }';
        document.head.appendChild(style);
      }

      function hideLegacyNav() {
        if (window.__NOVARA_NATIVE_AWARE__) { return; }
        try {
          // ALL of them, not just the first: every page renders its own
          // <BottomNav/>, so a hidden one from the previous screen can still be
          // in the DOM while the new screen's is freshly mounted and visible.
          var links = document.querySelectorAll('a[data-testid^="nav-"]');
          for (var i = 0; i < links.length; i++) {
            var node = links[i];
            for (var depth = 0; depth < 6 && node && node.parentElement; depth++) {
              node = node.parentElement;
              if (node.getAttribute && node.getAttribute('data-novara-nav-hidden')) { break; }
              if (window.getComputedStyle(node).position === 'fixed') {
                node.style.display = 'none';
                if (node.setAttribute) { node.setAttribute('data-novara-nav-hidden', '1'); }
                break;
              }
            }
          }
        } catch (e) { /* never break the page over chrome */ }
      }

      // A route change is reported synchronously from inside pushState, which is
      // BEFORE React has rendered the new screen — so hiding on route change
      // alone always loses the race with the nav it is trying to hide. Watching
      // the DOM is the only timing-independent answer, and unlike the startup
      // sweep it does not expire.
      var navObserver = null;
      function watchForLegacyNav() {
        if (window.__NOVARA_NATIVE_AWARE__ || navObserver) { return; }
        if (typeof MutationObserver === 'undefined' || !document.body) { return; }
        var scheduled = false;
        navObserver = new MutationObserver(function () {
          if (scheduled) { return; }
          scheduled = true;
          // Coalesce a render's worth of mutations into one pass.
          requestAnimationFrame(function () {
            scheduled = false;
            if (window.__NOVARA_NATIVE_AWARE__) {
              navObserver.disconnect();
              navObserver = null;
              return;
            }
            hideLegacyNav();
          });
        });
        navObserver.observe(document.body, { childList: true, subtree: true });
      }

      function boot() {
        try { document.documentElement.classList.add('novara-native'); } catch (e) {}
        ensureStyle();
        hideLegacyNav();
        watchForLegacyNav();
        reportRoute();
        post({ name: 'ready', version: VERSION });
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
      } else {
        boot();
      }
      // The app renders asynchronously, so the nav may not exist at DOMContentLoaded.
      var sweeps = 0;
      var sweep = setInterval(function () {
        ensureStyle();
        watchForLegacyNav();
        hideLegacyNav();
        if (++sweeps > 20) { clearInterval(sweep); }
      }, 400);
    })();
    """
}
