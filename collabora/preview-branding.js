(function () {
  var config = window.ViewOfficeBranding || {};
  var loadingText = config.loadingText || '正在加载，请稍候...';
  var brandName = config.brandName || '';
  var logoUrl = config.logoUrl || '';
  var effectiveLogoUrl = logoUrl || 'default-loading-logo.svg';

  window.brandProductName = brandName || 'View Office';
  window.brandProductURL = config.brandUrl || '#';

  document.documentElement.classList.add(brandName ? 'vo-has-brand' : 'vo-no-brand');
  document.documentElement.classList.add(logoUrl ? 'vo-custom-logo' : 'vo-default-logo');

  window.logoURL = effectiveLogoUrl;
  document.documentElement.classList.add('vo-has-logo');
  document.documentElement.style.setProperty('--vo-spinner-logo', 'url("' + cssUrlEscape(effectiveLogoUrl) + '")');

  function applyLoadingBranding() {
    document.querySelectorAll('.leaflet-progress-spinner').forEach(function (element) {
      element.style.setProperty('--vo-spinner-logo', 'url("' + cssUrlEscape(effectiveLogoUrl) + '")');
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
