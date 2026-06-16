window.onload = function () {
  if (window.parent !== window.self) {
    window.parent.postMessage('{"MessageId":"welcome-close"}', window.origin);
  }
};
