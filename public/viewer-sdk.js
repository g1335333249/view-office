(function () {
  async function preview(options) {
    var container = resolveContainer(options.container);
    var apiBase = resolveApiBase(options.baseUrl);
    cleanupContainer(container);
    setLoading(container);

    try {
      var session = await createSession(options.source || options, apiBase);
      session.apiBase = apiBase;
      container.__viewOfficeSession = session;
      renderFrame(container, session.viewerUrl);
      return session;
    } catch (error) {
      renderError(container, error);
      throw error;
    }
  }

  async function createSession(source, apiBase) {
    if (!source || !source.type) {
      throw new Error("source.type is required: url or file");
    }

    if (source.type === "url") {
      var response = await fetch(apiBase + "/api/preview/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: source.url,
          fileName: source.fileName,
          fileType: source.fileType,
          parentOrigin: window.location.origin
        })
      });
      return parseResponse(response);
    }

    if (source.type === "file") {
      var params = new URLSearchParams({
        fileName: source.fileName || source.file.name || "document",
        fileType: source.fileType || extensionOf(source.fileName || source.file.name || ""),
        parentOrigin: window.location.origin
      });
      var response = await fetch(apiBase + "/api/preview/upload?" + params.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: source.file
      });
      return parseResponse(response);
    }

    throw new Error("Unsupported source type: " + source.type);
  }

  function cleanup(sessionOrFileId, apiBase) {
    var fileId = typeof sessionOrFileId === "string" ? sessionOrFileId : sessionOrFileId && sessionOrFileId.fileId;
    var base = apiBase || (sessionOrFileId && sessionOrFileId.apiBase) || resolveApiBase();
    if (!fileId) {
      return Promise.resolve(false);
    }

    var url = base + "/api/preview/" + encodeURIComponent(fileId) + "/cleanup";
    if (navigator.sendBeacon) {
      var sent = navigator.sendBeacon(url, new Blob([], { type: "application/octet-stream" }));
      if (sent) {
        return Promise.resolve(true);
      }
    }

    return fetch(url, { method: "POST", keepalive: true }).then(function () {
      return true;
    }).catch(function () {
      return false;
    });
  }

  function cleanupContainer(container) {
    if (container && container.__viewOfficeSession) {
      cleanup(container.__viewOfficeSession);
      container.__viewOfficeSession = null;
    }
  }

  function resolveApiBase(baseUrl) {
    if (baseUrl) {
      return String(baseUrl).replace(/\/+$/, "");
    }

    var script = document.currentScript;
    if (!script) {
      var scripts = document.querySelectorAll("script[src]");
      script = scripts[scripts.length - 1];
    }

    if (script && script.src) {
      return new URL(script.src, window.location.href).origin;
    }

    return window.location.origin;
  }

  async function parseResponse(response) {
    var payload = await response.json().catch(function () {
      return {};
    });
    if (!response.ok) {
      throw new Error(payload.error || "Preview session failed");
    }
    return payload;
  }

  function resolveContainer(container) {
    if (typeof container === "string") {
      var element = document.querySelector(container);
      if (!element) {
        throw new Error("Container not found: " + container);
      }
      return element;
    }
    if (!container) {
      throw new Error("container is required");
    }
    return container;
  }

  function setLoading(container) {
    container.innerHTML = '<div class="vo-state">正在创建预览...</div>';
  }

  function renderFrame(container, viewerUrl) {
    container.innerHTML = "";
    var iframe = document.createElement("iframe");
    iframe.src = viewerUrl;
    iframe.allow = "clipboard-read; clipboard-write; fullscreen";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    iframe.style.display = "block";
    container.appendChild(iframe);
  }

  function renderError(container, error) {
    container.innerHTML = '<div class="vo-state vo-error">' + escapeHtml(error.message) + "</div>";
  }

  function extensionOf(name) {
    var parts = String(name || "").split(".");
    return parts.length > 1 ? parts.pop().toLowerCase() : "bin";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char];
    });
  }

  window.ViewOffice = { preview: preview, cleanup: cleanup };
})();
