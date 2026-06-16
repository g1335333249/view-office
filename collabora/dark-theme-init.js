(function () {
  var params = new URLSearchParams(window.location.search);

  if (params.get('darkTheme') !== 'true') {
    return;
  }

  document.documentElement.setAttribute('data-theme', 'dark');

  var link = document.createElement('link');
  link.setAttribute('rel', 'stylesheet');
  link.setAttribute('href', 'color-palette-dark.css');
  document.head.appendChild(link);
})();
