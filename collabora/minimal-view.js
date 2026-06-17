(function () {
  var selectors = [
    '.main-nav',
    '#content-keeper',
    '#main-menu',
    '#document-titlebar',
    '#viewMode',
    '#userListHeader',
    '#closebuttonwrapper',
    '#toolbar-wrapper',
    '#toolbar-search',
    '#mobile-edit-button',
    '#mobile-wizard',
    '#iframe-feedback',
    '.iframe-feedback-modal',
    '.iframe-feedback-wrap',
    '#navigation-sidebar',
    '#navigator-floating-icon',
    '#sidebar-dock-wrapper',
    '#aichat-dock-wrapper',
    '#presentation-controls-wrapper',
    '#slide-sorter'
  ];

  function isSpreadsheet() {
    var body = document.body;
    var root = document.documentElement;
    var bodyType = body && (body.getAttribute('data-doctype') || body.getAttribute('data-docType'));
    var rootType = root && (root.getAttribute('data-doctype') || root.getAttribute('data-docType'));
    return bodyType === 'spreadsheet' || rootType === 'spreadsheet' || !!document.querySelector('.spreadsheet-tab');
  }

  function isPresentation() {
    return getDocType() === 'presentation';
  }

  function getDocType() {
    var body = document.body;
    var root = document.documentElement;
    var bodyType = body && (body.getAttribute('data-doctype') || body.getAttribute('data-docType'));
    var rootType = root && (root.getAttribute('data-doctype') || root.getAttribute('data-docType'));
    if (bodyType || rootType) return bodyType || rootType;
    if (window.app && window.app.map && typeof window.app.map.getDocType === 'function') {
      try {
        return window.app.map.getDocType();
      } catch (error) {
        return '';
      }
    }
    return '';
  }

  function isPageStatusElement(element) {
    var id = (element.id || '').toLowerCase();
    var text = (element.textContent || '').trim();
    var pageTokens = [
      'statepagenumber',
      'statusdocpos',
      'slidestatus',
      'pagestatus',
      'documentstatus'
    ];

    return pageTokens.some(function (token) {
      return id.indexOf(token) !== -1;
    }) || /^page\s+\d+\s+of\s+\d+$/i.test(text) || /^\d+\s*\/\s*\d+$/.test(text);
  }

  function showElementChain(element) {
    var current = element;
    while (current && current.id !== 'toolbar-down' && current !== document.body) {
      current.style.setProperty('display', '', 'important');
      current.style.setProperty('visibility', 'visible', 'important');
      current = current.parentElement;
    }
  }

  function configureBottomStatusBar(spreadsheet, presentation) {
    var toolbarDown = document.getElementById('toolbar-down');
    if (!toolbarDown) return;

    if (spreadsheet) {
      toolbarDown.style.setProperty('display', 'none', 'important');
      return;
    }

    toolbarDown.style.setProperty('display', 'flex', 'important');
    toolbarDown.style.setProperty('position', 'fixed', 'important');
    toolbarDown.style.setProperty('left', '0', 'important');
    toolbarDown.style.setProperty('right', '0', 'important');
    toolbarDown.style.setProperty('bottom', '0', 'important');
    toolbarDown.style.setProperty('height', '34px', 'important');
    toolbarDown.style.setProperty('min-height', '34px', 'important');
    toolbarDown.style.setProperty('z-index', '30', 'important');
    toolbarDown.style.setProperty('pointer-events', 'none', 'important');

    toolbarDown.querySelectorAll('[id]').forEach(function (element) {
      var id = (element.id || '').toLowerCase();
      if (id.indexOf('toolbar-down') !== -1 || id.indexOf('tb_toolbar-down') !== -1 || id.indexOf('w2ui') !== -1) return;
      if (!isPageStatusElement(element)) {
        element.style.setProperty('display', 'none', 'important');
      }
    });

    toolbarDown.querySelectorAll('[id]').forEach(function (element) {
      if (isPageStatusElement(element)) showElementChain(element);
    });

    toolbarDown.querySelectorAll('button, a, [role="button"], .unobutton').forEach(function (element) {
      element.style.setProperty('pointer-events', 'none', 'important');
      element.setAttribute('tabindex', '-1');
    });
  }

  function getRectArray(rect) {
    if (!rect) return null;
    if (typeof rect.toArray === 'function') return rect.toArray();
    if (typeof rect.x1 === 'number' && typeof rect.y1 === 'number' && typeof rect.width === 'number' && typeof rect.height === 'number') {
      return [rect.x1, rect.y1, rect.width, rect.height];
    }
    if (Array.isArray(rect) && rect.length >= 4) return rect;
    return null;
  }

  function computeVisibleWriterPage() {
    if (!window.app || !app.file || !app.file.writer || !app.activeDocument || !app.activeDocument.activeLayout) return null;

    var pageRects = app.file.writer.pageRectangleList;
    var viewedRect = app.activeDocument.activeLayout.viewedRectangle;
    var view = getRectArray(viewedRect);
    if (!pageRects || !pageRects.length || !view) return null;

    var viewTop = view[1];
    var viewBottom = view[1] + view[3];
    var viewCenter = viewTop + view[3] / 2;
    var bestPage = 0;
    var bestScore = -1;

    for (var index = 0; index < pageRects.length; index += 1) {
      var rect = getRectArray(pageRects[index]);
      if (!rect) continue;

      var pageTop = rect[1];
      var pageBottom = rect[1] + rect[3];
      if (viewCenter >= pageTop && viewCenter <= pageBottom) {
        return { current: index + 1, total: pageRects.length };
      }

      var overlap = Math.max(0, Math.min(viewBottom, pageBottom) - Math.max(viewTop, pageTop));
      if (overlap > bestScore) {
        bestScore = overlap;
        bestPage = index;
      }
    }

    return { current: bestPage + 1, total: pageRects.length };
  }

  function computePresentationPage() {
    if (!window.app || !app.map || !app.map._docLayer) return null;
    var docLayer = app.map._docLayer;
    var total = docLayer._parts || docLayer._pages;
    var current = typeof docLayer._selectedPart === 'number' ? docLayer._selectedPart + 1 : null;
    if (!current && typeof docLayer._currentPage === 'number') current = docLayer._currentPage + 1;
    if (!current || !total) return null;
    return { current: current, total: total };
  }

  function setPageStatusText(text) {
    if (!text) return;
    ['StatePageNumber', 'SlideStatus', 'PageStatus'].forEach(function (id) {
      var element = document.getElementById(id);
      if (!element) return;
      element.textContent = text;
      element.setAttribute('title', text);
      showElementChain(element);
    });
  }

  function refreshPageStatus() {
    var docType = getDocType();
    if (docType === 'spreadsheet') return;

    var page = docType === 'presentation' ? computePresentationPage() : computeVisibleWriterPage();
    if (!page) return;

    var label = docType === 'presentation'
      ? '第 ' + page.current + ' / ' + page.total + ' 页'
      : '第 ' + page.current + ' / ' + page.total + ' 页';
    setPageStatusText(label);
  }

  function hideChrome() {
    var spreadsheet = isSpreadsheet();
    var presentation = isPresentation();
    var statusHeight = spreadsheet ? 40 : 34;

    selectors.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (element) {
        element.style.setProperty('display', 'none', 'important');
      });
    });

    var spreadsheetToolbar = document.getElementById('spreadsheet-toolbar');
    if (spreadsheet && spreadsheetToolbar) {
      spreadsheetToolbar.style.setProperty('display', 'grid', 'important');
      spreadsheetToolbar.style.setProperty('position', 'fixed', 'important');
      spreadsheetToolbar.style.setProperty('left', '0', 'important');
      spreadsheetToolbar.style.setProperty('right', '0', 'important');
      spreadsheetToolbar.style.setProperty('bottom', '0', 'important');
      spreadsheetToolbar.style.setProperty('z-index', '20', 'important');
    } else if (spreadsheetToolbar) {
      spreadsheetToolbar.style.setProperty('display', 'none', 'important');
    }

    configureBottomStatusBar(spreadsheet, presentation);

    ['main-document-content', 'document-container'].forEach(function (id) {
      var element = document.getElementById(id);
      if (!element) return;
      element.style.setProperty('position', 'fixed', 'important');
      element.style.setProperty('top', '0', 'important');
      element.style.setProperty('left', '0', 'important');
      element.style.setProperty('right', '0', 'important');
      element.style.setProperty('bottom', '0', 'important');
      element.style.setProperty('width', '100vw', 'important');
      element.style.setProperty('height', '100vh', 'important');
      element.style.setProperty('margin', '0', 'important');
    });

    var documentContainer = document.getElementById('document-container');
    if (spreadsheet && documentContainer) {
      documentContainer.style.setProperty('bottom', statusHeight + 'px', 'important');
      documentContainer.style.setProperty('height', 'calc(100vh - ' + statusHeight + 'px)', 'important');
    } else if (presentation && documentContainer) {
      documentContainer.classList.remove('parts-preview-document', 'portrait', 'landscape', 'sidebar-document');
      ['presentation-controls-wrapper', 'slide-sorter'].forEach(function (id) {
        var element = document.getElementById(id);
        if (element) element.style.setProperty('display', 'none', 'important');
      });
      documentContainer.style.setProperty('top', '0', 'important');
      documentContainer.style.setProperty('left', '0', 'important');
      documentContainer.style.setProperty('right', '0', 'important');
      documentContainer.style.setProperty('bottom', statusHeight + 'px', 'important');
      documentContainer.style.setProperty('width', '100vw', 'important');
      documentContainer.style.setProperty('height', 'calc(100vh - ' + statusHeight + 'px)', 'important');
    } else if (!spreadsheet && documentContainer && document.getElementById('toolbar-down')) {
      documentContainer.style.setProperty('bottom', statusHeight + 'px', 'important');
      documentContainer.style.setProperty('height', 'calc(100vh - ' + statusHeight + 'px)', 'important');
    }
  }

  function hideFeedbackPrompts() {
    if (window.app && window.app.map && window.app.map.feedback) {
      try {
        window.app.map.feedback.disable();
      } catch (error) {
        window.app.map.feedback = null;
      }
    }

    document.querySelectorAll('#iframe-feedback, .iframe-dialog-wrap, .iframe-dialog-modal, .snackbar, .jsdialog-container.snackbar, .jsdialog-window.snackbar, #mobile-wizard.snackbar').forEach(function (element) {
      var text = element.textContent || '';
      var isFeedbackPrompt = element.id === 'iframe-feedback' || text.indexOf('Please send us your feedback') !== -1 || text.indexOf('Send Feedback') !== -1;
      if (!isFeedbackPrompt) return;

      var container = element.closest('.iframe-dialog-wrap, .iframe-dialog-modal, .jsdialog-window, .jsdialog-container, #mobile-wizard') || element;
      container.style.setProperty('display', 'none', 'important');
      container.style.setProperty('visibility', 'hidden', 'important');
      container.setAttribute('aria-hidden', 'true');
    });
  }

  hideChrome();
  refreshPageStatus();
  hideFeedbackPrompts();
  window.addEventListener('DOMContentLoaded', hideChrome);
  window.addEventListener('DOMContentLoaded', refreshPageStatus);
  window.addEventListener('DOMContentLoaded', hideFeedbackPrompts);
  window.addEventListener('load', hideChrome);
  window.addEventListener('load', refreshPageStatus);
  window.addEventListener('load', hideFeedbackPrompts);
  setInterval(function () {
    hideChrome();
    refreshPageStatus();
    hideFeedbackPrompts();
  }, 250);
})();
