(function () {
  var config = window.ViewOfficeBranding || {};
  var loadingText = config.loadingText || '正在加载，请稍候...';
  var brandName = config.brandName || '';
  var logoUrl = config.logoUrl || '';

  window.brandProductName = brandName || 'View Office';
  window.brandProductURL = config.brandUrl || '#';

  document.documentElement.classList.add(brandName ? 'vo-has-brand' : 'vo-no-brand');

  if (logoUrl) {
    window.logoURL = logoUrl;
    document.documentElement.classList.add('vo-has-logo');
    document.documentElement.style.setProperty('--vo-spinner-logo', 'url("' + cssUrlEscape(logoUrl) + '")');
  } else {
    window.logoURL = '';
    document.documentElement.classList.add('vo-no-logo');
  }

  function applyLoadingBranding() {
    document.querySelectorAll('.leaflet-progress-spinner').forEach(function (element) {
      if (logoUrl) {
        element.style.setProperty('--vo-spinner-logo', 'url("' + cssUrlEscape(logoUrl) + '")');
      }
    });

    document.querySelectorAll('.leaflet-progress-label.brand-label').forEach(function (element) {
      if (brandName) {
        element.textContent = brandName;
        element.style.removeProperty('display');
      } else {
        element.textContent = '';
        element.style.setProperty('display', 'none', 'important');
      }
    });

    document.querySelectorAll('.leaflet-progress-label:not(.brand-label)').forEach(function (element) {
      element.textContent = loadingText;
    });
  }

  function cssUrlEscape(value) {
    return String(value).replace(/["\\\n\r\f]/g, function (char) {
      return '\\' + char;
    });
  }

  applyLoadingBranding();
  window.addEventListener('DOMContentLoaded', applyLoadingBranding);
  window.addEventListener('load', applyLoadingBranding);
  setInterval(applyLoadingBranding, 250);
})();
