const fs = require('node:fs');

const dist = '/usr/share/coolwsd/browser/dist';
const bundlePath = `${dist}/bundle.js`;
const coolHtmlPath = `${dist}/cool.html`;
const brandingPath = `${dist}/branding.js`;

let bundle = fs.readFileSync(bundlePath, 'utf8');
bundle = bundle.replace('window.L.Map.mergeOptions({welcome:true})', 'window.L.Map.mergeOptions({welcome:false})');
bundle = bundle.replace('feedback:!window.ThisIsAMobileApp,feedbackTimeout:3e4', 'feedback:false,feedbackTimeout:3e4');
bundle = bundle.replace(
  /if\(window\.feedbackUrl&&window\.prefs\.canPersist\)\{window\.L\.Map\.addInitHook\("addHandler","feedback",window\.L\.Map\.Feedback\)\}/g,
  ''
);
{
  const start = bundle.indexOf('askForFeedbackDialog:function(){');
  const end = bundle.indexOf(',showFeedbackDialog:function(){', start);
  if (start !== -1 && end !== -1) {
    bundle = `${bundle.slice(0, start)}askForFeedbackDialog:function(){}${bundle.slice(end)}`;
  } else {
    console.warn('[view-office] feedback dialog function not found');
  }
}
bundle = bundle.replace('this._textArea.setAttribute("autofocus","true");', '');
bundle = bundle.replace(
  /if\(docContainer\s*\)docContainer\.appendChild\(this\._container\);this\.update\(\)/g,
  'if(docContainer&&window.self===window.top)docContainer.appendChild(this._container);this.update()'
);
fs.writeFileSync(bundlePath, bundle);

let coolHtml = fs.readFileSync(coolHtmlPath, 'utf8');
coolHtml = coolHtml.replace(
  /<script>\s*\/\/ Apply dark theme immediately[\s\S]*?<\/script>/,
  '<script src="dark-theme-init.js?v=12"></script>'
);
coolHtml = coolHtml.replace(
  '<script src="%SERVICE_ROOT%/browser/%VERSION%/bundle.js" defer></script>',
  '<script src="%SERVICE_ROOT%/browser/%VERSION%/bundle.js?v=12" defer></script>'
);
coolHtml = coolHtml.replace(
  '</head>',
  [
    '<link rel="stylesheet" href="minimal-view.css?v=12" />',
    '<script src="view-office-branding-runtime.js?v=12"></script>',
    '<script src="preview-branding.js?v=12"></script>',
    '<script src="minimal-view.js?v=12"></script>',
    '</head>'
  ].join('\n')
);
fs.writeFileSync(coolHtmlPath, coolHtml);

let branding = fs.readFileSync(brandingPath, 'utf8');
branding = branding.replace(
  "var brandProductName = 'Collabora Online Development Edition (CODE)';",
  "var brandProductName = 'View Office';"
);
fs.writeFileSync(brandingPath, branding);
